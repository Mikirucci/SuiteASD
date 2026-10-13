import { ApiError, describeError } from "@/lib/api";

const CODE_MESSAGES: Record<string, string> = {
  referee_has_assignments: "L'arbitro ha delle designazioni: eliminale prima di eliminarlo.",
  referee_already_assigned: "Questo arbitro è già designato per la partita.",
};

/** Italian message for the conflicts specific to referees, the generic one for everything else. */
export function describeRefereeError(error: unknown): string {
  const byCode = error instanceof ApiError && error.code ? CODE_MESSAGES[error.code] : undefined;
  return byCode ?? describeError(error);
}
