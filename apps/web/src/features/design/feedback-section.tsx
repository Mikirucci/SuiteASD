"use client";

import { CalendarX } from "lucide-react";
import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Drawer,
  DrawerContent,
  DrawerTrigger,
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@/components/ui";
import { ShowcaseSection, Specimen } from "./showcase-section";

export function FeedbackSection() {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <ShowcaseSection
      id="feedback"
      index={6}
      label="Feedback"
      title="Sempre chiaro cosa sta succedendo."
      highlight="cosa sta succedendo."
      description="Messaggi in linea, notifiche temporanee, finestre e pannelli che gestiscono il focus da tastiera."
    >
      <div className="grid gap-8 md:grid-cols-2">
        <Specimen caption="Messaggi in linea" className="flex flex-col gap-3">
          <Alert tone="danger">Email o password non corrette. Riprova.</Alert>
          <Alert tone="success" title="Pagamento registrato">
            Ricevuta n. 0148 generata e inviata a Giulia Rossi.
          </Alert>
          <Alert tone="info">I promemoria partono ogni mattina alle 8:00.</Alert>
        </Specimen>
        <Specimen caption="Notifiche temporanee (toast)" className="flex flex-wrap items-start gap-3">
          <Button
            variant="secondary"
            onClick={() => toast({ title: "Promemoria inviato", description: "A Sara e ai genitori, per il rinnovo.", tone: "success" })}
          >
            Successo
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: "Allenamento spostato", description: "Giovedì alle 19:00." })}>
            Informazione
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ title: "Invio non riuscito", description: "Riprova tra qualche minuto.", tone: "danger" })}
          >
            Errore (resta finché lo chiudi)
          </Button>
        </Specimen>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Specimen caption="Tab (frecce per cambiare, Home e Fine per gli estremi)">
          <Tabs defaultValue="documenti">
            <TabsList aria-label="Scheda tesserato">
              <TabsTrigger value="documenti">Documenti</TabsTrigger>
              <TabsTrigger value="pagamenti">Pagamenti</TabsTrigger>
              <TabsTrigger value="presenze">Presenze</TabsTrigger>
            </TabsList>
            <TabsContent value="documenti">
              <Card padding="sm" className="text-sm text-fg-muted">
                Certificato medico valido fino al 27 novembre.
              </Card>
            </TabsContent>
            <TabsContent value="pagamenti">
              <Card padding="sm" className="text-sm text-fg-muted">
                Quota novembre pagata il 3 novembre.
              </Card>
            </TabsContent>
            <TabsContent value="presenze">
              <Card padding="sm" className="text-sm text-fg-muted">
                Presente a 9 allenamenti su 10.
              </Card>
            </TabsContent>
          </Tabs>
        </Specimen>
        <Specimen caption="Finestra, conferma di eliminazione e pannello laterale (Esc chiude, il focus resta dentro)" className="flex flex-wrap items-start gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Apri finestra</Button>
            </DialogTrigger>
            <DialogContent
              title="Eliminare Sara Conti?"
              description="Verranno rimossi anche documenti e storico pagamenti. L'azione non si può annullare."
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="ghost">Annulla</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="danger">Elimina</Button>
                  </DialogClose>
                </>
              }
            />
          </Dialog>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Apri conferma
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Eliminare la palestra?"
            description="La palestra sparisce dall'elenco. L'azione non si può annullare."
            confirmLabel="Elimina"
            onConfirm={() => setConfirmOpen(false)}
          />
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="secondary">Apri pannello</Button>
            </DrawerTrigger>
            <DrawerContent title="Scheda tesserata" description="Giulia Rossi, Serie D">
              <p className="text-sm text-fg-muted">Qui trovano posto anagrafica, documenti e storico.</p>
            </DrawerContent>
          </Drawer>
        </Specimen>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Specimen caption="Stato vuoto">
          <EmptyState
            icon={CalendarX}
            title="Nessuna partita questa settimana"
            description="Aggiungi una partita o un allenamento per far partire le convocazioni."
            action={<Button>Nuovo evento</Button>}
          />
        </Specimen>
        <Specimen caption="Stato di errore">
          <ErrorState onRetry={() => undefined} />
        </Specimen>
        <Specimen caption="Scheletro di caricamento (stessa forma del contenuto)">
          <Card className="flex flex-col gap-4" aria-busy="true">
            <CardHeader title="Quote di novembre" description="Caricamento in corso" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </Card>
        </Specimen>
      </div>
    </ShowcaseSection>
  );
}
