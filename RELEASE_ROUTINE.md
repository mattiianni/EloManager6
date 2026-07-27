# Release Routine

## Stato corrente

- Versione attuale: `6.0.8`
- Formato incrementale successivo: `6.0.2`, `6.1.0`, ...
- Mese corrente di riferimento: `Lug 2026`

## Checklist

1. Aggiornare la versione in tutta l'app e nei materiali allegati.
2. Se il mese reale cambia, aggiornare anche il mese visibile nei riferimenti applicativi e documentali.
3. **Aggiornamento Documentazione (Cruciale)**: Prima di procedere, verifica se ci sono nuove funzionalità (es. Integrazione Playtomic) e assicurati che siano state spiegate in: Guida HTML, Presentazione HTML e Testi Promo.
4. Aggiornare i file `.md` rilevanti e il `README.md`.
   - Aggiornare `CHANGELOG.md` (non usare piu' `UPDATE_SUMMARY_*.md`).
4. Aggiornare l'HTML guida utente (`Padel_ELO_Manager_Guida_V4.1.html`) e, se serve, esportarne il PDF aggiornato nella cartella alias/distribuzione.
5. Eseguire lo script `node scripts/generate-team-tournament-guide-pdf.mjs` per generare la guida in PDF aggiornata dei tornei a squadre, e rimuovere le vecchie versioni in `docs/`.
6. Aggiornare `DESIGN.md` e `REBUILD_BRIEF_FOR_AI.txt` se ci sono cambi architetturali o nuovi flussi importanti.
7. Eseguire build di verifica.
8. Creare backup `.zip` di ripristino e salvarlo sul Desktop dell'utente (`~/Desktop/`).
9. Creare dump `.txt` completo file-per-file del codice e salvarlo sul Desktop dell'utente (`~/Desktop/`).
10. Fare commit e push della versione locale corrente.

## Note operative

- I riferimenti UI che usano `APP_VERSION` si aggiornano dal valore definito in `constants.ts`.
- I riferimenti in `package.json` e `package-lock.json` vanno mantenuti coerenti con la release corrente.
- I riferimenti mese/anno nei PDF e nei footer vanno aggiornati solo quando il mese reale cambia.
- La guida HTML V4.1 va mantenuta sia nel repo sia nella cartella alias `App TorneOtto 3.0` usata per la distribuzione.
- `DESIGN.md` e `REBUILD_BRIEF_FOR_AI.txt` vanno trattati come documenti "di prodotto/architettura": aggiornali solo quando cambia qualcosa di sostanziale.
