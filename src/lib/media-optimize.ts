const HEIC_EXTENSIONS = [".heic", ".heif"];

function hasHeicExtension(name: string) {
  const lower = name.toLowerCase();
  return HEIC_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isImageLikeFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  const lower = file.name.toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"].some((ext) => lower.endsWith(ext));
}

function isHeicLike(file: File) {
  const mime = file.type.toLowerCase();
  return mime === "image/heic" || mime === "image/heif" || mime === "image/heic-sequence" || mime === "image/heif-sequence" || hasHeicExtension(file.name);
}

function replaceExtension(name: string, nextExt: string) {
  return name.replace(/\.[^/.]+$/, "") + nextExt;
}

async function loadImage(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not load image."));
      i.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function maybeConvertHeic(file: File) {
  if (!isHeicLike(file)) return file;

  try {
    const mod = await import("heic2any");
    const heic2any = (mod.default || mod) as (opts: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]>;
    const output = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(output) ? output[0] : output;
    return new File([blob], replaceExtension(file.name, ".jpg"), { type: "image/jpeg" });
  } catch {
    throw new Error("Could not convert HEIC image on this device. Please try another photo format.");
  }
}

export async function prepareImageForUpload(
  file: File,
  opts: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
) {
  const maxWidth = opts.maxWidth ?? 1600;
  const maxHeight = opts.maxHeight ?? 1600;
  const quality = opts.quality ?? 0.82;

  let working = await maybeConvertHeic(file);
  const img = await loadImage(working);

  const ratio = Math.min(1, maxWidth / img.width, maxHeight / img.height);
  const outW = Math.max(1, Math.round(img.width * ratio));
  const outH = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image compression.");
  ctx.drawImage(img, 0, 0, outW, outH);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not compress image.");

  working = new File([blob], replaceExtension(working.name, ".jpg"), { type: "image/jpeg" });
  return working;
}
