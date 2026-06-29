import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const DEFAULT_MAX_DURATION_SECONDS = 15;
const DEFAULT_MAX_DIMENSION = 960;

async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code ?? "unknown"}`));
    });
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "Missing video file." }, { status: 400 });
  }
  if (!file.type.startsWith("video/")) {
    return Response.json({ ok: false, error: "Please upload a video file." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ ok: false, error: "Video must be under 60MB." }, { status: 400 });
  }

  const trimStartSeconds = Math.max(0, Number(form.get("trimStartSeconds") || 0));
  const trimEndSeconds = Math.max(trimStartSeconds + 0.2, Number(form.get("trimEndSeconds") || DEFAULT_MAX_DURATION_SECONDS + trimStartSeconds));
  const maxDurationSeconds = Math.max(1, Number(form.get("maxDurationSeconds") || DEFAULT_MAX_DURATION_SECONDS));
  const maxDimension = Math.max(2, Number(form.get("maxDimension") || DEFAULT_MAX_DIMENSION));
  const targetDuration = Math.min(maxDurationSeconds, trimEndSeconds - trimStartSeconds);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "quest-video-"));
  const inputPath = path.join(tmpDir, "input");
  const outputPath = path.join(tmpDir, "output.mp4");

  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    await runFfmpeg([
      "-hide_banner",
      "-loglevel", "error",
      "-ss", String(trimStartSeconds),
      "-t", String(targetDuration),
      "-i", inputPath,
      "-vf", `scale='min(${maxDimension},iw)':-2:flags=lanczos`,
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "26",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "96k",
      "-af", "aresample=async=1:min_hard_comp=0.100000:first_pts=0",
      outputPath,
    ]);

    const outputBytes = await readFile(outputPath);
    return new Response(outputBytes, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${file.name.replace(/\.[^/.]+$/, "")}.mp4"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Video compression failed." },
      { status: 500 },
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
