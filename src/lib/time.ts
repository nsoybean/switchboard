export function formatCompactRelativeTime(
  value: string | number | Date,
  now = Date.now(),
): string {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMs = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < minute) {
    return "now";
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h`;
  }

  if (diffMs < week) {
    return `${Math.floor(diffMs / day)}d`;
  }

  return `${Math.floor(diffMs / week)}w`;
}

export function formatTimestampTitle(value: string | number | Date): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
