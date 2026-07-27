# Padel ELO Manager

Applicazione full-stack per la gestione di tornei di padel con ranking ELO, statistiche, PDF e isolamento dati per workspace.

Versione documentata: `v6.0.3`

## Stato attuale

- Runtime frontend: `React 18 + TypeScript + Vite`
- Backend: `Express 5`
- Database: `Neon PostgreSQL`
- Auth: `JWT` con codice di accesso a 6 cifre
- Multi-workspace: attivo
- PWA: attiva tramite `vite-plugin-pwa`

I file `pages/_app.tsx`, `pages/_document.tsx`, `pages/index.tsx` e `next.config.js` sono residui storici. Il runtime effettivo dell'app e' Vite, con bootstrap da `index.tsx`.

## Routine release

- Versione corrente: `6.0.3`
- Dalla release successiva si incrementa la patch: `6.0.4`, ...

## Aggiornamenti v6.0.3

- Versione prodotto aggiornata a `6.0.3`.
- **UI Redesign 2x2:** Schermata iniziale "Cosa vuoi organizzare oggi?" riprogettata con una griglia 2x2 di Card interattive con icone flat minimaliste.
- **Pulsante Back Rapido:** Aggiunto il pulsante "← Torna indietro" nella vista di configurazione del sorteggio.
- **Documentazione ELO e Guida HTML:** Aggiornati i manuali con i riferimenti della versione 6.0.3 e del K-factor unificato K=16.

## Aggiornamenti v5.0.2

- Versione prodotto aggiornata a `5.0.2`.
- **Integrazione ELO-Playtomic:** introdotta una rigorosa corrispondenza bidirezionale tra il punteggio ELO e i livelli standard Playtomic (visibile sia in creazione che in modifica giocatore).
- Deploy: configurato deploy serverless su Vercel con passaggio a `bcryptjs` e configurazione `vercel.json` con filesystem routing.
- Admin: pillola rossa per login non-admin per facilitare il monitoraggio degli accessi.
- UI Layout: posizionato il nome del workspace sotto data e versione in visualizzazione desktop.
- Data release e visualizzazioni PDF allineate a `Giu 2026`.

## Aggiornamenti v4.1.9

- Versione prodotto aggiornata a `4.1.9`.
- Deploy: configurato deploy serverless su Vercel con passaggio a `bcryptjs` e configurazione `vercel.json` con filesystem routing.
- Admin: pillola rossa per login non-admin per facilitare il monitoraggio degli accessi.
- UI Layout: posizionato il nome del workspace sotto data e versione in visualizzazione desktop.
- Data release e visualizzazioni PDF allineate a `Giu 2026`.

## Aggiornamenti v4.1.7

- Versione prodotto aggiornata a `4.1.7`.
- Deploy: configurato deploy serverless su Vercel con passaggio a `bcryptjs` e configurazione `vercel.json` con filesystem routing.
- Admin: pillola rossa per login non-admin per facilitare il monitoraggio degli accessi.
- UI Layout: posizionato il nome del workspace sotto data e versione in visualizzazione desktop.
- Data release e visualizzazioni PDF allineate a `Giu 2026`.

## Aggiornamenti v4.1.4

- Versione prodotto aggiornata a `4.1.4`.
- Admin: nuovo tab `Invia dati` per duplicare un torneo tra workspace (dati indipendenti).
- Admin API: aggiunte route per lista tornei per workspace e trasferimento torneo (`/api/admin/workspaces/:workspaceId/tournaments`, `/api/admin/transfer/tournament`).
- UI Stitch: introdotta classe riutilizzabile `.stitch-row` e applicata alle righe Top 5 e alle card delle singole giornate in `Tornei`.
- Statistiche: pill `Dati parziali` resa leggibile anche in dark.

## Aggiornamenti v4.1.3

- Versione prodotto aggiornata a `4.1.3`.
- Admin: aggiunta cancellazione workspace con conferma forte e protezione sul workspace attuale / ultimo workspace.
- Admin: codici accesso con scadenza rapida (`8h`, `24h`, `48h`, `7 giorni`) e stato UI `Attivo / Scaduto / Disattivato`.
- Admin mobile/PWA: form `Genera Nuovo Codice` riorganizzato in modo piu' leggibile.
- PWA/assets: `icon.svg` riallineata all'icona PNG reale.
- Rimosse dal repo le bozze `Tutorials` per rifacimento successivo.

## Aggiornamenti v4.1.2

- Versione prodotto aggiornata a `4.1.2`.
- Team Matchday mobile/PWA: action bar finale resa stabile, senza spostamenti laterali quando parte il salvataggio.
- Sidebar desktop light: contrasto corretto con stato attivo piu' evidente e coerente col tema chiaro.
- Tornei: CTA `Nuovo Torneo / Nuova Giornata` resa piu' leggibile.
- PWA: icone e manifest riallineati agli asset PNG reali per installazione e home screen piu' coerenti.
- Riferimenti mese release aggiornati a `Mag 2026`.

## Aggiornamenti v4.1.1

- Versione prodotto aggiornata a `4.1.1`.
- Header: icone leggermente piu' scure e pulizia metadata.
- Dashboard: KPI principali riallineati al colore del titolo applicazione.

## Aggiornamenti v4.1.0

- Versione prodotto aggiornata a `4.1.0` con nuova routine di versioning patch-first (`4.1.1`, `4.1.2`, ...).
- Reskin UI Stitch consolidato su login, header, sidebar, dashboard, classifiche e tornei con correzioni di contrasto in tema chiaro.
- PWA allineata agli asset correnti con auto refresh aggressivo lato service worker e controllo build id per rendere visibili i deploy piu' rapidamente.
- Repository GitHub riallineata alla versione locale corrente e documentazione di backup/esportazione aggiornata.

## Aggiornamenti v4.0.12

- Presentazione HTML: aggiunto collegamento reale allo sviluppatore via `mailto:matteeo@icloud.com` e versione allineata.

## Aggiornamenti v4.0.11

- Fix eliminazione diretta a squadre con BYE: fixture sempre complete (niente slot mancanti) e propagazione coerente nei turni successivi.
- Reset bracket eliminazione diretta (admin): endpoint per rigenerare il tabellone quando lo stato e' incoerente.
- Stampa PDF tabellone: i casi squadra vs BYE ora stampano esplicitamente `BYE` invece di placeholder tipo `Vincente ...`.
- Navigazione mobile: nei flussi giornata torneo a squadre, i “torna indietro” e la chiusura risultati rientrano su `Tornei`.
- Header: titolo aggiornato a `Padel Elo Manager` con sizing mobile-first (una sola riga su iPhone).

## Aggiornamenti v4.0.10

- Italianizzazione finale delle etichette UI residue nei flussi `Sorteggi`, `Risultati`, `Classifiche` e nelle action label di `Tornei`.
- Ritocco dei PDF `Gironi + Fase Finale`: tipografia delle righe partita riallineata al resto dei report.
- Allineato il flusso di stampa iOS dei tornei a squadre al comportamento storico con shell nativa di anteprima/chiusura.

## Aggiornamenti v4.0.7

- Allineamento delle card torneo: pill di stato/giornata e icone azione ora condividono la stessa riga nei casi principali.
- Correzione PDF `Gironi + Fase Finale`: il report usa sempre il flusso dedicato e raggruppa i gironi in base alle coppie reali dei match.
- Label giornate multi-torneo: intestazioni e stampe usano `Nome Torneo - N^ Giornata`; la data resta nella riga dedicata del PDF.
- Rafforzata la coerenza tra qualificati mostrati in UI e qualificati evidenziati nei PDF dei gironi.

## Funzionalita' principali

- Gestione giocatori con ELO iniziale `1500`
- Classifica globale e classifica filtrata per serie torneo
- ELO history per giocatore
- 8 formati torneo disponibili in UI:
  - `Match Singolo`
  - `TorneOtto 30'`
  - `Round Robin + Finali`
  - `Americano`
  - `Torneo Libero`
  - `Gironi + Fase Finale`
  - `Beat the Box`
  - `Torneo a Squadre` (Round Robin: in sviluppo incrementale)
- Modifica risultati anche dopo completamento torneo
- Cascade reset per tornei multi-fase
- Stampa PDF per ranking, report torneo, statistiche, Beat the Box, Gironi e Torneo Libero
- Pannello admin per workspace, codici di accesso, audit log e impersonation

### Torneo a Squadre (overview)

Il `Torneo a Squadre` e' un flusso separato rispetto ai tornei "a coppie":

- si crea dal flusso `Tornei` / `Nuovo torneo o nuova giornata`, con selezione `Torneo a squadre` nella pagina `Sorteggi`
- crea un torneo "root" (non e' una giornata)
- richiede una fase di "Completa configurazione" prima di poter inserire giornate
- le giornate del torneo a squadre sono record separati (tournaments) collegati al root tramite `team_tournament_root_id`
- supporta stampa PDF dedicata (calendario/round robin, report torneo, report singola giornata, statistiche)
- quando il round robin e' completo, passa al flusso `+ Inserisci Finali` in base alla fase finale configurata
- quando la fase finale e' completata, il bottone diventa `Riepilogo` (pagina riepilogo UI) e il PDF riepilogo torneo include anche le statistiche in fondo

## Modello dati

Tabelle principali:

- `players`
- `tournaments`
- `matches`
- `elo_history`
- `team_tournament_configs`
- `team_tournament_teams`
- `team_tournament_matchdays`
- `team_tournament_matchday_matches`
- `team_tournament_fixtures`
- `workspaces`
- `access_codes`
- `audit_logs`

Ogni record applicativo e' scoped da `workspace_id`.

## Sistema ELO

Formula base:

```text
Expected = 1 / (1 + 10^((elo_avversario - elo_giocatore) / 400))
Delta = K * (risultato - expected)
```

Configurazione attuale:

- `Friendly Match`: `20`
- `TorneOtto 30'`: `16`
- `Americano`: `24`
- `Beat the Box`: `16`
- `Torneo Libero`: `24`
- `Round Robin + Finali`:
  - round robin: `10`
  - finale 1°-2° vincitore: `32`
  - finale 1°-2° perdente: `10`
  - finale 3°-4° vincitore: `4`
  - finale 3°-4° perdente: `24`
- `Gironi + Fase Finale`:
  - gironi: `14`
  - semifinali: `20`
  - finale 1°-2° vincitore: `38`
  - finale 1°-2° perdente: `10`
  - finale 3°-4° vincitore: `8`
  - finale 3°-4° perdente: `20`

### Logica ELO per serie torneo

Per le serie multi-giornata:

- la prima giornata parte da `1500`
- le giornate successive partono dall'`elo_after` della giornata precedente della stessa serie
- il `current_elo` globale del giocatore viene aggiornato sommando i delta del torneo completato

## Setup locale

### Requisiti

- Node.js 18+
- npm
- database Neon raggiungibile

### Installazione

```bash
npm install
cp .env.example .env
```

### Variabili d'ambiente

```env
DATABASE_URL=postgresql://user:password@host/db?sslmode=require
NEON_DATABASE_URL=postgresql://user:password@host/db?sslmode=require  # Opzionale (alternativa prioritaria per Vercel/Neon integration)
PORT=3001
NODE_ENV=development
VITE_PORT=3000
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1d
ADMIN_SECRET=your-admin-secret
MAX_FAILED_ATTEMPTS=10
LOCKOUT_DURATION_MINUTES=30
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIR=logs
LOG_MAX_SIZE=10485760
LOG_MAX_FILES=7
GEMINI_API_KEY=
```

### Avvio

```bash
npm run dev:full
```

Oppure:

```bash
npm run server
npm run dev
```

URL locali:

- frontend: `http://localhost:3000`
- backend: `http://localhost:3001`

## Auth e admin

- login via codice numerico a 6 cifre
- JWT restituito dal backend
- token salvato in `localStorage`
- verifica sessione tramite `POST /api/auth/verify`
- pannello admin disponibile per codici `is_admin = true`

Su database vuoto il server crea automaticamente:

- un workspace di default
- un codice admin di bootstrap
- la migrazione dei record esistenti al workspace di default

## API principali

Pubbliche:

- `GET /health`
- `POST /api/auth/login`

Protette da JWT:

- `POST /api/auth/verify`
- `GET /api/data`
- `POST|PUT|DELETE /api/players`
- `POST|PUT|DELETE /api/matches`
- `PUT|DELETE /api/tournaments`
- `POST /api/tournaments/bulk-matches`
- `PUT /api/tournaments/complete`
- `POST /api/tournaments/cascade-reset`
- `POST /api/tournaments/starting-elos`
- `POST /api/reset-all-elo`

Team tournaments (protette da JWT):

- `POST /api/team-tournaments` (crea torneo a squadre root + config iniziale)
- `GET /api/team-tournaments/:id/config`
- `PUT /api/team-tournaments/:id/config`
- `POST /api/team-tournaments/:id/complete-configuration`
- `GET /api/team-tournaments/:id/teams`
- `PUT /api/team-tournaments/:tournamentId/teams/:teamId`
- `GET /api/team-tournaments/:id/matchdays`
- `POST /api/team-tournaments/:id/matchdays`
- `GET /api/team-tournaments/:id/player-stats`
- `GET /api/team-tournaments/:id/fixtures`

Admin:

- `GET /api/admin/workspaces`
- `POST /api/admin/workspaces`
- `GET /api/admin/codes`
- `POST /api/admin/codes/generate`
- `PUT /api/admin/codes/:id/set-plain`
- `DELETE /api/admin/codes/:id`
- `POST /api/admin/impersonate`
- `POST /api/admin/recalculate-elos`
- `GET /api/admin/audit-logs`

## Struttura progetto

```text
server.js                  API, auth, ELO, persistence
index.tsx                  bootstrap Vite
App.tsx                    shell applicazione
pages/                     pagine principali
components/                UI e flussi complessi
hooks/usePadelStore.tsx    state + fetch API
hooks/useAuth.tsx          auth client
services/                  draw, tornei, stampa, Beat the Box
utils/logger.js            logging
```

## Deploy

Il progetto utilizza Vercel per il deploy.

Nota: il deploy reale usa `node server.js` come processo applicativo. Il backend serve API e asset buildati dal frontend.
