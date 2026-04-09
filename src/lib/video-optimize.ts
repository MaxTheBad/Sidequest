export async function compressVideoForUpload(file: File, opts: { maxWidth?: number; maxHeight?: number; videoBitsPerSecond?: number } = {}) {
  const maxWidth = opts.maxWidth ?? 960;
  const maxHeight = opts.maxHeight ?? 960;
  const videoBitsPerSecond = opts.videoBitsPerSecond ?? 900_000;

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

    const ratio = Math.min(1, maxWidth / (video.videoWidth || 1), maxHeight / (video.videoHeight || 1));
    const outW = Math.max(2, Math.round((video.videoWidth || 2) * ratio));
    const outH = Math.max(2, Math.round((video.videoHeight || 2) * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not initialize video compressor.");

    const stream = canvas.captureStream(24);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : (MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm");

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

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
        recorder.stop();
      };

      recorder.start(250);
      void video.play().then(() => draw()).catch(() => {
        cancelAnimationFrame(raf);
        recorder.stop();
      });
    });

    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    if (!blob.size) return file;

    const next = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webm", { type: blob.type || "video/webm" });
    // Keep smaller file only; if compression grows size, keep original
    return next.size < file.size ? next : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
