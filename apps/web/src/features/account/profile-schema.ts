import { z } from "zod";
import type { MyProfile, ProfilePatch } from "./profile-api";

/** Limits mirror the API (docs/api/CONTRATTO-PROFILO.md): the server still checks, the check digits included. */
const optionalText = (label: string, max: number) => z.string().trim().max(max, `${label}: massimo ${max} caratteri`);

export const profileSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine((value) => value === "" || (value.length >= 3 && value.length <= 30), "Il telefono deve avere da 3 a 30 caratteri"),
  birthDate: z
    .string()
    .refine((value) => value === "" || value < new Date().toISOString().slice(0, 10), "La data di nascita deve essere nel passato"),
  birthPlace: optionalText("Il luogo di nascita", 80),
  fiscalCode: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[A-Za-z0-9]{16}$/.test(value), "Il codice fiscale ha 16 caratteri"),
  address: optionalText("L'indirizzo", 160),
  city: optionalText("La città", 80),
  postalCode: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{5}$/.test(value), "Il CAP ha 5 cifre"),
  iban: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[A-Za-z]{2}\d{2}[A-Za-z0-9 ]{11,30}$/.test(value), "L'IBAN non sembra valido"),
});

export type ProfileValues = z.infer<typeof profileSchema>;

export const PROFILE_FIELDS = ["phone", "birthDate", "birthPlace", "fiscalCode", "address", "city", "postalCode", "iban"] as const;

export function profileValuesOf(profile: MyProfile): ProfileValues {
  return {
    phone: profile.phone ?? "",
    birthDate: profile.birthDate ?? "",
    birthPlace: profile.birthPlace ?? "",
    fiscalCode: profile.fiscalCode ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    postalCode: profile.postalCode ?? "",
    iban: profile.iban ?? "",
  };
}

/** Only what changed: a field left as it was is not sent, one emptied is sent as `null`. */
export function profilePatchOf(values: ProfileValues, profile: MyProfile): ProfilePatch {
  const before = profileValuesOf(profile);
  const patch: ProfilePatch = {};
  for (const field of PROFILE_FIELDS) {
    const now = values[field].trim();
    if (now === before[field]) continue;
    patch[field] = now === "" ? null : now;
  }
  return patch;
}

export const qualificationSchema = z
  .object({
    title: z.string().trim().min(1, "Scrivi il titolo").max(120, "Massimo 120 caratteri"),
    issuedOn: z.string(),
    expiresOn: z.string(),
  })
  .refine((values) => values.issuedOn === "" || values.issuedOn <= new Date().toISOString().slice(0, 10), {
    path: ["issuedOn"],
    message: "Il rilascio non può essere nel futuro",
  })
  .refine((values) => values.issuedOn === "" || values.expiresOn === "" || values.expiresOn >= values.issuedOn, {
    path: ["expiresOn"],
    message: "La scadenza non può precedere il rilascio",
  });

export type QualificationValues = z.infer<typeof qualificationSchema>;

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, "Scrivi il nome").max(80, "Massimo 80 caratteri"),
  relation: z.string().trim().max(40, "Massimo 40 caratteri"),
  phone: z.string().trim().min(3, "Il telefono deve avere almeno 3 caratteri").max(30, "Massimo 30 caratteri"),
});

export type EmergencyContactValues = z.infer<typeof emergencyContactSchema>;
