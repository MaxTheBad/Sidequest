const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export function formatActivityTime(value?: string | Date | null, now = Date.now()) {
  if (!value) return "Recently";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed < MINUTE_MS) return "Just now";
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (elapsed < WEEK_MS) {
    const days = Math.floor(elapsed / DAY_MS);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }

  const currentYear = new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === currentYear ? {} : { year: "numeric" }),
  });
}

export function formatPostedTime(value?: string | Date | null, now = Date.now()) {
  const label = formatActivityTime(value, now);
  return label === "Recently" ? "Posted recently" : `Posted ${label.toLowerCase()}`;
}
