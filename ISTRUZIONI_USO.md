# Guida Uso

Guida pratica allineata all'interfaccia attuale.

## Accesso

1. Apri l'app.
2. Inserisci il codice di accesso a 6 cifre nella splash screen.
3. Se il codice e' valido entri nel workspace associato.

## Giocatori

In `Giocatori` puoi:

- aggiungere un giocatore con:
  - nome
  - cognome
  - posizione in campo
  - ELO iniziale (con sincronizzazione immediata bidirezionale del livello Playtomic)
- modificare nome, cognome, posizione, ed ELO/Playtomic
- eliminare un giocatore
- aprire il profilo giocatore
- stampare il riepilogo profili

## Sorteggi (Cosa Vuoi Organizzare Oggi)

In `Sorteggi` l'interfaccia 2x2 ti permette di scegliere la modalità desiderata con icone flat dedicate:

1. **Multi Giornata**: Tornei a coppie su più tappe.
2. **Torneo a Squadre**: Sfide tra team e squadre numerate.
3. **Torneo Singolo**: Eventi a coppie in un singolo appuntamento con scelta anticipata del formato.
4. **Nuova Giornata**: Aggancio di giornate ai tornei attivi.

*Nota:* In qualsiasi momento della configurazione del sorteggio puoi cliccare sul pulsante **`← Torna indietro`** in alto per rientrare alla schermata iniziale.

Per il sorteggio coppie puoi:

- selezionare i partecipanti
- scegliere la modalita':
  - casuale
  - bilanciato
  - teste di serie
  - manuale
- generare o confermare le coppie

## Creazione torneo

Dopo il draw entri nel flow torneo:

- scegli il formato
- scegli se creare un nuovo torneo o aggiungere una giornata a una serie esistente
- imposti data e circolo
- inserisci i risultati oppure salvi il calendario, se il formato lo supporta

## Formati disponibili

- Match Singolo
- TorneOtto 30'
- Round Robin + Finali
- Americano
- Torneo Libero
- Gironi + Fase Finale
- Beat the Box
- Torneo a Squadre (Round Robin)

## Torneo a Squadre (Round Robin)

Il Torneo a squadre non segue il flow dei tornei a coppie.

Flusso principale:

1. Vai in `Tornei` e avvia il flusso `Nuovo torneo / Nuova giornata`.
2. Nella pagina `Sorteggi`, nella sezione "Opzioni sorteggio coppie", scegli `Torneo a squadre`.
3. Inserisci i dati base:
   - nome torneo
   - circolo
   - numero squadre (modificabile successivamente)
   - giocatori per squadra (valore di partenza, modificabile successivamente)
4. Torna in `Tornei`: vedrai il blocco `Gestione torneo` con `+ Completa configurazione`.
5. In `Completa configurazione`:
   - imposti le opzioni (Round Robin; fase finale; tipo punteggio; partite per giornata)
   - compili nome e giocatori di ogni squadra
   - il bottone `Completa configurazione` (arancione) si abilita solo quando i dati minimi sono completi
6. Dopo la configurazione puoi usare `+ Inserisci giornata` per creare la singola giornata:
   - scegli data
   - scegli la sfida squadra vs squadra (con esclusione combinazioni gia' giocate)
   - inserisci i giocatori delle 3/5 partite della serata (un giocatore gioca al massimo una volta a sera)
7. Puoi:
   - salvare il calendario
   - stampare
   - inserire risultati e chiudere la giornata

Note/limitazioni attuali:

- per ora solo `Round Robin` e' selezionabile (altri formati saranno attivati dopo l'implementazione logica)
- `5 partite` e' consentito solo con `>= 8` giocatori per squadra
- dopo che esistono risultati, alcune opzioni di configurazione non sono piu' modificabili
- quando il round robin e' completo, `+ Inserisci giornata` diventa `+ Inserisci Finali` e il flusso usa le partite finali gia' calcolate
- quando la fase finale e' completata, il bottone diventa `Riepilogo` e porta alla pagina di riepilogo (UI); il PDF riepilogo torneo, in fondo, include anche le statistiche

## Risultati

In `Risultati` puoi:

- aprire un torneo
- modificare i set
- salvare i risultati
- stampare il report del torneo

Per i tornei multi-fase:

- la modifica di una fase iniziale puo' triggerare il cascade reset
- semifinali e finali vengono eliminate e rigenerate coerentemente

## Classifica

In `Classifica` puoi:

- vedere la classifica globale del workspace
- filtrare per serie torneo
- applicare soglia presenze
- vedere l'andamento ELO
- stampare la classifica

## Statistiche

In `Statistiche` puoi:

- filtrare per serie torneo
- vedere top player, premi, streak, upset, ELO peak
- stampare il riepilogo

Per i `Tornei a squadre`:

- esiste una sezione dedicata (selezionabile dal filtro)
- stampa PDF "Statistiche" separata dal report torneo

## Tornei

In `Tornei` puoi:

- vedere le serie raggruppate
- aprire i risultati
- stampare il torneo
- modificare data, nome e circolo
- eliminare il torneo
- inserire una nuova giornata su una serie esistente

Per i `Tornei a squadre`:

- il blocco `Gestione torneo` mostra azioni root (modifica/stampa/cancella)
- le giornate sono elencate sotto (ordinate dalla meno recente alla piu' recente)

## Admin

Se il codice ha privilegi admin, in `Admin` puoi:

- creare workspace
- generare e disattivare codici di accesso
- vedere i codici in chiaro quando disponibili
- impersonare un workspace
- consultare audit log
- ricalcolare gli ELO
