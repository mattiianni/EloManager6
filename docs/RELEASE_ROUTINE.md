# Release Routine

## Stato corrente

- Versione attuale: `6.8.0`
- Formato incrementale successivo: patch semantica (`6.8.1`), salvo release minor/major esplicitamente richiesta.
- Mese corrente di riferimento: `Ago 2026`

## Checklist

1. Aggiornare la versione in tutta l'app e nei materiali allegati.
2. Se il mese reale cambia, aggiornare anche il mese visibile nei riferimenti applicativi e documentali.
3. **Aggiornamento Documentazione (Cruciale)**: Prima di procedere, verifica se ci sono nuove funzionalità (es. Integrazione Playtomic) e assicurati che siano state spiegate in: Guida HTML, Presentazione HTML e Testi Promo.
4. Aggiornare i file `.md` rilevanti e il `README.md`.
5. Aggiornare `CHANGELOG.md` (non usare piu' `UPDATE_SUMMARY_*.md`).
6. Aggiornare l'HTML guida utente corrente (`docs/Padel_ELO_Manager_Guida_v6.8.0.html`) e la guida in formato `.md` (`docs/ISTRUZIONI_USO.md`).
7. Eseguire i due script di generazione PDF (`node scripts/generate-team-tournament-guide-pdf.mjs` per la guida a squadre, e `swift scripts/html_to_pdf.swift docs/Padel_ELO_Manager_Guida_v6.8.0.html docs/Guida_Uso_v6.8.0.pdf` per la guida d'uso generica) per produrre in `docs/` i PDF aggiornati (`Guida_Torneo_a_Squadre_v6.8.0.pdf` e `Guida_Uso_v6.8.0.pdf`), rimuovendo i vecchi file PDF.
8. Aggiornare `DESIGN.md` e `REBUILD_BRIEF_FOR_AI.txt` se ci sono cambi architetturali o nuovi flussi importanti.
8. Eseguire test automatici e build di verifica.
9. Creare backup `.zip` di ripristino e salvarlo sul Desktop dell'utente (`~/Desktop/`).
10. Creare dump `.txt` completo file-per-file del codice e salvarlo sul Desktop dell'utente (`~/Desktop/`).
11. Fare commit e push della versione locale corrente.

## Note operative

- I riferimenti UI che usano `APP_VERSION` si aggiornano dal valore definito in `constants.ts`.
- I riferimenti in `package.json` e `package-lock.json` vanno mantenuti coerenti con la release corrente.
- I riferimenti mese/anno nei PDF e nei footer vanno aggiornati solo quando il mese reale cambia.
- La guida HTML V5.0.3 va mantenuta nel repo e, se ancora utilizzata, nella cartella alias/distribuzione indicata dall'utente.
- `DESIGN.md` e `REBUILD_BRIEF_FOR_AI.txt` vanno trattati come documenti "di prodotto/architettura": aggiornali solo quando cambia qualcosa di sostanziale.
