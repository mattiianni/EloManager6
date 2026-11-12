# Checklist QA UI e PDF

Questa checklist usa esclusivamente fixture locali o tornei di prova esplicitamente autorizzati. Non usare il Workspace Principale per test automatici.

## Matrice minima

Eseguire ogni formato in stato `scheduled` e `completed`:

- TorneOtto 30': 4 coppie, 3 turni, 2 campi.
- Americano: 4, 5 e 6 coppie; 1, 2 e 3 campi; almeno un turno con riposo.
- Round Robin + Finali: numero pari e dispari di coppie; solo girone, finale, semifinali; andata/ritorno.
- Gironi + Fase Finale: 2 e 3 gironi; con e senza teste di serie.
- Beat the Box: 4, 6 e 8 coppie.
- TPRA Eliminazione Diretta: tabellone con e senza BYE.
- Torneo Libero: coppie fisse e rotazione.
- Torneo a Squadre: round robin, andata/ritorno ed eliminazione diretta.

## Flusso UI

- Verificare la sequenza `tipo → giocatori → sorteggio → opzioni → nome/data/circolo → tabellone → salvataggio`.
- Verificare che nome e circolo vuoti blocchino il proseguimento e non generino nomi automatici.
- Verificare che Indietro non perda coppie, teste di serie o opzioni e non crei loop.
- Inserire, modificare e salvare un risultato; ricaricare e verificare che non esistano duplicati.
- Controllare turni strettamente crescenti e campi che ripartono da 1.
- Controllare loading, successo ed errore senza click multipli.

## Apple HIG e responsive

- Testare 390×844, 768×1024 e 1440×900 in tema chiaro e scuro.
- Controllare target interattivi di almeno 44×44 pt, safe area, tab bar e tastiera.
- Navigare con tastiera: focus visibile, Escape sui dialoghi e ripristino del focus.
- Verificare contrasto, testo ingrandito al 200% e nomi lunghi senza sovrapposizioni.
- Verificare etichette accessibili su stampa, modifica, elimina e pulsanti solo icona.

## PDF tramite Stampa

- Generare scheda vuota e riepilogo completato per ogni formato.
- Verificare A4 verticale; usare orizzontale solo per tabelloni espressamente configurati.
- Verificare assenza di prima pagina vuota, righe spezzate, sovrapposizioni e testo tagliato.
- Verificare intestazione del turno unita alla prima partita e intestazione tabella ripetuta.
- Verificare ordine turni, reset dei campi, riposi e fasi finali.
- Verificare Manrope dopo il caricamento e footer senza conteggio pagina hardcoded.
- Disattivare “Intestazioni e piè di pagina” del browser quando si valuta il layout prodotto dall’app.

## Gate di rilascio

- `npm test`
- `npm run build`
- Nessun errore nella console durante creazione, salvataggio, modifica e stampa.
- Confronto visuale degli snapshot alle tre larghezze e dei PDF a una e più pagine.

## Torneo Libero con Giocatori Singoli (da provare dall'utente, v6.12.11)
1. Sorteggi → Giocatori Singoli → scegli almeno 4 giocatori → formato **Torneo Libero**.
2. Setup: inserisci numero di partite, nome, **circolo** e data (senza circolo il pulsante "Crea partite" resta disattivato).
3. Per ogni partita scegli 4 giocatori diversi (nei menu ogni giocatore compare una sola volta) e inserisci i punteggi.
4. "Salva Tabellone" → il torneo compare in Tornei con "In Corso - Inserisci Risultati".
5. Ripeti da "+ Inserisci giornata" di una serie esistente (Giocatori Singoli e Coppie Fisse): nel setup compare "Nuova giornata per: <serie>", il circolo è precompilato, e dopo il salvataggio la giornata compare **dentro la serie** in Tornei (non come torneo separato).
   - "Indietro" dal setup non deve aprire una schermata di nome torneo diversa.
   - "Conferma Risultati" con punteggio 0-0 deve mostrare un messaggio chiaro.
6. "Conferma Risultati" → classifica e ELO aggiornati.
7. Partita **incompleta** (punteggio inserito ma giocatori mancanti, o solo alcuni giocatori scelti): "Salva Tabellone" e "Conferma Risultati" mostrano "La partita N è incompleta..." e non salvano nulla; una partita rimasta vuota mostra "La partita N non è compilata..." (tutte le partite del tabellone vanno compilate). I pulsanti restano premibili proprio per mostrare questi messaggi.
8. Partita con games pari (es. 6-6): nessuna vittoria assegnata, risultato = pareggio (ELO a 0,5).

## Stampa profili giocatori filtrata per torneo: ELO di torneo (da provare dall'utente, v6.12.13)
1. Giocatori → Stampa → "Giocatori Singolo Torneo" → scegli un torneo → stampa.
2. Il numero grande in alto a destra è l'**ELO del torneo** (1500 + delta ottenuto nel torneo, con l'etichetta "ELO del torneo"), **uguale a quello della pagina Classifiche filtrata per lo stesso torneo** (anche per le serie con più giornate: tutte le giornate formano un'unica catena che parte da 1500); non l'ELO generale del giocatore.
3. Grafico: Start = 1500, poi E1, E2... con l'ELO di torneo dopo ogni giornata. "ELO Massimo" è il massimo di quel grafico. "Ranking #" è la posizione tra i giocatori del torneo.
4. Tabella giornate: "Var. ELO" è il delta di torneo di ogni giornata.
5. Senza filtro ("Tutti" o "Scegli Giocatori") non cambia nulla: ELO generale.
