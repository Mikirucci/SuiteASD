const FIELD_LABELS: Record<string, string> = {
  firstName: "Nome",
  lastName: "Cognome",
  birthDate: "Data di nascita",
  birthPlace: "Luogo di nascita",
  gender: "Sesso",
  fiscalCode: "Codice fiscale",
  email: "Email",
  phone: "Telefono",
  address: "Indirizzo",
  city: "Città",
  postalCode: "CAP",
  fieldRole: "Ruolo in campo",
  kitSize: "Taglia divisa",
  status: "Stato",
  joinedAt: "Iscritto dal",
  notes: "Note",
  teams: "Squadre",
};

export function importFieldLabel(field: string | null): string {
  return field ? (FIELD_LABELS[field] ?? field) : "Riga";
}

/** The API reports import problems in English: show Italian wording for the ones we know. */
export function describeImportProblem(field: string | null, message: string): string {
  const unknownTeam = /^Unknown team "(.+)"$/.exec(message);
  if (unknownTeam) return `La squadra «${unknownTeam[1] ?? ""}» non esiste`;
  if (message === "Duplicate fiscal code in the file") return "Codice fiscale ripetuto nel file";
  if (message === "A member with this fiscal code already exists")
    return "Esiste già un tesserato con questo codice fiscale";
  return field ? `Valore non valido per «${importFieldLabel(field)}»` : "Riga non valida";
}
