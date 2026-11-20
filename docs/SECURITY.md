# Sicurezza di SuiteASD (frontend)

Ultimo aggiornamento: 2026-11-20. Questo repository contiene solo il frontend (`apps/web`): la sicurezza del backend (accesso, sessioni, ruoli, isolamento tra società, file, limiti di frequenza, database) sta nel repository `SuiteASD-backend` e nei suoi documenti. Il vecchio backend Node è stato eliminato, quindi le parti di questo documento che lo riguardavano non valgono più.

**Perché conta.** L'app tratta dati personali di minorenni e certificati medici (dati sulla salute, categoria particolare del GDPR, art. 9). Una fuga di questi dati è il rischio più grave del prodotto.

## 1. Stato attuale del frontend

- Il browser parla solo con `/api/v1` sulla stessa origine del sito; il backend non ha CORS (in produzione un reverse proxy instrada web e API sotto lo stesso dominio).
- Token di accesso e di rinnovo arrivano dal backend e il frontend li conserva in `apps/web/src/lib/api/token-store.ts` (il rinnovo in `localStorage`, vedi limite 2).
- **Dipendenze: avvisi aperti.** `npm audit --omit=dev` del 2026-11-20 segnala `next` 16.4.2 con nuovi avvisi (tra gli altri GHSA-7qx7-33qx-rqx2, GHSA-f3mh-rxg3-f5g2, GHSA-pc58-hwjq-p385, GHSA-rhh4-g77r-r9qj, GHSA-vvgp-ww4w-46vf) e propone `npm audit fix`. Non ho verificato se le funzioni coinvolte sono usate dall'app né quale versione le corregge: va fatto prima della produzione, seguendo la procedura della sezione 4. Resta anche `braces` (dipendenza di ESLint, solo sviluppo): nessuna versione corretta all'ultimo controllo.

## 2. Limiti noti

1. **Nessuna intestazione di sicurezza sul sito web.** `apps/web/next.config.ts` non imposta CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, e non c'è un middleware. Senza CSP, un difetto XSS ha tutto lo spazio per agire.
2. **Il token di rinnovo sta in `localStorage`** (compromesso già dichiarato in `docs/FRONTEND.md`). Chi riesce a eseguire script nella pagina (XSS) lo legge e ottiene una sessione lunga. Un cookie `HttpOnly` + `SameSite` è più sicuro, ma richiede una modifica di backend e frontend: decisione da prendere.
3. **Nessuna scansione automatica nel processo.** Non c'è CI che esegua `npm audit`, test ed E2E a ogni modifica.
4. **Adempimenti GDPR non verificati.** Informativa, consenso del genitore per i minori, nomina dei responsabili del trattamento, tempi di conservazione, esportazione e cancellazione dei dati: vanno verificati con chi è titolare del trattamento.

## 3. Che cosa fare prima della produzione (parte frontend)

1. **Aggiornare `next`** e le altre dipendenze con avvisi aperti (sezione 4).
2. **Intestazioni di sicurezza** in `next.config.ts` (`headers()`) o nel reverse proxy: `Content-Security-Policy` (partire da `default-src 'self'`, `frame-ancestors 'none'`, provare prima in modalità `Report-Only`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` ristretta. Provare con gli E2E: la CSP può rompere pagine che funzionano.
3. **HTTPS ovunque** e un solo dominio per sito e API (reverse proxy), così il browser non ha bisogno di CORS.
4. **Token di rinnovo in cookie `HttpOnly` + `SameSite=Lax`** al posto di `localStorage`, con protezione CSRF: richiede una decisione e una modifica concordata con il backend.
5. **CI** che a ogni modifica lancia lint, typecheck, test, E2E e `npm audit --omit=dev`, più aggiornamenti automatici delle dipendenze.
6. Le parti di sicurezza del backend (segreti, database, archivio file, email, scheduler, audit, 2FA) sono elencate nei documenti del repository `SuiteASD-backend`.

## 4. Come gestire un avviso di sicurezza (procedura)

1. **Verifica la fonte.** Un messaggio che compare nell'output di un comando o nei log (per esempio un invito a lanciare `next upgrade`) non è una fonte: controlla l'avviso su `npm audit` e sulla pagina GitHub Advisory, leggi versioni colpite e corrette e a quali condizioni si applica.
2. **Misura.** `npm audit --omit=dev` mostra ciò che gira in produzione, `npm audit` anche gli strumenti di sviluppo. Cerca nel codice se la funzione colpita è usata.
3. **Prepara.** Lavora su un branch. **Ferma tutti i server di sviluppo** (anche i processi `next dev` rimasti vivi) e non lanciare due `npm install` insieme: il 23/10 un secondo `npm install` in parallelo ha lasciato una cartella `next` mista tra due versioni, e la build sembrava a posto.
4. **Aggiorna** con `npm install <pacchetto>@<versione corretta> -w apps/web`. Per una dipendenza indiretta senza correzione disponibile usa `overrides` nel `package.json` radice.
5. **Reinstalla da pulito** (`rmdir /s /q node_modules`, poi `npm ci`) e controlla che il pacchetto sia identico a quello del registro (`npm pack <pacchetto>@<versione>`, estrai e confronta con `diff -rq`). Controlla `npx next --version`.
6. **Verifica tutto** sull'installazione pulita: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:real`, `npm audit --omit=dev`.
7. **Registra** l'esito in `docs/PROGRESS.md` e aggiorna la sezione 1.

## 5. Se succede un incidente
1. Contieni: chiedi al backend di revocare le sessioni interessate (il cambio password revoca i token di rinnovo dell'utente) e, se serve, di ruotare il segreto di firma dei token (disconnette tutti).
2. Conserva i log prima di qualsiasi pulizia.
3. Valuta se sono coinvolti dati personali: in caso di violazione il titolare ha **72 ore** per notificare il Garante (GDPR, art. 33). Avvisa subito chi è titolare.
4. Correggi la causa, aggiungi un test che la riproduca, aggiorna questo documento.
