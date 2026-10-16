import { UserCog } from "lucide-react";
import { z } from "zod";
import { Avatar, Badge } from "@/components/ui";
import type { ResourceConfig } from "../crud/types";
import { bodyReader, optionalEmail, optionalPhone, optionalText, requiredText } from "../crud/values";
import { joinParts } from "../format";
import type { StaffMember, StaffRole } from "../types";

const ROLE_LABELS: Record<StaffRole, string> = { COACH: "Allenatore", MANAGER: "Dirigente", OTHER: "Altro ruolo" };

const schema = z.object({
  firstName: requiredText(80, "Inserisci il nome"),
  lastName: requiredText(80, "Inserisci il cognome"),
  role: z.enum(["COACH", "MANAGER", "OTHER"]),
  email: optionalEmail(),
  phone: optionalPhone(),
  qualifications: optionalText(500),
  notes: optionalText(1000),
});

function fullName(member: StaffMember): string {
  return `${member.firstName} ${member.lastName}`;
}

export const staffConfig: ResourceConfig<StaffMember> = {
  key: "staff",
  path: "/staff",
  writePermission: "staff:write",
  attachmentType: "STAFF_MEMBER",
  icon: UserCog,
  searchLabel: "Cerca per nome o cognome",
  copy: {
    plural: "Staff",
    loadingLabel: "Caricamento dello staff",
    newLabel: "Nuovo membro",
    createTitle: "Nuovo membro dello staff",
    createDescription: "Ruolo e qualifiche di chi segue le squadre.",
    createSubmit: "Aggiungi il membro",
    editTitle: "Modifica il membro dello staff",
    editDescription: "Le modifiche valgono da subito per tutta la società.",
    createdToast: "Membro aggiunto",
    updatedToast: "Membro aggiornato",
    deletedToast: "Membro eliminato",
    emptyTitle: "Nessun membro dello staff",
    emptyDescription: "Aggiungi allenatori e dirigenti con ruolo e qualifiche.",
    deleteDescription: "Il membro sparisce dall'elenco. L'azione non si può annullare.",
    countNoun: "Membri dello staff",
    moreLabel: "Mostra altri membri",
  },
  filter: {
    label: "Filtra per ruolo",
    param: "role",
    options: [
      { value: "", label: "Tutti" },
      { value: "COACH", label: "Allenatori" },
      { value: "MANAGER", label: "Dirigenti" },
      { value: "OTHER", label: "Altro" },
    ],
  },
  fields: [
    { name: "firstName", label: "Nome", kind: "text", required: true, half: true },
    { name: "lastName", label: "Cognome", kind: "text", required: true, half: true },
    {
      name: "role",
      label: "Ruolo",
      kind: "select",
      options: (Object.keys(ROLE_LABELS) as StaffRole[]).map((value) => ({ value, label: ROLE_LABELS[value] })),
    },
    { name: "email", label: "Email", kind: "email", half: true },
    { name: "phone", label: "Telefono", kind: "tel", half: true },
    { name: "qualifications", label: "Qualifiche", kind: "textarea", hint: "Per esempio: Allenatore 2° grado FIPAV." },
    { name: "notes", label: "Note", kind: "textarea" },
  ],
  schema,
  initialValues: (member) => ({
    firstName: member?.firstName ?? "",
    lastName: member?.lastName ?? "",
    role: member?.role ?? "COACH",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    qualifications: member?.qualifications ?? "",
    notes: member?.notes ?? "",
  }),
  toBody: (values, mode) => {
    const read = bodyReader(values, mode);
    return {
      firstName: read.raw("firstName"),
      lastName: read.raw("lastName"),
      role: read.raw("role"),
      email: read.text("email"),
      phone: read.text("phone"),
      qualifications: read.text("qualifications"),
      notes: read.text("notes"),
    };
  },
  nameOf: fullName,
  row: (member) => ({
    title: fullName(member),
    leading: <Avatar name={fullName(member)} decorative />,
    lines: [member.qualifications, joinParts([member.email, member.phone]), member.notes],
    status: <Badge variant="team">{ROLE_LABELS[member.role]}</Badge>,
  }),
};
