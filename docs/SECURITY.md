# Sicurezza di SuiteASD

Ultimo aggiornamento: 2026-10-23. Stato verificato sul codice del branch `security/upgrade-next-fastify`.

Questo documento dice tre cose: che cosa è già protetto, che cosa NON lo è ancora, e che cosa fare prima di mettere l'app in produzione con dati veri. Dove un punto non è stato verificato lo dice. Per le decisioni di progetto vedi `docs/DECISIONS.md`, per la configurazione `apps/api/.env.example`.

**Perché conta.** L'app tratta dati personali di minorenni e certificati medici (dati sulla salute, categoria particolare del GDPR, art. 9). Una fuga di questi dati è il rischio più grave del prodotto.

## 1. Stato attuale

### Accesso e sessioni
- Password con argon2id (`apps/api/src/lib/password.ts`). Lunghezza minima 8 caratteri, massima 128, nessun altro requisito.
- Token di accesso JWT di 15 minuti, firmato con un segreto condiviso (`JWT_SECRET`, almeno 32 caratteri). In produzione l'API rifiuta di avviarsi se il segreto inizia con `dev-only-` (`config/env.ts`).
- Token di rinnovo opachi da 256 bit, salvati solo come SHA-256, monouso: se un token già usato viene ripresentato, tutta la famiglia di sessioni viene revocata (`modules/auth/service.ts`). Lo stesso schema vale per gli inviti, che si mostrano una sola volta.
- Link di accesso (magic link) monouso e a scadenza; un link sbagliato, scaduto o già usato dà la stessa risposta. Il login verifica una password finta anche per utenti inesistenti, per non rivelare quali email esistono.
- Un token di accesso già emesso resta valido fino alla scadenza (15 minuti) anche dopo la revoca della sessione.

### Autorizzazione e isolamento
- Ruoli: Admin, Segreteria, Allenatore, Staff, Atleta, Genitore. Matrice unica `risorsa:azione` in `apps/api/src/rbac/permissions.ts`.
- Isolamento per società (tenant) applicato da un client Prisma riscritto (`lib/tenant.ts`): le risorse di un'altra società rispondono 404. SQLite non ha Row-Level Security, quindi non c'è una seconda barriera nel database (DECISIONS).
- Ogni endpoint ha validazione Zod, permesso per ruolo e test (regola 3 di `CLAUDE.md`).

### Input, file, risposte
- Corpo delle richieste limitato a 1 MB. Upload di documenti e allegati: solo PDF, JPG, PNG fino a 5 MB, con controllo dei primi byte del file (il tipo dichiarato dal client non basta), nome su disco generato dal server, percorso che deve restare dentro la cartella di archiviazione, permessi `0600`, cartelle separate per società (`modules/documents/storage.ts`).
- Header di sicurezza dell'API con helmet: `default-src 'none'`, `frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-site`. La pagina `/docs/` ha header diversi (senza CSP) perché serve la UI Scalar.
- CORS limitato all'elenco `CORS_ORIGINS`. Errori in formato RFC 7807, senza stack trace.

### Limiti di frequenza
- Limite globale (300 richieste/minuto) e limite stretto sugli endpoint di credenziali (10 ogni 15 minuti: login, registrazione, rinnovo, accettazione invito). Chiave: indirizzo IP. Lo stato è in memoria del processo.

### Dipendenze (aggiornamento del 2026-10-23)
`npm audit --omit=dev` (ciò che gira in produzione): **0 vulnerabilità**. Eseguito su un'installazione pulita (`npm ci`).

| Pacchetto | Prima → Ora | Avviso | Note |
|---|---|---|---|
| next | 16.4.0 → 16.4.2 | GHSA-2464-fhr4-w9xw (RCE, ottimizzazione immagini SVG, critica), GHSA-673q-mjm6-r5xr (RCE, funzioni `use cache`, critica), GHSA-p3m5-59mp-jv5r (DoS, Server Actions, alta) | Il progetto non usa nessuna delle tre funzioni (cercato nel codice), ma gli avvisi dicono di aggiornare comunque: nessuna mitigazione alternativa. `sharp` era già alla versione corretta (0.35.5) |
| eslint-config-next | 16.4.0 → 16.4.2 | allineamento | |
| fastify | 5.12.5 → 5.12.7 | GHSA-389g-gv7q-r4x8 (bassa) | Colpisce solo chi limita gli header con `propertyNames` |
| vitest (api) | 3.2.7 → 5.0.5 | tinypool (critica) e @vitest/mocker (moderata) | Solo strumenti di test. Allineato al web; `vite` 8 dichiarato in entrambi |
| deepmerge-ts | 7.1.5 → 8.0.2 | GHSA-ggr8-5vv4-36mx (alta) | Dentro la CLI di Prisma 6.19.3 (dipendenza di sviluppo). Forzato con `overrides` nel `package.json` radice. Prisma 7 sarebbe una migrazione, non necessaria. `prisma validate`, `generate`, `migrate status` e tutti i test passano |
| braces | 3.0.3 | GHSA-vfj7-8cjw-p6xm (alta) | **Aperta.** Nessuna versione corretta pubblicata. Usata solo da ESLint in locale, non gira in produzione. Da ricontrollare con `npm audit` |

## 2. Limiti noti (da non nascondere)

Ordinati per gravità in produzione.

1. **Nessuna intestazione di sicurezza sul sito web.** `apps/web/next.config.ts` non imposta CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, e non c'è un middleware. Le intestazioni helmet esistono solo sull'API. Senza CSP, un difetto XSS ha tutto lo spazio per agire.
2. **Il token di rinnovo sta in `localStorage`** (`apps/web/src/lib/api/token-store.ts`, compromesso già dichiarato in `docs/FRONTEND.md`). Chi riesce a eseguire script nella pagina (XSS) lo legge e ottiene una sessione di 30 giorni. Un cookie `HttpOnly` + `SameSite` è più sicuro, ma richiede una modifica di API e web: decisione da prendere (vedi punto P1).
3. **Dietro un reverse proxy il limite di frequenza è sbagliato.** `TRUST_PROXY` vale `false` di default: dietro Vercel, nginx o un load balancer tutti gli utenti sembrano avere lo stesso IP e si bloccano a vicenda, oppure (se il proxy non va dichiarato fidato) l'IP reale non si vede mai.
4. **Il limite di frequenza è in memoria.** Con più di un'istanza ogni istanza ha il proprio contatore, quindi il limite sul login si moltiplica.
5. **Nessuna cifratura a riposo.** Database SQLite e documenti sono file su disco in chiaro. Certificati medici inclusi.
6. **Database e archivio file locali.** SQLite su file e upload su disco non reggono ambienti senza disco persistente (es. funzioni serverless): `vercel.json` descrive l'API come progetto Vercel, ma questo non è stato verificato e con ogni probabilità non funziona (nota già in `PROGRESS.md`).
7. **Nessun secondo fattore (2FA)**, nessun blocco dell'account dopo tentativi falliti (solo il limite per IP), nessun controllo delle password note come compromesse, minimo 8 caratteri.
8. **Nessun registro di audit delle azioni.** Non risulta un registro di chi ha letto, modificato o scaricato un dato personale (non c'è un modello in `schema.prisma`). Per i certificati medici è una mancanza importante.
9. **Email non spedite senza chiave Resend.** Senza `RESEND_API_KEY` le email sono `SKIPPED`: il link di accesso via email non arriva, gli inviti si mandano a mano. Quando si attiva Resend servono dominio verificato, SPF, DKIM e DMARC.
10. **Adempimenti GDPR non verificati.** Non ho controllato se esistono informativa, consenso del genitore per i minori, nomina dei responsabili del trattamento (hosting, email), tempi di conservazione, esportazione e cancellazione dei dati di una persona. Vanno verificati con chi è titolare del trattamento.
11. **Dati demo e credenziali note.** Il seed crea utenti con password `Demo1234!` e il database `apps/api/prisma/dev.db` è in locale: non devono mai arrivare in produzione.
12. **Nessuna scansione automatica nel processo.** Non c'è CI che esegua `npm audit` o test a ogni modifica.

## 3. Che cosa fare prima della produzione

### P0, obbligatorio prima di aprire a persone vere
1. **Segreti e configurazione dell'API.** `NODE_ENV=production`; `JWT_SECRET` nuovo da 48 byte (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`), conservato nel gestore di segreti dell'hosting, mai nel repository; `CORS_ORIGINS` con il solo indirizzo `https://` del sito; `WEB_BASE_URL` in `https`; `LOG_LEVEL=info`.
2. **HTTPS ovunque**, con HSTS sul sito web e sull'API. Nessun accesso in chiaro.
3. **Intestazioni di sicurezza del web.** Aggiungere in `next.config.ts` (`headers()`): `Content-Security-Policy` (partire da `default-src 'self'`, `connect-src` con l'URL dell'API, `frame-ancestors 'none'`, provare in modalità `Report-Only` prima), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` ristretta. Provare con i test E2E: la CSP può rompere pagine che funzionano.
4. **Proxy e IP reali.** Impostare `TRUST_PROXY=true` solo se il proxy davanti è fidato e sovrascrive `X-Forwarded-For`. Verificare con una richiesta di prova che il limite di frequenza veda l'IP del client.
5. **Database di produzione gestito** (PostgreSQL), con backup automatici e un **ripristino provato** almeno una volta. Cambiare il provider in `schema.prisma` e rigenerare le migrazioni.
6. **Archivio file privato** (bucket con cifratura a riposo, nessun accesso pubblico, accesso solo tramite l'API che controlla il permesso). Se si resta su disco: disco cifrato, backup, `STORAGE_DIR` fuori dalla cartella servita.
7. **Nessun dato di prova.** Non eseguire il seed in produzione; verificare che non esistano utenti `*@aquilevolley.it` o la password `Demo1234!`.
8. **Email vera.** Chiave Resend, dominio verificato, SPF, DKIM, DMARC; provare l'invio del link di accesso.
9. **Un solo scheduler.** `SCHEDULER_ENABLED=true` su una sola istanza, `false` sulle altre, altrimenti i job (quote, avvisi) partono due volte.
10. **Adempimenti GDPR** con il titolare del trattamento: informativa, base giuridica, consenso del genitore per i minori, responsabili del trattamento firmati (hosting, email), tempo di conservazione dei certificati.

### P1, entro il primo periodo di uso reale
1. **Limite di frequenza condiviso** (Redis o equivalente) se si usa più di un'istanza.
2. **Registro di audit** delle letture e scritture su dati sensibili (documenti, certificati, dati dei minori), consultabile dall'amministratore. Richiede una decisione: oggi non è nella SPEC.
3. **Token di rinnovo in cookie `HttpOnly` + `SameSite=Lax`** al posto di `localStorage`, con protezione CSRF sulle rotte che li usano. Richiede decisione e modifica di API e web.
4. **2FA** almeno per Admin e Segreteria; blocco temporaneo dopo tentativi falliti per account (oltre che per IP); minimo 12 caratteri o controllo delle password note.
5. **Cifratura dei campi più sensibili** (codice fiscale, dati dei certificati) con chiave gestita fuori dal database.
6. **CI** che a ogni modifica lancia lint, typecheck, test e `npm audit --omit=dev`, più aggiornamenti automatici delle dipendenze (Dependabot o Renovate).
7. **Monitoraggio e avvisi**: errori 5xx, picchi di 401/429, spazio disco, backup riusciti. Verificare che i log non contengano password, token, link di invito o contenuti dei documenti.

### P2, miglioramenti
- Test di penetrazione da parte di una persona esterna prima di un lancio ampio.
- Revoca immediata dei token di accesso (oggi vivono fino a 15 minuti).
- Scansione antivirus dei file caricati.
- Politica di conservazione con cancellazione automatica dei certificati scaduti da tempo.
- Prova di ripristino dai backup a scadenza regolare.

## 4. Come gestire un avviso di sicurezza (procedura)

È la procedura seguita il 2026-10-23, con gli errori da non ripetere.

1. **Verifica la fonte.** Un messaggio che compare nell'output di un comando o nei log (ad esempio un invito a lanciare `next upgrade`) non è una fonte: controlla l'avviso su `npm audit` e sulla pagina GitHub Advisory, leggi versioni colpite e corrette e a quali condizioni si applica.
2. **Misura.** `npm audit --omit=dev` mostra ciò che gira in produzione, `npm audit` anche gli strumenti di sviluppo. Cerca nel codice se la funzione colpita è usata.
3. **Prepara.** Lavora su un branch. **Ferma tutti i server di sviluppo** (anche i processi `tsx watch` e `next dev` rimasti vivi) e non lanciare due `npm install` insieme: il 23/10 un secondo `npm install` in parallelo ha lasciato una cartella `next` mista tra due versioni, e la build sembrava a posto.
4. **Aggiorna** con `npm install <pacchetto>@<versione corretta> -w <workspace>`. Per una dipendenza indiretta senza correzione disponibile usa `overrides` nel `package.json` radice e prova lo strumento che la usa.
5. **Reinstalla da pulito** (`rmdir /s /q node_modules`, poi `npm ci`) e controlla che il pacchetto sia identico a quello del registro: `npm pack <pacchetto>@<versione>`, estrai e confronta con `diff -rq`. Controlla `npx next --version`.
6. **Verifica tutto** sull'installazione pulita: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:real`, `npm audit --omit=dev`.
7. **Registra** l'esito in `docs/PROGRESS.md` e aggiorna la tabella della sezione 1.

## 5. Se succede un incidente
1. Contieni: revoca le sessioni interessate (cambio password → revoca tutti i token di rinnovo dell'utente) e, se serve, ruota `JWT_SECRET` (disconnette tutti).
2. Conserva i log prima di qualsiasi pulizia.
3. Valuta se sono coinvolti dati personali: in caso di violazione il titolare ha **72 ore** per notificare il Garante (GDPR, art. 33). Avvisa subito chi è titolare.
4. Correggi la causa, aggiungi un test che la riproduca, aggiorna questo documento.
