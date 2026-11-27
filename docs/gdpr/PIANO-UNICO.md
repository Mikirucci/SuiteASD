# Piano unico GDPR di SuiteASD

> Unisce le due ricerche del 22/11/2026: **[R1]** `docs/GDPR.md` (ricerca del team sul codice e sulle fonti) e **[R2]** «Documento di conformità privacy — SuiteASD» v1.0 (ricerca del titolare del progetto). Non è un parere legale: ogni testo che finisce davanti a un utente va validato da un avvocato o da un DPO prima dell'uso con dati reali.
>
> Come si usa: la **§2** elenca le decisioni (ognuna dice cosa sblocca). Le **pagine** di Termini, Privacy e consensi (§3) si scrivono **solo dopo** le decisioni da cui dipendono. Il **lavoro sul prodotto** (§4) è diviso in ciò che si può fare subito e ciò che aspetta le decisioni.

## 1. Confronto delle due ricerche

### 1.1 Dove concordano (diventano regole del piano)

| Tema | Regola |
| --- | --- |
| Ruoli | La società sportiva è **titolare**; il gestore di SuiteASD è **responsabile (art. 28)** e va nominato per iscritto da ogni società. Per le finalità proprie (account dell'amministratore, fatturazione del servizio, sicurezza, prevenzione abusi, comunicazioni di servizio) il gestore è **titolare autonomo**. La contitolarità (art. 26) solo se un giorno si fanno iniziative comuni. |
| Sub-responsabili | Aruba (hosting), Resend (email, USA), Backblaze B2 (backup). Per ognuno: DPA, ubicazione, trasferimenti extra-UE e garanzie, misure, conservazione, cancellazione, contatto incidenti. |
| Minori | Dati minimi; il genitore è l'interlocutore; sotto i 14 anni serve il genitore (art. 2-quinquies, già bloccato oggi all'iscrizione: `guardian_required`); informativa separata, breve e chiara per i minori. |
| Certificati medici | Dato sulla salute (art. 9). Trattare il meno possibile. |
| Cookie | Il token di sessione in `localStorage` è uno strumento tecnico: **nessun banner**, ma un'informativa che lo descriva. Analytics o tracker futuri: consenso preventivo. |
| DPIA | Da fare prima del lancio (minori + salute + valutazioni). |
| Diritti | Il titolare (la società) risponde; SuiteASD dà gli strumenti: export, rettifica, cancellazione o anonimizzazione, audit. La cancellazione non deve rompere gli obblighi fiscali: soft delete, anonimizzazione, separazione dei dati da conservare per legge. |
| Data breach | Procedura scritta; avviso tempestivo alla società; supporto per la notifica al Garante entro 72 ore. |
| Backup | Cifrati, non archivio permanente, finestra di conservazione scritta. |
| Email | Convocazioni, scadenze, ricevute e sicurezza sono email di servizio (contratto). Newsletter e promozioni solo con consenso separato. |

### 1.2 Cose che ha solo R2 (entrano nel piano)

| Punto | Dove finisce |
| --- | --- |
| **Autenticazione a due fattori per gli amministratori** (P0 in R2) | §4.1 Lavoro subito, voce A3 |
| **DPO fortemente raccomandato per il gestore** | Decisione D6 con la raccomandazione di nominarlo |
| **Informative per 9 categorie** (amministratori, segreteria e staff, allenatori, genitori, atleti minori, atleti maggiorenni, arbitri e collaboratori, sponsor e partner, visitatori del sito) | §3, P-3: un'informativa a moduli |
| Certificato: **solo esito, data di rilascio, scadenza**; l'allegato solo se strettamente necessario | Decisione D4 |
| Visibilità di calendario e convocazioni **per squadra o ruolo** | §4.1 A5 |
| Comunicazioni ai minori **preferibilmente tramite il genitore** | Decisione D3 |
| Modelli di autorizzazione per **foto e video** e per **trasferte e attività dei minori** | §3, P-7 e P-8 |
| **Offboarding e cancellazione di una società**, pen test, SLA e continuità, NIS2 e Cyber Resilience Act | §4.2 e §5 |
| Federazioni ed enti di promozione come **terzi titolari** | Registro dei trattamenti (§5) e informativa |

### 1.3 Cose che ha solo R1 (restano nel piano)

| Punto | Dove finisce |
| --- | --- |
| Fotografia del codice: oggi non c'è nessuna accettazione registrata né informativa; allenatori e staff vedono i documenti di **tutta** la società; nessun registro degli accessi ai dati sanitari; certificati non cifrati sul disco | §4 |
| La soglia dei 14 anni potrebbe essere stata toccata da una proposta di abrogazione: va letto il testo vigente | D3 |
| La responsabilità del genitore oggi è un'**autodichiarazione** | D3 |
| Campi di testo libero (motivo di assenza, note) che possono contenere dati di salute non voluti | §4.1 A6 |
| Fonti da verificare marcate `[DA VERIFICARE]` | §5 |

### 1.4 Dove le due ricerche, e il codice, non coincidono (da decidere)

| Tema | R1 | R2 | Codice oggi (ADR-0021) | Proposta del piano |
| --- | --- | --- | --- | --- |
| Notifiche e email scritte | 90 giorni (lette), log tecnici 30 giorni | «log tecnici brevi» | **365 giorni** | **90 giorni** per notifiche ed email; il log di consegna va con loro. Il codice va allineato (§4.1 A7). |
| Inviti chiusi | 30 giorni | — | **90 giorni** | **30 giorni** (contengono l'email dell'invitato) |
| Sessioni e link monouso | scadenza + 7 giorni | — | sessioni + 30 giorni, link + 7 | Si tiene com'è: 30 giorni servono a riconoscere un token rubato che torna (ADR-0019) |
| Log di sicurezza | proxy: 30 giorni | 6–12 mesi | non configurati | **6 mesi** per i log di sicurezza, **30 giorni** per i log del proxy con l'IP |
| Export dei dati | P0 (diritto di accesso) | P1 | non c'è | **P0**: senza export non si risponde al diritto di accesso entro 30 giorni |
| Conservazione automatica | P0 | P1 | fatta in parte | resta P0, completata con ex tesserati, certificati e documenti (D5) |

## 2. Decisioni (prima delle pagine)

Ogni decisione dice **chi** decide (U = titolare del progetto, L = legale o DPO, C = commercialista), la **raccomandazione** del piano e **cosa sblocca**. Finché una decisione è aperta, ciò che sblocca non si pubblica.

| # | Decisione | Chi | Raccomandazione | Sblocca |
| --- | --- | --- | --- | --- |
| D1 | **Chi è il gestore** giuridicamente (persona, ditta, società), sede, email privacy, email sicurezza | U, L | Un soggetto con partita IVA; due caselle distinte (`privacy@`, `sicurezza@`) | Tutte le pagine (P-1…P-8), l'accordo art. 28 |
| D2 | **Accettazione dell'accordo art. 28** da parte della società: online (clic con versione, data, utente, IP) è sufficiente? | L | Clic alla registrazione con prova salvata; firma digitale solo se il legale lo chiede | P-2, registrazione della società (A9) |
| D3 | **Minori**: testo vigente della soglia dei 14 anni; tutti i minori iscritti dal genitore o solo gli under 14; come si prova di essere genitore; i 14–17 anni ricevono comunicazioni proprie? | L, U | Iscrizione e consensi di **tutti** i minori dal genitore; autodichiarazione del genitore registrata con data e versione, confermabile dalla società; comunicazioni al genitore, anche al minore 14–17 solo se il genitore lo permette | P-3 (versione minori), P-7, P-8, iscrizione (A10) |
| D4 | **Certificato medico**: base giuridica (art. 9(2)(b), (d) o consenso) e se conservare l'**allegato** | L | Salvare **esito, data di rilascio, scadenza**; allegato **facoltativo** per società, cifrato e visibile solo alla segreteria; cancellato a scadenza + 1 stagione | P-3 (sezione salute), modifica del modulo documenti (B4) |
| D5 | **Conservazione** di tutte le categorie (§1.4 e R1 §2.5): ex tesserati, certificati, presenze, valutazioni, pagamenti, log, backup | U, L, C | Ex tesserati: anagrafica minima 2 anni dopo l'ultima stagione; presenze e valutazioni: stagione + 1; pagamenti e ricevute: 10 anni con il pagatore ridotto all'essenziale; backup 6 mesi; il resto come §1.4 | P-3, P-5, lavoro di pulizia (A7, B5) |
| D6 | **DPO** del gestore | L, U | **Nominarlo** (esterno va bene), come raccomanda R2 | P-1, P-3 (contatti), DPIA |
| D7 | **Fornitori**: Resend (regione, DPA, DPF) o un fornitore email UE; B2 in **EU Central**; Aruba con clausole art. 28 e server in Italia | U, L | Resend con DPA e DPF verificato, oppure fornitore UE se il legale lo preferisce; B2 EU Central | P-4 (elenco sub-responsabili), P-3 (trasferimenti) |
| D8 | **Foto e video**: si introducono? | U | Non ora (il prodotto oggi non li tratta); quando arriveranno, consenso granulare dei genitori | P-7 (solo quando serve) |
| D9 | **Marketing e notifiche push**: il gestore farà newsletter o promozioni? | U | No per il lancio: solo email di servizio | P-6 (consensi), A8 |
| D10 | **Tempi di risposta** alle richieste: il gestore risponde alla società entro quanti giorni | U | 5 giorni lavorativi; la società risponde all'interessato entro 30 | P-2, procedura diritti |

## 3. Pagine e testi che derivano dalle decisioni

Ogni pagina è **pubblica**, ha una **versione** e una **data**, e ogni versione resta consultabile. Le accettazioni salvano la versione accettata (A9). Si scrivono in italiano semplice, partendo dalle bozze in `docs/gdpr/`.

| # | Pagina | Indirizzo | Dipende da | Dove compare nell'app | Si accetta? |
| --- | --- | --- | --- | --- | --- |
| P-1 | **Termini di servizio** (contratto tra gestore e società) | `/termini` | D1, D2, D10 | Registrazione della società, piè di pagina | Sì, alla registrazione |
| P-2 | **Accordo di trattamento art. 28** (bozza: `nomina-responsabile-dpa.md`) | `/accordo-trattamento` | D1, D2, D5, D7, D10 | Registrazione della società, impostazioni della società | Sì, alla registrazione e a ogni nuova versione |
| P-3 | **Informativa privacy** della società verso i suoi interessati, a moduli per categoria (genitori, atleti maggiorenni, atleti minori in versione breve, staff e allenatori, arbitri e collaboratori, sponsor e partner). Bozza: `informativa-privacy.md` | `/privacy` (con sezioni) | D1, D3, D4, D5, D6, D7 | Iscrizione con codice, accettazione dell'invito, area personale, piè di pagina | Presa visione registrata (non un consenso) |
| P-4 | **Sub-responsabili** (elenco pubblico e come si viene avvisati dei cambi) | `/sub-responsabili` | D1, D7 | Piè di pagina, accordo art. 28 | No |
| P-5 | **Privacy policy del gestore** (visitatori del sito, account amministratore, fatturazione, sicurezza) | `/privacy-gestore` | D1, D5, D6 | Piè di pagina, registrazione | Presa visione |
| P-6 | **Cookie e archiviazione nel browser**: oggi solo il token di sessione in `localStorage` (finalità, durata 30 giorni, come cancellarlo con l'uscita) | `/cookie` | D1 | Piè di pagina | No (strumento tecnico) |
| P-7 | Modello di **autorizzazione foto e video** | modulo nell'area personale | D3, D8 | Solo quando si introducono le foto | Sì, consenso granulare e revocabile |
| P-8 | Modello di **autorizzazione per trasferte e attività dei minori** | modulo nell'area personale | D3 | Iscrizione o prima trasferta | Sì, dal genitore |

## 4. Lavoro sul prodotto

### 4.1 Si può fare subito (non dipende da testi legali)

| # | Lavoro | Perché | Priorità |
| --- | --- | --- | --- |
| A1 | **Export dei dati di una persona** (JSON leggibile + CSV): account, profilo, schede di tesserato e figli, contatti di emergenza, documenti (dati, non i file), quote e ricevute, convocazioni e presenze, valutazioni, notifiche. Ogni modulo fornisce la sua parte | Diritti di accesso e portabilità (art. 15 e 20) | P0 |
| A2 | **Registro degli accessi ai dati sensibili** (chi apre un certificato o un documento, quando): tabella con conservazione 6 mesi, consultabile dall'amministratore | Art. 32, accountability; R2 §9 | P0 |
| A3 | **Autenticazione a due fattori** (TOTP) per amministratore e segreteria; facoltativa per gli altri | R2 §9, P0 | P0 |
| A4 | **Limitare chi vede i documenti**: allenatori e staff vedono solo lo stato (in regola, in scadenza, mancante) dei tesserati delle proprie squadre, mai i file | Minimizzazione (art. 25) | P0 |
| A5 | Calendario e convocazioni visibili **per squadra o ruolo** (verificare cosa vede oggi ogni ruolo e chiudere i casi in più) | R2 §4 | P1 |
| A6 | Togliere o ridurre i **campi liberi** che possono contenere dati di salute (motivo di assenza → scelte) | R1, dati di salute non voluti | P1 |
| A7 | Allineare la **pulizia automatica** ai valori del §1.4 (notifiche 90 giorni, inviti 30) e aggiungere i log; scrivere la politica di conservazione | Art. 5.1.e | P0 |
| A8 | **Registro dei consensi e delle accettazioni** (motore): tipo, versione del testo, data, chi, per conto di chi (genitore per figlio), revoca. Pronto a ricevere i testi quando arrivano | Art. 7(1), prova dei consensi | P0 |
| A9 | Pagine pubbliche **versionate** (meccanismo): una pagina per P-1…P-6 che legge il testo pubblicato e la sua versione, con lo storico | Base per §3 | P0 |

### 4.2 Dopo le decisioni

| # | Lavoro | Dipende da | Priorità |
| --- | --- | --- | --- |
| B1 | Pubblicare P-1…P-6 con i testi validati | D1, D2, D5, D6, D7 | P0 |
| B2 | **Accettazione alla registrazione della società** (Termini + accordo art. 28 + presa visione della privacy del gestore), salvata con A8; nuova accettazione quando cambia la versione | D2, B1 | P0 |
| B3 | **Iscrizione e invito**: presa visione dell'informativa; per i minori dichiarazione del genitore e consensi separati | D3, B1 | P0 |
| B4 | **Certificati**: esito + date come dati principali, allegato facoltativo per società, cifrato e visibile solo alla segreteria | D4 | P0 |
| B5 | **Cancellazione o anonimizzazione** di una persona e **offboarding di una società** (export consegnato, poi cancellazione entro 30 giorni), rispettando i 10 anni dei dati fiscali | D5 | P0 |
| B6 | **Cifratura a riposo** di file e database (disco cifrato sul VPS o cifratura dei file nell'app) e dei backup | D7 | P0 |
| B7 | Gestione consensi per marketing, foto, push quando si introducono | D8, D9 | P1–P2 |

## 5. Fuori dal software (documenti e contratti)

| Documento | Stato | Chi |
| --- | --- | --- |
| Accordo art. 28 con ogni società (P-2) | Bozza in `docs/gdpr/nomina-responsabile-dpa.md` | L |
| DPA con Aruba, Resend, Backblaze; verifica trasferimenti | Da fare | U, L |
| Registro dei trattamenti del gestore (come responsabile) e modello per le società (come titolari) | Bozza in `docs/gdpr/registro-trattamenti.md` | U, L |
| DPIA | Da fare | L, U |
| Procedura data breach | Bozza in `docs/gdpr/procedura-data-breach.md`: manca il contatto reperibile (D1) | U |
| Politica di conservazione e cancellazione | Da scrivere dopo D5 | U |
| Procedura per le richieste degli interessati | Da scrivere (D10) | U |
| Policy di sicurezza e gestione accessi, SLA e continuità | Da scrivere | U |
| Pen test e gestione delle vulnerabilità | Prima del lancio pubblico | U |
| Valutazione NIS2 e Cyber Resilience Act | P2 | L |
| Verifica delle fonti `[DA VERIFICARE]` di R1 (soglia 14 anni, D.M. certificati, D.Lgs. 36/2021, art. 22 DPR 600/1973, provvedimento sulle foto dei minori, provvedimento 2022 sull'idoneità) | Da fare | L |

## 6. Ordine di lavoro

1. **Subito, in parallelo**: decisioni D1–D10 (titolare e legale) e lavoro A1, A2, A3, A4, A7, A8, A9 (team). Nessuno dei due blocca l'altro.
2. **Appena arrivano D1, D2, D5, D6, D7**: testi validati, poi B1 e B2.
3. **Con D3 e D4**: B3 e B4.
4. **Con D5**: B5; **con D7**: B6.
5. **Prima dei dati reali** (regola di R1, confermata da R2): chiusi tutti i P0 di §4 e i documenti P0 di §5. Fino ad allora solo dati di prova.
