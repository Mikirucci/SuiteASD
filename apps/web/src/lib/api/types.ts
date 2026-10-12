/** Wire types of the REST API. Keep in sync with apps/api (docs/API.md once available). */

export const ROLES = ["ADMIN", "SEGRETERIA", "ALLENATORE", "STAFF", "ATLETA", "GENITORE"] as const;
export type Role = (typeof ROLES)[number];

export interface FieldError {
  path: string;
  message: string;
}

/** RFC 7807 problem details as served by the API (application/problem+json). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  /** Machine readable code, e.g. "email_taken". */
  code: string;
  errors?: FieldError[];
}

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface SocietySummary {
  id: string;
  name: string;
}

/** Response of register, login and refresh. */
export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: UserSummary;
  society: SocietySummary;
  roles: Role[];
}

export type GuardianRelation = "PADRE" | "MADRE" | "TUTORE" | "ALTRO";

export interface MeResponse {
  user: UserSummary & { phone: string | null };
  society: SocietySummary & { slug: string };
  roles: Role[];
  permissions: string[];
  societies: Array<SocietySummary & { roles: Role[] }>;
  member: { id: string; firstName: string; lastName: string } | null;
  children: Array<{ memberId: string; firstName: string; lastName: string; relation: GuardianRelation }>;
}

export interface LoginBody {
  email: string;
  password: string;
  /** Only needed when the account belongs to several societies. */
  societyId?: string;
}

export interface RegisterBody {
  societyName: string;
  admin: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
}
