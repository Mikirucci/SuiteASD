# Modulo Convenzioni: piano operativo

Stato: **piano pronto, nessun codice scritto.** Si parte quando finisce la verifica della suite del backend su `develop` (il backend non va toccato mentre compila).

## 1. Cosa è (decisioni dell'utente)

L'amministrazione crea **card di convenzione**: la società ha un accordo con un partner (per esempio un centro di fisioterapia) e chi mostra la card ha le condizioni scritte sulla card. Niente listino, niente QR, niente wallet: tutto sul web.

- **Una card per ogni convenzione** (non una card universale). Sulla card: logo della società, nome della società, nome della convenzione, intestatario, scadenza.
- **Template di sfondo:** alla creazione si sceglie fra diversi template preimpostati (sfumature nei colori del brand). Cambia solo lo sfondo: le informazioni stanno sempre negli stessi punti.
- **Destinatari scelti dall'amministrazione**, a macro gruppi già esistenti: tutti i tesserati, una o più squadre, e i collaboratori per ruolo (amministratori, segreteria, allenatori, staff/dirigenti). Combinabili. Mai per singolo atleta.
- **Notifica alla pubblicazione:** chi riceve la card riceve una notifica nell'app e una **email ben formattata** ("ti è stata assegnata una convenzione").
- **Genitore e figlio minorenne** sono un solo account. La card è una per ciascun figlio atleta, e porta **entrambi i nomi**: il tesserato e il genitore che ne fa le veci. Un genitore con più figli nella stessa società ha più card.
- **Riferimento grafico:** la tessera di weSport (card con sfumatura e vetro, testi grandi, stato in evidenza, elenco "Convenzioni attive"). Si prende lo spirito, non la grafica: colori del brand (blu elettrico e verde menta), nessun nome o logo di terzi. La grafica la progetto io in fase di sviluppo e la valutiamo a schermo.

## 2. Scelte che ho fatto io (da correggere se non vanno)

1. Il modulo si chiama `promotions` nel codice (backend e API `/api/v1/promotions`), **Convenzioni** nell'interfaccia.
2. Chi gestisce le convenzioni: **ADMIN e SEGRETERIA** (come sponsor e palestre).
3. La **scadenza** sulla card è la fine della convenzione, scelta dall'amministrazione. Una convenzione scaduta o archiviata non compare più all'utente.
4. La **notifica parte alla pubblicazione**, non alla bozza. Se dopo si allargano i destinatari, ricevono la notifica solo i nuovi (ognuno la riceve una volta sola). Chi entra in una squadra dopo vede la card nella sua area senza notifica.
5. Prima di pubblicare, l'amministrazione vede **a quante persone** arriverà notifica ed email.
6. L'email HTML riguarda per ora solo questa notifica; il meccanismo però è generale.

## 3. Cosa c'è già e si riusa

- `identity.api.Permission`: unico posto dei permessi. Si aggiungono `promotions:read` e `promotions:write` (ADMIN, SEGRETERIA) e `promotions:readOwn` (tutti i ruoli).
- `communication.service.audience.Audiences`: `ofTeam`, `ofMembers`, `withRoles` danno già gli account da avvisare (compresi i genitori).
- `registry.api.OwnMembers`: i tesserati dell'utente (se stesso e i figli) con la relazione. Da qui si capisce quando la card ha due nomi.
- `registry.api.TeamDirectory` / `MemberDirectory`: squadre e squadre di ogni tesserato.
- `documents.api.AttachmentEntityType`: i file allegati ai record di altri moduli (loghi).
- Eventi fra moduli con registro nel database (ADR-0014): `promotions` pubblica un evento, `communication` lo ascolta come fa con `billing`.
- Frontend: token in `apps/web/src/app/globals.css`, area personale in `app/(personale)/area-personale`, menu in `features/shell/nav-items.ts`, catalogo notifiche in `features/notifiche/catalog.ts`.

## 4. Mancano (da costruire come parte del modulo)

- **Logo della società:** oggi la società non ne ha uno. Serve caricarlo (impostazioni) e leggerlo dalla card. Nuovo tipo di allegato `SOCIETY`, con `identity` che implementa il bersaglio.
- **Email in HTML:** oggi `Mail` e `ResendMailTransport` mandano solo testo. Si aggiunge un campo `html` facoltativo, con il testo come alternativa, e un modello email nei colori del brand (tabelle e stili in linea, compatibile con i client di posta). Tutto il testo inserito dall'utente (nome del partner, condizioni) va **escapato**.

## 5. Modello dati (schema `promotions`, migrazione Flyway del modulo)

`promotions`: `id` (UUID v7), `society_id` (tenant, con il solito vincolo), `title` (nome della convenzione, max 120), `partner_name` (max 120), `partner_label` (es. "Medical partner", max 40, facoltativa), `city` (max 80, facoltativa), `badge` (es. "Sconti", max 24), `terms` (la condizione, max 1000), `template` (uno dei template), `valid_from`, `valid_to` (con `valid_to >= valid_from`), `all_members` (booleano), `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `published_at`, `created_at`, `updated_at`.
`promotion_teams`: (`promotion_id`, `team_id`). `promotion_roles`: (`promotion_id`, `role`) per i collaboratori. Almeno un destinatario per pubblicare.
La **card dell'utente non si salva**: si calcola ogni volta da convenzione, destinatari, tesserati dell'utente e data.

Template (nomi provvisori, tutti nel brand): `ELETTRICO` (blu), `MENTA` (verde), `OCEANO` (blu verso verde), `ALBA` (chiaro, testo scuro), `NOTTE` (blu molto scuro), `CARBONE` (neutro scuro). Ogni template dichiara il colore del testo e un test calcola il contrasto contro i punti più sfavorevoli della sfumatura (minimo 4,5:1, WCAG AA).

## 6. API (contratto prima, nel `docs/api/openapi.yaml` del backend)

Gestione (`promotions:read` / `promotions:write`):
- `GET /promotions` (elenco con filtri per stato), `GET /promotions/{id}`, `POST /promotions`, `PATCH /promotions/{id}`, `DELETE /promotions/{id}` (solo bozze)
- `POST /promotions/{id}/publish`, `POST /promotions/{id}/archive`
- `POST /promotions/audience-preview` → quante persone riceverebbero card, notifica ed email
- logo del partner: allegati esistenti (`/attachments`) con il nuovo tipo `PROMOTION`

Utente (`promotions:readOwn`):
- `GET /me/promotions` → le card dell'utente. Ogni card: dati della convenzione, stato (`ACTIVE`, `UPCOMING`; le scadute non si elencano), società (nome, logo), intestatario, e per i minorenni il genitore che ne fa le veci.

Errori in formato RFC 7807 come negli altri moduli. Le date di validità seguono il fuso orario della società.

## 7. Fette, in ordine, con criterio di fine

| # | Fetta | Fine quando |
|---|---|---|
| 0 | **Specifica e decisioni.** Addendum in `docs/SPEC.md`, decisione in `docs/DECISIONS.md`, ADR del backend (modello dei destinatari, card calcolata, notifica alla pubblicazione, template) | Documenti rivisti e fusi |
| 1 | **Contratto e permessi.** Schema OpenAPI, `Permission`, snapshot rigenerato | `OpenApiContractTest` e `PermissionUsageTest` verdi |
| 2 | **Backend: gestione.** Modello, migrazione, creazione, modifica, pubblicazione, archiviazione, cancellazione delle bozze, anteprima dei destinatari | Test per ruolo (403), per società (404), validazioni, stati |
| 3 | **Backend: card dell'utente.** `GET /me/promotions`: destinatari per squadre e ruoli, validità, due nomi per i minorenni, una card per figlio | Test con atleta, staff, genitore con due figli, scaduta, archiviata |
| 4 | **Loghi.** Logo della società (nuovo tipo `SOCIETY`) e del partner (`PROMOTION`), file rimossi insieme al record | Test di allegato, cancellazione, permessi |
| 5 | **Notifica ed email.** Evento alla pubblicazione, tipo `PROMOTION_ASSIGNED`, modello email HTML con alternativa testuale, chiave anti-duplicato | Notifica una sola volta, email in coda, testo escapato, senza chiave Resend la notifica resta e l'email è saltata |
| 6 | **Frontend: card e template.** Componente `PromotionCard`, template nei token, anteprima dal vivo | Test del componente e del contrasto di ogni template |
| 7 | **Frontend: amministrazione.** Pagina Convenzioni (elenco, form con selettore template e destinatari, conferma di pubblicazione con il numero di persone), stati di caricamento, vuoto ed errore | Test unitari e E2E con API simulata |
| 8 | **Frontend: utente.** "Le mie convenzioni" nell'area personale e per i collaboratori, dettaglio con le condizioni, voce nel catalogo notifiche | Test unitari e E2E con API simulata |
| 9 | **Prova sul backend vero.** Nuovo spec E2E reale: admin crea e pubblica, atleta e genitore con due figli vedono le card giuste, arriva la notifica | Suite reale verde dentro lo stack di produzione |
| 10 | **Rifinitura.** Controllo grafico a schermo, accessibilità, responsive da 320 px, documenti aggiornati (`PROGRESS.md`) | Controllo visivo insieme all'utente |

Le fette 1-5 sono il backend (repository `SuiteASD-backend`, un branch e una PR per fetta o per gruppo coerente), le 6-9 il frontend. Il frontend segue il contratto del backend (regola 3 di `CLAUDE.md`): si parte dal frontend solo dopo che il contratto è in `develop`.

## 8. Regole del progetto da rispettare

Codice tipizzato senza `any`; nessun test saltato o indebolito; ogni endpoint con validazione, permesso per ruolo, isolamento per società, schema OpenAPI e test; ogni schermata con stati di caricamento, vuoto ed errore, WCAG AA, responsive; UI in italiano, codice e commenti in inglese; struttura delle cartelle uguale agli altri moduli (`api`, `exception`, `model`, `repository`, `service`, `web`); Checkstyle e Spotless; prima di dichiarare finito: lint, typecheck e test con l'output in mano.

## 9. Rischi

- **Email di massa per errore:** la conferma mostra il numero di destinatari prima di pubblicare.
- **Contrasto sulle sfumature:** gli strumenti automatici non lo misurano; lo verifica un test sui punti della sfumatura.
- **Testo dell'utente nell'HTML:** va escapato; c'è un test dedicato.
- **Logo mancante:** la card deve reggere senza logo (iniziali o segnaposto neutro).
- **Fuso orario:** "valida fino al" e "non ancora valida" usano il fuso della società.
- **Carico del Docker del PC** durante le prove: le suite E2E reali vanno lanciate con gli altri stack spenti.

## 10. Fuori da questo modulo (non richiesto)

Wallet Apple e Google, QR o codice di verifica per il partner, listino prezzi, card universale con più convenzioni, destinatari per singolo atleta, statistiche di utilizzo. Si decide dopo aver visto la card.
