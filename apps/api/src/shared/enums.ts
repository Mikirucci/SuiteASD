import { z } from 'zod';

// Single source of truth for the string "enums" stored in the database.
// The Prisma schema uses plain strings (portable SQLite/PostgreSQL); validation happens here.

export const ROLES = ['ADMIN', 'SEGRETERIA', 'ALLENATORE', 'STAFF', 'ATLETA', 'GENITORE'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const GUARDIAN_RELATIONS = ['PADRE', 'MADRE', 'TUTORE', 'ALTRO'] as const;
export const guardianRelationSchema = z.enum(GUARDIAN_RELATIONS);
export type GuardianRelation = z.infer<typeof guardianRelationSchema>;

export const DEVICE_PLATFORMS = ['WEB', 'IOS', 'ANDROID'] as const;
export const devicePlatformSchema = z.enum(DEVICE_PLATFORMS);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

export const SPORTS = ['VOLLEY'] as const;
export const sportSchema = z.enum(SPORTS);
export type Sport = z.infer<typeof sportSchema>;

export const AUTOMATION_RUN_STATUSES = ['RUNNING', 'SUCCESS', 'FAILED'] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export const TEAM_GENDERS = ['FEMALE', 'MALE', 'MIXED'] as const;
export const teamGenderSchema = z.enum(TEAM_GENDERS);
export type TeamGender = z.infer<typeof teamGenderSchema>;

export const COMPETITION_KINDS = ['LEAGUE', 'TOURNAMENT'] as const;
export const competitionKindSchema = z.enum(COMPETITION_KINDS);
export type CompetitionKind = z.infer<typeof competitionKindSchema>;

export const MATCH_STATUSES = ['SCHEDULED', 'PLAYED', 'POSTPONED', 'CANCELLED'] as const;
export const matchStatusSchema = z.enum(MATCH_STATUSES);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

// Standings tiebreakers, applied in the configured order after points (SPEC 05).
export const TIEBREAKERS = ['WINS', 'SET_RATIO', 'POINT_RATIO'] as const;
export const tiebreakerSchema = z.enum(TIEBREAKERS);
export type Tiebreaker = z.infer<typeof tiebreakerSchema>;

// Quote e pagamenti (SPEC 03). OVERDUE is never stored: it is derived from PENDING + a past due date.
export const FEE_KINDS = ['ENROLLMENT', 'MONTHLY', 'EXTRA'] as const;
export const feeKindSchema = z.enum(FEE_KINDS);
export type FeeKind = z.infer<typeof feeKindSchema>;

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

// Calendario e convocazioni (SPEC 04).
export const EVENT_TYPES = ['MATCH', 'TRAINING', 'TOURNAMENT', 'MEETING'] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof eventTypeSchema>;

export const EVENT_STATUSES = ['SCHEDULED', 'POSTPONED', 'CANCELLED', 'COMPLETED'] as const;
export const eventStatusSchema = z.enum(EVENT_STATUSES);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const CONVOCATION_STATUSES = ['PENDING', 'CONFIRMED', 'DECLINED'] as const;
export const convocationStatusSchema = z.enum(CONVOCATION_STATUSES);
export type ConvocationStatus = z.infer<typeof convocationStatusSchema>;

// Moduli secondari (SPEC "Tutto quello che serve").
export const TRIP_STATUSES = ['PLANNED', 'CONFIRMED', 'CANCELLED'] as const;
export const tripStatusSchema = z.enum(TRIP_STATUSES);
export type TripStatus = z.infer<typeof tripStatusSchema>;

export const TRIP_TRANSPORTS = ['CAR', 'MINIBUS', 'OTHER'] as const;
export const tripTransportSchema = z.enum(TRIP_TRANSPORTS);
export type TripTransport = z.infer<typeof tripTransportSchema>;

export const SPONSOR_STATUSES = ['ACTIVE', 'EXPIRED', 'PROSPECT'] as const;
export const sponsorStatusSchema = z.enum(SPONSOR_STATUSES);
export type SponsorStatus = z.infer<typeof sponsorStatusSchema>;

export const LEDGER_KINDS = ['INCOME', 'EXPENSE'] as const;
export const ledgerKindSchema = z.enum(LEDGER_KINDS);
export type LedgerKind = z.infer<typeof ledgerKindSchema>;

export const STAFF_ROLES = ['COACH', 'MANAGER', 'OTHER'] as const;
export const staffRoleSchema = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof staffRoleSchema>;
