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
