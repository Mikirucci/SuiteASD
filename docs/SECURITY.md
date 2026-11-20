# Sicurezza di SuiteASD (frontend)

Ultimo aggiornamento: 2026-11-20. Questo repository contiene solo il frontend (`apps/web`): la sicurezza del backend (accesso, sessioni, ruoli, isolamento tra società, file, limiti di frequenza, database) sta nel repository `SuiteASD-backend` e nei suoi documenti. Il vecchio backend Node è stato eliminato, quindi le parti di questo documento che lo riguardavano non valgono più.

**Perché conta.** L'app tratta dati personali di minorenni e certificati medici (dati sulla salute, categoria particolare del GDPR, art. 9). Una fuga di questi dati è il rischio più grave del prodotto.

## 1. Stato attuale del frontend

- Il browser parla solo con `/api/v1` sulla stessa origine del sito; il backend non ha CORS (in produzione un reverse proxy instrada web e API sotto lo stesso dominio).
- Token di accesso e di rinnovo arrivano dal backend e il frontend li conserva in `apps/web/src/lib/api/token-store.ts` (il rinnovo in `localStorage`, vedi limite 2).
- **Dipendenze (2026-11-20):** `npm audit --omit=dev` dava avvisi su `next` 16.4.2 (tra gli altri GHSA-7qx7-33qx-rqx2, GHSA-f3mh-rxg3-f5g2, GHSA-pc58-hwjq-p385, GHSA-rhh4-g77r-r9qj, GHSA-vvgp-ww4w-46vf) e su `effect` (dipendenza di `@hookform/resolvers`, GHSA-7589-6fvf-x4pw). Con `npm audit fix` sono passati a `next` 16.4.6 e `effect` aggiornato: **0 vulnerabilità** in produzione, e typecheck, lint, 1112 test unitari, 133 E2E con API simulata, 37 E2E reali e la build restano verdi. Non ho verificato se le funzioni degli avvisi fossero usate dall'app. La CI (`.github/workflows/ci.yml`) ora fallisce se `npm audit --omit=dev` trova una vulnerabilità moderata o peggiore.
- **Intestazioni di sicurezza:** le imposta Caddy nello stack di deploy (`deploy/Caddyfile` nel repository backend): HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Provate in locale con la suite E2E reale intera dietro Caddy. Il sito servito senza Caddy non le ha.

## 2. Limiti noti

1. **Le intestazioni di sicurezza stanno solo in Caddy**, non in `apps/web/next.config.ts`: servire il sito senza Caddy le toglie. La CSP ammette `'unsafe-inline'` per gli script perché Next.js scrive script in pagina; una CSP con nonce è più forte ed è un miglioramento previsto.
2. **Il token di rinnovo sta in `localStorage`** (compromesso già dichiarato in `docs/FRONTEND.md`). Chi riesce a eseguire script nella pagina (XSS) lo legge e ottiene una sessione lunga. Un cookie `HttpOnly` + `SameSite` è più sicuro, ma richiede una modifica di backend e frontend: decisione da prendere.
3. **La CI non è mai girata su GitHub**: l'ho scritta (lint, tipi, test, build, audit, E2E con API simulata, immagine Docker) e ne ho provato i comandi in locale, ma il primo giro vero lo vedremo alla prima pull request o push.
4. **Adempimenti GDPR non verificati.** Informativa, consenso del genitore per i minori, nomina dei responsabili del trattamento, tempi di conservazione, esportazione e cancellazione dei dati: vanno verificati con chi è titolare del trattamento.

## 3. Che cosa fare prima della produzione (parte frontend)

1. ~~Aggiornare `next` e le altre dipendenze con avvisi aperti~~ **Fatto** il 2026-11-20 (sezione 1).
2. ~~Intestazioni di sicurezza~~ **Fatto in Caddy** (sezione 1); da rifare nel reverse proxy se non si usa Caddy.
3. ~~HTTPS ovunque e un solo dominio per sito e API~~ **Previsto dallo stack di deploy** (Caddy con Let's Encrypt, stessa origine). Il certificato non è stato provato: serve un dominio vero.
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
