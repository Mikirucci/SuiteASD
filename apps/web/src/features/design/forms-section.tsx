"use client";

import { Mail, Search } from "lucide-react";
import { useState } from "react";
import { Checkbox, Input, Select, Switch, Textarea } from "@/components/ui";
import { PasswordInput } from "@/features/auth/password-input";
import { ShowcaseSection, Specimen } from "./showcase-section";

const TEAMS = [
  { value: "u14", label: "Under 14" },
  { value: "u16", label: "Under 16" },
  { value: "u18", label: "Under 18" },
  { value: "serie-d", label: "Serie D" },
] as const;

export function FormsSection() {
  const [reminders, setReminders] = useState(true);
  return (
    <ShowcaseSection
      id="moduli"
      index={3}
      label="Campi"
      title="Moduli chiari, con errori leggibili."
      highlight="errori leggibili."
      description="Etichetta sempre visibile sopra il campo, aiuto e messaggio d'errore collegati con aria-describedby."
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-2">
        <Specimen caption="Campo normale con aiuto" className="flex flex-col gap-5">
          <Input label="Nome e cognome" placeholder="Giulia Rossi" hint="Come compare sul tesserino." />
          <Input label="Email" type="email" leadingIcon={<Mail />} placeholder="nome@societa.it" required />
        </Specimen>
        <Specimen caption="Errore e disabilitato" className="flex flex-col gap-5">
          <Input label="Codice fiscale" defaultValue="RSSGLI0" error="Il codice fiscale deve avere 16 caratteri." />
          <Input label="Squadra" defaultValue="Serie D" disabled />
        </Specimen>
        <Specimen caption="Ricerca (etichetta nascosta, ma letta dagli screen reader)" className="flex flex-col gap-5">
          <Input label="Cerca tesserato" hideLabel type="search" leadingIcon={<Search />} placeholder="Cerca per nome" />
          <PasswordInput label="Password" defaultValue="segreta-123" hint="Almeno 8 caratteri." />
        </Specimen>
        <Specimen caption="Selezione e testo lungo" className="flex flex-col gap-5">
          <Select label="Squadra" options={TEAMS} placeholder="Scegli una squadra" />
          <Textarea label="Note dell'allenatore" placeholder="Ottima ricezione, da migliorare la battuta." />
        </Specimen>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Specimen caption="Checkbox: vuota, selezionata, disabilitata, con errore" className="flex flex-col gap-1">
          <Checkbox label="Certificato medico consegnato" />
          <Checkbox label="Modulo d'iscrizione firmato" defaultChecked />
          <Checkbox label="Liberatoria privacy" disabled />
          <Checkbox label="Accetto il regolamento" error="Per continuare devi accettare il regolamento." />
        </Specimen>
        <Specimen caption="Interruttore: attivo, spento, disabilitato" className="flex flex-col gap-1">
          <Switch
            label="Promemoria quote automatici"
            hint={reminders ? "Attivo: partono 7 giorni prima della scadenza." : "Spento: nessun promemoria viene inviato."}
            checked={reminders}
            onChange={(event) => setReminders(event.target.checked)}
          />
          <Switch label="Invio convocazioni automatico" defaultChecked />
          <Switch label="Sollecito dopo la scadenza" disabled />
        </Specimen>
      </div>
    </ShowcaseSection>
  );
}
