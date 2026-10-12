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
- **Operazioni di scrittura sensibili** (pagamenti, invii): l'header `Idempotency-Key` è ammesso da CORS ma l'helper non è ancora implementato; chi realizza i pagamenti deve aggiungerlo (vedi DECISIONS.md).

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
