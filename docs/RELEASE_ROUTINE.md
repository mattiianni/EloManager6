# Release Routine

## Stato corrente

- Versione attuale: `6.12.6`
- Mese attuale: `Nov 2026`

## Regole generali

- **Non lanciare mai la release routine, né commit o push, senza una richiesta esplicita dell'utente.** Preparare i contenuti (istruzioni, guide, testi) è lecito; incrementare la versione (punti 5 e 6), generare i PDF (punto 10), creare l'archivio (punti 14 e 15) e fare commit/push (punto 17) richiede la richiesta dell'utente.
- Gli esempi nei testi usano il separatore ` & ` tra i compagni di coppia (`Rossi & Bianchi`), mai ` / `.
- L'italiano di tutti i testi per gli utenti (istruzioni, guide, promo, presentazione, PDF) va riletto prima della release: accenti corretti (`è`, `già`, `può`, `più`), niente apostrofi al posto degli accenti (`e'`), terminologia coerente (vedi sotto).

## Terminologia da usare nei testi

`Coppie Fisse`, `Giocatori Singoli`, `Torneo a Squadre`, `Beat the Box`, `Messicano`, `Torneo Personale`, `Bypass / Modifica`, `Classifiche`, `Risultati`, `Sorteggi`. Le posizioni in campo sono `Sinistra`, `Destra`, `Indifferente`. L'ELO usa un solo fattore `K = 16` a somma zero per tutti i formati e viene applicato al completamento del torneo.

## Checklist operativa

### A. Verifica del codice

1. Eseguire `npx tsc --noEmit` e `npx vitest run`: nessun errore, nessun test fallito.
2. Eseguire `npm run build` e verificare che finisca senza errori.
3. **Prova manuale della stampa su iPhone/iPad** (Safari e app installata): schede giocatore (tutti e singolo torneo), grafico ELO, un torneo completo. Controllare che non ci siano pagine bianche né contenuti tagliati. Non è automatizzabile: va fatta su un dispositivo reale.
4. Controllare `CHANGELOG.md`: deve contenere la voce della nuova versione, con data e descrizione delle modifiche.

### B. Versione

5. Incrementare la versione in `package.json` (`npm version patch --no-git-tag-version` oppure `minor`); `package-lock.json` deve restare coerente.
6. Allineare `APP_VERSION` (e `APP_MONTH` se il mese è cambiato) in `constants.ts`.
7. Se il mese è cambiato, aggiornare anche la costante `APP_MONTH` negli script `scripts/generate-user-guide-pdf.mjs` e `scripts/generate-team-tournament-guide-pdf.mjs` (oggi è scritta a mano in entrambi).

### C. Istruzioni, guide e testi

8. **Istruzioni d'uso**: confrontare `docs/ISTRUZIONI_USO.md` con le funzioni dell'app (pagine, formati, stampe, Admin) e con le voci di `CHANGELOG.md` dall'ultima release: ogni funzione nuova o cambiata deve essere descritta, e nulla di ciò che è stato rimosso deve restare. Aggiornare l'intestazione con versione e mese.
9. **Guida HTML**: creare `docs/Padel_ELO_Manager_Guida_v${VERSION}.html` partendo dall'ultima versione, aggiornare contenuti, indice, numero di formati e riquadri `Novità`, poi sostituire i riferimenti alla versione precedente.
10. **PDF**: i contenuti dei due script sono scritti a mano e **non** leggono `ISTRUZIONI_USO.md`: aggiornarli a mano in modo che coincidano con le istruzioni. Poi eseguire `node scripts/generate-user-guide-pdf.mjs` e `node scripts/generate-team-tournament-guide-pdf.mjs`, controllare i PDF generati (`Guida_Uso_v${VERSION}.pdf` e `Guida_Torneo_a_Squadre_v${VERSION}.pdf`) e **rimuovere dalla cartella `docs/` i PDF delle versioni precedenti**.
11. **Testi promozionali e presentazione**: aggiornare `docs/Padel_ELO_Manager_Testi_Promo.txt` e `docs/Padel_ELO_Manager_Presentazione.html` (versione, mese, numero di formati, funzioni citate). Non inserire funzioni che non esistono.
12. **Controllo dell'italiano**: rileggere istruzioni, guida HTML, promo, presentazione e testi degli script PDF. Controlli rapidi: cercare `e'`, `gia'`, `puo'`, `piu'`, `cioe'`, ` / ` tra i nomi dei compagni, e verificare che il numero di formati e i nomi dei menu coincidano con l'app.
13. Aggiornare `DESIGN.md` e `REBUILD_BRIEF_FOR_AI.txt` solo se ci sono cambi architetturali o nuovi flussi importanti.

### D. Archivio di rilascio

14. Salvare tutti i file di rilascio **esclusivamente** nella cartella della versione (`${VERSION}`) all'interno di `TorneOtto 3.0 Docs` (`/Users/mattiaianniello/Library/Mobile Documents/com~apple~CloudDocs/World Padel Tour/App TorneOtto 3.0/${VERSION}`). Nessun file o cartella sul Desktop e nessuna cartella `Docs` ridondante.
15. La cartella della versione deve contenere:
    - backup `.zip` di ripristino (`Elo_Manager_v${VERSION}_${DATE}.zip`)
    - 3 file `.txt` di codice sorgente (Grafica, Logica, Backend)
    - i PDF delle guide (`Guida_Uso_v${VERSION}.pdf` e `Guida_Torneo_a_Squadre_v${VERSION}.pdf`)
    - le pagine web (`Padel_ELO_Manager_Guida_v${VERSION}.html` e `Padel_ELO_Manager_Presentazione.html`)
    - i testi (`Padel_ELO_Manager_Testi_Promo.txt` e `ISTRUZIONI_USO.md`)

### E. Pubblicazione

16. Rieseguire test e build (punti 1 e 2) sul codice definitivo.
17. Fare commit e push della versione locale corrente, **solo su richiesta esplicita**.

## Note operative

- I riferimenti nell'interfaccia che usano `APP_VERSION` si aggiornano dal valore definito in `constants.ts`.
- I riferimenti mese/anno nei PDF e nei footer vanno aggiornati solo quando il mese reale cambia.
- Le guide HTML delle versioni precedenti restano nel repository come storico; i PDF vecchi invece vanno rimossi (vedi punto 10).
- `DESIGN.md` e `REBUILD_BRIEF_FOR_AI.txt` sono documenti di prodotto e architettura: aggiornali solo quando cambia qualcosa di sostanziale.
- Per le stampe su iOS vale quanto scritto nel `CHANGELOG.md` alle versioni 6.10.5 e 6.12.2: la stampa avviene dentro la finestra dell'app (`printInWindow`) e il CSS di stampa deve restare limitato a `@media print`.
