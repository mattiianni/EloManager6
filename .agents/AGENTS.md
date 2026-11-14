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

3. **Creazione Cartella Release Unica in TorneOtto 3.0 Docs (MANDATORY):**
   - Tutti i file di rilascio vanno inseriti **ESCLUSIVAMENTE** in una singola cartella nominata con la versione (`${VERSION}`) all'interno di `TorneOtto 3.0 Docs` (`/Users/mattiaianniello/Library/Mobile Documents/com~apple~CloudDocs/World Padel Tour/App TorneOtto 3.0/${VERSION}`).
   - **NON** creare cartelle o file sfusi sul Desktop e **NON** creare sottocartelle Docs ridondanti.
   - Crea la cartella di release:
     ```bash
     VERSION=$(node -p "require('./package.json').version")
     DATE=$(date +%Y-%m-%d)
     CLOUD_DIR="/Users/mattiaianniello/Library/Mobile Documents/com~apple~CloudDocs/World Padel Tour/App TorneOtto 3.0"
     RELEASE_DIR="$CLOUD_DIR/${VERSION}"
     mkdir -p "$RELEASE_DIR"
     ```

4. **Backup ZIP e i 3 File TXT di Codice Sorgente:**
   - Salva lo ZIP direttamente nella cartella di release:
     ```bash
     zip -r "$RELEASE_DIR/Elo_Manager_v${VERSION}_${DATE}.zip" . -x "node_modules/*" ".git/*" ".gemini/*" "dist/*" "*/.DS_Store"
     ```
   - Genera i 3 file TXT direttamente nella cartella di release:
     ```bash
     UI_FILE="$RELEASE_DIR/Elo_Manager_Grafica_v${VERSION}_${DATE}.txt"
     LOGIC_FILE="$RELEASE_DIR/Elo_Manager_Logica_v${VERSION}_${DATE}.txt"
     BACKEND_FILE="$RELEASE_DIR/Elo_Manager_Backend_v${VERSION}_${DATE}.txt"

     echo "Padel Manager - Source Code: GRAFICA & UI" > "$UI_FILE"
     echo "Padel Manager - Source Code: CORE & LOGICA DI GIOCO" > "$LOGIC_FILE"
     echo "Padel Manager - Source Code: BACKEND & INFRASTRUTTURA" > "$BACKEND_FILE"

     # 1. File Grafica
     find ./components ./pages ./index.css ./index.html ./App.tsx ./index.tsx ./tailwind.config.js ./postcss.config.js -type f -not -name "*.png" -not -name "*.jpg" -not -name "*.zip" 2>/dev/null | sort | while read -r file; do
         echo -e "\n\n================================================================" >> "$UI_FILE"
         echo "FILE: $file" >> "$UI_FILE"
         echo "================================================================" >> "$UI_FILE"
         cat "$file" >> "$UI_FILE"
     done

     # 2. File Logica
     find ./formats ./services ./utils ./hooks ./types.ts ./constants.ts -type f -not -name "*.png" -not -name "*.jpg" -not -name "*.zip" 2>/dev/null | sort | while read -r file; do
         echo -e "\n\n================================================================" >> "$LOGIC_FILE"
         echo "FILE: $file" >> "$LOGIC_FILE"
         echo "================================================================" >> "$LOGIC_FILE"
         cat "$file" >> "$LOGIC_FILE"
     done

     # 3. File Backend
     find ./server.js ./scripts ./package.json ./tsconfig.json ./vite.config.ts ./vercel.json -type f -not -name "*.png" -not -name "*.jpg" -not -name "*.zip" -not -name "*.sqlite" -not -name "*.db" 2>/dev/null | sort | while read -r file; do
         echo -e "\n\n================================================================" >> "$BACKEND_FILE"
         echo "FILE: $file" >> "$BACKEND_FILE"
         echo "================================================================" >> "$BACKEND_FILE"
         cat "$file" >> "$BACKEND_FILE"
     done
     ```

5. **Copia Documentazione nella Cartella di Release:**
   - Copia i PDF, le guide HTML, la presentazione e i testi promozionali:
     ```bash
     cp docs/Guida_Uso_v${VERSION}.pdf "$RELEASE_DIR/" 2>/dev/null || true
     cp docs/Guida_Torneo_a_Squadre_v${VERSION}.pdf "$RELEASE_DIR/" 2>/dev/null || true
     cp docs/Padel_ELO_Manager_Guida_v${VERSION}.html "$RELEASE_DIR/" 2>/dev/null || true
     cp docs/Padel_ELO_Manager_Presentazione.html "$RELEASE_DIR/" 2>/dev/null || true
     cp docs/Padel_ELO_Manager_Testi_Promo.txt "$RELEASE_DIR/" 2>/dev/null || true
     cp docs/ISTRUZIONI_USO.md "$RELEASE_DIR/" 2>/dev/null || true
     ```

6. **Commit e Push:**
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

# Stampe PDF — regole permanenti (NON derogabili)

Queste regole valgono per chiunque modifichi il progetto: persone e assistenti AI/LLM.
Sono verificate da `services/printContract.test.ts`. Se un test del contratto fallisce,
si corregge il codice: **non si aggiorna l'impronta e non si indebolisce il test**.

## Regola 1 — Il foglio di stile di stampa è congelato
- Il riferimento visivo unico è la stampa **Beat the Box**. Tutte le stampe devono apparire come quella.
- È vietato aggiungere, togliere o cambiare stili di stampa durante lavori che non riguardano
  esplicitamente la grafica delle stampe. Vale per `getPrintStyles`, `formatScoreBoxes`,
  `renderPrintDateBadge`, `PDF_ICONS` e per il blocco `<style>` di Beat the Box.
- Una nuova stampa riusa quelle primitive e le classi `.section-block`, `.section-title`, `.footer`.
  Non introduce font, colori, bordi, altezze riga o padding propri.
- Le impronte in `services/printContract.ts` si aggiornano **solo** su richiesta esplicita di
  Mattia Ianniello, citando la richiesta nel changelog.

## Regola 2 — Interruzioni di pagina
- **a) La riga è l'unità indivisibile.** Una riga di tabella non viene mai tagliata a metà.
- **b) Un gruppo piccolo resta unito:** fino a 9 righe intestazione inclusa (le partite di un turno,
  le partite di un box, una classifica di box). Se non entra passa intero alla pagina successiva.
- **c) Un blocco lungo NON è indivisibile.** Un round robin di 12 partite o una classifica di 20
  giocatori scorrono da una pagina all'altra spezzandosi solo tra una riga e l'altra.
  Non devono mai nascere pagine vuote o semivuote per "tenere unito" un blocco grande.
- **d) Il titolo segue le sue righe.** Il titolo di un blocco non resta solo a fondo pagina e
  l'intestazione di colonna della tabella viene ripetuta in cima alla pagina successiva.
- **e) Profili giocatore:** ogni giocatore inizia sempre su una pagina nuova.
- I punti a-d sono applicati in modo centralizzato da `normalizePrintBlocks()`
  (`services/printContract.ts`) su tutte le piattaforme: finestra desktop, iPad/Safari, iPhone PWA.
  Una nuova stampa non deve reimplementarli né aggirarli: marca i gruppi con
  `section-block avoid-break keep-together` e lascia decidere alla funzione.
- Non creare regole di interruzione diverse per piattaforma.

## Regola 3 — Pipeline iPhone PWA
- Su iPhone standalone la stampa passa da `services/iosPdfPrint.ts` (PDF + foglio di condivisione).
- Non reintrodurre `html2canvas` sul documento dell'app né `offsetTop` per calcolare i tagli pagina.
- Gli altri percorsi (`printInWindow` per iPad/Safari, finestra di stampa per desktop/Android)
  non vanno modificati per correggere problemi dell'iPhone PWA.



