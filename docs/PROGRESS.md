# Stato di avanzamento SuiteASD (file di memoria del progetto)

> Leggere questo file all'inizio di ogni conversazione. Va aggiornato a ogni tappa e **obbligatoriamente prima di esaurire i token**.
> Regole del team: `CLAUDE.md`. Specifica: `docs/SPEC.md`. Decisioni: `docs/DECISIONS.md`. Guide: `docs/API.md`, `docs/FRONTEND.md`.

Ultimo aggiornamento: 2026-10-13 (notte). Backend completo (inclusi job invio convocazioni, e9a3f53). Frontend: TUTTI i moduli SPEC committati (cfbc931). Verifica: lint e typecheck puliti, test api 726 + web 582, build ok, E2E mockati 106/106.

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
- Scheletro e regole, `business/`, fondazioni api+web (design system, shell, auth).
- Backend completo: tutti i moduli SPEC (members, documents, fees, events/convocations/attendance, competitions/tournaments, evaluations, notifications+email, announcements, automations (dashboard 08 + job + log), referees, statistics, venues, sponsors, trips, kits, staff, ledger) con test e seed demo.
- Frontend moduli: Tesserati (01), Scadenze (02), Quote (03), Classifiche (05), Pagelle (06).

### Frontend: moduli fatti
Tesserati, Scadenze, Quote, Calendario (+presenze), Classifiche, Pagelle, Notifiche, Automazioni, Altro (hub + palestre, trasferte, divise, sponsor, bilancio, staff, tornei, arbitri, bacheca, statistiche).

### Da fare
1. Home con dati reali (verificare `features/home`).
2. E2E contro il backend reale (seed demo) sui flussi principali.
3. `docs/API.md` (aggiungere endpoint recenti) e `docs/DECISIONS.md` (automazioni: orari fissi e canali non configurabili; badge "Inviate in automatico" mostrato se esiste sentAt; ricerca competizione per card partita).
4. Limiti noti dai report: badge notifiche non lette nella shell omesso; WeekStrip a 320px ~37px di larghezza (<44px); cross-import tra feature (usePermission, saveFile, useCursorQuery, formatEuro da quote/tesserati) da promuovere in lib/.
5. `claude-automation-recommender`, poi verifica finale.

## Note tecniche utili
- React Query riprova 2 volte le GET 500: nei test E2E degli errori il mock deve fallire 3 volte (poi "Riprova" ricarica).
- `getByRole("alert")` incontra anche il route announcer di Next: filtrare con `.filter({ hasText })`.
- Gli agenti frontend NON eseguono build/E2E (porta 3000/.next): li esegue il lead in serie.

## Comandi utili
- Dalla root: `npm run dev|build|test|test:e2e|lint|typecheck`. API 4000, web 3000, documentazione API `http://localhost:4000/docs/`.
- Credenziali demo: password `Demo1234!`; `admin@`, `segreteria@`, `allenatore@`, `staff@`, `atleta@`, `genitore@` + `aquilevolley.it`.
- Ambiente: Windows, shell Git Bash/PowerShell; Python non disponibile (usare Node per gli script).

## Registro (aggiungere in coda, più recente in fondo)
- 2026-10-12: fondazioni api+web, business/, 4 agenti backend in parallelo (interrotti dal limite d'uso).
- 2026-10-13: ripresa; creato questo file; diagnosi dello stato (vedi sopra).
- 2026-10-13: sistemati ical.ts, tipo di createNotification, lint dei test, @@unique su ReceiptSequence, aspettativa errata in competitions.test; committato 2466112 (api verde). Lanciati 5 agenti in background: backend calendario/convocazioni/presenze; backend notifiche/automazioni/arbitri/statistiche/seed; frontend tesserati+scadenze; frontend quote; frontend classifiche+pagelle. Gli agenti frontend NON eseguono build/E2E (conflitto su .next e porta 3000): li esegue il lead in serie. Restano da fare dopo: frontend calendario, notifiche, automazioni, altro (moduli secondari), statistiche; job invio convocazioni; E2E contro backend reale; claude-automation-recommender; verifica finale.
- 2026-10-13 sera: ripresa dopo interruzione; sistemati lint test api (referees, email), 6 E2E rossi (retry React Query, route announcer, nome accessibile trend-bars, auth spec su /calendario); committati 7776eee (api) e aa561f6 (web). Lanciati agenti per frontend: calendario, notifiche, automazioni, altro-hub+secondari, tornei/arbitri/bacheca/statistiche.
- 2026-10-13 notte: 5 agenti frontend completati; aggiunto job convocation-dispatch (mancava); sistemati 2 E2E (auth su rotta inesistente, selettore ambiguo). Commit e9a3f53, cfbc931.
