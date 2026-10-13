import type { Assignment, Referee } from "./types";

const STAMP = "2026-10-01T08:00:00.000Z";

export function referee(overrides: Partial<Referee> & Pick<Referee, "id" | "firstName" | "lastName">): Referee {
  return {
    email: null,
    phone: null,
    qualification: null,
    notes: null,
    assignmentsCount: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export const VERDI = referee({
  id: "r-verdi",
  firstName: "Marco",
  lastName: "Verdi",
  email: "marco.verdi@example.it",
  phone: "333 1234567",
  qualification: "Arbitro regionale",
  assignmentsCount: 2,
});

export const BIANCHI = referee({ id: "r-bianchi", firstName: "Luisa", lastName: "Bianchi" });

export function assignment(overrides: Partial<Assignment> & Pick<Assignment, "id">): Assignment {
  return {
    refereeId: VERDI.id,
    refereeName: "Marco Verdi",
    matchId: "m1",
    match: {
      homeTeam: "Aquile Volley",
      awayTeam: "Delfini Volley",
      round: 5,
      groupName: "Girone B",
      competitionName: "Serie D femminile",
      date: "2026-11-14T19:30:00.000Z",
    },
    feeCents: 2500,
    reimbursedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export const TO_REIMBURSE = assignment({ id: "as-open" });

export const REIMBURSED = assignment({
  id: "as-paid",
  matchId: "m2",
  match: { ...TO_REIMBURSE.match, awayTeam: "Falchi Volley", round: 4, date: "2026-11-07T19:30:00.000Z" },
  feeCents: 3000,
  reimbursedAt: "2026-11-09T10:00:00.000Z",
});

export const NO_FEE = assignment({
  id: "as-free",
  refereeId: BIANCHI.id,
  refereeName: "Luisa Bianchi",
  matchId: "m3",
  match: { ...TO_REIMBURSE.match, awayTeam: "Tigri Volley", round: 6, date: null },
  feeCents: null,
});
