/** Wire types of the REST API. Keep in sync with the backend OpenAPI contract (docs/api/openapi.yaml in the SuiteASD-backend repository). */

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
  /** Whether the email is confirmed; until it is, the API refuses invitations and published announcements. */
  emailVerified: boolean;
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

/** The password (or the link) was right, but the account asks for the code of its authenticator app: no session yet. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  /** Single use, five minutes, cancelled after five wrong codes. */
  challengeToken: string;
  expiresAt: string;
}

/** What signing in answers: the session, or the request for the second step. */
export type SignInResult = SessionResponse | TwoFactorChallenge;

export function isTwoFactorChallenge(result: SignInResult): result is TwoFactorChallenge {
  return "twoFactorRequired" in result && result.twoFactorRequired;
}

export interface TwoFactorVerifyBody {
  challengeToken: string;
  /** The six digits of the app, or a recovery code. */
  code: string;
}

export type GuardianRelation = "PADRE" | "MADRE" | "TUTORE" | "ALTRO";

export interface MeResponse {
  user: UserSummary & {
    phone: string | null;
    twoFactorEnabled: boolean;
    /** True when a role in the current society (administrator, secretary) must use the second step. */
    twoFactorRequired: boolean;
    /** Until when management still works without it; null when it is not required or already on. */
    twoFactorGraceEndsAt: string | null;
  };
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
