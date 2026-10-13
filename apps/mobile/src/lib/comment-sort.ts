export type CommentSort = "newest" | "oldest";

/** Match web chronology; keep equal timestamps in their received order. */
export function sortQuestComments<T extends { created_at: string }>(comments: readonly T[], order: CommentSort): T[] {
  return comments.map((comment, index) => ({ comment, index, time: Date.parse(comment.created_at) }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.time);
      const bValid = Number.isFinite(b.time);
      // Malformed dates stay after dated comments in either direction.
      if (aValid !== bValid) return aValid ? -1 : 1;
      const difference = aValid ? (order === "oldest" ? a.time - b.time : b.time - a.time) : 0;
      return difference || a.index - b.index;
    })
    .map(({ comment }) => comment);
}
