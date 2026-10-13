import type { Referee } from "./types";

export function refereeName(referee: Pick<Referee, "firstName" | "lastName">): string {
  return `${referee.firstName} ${referee.lastName}`;
}
