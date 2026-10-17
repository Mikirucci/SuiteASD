# Stato di avanzamento SuiteASD (file di memoria del progetto)

> Leggere questo file all'inizio di ogni conversazione. Va aggiornato a ogni tappa e **obbligatoriamente prima di esaurire i token**.
> Regole del team: `CLAUDE.md`. Specifica: `docs/SPEC.md`. Decisioni: `docs/DECISIONS.md`. Guide: `docs/API.md`, `docs/FRONTEND.md`.

Ultimo aggiornamento: 2026-10-17. PRODOTTO COMPLETO secondo SPEC, Fase 2 inclusa. Verifica finale eseguita: lint e typecheck puliti; test api 931 + web 722; build ok; E2E mockati 110/110; E2E su backend reale 18/18.

## Obiettivo originale (/goal dell'utente)
Consegnare SuiteASD finita e testata: backend API-first + web app, lavorando "da team di ingegneria" con agenti specializzati, senza chiedere conferme.
Richieste dell'utente da rispettare fino alla fine:
- Nessun errore, nessuna feature non richiesta, codice pulito e leggibile; testare ogni cosa in isolamento e poi tutto insieme.
- Frontend: skill `impeccable` + `design-taste-frontend` (anti "AI slop"), Playwright per testare nel browser come un tester.
- Usare `claude-automation-recommender` (skill ufficiale di setup Claude Code) per analizzare il progetto e proporre skill/hook/MCP.
- Cartella `business/` con feature innovative, competitor e piano di lancio a costo zero: **già fatta** (commit c15dbdb), non toccare.
- Prima di dichiarare "fatto": lint + typecheck + test (+ build + E2E per il web) verdi, con evidenza in output.

## Riepilogo del progetto per argomento (stato al 2026-10-17)

### 1. Cos'è e dove siamo
- Web app per ASD (per ora pallavolo): "Ordine. Efficienza. Una sola app." Backend API-first (una futura app mobile riuserà le stesse API), frontend che parla solo via HTTP `/api/v1`.
- Tutti i moduli della SPEC sono costruiti, Fase 2 compresa. Restano solo rifiniture (vedi "Da fare").
- 5 giorni di lavoro (12-17 ottobre 2026), 45 commit. Branch: `develop` (lavoro), `prod` (deploy), `master` (residuo). Remoto `github.com/Mikirucci/SuiteASD`. **Il commit 999ae2a è locale: `develop` è avanti di 1 sul remoto, da pushare.**

### 2. Backend (`apps/api`)
- Fastify + TypeScript strict, Prisma 6 su SQLite, Zod, OpenAPI da Zod (Scalar su `/docs/`). 152 file sorgente, 45 tabelle, 47 file di test (931 test).
- Moduli: auth, members, documents, fees, events, convocations, attendance, competitions, evaluations, notifications, automations, announcements, referees, statistics, venues, sponsors, trips, kits, staff, ledger, attachments, enrolment, reports, guardian-links, invitations, devices, health.
- Convenzioni: paginazione a cursore, errori RFC 7807, `Idempotency-Key` sui pagamenti, date ISO UTC, importi in centesimi. Ogni endpoint ha Zod, permesso per ruolo, isolamento per `societyId`, schema OpenAPI.

### 3. Sicurezza, ruoli, multi-tenant
- JWT di accesso 15 min + refresh opaco ruotato (il riuso revoca la sessione), argon2id, magic link, inviti per ruolo monouso (7 giorni).
- Ruoli: Admin, Segreteria, Allenatore, Staff, Atleta, Genitore; matrice unica `risorsa:azione` in `apps/api/src/rbac/permissions.ts`.
- Isolamento tenant con client Prisma riscritto (le risorse di altre società rispondono 404). Rate limit, helmet, CORS configurabile.
- Rischi dichiarati: rate limit in memoria (una sola istanza), nessuna cifratura a riposo dei dati sensibili, nessun 2FA.

### 4. Frontend (`apps/web`)
- Next.js 16 (App Router), Tailwind, React Query, React Hook Form + Zod. 291 file sorgente, 71 file di test (722 test).
- Aree: amministrazione `/`, area personale `/area-personale`, pubblica `/iscrizione/[code]`, vetrina `/design`. La shell cambia navigazione per area (`ShellNavigation`); chi ha entrambi i ruoli ha un link per passare da un'area all'altra.
- Design: token in un solo posto, palette blu elettrico + verde menta, UI italiana, stati loading/vuoto/errore, responsive da 320px, WCAG AA.

### 5. Moduli di amministrazione (SPEC 01-08)
Tesserati (filtri, chip documenti, import/export CSV), Scadenze (timeline), Quote (piani, pagamenti idempotenti, ricevute PDF numerate da n. 0144 nei dati demo), Calendario (convocazioni, presenze, export iCal, import .ics), Classifiche (derivate al volo dalle partite, import CSV), Pagelle (invariate, da eliminare in futuro), Notifiche (in-app + email in coda, preferenze), Automazioni (dashboard, log, impostazioni).

### 6. Moduli secondari ("Altro")
Palestre, trasferte, divise, sponsor, bilancio, staff, tornei, arbitri, bacheca, statistiche. Allegati (PDF/JPG/PNG fino a 5 MB) su palestre, sponsor, trasferte, divise, staff, arbitri, voci di bilancio. Report PDF per il commercialista in Bilancio (periodo, completo o per sezione): controllato a vista.

### 7. Fase 2 (richieste del 16/10)
Principio: tutto automatico. Iscrizione da link generato dall'admin (nessuna approvazione, sotto i 14 anni solo tramite genitore); area personale atleta/genitore (home, documenti con upload, pagamenti, calendario con risposta alle convocazioni, classifica, notifiche, profilo con dati/password/figli); notifiche organizzative per admin e segreteria; home admin come cruscotto con anteprime. Decisioni D-20..D-25 in `DECISIONS.md`.

### 8. Automazioni (10)
- Pianificate: quote, certificati, documenti mancanti, invio convocazioni, recapito notifiche (ogni 10 min), riepilogo per l'amministrazione, sponsor in scadenza.
- A evento: classifiche (sempre attive), ricevute, avvisi all'amministrazione.
- Ora (fuso di Roma) e canali (app, email) configurabili da UI; per recapitare serve il consenso sia dell'automazione sia dell'utente. Scheduler in-process (`node-cron`), idempotente, con log delle esecuzioni.

### 9. Test e qualità
- 1.653 test unitari (api 931 + web 722). E2E Playwright solo Chromium: 110 con API simulata (con axe WCAG e prove a 320px) e 18 su API vera con DB temporaneo e seed (incluso il flusso iscrizione da link -> upload certificato -> compare tra i tesserati e nelle notifiche admin).
- Il 17/10 sono stati rimossi 4 test "atleta sulle pagine admin" (non più raggiungibili, D-20), sostituiti dal test di reindirizzamento e da `e2e/area-personale.spec.ts`.
- Bug corretti il 17/10: periodo del report in UTC (di notte slittava al giorno prima), segno meno non rendibile nel PDF, ricerca Tesserati troncata sotto 1280px, selettore `Sezioni` ambiguo.

### 10. Dati demo
- Società Aquile Volley, 118 tesserati, 6 squadre, Serie D girone B (Aquile 32, Falchi 31, Delfini 30, Leoni 24, Tigri 19), partita Aquile-Delfini sabato 14 novembre 2026 alle 20:30 con 5/12 conferme, quota novembre 60 euro con 240 euro incassati.
- Credenziali: password `Demo1234!`; `admin@`, `segreteria@`, `allenatore@`, `staff@`, `atleta@` (Giulia Rossi), `genitore@` (genitore di Sara Conti) + `aquilevolley.it`. Link di iscrizione demo: `/iscrizione/iscrizione-demo-u16`.
- La data della partita è fissata dalla SPEC: dopo il 14 novembre 2026 vanno aggiornati seed ed E2E reali di calendario/ruoli.

### 11. Business e lancio (`business/`, non toccare)
- Il mercato non è vuoto: almeno 6 gestionali italiani gratis o economici (Golee dichiara 7.000+ società); il vero concorrente è WhatsApp + Excel. Differenziarsi su vita di squadra + amministrazione, esperienza genitori, automazioni visibili. Non competere su L.398, e-fattura, prezzo.
- Piano pilota: 3-5 società, 90 giorni dal 19/10/2026, go/no-go a fine settimana 8 e 13, perimetro ridotto (convocazioni e scadenze). Prezzo ipotizzato: Squadra gratis, Società 149-199 euro/anno flat (ipotesi da validare).
- Prossime feature consigliate: link senza login, import assistito, export per il commercialista (ora presente come PDF), scadenzario adempimenti, rollover di stagione, riconciliazione CSV.

### 12. Documentazione e processo
`docs/`: SPEC (addendum §9 = Fase 2), DECISIONS (D1-D8, CAL, M-1..M-9, D-20..D-25), API.md, FRONTEND.md, PROGRESS.md. Regole del team in `CLAUDE.md` (niente `any`, niente test indeboliti, nessuna feature fuori SPEC, UI italiana, codice in inglese).

### 13. Cose da sapere (rischi e anomalie)
1. La cartella `asserts_personal_row/` nella root è tracciata da git: contiene il video promo (~26 MB) e `loghi`. Nome probabilmente da correggere; il video pesa nel repo.
2. `vercel.json` descrive due progetti (web e API) ma l'API usa SQLite su file, upload su disco e scheduler in-process: su serverless non persisterebbero (non verificato). Per un deploy vero servono Postgres, storage S3, scheduler esterno.
3. Per la produzione mancano anche: cifratura dei dati sensibili, rate limit condiviso, chiave Resend (senza, le email sono `SKIPPED`), validazione fiscale delle ricevute da un commercialista.
4. Non implementati per scelta: push web, WhatsApp/SMS, pagamenti online, 2FA, scraping dei siti federali (si importa da file).

## Da fare (solo rifiniture, nessuna feature mancante della SPEC)
1. Push di `develop` sul remoto.
2. Dopo il 14 novembre 2026: aggiornare date del seed e E2E reali di calendario/ruoli.
3. Decidere se togliere la vista "solo i propri dati" per atleta/genitore nelle pagine admin (Tesserati, Scadenze, Pagelle), che ora serve solo ai ruoli misti, insieme alle pagelle (decisione dell'utente).
4. Raccomandazioni di claude-automation-recommender: presentate, NON applicate.
5. Valutare la cartella `asserts_personal_row/` e il percorso di deploy (punti 1-2 di "Cose da sapere").

## Note tecniche utili
- React Query riprova 2 volte le GET 500: nei test E2E degli errori il mock deve fallire 3 volte (poi "Riprova" ricarica).
- `getByRole("alert")` incontra anche il route announcer di Next: filtrare con `.filter({ hasText })`.
- `getByRole("navigation", { name: "Sezioni" })` combacia anche con "Altre sezioni" della home: usare `exact: true`.
- E2E: `npm run test:e2e` (API mockata) e `npm run test:e2e:real` (API vera + DB SQLite temporaneo con seed, `apps/web/e2e-real`, test in sequenza sullo stesso DB).
- Gli agenti frontend NON eseguono build/E2E (porta 3000/.next): li esegue il lead in serie.
- Nei file con CRLF modificare con script che normalizzano gli a capo; con il tool Bash evitare heredoc lunghi con apostrofi o backtick dentro `node -e` (usare Edit/Write).

## Comandi utili
- Dalla root: `npm run dev:api` e `npm run dev:web` (separati: `npm run dev` non trova npm-run-all finché non si fa `npm install`), `build|test|test:e2e|lint|typecheck`. API 4000, web 3000, documentazione API `http://localhost:4000/docs/`.
- Ambiente: Windows, shell Git Bash/PowerShell; Python non disponibile (usare Node per gli script).

## Registro (aggiungere in coda, più recente in fondo)
- 2026-10-12: fondazioni api+web, business/, 4 agenti backend in parallelo (interrotti dal limite d'uso).
- 2026-10-13: ripresa; creato questo file; diagnosi dello stato. Sistemati ical.ts, tipo di createNotification, lint dei test, `@@unique` su ReceiptSequence; committato 2466112 (api verde). Lanciati 5 agenti (backend calendario; backend notifiche/automazioni/arbitri/statistiche/seed; frontend tesserati+scadenze; quote; classifiche+pagelle).
- 2026-10-13 sera: ripresa dopo interruzione; sistemati lint test api, 6 E2E rossi (retry React Query, route announcer, nome accessibile trend-bars, auth spec); commit 7776eee (api) e aa561f6 (web). Agenti per calendario, notifiche, automazioni, altro-hub, tornei/arbitri/bacheca/statistiche.
- 2026-10-13 notte: 5 agenti frontend completati; aggiunto job convocation-dispatch; sistemati 2 E2E. Commit e9a3f53, cfbc931. Registrati i seed mancanti, creata la suite E2E su backend reale (109b6ee), docs aggiornati (98fd094), corretto lo sfarfallio dello switch automazioni; verifica finale completa.
- 2026-10-15: aggiunto `vercel.json` (a374352), merge della PR #1 da `prod`.
- 2026-10-16: magic link + orari/canali automazioni (692c594), badge notifiche e fix 320px (8092c44); poi Fase 2 completa lato codice (notifiche organizzative, iscrizione da link, allegati, report PDF, job nuovi, area personale, home admin, import da file), merge 318aa7e. Sospeso su richiesta dell'utente.
- 2026-10-17: Fase 2 chiusa e verificata (commit 999ae2a): E2E sistemati e ampliati, PDF e schermate controllati, docs SPEC/DECISIONS/API/FRONTEND aggiornati. Creato il riepilogo per argomento in questo file.
