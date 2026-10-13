/** "sab 14 nov, 20:30" from an ISO instant. */
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Joins the parts that are present, e.g. "Via Roma 1 · Milano". */
export function joinParts(parts: ReadonlyArray<string | null | undefined>, separator = " · "): string {
  return parts.filter((part): part is string => Boolean(part)).join(separator);
}
