# 02 - Feature innovative e prioritizzazione

Metodo: brainstorm partendo dai dolori dichiarati nella SPEC (WhatsApp, Excel, scadenze, quote da rincorrere) e dalle lacune del file 01; poi filtro "e' davvero diverso dai concorrenti? un dirigente volontario lo userebbe?". Le valutazioni sono giudizi del product strategist, non misure: vanno corrette dai pilota.

Scale: **Difficolta'** S = pochi giorni, M = 1-3 settimane, L = oltre un mese. **Costo di gestione** = costo ricorrente per te (soldi o tempo). **Rischio** = tecnico/legale/adozione. **Impatto** = A/M/B sull'adozione o sul passaparola.

## 1. Idee ordinate per fase

### (a) Gia' nello scope del prototipo (SPEC): quali contano davvero

Non sono nuove, ma alcune diventano differenzianti se fatte bene. Cosa curare di piu':

| ID | Feature SPEC | Perche' puo' distinguersi | Cosa curare | Diff. | Costo gest. | Rischio | Impatto |
|---|---|---|---|---|---|---|---|
| A1 | Convocazioni automatiche + promemoria ai non rispondenti (mod. 04) | Spond lo fa, ma non con regola "certificato scaduto = non convocabile" | Barra "5/12 confermate" e sollecito automatico al genitore, non solo all'atleta | M | Basso | Cap email gratuito (vedi 03) | A |
| A2 | Certificati: timeline + blocco convocazione (mod. 02) | Impedire di far giocare chi non e' coperto riduce un rischio reale del presidente (responsabilita' civile/penale in caso di certificato assente, [Yapla](https://www.yapla.com/it/articoli/certificato-medico-sportivo-asd-ssd), fonte di software concorrente) | Override Admin con log; messaggio chiaro al genitore | S | Basso | Dato sanitario: minimizzare (vedi 03) | A |
| A3 | Dashboard "Attivita' gestite dall'app" con log spiegabile (mod. 08) | Trasforma le automazioni in qualcosa che il presidente vede e di cui si fida. E' la promessa del prodotto | Log in linguaggio umano ("Ho avvisato 4 genitori alle 18:00"), interruttore per ogni automazione | M | Basso | Se un'automazione sbaglia, perdi fiducia: partire con "bozza da approvare" | A |
| A4 | Classifiche automatiche (mod. 05) | Wow in demo, lavoro manuale ogni settimana per i dirigenti | Regole punteggio pallavolo e spareggi con test | M | Basso | Regole variano per campionato/comitato: configurabili | M |
| A5 | Pagelle e statistiche (mod. 06) | Koach e SportEasy ci arrivano da lati diversi; l'angolo "pagella per la famiglia" e' raro | Visibilita' limitata al genitore del proprio figlio; tono educativo per minori | M | Basso | Pagelle numeriche su minori: sensibilita' dei genitori, rischio conflitti. Partire con feedback qualitativo opzionale | M |
| A6 | Ricevute PDF numerate (mod. 03) | Tutti le hanno | Non dichiararle "fiscali" senza verifica del commercialista | S | Basso | Legale se mal dichiarate | M |

### (b) Post-prototipo a costo zero (solo tempo di sviluppo)

| ID | Idea | Valore per l'utente | Diff. | Costo gest. | Rischio | Impatto | Note |
|---|---|---|---|---|---|---|---|
| B1 | **Risposta convocazione senza login via link** (link magico condivisibile nel gruppo WhatsApp, 1 tap "ci sono / non ci sono") | Il genitore non installa e non ricorda password. E' la risposta alla lacuna L3 | M | Zero (link `wa.me` o incolla manuale, no API WhatsApp) | Sicurezza: link firmati, a scadenza, monouso per persona | **A** | Idea distintiva n.1: SuiteASD si adatta a WhatsApp invece di sostituirlo |
| B2 | **Import assistito da Excel/CSV** (riconosce colonne nome, CF, squadra, scadenza; segnala righe dubbie) | Passare da Excel a SuiteASD in 15 minuti, non in una serata | M | Zero | Fogli sporchi: gestire anteprima e errori | **A** | Idea n.2: riduce l'attrito di adozione, l'ostacolo piu' grande per chi usa Excel |
| B3 | **Scadenzario adempimenti ASD** (promemoria su: verifica RASD, autodichiarazione mensile compensi, UNILAV arbitri trimestrale, assemblea e bilancio, 5x1000, rinnovo polizza) con link alla fonte e "chi e' responsabile" | Un presidente volontario non ha un commercialista che glielo ricorda. Lacuna L4 | M | Zero, ma **manutenzione**: le norme cambiano (circa 2 ore/trimestre) | Se una data e' sbagliata si crea danno: scrivere "promemoria informativo, verifica con il tuo consulente", mostrare la data di ultimo controllo | **A** | Idea n.3. Date da validare con un commercialista prima del rilascio. Per es.: scadenze UNILAV 30/4, 30/7, 30/10, 30/1 citate da [Studio Carafa](https://www.studiopaghecarafa.it/news/riforma-sport-obblighi-per-asd-e-ssd/) |
| B4 | **Riconciliazione bonifici da CSV estratto conto** (abbina per causale/importo "Quota novembre - Rossi") | Elimina il controllo manuale riga per riga | M | Zero | Causali scritte male: richiedere conferma umana per i match incerti | A | Evita integrazioni bancarie a pagamento |
| B5 | **Export per il commercialista** (prima nota CSV, elenco ricevute, registro quote, compensi per collaboratore) | Il commercialista smette di rincorrere il tesoriere | S | Zero | Formato non standard: chiedere a 1-2 commercialisti cosa vogliono | M | Alternativa onesta al non fare contabilita' |
| B6 | **Rollover di stagione** ("nuova stagione 2027/28": copia squadre, azzera presenze, rinnovo quote e documenti in blocco) | Giugno-settembre e' il picco di lavoro: fare tutto in 1 click | M | Zero | Errori di migrazione: anteprima e annulla | A | Va fatto prima di giugno 2027 |
| B7 | **Messaggi pronti** (convocazione, sollecito quota, cambio orario) in italiano, tono educato, copia in un tap per WhatsApp; versione "gentile / ferma" per i solleciti | Il dirigente non litiga piu' con il genitore moroso scrivendo di getto | S | Zero (template, niente LLM) | Basso | M | Versione AI in (c) |
| B8 | **Suggerimenti a regole** (non AI): "a 48 ore dalla gara hai 6/12 conferme: con 2 certificati scaduti rischi di non avere il numero minimo"; "3 assenze consecutive di Sara" | Allenatore allertato prima del problema | M | Zero | Falsi allarmi: soglie configurabili | M | Si chiama "assistente", e' una query SQL |
| B9 | **Report stagione per genitore** (PDF: presenze, partite, voto medio, nota dell'allenatore) | Regalo di fine stagione: marketing gratuito dei genitori verso altri genitori | S | Zero | Dati su minori: solo al genitore collegato | M | Passaparola |
| B10 | **Calendario ICS personalizzato** per famiglia (ogni figlio, ogni squadra, in un solo feed) | Un solo calendario per fratelli in squadre diverse | S | Zero | Link con token: rendere revocabile | M | Gia' parzialmente in SPEC (iCal) |
| B11 | **Sconti famiglia** (secondo figlio -X%), regole di quota per fascia (U14, Serie D) | Le ASD reali fanno cosi'; i prodotti generalisti li gestiscono male (ipotesi) | M | Zero | Regole complesse: partire con un sconto fisso | M | |
| B12 | **Trasferte con car pooling** tra genitori (offro/cerco posti) | Risolve un problema continuo e litigioso | M | Zero | Responsabilita' sul trasporto minori: solo coordinamento, nessuna assicurazione | M | Modulo Trasferte gia' in SPEC |
| B13 | **Firma semplice per modulistica** (liberatorie, privacy) con OTP via email, archiviata con data e IP | Meno carta, meno inseguimenti a bordo campo | M | Zero | Valore legale della firma semplice: far validare un consulente. Non vendere come "firma digitale" | M | |
| B14 | **Modalita' "una squadra"**: onboarding in meno di 5 minuti con una sola squadra per l'allenatore che vuole provare senza la societa' | Canale di ingresso dal basso: l'allenatore porta il prodotto al presidente | M | Zero | Dati duplicati/privacy: l'allenatore diventa titolare? Chiarire (vedi 03) | A | Il piu' virale in teoria, ma da testare |

### (c) Richiede budget (non fare ora)

| ID | Idea | Valore | Diff. | Costo gest. | Rischio | Impatto |
|---|---|---|---|---|---|---|
| C1 | **WhatsApp Business API / SMS** per convocazioni dirette | Raggiunge anche chi non apre mai l'app | M | Pagamento a messaggio (prezzi non verificati in questa ricerca) | Template da approvare, costi imprevedibili | A |
| C2 | **Assistente AI** per bozze di comunicazioni e convocazioni, "scrivimi il messaggio ai genitori del 14" | Risparmia tempo in scrittura | M | A consumo (costo per messaggio non verificato in questa ricerca) | **Non inviare dati di minori o sanitari a servizi esterni** senza DPA e minimizzazione; per il 90% dei casi bastano i template B7 | M |
| C3 | **OCR del certificato medico** (foto, estrae data di scadenza e tipo agonistico/non agonistico) | Elimina l'inserimento a mano | M | A consumo | **Il certificato e' dato sanitario**; mandarlo a un'API esterna aumenta il rischio GDPR. Alternativa a costo zero: l'utente scrive la data (B2/A2) | M |
| C4 | **Pagamenti online integrati** (Stripe/Satispay/PayPal) con riconciliazione automatica | Addio solleciti manuali | M | Commissioni a transazione (SPEC: Fase 3). Spond chiede 1,25-2,5% + 0,10-0,20 EUR; sono i prezzi di riferimento ([fonte](https://help.spond.com/app/en/articles/118091-payments-costs-in-the-spond-app)) | Aspetti fiscali e KYC; non assumerti responsabilita' sui fondi | A |
| C5 | **App nativa iOS/Android + push** | Notifiche affidabili | L | Store: costi di account, supporto continuo (importi non verificati) | Fuori ambito SPEC. Il PWA con link B1 copre il 70% (ipotesi) | M |
| C6 | **Integrazione con portali federali** (es. tesseramento FIPAV online) | Una sola anagrafica | L | Dipende dall'esistenza di API: **non verificata**, probabilmente non pubblica | Alto: dipendenza da terzi | A (se fattibile) |
| C7 | **Revisione legale** dei documenti privacy / nomina a responsabile del trattamento | Fiducia delle societa' | S | Onorario di un legale/DPO (importo non stimato) | Indispensabile prima di passare da pilota a clienti paganti | A |
| C8 | **Segnapunti live e statistiche di gara in tempo reale** (come Koach) | Per allenatori evoluti | L | Tempo molto alto | Concorrere con un prodotto verticale gia' maturo | B |

## 2. Matrice impatto / sforzo

| | Sforzo basso (S) | Sforzo medio (M) | Sforzo alto (L) |
|---|---|---|---|
| **Impatto alto** | A2 certificati+blocco | **B1 link senza login**, **B2 import assistito**, **B3 scadenzario**, A1, A3, B4, B6, B14 | C6 (se fattibile), C5 |
| **Impatto medio** | B5, B7, B9, B10, A6 | A4, A5, B8, B11, B12, B13 | - |
| **Impatto basso** | - | - | C8 |

Lettura: investire il poco tempo del fondatore nella riga "impatto alto / sforzo medio": B1, B2, B3, piu' A1-A3 gia' in SPEC. Il resto aspetta i dati dei pilota.

## 3. Ordine consigliato (dopo il prototipo)

1. **B1** link senza login (+ B7 messaggi pronti, 1 giorno in piu' sul lavoro).
2. **B2** import assistito + **B5** export commercialista (mentre si fa l'onboarding dei pilota).
3. **B3** scadenzario adempimenti, con data validata da un commercialista (gratis: chiedere a uno dei pilota se ne ha uno amico).
4. **B6** rollover di stagione (entro aprile 2027, prima del picco di giugno).
5. **B4** riconciliazione CSV (se i pilota dicono che le quote sono il dolore principale).
6. Tutto il resto solo se un pilota lo chiede due volte.

## 4. Idee scartate (e perche')

- **"AI che gestisce la societa' da sola":** promessa che non si puo' mantenere; il tuo motto e' "automazioni visibili e disattivabili" (SPEC sez. 8). Meglio meno magia, piu' fiducia.
- **Social/feed della squadra:** duplica Instagram/WhatsApp, costa moderazione.
- **Marketplace di sponsor:** serve massa critica che non hai.
- **Gamification dei punti:** carina, ma nessun dirigente la chiedera'.

## 5. Ipotesi che queste idee danno per scontate

- I dirigenti vogliono rispondere via WhatsApp (B1): da testare nelle interviste.
- Gli adempimenti della riforma sono davvero un dolore sentito (B3): fonti sono articoli di studi professionali che hanno interesse a venderlo.
- Le automazioni vanno bene in "bozza da approvare" nelle prime settimane (A3).
