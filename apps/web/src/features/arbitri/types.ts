/** Wire types of the referees API. Source of truth: apps/api/src/modules/referees/schema.ts. */

export interface Referee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  qualification: string | null;
  notes: string | null;
  assignmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Body of POST /referees (optional fields omitted when empty) and PATCH /referees/:id (`null` clears them). */
export interface RefereeBody {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  qualification?: string | null;
  notes?: string | null;
}

/** A referee designated for a match (designazione), with the fee and whether it has been paid back. */
export interface Assignment {
  id: string;
  refereeId: string;
  refereeName: string;
  matchId: string;
  match: {
    homeTeam: string;
    awayTeam: string;
    round: number | null;
    groupName: string;
    competitionName: string;
    date: string | null;
  };
  feeCents: number | null;
  reimbursedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssignmentBody {
  refereeId: string;
  matchId: string;
  feeCents?: number;
}

export interface UpdateAssignmentBody {
  feeCents?: number | null;
  reimbursedAt?: string | null;
}
