"use client";

import { Users } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  DataList,
  DataListRow,
  DataTable,
  EmptyState,
  PaymentChip,
  ProgressBar,
  ProgressRing,
  StatusMark,
  Timeline,
  WeekStrip,
  type DataTableColumn,
  type PaymentStatus,
  type TimelineItem,
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { ShowcaseSection, Specimen } from "./showcase-section";

interface PlayerRow {
  id: string;
  name: string;
  team: string;
  fee: PaymentStatus;
}

const PLAYERS: readonly PlayerRow[] = [
  { id: "1", name: "Anna Ferri", team: "U18", fee: "paid" },
  { id: "2", name: "Chiara Neri", team: "U16", fee: "pending" },
  { id: "3", name: "Elena Russo", team: "Serie D", fee: "paid" },
  { id: "4", name: "Sara Conti", team: "U16", fee: "overdue" },
];

const COLUMNS: readonly DataTableColumn<PlayerRow>[] = [
  { key: "name", header: "Tesserata", cell: (row) => <span className="font-bold">{row.name}</span> },
  { key: "team", header: "Squadra", cell: (row) => <Badge>{row.team}</Badge> },
  { key: "fee", header: "Quota novembre", cell: (row) => <PaymentChip status={row.fee} /> },
  { key: "amount", header: "Importo", align: "right", cell: () => "60,00 €" },
];

const EXPIRIES: readonly TimelineItem[] = [
  { id: "gr", name: "Giulia Rossi", date: new Date(2026, 9, 28) },
  { id: "sc", name: "Sara Conti", date: new Date(2026, 10, 27) },
  { id: "er", name: "Elena Russo", date: new Date(2026, 11, 18) },
  { id: "mb", name: "Marta Bianchi", date: new Date(2027, 0, 14) },
  { id: "af", name: "Anna Ferri", date: new Date(2027, 1, 10) },
  { id: "cn", name: "Chiara Neri", date: new Date(2027, 2, 5) },
];

const CROWDED_EXPIRIES: readonly TimelineItem[] = [
  { id: "lv", name: "Laura Villa", date: new Date(2026, 10, 24) },
  { id: "pg", name: "Paola Gatti", date: new Date(2026, 10, 25) },
  { id: "sc", name: "Sara Conti", date: new Date(2026, 10, 27) },
  { id: "fm", name: "Francesca Monti", date: new Date(2026, 10, 27) },
  { id: "bl", name: "Beatrice Longo", date: new Date(2026, 10, 28) },
  { id: "ec", name: "Elisa Colombo", date: new Date(2026, 11, 2) },
  { id: "er", name: "Elena Russo", date: new Date(2026, 11, 18) },
];

const CONVOCATED = ["Giulia Rossi", "Sara Conti", "Elena Russo", "Marta Bianchi", "Anna Ferri"] as const;

const MATCH_DAY = new Date(2026, 10, 14);
const EVENT_DAYS = [new Date(2026, 10, 10), new Date(2026, 10, 12), MATCH_DAY];

export function DataSection() {
  const [selectedDay, setSelectedDay] = useState(MATCH_DAY);
  const [selectedExpiry, setSelectedExpiry] = useState("sc");

  return (
    <ShowcaseSection
      id="dati"
      index={5}
      label="Dati"
      title="Elenchi, progressi e calendari."
      highlight="progressi"
      description="Ogni elenco gestisce da solo caricamento, errore e vuoto: provali tutti qui sotto."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <Specimen caption="Barra di progresso (anima al caricamento)" className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="flex justify-between text-sm font-bold">
              <span>Presenze confermate</span>
              <span className="text-success">5/12</span>
            </p>
            <ProgressBar label="Presenze confermate" value={5} max={12} tone="success" valueText="5 su 12 confermate" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="flex justify-between text-sm font-bold">
              <span>Attività gestite dall&apos;app</span>
              <span className="text-success">100%</span>
            </p>
            <ProgressBar label="Attività gestite dall'app" value={100} tone="gradient" />
          </div>
          <ProgressBar label="Esempio vuoto" value={0} />
        </Specimen>
        <Specimen caption="Anello del voto: colore per fascia (8+, 7+, 6+, sotto 6)" className="flex flex-wrap gap-5">
          {[
            { name: "Giulia Rossi", grade: 8.5 },
            { name: "Sara Conti", grade: 7.1 },
            { name: "Elena Russo", grade: 6.4 },
            { name: "Marta Bianchi", grade: 5.2 },
          ].map(({ name, grade }) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <ProgressRing value={grade} label={`Voto di ${name}`} />
              <p className="text-xs font-semibold text-fg-muted">{name}</p>
            </div>
          ))}
        </Specimen>
      </div>

      <Specimen caption="Timeline scadenze (OTT-MAR): selezionabile">
        <Card className="flex flex-col gap-6">
          <Timeline
            start={new Date(2026, 9, 1)}
            items={EXPIRIES}
            selectedId={selectedExpiry}
            onSelect={setSelectedExpiry}
            label="Scadenze dei certificati medici"
          />
          <p className="text-sm">
            <span className="font-bold">{EXPIRIES.find((item) => item.id === selectedExpiry)?.name}</span>
            <span className="text-fg-muted"> · Certificato medico</span>
          </p>
        </Card>
      </Specimen>

      <Specimen caption="Timeline con scadenze ravvicinate: gli avatar si dispongono su più righe, senza coprirsi">
        <Card>
          <Timeline start={new Date(2026, 9, 1)} items={CROWDED_EXPIRIES} label="Scadenze ravvicinate" />
        </Card>
      </Specimen>

      <div className="grid gap-8 md:grid-cols-2">
        <Specimen caption="Striscia settimanale con pallino evento">
          <WeekStrip weekOf={MATCH_DAY} selected={selectedDay} onSelect={setSelectedDay} eventDays={EVENT_DAYS} />
        </Specimen>
        <Specimen caption="Card partita e convocate">
          <Card tone="brand" className="flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-label text-white">Serie D · Girone B · Giornata 6</p>
            <p className="text-lg font-extrabold tracking-title">Aquile Volley vs Delfini Volley</p>
            <p className="text-sm text-white">Sabato 14 novembre · 20:30 · Palazzetto</p>
            <div className="mt-4 flex items-center justify-between">
              <AvatarStack label="Convocate" names={CONVOCATED} size="sm" />
              <p className="text-sm font-bold">5/12 confermate</p>
            </div>
          </Card>
        </Specimen>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Specimen caption="Elenco: con dati">
          <DataList
            items={PLAYERS}
            label="Tesserate"
            getKey={(row) => row.id}
            empty={null}
            renderItem={(row) => (
              <DataListRow
                leading={<Avatar name={row.name} decorative />}
                title={row.name}
                subtitle={`${row.team} · Quota novembre`}
                trailing={
                  <>
                    <StatusMark state="ok" label="Certificato medico" />
                    <PaymentChip status={row.fee} />
                  </>
                }
              />
            )}
          />
        </Specimen>
        <div className="flex flex-col gap-8">
          <Specimen caption="Elenco: in caricamento">
            <DataList
              items={undefined}
              isLoading
              label="Tesserate"
              getKey={() => ""}
              renderItem={() => null}
              empty={null}
              skeletonRows={2}
            />
          </Specimen>
          <Specimen caption="Elenco: vuoto">
            <DataList
              items={[]}
              label="Tesserate"
              getKey={() => ""}
              renderItem={() => null}
              empty={
                <EmptyState
                  icon={Users}
                  title="Nessun tesserato in questa squadra"
                  description="Aggiungi la prima atleta o importa l'elenco da un file Excel."
                  action={<Button>Aggiungi tesserato</Button>}
                />
              }
            />
          </Specimen>
          <Specimen caption="Elenco: errore con riprova">
            <DataList
              items={undefined}
              error={new ApiError(503, null)}
              onRetry={() => undefined}
              label="Tesserate"
              getKey={() => ""}
              renderItem={() => null}
              empty={null}
            />
          </Specimen>
        </div>
      </div>

      <Specimen caption="Tabella: da 768 px è una tabella, sotto diventa una pila di card">
        <DataTable rows={PLAYERS} columns={COLUMNS} getKey={(row) => row.id} label="Quote di novembre" empty={null} />
      </Specimen>
    </ShowcaseSection>
  );
}
