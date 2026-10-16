"use client";

import { useState } from "react";
import {
  AutoChip,
  Avatar,
  AvatarStack,
  Badge,
  Chip,
  PaymentChip,
  PillFilter,
  StatusMark,
  type AvatarSize,
} from "@/components/ui";
import { Check, Clock } from "lucide-react";
import { ShowcaseSection, Specimen } from "./showcase-section";

const SIZES: readonly AvatarSize[] = ["xs", "sm", "md", "lg", "xl"];

const SQUAD = [
  "Anna Ferri",
  "Chiara Neri",
  "Elena Russo",
  "Giulia Rossi",
  "Marta Bianchi",
  "Sara Conti",
  "Laura Villa",
  "Francesca Moro",
] as const;

const TEAM_OPTIONS = [
  { value: "all", label: "Tutte" },
  { value: "u14", label: "U14" },
  { value: "u16", label: "U16" },
  { value: "u18", label: "U18" },
  { value: "serie-d", label: "Serie D" },
] as const;

export function PeopleSection() {
  const [team, setTeam] = useState("all");
  return (
    <ShowcaseSection
      id="persone"
      index={4}
      label="Persone e stati"
      title="Chi è chi, e a che punto siamo."
      highlight="a che punto siamo."
      description="Avatar a iniziali con colore sempre uguale per la stessa persona, badge e chip che non si affidano al solo colore."
    >
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Specimen caption="Avatar: taglie, conferma presenza, evidenziato" className="flex flex-wrap items-end gap-4">
          {SIZES.map((size) => (
            <Avatar key={size} name="Giulia Rossi" size={size} />
          ))}
          <Avatar name="Sara Conti" size="lg" confirmed />
          <Avatar name="Elena Russo" size="lg" highlighted />
        </Specimen>
        <Specimen caption="Il colore deriva dal nome" className="flex flex-wrap gap-3">
          {SQUAD.map((name) => (
            <Avatar key={name} name={name} />
          ))}
        </Specimen>
        <Specimen caption="Gruppo di avatar (con contatore)">
          <AvatarStack label="Convocate" names={SQUAD} max={5} />
        </Specimen>
        <Specimen caption="Badge squadra e varianti" className="flex flex-wrap items-center gap-2">
          <Badge>U16</Badge>
          <Badge>Serie D</Badge>
          <Badge variant="neutral">Girone B</Badge>
          <Badge variant="brand">Capitano</Badge>
          <Badge variant="success">Attiva</Badge>
          <Badge variant="warning">In scadenza</Badge>
          <Badge variant="danger">Sospesa</Badge>
        </Specimen>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Specimen caption="Chip di stato dei pagamenti" className="flex flex-wrap items-center gap-2">
          <PaymentChip status="paid" />
          <PaymentChip status="pending" />
          <PaymentChip status="overdue" />
        </Specimen>
        <Specimen caption="Tag automazioni" className="flex flex-wrap items-center gap-2">
          <AutoChip />
          <AutoChip>Inviate in automatico</AutoChip>
          <Chip tone="success" icon={<Check strokeWidth={3} />}>
            Classifica aggiornata
          </Chip>
          <Chip tone="brand" icon={<Clock />}>
            In corso
          </Chip>
        </Specimen>
        <Specimen caption="Stato documenti: in regola, in scadenza, mancante" className="flex items-center gap-2">
          <StatusMark state="ok" label="Certificato medico" />
          <StatusMark state="expiring" label="Modulo d'iscrizione" />
          <StatusMark state="missing" label="Privacy" />
        </Specimen>
        <Specimen caption="Filtro a pill (provalo)">
          <PillFilter label="Filtra per squadra" options={TEAM_OPTIONS} value={team} onChange={setTeam} />
        </Specimen>
      </div>
    </ShowcaseSection>
  );
}
