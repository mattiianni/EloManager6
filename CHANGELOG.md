## v6.0.18 — 2026-07-27
- Trigger Vercel Deployment: Commit e push per l'avvio della build e del deploy automatico su Vercel.

## v6.0.17 — 2026-07-27
- Redesign Apple HIG Alert & Progress Control Eliminazione Torneo: Riprogettato il popup di eliminazione torneo in `HIGAlert.tsx` e `TournamentsPage.tsx`. Aumentata la larghezza a 340px con la nuova etichetta esplicita `"Elimina Torneo e Giocatori Non Più Attivi"`. Aggiunto lo stato di caricamento dinamico con Apple Spinner, progress bar animata in tempo reale e riscontro di completamento visivo.

## v6.0.16 — 2026-07-27
- Fix Margini ed Etichette Asse Y (Ordinate) Grafici ELO: Risolto il taglio delle cifre sull'asse ordinate in `PlayerProfileModal.tsx` e `RankingChart.tsx`. Aumentato il margine sinistro a `left: 15` e la larghezza dell'asse a `width={65}` con formattazione numerica pulita, garantendo la visibilità completa ed imbattibile di tutte le cifre ELO (es. `1577`, `1530`, `1505`).

## v6.0.15 — 2026-07-27
- Fix Label del Tooltip nei Grafici ELO: Risolta l'etichetta del tooltip in `PlayerProfileModal.tsx` e `RankingChart.tsx`. Ora il grafico mostra sempre il nome reale del Torneo / Giornata (es. `Torneotto 3^ Giornata`) anziché la stringa generica `Date XXXX-XX-XX`. Popolata la colonna `source_label` in `elo_history` in tutto il database Neon.

## v6.0.14 — 2026-07-27
- Implementazione Universale ELO Dinamico Reale Partita per Partita: Sostituito il calcolo rigido ad aspettativa fissa (0.5) con la vera formula ELO dinamica decimale basata sulla differenza ELO corrente delle due coppie ad ogni singolo turno. Applicato in tutto il backend, nel database Neon (ricalcolati tutti i 316 match esistenti), in `RankingChart.tsx`, in `PlayerProfileModal.tsx` ed in `RankingPage.tsx`.

## v6.0.13 — 2026-07-27
- Fix Grafico ELO ed Andamento in PlayerProfileModal: Passato il prop `selectedSeriesKey` al modale del profilo giocatore (`PlayerProfileModal.tsx`). Ora, quando la classifica è filtrata per torneo e si apre la scheda del giocatore (es. "Alberto Ruotolo"), il grafico del modale mostra la variazione Turno per Turno / Partita per Partita di quel solo torneo (es. `Turno 1`, `Turno 2`...) a partire da 1500, invece di mostrare l'intero storico globale (`E1 ... E18`).

## v6.0.12 — 2026-07-27
- Implementazione Grafico ELO Turno per Turno / Partita per Partita (Filtro Torneo): Ristrutturata la generazione di `chartData` in `RankingChart.tsx`. Quando un torneo è selezionato, l'asse X mostra i vari turni in sequenza (`Start 1500` → `Turno 1` → `Turno 2` ... `Turno N`) tracciando l'evoluzione ELO partita per partita solo di quel torneo.

## v6.0.11 — 2026-07-27
- Fix Calcolo Grafico ELO Singolo Torneo: Riscritta la logica di `chartData` in `RankingChart.tsx`. Quando un torneo è selezionato, la progressione del grafico per ciascun giocatore parte da 1500 (`Start = 1500`) ed accumula esclusivamente i delta del torneo filtrato, eliminando l'interferenza dei tornei passati.

## v6.0.10 — 2026-07-27
- Fix Runtime TypeError in RankingPage: Corretto il riferimento della funzione di sincronizzazione dati in `RankingPage.tsx` sostituendo il nome errato con `fetchData` esposto dallo store.

## v6.0.9 — 2026-07-27
- Fix Grafico ELO Singolo Torneo: Impostata la base di partenza a 1500 (`Start = 1500`) in `RankingChart.tsx` quando viene applicato un filtro torneo, mostrando l'evoluzione specifica del torneo anziché l'accumulato globale.
- Sincronizzazione Real-Time Classifica Globale: Inserita la chiamata automatica `refreshData()` al mount di `RankingPage.tsx` per garantire la presenza immediata di tutti i tornei ed i delta ELO aggiornati dal DB.

## v6.0.8 — 2026-07-27
- Fix Aggiornamento ELO Globale & Classifiche Singolo Torneo: Popolati i record `elo_history` ed aggiornato `current_elo` nel DB Neon per i tornei di test. Aggiunto in `RankingPage.tsx` il calcolo ELO dinamico al volo dai match come fallback se `eloHistory` non ha ancora record salvati per il torneo selezionato.

## v6.0.7 — 2026-07-27
- Fix Risoluzione Giocatori Stampa PDF: Sostituita la gestione rigida in `printTournamentReport` con una risoluzione sicura con fallback, prevenendo l'occultamento delle righe di match nel PDF.
- Popolamento 100% Giocatori Reali: Ricreati i 3 tornei di test (TEST A, TEST B, TEST C) utilizzando esclusivamente i 41 giocatori reali registrati nel DB Neon.

## v6.0.6 — 2026-07-27
- Test Scenari Reali Americano: Generati e salvati nel DB 3 tornei di test strutturati: TEST A (9 coppie / 3 campi / 8 turni -> 6 riposi costanti), TEST B (10 coppie / 4 campi / 10 turni -> 4 riposi costanti) e TEST C (4 coppie / 2 campi / 7 turni -> 0 riposi).

## v6.0.5 — 2026-07-27
- Fix Logica Turnazione & Riposi Americano: Inserito l'attributo `roundNumber` in tutti i match dell'Americano e persistito nel DB Postgres per garantire la perfetta costanza del numero dei riposanti in ogni turno ($N - \text{partite} \times 4$). Creati 2 tornei di verifica nel DB (10 e 12 giocatori).

## v6.0.4 — 2026-07-27
- Fix Pareggi Beat the Box: Corretto il calcolo dei punteggi nel Beat the Box in caso di pareggio (1 pt per giocatore).
- Prevenzione Crash PDF: Introdotta la gestione sicura con fallback in tutte le funzioni di stampa PDF per coppie parziali o giocatori non trovati.
- Anti-Doppio Submit: Bloccata l'invocazione multipla concorrente in fase di completamento torneo per evitare la creazione di partite duplicate.
- Robustezza Confronto Coppie: Allineato l'accoppiamento delle coppie indipendentemente dall'ordine dei giocatori `[P1, P2]` o `[P2, P1]`.
- UI Turni Americano: Aggiunta sfumatura/fade visivo sulla barra dei turni scorrevole in mobile.

## v6.0.3 — 2026-07-27
- UI Redesign "Cosa Vuoi Organizzare Oggi": Riprogettata la schermata iniziale di selezione tipo torneo/giornata con un layout a griglia 2x2 moderna di Card interattive dotate di icone flat e descrizioni sintetiche dedicate.
- Navigazione & Back Button: Aggiunto pulsante di ritorno rapido "← Torna indietro" nella vista di configurazione del sorteggio per rientrare istantaneamente al menu principale.
- Aggiornamento Documentazione Applicativa: Aggiornata la Guida HTML V5.0.3, la Presentazione HTML, i Testi Promo, la guida uso e il README con i riferimenti della versione 6.0.3 e della nuova interfaccia.

## v6.0.2 — 2026-07-27
- Cleanup Repository: Rimossi oltre 30 file temporanei, file `.bak`, `.tmp`, `.part1` e script di debug dal root project. Rimosso `eloService.ts` inutilizzato.
- UI/UX Polish (Americano): Introdotta scrollbar orizzontale responsive per il selettore del numero di turni (per tornei con 9+ coppie) per un rendering fluido su dispositivi mobile.
- Formato Selezionato Badge: Aggiunto badge visivo sintetico "Formato Selezionato" nelle schermate di setup preliminare del torneo.
- Documentazione ELO: Allineata tutta la documentazione di sistema per confermare l'adozione del K-Factor fisso e costante K=16 per tutti i tornei.

## v6.0.1 — 2026-07-26
- Major Release: Migrazione completa repository su EloManager6.
- Algorithm Overhaul: Algoritmo di turnazione torneo Americano completamente riprogettato con vincolo matematico stringente sui partner (nessuna ripetizione di compagno finché non si è giocato con tutti gli altri giocatori) e bilanciamento perfetto dei riposi.
- UI/UX & PDF: Formattazione verticale e pulita dei riposi ("Riposo:" con elenco giocatori a capo) in schermate e report PDF.
- Modal di Conferma: Garantito il popup di conferma salvataggio ("Calendario Salvato!") su tutti i tipi di tornei e flussi di salvataggio parziale.
- Salvataggio Incrementale: Preservati i punteggi delle partite inserite anche durante il salvataggio parziale del calendario o inserimenti a tappe.

## v5.0.9
- Fix: Nelle classifiche (Storico ELO), le etichette delle giornate mostrano ora correttamente il tipo di giornata (es. "Beat the Box", "Americano", "Round Robin + Finali") invece del nome del torneo padre (es. "TorneOtto Inverno 2025").
- Fix: Risolto bug critico su voci elo_history "orfane" (event_id non corrisponde a nessun torneo nel DB) tramite ricerca per data per recuperare il tipo di giornata corretto.
- Fix: Aggiornato il backfill del campo day_label nel DB: ora usa il campo type (nome giornata) invece del name (nome torneo padre).
- Fix: Rimosso visualizzazione del nome torneo padre concatenato all'etichetta ("TorneOtto Inverno 2025 · Beat the Box") — ora si vede solo il nome giornata.
- Fix: Aggiunto parentTournamentName e dayLabel all'interfaccia TypeScript Tournament.

## v5.0.8
- Fix: Nelle classifiche filtrate per torneo, le variazioni ELO erano assenti per i tornei singoli a causa di un'errata associazione degli ID partita; ora viene mostrata la variazione corretta e viene raggruppata l'intera giornata.
- Fix: Risolto un bug critico che bloccava la stampa PDF delle classifiche.
- UI: Sostituito il nome del torneo radice (es. "TorneOtto Inverno 2025") con il nome della specifica giornata (es. "Beat the Box", "Americano", ecc.) nello storico variazioni UI e PDF.

## v5.0.7

## v5.0.6
- Risolto crash in /api/tournaments/complete
- Gestito il rendering degli accoppiamenti null in MatchesList
- Aggiornati i loghi Header per Dark e Light Mode
- Classifiche: raggruppamento delle vecchie partite singole e fix nomenclatura tornei a squadre

## v5.0.5
- Statistiche: Risolto bug fatale ("Attempted to assign to readonly property") nel calcolo delle serie di vittorie consecutive.
- Statistiche: Aggiunte le statistiche avanzate (Upsets, Maggior Guadagno/Perdita Elo, Forma, Clutch Performance, Difesa Ferrea, MVP) anche per i Tornei a Squadre.
- UI: Completato il refactoring visivo della pagina Statistiche nei tornei a squadre, impiegando i nuovi componenti standardizzati `StatCard`.
- Beat the Box: Implementata l'opzione "Solo Finali" o "Semifinali + Finali" per i tornei a 6 e 8 coppie.
- Beat the Box: Aggiunta logica di accoppiamento meritocratico per le semifinali, evitando l'incrocio tra squadre dello stesso girone.
- Beat the Box: Risolto un bug nella partita di consolazione per 3 box, garantendo matematicamente che i giocatori dello stesso girone non giochino mai insieme.
- PDF: Corretto l'ordinamento delle partite della fase finale e aggiunto il raggruppamento esplicito delle "SEMIFINALI".

## v5.0.3
- Apple HIG UI Polish: migliorati i margini dei fogli modali (HIGSheet) e la gestione del wrapping testuale nei pulsanti nativi (HIGButton) per un'estetica premium su dispositivi mobile.

## v5.0.2
- Mostrati i punteggi per singolo set anziché il totale games in Dashboard e Profilo Giocatore
- Aggiunta validazione (minimo 2 lettere per nome e cognome) in creazione e modifica giocatore
- Rimossi giocatori senza nome dal database di produzione
- Fixati dettagli minori nella visualizzazione dei tabelloni

## v5.0.3
- Mostrati i punteggi per singolo set anziché il totale games in Dashboard e Profilo Giocatore
- Aggiunta validazione (minimo 2 lettere per nome e cognome) in creazione e modifica giocatore
- Rimossi giocatori senza nome dal database di produzione
- Fixati dettagli minori nella visualizzazione dei tabelloni

## v5.0.1 — 2026-07-09
### Modifiche
- Fix: rimosso l'orario 00:00:00 dalla data dell'ultima giornata nella dashboard.
- Feature: implementata la stampa dei profili singoli/selezionati (stampa a scelta).
- Modifica: il grafico ELO in UI e PDF ora raggruppa le variazioni per giornata (stessa data = singola variazione aggregata).

# Changelog

## v4.1.11 — 2026-06-27
### Modifiche Algoritmo ELO & UI
- Risolto errore matematico di arrotondamento `Math.round()` che azzerava i decimali nel calcolo dei delta ELO, ripristinando la precisione decimale fluttuante cronologica partita per partita.
- Aggiornata l'etichetta "Avg ELO" in Dashboard a "MEDIA ELO" calcolando in modo dinamico la sola media della Top 50% dei giocatori.
- Corretta la UI in "Sorteggi" da "ELO Medio" a "ELO" per maggiore aderenza terminologica (essendo in realtà la stima combinata della coppia).
- Sistemati i colori di testo in contrasto (testo invisibile) sui box di avviso informativi (`bg-ios-blue`).
## v4.1.10 — 2026-06-26
### Modifiche UI/UX & Fix
- Logo Header Mobile: ricentrato in posizione assoluta e ridotto in altezza (-10%) per dare respiro alla UI senza rompere gli allineamenti.
- Header Mobile (Pulsanti destro): le icone `Giorno/Notte` ed `Esci` sono ora impilate in verticale per risparmiare spazio orizzontale. Pulsante tema leggermente scalato (-25%).
- Aggiunto alert di conferma ("Sei sicuro di voler uscire?") al tocco dell'icona `Esci` per evitare logout accidentali (fat finger).

## v4.1.9 — 2026-06-26
### Modifiche UI/UX (Mobile/PWA)
- Header: spostato il logo centrale leggermente a sinistra per distanziarlo dal toggle tema su schermi stretti.
- Sorteggi: rimossi i padding ridondanti (`px-4`) che causavano uno schiacciamento anomalo dei contenuti all'interno delle card su mobile.
- Giocatori: riorganizzato il layout della lista spostando le icone di azione (info, modifica, elimina) in una riga separata sotto il nome e ruolo, risolvendo il troncamento del nome.
- Admin: rinominato il tab "Codici Accesso" in "Accessi" per evitare wrapping fastidiosi che rompevano il controllo segmentato.

## v4.1.8 — 2026-06-26
### Modifiche UI/UX
- Sostituito il titolo di testo nell'intestazione e nello Splash Screen con i nuovi loghi ufficiali (\`elomanager.png\` ed \`elomanager_w.png\`).
- Implementato lo switch automatico dell'immagine in base al tema di sistema (chiaro/scuro).
- Ribilanciate le proporzioni dell'intestazione superiore: altezza aumentata a 80px e dimensioni del logo adattate (~20% più grandi) per una leggibilità ottimale sia su Desktop che Mobile.
- Aggiornate icone favicon e PWA.
- Risolti problemi di layout (sbordamento) nella stampa PDF delle partite a 3 set.

## v4.1.7 — 2026-06-26
### Operazioni di Rilascio / Infrastruttura
- Verificata la piena compatibilità dei file di deploy (`vercel.json`, `package.json`, `vite.config.ts`) con l'infrastruttura di Vercel, prendendo come riferimento il branch del precedente repository `PadelManager2`. 
- Il repository è formalmente pronto per lo switch di produzione su Vercel: non è stata necessaria alcuna modifica ai parametri in quanto già conformi.

## v4.1.6 — 2026-06-25
### Modifiche e Fix (HIG)
- Completata traduzione in italiano di tutti i popup e dei messaggi di sistema residui (es. risultati, alert di salvataggio torneo, ecc.).
- Risolto un difetto grafico sui popup `HIGSheet` in modalità mobile, aggiungendo padding interno (`px-4`) per evitare che testi e pulsanti toccassero i bordi dello schermo.
- Ingrandito font dell'intestazione principale (Padel Elo Manager) di +4 step (a 20px) per una migliore leggibilità.
- Eseguita profonda pulizia del repository rimuovendo oltre 45 script monouso temporanei.

Questo file consolida gli storici precedentemente salvati come `UPDATE_SUMMARY_*.md`.

## v4.1.5 — 2026-06-19

- Deploy: Configurato deploy su Vercel e risolte incompatibilità Serverless (incluso pass a `bcryptjs`).
- Admin: Evidenziato l'accesso di utenti non-admin nell'Audit Log con pill rossa.
- UI Layout: Allineato il nome del workspace sotto versione e data nell'header desktop.
- Riferimenti versione aggiornati a `4.1.5` e data a `Giu 2026`.

## v4.1.4 — 2026-05-01

- Admin: tab `Invia dati` + API per copiare un torneo tra workspace (dati indipendenti).
- UI Stitch: classe `.stitch-row` riutilizzabile applicata a righe interne (Top 5) e alle card giornate in `Tornei`.
- Statistiche: pill `Dati parziali` con contrasto corretto anche in dark.

## v4.1.3 — 2026-05-01

- Admin: cancellazione workspace con conferma e guardrail (non attuale, non ultimo).
- Access codes: scadenza rapida (`Nessuna / 8h / 24h / 48h / 7 giorni`), login bloccato per scaduti, stato UI `Attivo / Scaduto / Disattivato`.
- Mobile/PWA: form `Genera Nuovo Codice` riposizionato.
- PWA/assets: `public/icon.svg` riallineata al PNG.

## v4.1.2 — 2026-05-01

- Matchday torneo a squadre mobile/PWA: footer azioni stabilizzato durante il salvataggio.
- Sidebar desktop light: contrasto corretto e selezione attiva piu' evidente.
- PWA: icone/manifest riallineati agli asset PNG reali.
- Mese riferimento aggiornato a `Mag 2026`.

## v4.1.1 — 2026-04-30

- Header: metadata alleggeriti e icone leggermente piu' scure.
- Dashboard: KPI principali riallineati al colore del titolo.

## v4.1.0 — 2026-04-30

- Versioning: nuova routine patch-first (4.1.0 -> 4.1.1 -> ...).
- Reskin UI consolidato (Stitch) senza cambiare logica applicativa.
- Light mode: contrasto corretto nelle aree reskinnate.
- PWA: refresh piu' aggressivo e asset coerenti.

## v4.0.12 — 2026-04-30

- Presentazione HTML: link reale allo sviluppatore (mailto) + versione aggiornata.

## v4.0.11 — 2026-04-30

- Tornei a squadre (eliminazione diretta): fix fixture con BYE e propagazione turni.
- Admin: endpoint reset bracket eliminazione diretta.
- PDF: stampa esplicita `BYE` al posto di placeholder.
- UX mobile: back/chiusura risultati rientrano su `Tornei`.
- Header: titolo mobile-first (una riga su iPhone/PWA).

## v4.0.10 — 2026-04-28

- iOS PWA safe-area: spostato padding bottom nel main scroll container (senza cambiare sizing interno).

## v4.0.9 — 2026-04-27

- Mobile/PWA: fix overflow data su form tornei linkati e team/playoff.
- Team tournament: action bar mobile migliorata; `Modifica Risultati` instradato alla matchday page dedicata.
- Header mobile: sticky piu' sicuro (safe area) e scroll isolation migliore.
- Sidebar mobile: layering corretto (drawer sopra header).
