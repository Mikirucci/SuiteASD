# Decisioni aperte (titolare del progetto o consulente legale)

> Elenco derivato da `docs/GDPR.md`. "U" = decide il titolare del progetto; "L" = serve un avvocato/DPO; "C" = serve un commercialista; "T" = verifica tecnica del team. Priorità come nella checklist: **P0** blocca l'uso con dati reali.

| # | Decisione / verifica | Chi | Priorità | Perché conta |
| --- | --- | --- | --- | --- |
| 1 | **Chi è il "gestore"** giuridicamente (ditta individuale, società, associazione), sede, email privacy e sicurezza | U, L | P0 | Senza soggetto chiaro non si può firmare la nomina art. 28 né rispondere ai diritti |
| 2 | **Validazione legale** di informativa, nomina, termini del servizio, procedura breach, registro | L | P0 | Tutti i testi sono bozze |
| 3 | **Soglia dei 14 anni** (art. 2-quinquies Codice privacy): una scheda parlamentare cita una proposta di abrogazione del comma 1; verificare il testo vigente su Normattiva e se si applica ai trattamenti di SuiteASD o solo al consenso per servizi online | L | P0 | Determina chi consente per un ragazzo di 14–17 anni |
| 4 | **Iscrizione dei minorenni**: la società deve far firmare ai genitori l'iscrizione di *tutti* i minorenni (non solo under 14), a prescindere dal consenso privacy? Come si registra | L, U | P0 | Capacità di agire e responsabilità genitoriale |
| 5 | **Verifica della responsabilità genitoriale**: autodichiarazione (proposta) o controllo con documenti/conferma della società | U, L | P0 | Un genitore falso può iscrivere un minore |
| 6 | **Base giuridica art. 9 per i certificati**: 9(2)(b), 9(2)(d) o consenso esplicito 9(2)(a); verificare le regole per le ASD e il tipo di documento (idoneità vs referto) | L | P0 | Cambia informativa e diritto alla cancellazione |
| 7 | **Durate di conservazione** (certificati, ex tesserati, presenze, valutazioni, log, notifiche): approvare o cambiare i valori proposti in `GDPR.md` §2.5 | U, L, C | P0 | Il job di pulizia le applica |
| 8 | **Obblighi contabili reali** delle società (art. 2220 c.c., art. 22 D.P.R. 600/1973, regime L. 398/1991, Terzo settore): quali dati di pagatore restano 10 anni e quali si anonimizzano | C, L | P0 | Cancellazione e obblighi fiscali sono in tensione |
| 9 | **DPO**: serve per il gestore? (WP243; Garante) Documentare la valutazione; designare comunque un referente privacy | L, U | P0 | Art. 37 |
| 10 | **DPIA**: chi la firma (gestore), che metodo (Garante / CNIL), quando si riesamina | L, U | P0 | Art. 35 e elenco Garante n. 467/2018, punto 6 |
| 11 | **Foto e video**: introdurli o no. Se sì, solo con consenso separato; per under 14 di **entrambi** i genitori; verificare il provvedimento originale del Garante | U, L | P1 | Oggi l'app non li tratta |
| 12 | **Cifratura a riposo**: LUKS sul VPS (Aruba) o cifratura applicativa dei file; gestione della chiave | T, U | P0 | Dati sanitari di minori |
| 13 | **Chi può vedere cosa** nei documenti: oggi ALLENATORE e STAFF vedono l'elenco documenti di tutta la società. Ridurre a squadra/stato? | U | P0 | Minimizzazione, art. 25 |
| 14 | **Resend**: regione di elaborazione, DPA firmato, DPF attivo (verifica su dataprivacyframework.gov), subprocessors <https://resend.com/legal/subprocessors>; oppure provider UE | T, L | P0 | Trasferimento USA |
| 15 | **Backblaze B2**: creare il bucket in **EU Central**, accettare il DPA (modulo controller→processor), controllare la lista sub-responsabili (dati di account anche fuori UE) | T | P0 | Trasferimento e residenza dei backup |
| 16 | **Aruba**: contratto con clausole art. 28 e sede del VPS (Italia) | U | P0 | Hosting |
| 17 | **Contenuto dei campi liberi** (note del tesserato, motivo di assenza, valutazioni): togliere i campi liberi per i motivi di assenza e sostituirli con scelte | U | P1 | Possibili dati sulla salute non voluti |
| 18 | **Registro degli accessi** ai dati sensibili: livello di dettaglio e retention (12 mesi proposti) | U, T | P0/P1 | Art. 32 e accountability |
| 19 | **Cookie/localStorage**: confermare che il token di rinnovo è strumento tecnico (no banner) leggendo le Linee guida 2021 (doc. web 9677876) e con scansione del sito in produzione | L, T | P0 | Evitare sanzioni su cookie |
| 20 | **Log del proxy** (IP): retention e rotazione dei log Docker | T | P1 | Oggi non è configurata |
| 21 | **Notifiche push**: se si introducono FCM/APNs, aggiungere al registro e all'informativa (USA) | T, L | P1 | Oggi non risultano implementate |
| 22 | **Dati su condanne e reati** (casellario per chi lavora con minori / safeguarding D.Lgs. 39/2021): fuori dall'app oggi; se si vuole gestirli, serve base giuridica (art. 10) | L | P2 | Evitare un uso improprio |
| 23 | **Forma dell'accettazione online** della nomina (clickwrap): sufficiente con versione/data/utente? Serve firma digitale? | L | P0 | Valore probatorio |
| 24 | **Più società con lo stesso referente** (contitolarità, art. 26) e **account multi-società**: informare ogni società; separazione dei dati | L | P1 | Modello reale delle società clienti |
| 25 | **Tempi di risposta ai diritti**: interno 30 giorni; accordo con le società su chi risponde al gestore (5 giorni lavorativi proposti) | U | P0 | Art. 12(3) |
| 26 | **Prova del ripristino** dei backup e frequenza | T | P1 | Art. 32(1)(c)(d) |
| 27 | **Eventuale assicurazione** per violazioni dei dati e responsabilità civile del gestore | U | P2 | Rischio economico |
| 28 | **Pubblicazione della lista sub-responsabili** e canale di preavviso | U, T | P0 | Art. 28(2) |
| 29 | **Verificare le fonti marcate `[DA VERIFICARE]`** in `GDPR.md` (D.M. certificati, D.Lgs. 36/2021, art. 22 DPR 600/1973, Codice privacy artt. 2-sexies/2-septies, provvedimento del Garante sulle foto dei minori, provvedimento del 2022 sull'idoneità sportiva) | L | P0 | Il documento non ha letto i testi integrali di queste norme |

**Regola di lavoro proposta:** nessuna società reale carica dati personali di minori o certificati finché i punti P0 1, 2, 7, 12, 14, 15, 16 e 28 non sono chiusi (fase pilota con dati di prova fino ad allora).
