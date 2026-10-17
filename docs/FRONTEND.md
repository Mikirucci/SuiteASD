# Frontend SuiteASD (`apps/web`)

Guida per chi aggiunge moduli o pagine. Specifica funzionale: `docs/SPEC.md`. Regole del team: `CLAUDE.md`.
Il design di riferimento è sempre **visibile in `/design`** (token e componenti con tutti gli stati).

## 1. Stack e comandi

Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + lucide-react + `motion` (Framer Motion, import da `motion/react`) + TanStack Query + react-hook-form + zod. Test: Vitest + Testing Library + jest-axe (unit), Playwright + axe-core (E2E).

Da `apps/web` (o dalla root con `-w apps/web`):

| Comando | Cosa fa |
|---|---|
| `npm run dev` | dev server su `http://localhost:3000` |
| `npm run build` / `npm start` | build e avvio di produzione |
| `npm run lint` | ESLint (vieta `any`, `@ts-ignore`, `console.log`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (componenti, client API, auth, shell) |
| `npm run test:e2e` | Playwright (compila e avvia la build di produzione da solo; riusa un server già acceso su :3000) |

Variabile d'ambiente: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`, vedi `.env.example`).
Il frontend parla col backend **solo via HTTP**; il backend deve avere `http://localhost:3000` in `CORS_ORIGINS`.

## 2. Struttura

```
apps/web/
  src/
    app/                    Route (App Router) e layout
      layout.tsx            font, <Providers>
      globals.css           TOKEN DEL DESIGN (unico posto)
      (auth)/               pagine di accesso: login, registrazione
      (public)/             pagine pubbliche senza sessione: iscrizione/[code] (link di iscrizione)
      (app)/                amministrazione: layout = AuthGuard + AdministrationFrame (AppShell)
        page.tsx            home: cruscotto con l’anteprima di ogni servizio
      (personale)/          area personale di atleta e genitore (/area-personale/...): layout = AuthGuard + PersonalFrame
        [...slug]/page.tsx  fallback onesto per le rotte non ancora esistenti
      design/page.tsx       vetrina di token e componenti
    components/ui/          libreria componenti (un file per componente) + index.ts
    config/modules.ts       moduli mostrati come card nella home (il menu è in features/shell/nav-items.ts)
    features/<area>/        codice di una funzionalità (auth, shell, home, design, ...)
    lib/                    api/ (client HTTP), cn, avatar, dates, env
    test/                   setup Vitest e helper (a11y)
  e2e/                      test Playwright (+ support/mock-api.ts, support/axe.ts)
```

Chi è solo atleta o genitore viene portato in `/area-personale`; chi ha anche un ruolo di amministrazione vede un link per passare da un’area all’altra. `features/shell` espone `AppShell` con la navigazione ricevuta come `ShellNavigation` (voci, barra in basso, home) e i due frame in `area-frames.tsx`. L’area personale riusa le pagine di calendario, pagamenti (`quote`), classifica e notifiche, e ha le sue (`features/personale`: home, documenti con caricamento, profilo).

Ogni modulo vive in `src/features/<modulo>/` e ha la sua rotta in `src/app/(app)/<modulo>/`. Così più agenti lavorano in parallelo senza toccare gli stessi file.

## 3. Design tokens

Sono tutti in `src/app/globals.css` (`@theme`). Palette e stile derivano dal video: blu elettrico + verde menta, card bianche arrotondate, ombre morbide tinte di blu, avatar a iniziali, sottolineatura menta sulla parola chiave.

- **Colori primitivi**: `brand-*` (blu, `500` = `#3b5bff`), `mint-*` (successo e sottolineatura), `ink-*` (neutri blu notte), `orange-*` (scadenze), `red-*` (errore), `gold-*` (MVP), `avatar-*`.
- **Colori semantici (usare questi nei componenti)**: `bg-canvas`, `bg-surface`, `bg-surface-muted`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `border-line`, `border-line-control` (bordi dei campi, contrasto >= 3:1), `bg-primary`, `bg-primary-soft`, `text-primary-fg`, `text-success` / `bg-success-soft`, `text-warning` / `bg-warning-soft`, `text-danger` / `bg-danger-soft`.
- **Tipografia**: Plus Jakarta Sans (`next/font`), scala **12 / 14 / 16 / 20 / 24 / 32** = `text-xs, sm, base, lg, xl, 2xl`. Titoli con `tracking-title` (-0.025em), etichette maiuscole con `tracking-label`. Non esistono altre dimensioni.
- **Spaziatura**: scala Tailwind a 4px; usare **4 / 8 / 12 / 16 / 24 / 32** (`1, 2, 3, 4, 6, 8`). Per i layout di pagina sono ammessi multipli più grandi (`10`, `12`, `16`...).
- **Raggi**: `rounded-sm` 8 (tag, check), `rounded-md` 12 (pulsanti, campi), `rounded-lg` 16 (card), `rounded-xl` 24 (dialog, pannelli), `rounded-full` (pill, chip, avatar).
- **Ombre**: `shadow-soft` (card), `shadow-raised` (hover), `shadow-brand` (pulsante primario), `shadow-overlay` (dialog).
- **Z-index**: `z-sticky` 20, `z-overlay` 40, `z-modal` 50, `z-toast` 60. Mai `z-[999]`.
- **Movimento**: `MotionConfig reducedMotion="user"` globale + regola CSS per `prefers-reduced-motion`. Animare solo `transform` e `opacity`.
- **Dark mode**: non implementata (costo non nullo: serve rivedere sfondo a gradiente e avatar). I token semantici sono già separati (`@theme inline`) per aggiungerla in un solo punto.

Regole: niente hex nei componenti, niente valori arbitrari (`p-[13px]`), niente colore come unico segnale di stato (usare icona + testo: vedi `Chip`, `StatusMark`).

## 4. Componenti (`@/components/ui`)

Import: `import { Button, Input, Avatar } from "@/components/ui"` (o dal file singolo).

Azioni: `Button`, `IconButton` (aria-label obbligatoria), `ButtonLink`. Campi: `Input`, `Select`, `Textarea`, `Checkbox`, `Switch` (etichetta sempre visibile sopra il campo; `hint` ed `error` collegati con `aria-describedby`). Persone e stati: `Avatar`, `AvatarStack`, `Badge`, `Chip`, `PaymentChip`, `AutoChip` (Zap), `StatusMark`, `PillFilter`. Dati: `Card`, `ProgressBar`, `ProgressRing`, `Timeline`, `WeekStrip`, `DataList`/`DataListRow`, `DataTable`, `DataBoundary`. Navigazione e overlay: `Tabs`, `Dialog`, `Drawer`, `ToastProvider`/`useToast`. Stati: `EmptyState`, `ErrorState`, `Skeleton`/`SkeletonRows`, `Alert`. Identità: `Logo`, `AppIcon`, `SectionHeading` (badge `01` + etichetta + titolo con parola evidenziata), `Highlight`, `Reveal`.

Convenzioni:

- Un componente = un file, con test accanto (`*.test.tsx`). Props tipizzate, niente `any`.
- `"use client"` solo dove serve (hook, handler, motion). Un componente con handler `onClick` interno deve essere client.
- Mai una `Card` dentro una `Card`. Raggruppare con spazio o `divide-y`.
- Elenchi e tabelle: usare `DataList`/`DataTable` (o `DataBoundary` per layout propri): gestiscono loading, errore (con "Riprova") e vuoto.
- Il voto usa `ProgressRing` (fasce: >= 8 blu, 7+ verde, 6+ arancio, sotto 6 rosso). Gli avatar hanno tinte scelte perché le iniziali bianche passino AA.

## 5. Dati, errori, autenticazione

**Client API** (`src/lib/api`): `api.get/post/put/patch/delete<T>(path, ...)` con tipi in `types.ts` (allineati a `apps/api`; quando c'è `docs/API.md`, fa fede quello).

- Il token di accesso sta in memoria; il refresh token in `localStorage` (così la sessione sopravvive al reload). Compromesso: leggibile da uno script XSS; la mitigazione è la CSP e nessun HTML non fidato. Se in futuro il backend offrirà cookie `httpOnly`, cambia solo `token-store.ts`.
- Su `401` il client rinnova **una sola volta** (single flight), ripete la richiesta e, se il refresh è rifiutato, svuota la sessione e notifica `api.onSessionExpired` (l'`AuthProvider` porta l'utente al login). Un errore di rete non fa mai perdere la sessione.
- Scritture sensibili (pagamenti, invii): passare `idempotencyKey` e riusarla nei retry.
- Errori: `ApiError` (RFC 7807: `status`, `code`, `fieldErrors`) e `NetworkError`. **Mostrare sempre `describeError(error)`**: traduce in italiano per status e `code`; i messaggi del backend sono in inglese e non vanno mostrati.

**Data fetching: TanStack Query** tramite i due hook sottili:

```tsx
const members = useApiQuery<Member[]>(["members", { team }], "/members", { query: { team } });
const pay = useApiMutation((input: PaymentInput, client) => client.post<Payment>("/payments", input, { idempotencyKey }), {
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payments"] }),
});
```

Chiave query = `[risorsa, ...parametri]`. Dopo una scrittura si invalida la chiave, non si modifica la cache a mano. Niente retry sui 4xx (impostato in `providers.tsx`). Mostrare i risultati con `DataList`/`DataTable`/`DataBoundary` passando `isLoading`, `error`, `onRetry`.

**Auth**: `useAuth()` dà `status` (`loading | unauthenticated | authenticated`), `me` (utente, società, ruoli, permessi), `login`, `register`, `logout`. Il gruppo `(app)` è protetto da `AuthGuard` (redirect a `/login?next=...`), `(auth)` da `GuestGuard` (un utente già dentro va alla destinazione `next`, validata da `safeNextPath`). I permessi veri sono applicati dal server; la UI li usa solo per nascondere azioni.

**Form**: react-hook-form + zod (`zodResolver`), `noValidate`, messaggi italiani, limiti allineati all'API. Errori server: `describeError` in un `Alert` per l'errore generale e `setError` sul campo quando `fieldErrors`/`code` lo indicano (vedi `register-form.tsx`).

## 6. Come aggiungere un modulo o una pagina (checklist)

1. Leggere la sezione del modulo in `docs/SPEC.md` e i contratti in `docs/API.md` / OpenAPI (`/docs` sul backend).
2. Creare `src/app/(app)/<modulo>/page.tsx` (server component, solo `metadata` + il componente di feature). Una rotta più specifica sostituisce da sola il fallback `[...slug]`: non toccare nessun altro file di routing.
3. Se la pagina non è nel menu, aggiungere una voce al gruppo giusto di `ADMIN_ENTRIES` in `src/features/shell/nav-items.ts` (etichetta, `href`, icona lucide, `permission` necessaria): sidebar, menu da telefono e filtro per ruolo la usano da lì. Un gruppo con una sola voce visibile diventa un link diretto; un gruppo senza voci visibili sparisce.
4. Creare `src/features/<modulo>/` con componenti, tipi delle risposte API e hook (`useApiQuery`/`useApiMutation`).
5. Pagina con titolo `h1` (`SectionHeading as="h1"` con `index` e parola evidenziata, come nel video), poi contenuto. Ogni schermata ha **loading, vuoto, errore** (usare `DataBoundary`) e funziona da 320px a desktop.
6. Solo componenti e token esistenti. Se manca un componente generico, aggiungerlo in `components/ui/` con test e con una sezione in `/design`; non copiare markup nelle feature.
7. Testo UI in italiano, codice e commenti in inglese. Etichette per ogni campo, bersagli di tocco >= 44px, focus visibile.
8. Test: Vitest sui componenti di feature (stati e accessibilità con `expectNoA11yViolations`) e almeno un E2E sul flusso principale.
9. Prima di dichiarare finito: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`, tutto verde.

## 7. Test

**Unit (Vitest)**: file `*.test.tsx` accanto al codice. `src/test/a11y.ts` espone `expectNoA11yViolations(container)` (jest-axe; il contrasto colori non è misurabile in jsdom, lo copre Playwright). Si usano query per ruolo/nome (`getByRole`) come farebbe un utente da tastiera o screen reader. Per i moduli che usano `useAuth` o `next/navigation` si mockano come in `features/auth/auth-session.test.tsx`.

**E2E (Playwright)**: due suite. `npm run test:e2e` (file in `e2e/*.spec.ts`, API mockata) e `npm run test:e2e:real` (file in `e2e-real/`, API vera con database temporaneo e seed demo; i test girano in sequenza e condividono il database). L'API è mockata a livello di rete con `mockApi(page)` (`e2e/support/mock-api.ts`: gestisce CORS, `OPTIONS` e gli endpoint auth con errori RFC 7807). Per un nuovo modulo estendere lo `switch` di `mockApi` con i suoi endpoint (o usare `page.route` nel test). `seedStoredSession(page)` simula un utente già autenticato. `auditAccessibility(page)` esegue axe-core nel browser vero (WCAG 2.2 A/AA, contrasti inclusi): ogni pagina nuova dovrebbe avere il suo controllo.

```ts
test("lista tesserati", async ({ page }) => {
  await mockApi(page);          // oppure backend reale su :4000
  await seedStoredSession(page);
  await page.goto("/tesserati");
  await expect(page.getByRole("heading", { level: 1, name: /Tutti i tesserati/ })).toBeVisible();
  expect(await auditAccessibility(page)).toEqual([]);
});
```

Con il backend reale acceso (`npm run dev` dalla root) si possono scrivere E2E senza mock: usare `registrazione` per creare una società di prova con email univoca.

## 8. Regole anti-slop del progetto

- Look = quello del video. Niente gradienti viola casuali, niente neon/glow, niente ombre nere pure. L'unico gradiente di superficie è lo sfondo blu-menta molto tenue con griglia di puntini.
- Niente card dentro card, niente tre card uguali come "feature row", niente simmetria forzata dove l'informazione non lo è.
- Niente emoji come icone: solo lucide-react, tratto coerente. Niente icone SVG disegnate a mano tranne il logo.
- Niente testo segnaposto (lorem, "Jane Doe", "Acme"): dati demo realistici in italiano (Aquile Volley, ecc.). Niente numeri finti di precisione nel prodotto.
- Copy: frasi semplici, verbi concreti, nessun "seamless/elevate". Rileggere ogni stringa prima di consegnare.
- Stati completi sempre: default, hover, focus-visible, active, disabled, loading, errore; schermate con loading/vuoto/errore.
- Accessibilità non negoziabile: tastiera, `:focus-visible` (outline 2px blu), label reali (mai placeholder come label), contrasto AA, `prefers-reduced-motion`, nome accessibile che contiene il testo visibile (WCAG 2.5.3).
- Movimento solo se motivato (gerarchia, feedback, cambio di stato): barre e anelli che si riempiono, comparsa a cascata delle liste, dialog. Mai animazioni infinite decorative.
- Niente codice morto, `any`, `@ts-ignore`, test saltati. Nessun mock o placeholder lasciato nel prodotto: le rotte non ancora costruite mostrano un `EmptyState` onesto.

## 9. Note e limiti noti

- Tutti i moduli della SPEC sono costruiti; `[...slug]` resta come fallback onesto per le rotte che non esistono ("Questa pagina non è ancora disponibile" dentro la shell).
- Le pagine di amministrazione conservano la vista "solo i propri dati" per atleta e genitore (ad esempio Tesserati, Scadenze, Pagelle): oggi chi ha solo quei ruoli viene portato in `/area-personale`, quindi quella vista serve solo a chi unisce un ruolo di amministrazione e uno personale con permessi limitati. Le pagelle sono destinate a essere eliminate.
- `AGENTS.md` in `apps/web` è generato da `next dev` (Next 16.4): lascialo, ricorda di leggere `node_modules/next/dist/docs/` prima di usare API Next poco comuni.
- Vitest: il workspace ha altre copie di vitest (backend); i matcher di jest-dom sono registrati a mano in `src/test/setup.ts` per estendere la copia giusta.
