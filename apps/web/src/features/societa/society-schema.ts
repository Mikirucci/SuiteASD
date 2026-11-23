import { z } from "zod";
import type { LegalForm, Society, SocietyLegal, SocietyPatch } from "./api";

export const LEGAL_FORMS: ReadonlyArray<{ value: LegalForm; label: string }> = [
  { value: "ASD", label: "ASD, associazione sportiva dilettantistica" },
  { value: "SSD", label: "SSD, società sportiva dilettantistica" },
  { value: "APS", label: "APS, associazione di promozione sociale" },
  { value: "OTHER", label: "Altro" },
];

/** Limits mirror the API; the check digits of the fiscal code, the VAT number and the IBAN are the server's job. */
const text = (label: string, max: number) => z.string().trim().max(max, `${label}: massimo ${max} caratteri`);
const blank = (rule: (value: string) => boolean, message: string) => z.string().trim().refine((value) => value === "" || rule(value), message);

export const societySchema = z.object({
  name: z.string().trim().min(1, "Scrivi il nome della società").max(120, "Massimo 120 caratteri"),
  timezone: z.string().trim().min(1, "Scegli il fuso orario"),
  phone: blank((value) => value.length >= 3 && value.length <= 30, "Il telefono deve avere da 3 a 30 caratteri"),
  contactEmail: blank((value) => z.email().safeParse(value).success && value.length <= 254, "Inserisci un'email valida"),
  website: blank((value) => /^https?:\/\/\S+$/i.test(value) && value.length <= 200, "L'indirizzo deve cominciare con http:// o https://"),
  legalName: text("La denominazione", 160),
  legalForm: z.string(),
  fiscalCode: blank((value) => /^([A-Za-z0-9]{16}|\d{11})$/.test(value), "Il codice fiscale ha 16 caratteri o 11 cifre"),
  vatNumber: blank((value) => /^\d{11}$/.test(value), "La partita IVA ha 11 cifre"),
  address: text("L'indirizzo", 160),
  city: text("La città", 80),
  postalCode: blank((value) => /^\d{5}$/.test(value), "Il CAP ha 5 cifre"),
  province: blank((value) => /^[A-Za-z]{2}$/.test(value), "La provincia ha 2 lettere"),
  pec: blank((value) => z.email().safeParse(value).success && value.length <= 254, "Inserisci una PEC valida"),
  sdiCode: blank((value) => /^[A-Za-z0-9]{7}$/.test(value), "Il codice SDI ha 7 caratteri"),
  iban: blank((value) => /^[A-Za-z]{2}\d{2}[A-Za-z0-9 ]{11,30}$/.test(value), "L'IBAN non sembra valido"),
  registryNumber: text("Il numero di iscrizione", 40),
});

export type SocietyValues = z.infer<typeof societySchema>;

const GENERAL_FIELDS = ["name", "timezone", "phone", "contactEmail", "website"] as const;
const LEGAL_FIELDS = [
  "legalName",
  "legalForm",
  "fiscalCode",
  "vatNumber",
  "address",
  "city",
  "postalCode",
  "province",
  "pec",
  "sdiCode",
  "iban",
  "registryNumber",
] as const satisfies ReadonlyArray<keyof SocietyValues>;

export const SOCIETY_FORM_FIELDS: readonly string[] = [...GENERAL_FIELDS, ...LEGAL_FIELDS];

/** The field of the form for each key of `legal`. */
const LEGAL_KEYS: Record<(typeof LEGAL_FIELDS)[number], keyof SocietyLegal> = {
  legalName: "legalName",
  legalForm: "legalForm",
  fiscalCode: "fiscalCode",
  vatNumber: "vatNumber",
  address: "address",
  city: "city",
  postalCode: "postalCode",
  province: "province",
  pec: "pec",
  sdiCode: "sdiCode",
  iban: "iban",
  registryNumber: "registryNumber",
};

export function societyValuesOf(society: Society): SocietyValues {
  const legal = society.legal ?? {};
  return {
    name: society.name,
    timezone: society.timezone,
    phone: society.phone ?? "",
    contactEmail: society.contactEmail ?? "",
    website: society.website ?? "",
    legalName: legal.legalName ?? "",
    legalForm: legal.legalForm ?? "",
    fiscalCode: legal.fiscalCode ?? "",
    vatNumber: legal.vatNumber ?? "",
    address: legal.address ?? "",
    city: legal.city ?? "",
    postalCode: legal.postalCode ?? "",
    province: legal.province ?? "",
    pec: legal.pec ?? "",
    sdiCode: legal.sdiCode ?? "",
    iban: legal.iban ?? "",
    registryNumber: legal.registryNumber ?? "",
  };
}

/** Only what changed. The fiscal block is left out entirely for somebody who was never sent it. */
export function societyPatchOf(values: SocietyValues, society: Society): SocietyPatch {
  const before = societyValuesOf(society);
  const patch: SocietyPatch = {};
  for (const field of GENERAL_FIELDS) {
    const now = values[field].trim();
    if (now === before[field]) continue;
    if (field === "name" || field === "timezone") patch[field] = now;
    else patch[field] = now === "" ? null : now;
  }
  if (society.legal) {
    const legal: NonNullable<SocietyPatch["legal"]> = {};
    for (const field of LEGAL_FIELDS) {
      const now = values[field].trim();
      if (now !== before[field]) legal[LEGAL_KEYS[field]] = now === "" ? null : now;
    }
    if (Object.keys(legal).length > 0) patch.legal = legal;
  }
  return patch;
}
