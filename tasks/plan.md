# Piano: riordino UX, onboarding, squadre/inviti, collaudo con persone (2026-10-17)

Richiesta dell'utente (dopo il collaudo manuale da zero):
1. Menu: sezioni per argomento, a gerarchia, con sottovoci che si espandono. Niente card "Altro" che raccolgono tutto in un punto.
2. Home admin: gerarchia chiara, meno ammassata; da qui l'admin deve capire dove andare (servizi principali).
3. Falle: l'admin non può creare squadre; le notifiche in-app non vengono mostrate.
4. Onboarding migliore: registrazione società e iscrizione atleta (la prima schermata del form non si capisce).
5. Collaudo vero: persone fittizie, flussi completi sul backend reale (niente dati mock), domande da utente ("dove trovo il bilancio?").
6. Metodo da team: agenti specializzati, skill di design, memoria, onestà sulle falle. Niente predisposizioni di deploy non richieste.

## Architettura dell'informazione (decisione)

Menu amministrazione, per argomento (le voci sono filtrate per permesso: un ruolo non vede ciò che non può aprire; un gruppo senza voci visibili sparisce):

| Gruppo | Voci (URL invariati salvo nuove) |
|---|---|
| Home | `/` (cruscotto) |
| Persone | Tesserati `/tesserati`, Squadre `/squadre` (NUOVA), Staff `/altro/staff`, Accessi e inviti `/inviti` (NUOVA) |
| Attività sportiva | Calendario `/calendario`, Presenze `/calendario/presenze`, Classifiche `/classifiche`, Tornei `/altro/tornei`, Pagelle `/pagelle`, Arbitri `/altro/arbitri`, Statistiche `/altro/statistiche` |
| Amministrazione | Quote `/quote`, Scadenze e documenti `/scadenze`, Bilancio `/altro/bilancio`, Sponsor `/altro/sponsor` |
| Logistica | Palestre `/altro/palestre`, Trasferte `/altro/trasferte`, Divise `/altro/divise` |
| Comunicazione | Notifiche `/notifiche` (badge), Bacheca `/altro/bacheca`, Automazioni `/automazioni` |

- Gli URL `/altro/*` restano (nessun redirect da rompere, nessun test E2E da riscrivere per l'URL); sparisce la pagina hub `/altro` (redirect a `/`).
- Sidebar: gruppi a fisarmonica (un `button` con `aria-expanded`), il gruppo della pagina attiva è aperto, gli altri chiusi; tastiera: Invio/Spazio apre, Tab entra nelle sottovoci. Mobile: la barra in basso resta (Home, Tesserati, Calendario, Quote, Menu); il Menu mostra la stessa fisarmonica.
- Un gruppo con una sola voce visibile diventa un link diretto (niente fisarmonica inutile).

## Home admin (gerarchia a 3 livelli)
1. **Da fare adesso**: elenco azionabile con conteggi che portano alla pagina giusta (nuove iscrizioni non lette, documenti mancanti/scaduti, quote scadute, convocazioni senza risposta della prossima partita). Se non c'è nulla: stato "Tutto in ordine".
2. **Servizi principali**: i 4 ingressi grandi (Persone, Calendario, Quote, Documenti) con il numero chiave e 2-3 link rapidi alle sottovoci. Gli stessi gruppi del menu.
3. **Il resto, più quieto**: classifica, notifiche recenti, automazioni, in blocchi senza card dentro card.
- Società vuota (nessuna squadra o nessun tesserato): al posto del cruscotto vuoto, un percorso "Per iniziare" a 4 passi con stato derivato dai dati (crea squadra, aggiungi tesserati o genera il link, imposta le quote, pianifica la prima partita).
- Scala spaziatura 4/8/12/16/24/32, almeno 24-32px tra i blocchi; stati loading/vuoto/errore.

## Onboarding
- **Società** (`/registrazione`): 2 passi (La società / Il tuo accesso) + riquadro "Cosa succede dopo" (crei le squadre, inviti gli atleti con un link, l'app gestisce il resto). Dopo la registrazione la home mostra il percorso "Per iniziare".
- **Atleta** (`/iscrizione/[code]`): la schermata deve dire chi sei, per cosa ti iscrivi (società + squadra del link) e cosa ottieni (area personale: documenti, convocazioni, quote). Scelta iniziale a due grandi opzioni ("Mi iscrivo io" / "Iscrivo mio figlio o mia figlia"), poi passi: account, dati dell'atleta. Il testo di marketing per dirigenti sulla sinistra va sostituito con testo pensato per l'atleta.

## Squadre e inviti (falle)
- `/squadre`: elenco, crea, modifica, elimina (con conferma). Campi dal contratto API `teams`. Dal menu e dal percorso "Per iniziare".
- `/inviti`: invita una persona per ruolo (allenatore, segreteria, staff, ...), elenco inviti pendenti, link da copiare, revoca se l'API lo prevede. Senza questa schermata l'admin non può dare accesso ai collaboratori (oggi solo via API).

## Notifiche in-app
- Riprodotto: la notifica "Nuova iscrizione" arriva in pagina Notifiche, home e badge. Cause plausibili del "non vengono mostrate": badge aggiornato solo ogni 60 s e senza ricarica al ritorno sulla finestra; nessuna campanella fuori dal menu; lato atleta nulla fino ai job pianificati. Indagare con i test a persone e correggere alla radice.

## Collaudo con persone (nessun mock, backend vero, società nuova creata da zero)
Persone: Rita (presidente, poco tecnica, PC), Davide (allenatore, telefono 390px), Marco (atleta 26), Elena (madre di Sara 12 anni), Luca (segreteria). Domande tipo: "dove trovo il bilancio?", "come aggiungo una squadra?", "come faccio vedere a mia figlia che la partita è sabato?". Ogni falla trovata va in `tasks/findings.md` con pagina, ruolo, gravità, correzione.

## Regole per tutti gli agenti
- Leggere `CLAUDE.md`, `docs/PROGRESS.md`, `docs/FRONTEND.md`. Il design system esistente (blu elettrico + verde menta, `lucide-react`, token in un posto) vince sulle preferenze generiche delle skill (`design-taste-frontend` sconsiglia lucide: qui si resta su lucide perché già in uso).
- Skill da usare: `impeccable`, `design-taste-frontend` (anti slop: niente em-dash visibili, niente gradienti viola, niente card dentro card, niente emoji icone), `frontend-ui-engineering`, `test-driven-development`.
- Ogni file nuovo con test; niente `any`, niente test indeboliti. UI italiana, codice e commenti in inglese.
- Gli agenti NON eseguono `build`, `test:e2e`, né avviano server su 3000/4000 (porta/`.next` condivisi): eseguono solo `lint`, `typecheck` e i test unitari del proprio perimetro (`npx vitest run <percorso>` in `apps/web` o `apps/api`). Il lead esegue build ed E2E in serie.
- Ognuno modifica solo il proprio perimetro; tocchi trasversali minimi e dichiarati nel report. Nessun commit: li fa il lead.
- Niente predisposizioni di deploy.
