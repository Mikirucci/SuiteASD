# Piano: riordino UX, onboarding, squadre/inviti, collaudo con persone (2026-10-17)

Richiesta dell'utente (dopo il collaudo manuale da zero):
1. Menu: sezioni per argomento, a gerarchia, con sottovoci che si espandono. Niente card "Altro" che raccolgono tutto in un punto.
2. Home admin: gerarchia chiara, meno ammassata; da qui l'admin deve capire dove andare (servizi principali).
3. Falle: l'admin non può creare squadre; le notifiche in-app non vengono mostrate.
4. Onboarding migliore: registrazione società e iscrizione atleta (la prima schermata del form non si capisce).
5. Collaudo vero: persone fittizie, flussi completi sul backend reale (niente dati mock), domande da utente ("dove trovo il bilancio?").
6. Metodo da team: agenti specializzati, skill di design, memoria, onestà sulle falle. Niente predisposizioni di deploy non richieste.

## Architettura dell'informazione (decisione)

Menu amministrazione, per argomento (le voci sono filtrate per permesso: un ruolo non vede ciò che non può aprire; un gruppo senza voci visibili sparisce):

| Gruppo | Voci (URL invariati salvo nuove) |
|---|---|
| Home | `/` (cruscotto) |
| Persone | Tesserati `/tesserati`, Squadre `/squadre` (NUOVA), Staff `/altro/staff`, Accessi e inviti `/inviti` (NUOVA) |
| Attività sportiva | Calendario `/calendario`, Presenze `/calendario/presenze`, Classifiche `/classifiche`, Tornei `/altro/tornei`, Pagelle `/pagelle`, Arbitri `/altro/arbitri`, Statistiche `/altro/statistiche` |
| Amministrazione | Quote `/quote`, Scadenze e documenti `/scadenze`, Bilancio `/altro/bilancio`, Sponsor `/altro/sponsor` |
| Logistica | Palestre `/altro/palestre`, Trasferte `/altro/trasferte`, Divise `/altro/divise` |
| Comunicazione | Notifiche `/notifiche` (badge), Bacheca `/altro/bacheca`, Automazioni `/automazioni` |

- Gli URL `/altro/*` restano (nessun redirect da rompere, nessun test E2E da riscrivere per l'URL); sparisce la pagina hub `/altro` (redirect a `/`).
- Sidebar: gruppi a fisarmonica (un `button` con `aria-expanded`), il gruppo della pagina attiva è aperto, gli altri chiusi; tastiera: Invio/Spazio apre, Tab entra nelle sottovoci. Mobile: la barra in basso resta (Home, Tesserati, Calendario, Quote, Menu); il Menu mostra la stessa fisarmonica.
- Un gruppo con una sola voce visibile diventa un link diretto (niente fisarmonica inutile).

## Home admin (gerarchia a 3 livelli)
1. **Da fare adesso**: elenco azionabile con conteggi che portano alla pagina giusta (nuove iscrizioni non lette, documenti mancanti/scaduti, quote scadute, convocazioni senza risposta della prossima partita). Se non c'è nulla: stato "Tutto in ordine".
2. **Servizi principali**: i 4 ingressi grandi (Persone, Calendario, Quote, Documenti) con il numero chiave e 2-3 link rapidi alle sottovoci. Gli stessi gruppi del menu.
3. **Il resto, più quieto**: classifica, notifiche recenti, automazioni, in blocchi senza card dentro card.
- Società vuota (nessuna squadra o nessun tesserato): al posto del cruscotto vuoto, un percorso "Per iniziare" a 4 passi con stato derivato dai dati (crea squadra, aggiungi tesserati o genera il link, imposta le quote, pianifica la prima partita).
- Scala spaziatura 4/8/12/16/24/32, almeno 24-32px tra i blocchi; stati loading/vuoto/errore.

## Onboarding
- **Società** (`/registrazione`): 2 passi (La società / Il tuo accesso) + riquadro "Cosa succede dopo" (crei le squadre, inviti gli atleti con un link, l'app gestisce il resto). Dopo la registrazione la home mostra il percorso "Per iniziare".
- **Atleta** (`/iscrizione/[code]`): la schermata deve dire chi sei, per cosa ti iscrivi (società + squadra del link) e cosa ottieni (area personale: documenti, convocazioni, quote). Scelta iniziale a due grandi opzioni ("Mi iscrivo io" / "Iscrivo mio figlio o mia figlia"), poi passi: account, dati dell'atleta. Il testo di marketing per dirigenti sulla sinistra va sostituito con testo pensato per l'atleta.

## Squadre e inviti (falle)
- `/squadre`: elenco, crea, modifica, elimina (con conferma). Campi dal contratto API `teams`. Dal menu e dal percorso "Per iniziare".
- `/inviti`: invita una persona per ruolo (allenatore, segreteria, staff, ...), elenco inviti pendenti, link da copiare, revoca se l'API lo prevede. Senza questa schermata l'admin non può dare accesso ai collaboratori (oggi solo via API).

## Notifiche in-app
- Riprodotto: la notifica "Nuova iscrizione" arriva in pagina Notifiche, home e badge. Cause plausibili del "non vengono mostrate": badge aggiornato solo ogni 60 s e senza ricarica al ritorno sulla finestra; nessuna campanella fuori dal menu; lato atleta nulla fino ai job pianificati. Indagare con i test a persone e correggere alla radice.

## Collaudo con persone (nessun mock, backend vero, società nuova creata da zero)
Persone: Rita (presidente, poco tecnica, PC), Davide (allenatore, telefono 390px), Marco (atleta 26), Elena (madre di Sara 12 anni), Luca (segreteria). Domande tipo: "dove trovo il bilancio?", "come aggiungo una squadra?", "come faccio vedere a mia figlia che la partita è sabato?". Ogni falla trovata va in `tasks/findings.md` con pagina, ruolo, gravità, correzione.

## Regole per tutti gli agenti
- Leggere `CLAUDE.md`, `docs/PROGRESS.md`, `docs/FRONTEND.md`. Il design system esistente (blu elettrico + verde menta, `lucide-react`, token in un posto) vince sulle preferenze generiche delle skill (`design-taste-frontend` sconsiglia lucide: qui si resta su lucide perché già in uso).
- Skill da usare: `impeccable`, `design-taste-frontend` (anti slop: niente em-dash visibili, niente gradienti viola, niente card dentro card, niente emoji icone), `frontend-ui-engineering`, `test-driven-development`.
- Ogni file nuovo con test; niente `any`, niente test indeboliti. UI italiana, codice e commenti in inglese.
- Gli agenti NON eseguono `build`, `test:e2e`, né avviano server su 3000/4000 (porta/`.next` condivisi): eseguono solo `lint`, `typecheck` e i test unitari del proprio perimetro (`npx vitest run <percorso>` in `apps/web` o `apps/api`). Il lead esegue build ed E2E in serie.
- Ognuno modifica solo il proprio perimetro; tocchi trasversali minimi e dichiarati nel report. Nessun commit: li fa il lead.
- Niente predisposizioni di deploy.

---

# Giro 2 (2026-10-17 sera): collaudo dell'utente su admin e atleta

Richieste dell'utente, in ordine. Admin: (A1) documenti nella scheda tesserato, (A2) squadre, (A3) risposta agli eventi, (A4) statistiche. Atleta: (B1) home a griglia, (B2) documenti, (B3) pagamenti e ricevute. In attesa per scelta dell'utente: home admin, tornei, pagelle, classifiche (NON toccare).

## Decisioni di prodotto (da riportare in DECISIONS D-32..D-36 e SPEC §10)
- **D-32 Risposta agli eventi (RSVP).** Alla creazione di un evento con squadra, ogni tesserato ATTIVO e idoneo della squadra riceve una `Convocation` PENDING già visibile e rispondibile (anche per ogni occorrenza di una serie e per chi entra in squadra dopo; chi esce perde le risposte PENDING degli eventi futuri). `sentAt` smette di controllare la visibilità: indica solo "notifica inviata" (invio manuale o job N giorni prima, promemoria ai non rispondenti invariati). Si risponde finché l'evento non è iniziato o annullato (date passate escluse, già così). Gli idonei = nessun certificato scaduto; per gli altri resta la convocazione manuale con deroga (admin). Eventi senza squadra: solo convocazione manuale, ora visibile subito. La capienza (12) vale per le aggiunte manuali e per la barra "confermate/posti"; le righe automatiche non la consumano. Admin/allenatore vedono tre gruppi: Confermati, Rifiutati, Senza risposta (PENDING resta tale: in allenamento si chiude con presente/assente nelle Presenze).
- **D-33 "Ho pagato".** Il pagante (atleta o genitore, solo propria quota) segnala il pagamento: `Payment.claimedAt`. L'amministrazione riceve una notifica (ADMIN_PAYMENT_CLAIMED), vede la quota con "Segnalato dal pagante" e, controllata la banca, la registra (flusso esistente `pay`). Segnalare non cambia lo stato.
- **D-34 Ricevute.** Dopo la registrazione la ricevuta si può vedere (anteprima PDF in piattaforma + scarica) da admin e pagante; al momento dell'emissione ricevono una notifica "Ricevuta n. X" sia il pagante (atleta e genitori del tesserato) sia l'amministrazione (canali: app + email se consentito). `Receipt.sentAt` valorizzato all'invio.
- **D-35 Documenti.** Un'unica riga documento condivisa tra scheda admin e area atleta: nome, stato, scadenza colorata solo come testo (rosso scaduto/entro 7 giorni, ambra entro 30, neutro altrimenti), file con "Apri" (anteprima nella piattaforma) e "Scarica". Il pulsante generale "Aggiungi documento"/"Carica un altro documento" sparisce quando esiste già almeno un documento o una riga richiesta (restano i pulsanti sulla riga).
- **D-36 Squadre.** Card più curata (nome, categoria, genere, numero tesserati, prossimo evento), filtri (ricerca, categoria, genere), pagina di dettaglio `/squadre/[id]` con rosa (tesserati con ruolo, numero, stato documenti e quote), staff, prossimi eventi, quote.

## Contratti API (fissati qui, gli agenti non li cambiano)
- `FeeDto.claimedAt: string | null` (ISO). `POST /fees/:id/claim-payment` (permesso nuovo `payments:claim`: ATLETA, GENITORE; solo quote proprie/dei figli; 404 se non propria; 409 `fee_already_paid` / `fee_cancelled`; idempotente: se già segnalata restituisce la quota invariata). Risposta 200 `FeeDto`. Notifica admin `ADMIN_PAYMENT_CLAIMED` con dedupe per quota.
- `GET /fees?claimed=true` filtra le quote PENDING/OVERDUE segnalate.
- Ricevuta: dopo `pay` (con automazione ricevute attiva) e dopo `POST /fees/:id/receipt`: notifica `RECEIPT_ISSUED` al pagante e all'amministrazione; `FeeDto.receipt` invariato (id, number, code, issuedAt) più `sentAt: string | null`.
- Convocazioni: nessun cambio di forma. Visibilità atleta senza `sentAt`. `ConvocationSummary` invariato (confirmed/declined/pending/total/capacity).

## Perimetri (disgiunti)
- API-1 (convocazioni auto): `apps/api/src/modules/{convocations,events,teams,members,attendance}`, `jobs/definitions/convocation-dispatch.ts`, seed, relativi test. Niente schema Prisma.
- API-2 (pagamenti e ricevute): `apps/api/src/modules/{fees,notifications}`, `shared/enums.ts`, `rbac/permissions.ts`, test. Lo schema Prisma e la migrazione `payment_claim` sono già fatti dal lead.
- FE-A documenti: `features/tesserati/{member-documents,document-*,}.tsx` nuovi file, `features/personale/{personal-documents,upload-document-dialog}`, `components/ui/file-preview-dialog.tsx` (riutilizzato poi dalle ricevute).
- FE-B squadre: `features/squadre/*`, `app/(app)/squadre/**`.
- FE-C statistiche: `features/statistiche/*`.
- FE-D home atleta e risposte: `features/personale/{personal-home*,test-support}`, `features/calendario/{pending-convocations,convocation-*,convocations-panel,event-detail-dialog,athlete-*}`. Dopo API-1.
- FE-E pagamenti e ricevute: `features/quote/*`. Dopo API-2 e FE-A (anteprima).
- Test a persone (lead): E2E reale `06-*` con Rita, Davide, Elena, Marco.
