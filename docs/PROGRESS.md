# Stato di avanzamento SuiteASD (file di memoria del progetto)

> Leggere questo file all'inizio di ogni conversazione. Va aggiornato a ogni tappa e **obbligatoriamente prima di esaurire i token**.
> Regole del team: `CLAUDE.md`. Specifica: `docs/SPEC.md`. Decisioni: `docs/DECISIONS.md`. Guide: `docs/API.md`, `docs/FRONTEND.md`.

Ultimo aggiornamento: 2026-10-13 (notte). PRODOTTO COMPLETO secondo SPEC. Verifica finale eseguita: lint e typecheck puliti; test api 731 + web 582; build ok; E2E mockati 106/106; E2E su backend reale (seed demo) 15/15.

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

### Da fare (solo rifiniture, nessuna feature mancante della SPEC)
1. Limiti noti: badge notifiche non lette nella shell omesso; WeekStrip a 320px ~37px di larghezza (<44px); cross-import tra feature (usePermission, saveFile, useCursorQuery, formatEuro da quote/tesserati) da promuovere in lib/; orari/canali per automazione non configurabili (vedi DECISIONS M-5).
2. Dopo il 14 novembre 2026 i dati demo (partita fissata dalla SPEC) richiedono di aggiornare le date del seed e gli E2E reali di calendario/ruoli.
3. Raccomandazioni di claude-automation-recommender: presentate all utente, NON applicate (la skill e in sola lettura e l utente chiedeva di proporre).

## Note tecniche utili
- React Query riprova 2 volte le GET 500: nei test E2E degli errori il mock deve fallire 3 volte (poi "Riprova" ricarica).
- `getByRole("alert")` incontra anche il route announcer di Next: filtrare con `.filter({ hasText })`.
- E2E: `npm run test:e2e` (API mockata) e `npm run test:e2e:real` (API vera + DB SQLite temporaneo con seed, apps/web/e2e-real).
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
- 2026-10-13 notte: registrati i seed competitions/fees/secondary (mancavano in run.ts) e collegata la partita in evidenza all evento; creata la suite E2E su backend reale (109b6ee); docs/API.md e DECISIONS.md aggiornati (98fd094); corretto sfarfallio dello switch automazioni; verifica finale completa.
- 2026-10-16: verificato e committato il lavoro in sospeso (692c594 api: magic link + impostazioni orari/canali automazioni; 8092c44 web: badge notifiche, formattatori in lib, fix 320px). lint/typecheck/test api 787 + web 593, E2E mockati 109/109, E2E reali 15/15.

## Fase 2: richieste dell'utente del 2026-10-16 (decisioni, vedi DECISIONS.md D-20..)
Parte amministrazione + nuova AREA PERSONALE (atleta/genitore). Principio: tutto automatico (l'atleta carica il certificato -> compare in admin con scadenza e stato aggiornati; reminder via job).
Ordine di lavoro e stato (aggiornare le caselle):
- [x] 1. Tesserati: filtri (senza squadra, stato documenti, genere, ruolo, anno) + chip "N documenti mancanti" rosso / "In regola" verde (api: noTeam/gender/fieldRole/birthYear, export con documentStatus)
- [x] 2. Notifiche: tipi organizzativi per admin/segreteria (pagamenti, scadenze, nuove iscrizioni, documenti caricati), niente notifiche da atleta all'admin
- [ ] 3. Iscrizione: link/codice generato dall'admin (per squadra, scadenza, usi), registrazione dall'area personale, NESSUNA approvazione
- [ ] 4. Allegati su palestre, sponsor, trasferte, divise, staff, arbitri, voci bilancio
- [ ] 5. Report PDF per il commercialista (complessivo e per singola sezione) in Bilancio
- [ ] 6. Automazioni: eventi (documento caricato, pagamento, iscrizione) + job reminder personalizzati (documenti mancanti all'atleta, riepilogo admin, sponsor in scadenza)
- [ ] 7. Home admin come dashboard con anteprime dei servizi
- [ ] 8. Calendario/classifiche: import da file iCal/CSV/Excel o URL; fallback manuale; se non fattibile classifiche in standby
- [ ] 9. Area personale atleta/genitore (profilo, documenti con upload, pagamenti, convocazioni, calendario, classifica, notifiche, iscrizione figli)
- Pagelle: invariata (da eliminare in futuro). Quote: invariata.
