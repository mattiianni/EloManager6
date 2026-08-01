# Padel ELO Manager — Design (v6.7.8)

Questo documento descrive l’architettura e le scelte di design dell’app **Padel ELO Manager** (frontend React/Vite + backend Express + PostgreSQL su Neon), con focus su flussi utente, modello dati e punti “non ovvi” (stampa PDF, PWA, multi-workspace, tornei a squadre).

## Obiettivo prodotto

Gestire l’intero ciclo di una serata/torneo di padel:
- anagrafica giocatori
- generazione coppie/sorteggi e tabelloni
- inserimento risultati (anche dopo)
- aggiornamento automatico ELO e classifiche
- statistiche torneo e serie
- export/stampa PDF (tabelloni vuoti, riepiloghi, report finali)
- multi-workspace con accesso tramite codici a 6 cifre

## Stack tecnico

Frontend:
- React 18 + TypeScript
- Vite (runtime reale) + Tailwind CSS
- PWA con `vite-plugin-pwa` (manifest + service worker)

Backend:
- Node.js + Express 5
- JWT per auth (token in localStorage)
- Neon PostgreSQL (`@neondatabase/serverless`)

PDF:
- Generazione in backend e/o frontend (in repo c’è un `printService.ts` lato frontend per diversi report; il backend usa anche PDFKit per alcune guide/script)

### Normalizzazione condivisa di turni e partite

`utils/tournamentRounds.ts` è la fonte comune per ordinamento di turni/giornate, ordine stabile delle partite, numerazione campi e riposi. UI e PDF non devono ricostruire autonomamente questi dati né affidarsi all'ordine restituito dal database.

Per `Gironi + Fase Finale`, `group_number`, `phase` e `gironi_playoff_type` sono dati persistiti. La gerarchia è sempre `girone → turno → partita`; quarti, semifinali e finali non possono essere dedotti dalla posizione nell'array. Il PDF può calcolare e mostrare gli accoppiamenti della fase successiva soltanto quando la fase precedente è integralmente conclusa.

L'identità di una partita tra due coppie è indipendente dall'ordine interno dei giocatori e dal lato del campo; `utils/matchIdentity.ts` evita duplicazioni durante la modifica dei tabelloni TPRA.

`utils/matchOutcome.js` è la policy condivisa degli esiti. `0-0` è sempre non inserito; i pareggi sono ammessi nelle fasi ordinarie e vietati in Eliminazione Diretta, semifinali, finali, finaline e consolazioni. Il backend ripete sempre la validazione prima di salvare, avanzare il tabellone o calcolare l'ELO.

La creazione bulk e il completamento di un torneo sono transazioni atomiche. Ogni creazione porta una chiave idempotente per rendere sicuri retry, timeout e doppio clic.

### Dialoghi e conferme HIG

`utils/higDialogService.ts` è l’unico punto di ingresso per avvisi e conferme applicative. `components/ui/HIGDialogHost.tsx` mantiene una coda globale e presenta ogni richiesta tramite `HIGAlert`; non usare `window.alert()` o `window.confirm()`.

Le conferme sono asincrone e devono essere attese prima di qualsiasi mutazione. `HIGAlert` viene renderizzato tramite portal, mantiene il focus al proprio interno, ripristina il controllo precedente e rende inerte l’app sottostante finché il dialogo è aperto.

## Runtime e entrypoint

- Frontend bootstrap: `index.tsx`
- Build: `npm run build` (Vite)
- Backend: `server.js` (Express) su `:3001`
- Dev full stack: `npm run dev:full` (concurrently: server + vite dev)

Nota: nel repo esistono file Next.js “residui storici” (es. `pages/index.tsx`, `_document.tsx`) ma non sono il runtime principale.

## Concetti chiave di dominio

### Workspace
Tutti i dati applicativi sono scoped da `workspace_id`.
Un workspace rappresenta un gruppo/circolo. Ogni workspace ha:
- giocatori
- tornei e giornate
- partite
- elo history
- codici di accesso
- audit log

### Access codes
Accesso tramite codice numerico a 6 cifre:
- verificato con bcrypt (hash in DB)
- può essere admin o no
- può avere scadenza (`expires_at`)
- può essere disattivato / cancellato (admin)

### Tornei e “giornate”
Il termine “giornata” rappresenta una sessione di gioco.
Per alcuni formati, una “serie” di torneo può comprendere più giornate collegate (es. stesso nome/serie).
Regola UX importante:
- creare nuovo torneo solo per nuova serie
- per continuare una serie esistente si “aggancia” una giornata al torneo esistente (UI: bottone accanto al torneo)

### Torneo a squadre
È un flusso separato dai tornei a coppie:
- esiste un torneo “root”
- esistono “matchday” (giornate) collegate al root
- ci sono tabelle dedicate (config, teams, matchdays, submatch, fixtures)
- supporta formati round robin / andata-ritorno / eliminazione diretta (a livelli diversi di completezza)

## Flussi utente principali

### 1) Accesso
1. Inserisci codice 6 cifre
2. Backend valida e rilascia JWT
3. Frontend salva token + workspace in localStorage

### 2) Creazione giornata (tornei a coppie)
1. “Nuovo Torneo / Nuova Giornata”
2. Scegli: singolo/coppie, torneo a squadre, oppure aggancio a torneo esistente
3. Se coppie: selezione giocatori, numero coppie, tipo sorteggio
4. Sorteggio e conferma coppie
5. Opzioni specifiche del formato
6. Nome, data e circolo obbligatori
7. Anteprima/tabellone
8. Azioni: salva / stampa PDF / inserisci risultati subito

### 3) Inserimento e modifica risultati
- Sezione “Risultati” permette di:
  - recuperare giornate salvate
  - inserire punteggi/set
  - modificare punteggi successivamente
- Alla conferma: aggiornamento ELO + storico + statistiche

### 4) Stampa / PDF
PDF usati in due momenti:
- prima della giornata: tabellone vuoto/operativo per compilazione in campo
- dopo: report finale/riassuntivo

I report vuoti con semifinali/finali usano lo schema visivo Beat the Box. Le sezioni ricevono partite già normalizzate; una riga non viene spezzata, mentre una tabella lunga può continuare nella pagina successiva. La stampa attende `document.fonts.ready`.

Su iOS/PWA l’esperienza passa spesso dalla preview nativa.

### 5) Statistiche
Statistiche leggono match completati e possono essere “parziali” se il torneo non è completato ma esistono partite concluse.
Per torneo a squadre: statistiche basate su submatch giocati.

### 6) Admin
Admin gestisce:
- workspaces (create, impersonate, delete con guardrail)
- codici (generate, scadenza, disattiva, cancella permanente)
- audit log
- ricalcolo ELO (tutti i workspace o uno specifico)

## Modello dati (PostgreSQL)

Tabelle core:
- `workspaces`
- `access_codes`
- `audit_logs`
- `players`
- `tournaments`
- `matches`
- `elo_history`

Tabelle team tournament:
- `team_tournament_configs`
- `team_tournament_teams`
- `team_tournament_matchdays`
- `team_tournament_matchday_matches`
- `team_tournament_fixtures`

Vincoli importanti:
- molte FK sono `ON DELETE CASCADE` da `workspaces` verso dati scoped (players/tournaments/matches/elo_history/access_codes)
- `audit_logs.workspace_id` è `ON DELETE SET NULL` per conservare log anche dopo cancellazioni

## API backend (shape)

Pattern:
- tutte le API sono sotto `/api/...`
- middleware imposta `Cache-Control: no-store` per evitare UI stantia
- auth: JWT in header `Authorization: Bearer <token>`
- admin routes protette da `requireAdmin`

Categorie:
- `/api/auth/*`: login/verify
- `/api/data/*`: bootstrap dati workspace (tournaments, matches, players, ecc.)
- `/api/admin/*`: workspaces, codes, impersonate, audit logs, recalc
- endpoints specifici per team tournament (config, matchday, fixtures, stats)

## Frontend (organizzazione)

Componenti principali:
- `components/layout/*`: header, sidebar
- `pages/*`: Dashboard, Tornei, Risultati, Classifiche, Giocatori, Statistiche, Admin, TeamTournament*
- `services/*`: logica stampa, call API, logiche torneo/elo
- `hooks/*`: store e auth

Stile:
- Tailwind
- tema light/dark con class `.dark` e token CSS (var `--app-*` usati in alcune parti)

## PWA / caching

PWA gestita da `vite-plugin-pwa`.
Linee guida chiave:
- evitare caching per `/api/*` (in particolare `/api/data` e `/api/auth`)
- update aggressivo SW (`skipWaiting`, `clientsClaim`, cleanup)

## Decisioni e tradeoff

- Multi-workspace via `workspace_id` su tutte le entità principali: semplifica isolamento dati.
- Accesso via codici a 6 cifre (invece di utenti/password) per UX semplice in gruppi/circoli.
- Alcune funzionalità “pro” (admin, scadenze codici, impersonation) privilegiano operatività rispetto a IAM complesso.
- Stampa/PDF è parte del prodotto (non optional), quindi il design deve preservare layout e timing su iOS.

## Cose da non rompere (invarianti)

- Qualunque update a UI/UX deve evitare layout shift su mobile/PWA (CTA/footer, sidebar, ecc.)
- Intestazione e Splash Screen usano i loghi grafici (elomanager.png e elomanager_w.png) in sostituzione al testo, con switch automatico in base al tema di sistema (light/dark).
- Le tabelle dei PDF sono ottimizzate in larghezza (colonne nomi vs colonne set) per evitare che i punteggi dei match a 3 set vadano a capo rovinando il layout.
- Tutte le query lato backend devono filtrare per `workspace_id` dove applicabile
- Nessuna cache su API: i risultati devono aggiornarsi immediatamente dopo salvataggi
- `Torneo a squadre` resta un flusso separato: non forzare le logiche “a coppie” dentro i matchday
- Un torneo multifase resta `scheduled` fino alla conclusione dell'ultima finale. Il completamento dei gironi/box/round robin non deve attivare ELO finale né nascondere le azioni “In corso”.
- Se cambia un risultato della fase iniziale, le fasi conclusive dipendenti devono essere eliminate e rigenerate dopo conferma; il PDF deve leggere le stesse fasi persistite usate dalla UI.
