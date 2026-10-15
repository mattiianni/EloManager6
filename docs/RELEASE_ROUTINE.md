# Release Routine

## Stato corrente

- Versione attuale: `6.10.1`
- Mese attuale: `Ott 2026`

## Checklist Operativa

1. Chiudere o verificare i test di regressione pertinenti.
2. Eseguire `npm run build` per verificare che non vi siano errori di tipo o di compilazione.
3. Se sono state aggiunte nuove funzionalità o correzioni, incrementare la versione in `package.json` (`npm version patch --no-git-tag-version` o `minor`).
4. Allineare `APP_VERSION` (e `APP_MONTH` se cambiato mese) in `constants.ts`.
5. Verificare e aggiornare le descrizioni e i testi promozionali in `docs/Padel_ELO_Manager_Testi_Promo.txt` e `docs/Padel_ELO_Manager_Presentazione.html`.
6. Aggiornare l'HTML guida utente corrente (`docs/Padel_ELO_Manager_Guida_v6.10.1.html`) e la guida in formato `.md` (`docs/ISTRUZIONI_USO.md`).
7. Eseguire i due script di generazione PDF (`node scripts/generate-team-tournament-guide-pdf.mjs` per la guida a squadre, e `node scripts/generate-user-guide-pdf.mjs` per la guida d'uso generica) per produrre in `docs/` i PDF aggiornati (`Guida_Torneo_a_Squadre_v6.10.1.pdf` e `Guida_Uso_v6.10.1.pdf`), rimuovendo i vecchi file PDF.
8. Aggiornare `DESIGN.md` e `REBUILD_BRIEF_FOR_AI.txt` se ci sono cambi architetturali o nuovi flussi importanti.
8. Eseguire test automatici e build di verifica.
9. Creare backup `.zip` di ripristino (`Elo_Manager_v...zip`) e salvarlo sul Desktop dell'utente (`~/Desktop/`).
10. Creare 3 dump `.txt` distinti del codice sorgente (`Elo_Manager_Grafica_v...txt`, `Elo_Manager_Logica_v...txt` e `Elo_Manager_Backend_v...txt`) e salvarli sul Desktop dell'utente (`~/Desktop/`).
11. Creare la cartella unificata di release sul Desktop con il seriale della versione (es. `~/Desktop/${VERSION}/`) contenente lo zip, i 3 txt di codice sorgente, tutti i PDF, gli HTML guida e presentazione, e i file di testi promozionali e istruzioni. Sincronizzare gli stessi file nella cartella/alias `TorneOtto 3.0 Docs` (sottocartelle `${VERSION}` e `Docs`).
12. Fare commit e push della versione locale corrente.

## Note operative

- I riferimenti UI che usano `APP_VERSION` si aggiornano dal valore definito in `constants.ts`.
- I riferimenti in `package.json` e `package-lock.json` vanno mantenuti coerenti con la release corrente.
- I riferimenti mese/anno nei PDF e nei footer vanno aggiornati solo quando il mese reale cambia.
- La guida HTML V5.0.3 va mantenuta nel repo e, se ancora utilizzata, nella cartella alias/distribuzione indicata dall'utente.
- `DESIGN.md` e `REBUILD_BRIEF_FOR_AI.txt` vanno trattati come documenti "di prodotto/architettura": aggiornali solo quando cambia qualcosa di sostanziale.
