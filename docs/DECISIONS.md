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
