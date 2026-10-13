export function createMediaOperationGate() {
  let generation = 0;
  return {
    begin(scope) {
      return { scope, generation: ++generation };
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(operation, scope) {
      return operation.scope === scope && operation.generation === generation;
    },
  };
}

export function classifyPickedMedia(asset) {
  if (!asset) return null;
  const mimeType = typeof asset?.mimeType === "string" ? asset.mimeType : "";
  if (mimeType && !mimeType.startsWith("image/") && !mimeType.startsWith("video/")) return null;
  if (asset?.type === "video" || mimeType.startsWith("video/")) return "video";
  if (asset?.type === "image" || mimeType.startsWith("image/") || (!asset?.type && !mimeType)) return "image";
  return null;
}
