# Stato di avanzamento SuiteASD (file di memoria del progetto)

> Leggere questo file all'inizio di ogni conversazione. Va aggiornato a ogni tappa e **obbligatoriamente prima di esaurire i token**.
> Regole del team: `CLAUDE.md`. Specifica: `docs/SPEC.md`. Decisioni: `docs/DECISIONS.md`. Guide: `docs/API.md`, `docs/FRONTEND.md`.

Ultimo aggiornamento: 2026-10-21 (fine giornata). Branch di lavoro: `feature/collaudo-giro-2` (pushato) già fuso in `develop` in locale (merge c515e31); `develop` sul remoto non è ancora stato pushato. Ultimo giro: refactoring delle schermate a gruppi e card minimali (Tesserati D-41, Squadre D-42/D-43, Staff e liste "Altro" D-44), inviti senza email con scheda Staff e avviso all'amministrazione (D-45), prima Pagamenti/Scadenze/Divise (D-37..D-40). Prodotto completo secondo SPEC + riordino UX (D-26..D-31) + collaudo dell'utente (D-32..D-36). Verifica a fine giornata: lint e typecheck puliti; api 1035 test, web 1113 unit; E2E mock su build di produzione 133/133; E2E su backend reale 37/37. Falle e collaudo a persone: `tasks/findings.md`; piano: `tasks/plan.md`. In attesa per scelta dell'utente: home admin, tornei, pagelle, classifiche.

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
Da riprendere alla prossima sessione (in ordine):
1. Refactoring schermate, si prosegue con lo stesso schema (riepilogo a tessere, una riga di ricerca/filtri/azione, card minimali con un solo menu azioni, card della stessa altezza): fatte Tesserati, Squadre, Staff e liste "Altro", Pagamenti, Scadenze, Divise. Da concordare con l'utente la prossima: scheda del singolo tesserato, Calendario, Notifiche, Home.
2. Squadra: "Vedi tutti gli appuntamenti" porta al calendario senza filtro per squadra; l'utente ha detto "a quella cosa penseremo dopo".
3. Inviti: l'invio automatico di una email ben formattata resta da fare con la gestione delle email (oggi senza chiave Resend le email sono `SKIPPED`); fino ad allora il link lo manda chi invita (D-45).
4. Foto dei tesserati: nella SPEC non c'è un campo foto, le card usano l'avatar con le iniziali. Aggiungerla solo se l'utente lo chiede.
5. Push di `develop` sul remoto (è avanti di 13 commit) quando l'utente lo decide; per nuovo lavoro creare un branch da `develop`.
6. Dopo il 14 novembre 2026: aggiornare date del seed e E2E reali di calendario/ruoli.
7. Decidere se togliere la vista "solo i propri dati" per atleta/genitore nelle pagine admin (Tesserati, Scadenze, Pagelle), che ora serve solo ai ruoli misti, insieme alle pagelle (decisione dell'utente).
8. Raccomandazioni di claude-automation-recommender: presentate, NON applicate.
9. Valutare la cartella `asserts_personal_row/` e il percorso di deploy (punti 1-2 di "Cose da sapere").

## Note tecniche utili
- React Query riprova 2 volte le GET 500: nei test E2E degli errori il mock deve fallire 3 volte (poi "Riprova" ricarica).
- `getByRole("alert")` incontra anche il route announcer di Next: filtrare con `.filter({ hasText })`.
- `getByRole("navigation", { name: "Sezioni" })` combacia anche con "Altre sezioni" della home: usare `exact: true`.
- E2E: `npm run test:e2e` (API mockata) e `npm run test:e2e:real` (API vera + DB SQLite temporaneo con seed, `apps/web/e2e-real`, test in sequenza sullo stesso DB).
- Gli agenti frontend NON eseguono build/E2E (porta 3000/.next): li esegue il lead in serie.
- Nei file con CRLF modificare con script che normalizzano gli a capo; con il tool Bash evitare heredoc lunghi con apostrofi o backtick dentro `node -e` (usare Edit/Write).
- Avvio dei server per la sessione successiva: lanciarli staccati (`Start-Process cmd.exe /c "npm run dev -w apps/api > api.log 2>&1"`, idem per `apps/web`) con i log su file; i server nati dalla shell dell'agente si chiudono quando la memoria è scarsa e il dev server di Next lasciato con lo stdout chiuso dà "Jest worker ... exceeding retry limit" (EPIPE). Gli E2E su build di produzione (`npm run test:e2e`) e quelli reali (`test:e2e:real`) vogliono le porte 3000/4000 libere. Dopo una migrazione Prisma fermare l'API prima di `prisma generate` (EPERM su Windows).
- Il menu a tendina dentro un dialogo deve essere `<DropdownMenu modal>`; nei test jsdom i menu modali lasciano `pointer-events: none` sul body (ripulirlo nel cleanup). Helper di test: `src/test/row-menu.ts` (`pickFromMenu`).
- Le notifiche hanno una riga per canale (IN_APP ed EMAIL): nei test filtrare per `channel: 'IN_APP'`.

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
- 2026-10-17 (sera): su richiesta dell'utente (collaudo manuale da zero: menu confuso, home ammassata, squadre e notifiche, onboarding poco chiaro) riordino UX fatto da team di agenti con perimetri disgiunti: menu a gruppi con voci filtrate dai permessi e hub "Altro" tolto; pagine Squadre, Accessi e inviti, accettazione invito (`/invito/[token]`, con nuovo `GET /invitations/:token` pubblico); registrazione società in 2 passi e iscrizione atleta in 3; home a 3 livelli con percorso "Per iniziare"; notifiche: aggiornamento al focus/30 s e bacheca programmata notificata. Collaudo a persone (Rita presidente, Davide allenatore, Elena genitore di Sara, Luca segreteria) sul backend vero con società creata da zero: percorso completo funzionante, 8 difetti trovati e corretti (F13, F15-F19). Metodo: vedi memoria `feedback-collaudo-con-persone`.
- Da sapere: `DELETE /teams/:id` non è bloccato se la squadra ha tesserati/eventi (la conferma avvisa); gli inviti non partono per email (li manda chi invita); l'atleta non riceve notifica per quota creata o pagamento registrato (non previsto dalla SPEC).
- Ambiente Windows: per `npm run build`/`typecheck` (prisma generate) fermare prima i server di sviluppo, anche il processo `tsx watch` che può restare vivo senza risultare sulla porta 4000.
- 2026-10-17 (notte): collaudo dell'utente su admin e atleta. Fatto da team di agenti (API-1 convocazioni automatiche, API-2 "Ho pagato" e ricevute, FE-A documenti, FE-B squadre, FE-C statistiche, FE-D home atleta e pannello convocazioni, FE-E pagamenti) con perimetri disgiunti e verifiche del lead: migrazione `payment_claim` (`Payment.claimedAt`), nuovo `convocations/auto.ts`, seed con risposte sugli allenamenti futuri. Collaudo a persone (Gianni, Marco): E2E reale `06-documenti-e-pagamenti`. Il lead ha corretto: mock E2E al nuovo contratto delle quote, pannello "Da confermare" limitato alle 5 più vicine, titolo del documento senza ripetizioni. Commit su un branch dedicato (non develop né prod), senza push.
- Da sapere (giro 2): lo staff di squadra non è nel dettaglio squadra (l'API non lo espone); il titolo della pagina Pagamenti per l'atleta è ancora quello dell'amministrazione; la colonna Quota della rosa è stretta; `apps/api/prisma/dev.db` non è stato azzerato (per avere le risposte agli allenamenti del nuovo seed serve un reset, che decide l'utente).
- 2026-10-19: richieste dell'utente dopo il collaudo. (1) Stato documenti: senza file allegato il documento è Mancante, non In regola (API `statusOfDocument`/`pickCurrentDocument`, indicatori, statistiche); le righe documento hanno "Apri" e un menu "Altre azioni" (nuovo `DropdownMenu` su `@radix-ui/react-dropdown-menu`, non modale). (2) Pagamenti: pagina a piani con rendiconto, card con tre anteprime e dettaglio piano con persone in griglia, ricerca e filtri (`GET /fee-plans/report`, `/fee-plans/:id/people`). (3) Stessa logica per Scadenze e documenti (card per tipo, `/scadenze/[id]`) e Divise (card per capo, `/altro/divise/[item]`, `GET /kits/groups`). (4) Costi di palestre, divise e trasferte come uscite collegate del bilancio (migrazione `cost_ledger_links`). Test: api 52 file, web 91 file verdi; E2E aggiornati (quote, scadenze, altro, tesserati, area personale). Da sapere: `npm run dev` dalla root richiede `npm install` (manca `npm-run-all`); "Scarica" dei documenti è nel menu e nell'anteprima.
- 2026-10-21: ripasso dei messaggi dell'utente. Pagamenti: ogni persona mostra il totale ancora da pagare su tutti i piani (`allPlansDueCents` in `GET /fee-plans/:id/people`, test API aggiunto), con la quota del piano aperto in seconda riga; il badge resta quello del piano. La "foto" è l'avatar con le iniziali: i tesserati non hanno un campo foto in SPEC. Test: api 1010, web 1093.
- 2026-10-21 (refactoring schermate, 1/n): Tesserati riordinata (D-41): riepilogo a tessere in alto, "Persone" con Nuovo tesserato e menu Altre azioni, ricerca e filtri, card in griglia al posto delle righe. Componenti: `member-card.tsx`, `members-summary.tsx` (tolti `member-row.tsx` e `members-summary-bar.tsx`). Test aggiornati: unit (menu azioni, riepilogo prima della lista), E2E mock e reali (apertura del menu prima di Link di iscrizione e Importa CSV). Verifica: web 1094 unit, E2E reali 35/35, lint e typecheck puliti. Prossimo passo da concordare: la scheda del singolo tesserato.
- 2026-10-21 (refactoring schermate, 2/n): Squadre riordinata (D-42): conteggio e Nuova squadra in alto, ricerca solo per nome, genere a pillole colorate (filtro categoria tolto), card tutte della stessa misura con monogramma colorato per genere e prossimo evento su una riga. `PillOption` ha ora `dotClassName`. Verifica: web 1096 unit, E2E mock su build di produzione 130/130, lint e typecheck puliti.
- 2026-10-21 (refactoring schermate, 3/n): Squadre rivista (D-43): card con solo il nome e gli impegni della settimana, una riga con ricerca/genere/nuova squadra, form rapido "Aggiungi atleti" nella pagina della squadra. Nuovo endpoint `POST /teams/:id/members` con test (7). Componenti: `add-members-dialog.tsx`; `Select` ha `hideLabel`; tolti monogramma, categoria e filtro categoria.
- 2026-10-21 (refactoring schermate, 4/n): tabella della rosa nella pagina squadra: schede Appuntamenti e Quote sopra la rosa (la tabella usa tutta la larghezza), celle su una sola riga (`nowrap` per colonna e `scrollX` in `DataTable`, con scorrimento laterale invece del taglio), trattino con testo per screen reader per ruolo, maglia e quota mancanti. Test: unit web 1101, E2E mock sulla rosa (altezza righe uguale, nessun taglio, accessibilità). Non rilanciata la suite E2E completa.
- 2026-10-21 (refactoring schermate, 5/n): schede della pagina squadra più leggere: i prossimi appuntamenti sono 3 (da adesso in poi, ordinati per data), su due righe ciascuno; i pulsanti "Apri il calendario" e "Apri le quote" sono diventati richiami a testo con freccia ("Vedi tutti gli appuntamenti", "Apri le quote"), fissati in fondo alla scheda; le due schede hanno la stessa altezza. Test: squadre 66 unit passati, lint e typecheck puliti.
- 2026-10-21 (refactoring schermate, 6/n): scheda "Quote della squadra": Incassato e Da incassare uno sotto l'altro con l'etichetta sopra il valore, caratteri più grandi (etichetta 14, valore 24) e una linea leggera in mezzo, per riempire lo spazio accanto agli appuntamenti. Test squadre 66 passati, lint e typecheck puliti.
- 2026-10-21 (refactoring schermate, 7/n): Staff e tutte le liste "Altro" (palestre, sponsor, trasferte, bilancio, divise) rifatte con gli stessi componenti (D-44): una riga con ricerca, filtro a tendina e nuovo; card con un solo menu azioni; Staff a griglia a due colonne; allegati con campo e pulsante allineati, "Apri" per l'anteprima e menu Scarica/Elimina. Corretto un difetto visto solo nel browser vero: il menu dentro il dialogo degli allegati non si apriva (ora modale). Verifica: web 1105 unit, E2E mock su build di produzione 132/132, E2E su backend reale 36/36, lint e typecheck puliti.
- 2026-10-21 (inviti): gli inviti sono link per ruolo senza email (D-45): nota facoltativa "Per chi è", la persona scrive nome, email e password; chi accetta come amministratore, segreteria, allenatore o staff compare in Staff e l'amministrazione riceve l'avviso "Nuovo collaboratore". Migrazione `invitation_without_email` (email e label sull'invito, recupero degli Staff già entrati). Verifica: api 1035 test, web 1113 unit, E2E mock su build di produzione 133/133, E2E su backend reale 37/37 (con il nuovo passaggio: Davide accetta, Rita lo trova in Staff e nelle notifiche).
