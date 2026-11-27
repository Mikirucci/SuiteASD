# SuiteASD e GDPR — analisi, requisiti e checklist di prodotto

> **Avvertenza.** Questo documento è un'analisi tecnica e organizzativa preparata dal team di sviluppo. **Non è un parere legale** e non sostituisce un avvocato o un DPO. Ogni testo (informativa, nomina a responsabile, procedura) è una **bozza da far validare** prima dell'uso con dati reali. Dove una norma o un fatto non è stato verificato su una fonte ufficiale, è scritto `[DA VERIFICARE]` e indicato come verificarlo.
>
> Data di redazione e di consultazione delle fonti: **22 novembre 2026**. Stato del codice analizzato: frontend `develop` (commit 9563e2e) e backend `SuiteASD-backend` (schema Flyway al 22/11/2026, migrazione `V202611221100`).

> **Piano operativo:** questa ricerca è stata unita a quella del titolare del progetto in [docs/gdpr/PIANO-UNICO.md](gdpr/PIANO-UNICO.md), che elenca le decisioni, le pagine che ne derivano e il lavoro sul prodotto.

Allegati (cartella `docs/gdpr/`):

| File | Contenuto |
| --- | --- |
| [informativa-privacy.md](gdpr/informativa-privacy.md) | Bozza di informativa (società → interessati) + versione per minori |
| [nomina-responsabile-dpa.md](gdpr/nomina-responsabile-dpa.md) | Bozza di nomina a responsabile del trattamento (art. 28) tra società e gestore |
| [registro-trattamenti.md](gdpr/registro-trattamenti.md) | Registro art. 30 precompilato (titolare e responsabile) |
| [procedura-data-breach.md](gdpr/procedura-data-breach.md) | Procedura di violazione dei dati (1 pagina) |
| [decisioni-aperte.md](gdpr/decisioni-aperte.md) | Decisioni che richiedono il titolare del progetto o un legale |

---

## 0. Sintesi esecutiva

**Che cosa tratta SuiteASD.** Dati di atleti (molti minorenni), genitori, allenatori, staff, arbitri e referenti di sponsor di società sportive: anagrafica, codice fiscale, contatti, **certificati medici sportivi con scadenza (dati sulla salute, art. 9)**, pagamenti e ricevute, presenze/convocazioni (con motivi di assenza in testo libero), **valutazioni numeriche e note sulle prestazioni di minori**, notifiche, sessioni e token dei dispositivi.

**Ruoli.** Ogni società sportiva è **titolare**; chi gestisce SuiteASD è **responsabile (art. 28)** e deve essere nominato per iscritto da ogni società. Sub-responsabili: hosting (VPS Aruba), email transazionali (Resend, USA), backup cifrati (Backblaze B2). Se il gestore decidesse da sé finalità proprie (es. statistiche di prodotto, marketing) diventerebbe titolare per quelle: oggi il prodotto non lo fa, e va mantenuto così.

**Rischi principali oggi (verificati sul codice del 22/11/2026):**

1. **Nessuna informativa, nessun consenso, nessuna accettazione registrata.** Il frontend non ha pagine Privacy/Termini; le richieste di registrazione società (`POST /auth/register`) e di iscrizione con codice (`POST /join/{code}`) non portano né registrano alcuna accettazione o consenso. Non esistono tabelle per consensi o versioni di informativa.
2. **Minori.** L'iscrizione con codice blocca già l'atleta sotto i 14 anni (`guardian_required`) e richiede un genitore: è una buona base. Manca però la **tracciatura del consenso/dichiarazione del genitore** e la verifica che chi si dichiara genitore lo sia davvero (oggi è un'autodichiarazione).
3. **Diritti dell'interessato.** Esiste la cancellazione di un tesserato (`DELETE /members/{id}`, "diritto all'oblio" nella descrizione API) che elimina documenti, presenze, convocazioni, valutazioni e quote non pagate. **Restano**: l'account di accesso (`identity.users`), le quote pagate con nome e email del pagatore e le ricevute (corretto fiscalmente, ma i dati identificativi dovrebbero essere ridotti), le notifiche, i token, i log. Non c'è export dei dati di *una persona* (c'è solo l'export CSV dell'intera anagrafica per la società), né rettifica self-service completa, né gestione richieste e scadenza dei 30 giorni.
4. **Conservazione.** L'unica pulizia automatica è quella delle chiavi di idempotenza (`IdempotencyCleanup`). Notifiche, log di invio, sessioni scadute, token monouso scaduti, inviti scaduti, ex tesserati, documenti scaduti **non vengono mai eliminati**. Nessuna politica di conservazione è scritta.
5. **Dati sulla salute senza protezioni dedicate.** I certificati sono file su volume Docker del VPS **non cifrato a riposo** (`docs/DEPLOY.md`: "Cifratura a riposo: non c'è; i backup sono cifrati"). Allenatori e staff vedono l'elenco documenti di **tutti** i tesserati della società (`DOCUMENTS_READ`), non solo della propria squadra; non c'è registro degli accessi ai dati sanitari. Il testo libero (`notes`, `decline_reason`, `override_reason`, `note` presenze) può contenere informazioni di salute non previste.
6. **Fornitori esterni da formalizzare.** Resend (USA) e Backblaze (regione da scegliere in UE) richiedono DPA/garanzie di trasferimento; Aruba richiede il contratto di servizio con clausole art. 28. Nessuno è ancora firmato/verificato (`docs/DEPLOY.md`: "Non provati…").
7. **Cookie / archiviazione locale.** L'app usa solo `localStorage` per il token di rinnovo della sessione (strumento tecnico, non serve banner di consenso) e nessun cookie di terze parti, analytics o tracker. Serve comunque l'informativa che lo dichiari. Il font è caricato con `next/font` (self-hosted a build time: nessuna richiesta a Google dal browser dell'utente `[DA VERIFICARE nel build di produzione]`).

**P0 — da chiudere prima di usare dati reali (dettaglio nel §5):**

| # | P0 |
| --- | --- |
| P0-1 | Pagine pubbliche **Informativa privacy**, **Termini**, **Sub-responsabili**, **Cookie/storage**, collegate da registrazione, login, invito, iscrizione, area personale |
| P0-2 | **Nomina a responsabile (DPA) accettata** alla registrazione della società, con versione e data registrate |
| P0-3 | **Registro dei consensi/accettazioni** (tabella con tipo, versione testo, data, soggetto, soggetto che lo dà per conto di) e consensi **separati** per foto/immagini e comunicazioni facoltative |
| P0-4 | **Minori:** dichiarazione del genitore tracciata; informativa rivolta al genitore; regole per immagini degli under 14 (consenso di entrambi i genitori secondo la posizione del Garante) |
| P0-5 | **Cancellazione/anonimizzazione completa** di una persona (inclusi account, notifiche, token, dati pagatore su quote pagate) e **export dei dati di una persona** (JSON/CSV), con registro delle richieste e scadenza 30 giorni |
| P0-6 | **Politica di conservazione** scritta e job automatico di pulizia (token, sessioni, inviti, notifiche, log, ex tesserati, certificati scaduti) |
| P0-7 | **Contratti con i fornitori** (Aruba, Resend, Backblaze): DPA firmato, regione UE per B2, verifica DPF/SCC; elenco sub-responsabili pubblico |
| P0-8 | **Procedura data breach** adottata, con contatto reperibile e canale di notifica alle società entro tempi brevi (es. 24 ore) |
| P0-9 | **Cifratura a riposo** dei certificati (disco del VPS cifrato o cifratura applicativa) e **limitazione dell'accesso ai documenti** al minimo necessario |
| P0-10 | **DPIA** (valutazione d'impatto) documentata per il trattamento di dati di minori e sanitari |

**Decisioni aperte principali** (elenco completo in [decisioni-aperte.md](gdpr/decisioni-aperte.md)): chi è il "gestore" giuridicamente (persona fisica, ditta, società) e quale email di contatto privacy; nomina DPO sì/no; consenso del genitore: autodichiarazione o verifica; conservazione dei certificati; se vendere a società con basi giuridiche particolari (es. enti di promozione sportiva); validazione legale di tutti i testi.

---

## 1. Fonti consultate

Le fonti sono state consultate il **22 novembre 2026**. Quelle marcate ✔ sono state trovate su una pagina o su un riepilogo che rimanda al sito dell'autorità; per le altre il testo integrale **va riletto prima di decidere**.

| Tema | Fonte | Esito |
| --- | --- | --- |
| Regolamento (UE) 2016/679 (GDPR) | <https://eur-lex.europa.eu/eli/reg/2016/679/oj> | Articoli citati dal testo del Regolamento (art. 5, 6, 7, 8, 9, 12–22, 24, 25, 28, 30, 32–35, 37, 44–46) ✔ |
| D.Lgs. 196/2003 (Codice privacy) come modificato dal D.Lgs. 101/2018 | <https://www.normattiva.it> (ricerca "decreto legislativo 30 giugno 2003, n. 196") | Art. 2-quinquies (consenso del minore: 14 anni): confermato da più fonti, tra cui la pagina del Garante sui minori <https://www.garanteprivacy.it/temi/minori>. ⚠️ Una scheda parlamentare (dossier Camera TR0109) cita una proposta di **abrogazione del comma 1** dell'art. 2-quinquies: **verificare il testo vigente su Normattiva prima di fare affidamento sulla soglia dei 14 anni** `[DA VERIFICARE]` |
| Linee guida cookie e altri strumenti di tracciamento (provv. n. 231 del 10 giugno 2021, GU n. 163 del 9 luglio 2021, doc. web 9677876) | <https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876> | Con soli strumenti tecnici basta l'informativa (home page o privacy policy), senza banner ✔. Il testo non è stato letto per intero per quanto riguarda il `localStorage`: la valutazione "tecnico" è nostra, `[DA VERIFICARE]` |
| Elenco dei trattamenti soggetti a DPIA (provv. n. 467 dell'11 ottobre 2018, doc. web 9058979) | <https://www.garanteprivacy.it/garante/doc.jsp?ID=9058979> | Punto 6 dell'allegato 1: trattamenti non occasionali di dati di soggetti vulnerabili, tra cui **minori** ✔. L'elenco non è esaustivo ✔ |
| Registro delle attività di trattamento (art. 30) e FAQ del Garante (8 ottobre 2018) | <https://www.garanteprivacy.it/it/registro-delle-attivita-di-trattamento> | Le associazioni che trattano dati particolari rientrano tra i soggetti obbligati (art. 30 par. 5); il Garante raccomanda il registro anche ai non obbligati ✔. Per le ASD che trattano certificati medici di molti tesserati il registro va tenuto (prudenza) |
| Violazioni di dati (data breach) | <https://www.garanteprivacy.it/it/data-breach>; portale <https://servizi.gpdp.it/databreach/s/1>; Linee guida EDPB 9/2022 | Notifica via portale dal 1° luglio 2021; 72 ore dalla conoscenza; motivazione se in ritardo ✔ |
| Foto di minori | Posizione del Garante riportata da più testate/commenti: per pubblicare immagini di under 14 serve il consenso preventivo di **entrambi i genitori** (provvedimenti recenti) | Fonti secondarie; **leggere il provvedimento originale** prima di fissare la regola `[DA VERIFICARE]` |
| Dati sanitari in ambito sportivo | Provv. del Garante del novembre 2022 contro una società sportiva (idoneità sportiva trattata come dato sulla salute) <https://www.garanteprivacy.it/garante/doc.jsp?ID=9842370> | Conferma che l'**idoneità sportiva è trattata come dato sulla salute** nel caso esaminato; importi e motivazioni integrali non letti `[DA VERIFICARE]` |
| Trasferimento USA | Decisione di adeguatezza EU-US Data Privacy Framework del 10 luglio 2023; FAQ EDPB per le imprese <https://www.edpb.europa.eu/system/files/2026-01/edpb_dpf_faq-for-businesses_v2_en.pdf> | Resend è certificata DPF (changelog 13/03/2025) <https://resend.com/changelog/data-privacy-framework-certification>, con DPA <https://resend.com/legal/dpa>. **Regione di elaborazione non confermata**: leggere <https://resend.com/legal/subprocessors> `[DA VERIFICARE]`. Verificare su <https://www.dataprivacyframework.gov> che la certificazione sia attiva alla data della firma |
| Backblaze B2 | <https://www.backblaze.com/company/policy/dpa-module-2> (DPA, ruolo responsabile, SCC), <https://www.backblaze.com/company/policy/subprocessors>, annuncio data center UE Amsterdam | La regione UE (EU Central, Amsterdam) esiste ed è **scelta alla creazione dell'account** ✔. I dati di account possono stare anche in data center non UE: leggere la lista sub-responsabili `[DA VERIFICARE]` |
| Obbligo DPO (art. 37) | Linee guida WP243 rev.01 sui DPO; sezione DPO del sito del Garante | Non trovato testo specifico per le ASD: vedi §4.1 `[DA VERIFICARE]` |
| Conservazione contabile | Art. 2220 c.c. (10 anni dalla ultima registrazione); art. 22 D.P.R. 600/1973 | Il decennio è citato da più studi professionali; l'art. 22 DPR 600/1973 non è stato verificato `[DA VERIFICARE con un commercialista]` |
| Certificati medico-sportivi | D.M. 24 aprile 2013 (Balduzzi, "certificazione per attività sportiva non agonistica"), D.M. 28 febbraio 1983 (agonistica) e successive modifiche; D.Lgs. 36/2021 (riforma dello sport) | Durata di un anno e conservazione presso la società confermate da guide di settore; **norme primarie non lette** `[DA VERIFICARE]` |

**Nota di prudenza.** Il D.Lgs. 36/2021 e le leggi sul lavoro sportivo sono citati solo dove incidono sui dati (tesseramento, certificazione medica, quote). Il tema della *tutela dei minori / safeguarding* (modelli organizzativi, eventuale richiesta del certificato del casellario ai collaboratori che lavorano con minori) comporta il trattamento di **dati relativi a condanne e reati (art. 10 GDPR)**: SuiteASD **oggi non tratta** questi dati; se in futuro lo facesse, serve base giuridica nel diritto nazionale e valutazione legale `[DA VERIFICARE]`.

---

## 2. Inventario dei trattamenti

### 2.1 Interessati

| Interessato | Come entra nel sistema | Note |
| --- | --- | --- |
| **Atleta maggiorenne** | Iscrizione con codice/invito, o inserito dalla segreteria | Titolare dell'account |
| **Atleta minorenne** | Inserito dalla segreteria, o iscritto da un genitore (`kind` genitore); con l'iscrizione con codice sotto i 14 anni serve un genitore | Soggetto vulnerabile (DPIA) |
| **Genitore / tutore** | Account con ruolo `GENITORE`, legato al minore tramite `registry.guardian_links` (relazione PADRE/MADRE/TUTORE/ALTRO) | I suoi dati sono trattati sia come utente sia come "firmatario" per il minore |
| **Allenatore, staff, segreteria, admin** | Utenti con ruoli `ALLENATORE`, `STAFF`, `SEGRETERIA`, `ADMIN` e/o scheda `registry.staff_members` (qualifiche, note) | Possono essere anche collaboratori sportivi retribuiti: dati fiscali non trattati dall'app |
| **Arbitri** | Scheda `competitions.referees` (nome, email, telefono, qualifica, note) + designazioni con compenso | Non hanno account |
| **Referenti sponsor / partner** | `billing.sponsors` (nome contatto, email, telefono), `promotions` (nome partner) | Persone fisiche se ditte individuali |
| **Pagatori** (diversi dall'atleta) | `billing.fees`: `payer_name`, `payer_email` | Spesso un genitore |
| **Visitatori non registrati** | Solo la pagina pubblica del codice di iscrizione e il rate limit su IP | |

### 2.2 Dati trattati, per modulo (schema Flyway del backend al 22/11/2026)

| Modulo / tabella | Dati personali | Categoria | Interessati |
| --- | --- | --- | --- |
| `identity.users` | email, hash password, nome, cognome, telefono, stato attivo, ultimo accesso | Comuni | Tutti gli utenti |
| `identity.memberships` | ruolo per società | Comuni | Utenti |
| `identity.refresh_tokens` | hash del token, scadenza, revoca, **user-agent** del dispositivo, famiglia di sessione | Tecnici/comuni | Utenti |
| `identity.login_tokens` | hash del token di accesso via link, scadenza | Tecnici | Utenti |
| `identity.invitations` | email o etichetta del destinatario, ruolo, id tesserato collegato, chi ha invitato | Comuni | Invitati |
| `identity.device_tokens` | **token push** del dispositivo (in chiaro nella colonna `token`), piattaforma, ultimo uso | Identificativi online | Utenti |
| `registry.members` | nome, cognome, **data e luogo di nascita**, sesso, **codice fiscale**, email, telefono, indirizzo, città, CAP, ruolo in campo, taglia divisa, stato, data iscrizione, **note (testo libero, 1000 car.)** | Comuni; **la data di nascita rende noto se è minore**; il testo libero può contenere dati art. 9 | Atleti |
| `registry.team_memberships` | appartenenza a squadre e periodo | Comuni | Atleti |
| `registry.guardian_links` | legame genitore-minore e relazione | Comuni | Genitori, minori |
| `registry.staff_members` | nome, email, telefono, ruolo, **qualifiche**, note | Comuni | Staff |
| `registry.join_links` | codice, scadenza, usi | Tecnici | — |
| `documents.documents` | tipo (es. certificato medico), titolo, data di rilascio, **data di scadenza**, note, **file** (nome, tipo, dimensione, percorso su disco), chi ha caricato | **Art. 9 (salute)** per i certificati; il solo fatto "ha un certificato valido/scaduto" è già un dato sulla salute secondo la prassi del Garante `[DA VERIFICARE]` | Atleti, anche minori |
| `documents.document_types` | tipi di documento configurati dalla società | — | — |
| `documents.attachments` | file allegati a sede/divisa/trasferta/sponsor/movimento/arbitro/staff/promozione | Dipende dal contenuto caricato (es. contratto di un arbitro, documento di un collaboratore) | Vari |
| `billing.fees` | importo, scadenza, pagata il, metodo, **nome ed email del pagatore**, riferimento del pagamento, chi l'ha registrata, promemoria inviati | Comuni; finanziari | Atleti, genitori |
| `billing.receipts` | numero progressivo e data della ricevuta (collegata alla quota) | Comuni; obbligo contabile | Atleti, genitori |
| `billing.ledger_entries` | descrizione, fornitore, note, importo | Comuni (possono nominare persone) | Vari |
| `billing.sponsors` | nome ente, **referente, email, telefono**, importo, contratto | Comuni | Referenti |
| `communication.notifications` | titolo, testo (fino a 1000 car.), dati JSON, canale, stato, lettura, invio | Comuni; il testo può riferirsi a scadenze di certificato (**implicitamente salute**) | Utenti |
| `communication.notification_preferences` | scelte per tipo e canale | Comuni | Utenti |
| `communication.notification_logs` | tentativi di invio, provider, errore | Tecnici | Utenti |
| `communication.announcements` | bacheca: titolo, testo, autore, squadra | Comuni | Staff, atleti |
| `scheduling.events`, `attendances`, `convocations` | eventi; **presenza con nota (300 car.)**; convocazione con **motivo del rifiuto (300 car.)** e motivo di deroga | Comuni; i motivi liberi possono rivelare **infortuni/malattie (art. 9)** | Atleti, minori |
| `competitions.evaluations` | **voto 1–10 e note (1000 car.)** per partita e tesserato | Comuni; **valutazione di minori** (profilazione leggera) | Atleti, minori |
| `competitions.match_stats` | statistiche individuali | Comuni | Atleti |
| `competitions.referees`, `referee_assignments` | dati dell'arbitro e compenso | Comuni | Arbitri |
| `logistics.*` | sedi, divise (taglia), trasferte | Comuni | Vari |
| `promotions.*` | convenzioni; **logo della società** (`society_logos`, bytea) | Comuni | — |
| `platform.idempotency_keys` | **corpo della risposta** memorizzato (può contenere dati personali) | Tecnici; pulizia giornaliera 03:30 | Vari |
| `platform.event_publication` | eventi di dominio serializzati (modulo Spring Modulith, `completion-mode: delete`) | Tecnici | Vari |
| **Memoria applicativa** | **Indirizzo IP** nei contatori del rate limit (Caffeine in RAM, finestra breve, non su disco) | Identificativi online | Chiunque chiami login/registrazione |
| **Log del reverse proxy (Caddy)** | JSON su stdout: IP, user-agent, URL, esito | Identificativi online | Tutti i visitatori; **durata = quella dei log Docker, non configurata** |
| **Backup (restic su B2)** | Copia cifrata del database e dei file dei documenti: 7 giornalieri, 4 settimanali, 6 mensili | Tutte le categorie, cifrate | Tutti |
| **Browser dell'utente** | `localStorage`: solo il token di rinnovo (`token-store.ts`); nessun cookie impostato dall'app `[DA VERIFICARE con un controllo degli strumenti di sviluppo del browser in produzione]` | Tecnico | Utenti |

**Cose che SuiteASD oggi NON tratta** (da mantenere così, o da rivalutare con un legale): foto/video dei tesserati (c'è solo il logo della società e allegati generici), riconoscimento biometrico, geolocalizzazione, pubblicità, analytics, dati su condanne e reati, dati dei pagamenti con carta (i pagamenti sono registrati a mano; l'app non incassa).

### 2.3 Finalità e basi giuridiche (art. 6 e 9)

La base giuridica è **della società** (titolare). Quella proposta, da validare:

| Trattamento | Finalità | Base art. 6 | Base art. 9 (se serve) |
| --- | --- | --- | --- |
| Account e sessioni | Accesso sicuro al servizio | 6(1)(b) contratto/adesione all'associazione | — |
| Anagrafica tesserati, squadre, ruoli | Gestione del rapporto associativo e dell'attività sportiva; tesseramento a federazioni/enti | 6(1)(b) | — |
| Codice fiscale | Identificazione per tesseramento e ricevute | 6(1)(b); 6(1)(c) dove richiesto dal tesseramento `[DA VERIFICARE]` | — |
| **Certificati medici e scadenze** | Verificare l'idoneità sportiva prima dell'attività | 6(1)(c) obbligo di legge/regolamenti federali per l'idoneità `[DA VERIFICARE]` | **9(2)(b)** (obblighi in materia di sicurezza sociale/protezione sociale) o **9(2)(d)** (associazioni senza scopo di lucro con finalità sportive, solo per i propri membri, senza comunicazione all'esterno senza consenso) — la scelta va fatta con un legale `[DA VERIFICARE]`; in alternativa **9(2)(a)** consenso esplicito |
| Quote, pagamenti, ricevute | Gestione contabile | 6(1)(b) e 6(1)(c) (obblighi contabili e fiscali) | — |
| Presenze e convocazioni | Organizzazione allenamenti e gare | 6(1)(b); 6(1)(f) | (i motivi liberi di assenza possono contenere salute → vedi §5, P1) |
| Valutazioni e statistiche | Crescita sportiva, scelta formazioni | 6(1)(f) interesse legittimo, con bilanciamento specifico per i minori `[DA VERIFICARE]` | — |
| Notifiche e email di servizio | Scadenze, inviti, convocazioni | 6(1)(b) | — |
| Comunicazioni promozionali / newsletter | Marketing della società | **6(1)(a) consenso** (separato, revocabile) | — |
| Immagini (se mai introdotte) | Sito/social della società | **6(1)(a) consenso**; per under 14 dai genitori | — |
| Rate limit su IP, log di sicurezza | Sicurezza del servizio | 6(1)(f) | — |
| Backup | Continuità del servizio | 6(1)(f) | (copre anche art. 9) |
| Convenzioni/partner | Promozioni ai tesserati | 6(1)(b)/(f); nessun dato ceduto al partner | — |

### 2.4 Destinatari

- All'interno della società, in base ai permessi (`Permission.java`): ADMIN/SEGRETERIA (tutto); ALLENATORE/STAFF (anagrafica e **elenco documenti di tutta la società**, presenze/convocazioni); ATLETA/GENITORE (solo i propri/figli). Il **download** dei file dei documenti è limitato a chi gestisce (ADMIN/SEGRETERIA) e al titolare del documento (`DocumentAccess.mayDownload`).
- Responsabile (gestore SuiteASD) e **sub-responsabili** (vedi §3).
- Federazioni o enti di promozione sportiva: **fuori da SuiteASD** (tesseramento); non c'è integrazione oggi.

### 2.5 Conservazione proposta (da validare)

| Dato | Proposta | Motivo |
| --- | --- | --- |
| Account e anagrafica di tesserato attivo | Per tutta la durata del rapporto | Esecuzione del rapporto |
| **Ex tesserato** (stato non attivo) | Anagrafica minima 2 anni dopo l'ultima stagione, poi cancellazione/anonimizzazione `[decisione titolare]` | Minimizzazione; storico utile per riammissione |
| **Certificato medico** (file e dati) | Fino a **scadenza + 1 stagione** e comunque alla cessazione del rapporto; poi cancellazione dei file | Serve solo a verificare l'idoneità; nessun obbligo di conservare oltre `[DA VERIFICARE con la federazione/ente]` |
| Quote, ricevute, movimenti | **10 anni** dalla registrazione (art. 2220 c.c.) | Obblighi contabili `[DA VERIFICARE con un commercialista]`; dopo la cessazione del rapporto, **ridurre i dati identificativi del pagatore** a quanto richiesto |
| Presenze, convocazioni, valutazioni | Stagione in corso + 1; poi anonimizzazione o aggregazione | Finalità esaurita |
| Notifiche e log di invio | **90 giorni** (notifiche lette), **30 giorni** (log tecnici) | Servizio |
| Sessioni (`refresh_tokens`) e `login_tokens` | Cancellazione dopo la scadenza (+7 giorni) | Sicurezza |
| Inviti e link di iscrizione scaduti/revocati | 30 giorni dopo la scadenza | Servizio |
| Device token | Alla revoca o dopo 180 giorni di inattività | Servizio |
| Log del proxy (IP) | **max 30 giorni** `[DA VERIFICARE su quanto serve per sicurezza]` | Sicurezza |
| Backup | Fino a 6 mesi (policy restic); le cancellazioni arrivano nei backup entro tale termine: va scritto nell'informativa | Continuità |
| Dati di una società cessata | Esportazione e consegna alla società, cancellazione entro 30 giorni dalla fine del contratto (clausola DPA) | Art. 28(3)(g) |
| Consensi e richieste di diritti | 5 anni (dimostrare l'accountability) | Art. 7(1), art. 5(2) |

### 2.6 Trasferimenti extra-UE

| Fornitore | Dove | Garanzia |
| --- | --- | --- |
| Hosting Aruba (VPS) | Italia (data center Aruba) `[DA VERIFICARE nel contratto: sede del VPS]` | Nessun trasferimento |
| **Resend** (email) | Società USA; elaborazione possibilmente in UE/USA `[DA VERIFICARE]` | **DPF** (certificata, 13/03/2025) + DPA; in subordine SCC |
| **Backblaze B2** (backup, solo dati cifrati) | Regione **EU Central (Amsterdam)** da scegliere alla creazione dell'account; società USA | DPA con SCC, DPF; contenuti **cifrati con restic prima dell'invio**, la chiave resta al gestore |
| Let's Encrypt (certificati) | USA | Nessun dato personale degli interessati (solo il nome del dominio) |
| Provider push (se introdotti, es. FCM/APNs) | USA | **Oggi non implementato**: se attivato, va aggiunto al registro e all'informativa |

---

## 3. Ruoli privacy

```
Interessato (atleta, genitore, staff, arbitro)
        │  informativa + diritti
        ▼
┌───────────────────────────────────────────────┐
│ SOCIETÀ SPORTIVA = TITOLARE (art. 24)         │
│ decide finalità e mezzi; firma la nomina      │
└───────────────┬───────────────────────────────┘
                │ nomina scritta art. 28 (DPA)
                ▼
┌───────────────────────────────────────────────┐
│ GESTORE DI SUITEASD = RESPONSABILE (art. 28)  │
│ tratta solo su istruzioni documentate;        │
│ assiste con diritti, breach, DPIA             │
└───────┬───────────────┬───────────────┬───────┘
        │ autorizzazione │               │
        ▼ (art. 28(2),(4))               ▼
 Aruba (hosting VPS)  Resend (email)  Backblaze B2 (backup cifrati)
 sub-responsabile     sub-resp., USA   sub-resp., UE+USA
```

**Punti chiave.**

1. **Titolare = la società.** Se una società ha più squadre/sezioni, resta un solo titolare. Se più società sono controllate dalla stessa persona, valutare contitolarità (art. 26) `[DA VERIFICARE]`.
2. **Responsabile = il gestore.** Serve un atto scritto (art. 28(3)) con: oggetto, durata, natura, finalità, tipi di dati, categorie di interessati, istruzioni documentate, riservatezza del personale, misure di sicurezza (art. 32), regole sui sub-responsabili, assistenza per diritti/DPIA/breach, cancellazione o restituzione a fine contratto, audit. Bozza in [nomina-responsabile-dpa.md](gdpr/nomina-responsabile-dpa.md). In pratica: accettazione online alla registrazione della società (clickwrap con versione e data), **più** una copia stampabile.
3. **Sub-responsabili:** autorizzazione generale con **elenco pubblico** e preavviso di cambiamento (es. 30 giorni) per consentire l'opposizione; il gestore impone loro per contratto gli stessi obblighi (art. 28(4)) e risponde nei confronti della società.
4. **Il gestore resta responsabile solo finché non usa i dati per finalità proprie.** Sono finalità proprie: statistiche aggregate per migliorare il prodotto basate su dati personali, marketing a utenti finali, vendita/cessione di dati, addestramento di modelli. Se mai servissero, sarebbe un trattamento da titolare con base giuridica e informativa proprie. Il "dato di account" del titolare della società (admin) trattato per fatturazione del servizio è invece trattamento del gestore come **titolare autonomo** (contratto di servizio e dati di fatturazione): va nell'informativa del gestore (pagina Privacy del sito).
5. **Sicurezza condivisa.** Misure tecniche (cifratura, backup, accessi) sono del gestore; le scelte organizzative (chi ha il ruolo ADMIN, quali certificati richiedere, quanto conservare) sono della società e il prodotto deve offrirle come impostazioni con default prudenti.

---

## 4. Requisiti normativi e cosa significano per il prodotto

| Requisito | Fonte | Implicazione per SuiteASD |
| --- | --- | --- |
| Liceità, correttezza, trasparenza; limitazione di finalità; **minimizzazione**; esattezza; **limitazione della conservazione**; integrità e riservatezza; responsabilizzazione | GDPR art. 5 | Politica di conservazione e pulizia automatica (§2.5); campi liberi da limitare; documentare le scelte (questo documento) |
| Base giuridica | art. 6 | Tabella §2.3; consenso solo dove serve (marketing, immagini) e **mai condizione** per partecipare all'attività |
| Dati particolari | art. 9; Codice privacy art. 2-sexies, 2-septies (misure di garanzia per salute) `[DA VERIFICARE]` | Certificati: accesso minimo, cifratura, registro accessi |
| Condizioni del consenso | art. 7 | Consensi separati, granulari, revocabili con la stessa facilità, **registrati con data e versione** |
| **Minori** | art. 8 GDPR; **art. 2-quinquies Codice privacy**: soglia 14 anni per il consenso ai servizi della società dell'informazione; sotto, consenso di chi esercita la responsabilità genitoriale `[DA VERIFICARE testo vigente]` | Per i minori di 14 anni agisce il genitore (già previsto da `guardian_required`). **Attenzione:** la soglia dei 14 anni vale per il consenso ai servizi online; per i trattamenti basati su contratto/obbligo legale riguardanti un minore, la capacità di agire del minore (18 anni) rimane in capo ai genitori per la parte contrattuale (iscrizione all'associazione): la società deve far firmare ai genitori l'iscrizione di tutti i minorenni, non solo dei under 14 `[DA VERIFICARE con un legale]` |
| Informativa | art. 13 (dati raccolti presso l'interessato), art. 14 (dati forniti da altri, es. genitore o segreteria) | Entrambi i casi sono reali: la segreteria inserisce dati di atleti. L'informativa va **consegnata o resa disponibile al primo contatto** e per i dati ricevuti da terzi entro 1 mese (art. 14(3)). Invio dell'email di invito/accesso con link all'informativa |
| Diritti | art. 15–22; risposta **entro 1 mese**, prorogabile di 2 mesi per complessità (art. 12(3)) | Procedura e strumenti (§5, P0-5) |
| Privacy by design e by default | art. 25 | Default prudenti: permessi minimi, notifiche non invasive, campi opzionali spenti, nessun tracker |
| Responsabile | art. 28 | Nomina e sub-responsabili (§3) |
| **Registro** | art. 30 (par. 1 titolare, par. 2 responsabile; par. 5: esenzione sotto 250 dipendenti **non** applicabile se trattamenti non occasionali o dati particolari) | Registro compilato per la società e per il gestore: [registro-trattamenti.md](gdpr/registro-trattamenti.md) |
| Sicurezza | art. 32 | Cifratura, pseudonimizzazione, riservatezza/integrità/disponibilità, test, backup provati: vedi §5 P0-9 e P1 |
| **Violazioni** | art. 33 (72 ore al Garante), art. 34 (agli interessati se rischio elevato); il **responsabile** avvisa il titolare "senza ingiustificato ritardo" (art. 33(2)) | [procedura-data-breach.md](gdpr/procedura-data-breach.md) |
| **DPIA** | art. 35; elenco Garante n. 467/2018 (punto 6: soggetti vulnerabili, minori) | Con dati di minori + dati sanitari su più società, **fare la DPIA** (conviene farla come gestore per tutte le società e metterla a disposizione) |
| DPO | art. 37 | Vedi §4.1 qui sotto |
| Trasferimenti | cap. V (art. 44–49) | §2.6 |
| ePrivacy / strumenti di tracciamento | Codice privacy art. 122; Linee guida cookie 2021 | Solo strumenti tecnici: informativa, no banner. Se si aggiungessero analytics/terze parti: banner e consenso |
| Sport dilettantistico | D.Lgs. 36/2021; D.M. sulla certificazione medico-sportiva; regole federali | L'obbligo di certificato è fissato dalle norme sportive/della federazione; l'app conserva solo ciò che serve alla verifica |

### 4.1 DPO: serve?

L'art. 37(1) impone il DPO se (a) trattamento da autorità pubblica, (b) attività principali che richiedono monitoraggio regolare e sistematico su larga scala, (c) attività principali consistenti nel trattamento su larga scala di categorie particolari. Una ASD *non* ha come attività principale il trattamento di dati sanitari (la sua attività principale è lo sport) e il numero di tesserati di una singola ASD tipicamente non è "larga scala": **di norma una singola ASD non deve nominare il DPO**; i commenti consultati sono in questo senso ma non unanimi `[DA VERIFICARE con le Linee guida WP243 e le FAQ del Garante sul DPO]`. Per il **gestore**, che archivia dati sanitari di minori di molte società come attività *principale*, la questione è seria e dipende dal numero di interessati: **va valutata e documentata** (anche una valutazione "non serve, perché…" è un atto utile). Consiglio: nominare comunque un riferimento privacy (non necessariamente DPO) e pubblicare l'email di contatto.

---

## 5. Checklist di prodotto

Priorità: **P0** = bloccante prima dei dati reali; **P1** = entro il primo trimestre di produzione; **P2** = miglioramento. Difficoltà: **B** bassa (≤1 giorno), **M** media (2–5 giorni), **A** alta (>1 settimana o richiede decisioni esterne).

### P0

| ID | Requisito | Dove nel prodotto | Cosa implementare | Diff. |
| --- | --- | --- | --- | --- |
| P0-1 | Informativa, Termini, Cookie, Sub-responsabili pubblici (art. 12–14) | Frontend: nuove pagine pubbliche in `apps/web/src/app/(public)/` (es. `/privacy`, `/termini`, `/cookie`, `/sub-responsabili`) e link a piè di pagina di login, registrazione, invito, iscrizione, area personale e nelle email | Pagine con i testi di [informativa-privacy.md](gdpr/informativa-privacy.md) dopo validazione legale; il testo è per la società (titolare), con i campi della società compilati dinamicamente (nome, contatto privacy, DPO se c'è). Versione e data in ogni pagina | M |
| P0-2 | Nomina a responsabile accettata (art. 28) | Registrazione società (`app/(auth)/registrazione`; backend `POST /auth/register`) | Casella obbligatoria "Accetto Termini e nomina a responsabile" con link; backend registra versione del testo, data/ora, utente (tabella `identity.legal_acceptances`) e restituisce la copia PDF/stampabile; nuova versione ⇒ riaccettazione al prossimo accesso | M |
| P0-3 | Registro dei consensi (art. 7(1)) e consensi separati | Backend: nuova tabella `identity.consents` (`subject_user_id`, `member_id`, `type`, `version`, `granted`, `granted_at`, `given_by_user_id`, `source`); frontend: sezioni nei flussi di iscrizione, invito, area personale | Tipi: `PRIVACY_NOTICE_SEEN` (presa visione, non consenso), `MARKETING`, `IMAGES`, `PHOTO_UNDER14` (genitore), `COMMUNICATIONS_OPTIONAL`. **Nessuna casella pre-spuntata**; il rifiuto non impedisce l'iscrizione. Pannello "I miei consensi" con revoca in un click; la revoca ferma l'invio e viene registrata | M |
| P0-4 | Minori e responsabilità genitoriale | Iscrizione con codice (`POST /join/{code}`), `OwnMemberController` (`/me/children`), invito genitore | Già presente il blocco under 14. Aggiungere: dichiarazione "esercito la responsabilità genitoriale" **con registrazione** (data, versione, utente); per immagini di under 14 consenso di **entrambi i genitori** (due dichiarazioni) `[DA VERIFICARE]`; l'informativa del genitore con riga rivolta al minore in linguaggio semplice; al compimento dei 14/18 anni notifica al ragazzo/a e passaggio dei consensi all'interessato (nuovo consenso) | M-A |
| P0-5 | Diritti (accesso, rettifica, cancellazione, portabilità, opposizione, limitazione) | Area personale (`app/(personale)/area-personale`) per l'interessato; gestione richieste in `app/(app)` per admin | **Accesso/portabilità**: endpoint `GET /me/data-export` (e per il genitore, per figlio) che produce JSON/CSV con tutto ciò che il sistema ha su quella persona (account, scheda, squadre, documenti [solo metadati + link], presenze, convocazioni, valutazioni, quote, notifiche, consensi). **Rettifica**: modifica self-service di contatti (già `PATCH /members/{id}/contact`) e richiesta di rettifica del resto. **Cancellazione**: servizio unico `erase(person)` che rimuove o anonimizza tutto: scheda (`DELETE /members/{id}` esistente) **più** account `identity.users` se non ha altri tesseramenti, sessioni, device token, inviti, notifiche; per le quote pagate/ricevute (obbligo contabile) mantiene importo e data ma **sostituisce** nome/email del pagatore con "Dato anonimizzato" e `member_id` con un identificativo opaco; elimina i file su disco **e** segna la rimozione dai backup entro 6 mesi (policy restic). **Opposizione/limitazione**: flag `restricted` sulla scheda (non compare in elenchi, non riceve notifiche). **Registro richieste** `identity.data_requests` (tipo, data richiesta, scadenza = +30 giorni, stato, esito, chi ha gestito) con promemoria ad admin a 20 giorni. **Verifica identità** (la richiesta arriva da utente autenticato; per i minori dal genitore collegato) | A |
| P0-6 | Conservazione e cancellazione automatica (art. 5(1)(e)) | Backend: job schedulato come `IdempotencyCleanup` e `JobScheduler` (communication) | Job notturno di pulizia secondo §2.5: notifiche, log, sessioni scadute, login token, inviti scaduti, device token inattivi, tesserati ex da X anni (con avviso all'admin 30 giorni prima), certificati scaduti da X. **Impostazioni per società** (default prudenti) in `Automazioni`. Test del job con dati finti | M |
| P0-7 | Contratti e dichiarazione dei sub-responsabili (art. 28(2),(4); cap. V) | Fuori dal codice + pagina `/sub-responsabili` | Firmare/accettare i DPA di Aruba, Resend, Backblaze; scegliere **EU Central** su B2; verificare DPF attivo su dataprivacyframework.gov; pubblicare l'elenco con ruolo, paese, garanzia; processo di preavviso modifiche | M |
| P0-8 | Procedura di violazione | Documento + canale (email contatto privacy) + monitoraggio | Adottare [procedura-data-breach.md](gdpr/procedura-data-breach.md); casella `privacy@…` e `sicurezza@…` letta da una persona; registro delle violazioni (anche quelle non notificate, art. 33(5)) | B |
| P0-9 | Sicurezza dei dati sanitari (art. 32, 25) | VPS/Docker (`compose.prod.yaml`), `DocumentAccess` | (a) **Cifrare a riposo**: disco/volume del VPS cifrato (LUKS) oppure cifratura applicativa dei file dei documenti con chiave fuori dal volume; (b) **limitare la lettura**: `DOCUMENTS_READ` oggi dà a ALLENATORE/STAFF l'elenco documenti di *tutti*; ridurre alla propria squadra o al solo stato "valido/scaduto" senza nome del file e senza note; (c) **registro accessi** ai documenti (chi, quando, cosa: tabella `documents.access_log`); (d) il download resta a ADMIN/SEGRETERIA e al titolare | A |
| P0-10 | DPIA (art. 35) | Documento | Redigere la DPIA del servizio (descrizione, necessità/proporzionalità, rischi, misure) usando questo documento come base; rivederla a ogni cambiamento significativo | M |

### P1

| ID | Requisito | Dove | Cosa implementare | Diff. |
| --- | --- | --- | --- | --- |
| P1-1 | Testo libero con rischio salute | `members.notes`, `attendances.note`, `convocations.decline_reason`, `evaluations.notes` | Etichetta accanto al campo: "Non scrivere informazioni sulla salute o dati di terzi"; per i motivi di assenza usare **scelte predefinite** ("Impegno personale", "Non disponibile", "Altro motivo") senza dettaglio medico | B |
| P1-2 | Minimizzazione dei campi | Registrazione/iscrizione | Rendere **opzionali** CF, indirizzo, luogo di nascita se non necessari al tesseramento; spiegare perché si chiede | B |
| P1-3 | Registro audit di accessi e modifiche | Backend (cross-module) | Log applicativo dei **letture/modifiche** su anagrafica, documenti, valutazioni (utente, azione, id, data), conservato 12 mesi, visibile all'admin; già indicato in `docs/SECURITY.md` come P1 | A |
| P1-4 | Sessioni e accessi | `token-store.ts`, identity | Token di rinnovo in `localStorage` (limite già in `docs/SECURITY.md`): valutare cookie `HttpOnly`; 2FA per ADMIN/SEGRETERIA; elenco dispositivi e "esci ovunque" | M-A |
| P1-5 | Notifiche e preferenze | Comunicazione | Le notifiche di servizio sono sempre dovute (base contrattuale); distinguere in UI le **facoltative** (promemoria, news) e lasciare il controllo (esiste `notification_preferences`: 18 interruttori); link di disiscrizione nelle email facoltative | B |
| P1-6 | Bacheca e dati di terzi | `announcements` | Avviso quando un testo contiene nomi di minori; nessuna pubblicazione esterna | B |
| P1-7 | Log del proxy | `Caddyfile` | Limitare retention/rotazione dei log Docker (`max-size`, `max-file`) e non loggare querystring con token; impostare 30 giorni | B |
| P1-8 | Restituzione dati a fine contratto | Backend | Export completo della società (zip: CSV + documenti) e cancellazione entro 30 giorni dalla chiusura; clausola nel DPA | M |
| P1-9 | Cambio di ruolo/società | Account con più società | Separazione netta dei dati per società (già c'è il tenant); in "Area personale" mostrare quale società tratta cosa e il contatto privacy di ciascuna | B |
| P1-10 | Informazioni all'atto del primo accesso | Magic link / invito | Nell'email di invito: chi è il titolare, link all'informativa, come esercitare i diritti (art. 14) | B |

### P2

| ID | Requisito | Cosa | Diff. |
| --- | --- | --- | --- |
| P2-1 | Pseudonimizzazione di valutazioni/statistiche dopo la stagione | Sostituire il nome con codice nei dati storici conservati | M |
| P2-2 | Cifratura applicativa di campi (CF, telefono) a riposo | Cifratura a livello di colonna | A |
| P2-3 | Auto-valutazione periodica | Pagina interna "stato privacy" per admin (consensi mancanti, richieste in scadenza, certificati vecchi) | M |
| P2-4 | Modulo foto/video, se mai introdotto | Prima: DPIA aggiornata, consensi per uso, galleria con accesso limitato, nessuna pubblicazione su social dall'app | A |
| P2-5 | Esportazione portabile in formato aperto con firma | Aggiungere checksum e descrizione dei campi | B |

### Cookie e archiviazione nel browser (verifica sul codice)

- `apps/web/src/lib/api/token-store.ts`: il **token di accesso resta in memoria**, il **token di rinnovo in `localStorage`** (chiave dedicata) per far sopravvivere la sessione al ricaricamento. È uno strumento **tecnico strettamente necessario** per il servizio richiesto dall'utente.
- Ricerca nel codice del frontend (`apps/web/src`): nessun altro uso di `localStorage`, `sessionStorage`, `document.cookie` o IndexedDB al di fuori del token store; nessuna libreria di analytics, pixel, mappe o font di terze parti caricati dal browser (`next/font/google` è incorporato in fase di build).
- **Conclusione provvisoria:** **non serve banner di consenso**; serve però dichiarare lo strumento nell'informativa (pagina "Cookie e archiviazione") e rivedere la valutazione se si aggiungeranno funzioni (analytics, chat di supporto, video, mappe). `[DA VERIFICARE con il testo delle Linee guida 2021]` e con uno scan reale del sito in produzione (Caddy può impostare intestazioni ma non cookie).

### Come devono funzionare i diritti dell'interessato nell'app (flusso)

1. **Dove si chiede:** area personale → "I miei dati" (accesso/portabilità/rettifica/cancellazione/opposizione/limitazione); per i minori il genitore dal profilo del figlio; per chi non ha accesso, email al contatto privacy della società.
2. **Chi gestisce:** l'admin della società (titolare) riceve la richiesta in una coda "Richieste privacy", con scadenza a **30 giorni** (art. 12(3): un mese, prorogabile di due con motivazione). Il gestore SuiteASD assiste tecnicamente (art. 28(3)(e)) e risponde alla società entro 5 giorni lavorativi.
3. **Verifica dell'identità:** utente autenticato; richieste via email → verifica con link all'email registrata.
4. **Esito:** registrato (richiesta, data, azione, eventuali eccezioni: "dati fiscali conservati per obbligo di legge fino al…").
5. **Cancellazione:** conferma esplicita ("non si può annullare"); copia di export offerta prima; effetto entro 24 ore sul sistema, entro 6 mesi nei backup.

---

## 6. Misure di sicurezza oggi (art. 32) — fotografia

Presenti (da `docs/DEPLOY.md`, `docs/SECURITY.md`, codice): HTTPS con certificato automatico, HSTS e intestazioni di sicurezza (Caddy), rate limit sui tentativi di login e sull'iscrizione (per IP, in memoria), password con hash, token di rinnovo ruotati con revoca per famiglia, token monouso salvati come hash, isolamento per società (`society_id` con controllo `is_a_tenant`), permessi per ruolo, `/actuator` nascosto, errori senza dettagli, backup giornalieri **cifrati** (restic) con controllo dell'integrità, valori sensibili in `.env` fuori dal repository.

Mancanti o da migliorare: cifratura a riposo del disco/volume; registro degli accessi; 2FA; CSP senza `unsafe-inline` (nonce); un solo VPS (punto di guasto); test di ripristino periodici da documentare; `device_tokens.token` in chiaro (solo l'hash è usato come chiave: valutare di non conservare il valore in chiaro se non necessario).

---

## 7. Cose che il gestore deve fare fuori dal software

1. Definire **chi è il gestore** (persona fisica o società), con indirizzo e contatti privacy; senza un soggetto giuridico chiaro la nomina art. 28 non è firmabile.
2. Tenere il **proprio registro** come responsabile (art. 30(2)): modello in `registro-trattamenti.md`.
3. Procedura interna **data breach**, con un reperibile e un canale di allerta.
4. **Formazione/riservatezza** del personale con accesso ai sistemi (impegno scritto).
5. Gestire gli accessi al VPS (chiavi SSH, nessun accesso condiviso), e custodire `RESTIC_PASSWORD` fuori dal VPS.
6. **Prova di ripristino** del backup e registro dell'esito.
7. Pubblicare l'**elenco dei sub-responsabili** e avvisare le società dei cambi.
8. Fatturazione del servizio: informativa del gestore come titolare dei dati degli admin.

---

## 8. Domande aperte

Vedi [decisioni-aperte.md](gdpr/decisioni-aperte.md). In sintesi: identità giuridica del gestore, DPO, soglia dei 14 anni vigente, base giuridica art. 9 per i certificati, durate di conservazione, immagini (sì/no), consenso del genitore (autodichiarazione/verifica), region di Resend e Backblaze, validazione legale di tutti i testi.

---

## 9. Prossimi passi consigliati (ordine di lavoro)

1. Validazione legale delle bozze e decisione dei punti aperti (1–2 settimane).
2. P0-7 e P0-8 (contratti e procedura): sbloccano l'uso con dati reali in fase pilota con **una sola società** e con dati di test per i minori.
3. P0-1, P0-2, P0-3: pagine, nomina, consensi (frontend+backend).
4. P0-5, P0-6: diritti e conservazione (backend, il lavoro più grande).
5. P0-9 e P0-10: sicurezza dati sanitari e DPIA prima dell'apertura a più società.
6. P1 in ordine di rischio.

*I testi proposti non sono vincolanti per il codice: ogni punto "implementare" va aperto come task con test (CLAUDE.md, regola 6) e documentato in `docs/PROGRESS.md`.*
