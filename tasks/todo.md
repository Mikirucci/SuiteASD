# Task list (vedi plan.md)

## Fase 1: costruzione (agenti in parallelo, perimetri disgiunti)
- [x] T1 NAV: menu a gruppi con fisarmonica, filtro per permesso, via l'hub Altro (`features/shell`, `config/modules.ts`, `features/altro/sections.ts`, `app/(app)/altro/page.tsx`, test collegati)
- [x] T2 ORG: pagine Squadre e Inviti (`features/squadre`, `features/inviti`, rotte `app/(app)/squadre`, `app/(app)/inviti`; backend solo se manca un endpoint)
- [x] T3 ONBOARDING: registrazione società a 2 passi e iscrizione atleta rifatta (`features/auth/register-form*`, `features/iscrizioni/enrol-page*`, `app/(auth)`, `auth-frame`)
- [x] T4 NOTIFICHE: indagine e correzione del "non mostrate" (`features/notifiche`, `hooks/use-unread-count`, backend notifiche se serve)
- [x] T5 HOME (dopo T1): cruscotto a 3 livelli + percorso "Per iniziare" (`features/home`)

## Checkpoint 1
- [x] lint, typecheck, test api + web verdi; build ok; E2E mockati aggiornati e verdi

## Fase 2: collaudo con persone sul backend vero
- [x] P1 Rita crea la società da zero, arriva alla home, crea squadra, genera link, invita un allenatore
- [x] P2 Marco si iscrive dal link; Elena iscrive Sara (<14 anni); controllo area personale e notifiche
- [x] P3 Davide (allenatore, 390px) e Luca (segreteria): voci di menu, permessi, convocazioni
- [x] P4 Rita: quote, bilancio, report PDF, scadenze; "dove trovo...?"
- [x] Falle in `tasks/findings.md`, correzioni, ripetizione dei passi che hanno fallito

## Checkpoint 2
- [x] Verifica finale completa; docs (SPEC §10, DECISIONS, PROGRESS) e memoria aggiornati; commit locali

# Giro 2 (vedi plan.md, "Giro 2")
Giro 1 completato e committato (2df0ed9).
## Fase 1 (agenti in parallelo)
- [x] API-1 convocazioni automatiche (D-32)
- [x] API-2 pagamento segnalato e ricevute (D-33, D-34)
- [x] FE-A documenti (D-35)
- [x] FE-B squadre (D-36)
- [x] FE-C statistiche
## Fase 2 (dopo le API)
- [x] FE-D home atleta a griglia + risposta agli eventi + riepilogo admin tre gruppi
- [x] FE-E pagamenti: "Ho pagato", ricevuta visibile
## Checkpoint 1: lint, typecheck, test api+web, build, E2E mockati
## Fase 3: collaudo a persone sul backend vero
- [x] Rita/Davide/Elena/Marco: evento -> risposta immediata -> admin vede 3 gruppi; documento atleta -> admin; "Ho pagato" -> admin registra -> ricevuta a entrambi
## Checkpoint 2: docs (SPEC §10, DECISIONS D-32..D-36, API, FRONTEND, PROGRESS), memoria, commit locali
