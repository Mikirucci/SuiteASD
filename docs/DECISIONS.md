# Decisioni e ipotesi

Formato: decisione, motivo, conseguenze. Aggiungi qui le nuove scelte (backend e frontend) con data.

## Backend: fondazione (apps/api)

### D1. SQLite per il prototipo, schema portabile su PostgreSQL
SPEC sez. 5 indica PostgreSQL; il prototipo parte a costo zero con SQLite (un file, nessun servizio). Per poter passare a Postgres cambiando solo `provider` e `DATABASE_URL`:
- niente enum Prisma né liste scalari: gli enum sono stringhe, i valori ammessi stanno in `src/shared/enums.ts` e sono validati con Zod ai bordi API (un test vieta enum e liste nello schema);
- importi in centesimi interi (`amountCents`), mai `Decimal`/float;
- JSON solo per configurazioni e payload (`Automation.config`, `Match.setScores`, `Notification.data`);
- id `cuid` come stringa, date `DateTime` (UTC).

Differenze da tenere a mente al passaggio:
- `contains` è case-insensitive in SQLite (ASCII) ma case-sensitive in Postgres; per una ricerca insensibile in Postgres serve `mode: 'insensitive'` (non supportato da SQLite). Le ricerche attuali (`q` su squadre e utenti) vanno riviste.
- Scritture concorrenti: SQLite serializza le scritture; Postgres no. La logica di claim dei job e dei refresh token usa vincoli univoci e `updateMany` condizionali, validi in entrambi.
- Row-Level Security (SPEC): SQLite non la offre. L'isolamento è applicato dal client Prisma riscritto (`src/lib/tenant.ts`); su Postgres si può aggiungere RLS come seconda barriera senza cambiare il codice dei moduli.
- Cifratura a riposo dei dati sensibili (GDPR, SPEC): non implementata nel prototipo; in produzione va affidata a disco/DB cifrato e, per i documenti, allo storage S3 con SSE.
- Migrazioni: la cartella `prisma/migrations` è generata per SQLite; al passaggio a Postgres si ricrea una baseline (`migrate diff`) invece di riusare i file SQL.

### D2. Prisma 6 (non 7)
Prisma 7 richiede driver adapter e `prisma.config.ts` e cambia generatore e output; per un prototipo stabile si resta su `6.19.x` (versione fissata). `npm audit` segnala `deepmerge-ts` (advisory di stack exhaustion) tramite `@prisma/config` della CLI: è una dipendenza di sviluppo/build, non raggiungibile dal server a runtime; si rivaluta con l'upgrade a Prisma 7.

### D3. Isolamento tenant: client riscritto + filtro per id esterni
Il tenant è nel JWT (`sid`). I moduli ricevono solo un client Prisma "scoped" (estensione `$allModels`): niente query senza `societyId`. Limiti dichiarati: SQL raw e scritture annidate non sono coperti (regola ESLint contro il raw; checklist per gli id esterni). `User` è globale: dal client scoped è leggibile solo se ha una `Membership` nella società ed è mai scrivibile. Le risorse di altri tenant rispondono 404.

### D4. Auth
- Access token JWT HS256 (15 min) con `sub`, `sid`, `roles`; refresh token opaco di 256 bit salvato solo come hash SHA-256, **ruotato a ogni uso** con rilevamento del riuso (il riuso di un token già ruotato revoca l'intera famiglia di sessione). Due refresh simultanei dello stesso token (es. due schede) provocano quindi un logout: il client web deve serializzare il refresh.
- Password: argon2id (19 MiB, t=2, p=1). Login con tempo di risposta equalizzato per email inesistente.
- Un account (email) è globale e può appartenere a più società (`Membership` per ruolo). `login` senza `societyId` sceglie la membership più vecchia; `societyId` seleziona un'altra società. Il cambio società senza ripetere la password non è previsto (fuori SPEC, da aggiungere se serve).
- Le modifiche ai ruoli hanno effetto al successivo refresh (al più 15 minuti). Un utente disattivato smette di poter fare refresh/login, ma un access token già emesso resta valido fino alla scadenza.
- Inviti: un ruolo per invito, token a 256 bit salvato come hash, scadenza 7 giorni, monouso (claim atomico). Chi invita non può concedere ruoli superiori ai propri (`INVITABLE_ROLES`: la segreteria non può invitare ADMIN/SEGRETERIA). Il token in chiaro è restituito una sola volta nella risposta di creazione perché l'invio email (Resend) è una fase successiva. Accettando con un'email già registrata serve la password dell'account.
- Magic link e 2FA (SPEC: "opzionale") non sono ancora implementati.
- Rate limit in memoria (un'istanza). Con più istanze serve uno store condiviso.

### D5. RBAC
Matrice unica in `src/rbac/permissions.ts`, permessi `risorsa:azione`. Ipotesi sui ruoli, da affinare con i moduli: la segreteria gestisce anagrafiche, documenti e quote; l'allenatore gestisce convocazioni, presenze e pagelle; lo staff gestisce palestre/trasferte/divise/arbitri insieme all'admin; bilancio e sponsor sono solo admin; atleta e genitore leggono i propri dati (`*:readOwn`, filtro nel service). `ADMIN` ha tutti i permessi tranne le azioni di self-service (`convocations:respond`, `evaluations:readOwn`).

### D6. Entità aggiunte oltre l'elenco SPEC
Servono ai flussi richiesti: `Invitation` (inviti per ruolo), `NotificationLog` (log di invio, SPEC 07), `TeamStaff` (allenatori per squadra, ruolo ALLENATORE), `RefereeAssignment` (designazioni e rimborsi arbitri, SPEC "Arbitri"). `Standing` non è una tabella: la classifica è derivata dai `Match` (SPEC 05). `Group` è mappato sulla tabella `competition_groups` (evita la parola riservata SQL). I tornei sono `Competition.kind = TOURNAMENT`.

### D7. Job e automazioni senza Redis
Scheduler in-process (`node-cron`) con idempotenza su `AutomationRun (automationId, runKey)` e log di esecuzione nel DB; una riga `Automation` per società e chiave contiene attivazione e configurazione (SPEC 08: ogni automazione attivabile/disattivabile e configurabile). Limite: con più istanze dell'API il vincolo univoco evita le doppie esecuzioni, ma tutte le istanze pianificano i tick (spegnere con `SCHEDULER_ENABLED=false` sulle secondarie). Se in futuro servono code con retry/backoff, si passa a pg-boss o BullMQ mantenendo `AutomationDefinition`.

### D8. Altre scelte
- OpenAPI da Zod (`fastify-type-provider-zod` + `@fastify/swagger`), interfaccia Scalar su `/docs/` fuori dal prefisso `/api/v1` per avere header di sicurezza diversi (CSP rilassata solo per la UI della documentazione).
- Autenticazione e permessi sono in `onRequest` (prima del parsing del body): una richiesta senza token riceve 401 anche se il body è invalido.
- Errori in `application/problem+json`, `type` = `about:blank#<code>`; `code` è il discriminante stabile per i client.
- `Idempotency-Key`, `ETag`/`If-None-Match` e upload con URL pre-firmati (SPEC 5-bis) non sono nella fondazione: `updatedAt` è presente su ogni tabella; l'idempotenza va implementata dal modulo Quote/pagamenti (tabella di chiavi con vincolo univoco + hash del payload) e riusata dagli altri.
- Un'ASD ha un solo `sport` per ora (`VOLLEY`); il campo c'è per l'estensione ad altri sport (regole punteggio parametriche in `Competition.pointsRules`).
- Versioni fissate: TypeScript 5.9 (typescript-eslint supporta TS < 6.1, quindi non il 7), Vitest 3, ESLint 9.

## Calendario, convocazioni e presenze (SPEC 04)

### CAL-1. Eventi e ricorrenza
- Solo gli allenamenti si ripetono (ricorrenza settimanale con `interval` 1-4, `until` o `count`, al massimo 100 occorrenze). Le occorrenze sono create subito come righe `Event`: la prima porta `recurrenceRule` (RRULE), le altre `recurrenceParentId`. L'ora locale della società (fuso `Society.timezone`) resta invariata attraverso il cambio dell'ora legale. Modifica, annullamento ed eliminazione valgono per la singola occorrenza; non c'è un "modifica tutta la serie".
- Lo spostamento non ha un endpoint a parte: `PATCH` con nuovo `startsAt` o `venueId` imposta lo stato `POSTPONED` e notifica (tipo `EVENT_CHANGED`) gli atleti con i genitori della squadra dell'evento più i convocati. Modifiche a titolo, note o capienza non notificano. L'annullamento è `POST /events/:id/cancel`.
- Un evento annullato non è più modificabile né annullabile. Lo stato `COMPLETED` e il legame con `Match` (risultato) sono del modulo campionati.

### CAL-2. Convocazioni
- Eleggibilità = nessun certificato medico **scaduto** (stessa regola dei documenti, SPEC 02: "con certificato scaduto non è convocabile"). Chi non ha alcun certificato non è bloccato qui: è segnalato dagli indicatori documenti (ambra/rosso) ma la SPEC blocca solo lo scaduto.
- La deroga è per richiesta, non per atleta: `override.reason` vale per tutti gli atleti non eleggibili della richiesta; viene salvata su ogni convocazione interessata e scritta nel log. Le deroghe non hanno una tabella di audit propria.
- Capienza: contano le convocazioni non declinate; chi declina libera il posto per un sostituto. Si convoca solo tra gli atleti attivi con appartenenza aperta alla squadra dell'evento (un evento senza squadra, es. riunione o torneo, accetta qualunque atleta attivo).
- Convocazioni, risposte e invii si fermano all'inizio dell'evento (409 `event_started`) o se è annullato (409 `event_cancelled`).
- Atleti e genitori vedono una convocazione solo dopo l'invio (`sentAt`), e solo la propria/dei figli. Il motivo del declino lo vedono la persona stessa e lo staff.
- Invio: la scelta di "N giorni dalla gara" e dei promemoria periodici spetta all'automazione schedulata (altro modulo), che chiama `sendConvocations` / `remindPendingConvocations`. Le due funzioni sono idempotenti: l'invio per `Convocation.sentAt` più `dedupeKey` della notifica; il promemoria con `dedupeKey` per convocazione e giorno (UTC). Le convocazioni aggiunte dopo il primo invio non partono da sole.

### CAL-3. Presenze
- Il check-in vale solo per gli `Event.type = TRAINING` non annullati (SPEC: "presenze agli allenamenti"); la lista parte dagli atleti attivi della squadra, ma si può registrare anche un ospite di un'altra squadra. Un atleta non ancora registrato è `present: null`, non assente.
- La percentuale è `presenti / presenze registrate` (una cifra decimale). Vedono lo storico solo ADMIN, segreteria e allenatore: la SPEC non prevede che l'atleta consulti le presenze.

### CAL-4. Export iCal
- L'export è un normale endpoint con Bearer (vedi API.md): niente token nell'URL, quindi niente abbonamento automatico da Google Calendar. Se servirà, andrà aggiunto un token di sola lettura per società/utente, revocabile, con scope limitato all'export.
- Eventi annullati hanno `STATUS:CANCELLED`; senza `endsAt` la durata esportata è un'ora.

## Moduli successivi (SPEC 02-08 e secondari)

### M-1. Classifiche derivate, mai salvate
La classifica si calcola dalle partite giocate a ogni richiesta (`/standings`): inserire o correggere un risultato la aggiorna da sola. Punti per esito in `Competition.pointsRules` (JSON): nei dati demo `3-0` e `3-1` valgono 3 a 0, `3-2` vale 3 a 1, scelta necessaria perché i totali della SPEC (136 punti) non sono multipli di 3. Spareggi: vittorie, quoziente set, quoziente punti. L'automazione "Aggiornare le classifiche" è quindi sempre attiva e non disattivabile.

### M-2. Tornei
Un torneo è una `Competition` con `kind = TOURNAMENT`: ha gironi e una classifica derivata per girone. Nessun modello dedicato. Il frontend riusa le viste delle classifiche filtrando per tipo.

### M-3. Pagamenti idempotenti e ricevute numerate
`POST /fees/:id/pay` richiede `Idempotency-Key`; la ricevuta ha numerazione progressiva per società (`ReceiptSequence`, unico per società). I dati demo partono da n. 0144 (143 ricevute già emesse). Se l'automazione "Emettere le ricevute" è spenta, il pagamento resta registrato senza ricevuta e la si emette a mano.

### M-4. Notifiche: in-app sempre, email in coda
Ogni evento scrive nel centro notifiche; l'email è accodata solo se l'utente non l'ha disattivata. La consegna è un job (`notifications-dispatch`) con nuovi tentativi, così un fornitore email fermo non blocca le operazioni. Senza `RESEND_API_KEY` le email risultano `SKIPPED` (utile in sviluppo). WhatsApp/SMS non sono implementati: la SPEC li chiede solo come predisposizione opzionale. Il push web non è implementato lato server (solo la registrazione dei device token). Lo stesso job, prima di recapitare le email, notifica le comunicazioni di bacheca programmate che sono andate online (altrimenti nessuno le riceverebbe: alla creazione nessuno viene avvisato). Il client legge il contatore ogni 30 s e al ritorno sulla finestra; se cambia, ricarica anche le liste.

### M-5. Automazioni: cosa si configura
Le impostazioni esposte sono soglie, giorni, ora di esecuzione e canali (validate per chiave con Zod `strict`). Orari e canali per automazione sono stati aggiunti nella Fase 2 (vedi in fondo); le preferenze di notifica per utente restano un livello a parte.

### M-6. Invio convocazioni
Le convocazioni sono preparate dall'allenatore (bozza, `sentAt` nullo) e inviate dal job `convocation-dispatch` quando mancano `daysBefore` giorni di calendario alla gara (UTC). Il promemoria ai non rispondenti parte negli ultimi `reminderDaysBefore` giorni, al massimo uno al giorno, e mai nel giorno stesso dell'invio. L'invio manuale ("Invia convocazioni") usa la stessa funzione ed è idempotente. L'API non distingue invio manuale e automatico: il badge "Inviate in automatico" della UI compare quando esiste una data di invio.

### M-7. Dati demo
Il seed (`npm run db:seed -w apps/api`) crea la società Aquile Volley: 118 tesserati, 6 squadre, Serie D girone B (Aquile 32, Falchi 31, Delfini 30, Leoni 24, Tigri 19), la partita Aquile-Delfini di sabato 14 novembre 2026 alle 20:30 con 5/12 convocazioni confermate (collegata al risultato 3-1, giornata 6), quota novembre 60 euro con 240 euro incassati, e dati per tutti i moduli secondari. Le date della partita sono fissate dalla SPEC: dopo il 14 novembre 2026 i test E2E che dipendono dalla convocazione futura vanno aggiornati.

### M-8. Test E2E su due livelli
`npm run test:e2e` usa l'API simulata a livello di rete (veloce, copre errori e permessi). `npm run test:e2e:real` avvia l'API vera su un database SQLite temporaneo con il seed demo e la build del web, ed esegue pochi flussi end-to-end in sequenza (lettura, scrittura, ruoli).

### M-9. Frontend: scelte di dettaglio
- Un errore di rete o 5xx viene ritentato due volte da React Query prima di mostrare l'errore con "Riprova".
- Bilancio: i movimenti nati da un pagamento non sono modificabili da UI, per non sfasare il legame con le Quote.
- La scheda partita del calendario ricava "SERIE D · GIRONE B · GIORNATA N" dalla partita collegata all'evento (`Match.eventId`); senza collegamento mostra il nome della squadra.
- Il fuso orario della società è assunto uguale a quello del browser per l'intervallo settimanale.

## Fase 2 (richieste del 2026-10-16)

### D-20. Due aree, decise dai ruoli
Chi ha almeno un ruolo di amministrazione (admin, segreteria, allenatore, staff) lavora in `/`; chi è solo atleta o genitore va in `/area-personale` (reindirizzamento lato client, i permessi restano applicati dall'API). Chi ha entrambi i ruoli passa da un'area all'altra con un link nella navigazione. Le pagine dei moduli usate anche dall'area personale (calendario, pagamenti, classifica, notifiche) sono le stesse, montate su rotte diverse: l'API restituisce già solo i dati che il ruolo può vedere.

### D-21. Notifiche per destinatario
I tipi `ADMIN_*` (pagamento ricevuto, quote scadute, documenti da sistemare, documento caricato, nuova iscrizione, sponsor in scadenza) sono per amministratore e segreteria; gli altri per atleti, genitori e staff. L'API offre a ciascuno solo i tipi dei suoi ruoli (preferenze e filtro). Nessuna notifica va dall'atleta all'amministrazione per sua iniziativa: l'avviso nasce da un fatto (documento caricato, pagamento) tramite l'automazione `admin-alerts`.

### D-22. Link di iscrizione senza approvazione
`POST /join-links` crea un link (squadra, scadenza e massimo di usi opzionali; revocabile). Chi lo usa ottiene subito account e tesserato attivo, già nella squadra, senza passaggio di approvazione: il controllo è il link stesso. Sotto i 14 anni l'iscrizione la fa un genitore (account genitore collegato al figlio). Se l'email ha già un account, la password scritta deve essere quella esistente e i dati si collegano a quell'account. La pagina `/iscrizione/[code]` è pubblica; un link scaduto, revocato o esaurito mostra "Link non utilizzabile".

### D-23. Allegati
Un solo modello `Attachment` legato a un record (`entityType` + `entityId`) con i file su disco come i documenti. Può allegare chi gestisce quel tipo di record (permesso `attachments:use` più il controllo per tipo). Formati e limiti uguali a quelli dei documenti (PDF, JPG, PNG, 5 MB, contenuto verificato).

### D-24. Report PDF per il commercialista
`GET /reports/accounting.pdf?from&to&sections` genera il PDF al volo (PDFKit, font standard: niente caratteri fuori da WinAnsi, ad esempio il segno meno tipografico). `GET /reports/accounting/summary` dice cosa conterrebbe, sezione per sezione, per la schermata. Richiede `ledger:read`; ogni generazione è nel log di audit. Il periodo proposto dalla UI va dal 1° gennaio a oggi.

### D-25. Import da file, niente scraping
I siti delle federazioni non hanno un'interfaccia stabile né un permesso d'uso: lo scraping sarebbe fragile e non verificabile. Al suo posto: `POST /events/import` (file iCalendar) e `POST /competitions/:id/groups/:gid/matches/import` (CSV di partite e risultati), entrambi con anteprima prima di scrivere. Inserimento manuale invariato.

### Aggiornamento di M-5
Ora di esecuzione e canali (app, email) sono configurabili per ogni automazione pianificata (`config.hour`, `config.channels`), oltre alle soglie. Le automazioni sono 10: alle sei di prima si aggiungono `missing-documents`, `admin-alerts`, `admin-digest`, `sponsor-expiry`.

## Riordino UX e collaudo con persone (richieste del 2026-10-17)

### D-26. Menu per argomento, voci filtrate dai permessi
La navigazione dell'amministrazione ha cinque gruppi a fisarmonica (Persone, Attività sportiva, Amministrazione, Logistica, Comunicazione) più la Home. Ogni voce dichiara il permesso che serve per aprirla (`features/shell/nav-items.ts`): una voce non permessa sparisce, un gruppo senza voci sparisce, un gruppo con una sola voce visibile diventa un link diretto. L'hub "Altro" è stato tolto (`/altro` reindirizza a `/`); gli URL `/altro/<voce>` restano invariati per non rompere collegamenti e test. Il gruppo della pagina aperta è espanso; il badge delle notifiche compare sulla voce e sul gruppo chiuso.

### D-27. Home a tre livelli e percorso "Per iniziare"
Livello 1 "Da fare adesso" (iscrizioni da leggere, documenti mancanti o scaduti, quote scadute, convocati senza risposta), livello 2 "I tuoi servizi" (Persone, Calendario, Quote, Documenti con un numero e i link alle sottovoci), livello 3 "Il resto". Per una società senza squadre o senza tesserati il percorso a 4 passi sostituisce il cruscotto; con la società avviata ma passi mancanti diventa una striscia compatta con i soli passi mancanti. Lo stato dei passi è derivato dai dati: nessuna persistenza.

### D-28. Squadre e inviti hanno una schermata
`/squadre` (permesso `teams:write` per modificare) e `/inviti` (`invitations:write`). L'invito vale per i ruoli di amministrazione; atleti e genitori entrano dal link di iscrizione. Il link d'invito si mostra una sola volta alla creazione (il token è salvato come hash) e l'app non invia email: lo manda chi invita. `GET /invitations/:token` (pubblico, con rate limit) restituisce società, ruolo ed email mascherata, così la pagina `/invito/[token]` dice a chi apre il link per cosa è invitato. Eliminare una squadra non è bloccato dall'API: tesserati, eventi e piani quota perdono il collegamento alla squadra (la conferma lo dice).

### D-29. Onboarding a passi
Registrazione società in 2 passi (La tua società, Il tuo accesso) con "Cosa succede dopo". Iscrizione da link in 3 passi (Chi si iscrive, Il tuo accesso, Dati dell'atleta), con società e squadra in chiaro in alto e senza il pannello di marketing per dirigenti nelle pagine pubbliche. Contratto API invariato.

### D-30. Notifiche in-app: aggiornamento e programmate
Il contatore delle non lette si aggiorna ogni 30 secondi e al ritorno sulla finestra; se cambia, ricarica le liste. Le comunicazioni di bacheca programmate generano la notifica entro 10 minuti dalla pubblicazione (job di recapito). Non sono state aggiunte notifiche nuove per l'atleta (quota creata, pagamento registrato, atleta aggiunto a una squadra): non sono eventi della SPEC. Le convocazioni restano in bozza finché chi le gestisce non preme "Invia convocazioni" (o parte l'invio automatico N giorni prima): il pannello lo dice chiaramente.

### D-31. Etichetta delle squadre
Una squadra si mostra col nome; la categoria si aggiunge tra parentesi solo se non è già nel nome (`teamLabel`). Con due squadre con lo stesso nome e la stessa categoria restano indistinguibili: non è consentito dall'API (nome univoco).
