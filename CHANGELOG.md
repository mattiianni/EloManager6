## v6.7.16 — 2026-08-05

### Fix definitivo altezza viewport con -webkit-fill-available per iOS PWA

- **Risoluzione viewport standalone su iOS**: Applicata la proprietà proprietaria `-webkit-fill-available` all'altezza di `html`, `body` e `#root` in `index.css`. Questo costringe WebKit ad estendere la viewport reale dell'applicazione fino al bordo fisico del display, eliminando la banda bianca di sistema in basso nella PWA standalone.
- **Aggiornamento layout SplashScreen e AuthGate**: Sostituita la classe Tailwind `min-h-screen` (basata su `100vh` buggato su iOS) con `h-full` per la schermata di login e di caricamento iniziale, allineandole rigidamente al 100% dell'altezza del display reale.

---

## v6.7.15 — 2026-08-05

### Risoluzione banda bianca in basso e scurimento icone footer

- **Risoluzione definitiva banda bianca su iOS PWA**: Modificata l'altezza di `html`, `body` e `#root` in `index.css` per utilizzare rigidamente `height: 100%` al posto di `100vh` / `100svh` / `100dvh`. Questo evita i calcoli errati del browser Safari in modalità standalone (che sottraeva l'altezza delle barre di navigazione non esistenti) forzando la PWA a riempire l'intero schermo fisico ed eliminando la banda bianca inferiore.
- **Icone e testi del footer più scuri**: Cambiato il colore per le icone e le scritte non attive nel footer mobile da `var(--ios-tertiaryLabel)` (grigio molto chiaro) a `var(--ios-secondaryLabel)` (grigio più scuro e nitido), migliorando notevolmente il contrasto e la leggibilità.

---

## v6.7.14 — 2026-08-05

### Rimozione effetti traslucidi (vetro sfocato) dalla tab bar mobile

- **Sfondo solido opaco al 100%**: Rimosso completamente il `backdrop-filter: blur(...)` e l'opacità dal `<nav>` mobile. Impostato uno sfondo solido tramite `var(--ios-secondarySystemGroupedBackground)` (bianco assoluto `#FFFFFF` in modalità chiara e grigio scuro `#1C1C1E` in modalità scura). Questo elimina alla radice qualsiasi glitch di rendering cromatico (effetto 3 colori) causato dal motore WebKit (Safari).

---

## v6.7.13 — 2026-08-05

### Risanamento e unificazione layout footer iOS

- **Risoluzione glitch cromati (3 colori)**: Rimosso lo spacer `div` figlio per la safe-area. Spostata la gestione del padding bottom (`env(safe-area-inset-bottom)`) e dell'altezza complessiva direttamente sul tag genitore `<nav>`. In questo modo la sfocatura `backdrop-filter` e il background coprono l'intera area come un blocco unico e omogeneo.
- **Predeterminazione altezza**: Impostata l'altezza del `<nav>` mobile in modo nativo su `calc(49px + env(safe-area-inset-bottom, 0px))`, assicurando dimensioni compatte e stabili sotto ogni viewport iOS.

---

## v6.7.12 — 2026-08-05

### Fix definitivo manifest PWA e safe area spacer iOS

- **Colore Manifest PWA**: Corretti `theme_color` e `background_color` in `vite.config.ts` impostandoli a `#0b1326` (colore scuro coerente con la UI) rimuovendo il vecchio `#0f4c75` (blu celestino).
- **Rimozione Manifest Duplicato**: Eliminata la riga `<link rel="manifest" href="/manifest.json" />` in `index.html` che creava un conflitto tra il manifest statico non esistente e quello generato dinamicamente da `vite-plugin-pwa` (`manifest.webmanifest`).
- **Sfondo Esplicito Safe Area Spacer**: Applicato `background: 'var(--ios-thickMaterial)'` allo spacer in `App.tsx` per prevenire glitch di ereditarietà o rendering di `backdrop-filter` in WebKit su iOS.

---

## v6.7.11 — 2026-08-05

### Fix definitivo footer PWA iOS (safe-area-inset-bottom)

- Rimosso `paddingBottom: env(safe-area-inset-bottom)` dal `<nav>` stesso (causava l'ingrandimento visivo della barra).
- Introdotto un `<div>` spacer separato, completamente trasparente, posto sotto i tab buttons: si occupa esclusivamente di riservare lo spazio per l'Home Indicator iOS senza far crescere la barra visiva.
- Tab bar fissa a `49px` di altezza utile in ogni condizione (standard nativo iOS).
- Rimossi `paddingTop/paddingBottom` dai singoli pulsanti che interferivano con l'altezza effettiva.
- La barra ora è sempre compatta e stabile — non cresce né fluttua dopo lo scroll.

---

## v6.7.10 — 2026-08-05

### Ottimizzazione e riduzione altezza footer mobile

- Ridotta l'altezza utile dei bottoni della Tab Bar mobile da `52px` a `49px` (standard nativo iOS) rendendola molto più compatta.
- Ridimensionati i testi dei tab a `10px` con spaziatura e box model più compatti per evitare distorsioni e sfruttare meglio l'area visibile sul display del dispositivo.

## v6.7.9 — 2026-08-05

### Stabilizzazione Footer PWA (iOS Nav Bar)

- Riconfigurata la barra di navigazione inferiore per mobile (`<nav>`): isolata l'altezza attiva dei tab a `52px` separandola dalla gestione dinamica di `env(safe-area-inset-bottom)`.
- Eliminati sobbalzi visivi, ridimensionamenti anomali e necessitá di trascinare il footer all'apertura della PWA su iOS.
- Applicata la direttiva `overscroll-behavior-y: none` per prevenire il rimbalzo della viewport WebKit durante lo scorrimento.
- Implementata la pulizia automatica delle cache del Service Worker al cambio di versione `APP_VERSION` per garantire l'aggiornamento immediato PWA.

## v6.7.8 — 2026-08-01

### Gironi e fasi conclusive

- Aggiunta per `Gironi + Fase Finale`, con almeno 8 coppie, la scelta tra `Semifinali e Finali` e `Quarti, Semifinali e Finali`.
- Implementata la qualificazione per 2, 3 e 4 gironi, comprese le migliori terze normalizzate quando le dimensioni dei gironi differiscono.
- Persistiti `groupNumber`, `phase` e tipo di playoff; eliminata la deduzione delle ultime quattro partite come fase finale.
- Corretto il flusso di modifica: una variazione dei gironi può rigenerare le fasi successive senza confondere o cancellare partite ordinarie.
- Il salvataggio rapido di una partita non completa più prematuramente Beat the Box, Round Robin + Finali o Gironi + Fase Finale.

### PDF e statistiche

- I PDF separano prima il girone, poi turni e partite, mantenendo risultati parziali e campi coerenti.
- Le fasi successive mostrano nomi reali soltanto quando la fase precedente è completa; risultati vuoti non vengono stampati come `0-0`.
- Le classifiche dei gironi compaiono appena il singolo girone è concluso, anche con torneo ancora `scheduled`.
- Ridisegnata la classifica giocatori PDF con riepilogo compatto e storico giornate a larghezza piena; migliorati grafici ELO e stampa profilo.
- Consolidato l'andamento ELO per giornata nei profili e corretta l'associazione delle variazioni agli eventi.

### Interfaccia e qualità

- Migliorati layout mobile, safe area, pulsanti di salvataggio/avanzamento, descrizioni formati e controlli per 9+ coppie.
- Uniformati i pulsanti Indietro, le azioni verdi di salvataggio e le azioni blu di avanzamento/chiusura.
- Build di produzione completata e suite automatica ampliata a 51 test.

## v6.7.7 — 2026-07-31

### Dialoghi Apple HIG

- Eliminate tutte le 95 chiamate residue a `alert()` e `confirm()` nativi del browser.
- Aggiunto un gestore centralizzato che accoda avvisi e conferme senza bloccare l’interfaccia.
- Le azioni distruttive usano conferme asincrone con etichette esplicite e stile coerente; i messaggi di validazione, salvataggio e stampa condividono ora lo stesso componente.
- `HIGAlert` viene renderizzato tramite portal sopra sheet e modal, usa identificatori ARIA univoci, mantiene il focus nel dialogo, ripristina il focus precedente e rende inerte il contenuto sottostante.
- Uniformati in italiano gli ultimi messaggi Round Robin ancora presenti in inglese.

### Qualità

- Verificata l’assenza di richiami nativi ad alert e conferme nell’intero sorgente.
- Suite automatica: 33 test superati; build di produzione completata correttamente.
- Verificato che il frontend locale serva il nuovo gestore HIG e che il proxy API risponda correttamente all’autenticazione.
- Il collaudo visuale completo su Safari/iOS e alle viewport 390, 768 e 1440 px resta una verifica manuale successiva al rilascio.

## v6.7.6 — 2026-07-31

### Integrità risultati ed ELO

- Creazione torneo, partite, storico ELO e aggiornamento giocatori sono ora atomici; retry e doppi invii usano una chiave idempotente e non generano duplicati.
- Anche il completamento valida tutte le partite prima di modificare stato ed ELO e sostituisce lo storico precedente in una singola transazione.
- `0-0` significa risultato non inserito. I pareggi sono ammessi nelle partite ordinarie e vietati in Eliminazione Diretta, semifinali, finali, finaline e consolazioni.
- Una parità vietata non qualifica più automaticamente il secondo partecipante e non produce classifica, avanzamento o variazioni ELO.
- Gli eventi ELO orfani non vengono più attribuiti a un torneo casuale soltanto perché disputato nella stessa data.

### Fasi, Round Robin e tornei a squadre

- Aggiunti metadati persistiti per fase, turno e tipo playoff Round Robin; UI, backend e stampa possono distinguere gironi, semifinali e finali senza usare la posizione nell'array.
- Il percorso Round Robin con semifinali genera prima due semifinali validate e poi finale 1°/2° e finale 3°/4°.
- Le partite incomplete dei tornei a squadre aprono l'editor della giornata; roster mancanti non provocano più il crash `team1.map`.
- Nelle giornate ordinarie a squadre il pareggio è valido e viene calcolato correttamente come esito ELO 0,5.

### PDF, Apple HIG e accessibilità

- I documenti di stampa incorporano realmente Manrope, attendono il font e gestiscono contenuti multipagina senza bloccare intere sezioni.
- Risultati vuoti sono mostrati come `Da definire`, mai come `0-0`; rimossi footer pagina hardcoded e aggiunto escaping dei testi utente nei template consolidati.
- Pulsanti HIG, switch, modal e bottom sheet ora propagano ARIA, gestiscono focus/Escape e rispettano target minimi da 44 pt.
- Navigazione con stato corrente accessibile, focus visibile, Manrope nei componenti condivisi e supporto `prefers-reduced-motion`.
- Il pulsante flottante Sorteggia viene nascosto quando è aperto il menu laterale.

### Qualità

- Suite ampliata a 33 test, includendo matrice pareggi, `0-0`, associazione ELO e struttura dei documenti PDF.
- Build di produzione e controllo sintattico backend verificati.

## v6.7.5 — 2026-07-31

### Stabilizzazione flussi torneo e risultati

- Uniformato il flusso di creazione: formato, giocatori, sorteggio, opzioni, nome/data/circolo, anteprima e salvataggio. Rimossi i nomi automatici e corretti i loop di Round Robin + Finali e Gironi + Fase Finale.
- Eliminazione Diretta/TPRA ora richiede i dati reali del torneo e aggiorna una partita esistente senza crearne duplicati.
- Protette le partite non ancora definite dei tornei a squadre: niente crash su roster mancanti e apertura dell'editor della giornata con i giocatori delle squadre coinvolte.

### Turni, interfaccia e accessibilità

- Introdotto un normalizzatore condiviso per ordinare turni/giornate, partite, campi e riposi in UI e PDF, senza dipendere dall'ordine del database.
- TorneOtto, Americano e Round Robin mostrano turni coerenti; il campo riparte da Campo 1 a ogni turno.
- Manrope consolidato come font testuale; target HIG portati ad almeno 44 pt e alert migliorati con semantica e gestione del focus.
- Semplificate le card annidate in Tornei e Modifica Risultati, rimossi hover invasivi e migliorati bottom sheet e pulsante flottante Sorteggia su mobile.

### PDF e statistiche ELO

- Standardizzate le fasi finali vuote sul modello Beat the Box, comprese semifinali e finali di Round Robin e Gironi.
- Corretto il layout multipagina: sezioni lunghe divisibili, intestazioni unite alla prima riga, nomi lunghi a capo e rimozione del numero pagina hardcoded.
- La stampa attende il caricamento dei font prima di aprire la finestra di stampa.
- Corrette le variazioni ELO nel PDF del singolo giocatore, includendo sia record collegati al torneo sia record collegati alle singole partite dopo un ricalcolo generale.

### Qualità

- Aggiunti test unitari per normalizzazione turni, identità delle partite ed eventi ELO; suite corrente: 13 test.
- Aggiunta `QA_CHECKLIST.md` con matrice manuale UI/PDF per tutti i formati e viewport principali.

## v6.4.9 — 2026-07-28
- Verifica Distinzione Flussi Torneo Singolo vs Multi Giornata:
  - **Torneo Singolo**: Richiede ed assegna esclusivamente il Nome del Torneo Singolo senza proporre l'opzione di aggancio ad altri tornei.
  - **Multi Giornata**: Mostra l'opzione **[ Nuovo | Esistente ]** per consentire sia la creazione di una nuova serie sia il collegamento della giornata ad un torneo già esistente nell'elenco dei campionati.

## v6.4.8 — 2026-07-28
- Verifica ed Allineamento Flussi tra Multi Giornata e Torneo Singolo:
  - Corretto il routing del formato selezionato in `handleFormatSelection` (`TournamentFlow.tsx`): sia che il torneo venga avviato da **Torneo Singolo** sia da **Multi Giornata**, ciascun formato (*Round Robin + Finali*, *Americano*, *Gironi + Fase Finale*, *Eliminazione Diretta TPRA*, *Torneo Libero*, *Beat the Box*) viene guidato al 100% alla rispettiva schermata di setup e configurazione (scelta campi, andata/ritorno, playoff, ecc.).

## v6.4.7 — 2026-07-28
- Auto Cache Invalidation & Instant Service Worker Refresh:
  - Inserita la pulizia automatica `caches.delete()` in `App.tsx` che invalida la vecchia cache PWA salvata sul dispositivo dell'utente all'apertura, forzando l'aggiornamento immediato al nuovo pacchetto `v6.4.7`.

## v6.4.6 — 2026-07-28
- Rimozione del vecchio Alert di Blocco ("Torneo in preparazione"):
  - Rimosso il vecchio controllo obsoleto in `TournamentFlow.tsx` che mostrava l'avviso `"Torneo in preparazione!"` quando l'utente selezionava formati come *Beat the Box*, *Gironi + Fase Finale* o *Eliminazione Diretta*. Tutti i formati dell'applicazione sono ora sbloccati al 100%.

## v6.4.5 — 2026-07-28
- Fix Completo Setup e Visualizzazione Round Robin + Finali:
  - **Attivazione Step Setup Round Robin**: Collegato lo step `round-robin-info` in `TournamentFlow.tsx` che permette all'utente di scegliere il numero di campi (1-6), la spunta per Andata e Ritorno e la scelta della Fase Conclusiva ("Solo Girone", "Solo Finale", "Semifinali + Finali").
  - **Generazione Parametrizzata**: `generateRoundRobinMatches` viene ora invocata passando i campi selezionati ed il flag andata/ritorno, assegnando correttamente i numeri di giornata e di campo a ciascuna partita.
  - **Visualizzazione UI per Giornate e Riposi**: Raggruppate le partite di Round Robin per `Giornata 1`, `Giornata 2`..., mostrando visivamente il campo di ciascuna partita ed in evidenza il badge delle **Coppie a Riposo** in ciascuna giornata.
  - **Stampa PDF con Giornate, Campi e Riposi**: Aggiornato `printService.ts` affinché il report PDF del Round Robin formatti le intestazioni delle Giornate (`1ª Giornata di Andata`, `1ª Giornata di Ritorno`...), il numero del Campo per ciascun match e le **Coppie a Riposo**.

## v6.4.4 — 2026-07-28
- PWA Auto-Update & Immediate Cache Busting:
  - Inserito in `index.html` ed in `vite.config.ts` il meccanismo di aggiornamento forzato del Service Worker PWA per invalidare istantaneamente le vecchie risorse memorizzate nella cache dei dispositivi mobili e browser desktop alla consegna della nuova versione.

## v6.4.3 — 2026-07-28
- Suite di Test Automatizzata del Ciclo di Vita Completo dei Tornei (`scripts/test_full_tournament_lifecycle.cjs`):
  - Creato ed eseguito lo script di verifica automatizzata per **TUTTE le 6 tipologie di torneo** (Americano, Beat the Box, Gironi + Fase Finale, Round Robin + Finali, Eliminazione Diretta, Torneo Libero).
  - Verificato con successo al 100% che l'inserimento dei risultati, il salvataggio a DB, l'uscita ed il successivo ripristino ("In Corso - Inserisci Risultati") mantengono inalterati tutti i punteggi salvati e riaprono direttamente la fase successiva/finali senza mai regredire ai box o ai gironi.

## v6.4.2 — 2026-07-28
- Fix Riapertura & Resume Tornei Beat the Box:
  - Risolto il bug per cui `handleOpenTournament` controllava lo stato di tutte le partite in DB (inclusi i segnaposto delle semifinali/finali non ancora giocate) anziché le sole partite dei BOX, causando il falso ritorno alla schermata dei box.
  - Corretto l'algoritmo `groupMatchesByPlayerSets` in `beatTheBoxService.ts` isolando chirurgicamente le 3 partite dei box da qualsiasi partita di fase finale o semifinale.
  - Inserita la chiamata `await fetchData()` in `savePhaseMatches` per sincronizzare istantaneamente le partite di semifinale/finale appena salvate nel DB con lo store locale del frontend.

## v6.4.1 — 2026-07-28
- Resume Torneo & Auto-Scroll alla Prima Partita da Inserire:
  - Il pulsante "In corso - Inserisci Risultati" per i tornei multi-fase (`Gironi + Fase Finale`, `Round Robin + Finali`, `Beat the Box`) riapre direttamente l'ultima fase in corso o la prima partita non completata.
  - Aggiunto l'auto-scroll automatico con evidenziazione visiva temporanea sulla prima partita da compilare.
- Standardizzazione Etichette Tasti nei Flussi Tornei:
  - Mantenuto sempre il tasto **"Indietro"** / **"Annulla"** per poter tornare alle schermate o modali precedenti.
  - Sostituite tutte le diciture fuorvianti dei tasti di avanzamento con il termine univoco e chiaro **"Procedi"**.
  - Riservata la denominazione conclusiva **"Completa Torneo"** esclusivamente all'ultima azione finale della Finale del torneo.

## v6.4.0 — 2026-07-28
- Redesign PDF Report Torneo TPRA (Eliminazione Diretta Singolo): Creato il report PDF dedicato `printTpraTournamentReport` in `services/printService.ts`.
  - Inserito il **Tabellone ad Albero Orizzontale (A4 Landscape)** con le colonne dei turni (`Ottavi di Finale`, `Quarti di Finale`, `Semifinali`, `FINALE 🏆`) e badge dei punteggi/set disputati.
  - **Rimosso del tutto la tabella classifica a punti** (inutile per un torneo ad eliminazione diretta).
  - Inserita la sezione **Albo d'Oro e Statistiche Finali**: Box in evidenza per **🏆 VINCITORI (1° Posto)**, **🥈 FINALISTI (2° Posto)**, **🥉 SEMIFINALISTI**, partite disputate e games totali.

## v6.3.3 — 2026-07-28
- Rimosso Bottone "In Corso" nei Tornei TPRA: Trovata e rimossa la dicitura/pulsante "In Corso" nei tornei ad Eliminazione Diretta (TPRA) in `TournamentsPage.tsx`. L'inserimento ed la modifica dei risultati nei tornei TPRA avviene ora esclusivamente tramite clic diretto sulle singole card delle partite del tabellone.

## v6.3.2 — 2026-07-28
- Fix Beat the Box Semifinals & Finals Resume: Risolto l'azzeramento dei punteggi a `0-0` quando si riapriva un torneo Beat the Box nelle semifinali o finali. Popolati correttamente gli stati `beatBoxSemifinalMatches` e `beatBoxFinalMatches` in `pages/MatchesPage.tsx` con i risultati precedentemente salvati a database Neon.

## v6.3.1 — 2026-07-28
- Fix TPRA TypeError & Score Input: Risolto il `TypeError: t is not a function` in `TpraBracketView.tsx` correggendo la prop `onSetsChange` in `MatchScoreInput.tsx` e proteggendo i callback con optional chaining.
- TPRA Bracket Flow & Turn Progression: Corretta la condizione di completamento torneo in `TpraBracketView.tsx`. Il torneo TPRA non viene più contrassegnato come completato ai Quarti o alle Semifinali, ma **soltanto dopo che la Finale è stata disputata ed ha un vincitore**.
- Tabellone TPRA & UI Guidance: Aggiunti i titoli espliciti sopra ciascuna colonna del tabellone (`Quarti di Finale`, `Semifinali`, `FINALE 🏆`), badge visivo di avanzamento turno, e pulsante `"In Corso - Tabellone TPRA"` in `TournamentsPage.tsx`. Ripristinato il torneo `TEST TPRA` a stato in corso (`scheduled`).

## v6.3.0 — 2026-07-28
- Round Robin + Finali Enhancement: Introduzione della selezione personalizzata dei campi disponibili ($1, 2, 3, \dots$), dell'opzione **Andata e Ritorno** (con diciture `1ª Giornata di Andata` $\dots$ `1ª Giornata di Ritorno`), e della scelta flessibile della fase conclusiva a 3 opzioni (*Solo Girone*, *Solo Finale*, *Semifinali + Finali*).
- Rotazione Equa Riposi: Implementato l'algoritmo di **Berger Table (Circle Method)** per garantire la rotazione equa al 100% dei riposi e delle partite tra le coppie.
- Distinzione Giornate UI & PDF: Visualizzazione distinta delle giornate e del box evidenziato delle coppie/giocatori a riposo in `TournamentsPage`, `MatchesPage` e nei report PDF di stampa.

## v6.2.1 — 2026-07-28
- Ranking Tournament Filter Refinement: Aggiornata la lista dei tornei filtrabili nella pagina Classifica (`pages/RankingPage.tsx`). Mostrati **esclusivamente** i tornei che hanno almeno un risultato o una variazione ELO già registrata.

## v6.2.0 — 2026-07-28
- Fix Ranking Fallback Error: Risolto il `ReferenceError: Can't find variable: targetTournamentMatches` alla riga 203 di `pages/RankingPage.tsx`. Corretto l'ordinamento in `playerMatches` per il calcolo in tempo reale dell'ELO nei tornei in corso o senza risultati conclusi.

## v6.1.9 — 2026-07-28
- Absolute Workspace ELO Isolation: Eliminata la contaminazione cross-workspace delle entry ELO per Alessandro Bertelli. Ricalcolata la sua cronologia nel workspace Padel Academy facendolo partire rigorosamente da **1500 ELO** (ELO attuale corretto a **1514.01**). Corretto il reset in `server.js` per garantire l'isolamento totale al 100% degli ELO tra workspace distinti.

## v6.1.8 — 2026-07-28
- Ranking Filter Fix: Corretto il filtro per torneo nella pagina Classifica (`pages/RankingPage.tsx`). Risolto il riconoscimento dei Tornei a Squadre radice anche quando `teamTournamentRootId === id`, consentendo di filtrare correttamente la classifica per il torneo attivo **6 FLAGS** e per i tornei a squadre in corso.

## v6.1.7 — 2026-07-28
- Codebase Hardening & Callback Safety: Applicato l'optional chaining `?.` su tutte le invocazioni dei callback di navigazione in `TournamentsPage.tsx`, `DashboardPage.tsx` e `MatchesPage.tsx` per prevenire `TypeError` da funzioni opzionali o mancanti. Verificata la compilazione e la stabilità con build di produzione Vite superata con successo.

## v6.1.6 — 2026-07-27
- Hotfix Runtime Errors: Corretta l'ulteriore chiamata a `toggleMatchday` rimasta alla riga 1634 di `pages/TournamentsPage.tsx` sostituendola con `toggleExpandedMatchday`. Aggiunto l'optional chaining `?.` su tutti i callback di navigazione di `TournamentsPage` prevenendo crash a runtime.

## v6.1.5 — 2026-07-27
- Test Completo Multi-Formato & Salvataggio Intermedio: Eseguito e verificato con successo un ciclo di test automatizzati end-to-end creando 2 tornei per ciascuna delle 6 tipologie (Americano, Eliminazione Diretta TPRA, Torneo Libero, Gironi + Fase Finale, Round Robin + Finali, Beat The Box) per un totale di 12 tornei sul database Neon. Testati e confermati i salvataggi intermedi dei punteggi, la persistenza e la stabilità senza alcun errore.

## v6.1.4 — 2026-07-27
- Hotfix Runtime Errors: Risolto il `ReferenceError: toggleMatchday` in `TournamentsPage.tsx` sostituendolo con la funzione reale `toggleExpandedMatchday`. Applicato l'optional chaining sui callback di navigazione evitando il `TypeError: t is not a function`. Corretto il `ReferenceError: gironiScores` in `TournamentFlow.tsx` nella gestione del salvataggio dei gironi.

## v6.1.3 — 2026-07-27
- Fix Modal e Bottone Inserimento Risultati TPRA: Abilitato il pulsante `In Corso - Inserisci Risultati` in `TournamentsPage.tsx` per i tornei TPRA / Eliminazione Diretta (precedentemente escluso). Rimosso il blocco in `TpraBracketView.tsx` che impediva l'apertura del modal sui nodi con vincitore o match giocati, aggiungendo l'indicatore visivo `⚡ Inserisci Risultato` / `✏️ Modifica Risultato` su ciascun card del tabellone.

## v6.1.2 — 2026-07-27
- Implementazione Seeding ATP Ufficiale: Riscritto l'algoritmo di posizionamento delle teste di serie `generateSeedOrder` in `tpraService.ts`. Le teste di serie n.1 e n.2 vengono disposte ai lati opposti del tabellone (in cima alla metà superiore e in fondo alla metà inferiore) in modo che possano scontrarsi esclusivamente in FINALE.
- Fix Salvataggio Tornei Singoli: Risolti i potenziali problemi di blocco o dati mancanti durante il salvataggio dei tornei ad eliminazione diretta, gironi e tornei liberi in `TpraCreationFlow.tsx` e `TournamentFlow.tsx` mediante la validazione rigorosa dei fallback di data ISO e nome torneo.

## v6.1.1 — 2026-07-27
- Fix Selezione Coppie Eliminazione Diretta: Modificati i pulsanti di selezione rapida per l'Eliminazione Diretta / TPRA in `DrawPage.tsx` da `[4, 8, 16]` a `[4, 6, 8, 9+]`. Verificato empiricamente l'algoritmo di propagazione dei BYE e l'avanzamento automatico delle teste di serie per qualsiasi numero di coppie (es. 5, 6, 7, 9, 10, 12, 15).

## v6.1.0 — 2026-07-27
- Major Milestone Release v6.1.0: Integrazione completa del motore ELO dinamico partita per partita, algoritmo Americano ad equità assoluta di giocate e riposi, design system Apple HIG avanzato con Progress Control ed etichette esplicite di eliminazione, grafici Recharts ad alta risoluzione con etichette ordinate trasparenti.

## v6.0.21 — 2026-07-27
- Integrazione Universale Progress Bar Eliminazione: Esteso il popup HIG Alert con spinner ed animazione della progress bar a tutte le azioni di eliminazione dell'applicazione (eliminazione partite singole in `MatchesPage.tsx` ed eliminazione giocatori in `PlayersPage.tsx`).

## v6.0.20 — 2026-07-27
- Fix Equità Riposi Americano: Riscritto l'algoritmo di turnazione `generateAmericanoMatches` in `TournamentFlow.tsx` con tracciamento dinamico `benchedCounts`. Garantita la perfetta equità per cui ogni giocatore effettua esattamente lo stesso numero di riposi e di partite giocate.
- Fix Flusso Torneo Singolo / TPRA: Modificato `getInitialStep()` in `TournamentFlow.tsx`. Imposto il passaggio obbligatorio per la schermata di impostazione Nome Torneo, Data e Circolo (`setup`) per tutti i nuovi tornei prima di accedere al tabellone, prevenendo salvataggi con nome vuoto e blocchi.

## v6.0.19 — 2026-07-27
- Aggiornamento README Repository: Aggiornata la documentazione ufficiale del repository `README.md` allineando la versione del prodotto a `v6.0.19`, le specifiche dell'algoritmo ELO dinamico reale, il design system Apple HIG e la suite di formati torneo.

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
- UI Redesign "Cosa Vuoi Organizzare Oggi": Riprogettata la schermata iniziale di selezione tipo torneo/giornata con card interattive, icone flat e descrizioni sintetiche dedicate.
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
