# Stato di avanzamento SuiteASD (file di memoria del progetto)

> Leggere questo file all'inizio di ogni conversazione. Va aggiornato a ogni tappa e **obbligatoriamente prima di esaurire i token**.
> Regole del team: `CLAUDE.md`. Specifica: `docs/SPEC.md`. Decisioni: `docs/DECISIONS.md`. Guide: `docs/API.md`, `docs/FRONTEND.md`.

Ultimo aggiornamento: 2026-10-13 (ripresa dopo il limite d'uso del 2026-10-12).

## Obiettivo originale (/goal dell'utente)
Consegnare SuiteASD finita e testata: backend API-first + web app, lavorando "da team di ingegneria" con agenti specializzati, senza chiedere conferme.
Richieste dell'utente da rispettare fino alla fine:
- Nessun errore, nessuna feature non richiesta, codice pulito e leggibile; testare ogni cosa in isolamento e poi tutto insieme.
- Frontend: skill `impeccable` + `design-taste-frontend` (anti "AI slop"), Playwright per testare nel browser come un tester.
- Usare `claude-automation-recommender` (skill ufficiale di setup Claude Code) per analizzare il progetto e proporre skill/hook/MCP.
- Cartella `business/` con feature innovative, competitor e piano di lancio a costo zero: **già fatta** (commit c15dbdb), non toccare.
- Prima di dichiarare "fatto": lint + typecheck + test (+ build + E2E per il web) verdi, con evidenza in output.

## Stato per area

### Fatto e committato
- Scheletro e regole (`CLAUDE.md`), `business/` (competitor, feature, piano lancio).
- `apps/api` fondazione (commit 2bb4d57): Fastify, Prisma/SQLite, auth JWT+refresh ruotato, RBAC (`src/rbac/permissions.ts`), isolamento tenant, scheduler `node-cron` + `AutomationRun`, modulo `teams` come template, seed demo.
- `apps/web` fondazione (commit ea63ca5): design system in `globals.css`, libreria `components/ui`, pagina `/design`, shell (sidebar/bottom bar), home, login/registrazione, client API con refresh, test Vitest + Playwright.

### Backend: scritto ma NON committato (working tree)
Moduli con routes+service+schema+test: `competitions` (classifiche), `evaluations` (pagelle), `members`, `documents` (storage locale, scadenze, `isMemberEligible`), `fees` (quote, ricevute PDF, idempotenza), `venues`, `sponsors`, `trips`, `kits`, `staff`, `ledger`. Helper: `src/lib/crud-routes.ts`, `csv.ts`, `date-only.ts`, `idempotency.ts`. Migrazione `20261012190000_fees_events_support`. Seed: `members-documents.ts`.

### Backend: incompleto (lasciato a metà dal limite d'uso)
- `events`: ci sono `ical.ts`, `recurrence.ts`, `schema.ts`, `service.ts`; **mancano routes, test, registrazione in `modules/index.ts`**.
- `convocations`: c'è solo `summary.ts`; mancano service, routes, test.
- `attendance` (presenze allenamenti): cartella vuota.
- `notifications`: c'è solo `service.ts` (`createNotification`); mancano endpoint (centro notifiche, preferenze) e invio email/log.
- `announcements` (bacheca): file presenti ma **non registrati** e senza test.
- `tournaments`/`referees`: i tornei sono `Competition.kind = TOURNAMENT`; arbitri/designazioni da esporre.
- Automazioni (`src/jobs/definitions/`): c'è solo `housekeeping`. Mancano: promemoria certificati (02), promemoria/solleciti quote (03), invio convocazioni (04), ricalcolo classifiche (05), ricevute (03), notifiche (06/07); endpoint dashboard "gestione delegata" (08) + log esecuzioni.
- Seed: mancano `fees-events`, `competitions`, `secondary` (dati demo SPEC sez. 6: classifica Falchi 31 / Aquile 32 / Delfini 30 / Leoni 24 / Tigri 19; evento Aquile-Delfini sab 14 nov 20:30; 5/12 confermate; quota novembre 60 EUR).
- Endpoint "Statistiche" (dashboard società) non fatto.

### Frontend: da fare
Solo fondazione. Mancano tutte le pagine dei moduli (Tesserati, Certificati, Quote, Calendario/Convocazioni, Classifiche, Pagelle, Notifiche, Gestione delegata, moduli secondari) con loading/vuoto/errore, test Vitest e E2E Playwright (con backend reale o mock).

## Problemi noti da risolvere subito (verificati il 2026-10-13)
- `events/ical.ts` aveva escape corrotti (sistemato).
- `tsc`: 3 errori di tipo su `createNotification` chiamata da announcements/evaluations/events (il parametro `db` non accetta il client scoped).
- `eslint`: 14 errori solo nei test (`no-unsafe-return`, `no-unnecessary-type-assertion`, variabile inutilizzata, `restrict-plus-operands`).
- Test: `competitions.test.ts:440` (partita annullata conta in `matchesTotal`) e `tenant.test.ts` (`ReceiptSequence` ha solo `@unique` su `societyId`, il test cerca `@@index`/`@@unique`).

## Prossimi passi (in ordine)
1. Rendere verde il backend (typecheck, lint, test) e committare i moduli già scritti.
2. Completare events/convocations/attendance/notifications/announcements/referees + automazioni + dashboard 08 + statistiche + seed demo, ognuno con test.
3. Aggiornare `docs/API.md` e `docs/DECISIONS.md`.
4. Frontend modulo per modulo (agenti paralleli per cartella `features/<modulo>`), poi E2E Playwright contro il backend reale.
5. Eseguire `claude-automation-recommender` sul progetto e applicare le raccomandazioni utili.
6. Verifica finale: dalla root `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`.

## Comandi utili
- Dalla root: `npm run dev|build|test|test:e2e|lint|typecheck`. API 4000, web 3000, documentazione API `http://localhost:4000/docs/`.
- Credenziali demo: password `Demo1234!`; `admin@`, `segreteria@`, `allenatore@`, `staff@`, `atleta@`, `genitore@` + `aquilevolley.it`.
- Ambiente: Windows, shell Git Bash/PowerShell; Python non disponibile (usare Node per gli script).

## Registro (aggiungere in coda, più recente in fondo)
- 2026-10-12: fondazioni api+web, business/, 4 agenti backend in parallelo (interrotti dal limite d'uso).
- 2026-10-13: ripresa; creato questo file; diagnosi dello stato (vedi sopra).
