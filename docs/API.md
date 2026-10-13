# SuiteASD API: guida per chi sviluppa i moduli

Backend REST in `apps/api` (Node 22, TypeScript strict, Fastify, Prisma/SQLite, Zod). Specifica funzionale: `docs/SPEC.md`. Decisioni e ipotesi: `docs/DECISIONS.md`.

## Avvio rapido

```bash
cd apps/api
cp .env.example .env        # una volta sola (il file .env non va committato)
npm install
npm run db:migrate          # applica le migrazioni a prisma/dev.db e genera il client Prisma
npm run db:seed             # società demo "Aquile Volley"
npm run dev                 # http://localhost:4000  (documentazione: http://localhost:4000/docs/)
```

| Script | Cosa fa |
|---|---|
| `npm run dev` | server con reload (tsx watch), log leggibili |
| `npm run build` / `npm start` | compila in `dist/` / avvia da `dist/server.js` |
| `npm test` | Vitest (DB SQLite isolato per ogni file di test) |
| `npm run lint` / `npm run typecheck` | ESLint strict type-checked / `tsc --noEmit` |
| `npm run db:migrate` | `prisma migrate dev` (crea e applica una migrazione dopo modifiche a `schema.prisma`) |
| `npm run db:deploy` | `prisma migrate deploy` (solo applica, per CI e produzione) |
| `npm run db:seed` / `db:reset` | rilancia il seed demo / azzera il DB e riapplica le migrazioni |

Dalla root del monorepo: `npm run dev|build|test|lint|typecheck` (porta API 4000, web 3000).

## Credenziali demo

Password per **tutti** gli account: `Demo1234!`

| Ruolo | Email | Note |
|---|---|---|
| ADMIN | `admin@aquilevolley.it` | Paolo Marchetti, presidente |
| SEGRETERIA | `segreteria@aquilevolley.it` | Laura Gentile |
| ALLENATORE | `allenatore@aquilevolley.it` | Marco Villa |
| STAFF | `staff@aquilevolley.it` | Franco Galli |
| ATLETA | `atleta@aquilevolley.it` | collegata al tesserato Giulia Rossi (Serie D) |
| GENITORE | `genitore@aquilevolley.it` | collegata a Sara Conti (U16, Libero) |

Il seed crea 6 squadre (U12, U14, U16, U18, Serie D, Prima Divisione) e 118 tesserati con le atlete citate in SPEC sez. 6. È rieseguibile: sostituisce la società demo.

## Convenzioni

- **Base URL** `/api/v1`. OpenAPI 3 generata dagli schemi Zod: UI Scalar su `/docs/`, JSON su `/docs/openapi.json`.
- **Auth**: `Authorization: Bearer <accessToken>`. Il token (JWT HS256, 15 min) contiene `sub`, `sid` (societyId) e `roles`: **il tenant viene sempre dal token**, mai dal body o dalla query.
- **Errori**: RFC 7807, `Content-Type: application/problem+json`:
  `{ "type", "title", "status", "detail", "instance", "code", "errors": [{ "path", "message" }] }`.
  Codici di stato: 400 richiesta malformata (es. cursore non valido), 401 non autenticato, 403 ruolo non autorizzato, 404 non trovato (anche per risorse di un altro tenant), 409 conflitto, 422 validazione Zod, 429 rate limit.
- **Paginazione a cursore** per ogni lista: `?limit=25&cursor=<opaco>` (max 100). Risposta `{ "data": [...], "page": { "nextCursor": string|null, "hasMore": boolean } }`.
- **JSON**: campi camelCase, date ISO 8601 UTC, importi in centesimi (`...Cents`), enum come stringhe MAIUSCOLE.
- **PATCH** parziale: i campi omessi non cambiano, `null` svuota un campo opzionale.
- **Rate limit**: globale (300/min per IP, configurabile) e stretto sulle rotte di credenziali (10 ogni 15 min).
- **CORS**: elenco origini in `CORS_ORIGINS` (default `http://localhost:3000`).
- **Operazioni di scrittura sensibili** (pagamenti): l'header `Idempotency-Key` è obbligatorio e rende la ripetizione sicura (vedi "Operazioni sensibili e idempotenza").

## Endpoint della fondazione

| Metodo e percorso | Permesso | Descrizione |
|---|---|---|
| `GET /health` | pubblico | liveness + stato DB |
| `POST /auth/register` | pubblico | crea società + admin, restituisce la sessione |
| `POST /auth/login` | pubblico | `{ email, password, societyId? }` |
| `POST /auth/refresh` | pubblico | ruota il refresh token (monouso; il riuso revoca l'intera famiglia) |
| `POST /auth/logout` | pubblico | revoca la sessione del refresh token (idempotente, 204) |
| `GET /me` | autenticato | utente, società, ruoli, permessi, società dell'utente, tesserato collegato, figli |
| `POST /invitations` | `invitations:write` | invito per ruolo (`memberId` opzionale per ATLETA/GENITORE); il token in chiaro è restituito una sola volta |
| `GET /invitations` | `invitations:read` | inviti pendenti |
| `DELETE /invitations/:id` | `invitations:write` | revoca invito |
| `POST /invitations/accept` | pubblico | accetta invito (crea l'account o aggiunge la società a un account esistente) e apre la sessione |
| `GET /users` | `users:read` | account della società con ruoli (`q`, `role`) |
| `POST /guardian-links` | `guardianLinks:write` | collega un account GENITORE a un atleta |
| `GET /guardian-links` | `guardianLinks:read` | filtri `memberId`, `guardianUserId` |
| `DELETE /guardian-links/:id` | `guardianLinks:write` | scollega |
| `POST /devices` | `devices:write` | registra/aggiorna il device token (idempotente) |
| `GET/POST /teams`, `GET/PATCH/DELETE /teams/:id` | `teams:read` / `teams:write` | modulo di riferimento (CRUD) |

Sessione restituita da register/login/refresh/accept: `{ accessToken, refreshToken, tokenType: "Bearer", expiresIn, user, society, roles }`.

## RBAC

Tutta la matrice è in **`src/rbac/permissions.ts`**: permessi nominati `risorsa:azione` mappati sui 6 ruoli della SPEC. Le rotte dichiarano solo il permesso (`app.requirePermission('teams:write')`); non scrivere mai ruoli a mano nelle rotte. `requireRole(...)` e `requireAuth` esistono per casi eccezionali. I permessi `*:readOwn` indicano "solo i propri dati" (atleta) o "dei figli collegati" (genitore): il service deve filtrare le righe (`GuardianLink`, `Member.userId`). Un utente con più ruoli ottiene l'unione dei permessi. Chi aggiunge un modulo aggiorna le proprie righe della matrice e i test in `test/rbac.test.ts`.

## Isolamento dei tenant

- Ogni tabella tenant ha `societyId` + indice (un test fallisce se una nuova tabella non rispetta la regola; solo `Society` e `User` sono globali).
- `tenantOf(request)` restituisce `{ auth, db }`. **`db` è un client Prisma riscritto** (`src/lib/tenant.ts`): ogni lettura/aggiornamento/cancellazione ha `AND societyId = <token>`, le creazioni impongono `societyId` (un valore diverso lancia `TenantViolationError`), il `societyId` di una riga esistente non è modificabile. Nei service si passa comunque `societyId: auth.societyId` nelle `create` (richiesto dai tipi Prisma).
- I moduli **non** devono usare `app.prisma` né SQL raw: lo vieta una regola ESLint (eccezioni: `auth`, `devices`, `health`, job).
- Ogni id che arriva dal client (`teamId`, `memberId`...) va verificato con `db` prima dell'uso: un id di un altro tenant risulta "non trovato" (404). Scrivi scritture "piatte" con `societyId` esplicito; le scritture annidate (`create` dentro `create`) non sono verificate dall'estensione.
- Le risorse di altri tenant rispondono 404, non 403, per non rivelarne l'esistenza.

## Come aggiungere un modulo (checklist)

Copia `src/modules/teams/` come template.

1. **Schema Prisma**: aggiungi i modelli in `prisma/schema.prisma` (se già presenti, usa quelli). Regole: `societyId` + `@@index([societyId, ...])`, `createdAt`/`updatedAt`, niente enum Prisma (stringhe + valori in `src/shared/enums.ts` + Zod), importi in centesimi. Poi `npm run db:migrate -- --name <modulo>_<cosa>`; committa la cartella in `prisma/migrations`. **Non modificare migrazioni già committate.**
2. **`schema.ts`**: schemi Zod di body, query, params e risposta (DTO esplicito, mai la riga Prisma grezza; date con `toIso`). Riusa `paginationQuerySchema`, `pageSchema`, `idParamsSchema`.
3. **`service.ts`**: funzioni `(ctx: TenantRequestContext, ...)` che usano `ctx.db`. Errori attesi con `notFound/conflict/unprocessable/forbidden` (`src/lib/errors.ts`). Liste con `orderBy: [..., { id: 'asc' }]` + `...cursorArgs(query)` + `toPage(rows, query)`.
4. **`routes.ts`**: `FastifyPluginAsyncZod`; `onRequest: [app.requirePermission('<risorsa>:<azione>')]`, `schema` con `tags`, `summary`, `security: bearerSecurity`, `body/querystring/params`, `response` (`...problemResponses(401, 403, 404, ...)`).
5. **Registra** la rotta in `src/modules/index.ts` (una riga).
6. **Permessi**: verifica/aggiorna le righe della risorsa in `src/rbac/permissions.ts`.
7. **Seed**: crea `prisma/seed/<modulo>.ts` (esporta un `SeedStep`) e aggiungilo a `STEPS` in `prisma/seed/run.ts`, dopo gli step da cui dipende.
8. **Automazioni** (se servono): una cartella/file in `src/jobs/definitions/`, aggiunto all'array in `definitions/index.ts` (vedi sotto).
9. **Test** (copia `test/teams.test.ts`): 401 senza token, matrice dei ruoli (una riga per ruolo), CRUD, validazione 422, conflitti 409, paginazione, **isolamento tenant** (un altro tenant riceve 404 e non vede le righe). `test/rbac.test.ts` verifica già in automatico che ogni rotta non pubblica sia protetta e documentata.
10. **Chiudi**: `npm run lint && npm run typecheck && npm test` verdi, poi aggiorna questo file se aggiungi convenzioni.

## Automazioni e scheduler

`src/jobs/`: scheduler in-process (`node-cron`, nessun Redis), fuso `Europe/Rome`, avviato da `server.ts` se `SCHEDULER_ENABLED=true`.

```ts
// src/jobs/definitions/<nome>.ts
export const certificateReminders: AutomationDefinition = {
  key: 'certificate-reminders',          // stabile: è la chiave di Automation per società
  name: 'Promemoria certificati',
  description: '...',
  schedule: '0 8 * * *',                 // cron a 5 campi
  enabledByDefault: true,
  defaultConfig: { thresholdsDays: [30, 15, 7, 0] },
  async run({ db, societyId, config, now, runKey, log }) {
    // `db` è già limitato alla società; `config` è la configurazione salvata (soglie, orari...)
    return { reminded: 12 };             // riepilogo salvato in AutomationRun.result
  },
};
```

Idempotenza: per ogni (società, automazione, `runKey`) esiste al più una riga `AutomationRun`; `runKey` di default è la data UTC (una volta al giorno), personalizzabile con `runKey(now)` (es. per ora). Se due worker partono insieme vince il vincolo univoco; un'esecuzione `FAILED` o `RUNNING` da oltre un'ora viene ripresa al tick successivo. Le automazioni disattivate (`Automation.enabled = false`) vengono saltate. Per eseguire a mano: `createScheduler(...).runForAllSocieties(key)`. Esempio funzionante: `housekeeping` (pulizia token/inviti scaduti).

## Come testare

- `npm test` esegue tutto. `globalSetup` applica le migrazioni una volta a un DB SQLite modello; ogni file di test ne riceve una copia privata (`createTestContext()` in `test/helpers/app.ts`) e le copie vengono rimosse a fine test. Nessun test tocca `prisma/dev.db`.
- Dentro un file, isola i test creando una nuova società (`createSociety`) e gli attori (`createActor(ctx, societyId, 'ADMIN')` restituisce utente, token e header `authorization` senza passare dal login).
- Si chiamano le rotte con `ctx.app.inject({ method, url, headers, payload })` (nessuna porta aperta). Factory: `test/helpers/factories.ts`.
- `npm test -- --coverage` produce il report di copertura (v8).

## Variabili d'ambiente

Vedi `.env.example`: `DATABASE_URL`, `JWT_SECRET` (>= 32 caratteri, in produzione non può essere quello di sviluppo), `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`, `INVITATION_TTL_DAYS`, `CORS_ORIGINS`, `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `ARGON2_MEMORY_KIB`, `TRUST_PROXY`, `SCHEDULER_ENABLED`, `PORT`, `HOST`, `LOG_LEVEL`.

## Calendario, convocazioni e presenze (SPEC 04)

Moduli `events`, `convocations`, `attendance`. Tutte le date in ingresso sono ISO 8601 con offset (`2026-11-14T20:30:00+01:00`) o UTC; in uscita sempre UTC.

| Metodo e percorso | Permesso | Descrizione |
|---|---|---|
| `GET /events` | `events:read` | lista per periodo: `from` (incluso), `to` (escluso), `teamId`, `type`, `status`, cursore. Per la striscia settimanale: lunedì 00:00 e lunedì successivo 00:00 nel fuso della società. Ogni evento porta `convocations: { confirmed, declined, pending, total, capacity }` ("5/12 confermate" = `confirmed`/`capacity`) |
| `GET /events/export.ics` | `events:read` | calendario iCalendar (RFC 5545), stessi filtri della lista, max 2000 eventi |
| `GET /events/:id` | `events:read` | dettaglio |
| `POST /events` | `events:write` | crea un evento; con `recurrence: { frequency: 'WEEKLY', interval?, until o count }` (solo `TRAINING`) crea la serie. Risposta = prima occorrenza + `occurrencesCreated` |
| `PATCH /events/:id` | `events:write` | modifica; cambiare `startsAt` o `venueId` è uno spostamento: stato `POSTPONED` e notifica `EVENT_CHANGED` ad atleti e genitori della squadra e dei convocati |
| `POST /events/:id/cancel` | `events:write` | annulla (body `{ reason? }`, mandare almeno `{}`), notifica gli stessi destinatari |
| `DELETE /events/:id` | `events:write` | elimina con convocazioni e presenze, senza notifica |
| `GET /convocations` | `convocations:readOwn` | lista paginata (`eventId`, `memberId`, `status`, `upcoming`); atleta e genitore vedono solo le convocazioni **già inviate** a sé o ai figli |
| `GET /events/:eventId/convocations` | `convocations:readOwn` | convocati dell'evento + `summary` (stesso filtro ABAC) |
| `POST /events/:eventId/convocations` | `convocations:write` | convoca `{ memberIds, override?: { reason } }`: solo atleti attivi della squadra dell'evento, già convocati ignorati, capienza (409 `capacity_exceeded`), certificato scaduto (422 `member_not_eligible`) |
| `POST /events/:eventId/convocations/send` | `convocations:write` | invia le convocazioni non ancora inviate (idempotente) |
| `POST /events/:eventId/convocations/remind` | `convocations:write` | promemoria ai non rispondenti (al massimo uno al giorno per convocazione) |
| `PUT /convocations/:id/response` | `convocations:respond` | `{ status: 'CONFIRMED' o 'DECLINED', reason? }` (reason solo con DECLINED); atleta per sé, genitore per i figli collegati; 409 dopo l'inizio o se annullato |
| `DELETE /convocations/:id` | `convocations:write` | revoca una convocazione prima dell'inizio |
| `GET /events/:eventId/attendance` | `attendance:read` | foglio presenze dell'allenamento: atleti della squadra con `present` true/false/null (non registrato) |
| `PUT /events/:eventId/attendance` | `attendance:write` | check-in rapido `{ entries: [{ memberId, present, note? }] }`, upsert in blocco (max 100, idempotente); solo eventi `TRAINING` |
| `GET /members/:id/attendance` | `attendance:read` | storico dell'atleta (cursore, più recenti prima) + `summary { present, total, percentage }`; filtri `from`, `to` |
| `GET /teams/:id/attendance` | `attendance:read` | riepilogo della squadra: percentuale per atleta e complessiva, `trainings` con almeno un check-in |

Regole principali:

- **Eleggibilità**: `ineligibleMemberIds`/`isMemberEligible` (modulo documenti) bloccano chi ha il certificato medico **scaduto**. L'**ADMIN** (`convocations:override`) può convocare comunque inviando `override.reason` (obbligatoria): `Convocation.overriddenById` e `overrideReason` restano nel DB (visibili solo allo staff) e la deroga è scritta nel log applicativo (`audit: convocation_override`). Un non-ADMIN che invia `override` riceve 403.
- **Capienza**: `Event.maxConvocations` (default 12). Gli atleti che declinano liberano il posto.
- **Invio**: `sendConvocations` imposta `Convocation.sentAt` e `Event.convocationsSentAt` (data del primo invio) e scrive una notifica `CONVOCATION` per atleta e genitori (`dedupeKey = convocation:<id>`). Chiamarlo di nuovo non rinotifica nessuno; le convocazioni aggiunte dopo il primo invio partono alla chiamata successiva. Inviare per un evento annullato o già iniziato dà 409.
- **Presenze**: contano solo gli allenamenti non annullati; `percentage = present / total` con una cifra decimale, `null` senza registrazioni.

Funzioni di servizio per le automazioni (`src/modules/convocations/service.ts`), senza utente loggato:

```ts
interface ConvocationScope { db: TenantDb; societyId: string }   // `{ db, societyId }` dei job; per le rotte: scopeOf(tenantOf(request))
sendConvocations(scope: ConvocationScope, eventId: string, now = new Date()): Promise<{ eventId: string; sent: number; notified: number; convocationsSentAt: string | null }>
remindPendingConvocations(scope: ConvocationScope, eventId: string, now = new Date()): Promise<{ eventId: string; reminded: number; notified: number }>
```

Entrambe lanciano 404 (evento di un'altra società o inesistente) e 409 (`event_cancelled`, `event_started`): chi le chiama in un job deve filtrare gli eventi futuri non annullati. `notified` conta le righe di notifica scritte (una per destinatario e canale).

### Export iCal e autenticazione

`GET /events/export.ics` richiede, come ogni altro endpoint, `Authorization: Bearer <accessToken>`: il token non può stare nell'URL. Il client scarica quindi il file con una richiesta autenticata e lo importa (Google Calendar, Apple Calendar, Outlook) oppure lo salva:

```ts
const response = await fetch(`${API}/events/export.ics?from=2026-09-01T00:00:00Z&teamId=${teamId}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const blob = await response.blob(); // text/calendar, Content-Disposition: attachment; filename="calendario.ics"
```

Un'iscrizione a un calendario esterno che si aggiorna da sola (URL di abbonamento) richiederebbe un token dedicato nell'URL: non è prevista in questa fase (vedi DECISIONS.md, CAL-4).

## Catalogo degli endpoint dei moduli

Tutti sotto `/api/v1`, tutti con validazione Zod, schema OpenAPI (`/docs/`), isolamento per società e permessi per ruolo (nomi in `src/rbac/permissions.ts`, formato `risorsa:azione`). Le liste usano la paginazione a cursore descritta sopra. Per i dettagli di campi e risposte: `/docs/` o `/docs/openapi.json`.

| Modulo (SPEC) | Endpoint |
|---|---|
| Tesserati (01) | `GET/POST /members`, `GET/PATCH/DELETE /members/:id`, `GET /members/summary`, `GET /members/export` (CSV `;` UTF-8 con BOM), `POST /members/import` (CSV, dry run di default) |
| Certificati e scadenze (02) | `GET/POST/PATCH/DELETE /document-types`, `GET/POST /members/:id/documents`, `GET/PATCH/DELETE /documents/:id`, `PUT/GET /documents/:id/file`, `GET /documents/expirations` (timeline per mese) |
| Quote e pagamenti (03) | `GET/POST/PATCH/DELETE /fee-plans`, `POST /fee-plans/:id/generate`, `GET/POST /fees`, `GET /fees/summary`, `POST /fees/:id/pay` (richiede `Idempotency-Key`), `GET/POST /fees/:id/receipt` |
| Calendario e convocazioni (04) | `GET/POST /events`, `GET/PATCH/DELETE /events/:id`, `POST /events/:id/cancel`, `GET /events/export.ics`, `GET /convocations`, `GET/POST /events/:id/convocations`, `POST /events/:id/convocations/send\|remind`, `PUT /convocations/:id/response`, `DELETE /convocations/:id`, `GET/PUT /events/:id/attendance`, `GET /members/:id/attendance`, `GET /teams/:id/attendance` |
| Gironi e classifiche (05) | `/seasons`, `/competitions`, `/competitions/:id/groups`, `.../groups/:gid/teams`, `.../groups/:gid/matches`, `.../groups/:gid/rounds`, `.../groups/:gid/standings`, `GET/PATCH/DELETE /matches/:id`, `PUT/DELETE /matches/:id/result` |
| Pagelle e statistiche (06) | `GET /matches/:id/report-cards`, `PUT/DELETE /matches/:id/evaluations/:memberId`, `POST /matches/:id/evaluations/publish`, `PUT/DELETE /matches/:id/stats/:memberId`, `GET /members/:id/evaluations`, `GET /members/:id/evaluation-summary`, `GET /evaluation-summaries` |
| Notifiche (07) | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read-all`, `POST /notifications/:id/read`, `GET/PUT /notifications/preferences` |
| Gestione delegata (08) | `GET /automations`, `PATCH /automations/:key`, `GET /automations/:key/runs`, `POST /automations/:key/run` |
| Moduli secondari | `/venues`, `/trips`, `/kits`, `/sponsors`, `/staff`, `/ledger/entries` + `GET /ledger/report`, `/announcements`, `/referees`, `/referee-assignments`, `GET /statistics/overview`. I tornei sono competizioni con `kind = TOURNAMENT` (`GET /competitions?kind=TOURNAMENT`) |

### Operazioni sensibili e idempotenza

`POST /fees/:id/pay` richiede l'header `Idempotency-Key` (8-128 caratteri `[\w.:-]`): ripetere la stessa richiesta con la stessa chiave restituisce la stessa risposta (header `Idempotent-Replayed: true`) senza registrare due pagamenti né emettere due ricevute. Helper in `src/lib/idempotency.ts`; `Idempotency-Key`, `Idempotent-Replayed` e `Content-Disposition` sono esposti ai browser via CORS.

### Notifiche

Sei tipi (`CONVOCATION`, `FEE_DUE`, `CERTIFICATE_EXPIRING`, `EVENT_CHANGED`, `EVALUATION_PUBLISHED`, `ANNOUNCEMENT`), testi in italiano in `modules/notifications/templates.ts`. Ogni notifica è scritta nel centro in-app e, se il destinatario non l'ha disattivata nelle preferenze, in coda email. I destinatari sono risolti per ruolo (atleta + genitori collegati). `dedupeKey` impedisce doppi invii. L'invio email usa Resend quando `RESEND_API_KEY` ed `EMAIL_FROM` sono impostati; altrimenti le email sono registrate come `SKIPPED` nel log (`NotificationLog`).

### Automazioni (SPEC 08)

Catalogo in `src/jobs/catalog.ts`, nell'ordine della checklist della dashboard:

| Chiave | Tipo | Quando | Impostazioni |
|---|---|---|---|
| `fee-reminders` | pianificata | ogni giorno 09:00 | `beforeDueDays` (default 1, 7), `afterDueDays` (3, 10) |
| `certificate-reminders` | pianificata | ogni giorno 08:00 | `thresholdsDays` (0, 7, 15, 30) |
| `convocation-dispatch` | pianificata | ogni giorno 09:00 | `daysBefore` (3), `remindNonRespondents` (true), `reminderDaysBefore` (1) |
| `standings` | evento | a ogni risultato | nessuna, sempre attiva (la classifica è derivata) |
| `receipts` | evento | a ogni pagamento | nessuna, disattivabile (ricevuta emessa a mano con `POST /fees/:id/receipt`) |
| `notifications-dispatch` | pianificata | ogni 10 minuti | `maxAttempts` (3), `batchSize` (100) |

La percentuale della dashboard è automazioni attive / totali. Ogni esecuzione è registrata (`AutomationRun`) ed è consultabile con `GET /automations/:key/runs`; `POST /automations/:key/run` esegue subito un'automazione pianificata (solo amministratori).
