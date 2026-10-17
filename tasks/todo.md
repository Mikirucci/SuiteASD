# Task list (vedi plan.md)

## Fase 1: costruzione (agenti in parallelo, perimetri disgiunti)
- [ ] T1 NAV: menu a gruppi con fisarmonica, filtro per permesso, via l'hub Altro (`features/shell`, `config/modules.ts`, `features/altro/sections.ts`, `app/(app)/altro/page.tsx`, test collegati)
- [ ] T2 ORG: pagine Squadre e Inviti (`features/squadre`, `features/inviti`, rotte `app/(app)/squadre`, `app/(app)/inviti`; backend solo se manca un endpoint)
- [ ] T3 ONBOARDING: registrazione società a 2 passi e iscrizione atleta rifatta (`features/auth/register-form*`, `features/iscrizioni/enrol-page*`, `app/(auth)`, `auth-frame`)
- [ ] T4 NOTIFICHE: indagine e correzione del "non mostrate" (`features/notifiche`, `hooks/use-unread-count`, backend notifiche se serve)
- [ ] T5 HOME (dopo T1): cruscotto a 3 livelli + percorso "Per iniziare" (`features/home`)

## Checkpoint 1
- [ ] lint, typecheck, test api + web verdi; build ok; E2E mockati aggiornati e verdi

## Fase 2: collaudo con persone sul backend vero
- [ ] P1 Rita crea la società da zero, arriva alla home, crea squadra, genera link, invita un allenatore
- [ ] P2 Marco si iscrive dal link; Elena iscrive Sara (<14 anni); controllo area personale e notifiche
- [ ] P3 Davide (allenatore, 390px) e Luca (segreteria): voci di menu, permessi, convocazioni
- [ ] P4 Rita: quote, bilancio, report PDF, scadenze; "dove trovo...?"
- [ ] Falle in `tasks/findings.md`, correzioni, ripetizione dei passi che hanno fallito

## Checkpoint 2
- [ ] Verifica finale completa; docs (SPEC §10, DECISIONS, PROGRESS) e memoria aggiornati; commit locali
