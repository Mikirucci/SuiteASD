# Falle trovate nel collaudo (onesto, aggiornato man mano)

Formato: id, dove, ruolo/persona, gravità (alta/media/bassa), stato.

## Dal collaudo manuale dell'utente e dal primo giro del lead (2026-10-17)
- F1 alta: nessuna schermata per creare squadre (solo API). Società nuova = zero squadre = liste vuote ovunque. Stato: in corso (T2).
- F2 alta: nessuna schermata per gli inviti per ruolo (solo API): l'admin non può dare accesso a allenatori/segreteria. Stato: in corso (T2).
- F3 media: menu con 9 voci piatte + hub "Altro" con 12 card; troppo disordinato. Stato: in corso (T1).
- F4 media: la sidebar mostra tutte le voci a ogni ruolo (nessun filtro per permesso). Da confermare con allenatore/segreteria. Stato: in corso (T1).
- F5 media: home admin ammassata, senza gerarchia, vuota e fredda per società nuova. Stato: T5.
- F6 media: iscrizione atleta: pannello di marketing per dirigenti, scelta "io/figlio" minuscola, nessun passo. Registrazione società: un solo form senza spiegazioni. Stato: in corso (T3).
- F7 media: notifiche in-app "non mostrate" (segnalate dall'utente). Riprodotto: con società nuova compaiono in pagina, home e badge. Sospetti: badge aggiornato ogni 60 s, nessuna ricarica al focus; lato atleta eventi senza notifica immediata. Stato: in corso (T4).
- F8 bassa: nella mia prima guida all'utente avevo indicato "Inviti" come schermata provabile: non esiste nel frontend (errore mio, già corretto con l'utente).

## Metodologia (autocritica)
- Nelle ultime fasi ho lavorato quasi sempre in prima persona invece che con agenti specializzati, e i collaudi E2E giravano sulla società demo già popolata o su API simulate: per questo la società vuota e i ruoli collaboratori non erano mai stati provati.

## Dal report T2 (squadre e inviti)
- F9 alta (risolta): mancava la pagina pubblica per accettare un invito (`/invito/[token]`); costruita insieme a `/squadre` e `/inviti`.
- F10 media: `DELETE /teams/:id` non rifiuta mai l'eliminazione: tesserati, eventi e piani quota perdono il collegamento alla squadra (un piano quota senza squadra potrebbe valere per tutti). Mitigato con avviso nella conferma; da valutare un blocco lato API.
- F11 bassa: `GET /invitations` mostra solo gli inviti pendenti (niente scaduti/usati); il link non è recuperabile dopo la creazione (token solo come hash). Dichiarato in pagina.
- F12 bassa: la cornice di accesso/registrazione parla ai dirigenti anche nelle pagine pubbliche `/invito` (stesso difetto dell'iscrizione atleta). Da sistemare insieme a T3.
- Nota di metodo: l'agente ORG non ha caricato le skill di design indicate; i controlli di design li rifaccio io in fase di collaudo.

## Dal report T4 (notifiche) e T3 (onboarding)
- F7 chiusa in parte: cause reali (1) nessun aggiornamento reattivo (refetchOnWindowFocus era false, contatore ogni 60 s, liste mai ricaricate): ora 30 s + ricarica al ritorno sulla finestra + invalida le liste; (2) bacheca programmata mai notificata: ora la notifica parte entro 10 minuti dalla pubblicazione.
- F13 media (decisione di prodotto aperta): l'atleta non riceve notifica per convocazione creata (resta in bozza finché non si preme "Invia convocazioni"), quota creata, pagamento registrato, aggiunta a una squadra. Chi collauda si aspetta "convoco, l'atleta vede". Da verificare nel collaudo con Davide/Marco e decidere se inviare subito o rendere evidente il passo "Invia".
- F14 bassa: l'agente T4 ha usato `git stash`/`stash pop` nel repo condiviso (ripristino riuscito, stash vuoto): da non ripetere. Da verificare che nessun file degli altri agenti sia andato perso.
- T3: schermate non ancora viste a 320px; "Cosa succede dopo" sta sotto il form nella card (non accanto).

## Collaudo con persone, giro 1 (browser vero, backend vero, società "ASD Pallavolo Rosa" creata da zero)
Percorso eseguito: Rita registra la società (2 passi) -> crea squadra -> invita allenatore -> crea link di iscrizione; Davide accetta l'invito; Elena iscrive Sara (12 anni) dal link; Davide crea la partita e convoca; Elena vede la convocazione, conferma, vede la notifica; Rita rivede la home. Tutto il percorso funziona sul backend vero.
- F15 media: nei select e nel testo "Entri nella squadra U16" la squadra compare con la categoria e non col nome ("Rosa Under 16"); con due squadre della stessa categoria sono indistinguibili.
- F16 media: la pagina `/invito/[token]` non dice a quale società e con quale ruolo si viene invitati.
- F17 media: nell'iscrizione atleta il blocco introduttivo resta alto a ogni passo e spinge il modulo sotto la piega.
- F18 bassa: dopo "Invia convocazioni" a mano compare l'etichetta "Inviate in automatico".
- F19 media: con 3 passi su 4 fatti, "Per iniziare" riempie la prima schermata e nasconde "Da fare adesso". Deve ridursi ai soli passi mancanti.
- F13 (confermata, ambigua): "Convoca atleti" salva in bozza, serve "Invia convocazioni" perché l'atleta le veda. Il messaggio c'è, ma Davide può non accorgersene.
- F20 bassa: "Tutti i tesserati, in ordine." con zero tesserati; su schermi larghi (2400px) pannello sinistro e form di login/registrazione restano lontanissimi.
- OK verificati: menu filtrato per ruolo (allenatore senza Amministrazione), badge notifiche su "Comunicazione" e su "Notifiche" (anche per genitore), notifica convocazione visibile subito dopo l'invio, "dove trovo il bilancio?" risolto (link in "Quote e pagamenti" e menu Amministrazione).
- Non verificato nel browser: 320-390px (finestra non emulabile col tool), caricamento documento, pagamenti. Coperto da Playwright (E2E mockati + reali).
- Luca (segreteria, invitato da Rita): il menu è coerente con la matrice (Amministrazione = Quote + Scadenze e documenti; Bilancio e Sponsor solo admin). Nota F21 bassa: per Luca nessuna spiegazione del perché non vede il Bilancio (da valutare se serve un messaggio; non è un difetto di permessi).

## Giro 2 (2026-10-17 notte): collaudo dell'utente e verifica del lead
- G1 (utente): scheda documenti admin poco chiara e pulsante "Aggiungi documento" sempre presente. Corretto (D-35).
- G2 (utente): sezione Squadre povera, nessuna scheda di dettaglio, nessun filtro. Corretto (D-36); lo staff di squadra non è ottenibile dall'API.
- G3 (utente): l'atleta doveva poter rispondere subito all'evento e l'admin vedere i senza risposta. Corretto (D-32).
- G4 (utente): statistiche storte e senza gerarchia. Ridisegnate (KPI, blocchi con "Come leggere").
- G5 (utente): home atleta a griglia, documenti con colori e anteprima, "Ho pagato", ricevuta visibile e inviata a entrambi. Fatto (D-33..D-35).
- G6 (lead, media): con la serie degli allenamenti l'atleta demo aveva 33 convocazioni "Da confermare" in un elenco. Ora le 5 più vicine con rimando al calendario.
- G7 (lead, bassa): titolo documento ripetuto ("Certificato medico · Certificato medico"). Corretto (`documentHeading`).
- G8 (lead, metodo): i mock E2E non avevano `claimedAt` e la pagina Quote andava in errore. Mock allineati al contratto.
- G9 (aperta, bassa): titolo di Pagamenti per l'atleta ("Quote incassate, senza rincorrere") e colonna Quota della rosa stretta.
- G10 (aperta): confermare oltre i posti non è bloccato (la barra lo dice); se un certificato scade dopo la creazione dell'evento la risposta già presente resta.
- Metodo: fase rossa del TDD dichiarata solo in parte da FE-A e FE-B (test scritti prima ma non sempre eseguiti rossi). Tutti i cinque agenti hanno letto le skill. Un reset del dev.db è stato bloccato da Prisma senza consenso dell'utente: non eseguito.
