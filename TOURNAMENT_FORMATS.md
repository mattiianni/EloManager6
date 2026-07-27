# Formati Torneo

Documento allineato ai formati realmente disponibili in `components/TournamentFlow.tsx`.

Nota: `Torneo a Squadre` e' un flusso separato (implementato principalmente in `DrawPage`, `TournamentsPage` e `TeamTournamentMatchdayPage`), quindi non e' incluso nella matrice basata sul numero di coppie.

## Matrice disponibilita'

| N. coppie | Formati disponibili |
|---:|---|
| `2` | `Match Singolo` |
| `4` | `TorneOtto 30'`, `Round Robin + Finali`, `Americano`, `Torneo Libero`, `Beat the Box` |
| `5` | `Round Robin + Finali`, `Torneo Libero` |
| `6+` pari | `Round Robin + Finali`, `Americano`, `Torneo Libero`, `Gironi + Fase Finale`, `Beat the Box` |
| `6+` dispari | `Round Robin + Finali`, `Americano`, `Torneo Libero`, `Gironi + Fase Finale` |

## 1. Match Singolo

- requisiti: 2 coppie
- 1 partita
- ELO: K `16` (Standard unificato)

## 2. TorneOtto 30'

- requisiti: 4 coppie
- round robin completo
- 6 partite
- ELO: K `16` (Standard unificato)

## 3. Round Robin + Finali

- requisiti: 4+ coppie
- round robin completo
- top 4 in finale
- fase finale:
  - finale 1°-2°
  - finale 3°-4°
- ELO: K `16` (Standard unificato)

## 4. Americano

- requisiti: 4+ coppie
- partner e avversari ruotano
- configurazioni UI:
  - numero campi
  - numero round
  - scoring `games-diff` o `points`
- classifica individuale
- ELO: K `16` (Standard unificato)

## 5. Torneo Libero

- requisiti: 4+ coppie
- round robin completo flessibile
- consente nome giornata dedicato
- supporta stampa vuota e completa dedicata
- ELO: K `16` (Standard unificato)

## 6. Gironi + Fase Finale

- requisiti: 6+ coppie
- setup numero gironi nel flow
- il PDF dedicato raggruppa i gironi dalle coppie reali dei match, non da blocchi fissi
- UI e PDF evidenziano gli stessi qualificati: primi di ogni girone + migliori seconde necessarie ad arrivare a 4 semifinaliste
- fasi:
  - gironi
  - semifinali
  - finali 1°-2° e 3°-4°
- ELO: K `16` (Standard unificato)

## 7. Beat the Box

- requisiti: numero pari di coppie, minimo 4
- box da 4 giocatori
- fase box round robin
- con 8+ coppie puo' generare semifinali prima delle finali
- ha stampa dedicata vuota e completa
- ELO: K `16` (Standard unificato)

## Note di implementazione

- i formati salvati in DB usano i nomi presenti in `types.ts`
- i tornei multi-fase possono essere riaperti tramite cascade reset
- la disponibilita' dei formati dipende dal numero di coppie create in Draw

## 8. Torneo a Squadre (Round Robin)

- avvio: flusso `Tornei` -> `Nuovo torneo / Nuova giornata` -> pagina `Sorteggi` -> "Opzioni sorteggio coppie" -> `Torneo a squadre`
- concetti:
  - torneo "root" (configurazione + classifica + report generale)
  - giornate (record separati collegati al root via `team_tournament_root_id`)
  - squadre numerate con nome e lista giocatori
- configurazione:
  - formato: al momento solo `Round Robin` e' selezionabile (altri in arrivo)
  - fase finale: scelta indipendente (es. finali, semifinali+finali, quarti+...)
  - tipo punteggio: `Punti` o `Differenza Games`
  - partite per giornata: `3` oppure `5`
- vincoli:
  - `5` partite per giornata richiede almeno `8` giocatori per squadra (se < 8 viene forzato a 3)
  - dopo che esistono risultati, alcune opzioni non sono modificabili (per garantire consistenza)
- stampa:
  - calendario / report generale torneo
  - report singola giornata
  - statistiche torneo (PDF separato)
- post round robin:
  - classifica provvisoria fino al completamento del round robin
  - passaggio automatico al flusso `+ Inserisci Finali` se e' configurata una fase finale
  - a fase finale completata: `Inserisci Finali` diventa `Riepilogo` e apre la pagina riepilogo; il PDF riepilogo torneo include anche le statistiche in fondo
