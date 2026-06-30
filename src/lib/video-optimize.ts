export const VIDEO_MAX_DURATION_SECONDS = 15;

type VideoOptimizeOptions = {
  maxWidth?: number;
  maxHeight?: number;
  videoBitsPerSecond?: number;
  maxDurationSeconds?: number;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
};

function getElementCaptureStream(video: HTMLVideoElement): MediaStream | null {
  const withCapture = video as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  return withCapture.captureStream?.() || withCapture.mozCaptureStream?.() || null;
}

function pickVideoMimeType() {
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) return "video/webm;codecs=vp9,opus";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) return "video/webm;codecs=vp8,opus";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) return "video/webm;codecs=vp9";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) return "video/webm;codecs=vp8";
  return "video/webm";
}

function adaptiveVideoBitrate(width: number, height: number, requested?: number) {
  if (requested) return requested;
  const pixels = width * height;
  if (pixels <= 360 * 640) return 850_000;
  if (pixels <= 854 * 480) return 1_400_000;
  return 1_800_000;
}

function evenDimension(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export async function compressVideoForUpload(file: File, opts: VideoOptimizeOptions = {}) {
  const maxWidth = opts.maxWidth ?? 960;
  const maxHeight = opts.maxHeight ?? 960;
  const maxDurationSeconds = opts.maxDurationSeconds ?? VIDEO_MAX_DURATION_SECONDS;

  if (!file.type.startsWith("video/")) return file;

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read video metadata."));
    });

    const sourceDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const trimStart = Math.max(0, Math.min(opts.trimStartSeconds ?? 0, Math.max(0, sourceDuration - 0.1)));
    const trimEndLimit = sourceDuration > 0 ? sourceDuration : trimStart + maxDurationSeconds;
    const trimEnd = Math.max(trimStart + 0.2, Math.min(opts.trimEndSeconds ?? trimStart + maxDurationSeconds, trimEndLimit));
    const outputDuration = Math.min(maxDurationSeconds, trimEnd - trimStart);
    const shouldTrim = trimStart > 0.05 || sourceDuration > maxDurationSeconds + 0.2 || outputDuration < sourceDuration - 0.2;

    const ratio = Math.min(1, maxWidth / (video.videoWidth || 1), maxHeight / (video.videoHeight || 1));
    const outW = evenDimension((video.videoWidth || 2) * ratio);
    const outH = evenDimension((video.videoHeight || 2) * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not initialize video compressor.");

    const stream = canvas.captureStream(24);
    const elementStream = getElementCaptureStream(video);
    elementStream?.getAudioTracks().forEach((track) => stream.addTrack(track));
    const mimeType = pickVideoMimeType();

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: adaptiveVideoBitrate(outW, outH, opts.videoBitsPerSecond),
      audioBitsPerSecond: elementStream?.getAudioTracks().length ? 96_000 : undefined,
    });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    await new Promise<void>((resolve, reject) => {
      if (Math.abs(video.currentTime - trimStart) < 0.05) {
        resolve();
        return;
      }
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      try {
        video.currentTime = trimStart;
      } catch (err) {
        video.removeEventListener("seeked", onSeeked);
        reject(err);
      }
    });

    await new Promise<void>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("Video compression failed."));
      recorder.onstop = () => resolve();

      let raf = 0;
      const draw = () => {
        if (video.paused || video.ended) return;
        ctx.drawImage(video, 0, 0, outW, outH);
        raf = requestAnimationFrame(draw);
      };

      video.onended = () => {
        cancelAnimationFrame(raf);
        if (recorder.state !== "inactive") recorder.stop();
      };

      recorder.start(250);
      void video.play().then(() => {
        draw();
        window.setTimeout(() => {
          cancelAnimationFrame(raf);
          video.pause();
          if (recorder.state !== "inactive") recorder.stop();
        }, Math.ceil(outputDuration * 1000) + 80);
      }).catch(() => {
        cancelAnimationFrame(raf);
        if (recorder.state !== "inactive") recorder.stop();
      });
    });

    stream.getTracks().forEach((track) => track.stop());
    elementStream?.getTracks().forEach((track) => track.stop());

    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    if (!blob.size) return file;

    const next = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webm", { type: blob.type || "video/webm" });
    // If no trim was requested or needed, keep the original when browser encoding grows the file.
    return shouldTrim || next.size < file.size ? next : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
