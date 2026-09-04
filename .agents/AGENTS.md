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
     zip -r ~/Desktop/Elo_Manager_v$(node -p "require('./package.json').version")_$(date +%Y-%m-%d).zip . -x "node_modules/*" ".git/*" ".gemini/*" "dist/*" "*/.DS_Store"
     ```

4. **Esporta il Codice Sorgente in 3 File TXT (Grafica, Logica, Backend):**
   - Esegui il comando per generare tre file di testo distinti sulla Scrivania:
     ```bash
     VERSION=$(node -p "require('./package.json').version")
     DATE=$(date +%Y-%m-%d)
     UI_FILE=~/Desktop/Elo_Manager_Grafica_v${VERSION}_${DATE}.txt
     LOGIC_FILE=~/Desktop/Elo_Manager_Logica_v${VERSION}_${DATE}.txt
     BACKEND_FILE=~/Desktop/Elo_Manager_Backend_v${VERSION}_${DATE}.txt

     echo "Padel Manager - Source Code: GRAFICA & UI" > $UI_FILE
     echo "Padel Manager - Source Code: CORE & LOGICA DI GIOCO" > $LOGIC_FILE
     echo "Padel Manager - Source Code: BACKEND & INFRASTRUTTURA" > $BACKEND_FILE

     # 1. File Grafica (Componenti, Pagine, Stili, Template UI)
     find ./components ./pages ./index.css ./index.html ./App.tsx ./index.tsx ./tailwind.config.js ./postcss.config.js -type f -not -name "*.png" -not -name "*.jpg" -not -name "*.zip" 2>/dev/null | sort | while read -r file; do
         echo -e "\n\n================================================================" >> $UI_FILE
         echo "FILE: $file" >> $UI_FILE
         echo "================================================================" >> $UI_FILE
         cat "$file" >> $UI_FILE
     done

     # 2. File Logica (Formati Tornei, Servizi, Utils, Hooks, Store, Tipi e Costanti)
     find ./formats ./services ./utils ./hooks ./types.ts ./constants.ts -type f -not -name "*.png" -not -name "*.jpg" -not -name "*.zip" 2>/dev/null | sort | while read -r file; do
         echo -e "\n\n================================================================" >> $LOGIC_FILE
         echo "FILE: $file" >> $LOGIC_FILE
         echo "================================================================" >> $LOGIC_FILE
         cat "$file" >> $LOGIC_FILE
     done

     # 3. File Backend (Server Express, Script di Migrazione, Build e Config)
     find ./server.js ./scripts ./package.json ./tsconfig.json ./vite.config.ts ./vercel.json -type f -not -name "*.png" -not -name "*.jpg" -not -name "*.zip" -not -name "*.sqlite" -not -name "*.db" 2>/dev/null | sort | while read -r file; do
         echo -e "\n\n================================================================" >> $BACKEND_FILE
         echo "FILE: $file" >> $BACKEND_FILE
         echo "================================================================" >> $BACKEND_FILE
         cat "$file" >> $BACKEND_FILE
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


