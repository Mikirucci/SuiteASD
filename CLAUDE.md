# SuiteASD — regole del team (leggere prima di toccare codice)

Specifica funzionale completa: `docs/SPEC.md` (fonte di verità). Decisioni: `docs/DECISIONS.md`. Sicurezza e passi per la produzione: `docs/SECURITY.md`. Business/marketing: cartella `business/` (NON toccare nel codice).

**Stato del lavoro: `docs/PROGRESS.md`. Leggerlo a inizio sessione e aggiornarlo a ogni tappa e prima di finire i token.**

## Struttura
- `apps/web` — frontend Next.js (App Router) + Tailwind, test unitari Vitest, test E2E Playwright. Parla col backend SOLO via API HTTP `/api/v1`.
- `business/` — brainstorm feature e piano di lancio.
- Il backend NON sta in questo repository: è il progetto Java/Spring Boot `SuiteASD-backend` (repository separato). Il contratto delle API è `docs/api/openapi.yaml` di quel repository; le istruzioni per avviarlo sono nel suo `docs/SVILUPPO.md`. Il vecchio backend Node (`apps/api`) è stato eliminato il 2026-11-20.

## Regole non negoziabili
1. Codice pulito, leggibile, tipizzato (TS strict, niente `any`, niente `@ts-ignore`, niente test saltati/rimossi/indeboliti per far tornare il verde).
2. Nessuna feature non richiesta in `docs/SPEC.md`. Niente codice morto, TODO, placeholder o mock lasciati nel prodotto.
3. Il frontend segue il contratto del backend (`docs/api/openapi.yaml` del repository backend): se un campo o un endpoint cambia, si adegua prima il frontend a quel contratto, mai il contrario senza chiederlo.
4. Ogni schermata: stati loading/empty/error, accessibilità WCAG AA, responsive. Italiano.
5. Design: tokens in un solo posto (Tailwind theme/CSS vars). Palette e stile dal video (blu elettrico + verde menta), disciplina di `impeccable` (scala spaziatura 4/8/12/16/24/32, scala tipografica 12/14/16/20/24/32, stati default/hover/focus-visible/active/disabled/loading/error, contrasto AA). Anti "AI slop": niente gradienti viola casuali, niente card-in-card, niente emoji come icone, niente testo placeholder generico. Usa le skill `design-taste-frontend` e `frontend-ui-engineering`.
6. Prima di dichiarare finito un lavoro: lint + typecheck + test passano, evidenza in output. Non dichiarare "fatto" senza averlo eseguito.
7. Non modificare file di un altro modulo/agente senza necessità; se serve un cambio trasversale, tienilo minimo e dichiaralo nel report.
8. Lingua UI italiana; codice e commenti (pochi, solo dove il "perché" non è ovvio) in inglese.
9. Comandi: dalla root `npm run dev|build|test|test:e2e|test:e2e:real|lint|typecheck`. Porte: web 3000, backend Java 8080 (il web inoltra `/api/v1` al backend, vedi `apps/web/next.config.ts`).
