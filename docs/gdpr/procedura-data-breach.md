# Procedura di violazione dei dati personali (data breach)

> **BOZZA da far validare.** Non è un parere legale. Basi: GDPR art. 4(12), 33, 34; Linee guida EDPB 9/2022; pagina del Garante sul data breach (<https://www.garanteprivacy.it/it/data-breach>), con notifica tramite la procedura telematica <https://servizi.gpdp.it/databreach/s/1> (in uso dal 1° luglio 2021) `[verificare che sia ancora il canale vigente]`. Consultate il 22/11/2026.

**Che cos'è.** Una violazione di sicurezza che comporta, anche per errore, **distruzione, perdita, modifica, divulgazione non autorizzata o accesso** a dati personali. Esempi in SuiteASD: un account admin compromesso; un certificato medico visibile a chi non deve; un backup o un disco smarrito o non cifrato; email inviata alla persona sbagliata con dati di un minore; database esposto; ransomware sul VPS; invio di un'esportazione a un indirizzo errato; perdita di dati senza backup.

**Ruoli.** *Titolare* = società (notifica al Garante e agli interessati). *Responsabile* = gestore SuiteASD (avvisa il titolare e assiste). Referente per il gestore: **[nome, telefono reperibile, email sicurezza@…]**. Per ogni società: contatto privacy **[email dell'admin]** (campo da raccogliere alla registrazione).

## Passi

| # | Quando | Chi | Azione |
| --- | --- | --- | --- |
| 1 | **T0** (si viene a conoscenza) | Chiunque | Segnalare subito al referente del gestore. **Non cancellare nulla**: conservare log, copie, email. Annotare ora e come si è saputo |
| 2 | **T0 + 2 ore** | Gestore | **Contenere**: revocare sessioni/chiavi, bloccare gli account, isolare il VPS, ruotare i segreti (`JWT_SECRET`, `POSTGRES_PASSWORD`, `RESEND_API_KEY`, `B2_*`, `RESTIC_PASSWORD` se esposti), ripristinare i permessi |
| 3 | **T0 + 8 ore** | Gestore | **Valutare**: quali dati, quanti interessati e di quali società, minori? dati sanitari? cifrati? Stimare il rischio (nessuno / rischio / **rischio elevato**). Aprire una voce nel registro delle violazioni |
| 4 | **Entro 24 ore** da T0 | Gestore → società | **Avvisare ogni società coinvolta** (art. 33(2): senza ingiustificato ritardo) con: natura, categorie e numero approssimativo di interessati/registrazioni, conseguenze probabili, misure prese e proposte, contatto |
| 5 | **Entro 72 ore** dalla conoscenza *della società* | Società (con assistenza del gestore) | Se la violazione **può presentare un rischio per i diritti e le libertà** (con dati di minori o sanitari quasi sempre): **notificare al Garante** dal portale; se oltre 72 ore, motivare il ritardo. Se **non** c'è rischio, non si notifica, ma si documenta la valutazione (art. 33(5)). La notifica può essere fatta in fasi |
| 6 | Senza ritardo | Società | Se il rischio è **elevato**: **comunicare agli interessati** (art. 34), in linguaggio semplice, con consigli pratici (es. cambia la password); per i minori ai genitori. Non serve se i dati erano cifrati in modo robusto, se le misure successive escludono il rischio o se sarebbe sproporzionato (allora comunicazione pubblica) |
| 7 | Dopo | Gestore + società | **Rimediare** e imparare: causa radice, correzione, test, aggiornamento delle misure e del registro dei trattamenti/DPIA |

## Contenuto della notifica al Garante (art. 33(3))

Natura della violazione, categorie e numero approssimativo di interessati e di registrazioni; contatto privacy/DPO; conseguenze probabili; misure adottate o proposte.

## Registro delle violazioni (art. 33(5))

Ogni violazione, anche non notificata, con: data/ora di scoperta, descrizione, dati e interessati, valutazione del rischio, decisione (notificare o no, perché), misure, esito.

| Data/ora | Descrizione | Dati/interessati | Rischio | Notificata al Garante? | Comunicata agli interessati? | Misure | Chiusura |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

## Cose da preparare prima (altrimenti il termine non si rispetta)

1. Un **reperibile** con telefono e una casella email letta ogni giorno; sostituto in caso di ferie.
2. L'elenco aggiornato dei **contatti privacy di ogni società** (nell'app, alla registrazione).
3. Accesso ai **log** (applicazione, Caddy) con retention adeguata, e capacità di sapere *chi* ha letto *che cosa* (registro accessi, vedi `docs/GDPR.md` P0-9, P1-3).
4. Bozza di comunicazione agli interessati e alle società (italiano, due paragrafi).
5. Prova semestrale (esercizio simulato) e **prova di ripristino** del backup.
