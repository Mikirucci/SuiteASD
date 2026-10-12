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
