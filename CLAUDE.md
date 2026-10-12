# SuiteASD — regole del team (leggere prima di toccare codice)

Specifica funzionale completa: `docs/SPEC.md` (fonte di verità). Decisioni: `docs/DECISIONS.md`. Business/marketing: cartella `business/` (NON toccare nel codice).

**Stato del lavoro: `docs/PROGRESS.md`. Leggerlo a inizio sessione e aggiornarlo a ogni tappa e prima di finire i token.**

## Struttura
- `apps/api` — backend REST API-first (Fastify + TypeScript + Prisma/SQLite + Zod + OpenAPI), test Vitest.
- `apps/web` — frontend Next.js (App Router) + Tailwind, test E2E Playwright. Parla col backend SOLO via API HTTP `/api/v1`.
- `business/` — brainstorm feature e piano di lancio.

## Regole non negoziabili
1. Codice pulito, leggibile, tipizzato (TS strict, niente `any`, niente `@ts-ignore`, niente test saltati/rimossi/indeboliti per far tornare il verde).
2. Nessuna feature non richiesta in `docs/SPEC.md`. Niente codice morto, TODO, placeholder o mock lasciati nel prodotto.
3. Ogni endpoint: validazione Zod, autorizzazione per ruolo, isolamento per `societyId` (tenant), schema OpenAPI, test.
4. Ogni schermata: stati loading/empty/error, accessibilità WCAG AA, responsive. Italiano.
5. Design: tokens in un solo posto (Tailwind theme/CSS vars). Palette e stile dal video (blu elettrico + verde menta), disciplina di `impeccable` (scala spaziatura 4/8/12/16/24/32, scala tipografica 12/14/16/20/24/32, stati default/hover/focus-visible/active/disabled/loading/error, contrasto AA). Anti "AI slop": niente gradienti viola casuali, niente card-in-card, niente emoji come icone, niente testo placeholder generico. Usa le skill `design-taste-frontend` e `frontend-ui-engineering`.
6. Prima di dichiarare finito un lavoro: lint + typecheck + test passano, evidenza in output. Non dichiarare "fatto" senza averlo eseguito.
7. Non modificare file di un altro modulo/agente senza necessità; se serve un cambio trasversale, tienilo minimo e dichiaralo nel report.
8. Lingua UI italiana; codice e commenti (pochi, solo dove il "perché" non è ovvio) in inglese.
9. Comandi: dalla root `npm run dev|build|test|test:e2e|lint|typecheck`. Porte: API 4000, web 3000.
