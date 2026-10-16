import type { MeResponse, Role } from "@/lib/api";

/** Signed-in users of the personal area for the Vitest suites (never imported by product code). */

const ATHLETE_PERMISSIONS = [
  "members:readOwn",
  "members:updateOwn",
  "documents:readOwn",
  "documents:uploadOwn",
  "payments:readOwn",
  "convocations:respond",
  "notifications:readOwn",
  "events:read",
  "teams:read",
];

const GUARDIAN_PERMISSIONS = [...ATHLETE_PERMISSIONS, "children:create"];

function base(roles: Role[], permissions: string[]): MeResponse {
  return {
    user: { id: "u-1", email: "sara@example.test", firstName: "Sara", lastName: "Conti", phone: null },
    society: { id: "s-1", name: "Aquile Volley", slug: "aquile-volley" },
    roles,
    permissions,
    societies: [],
    member: null,
    children: [],
  };
}

/** An athlete with her own member record. */
export function athleteMe(): MeResponse {
  return { ...base(["ATLETA"], ATHLETE_PERMISSIONS), member: { id: "m-sara", firstName: "Sara", lastName: "Conti" } };
}

/** A parent of two children and no member record of her own. */
export function guardianMe(): MeResponse {
  return {
    ...base(["GENITORE"], GUARDIAN_PERMISSIONS),
    user: { id: "u-2", email: "roberta@example.test", firstName: "Roberta", lastName: "Conti", phone: null },
    children: [
      { memberId: "m-anna", firstName: "Anna", lastName: "Conti", relation: "MADRE" },
      { memberId: "m-marta", firstName: "Marta", lastName: "Conti", relation: "MADRE" },
    ],
  };
}
