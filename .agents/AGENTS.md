# Routine: Commit e Push (Release)

Quando l'utente chiede di fare "commit e push", "creare una release" o "salvare e pushare", DEVI eseguire **sempre** i seguenti step in ordine:

1. **Incrementa la Versione:**
   - Verifica l'ultima versione nel file `package.json`.
   - Incrementa la versione (`patch` se bugfix, `minor` se nuove feature) usando il comando `npm version patch --no-git-tag-version` (o minor).

2. **Aggiorna il Mese:**
   - Verifica il mese e anno attuali (es. "Giu 2026", "Lug 2026").
   - Usa `grep_search` per cercare le occorrenze del vecchio mese (nei file `constants.ts`, `README.md`, `CHANGELOG.md`, file `*.html` ecc.).
   - Se il mese reale è cambiato, aggiorna tutte queste occorrenze con il nuovo mese.

2.5. **Verifica Documentazione (MANDATORY):**
   - Controlla se le ultime modifiche logiche hanno impatto sulla documentazione.
   - Aggiorna i file rilevanti: Guida HTML, Presentazione HTML, Testi Promo e Istruzioni d'uso.

3. **Backup ZIP sulla Scrivania:**
   - Esegui un comando per creare uno zip pulito sulla scrivania (escludendo `node_modules` e `.git`):
     ```bash
     zip -r ~/Desktop/PadelManager2_v$(node -p "require('./package.json').version")_$(date +%Y-%m-%d).zip . -x "node_modules/*" ".git/*" ".gemini/*" "dist/*" "*/.DS_Store"
     ```

4. **Esporta il Codice Sorgente in TXT:**
   - Esegui un comando per generare un file di testo contenente tutto il codice sorgente sulla Scrivania, ad esempio:
     ```bash
     OUTPUT_FILE=~/Desktop/ELO_Manager_full_source_v$(node -p "require('./package.json').version")_$(date +%Y-%m-%d).txt
     echo "Padel Manager Source Code" > $OUTPUT_FILE
     find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/.gemini/*" -not -name "*.jpg" -not -name "*.png" -not -name "*.zip" -not -name "package-lock.json" | sort | while read -r file; do
         echo -e "\n\n================================================================" >> $OUTPUT_FILE
         echo "FILE: $file" >> $OUTPUT_FILE
         echo "================================================================" >> $OUTPUT_FILE
         cat "$file" >> $OUTPUT_FILE
     done
     ```

5. **Commit e Push:**
   - Aggiungi i file a git: `git add .`
   - Esegui il commit indicando la nuova versione e i cambiamenti: `git commit -m "chore: release vX.Y.Z - [descrizione]"`
   - Esegui il push: `git push` (assicurati che il remote sia configurato col token).

# Regola Comportamentale: Modifiche Logiche e Grafiche

**MANDATORY**: Non prendere MAI iniziative non richieste riguardo alla veste grafica (UI) o alla logica di business dell'applicazione. Se noti un comportamento anomalo a livello grafico o logico che l'utente non ha segnalato, NON modificarlo. 
Tuttavia, I BUG (crash, errori a schermo, variabili non definite) e le rotture di codice DEVONO essere sempre indagati e corretti. Attieniti strettamente al prompt per le modifiche di design.

# Formati Bloccati (FROZEN FORMATS)

I seguenti 6 formati di torneo sono stati completati, collaudati e sono **rigidamente bloccati**:
- **Round Robin + Finali** (`round-robin-finali` / `isRoundRobinFinali`) - BLOCCATO E CONGELATO
- **Beat the Box** (`beat_the_box` / `isBeatTheBox`) - BLOCCATO E CONGELATO
- **TorneOtto** (`torneotto30` / `isTorneOtto`) - BLOCCATO E CONGELATO
- **Americano** (`americano` / `isAmericano`) - BLOCCATO E CONGELATO
- **Gironi + Fase Finale** (`gironi-fase-finale` / `isGironiFaseFinale`) - BLOCCATO E CONGELATO
- **Eliminazione Diretta** (`eliminazione-diretta` / `isEliminazioneDiretta` / TPRA) - BLOCCATO E CONGELATO

NON apportare MAI modifiche alla logica di business o alla struttura di questi 6 formati se non esplicitamente richiesto dall'utente.


