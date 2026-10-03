export type QuestCalendarInput = {
  id: string;
  title: string;
  description?: string | null;
  startsAt: string;
  location?: string | null;
  url?: string | null;
};

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function toIcsDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 73) {
    chunks.push(remaining.slice(0, 73));
    remaining = ` ${remaining.slice(73)}`;
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
}

export function createQuestCalendarFile(input: QuestCalendarInput, now = new Date()) {
  const start = new Date(input.startsAt);
  if (!Number.isFinite(start.getTime())) throw new Error("This quest does not have a valid start time.");
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const description = [input.description?.trim(), input.url?.trim()].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//QuestHat//Quest Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(input.id)}@questhat.com`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcs(input.title)}`,
    input.location?.trim() ? `LOCATION:${escapeIcs(input.location.trim())}` : null,
    description ? `DESCRIPTION:${escapeIcs(description)}` : null,
    input.url?.trim() ? `URL:${escapeIcs(input.url.trim())}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => Boolean(line));
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function downloadQuestCalendarFile(input: QuestCalendarInput) {
  const contents = createQuestCalendarFile(input);
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `questhat-${input.id}.ics`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}
