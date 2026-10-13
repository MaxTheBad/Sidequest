export function isIosUnsupportedVideoUrl(url, platform) {
  if (platform !== "ios" || typeof url !== "string") return false;
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  return pathname.endsWith(".webm");
}
