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
