# API: come il frontend parla col backend

Il backend è il progetto Java/Spring Boot `SuiteASD-backend` (repository separato). Questo repository contiene solo il frontend. Il vecchio backend Node (`apps/api`, Fastify + Prisma) è stato eliminato il 2026-11-20.

## Dove sta il contratto

- **Contratto delle API:** `docs/api/openapi.yaml` nel repository `SuiteASD-backend` (snapshot generato dal codice e verificato da un test). In sviluppo la documentazione interattiva è su `http://localhost:8080/swagger-ui.html`.
- **Guida del backend:** `docs/API.md` e `docs/SVILUPPO.md` nel repository backend (convenzioni, errori, permessi, avvio).
- I tipi del frontend stanno in `apps/web/src/features/<area>/types.ts` e `apps/web/src/lib/api/types.ts`: vanno tenuti allineati a quel contratto, non il contrario.

## Avvio in locale

1. Backend (dalla cartella `SuiteASD-backend`): `docker compose --profile app up --build -d`. Se la porta 5432 è occupata: `DB_PORT=5433 docker compose --profile app up --build -d`. Il backend risponde su `http://localhost:8080`.
2. Frontend (da questa cartella): `npm install`, poi `npm run dev`. Il sito è su `http://localhost:3000`.

Il browser chiama sempre `/api/v1` sulla stessa origine del sito; `apps/web/next.config.ts` inoltra la richiesta al backend (`API_ORIGIN`, di default `http://localhost:8080`). In produzione lo stesso lavoro lo fa il reverse proxy (Caddy), quindi il backend non ha bisogno di CORS.

Variabili del frontend (`apps/web/.env.example`): `NEXT_PUBLIC_API_URL` (di default `/api/v1`) e `API_ORIGIN`.

## Cose da sapere sul comportamento

- **Account e dati:** il backend parte vuoto, non ha un seed demo. Per provare l'app si registra una società da `/registrazione`.
- **Limite di tentativi:** gli endpoint di accesso e registrazione accettano 10 tentativi per gruppo di rotte in una finestra di tempo. Per i test E2E si alza con la variabile del backend `SUITEASD_IDENTITY_RATE_LIMIT_MAX_ATTEMPTS` (per esempio `100000`).
- **Piani quota:** creando un piano si addebitano subito le quote ai tesserati attivi (una per scadenza) e a chi si iscrive dopo. Non esiste più un passaggio "genera le quote". Dopo la creazione si modificano solo nome, tipo e stato attivo.
- **Email:** senza chiave Resend nel backend le email restano `SKIPPED` (il link di invito lo manda chi invita).

## Test contro il backend vero

`npm run test:e2e:real` esegue i test Playwright in `apps/web/e2e-real` sul backend Java già acceso (lo controlla `e2e-real/support/require-api.ts`) e sulla build di produzione del sito. Le società dei test si creano dall'interfaccia, non da un seed.
