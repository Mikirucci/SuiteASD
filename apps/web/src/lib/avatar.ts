export const AVATAR_TONES = [
  "blue",
  "amber",
  "rose",
  "emerald",
  "violet",
  "orange",
  "cyan",
  "red",
  "lime",
  "indigo",
] as const;

export type AvatarTone = (typeof AVATAR_TONES)[number];

/** Two-letter initials: first letter of the first and last word ("Anna Ferri" -> "AF"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return "?";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const letters = last ? `${first.charAt(0)}${last.charAt(0)}` : first.slice(0, 2);
  return letters.toLocaleUpperCase("it-IT");
}

/** Deterministic tone from the name, so a person always keeps the same colour. */
export function avatarToneOf(name: string): AvatarTone {
  const normalized = name.trim().toLocaleLowerCase("it-IT");
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? "blue";
}
