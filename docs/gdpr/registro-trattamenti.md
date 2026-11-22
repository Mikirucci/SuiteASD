# Registro dei trattamenti (art. 30 GDPR) — modello precompilato

> **BOZZA.** Compilato sull'analisi del codice del 22/11/2026 (vedi `docs/GDPR.md` §2). Non è un parere legale. I campi `[...]` li completa la società o il gestore. Il registro deve essere **in forma scritta, anche elettronica**, aggiornato e mostrato al Garante su richiesta. Le associazioni che trattano dati particolari sono tra i soggetti obbligati (art. 30(5) e FAQ del Garante dell'8 ottobre 2018: <https://www.garanteprivacy.it/it/registro-delle-attivita-di-trattamento>).

## Parte 1 — Registro del TITOLARE (società sportiva) — art. 30(1)

**Titolare:** [società], [sede], [contatti]. **Contitolare:** nessuno. **DPO:** [non designato / nome]. **Responsabile:** [gestore SuiteASD] (nomina art. 28 del `[data]`, versione `[x]`).

Termini di cancellazione e basi giuridiche sono **proposte** (da confermare, vedi `decisioni-aperte.md`).

| # | Trattamento | Finalità | Categorie di interessati | Categorie di dati | Destinatari | Extra-UE | Conservazione | Misure di sicurezza |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Anagrafica dei tesserati e delle squadre | Gestione del rapporto associativo, tesseramento | Atleti (anche minori) | Nome, cognome, data/luogo di nascita, sesso, CF, email, telefono, indirizzo, ruolo in campo, taglia divisa, stato, note | Segreteria, admin, allenatori/staff (sola lettura); gestore e sub-responsabili; federazione/ente per tesseramento | No | Durata del rapporto + [2 anni] | Accesso per ruolo, HTTPS, backup cifrati, isolamento per società |
| T2 | Account e accessi | Autenticare e proteggere l'accesso | Utenti (tutti i ruoli) | Email, hash password, nome, telefono, ultimo accesso, sessioni (user-agent), dispositivi per notifiche | Gestore e sub-responsabili | No (Resend per email, vedi T9) | Rapporto; sessioni scadute: +7 giorni | Hash password, token ruotati/revocati, rate limit |
| T3 | Genitori/tutori dei minori | Rapporto con la famiglia; responsabilità genitoriale | Genitori, tutori | Nome, contatti, rapporto, collegamento al minore | Come T1 | No | Finché il minore è tesserato | Come T1 |
| T4 | **Certificati medico-sportivi** | Verifica idoneità e scadenza | Atleti, anche minori | **Dato sulla salute**: tipo, data rilascio e scadenza, file | Admin/segreteria (file); allenatori/staff (elenco/stato) `[da ridurre]`; interessato/genitore | No | Scadenza + [1 stagione] | Download limitato, backup cifrati, `[cifratura a riposo e registro accessi: da fare]` |
| T5 | Quote, pagamenti e ricevute | Contabilità, solleciti | Atleti, genitori/pagatori | Importo, scadenza, pagata il, metodo, nome/email del pagatore, riferimento, n. ricevuta | Segreteria/admin; consulente fiscale `[se applicabile]` | No | **10 anni** | Come T1 |
| T6 | Contabilità e sponsor | Prima nota, sponsorizzazioni | Referenti sponsor, fornitori | Nome referente, email, telefono, importi, contratti, allegati | Admin, consulente fiscale | No | 10 anni | Come T1 |
| T7 | Presenze e convocazioni | Organizzare allenamenti e gare | Atleti | Presenza, note, risposta, motivo del rifiuto (testo libero) | Allenatori, staff, admin | No | [stagione + 1] | Come T1; testo libero da non usare per salute |
| T8 | Valutazioni e statistiche | Crescita sportiva e formazioni | Atleti, minori | Voto 1–10, note, statistiche per partita | Allenatori, admin | No | [stagione + 1], poi aggregazione | Come T1 |
| T9 | Notifiche ed email di servizio | Informare di scadenze, convocazioni, inviti, solleciti | Utenti | Titolo/testo della notifica, stato, preferenze, canale, esito di invio | Gestore, **Resend** (email) | **USA** (DPF/SCC) | 30–90 giorni | TLS, DPA con il fornitore |
| T10 | Bacheca/annunci | Comunicazioni della società | Atleti, genitori, staff | Testo, autore, squadra | Utenti della società | No | [1 anno] | Accesso per ruolo |
| T11 | Arbitri e designazioni | Gestire le gare e i compensi | Arbitri | Nome, email, telefono, qualifica, compenso, allegati | Admin, segreteria | No | 10 anni per compensi; anagrafica [2 anni] | Come T1 |
| T12 | Logistica (sedi, divise, trasferte) | Organizzazione | Atleti (taglia), partner | Taglia, trasferte, indirizzi | Admin, staff | No | [stagione + 1] | Come T1 |
| T13 | Convenzioni (promozioni) | Vantaggi per i tesserati | Partner (persone fisiche), tesserati | Nome partner, condizioni, logo | Tesserati della società | No | Validità + 1 anno | Come T1 |
| T14 | Log tecnici e sicurezza | Sicurezza e prevenzione abusi | Visitatori, utenti | IP, user-agent, URL (log del proxy); IP nei contatori del rate limit (RAM) | Gestore | No | Log [30 giorni]; contatori: finestra breve | Accesso ristretto al VPS |
| T15 | Copie di sicurezza | Continuità del servizio | Tutti | Tutte le categorie (cifrate con restic) | **Backblaze B2** (sub-responsabile) | **Società USA, dati in UE** (DPA/SCC/DPF) | 7 giornalieri, 4 settimanali, 6 mensili | Cifratura restic, chiave fuori dal VPS, controllo integrità |
| T16 | Consensi e richieste degli interessati *(da introdurre)* | Dimostrare consensi, gestire diritti | Utenti | Tipo, versione, data, richieste e esiti | Admin | No | 5 anni | Come T1 |

## Parte 2 — Registro del RESPONSABILE (gestore SuiteASD) — art. 30(2)

**Responsabile:** [ragione sociale o nome], [sede], [contatti]; **DPO:** [non designato / nome].

| Elemento | Contenuto |
| --- | --- |
| Titolari per conto dei quali si tratta | Elenco delle società clienti (da tenere aggiornato: `identity.societies`) `[estrarre periodicamente]` |
| Categorie di trattamenti | Hosting e conservazione; consultazione/aggiornamento tramite il Servizio; invio di notifiche/email; copie di sicurezza; cancellazione/restituzione (le categorie T1–T16 sopra) |
| Trasferimenti extra-UE | Resend (USA, DPF/SCC); Backblaze (società USA; dati in UE, SCC/DPF) |
| Misure di sicurezza (art. 32) | HTTPS/HSTS e intestazioni di sicurezza; isolamento per società (`society_id`); permessi per ruolo; hash delle password; token di rinnovo ruotati e revocabili; rate limit; backup giornalieri cifrati con controllo; segreti fuori dal repository; `[cifratura a riposo, registro accessi, 2FA admin: da attuare]` |
| Sub-responsabili | Aruba (hosting), Resend (email), Backblaze (backup) — elenco pubblico |
| Violazioni | Registro in `procedura-data-breach.md` |

## Parte 3 — Registro del gestore come TITOLARE autonomo (dati degli amministratori e fatturazione)

| Trattamento | Finalità | Dati | Base | Conservazione |
| --- | --- | --- | --- | --- |
| Contratto di servizio e fatturazione | Erogare e fatturare il Servizio | Nome e contatti del legale rappresentante/admin, dati fiscali della società | 6(1)(b), 6(1)(c) | 10 anni |
| Supporto e sicurezza del servizio | Assistere gli utenti, indagare incidenti | Email, log tecnici | 6(1)(f) | [12 mesi] |
