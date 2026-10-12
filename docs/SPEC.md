# PROMPT DI SVILUPPO — SuiteASD

> Ruolo: sei un senior full-stack engineer + product designer. Devi progettare e realizzare **SuiteASD**, una **web app** (responsive) per la gestione completa di una società sportiva dilettantistica (ASD), con focus iniziale sulla **pallavolo**. **Ambito attuale: solo web app.** Un'app per smartphone (iOS/Android) verrà realizzata in futuro: per questo il backend deve essere **API-first**, con tutte le funzionalità esposte tramite API documentate (vedi sezione 5-bis), così che la futura app mobile le riusi senza modifiche al backend. Nessun codice nativo/mobile va scritto ora. Questo documento è la specifica completa. Dove un dettaglio non è specificato, scegli la soluzione più semplice e coerente e annotala in `DECISIONS.md`.

---

## 1. Visione e posizionamento

- **Nome:** SuiteASD (logo: "Suite" in nero + "ASD" in blu; icona app = pallone da pallavolo bianco su quadrato arrotondato blu con gradiente).
- **Tagline:** *"Ordine. Efficienza. Una sola app."*
- **Problema:** le società sportive amatoriali gestiscono tutto tra fogli Excel, chat WhatsApp, moduli cartacei, ricevute e post-it: iscrizioni, certificati medici, quote, convocazioni, classifiche, comunicazioni a genitori e atleti.
- **Promessa:** *"Tu pensi alla squadra. Al resto, l'app."* Tutte le attività ripetitive si gestiscono **da sole** (automazioni).
- **Lingua UI:** italiano (struttura i18n pronta per altre lingue). Valuta: EUR. Date in formato italiano.

## 2. Utenti e ruoli (RBAC)

| Ruolo | Cosa fa |
|---|---|
| **Admin / Presidente** | Configura la società, vede tutto, bilancio, sponsor, utenti |
| **Segreteria** | Tesserati, documenti, quote, ricevute |
| **Allenatore** | Squadre, allenamenti, convocazioni, presenze, pagelle, statistiche |
| **Dirigente accompagnatore / Staff** | Trasferte, divise, palestre, arbitri |
| **Atleta** | Vede calendario, conferma presenza, i propri documenti, pagamenti, pagelle |
| **Genitore** | Come atleta per i figli minorenni (account collegato a uno o più atleti) |

Multi-tenant: ogni società (tenant) ha dati isolati. Un utente può avere più ruoli e più figli collegati. Permessi applicati lato server, mai solo lato UI.

## 3. Moduli funzionali

Il video mostra 8 moduli principali + una griglia di moduli secondari. Per ognuno: scopo, schermate, regole, automazioni.

### 01 · Tesserati — *"Tutti i tesserati, in ordine."*
Anagrafiche, documenti e squadre in un'unica scheda.
- Elenco tesserati con **avatar a iniziali colorate** (colore deterministico dal nome), nome, **badge squadra** (U14, U16, U18, Serie D…) e **tre indicatori di stato documenti** (✓ verde = ok; ambra = in scadenza; rosso = mancante/scaduto) — es. certificato medico, modulo iscrizione, privacy/liberatoria.
- **Filtri a pill** per squadra: *Tutte, U14, U16, U18, Serie D…* (generati dalle squadre esistenti).
- **Barra riepilogo** in fondo: `118 tesserati · 6 squadre · 0 documenti mancanti` (calcolata live).
- Scheda tesserato: dati anagrafici, codice fiscale, contatti, genitori collegati, squadre, ruolo in campo, taglia divisa, documenti allegati (upload PDF/foto), storico pagamenti, presenze, pagelle.
- Ricerca, import da CSV/Excel (es. `Quote_2026.xlsx`, tesserati), export.

### 02 · Certificati e scadenze — *"Scadenze sotto controllo. In automatico."*
- Ogni documento con data di scadenza (certificato medico agonistico/non agonistico, tesseramento, assicurazione).
- **Timeline** mesi (OTT→MAR) con avatar dei tesserati posizionati alla data di scadenza.
- Card dettaglio: *"Sara Conti · Certificato medico — Scade tra 15 giorni"*.
- **Automazione:** job schedulato giornaliero che invia promemoria (push + email) all'atleta **e ai genitori** a soglie configurabili (es. 30/15/7 giorni e a scadenza avvenuta). Notifica: *"Promemoria inviato — A Sara e ai genitori, per il rinnovo."* con badge ⚡ AUTOMATICO.
- Regola: un atleta con certificato scaduto viene segnalato e **non convocabile** (override possibile da Admin con log).

### 03 · Quote e pagamenti — *"Quote incassate, senza rincorrere."*
- Piano quote per società/squadra (rate mensili, quota iscrizione, extra), importo per tesserato (es. "Quota novembre · € 60").
- Lista con stato per tesserato: **Pagato ✓ / In attesa / Scaduto**.
- Header riepilogo: *"Promemoria inviati · 4"* e *"Incassato € 240"*.
- **Automazione:** promemoria automatici prima della scadenza e solleciti dopo; **riconciliazione** pagamento (inizialmente registrazione manuale + metodo: contanti/bonifico/carta; predisporre integrazione Stripe/PayPal/Satispay come fase successiva).
- **Ricevute:** generazione automatica PDF numerata progressiva (es. "Ricevuta n. 0147"), inviata via email al pagante, archiviata nella scheda.

### 04 · Calendario e convocazioni — *"Partite e convocazioni, già organizzate."*
- **Striscia settimanale** (LUN 9 … DOM 15) con giorno selezionato evidenziato e **pallino verde** nei giorni con eventi.
- Card evento partita: `SERIE D · GIRONE B · GIORNATA 6` / **Aquile Volley vs Delfini Volley** / *Sabato 14 novembre · 20:30 · Palazzetto*.
- Eventi: partite, allenamenti, tornei, riunioni. Ricorrenza per allenamenti (es. giovedì 19:00), spostamento/annullamento con notifica automatica (*"Allenamento spostato — Giovedì alle 19:00"*).
- **Convocate/i:** griglia avatar (12 posti per volley) con barra di avanzamento **"5/12 confermate"**; check verde sull'avatar a conferma presenza. Atleti/genitori confermano/declinano dall'app (con motivazione opzionale).
- **Automazione:** le convocazioni vengono **inviate automaticamente** (badge ⚡ INVIATE IN AUTOMATICO) a N giorni dalla gara, con promemoria ai non rispondenti. Notifica: *"Convocazione — Sabato 20:30 · conferma presenza"*.
- Presenze agli allenamenti (check-in rapido dell'allenatore) con storico e percentuale.
- Export/sync calendario (iCal/Google Calendar).

### 05 · Gironi e classifiche — *"Classifiche che si aggiornano da sole."*
- Gestione campionati: stagione → campionato → girone → giornate → partite, squadre avversarie.
- **Inserimento risultato** (es. Aquile Volley **3–1** Delfini Volley, set per set opzionale).
- **Classifica ricalcolata automaticamente** con animazione di riordino (la squadra sale di posizione), righe: posizione, avatar squadra, nome, **punti (PT)**. Evidenzia la nostra squadra. Badge *"✓ Classifica aggiornata in automatico"*.
- Regole punteggio pallavolo configurabili (3–0/3–1 → 3 pt vincente, 0 perdente; 3–2 → 2/1; parametrizzabile per altri sport), spareggi (quoziente set, quoziente punti).

### 06 · Pagelle e statistiche — *"Ogni partita, ogni giocatrice."*
- Dopo ogni gara l'allenatore assegna **voto** (scala 1–10 con decimali, es. 8,5) e note a ogni giocatrice.
- Card giocatrice: avatar, nome, **ruolo** (Schiacciatrice, Libero, Centrale, Palleggiatrice, Opposto), **anello di progresso** col voto (colore per fascia), badge **★ MVP** alla migliore.
- **Statistiche gara** per giocatrice con barre: Attacchi vincenti, Ace, Muri (estendibile: ricezioni, errori, battute…).
- Aggregati stagionali, andamento nel tempo, confronto. Pubblicazione pagella → notifica *"Pagella pubblicata — Aquile 3–1 Delfini · voto 8,5"*. Visibilità configurabile (atleta/genitore vedono solo la propria).

### 07 · Notifiche automatiche — *"Avvisi a tutti, al momento giusto."*
- Canali: **push (PWA/web push)**, email, in-app (centro notifiche); predisporre WhatsApp/SMS come opzionale.
- Template per: convocazione, quota in scadenza, certificato in scadenza, allenamento spostato, pagella pubblicata, comunicazioni bacheca.
- Preferenze utente per canale/tipo; code, retry, deduplicazione, log di invio. Destinatari risolti per ruolo (atleta + genitori + staff).

### 08 · Gestione delegata — *"Tu pensi alla squadra. Al resto, l'app."*
- **Dashboard "Attività gestite dall'app"** con percentuale (es. 17% → 100%) e checklist di automazioni, ognuna con badge ⚡ AUTOMATICO e stato (in corso/completata):
  1. Ricordare le quote
  2. Controllare i certificati
  3. Inviare le convocazioni
  4. Aggiornare le classifiche
  5. Emettere le ricevute
  6. Avvisare atleti e genitori
- Ogni automazione è attivabile/disattivabile e configurabile (soglie, orari, canali), con **log di esecuzione** consultabile. La percentuale = automazioni attive / totali.

### Moduli secondari — *"Tutto quello che serve, in un posto solo."*
Griglia 3×4 nella home "Altro". Implementare in fasi successive (MVP minimo = lista + CRUD base):
**Presenze** · **Documenti** (archivio, modulistica da firmare) · **Palestre** (impianti, indirizzi, disponibilità/orari) · **Trasferte** (organizzazione, auto/pulmino, costi) · **Divise** (taglie, magazzino, assegnazioni) · **Sponsor** (contratti, scadenze, importi) · **Bilancio** (entrate/uscite, categorie, report) · **Statistiche** (dashboard società) · **Bacheca** (comunicazioni/annunci, sostituisce chat caotiche) · **Staff** (allenatori, dirigenti, qualifiche) · **Tornei** · **Arbitri** (designazioni, rimborsi).

## 4. Design system (derivato dal video)

- **Stile:** moderno, pulito, "glass/soft": sfondo chiaro con **gradienti sfumati blu→verde menta** molto tenui e griglia di puntini sottile; card bianche con angoli molto arrotondati (≈16–24px) e ombra morbida; molto spazio bianco.
- **Colori:** primario **blu elettrico** (~`#3B5BFF`, gradiente sull'icona), testo **blu notte/nero** (~`#111827`), successo **verde** (~`#10B981`, usato per ✓, "Pagato", "AUTOMATICO"), warning **arancione** (scadenze), accenti per avatar (ambra, rosa, verde acqua, viola, arancio, ciano, rosso, lime, indaco), MVP **oro**.
- **Tipografia:** sans geometrica moderna (es. *Plus Jakarta Sans* / Inter), titoli bold con tracking stretto; **parola chiave del titolo evidenziata con sottolineatura verde menta** (es. "in ordine.").
- **Componenti ricorrenti:** avatar a iniziali colorate, badge squadra grigio chiaro, pill filtro (attiva = blu pieno bianco, inattiva = bianca), chip di stato verdi ("Pagato ✓"), tag "⚡ AUTOMATICO", anelli di progresso circolari, barre di progresso, timeline, card "notifica iOS-like", numerazione sezioni (badge blu `01`…`08`) + etichetta uppercase blu.
- **Motion:** transizioni morbide (fade/slide), riordino animato delle classifiche, riempimento progressivo di barre/anelli, comparsa a cascata delle liste. Rispetta `prefers-reduced-motion`.
- **Layout:** web app **responsive** (il video è 9:16, quindi progetta prima la vista stretta e poi scala a desktop): sidebar su desktop, navigazione compatta su schermi piccoli; dark mode opzionale; accessibilità WCAG AA (contrasti, focus, label, tap target ≥44px).

## 5. Architettura tecnica (default consigliato, modificabile)

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui; Framer Motion per le animazioni. Il frontend consuma **le stesse API pubbliche** che userà l'app mobile (niente logica di business o accessi diretti al DB nel frontend). PWA/Web Push rimandati.
- **Backend:** servizio API separato e indipendente dal frontend (es. NestJS o Fastify, REST + OpenAPI; **no tRPC**, perché legato a un client TypeScript); **PostgreSQL** (Prisma o Drizzle) con **Row-Level Security / tenant_id** su ogni tabella; storage file S3-compatibile per documenti.
- **Auth:** **token-based** (access token JWT breve + refresh token ruotato) utilizzabile sia dal web sia da un client mobile; email+password e magic link, 2FA opzionale, inviti per ruolo; collegamento genitore↔atleta.
- **Job/automazioni:** scheduler + coda (es. BullMQ/Redis o pg-boss) per promemoria, convocazioni, ricevute, ricalcolo classifiche; ogni job idempotente e loggato.
- **Email:** Resend + React Email per template. **PDF:** ricevute e moduli.
- **Qualità:** test unitari su regole di business (classifica, scadenze, soglie), test e2e sui flussi chiave, CI, migrazioni versionate, seed demo.

### 5-bis. Requisiti API (per la futura app smartphone)

- **REST JSON** versionato (`/api/v1/...`), con specifica **OpenAPI 3** generata e sempre aggiornata, UI Swagger/Scalar su `/docs`; da qui si potranno generare i client mobile.
- **Ogni funzione della UI web deve avere un endpoint**: la web app non può fare nulla che le API non permettano.
- Autenticazione Bearer (vedi sopra), selezione della società (tenant) dal token, autorizzazione per ruolo su ogni endpoint.
- Convenzioni uniformi: paginazione a cursore, filtri/ordinamento, errori standard (RFC 7807), idempotency key sulle operazioni di scrittura sensibili (pagamenti, invii), date ISO 8601 UTC, `ETag`/`updated_at` per sincronizzazione.
- Upload file via URL pre-firmati (documenti, avatar); notifiche: modello `Notification` + endpoint di **registrazione device token** (`POST /devices`) già previsto, anche se il push mobile verrà implementato più avanti.
- Rate limiting, CORS configurabile, versioning e deprecazione documentati, test di contratto sugli endpoint.

### Modello dati (entità principali)
`Society(tenant)`, `User`, `Role/Membership`, `Member(tesserato)`, `Guardian↔Member`, `Team`, `TeamMembership`, `Document`/`DocumentType` (con `expires_at`), `FeePlan`, `Payment`, `Receipt`, `Event`(tipo: partita/allenamento/torneo), `Convocation`/`Attendance`, `Season`, `Competition`, `Group`, `Match`, `Standing`(derivata), `PlayerEvaluation`, `PlayerMatchStats`, `Notification`/`NotificationLog`/`Preference`, `Automation`/`AutomationRun`, `Venue`, `Trip`, `Kit`, `Sponsor`, `LedgerEntry`, `Announcement`, `Referee`, `StaffMember`.

## 6. Dati demo (seed, coerenti con il video)

Società "Aquile Volley". Squadre: U14, U16, U18, Serie D (+2). Tesserati: Anna Ferri (U18), Chiara Neri (U16), Elena Russo (Serie D), Giulia Rossi (Serie D, Schiacciatrice, voto 8,5 MVP), Marta Bianchi (U18), Sara Conti (U16, Libero, certificato in scadenza tra 15 gg), + altri fino a 118. Girone B Serie D: Falchi Volley 31, Delfini Volley 30, Aquile Volley 32 (dopo 3–1 sui Delfini), Leoni Volley 24, Tigri Volley 19. Partita: Aquile vs Delfini, sab 14 novembre 20:30, Palazzetto. Quota novembre €60 per atleta.

## 7. Piano di consegna

1. **Fase 0** — Setup repo, design tokens/componenti base, auth, multi-tenant, RBAC, seed.
2. **Fase 1 (MVP)** — Moduli 01 Tesserati, 02 Certificati, 03 Quote/Ricevute, 04 Calendario/Convocazioni, 07 Notifiche.
3. **Fase 2** — 05 Gironi/Classifiche, 06 Pagelle/Statistiche, 08 Dashboard automazioni.
4. **Fase 3** — Moduli secondari (Presenze avanzate, Documenti, Palestre, Trasferte, Divise, Sponsor, Bilancio, Bacheca, Staff, Tornei, Arbitri), pagamenti online, WhatsApp.
5. **Futuro (fuori ambito ora)** — App smartphone che riusa le API v1, push nativo, PWA.

## 8. Come lavorare

- Prima di scrivere codice: proponi struttura cartelle, schema DB e piano della Fase 0; attendi conferma.
- Procedi per fasi/moduli piccoli, ognuno funzionante e testato; commit chiari.
- Non inventare requisiti: segna le ipotesi in `DECISIONS.md` e fai domande solo se bloccanti.
- Ogni automazione deve essere visibile, spiegabile e disattivabile dall'utente.
- Privacy/GDPR: dati di minori e certificati medici sono **dati sensibili** → minimo accesso, cifratura a riposo, consensi, log accessi, diritto all'oblio/export.
