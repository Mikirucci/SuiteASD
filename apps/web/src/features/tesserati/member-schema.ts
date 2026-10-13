import { z } from "zod";
import type { CreateMemberBody, MemberDetail, MemberGender, UpdateMemberBody } from "./types";

/** Limits mirror apps/api/src/modules/members/schema.ts so most mistakes are caught before the request. */
const text = (max: number) => z.string().trim().max(max, `Massimo ${max} caratteri`);

const optionalDate = z
  .string()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Inserisci una data valida");

export const memberFormSchema = z.object({
  firstName: z.string().trim().min(1, "Inserisci il nome").max(80, "Massimo 80 caratteri"),
  lastName: z.string().trim().min(1, "Inserisci il cognome").max(80, "Massimo 80 caratteri"),
  birthDate: optionalDate,
  birthPlace: text(80),
  gender: z.enum(["", "FEMALE", "MALE"]),
  fiscalCode: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[A-Za-z0-9]{16}$/.test(value), "Il codice fiscale ha 16 caratteri"),
  email: text(254).refine((value) => value === "" || z.email().safeParse(value).success, "Inserisci un'email valida"),
  phone: text(30).refine((value) => value === "" || value.length >= 3, "Inserisci un numero valido"),
  address: text(160),
  city: text(80),
  postalCode: text(10),
  fieldRole: text(40),
  kitSize: text(10),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  joinedAt: optionalDate,
  notes: text(1000),
  teamIds: z.array(z.string()),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;

export const EMPTY_MEMBER_FORM: MemberFormValues = {
  firstName: "",
  lastName: "",
  birthDate: "",
  birthPlace: "",
  gender: "",
  fiscalCode: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  postalCode: "",
  fieldRole: "",
  kitSize: "",
  status: "ACTIVE",
  joinedAt: "",
  notes: "",
  teamIds: [],
};

export function formValuesOf(member: MemberDetail): MemberFormValues {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    birthDate: member.birthDate ?? "",
    birthPlace: member.birthPlace ?? "",
    gender: member.gender ?? "",
    fiscalCode: member.fiscalCode ?? "",
    email: member.email ?? "",
    phone: member.phone ?? "",
    address: member.address ?? "",
    city: member.city ?? "",
    postalCode: member.postalCode ?? "",
    fieldRole: member.fieldRole ?? "",
    kitSize: member.kitSize ?? "",
    status: member.status,
    joinedAt: member.joinedAt ?? "",
    notes: member.notes ?? "",
    teamIds: member.teams.map((team) => team.id),
  };
}

function orUndefined(value: string): string | undefined {
  return value === "" ? undefined : value;
}

function orNull(value: string): string | null {
  return value === "" ? null : value;
}

function genderOf(value: MemberFormValues["gender"]): MemberGender | undefined {
  return value === "" ? undefined : value;
}

/** Empty fields are left out: the API treats them as "not provided". */
export function toCreateBody(values: MemberFormValues): CreateMemberBody {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    birthDate: orUndefined(values.birthDate),
    birthPlace: orUndefined(values.birthPlace),
    gender: genderOf(values.gender),
    fiscalCode: orUndefined(values.fiscalCode.toUpperCase()),
    email: orUndefined(values.email),
    phone: orUndefined(values.phone),
    address: orUndefined(values.address),
    city: orUndefined(values.city),
    postalCode: orUndefined(values.postalCode),
    fieldRole: orUndefined(values.fieldRole),
    kitSize: orUndefined(values.kitSize),
    status: values.status,
    joinedAt: orUndefined(values.joinedAt),
    notes: orUndefined(values.notes),
    teamIds: values.teamIds,
  };
}

/** Empty fields become `null`, which clears them on the server. */
export function toUpdateBody(values: MemberFormValues): UpdateMemberBody {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    birthDate: orNull(values.birthDate),
    birthPlace: orNull(values.birthPlace),
    gender: genderOf(values.gender) ?? null,
    fiscalCode: orNull(values.fiscalCode.toUpperCase()),
    email: orNull(values.email),
    phone: orNull(values.phone),
    address: orNull(values.address),
    city: orNull(values.city),
    postalCode: orNull(values.postalCode),
    fieldRole: orNull(values.fieldRole),
    kitSize: orNull(values.kitSize),
    status: values.status,
    joinedAt: orNull(values.joinedAt),
    notes: orNull(values.notes),
    teamIds: values.teamIds,
  };
}

export const MEMBER_FORM_FIELDS: readonly string[] = Object.keys(EMPTY_MEMBER_FORM);
