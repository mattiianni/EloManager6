import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const APP_VERSION = '6.7.18';
const APP_MONTH = 'Ago 2026';

const outDir = path.resolve(process.cwd(), 'docs');
const outPath = path.join(outDir, `Guida_Uso_v${APP_VERSION}.pdf`);

fs.mkdirSync(outDir, { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 48, left: 48, right: 48, bottom: 48 },
  info: {
    Title: `Guida all'Uso - Padel ELO Manager (v${APP_VERSION})`,
    Author: 'Mattia Ianniello',
    Subject: 'Istruzioni e manuale utente completo - Padel ELO Manager',
  },
});

const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

const colors = {
  ink: '#0f172a',
  muted: '#475569',
  blue: '#2563eb',
  sky: '#0ea5e9',
  green: '#16a34a',
  border: '#e2e8f0',
  card: '#f8fafc',
};

const font = {
  h1: 22,
  h2: 14,
  h3: 12,
  p: 10,
  s: 9,
};

const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

function headerTitle(title) {
  doc
    .fontSize(font.h1)
    .fillColor(colors.ink)
    .text(title, { width: pageWidth, align: 'center' });
  doc
    .fontSize(font.s)
    .fillColor(colors.sky)
    .text(`Versione Guida v${APP_VERSION} — ${APP_MONTH}`, { width: pageWidth, align: 'center' });
  doc.moveDown(0.5);

  const y = doc.y;
  doc
    .save()
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.margins.left + pageWidth, y)
    .lineWidth(2)
    .strokeColor(colors.sky)
    .stroke()
    .restore();
  doc.y = y + 12;
}

function sectionHeader(title) {
  doc.moveDown(0.6);
  doc
    .fontSize(font.h2)
    .fillColor(colors.sky)
    .text(title, { width: pageWidth });
  doc.moveDown(0.2);

  const y = doc.y;
  doc
    .save()
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.margins.left + pageWidth, y)
    .lineWidth(1)
    .strokeColor(colors.border)
    .stroke()
    .restore();
  doc.y = y + 8;
}

function paragraph(text) {
  doc
    .fontSize(font.p)
    .fillColor(colors.ink)
    .text(text, { width: pageWidth, lineGap: 2 });
  doc.moveDown(0.3);
}

function bullet(title, text) {
  doc
    .fontSize(font.p)
    .fillColor(colors.blue)
    .text(`• ${title}: `, { continued: true })
    .fillColor(colors.ink)
    .text(text, { width: pageWidth, lineGap: 2 });
  doc.moveDown(0.2);
}

// Cover/Title
headerTitle('Padel ELO Manager — Guida all\'Uso');
paragraph('Manuale operativo completo per l\'organizzazione di serate, tornei singoli, tornei a tappe, tornei a squadre, gestione giocatori e classifiche ELO.');

// Section 1: Accesso
sectionHeader('1. Accesso e Multi-Workspace');
paragraph('Padel ELO Manager utilizza un sistema di autenticazione basato su codice numerico a 6 cifre con isolamento completo dei dati per circolo/workspace.');
bullet('Splash Screen', 'Inserisci il codice a 6 cifre fornito dall\'amministratore per accedere immediatamente.');
bullet('Persistenza', 'La sessione viene mantenuta nel browser tramite token JWT sicuro.');

// Section 2: Giocatori
sectionHeader('2. Gestione Giocatori e Livello Playtomic');
paragraph('Ogni giocatore possiede un profilo con rating ELO dinamico ed equivalenza automatica con la scala Playtomic.');
bullet('Aggiunta / Modifica', 'Inserisci Nome, Cognome, Posizione preferita (Destra, Sinistra, Entrambe) ed ELO iniziale (default 1500).');
bullet('Conversione Playtomic', 'L\'app calcola ed aggiorna automaticamente il livello Playtomic equivalente in base all\'ELO.');
bullet('Profilo Giocatore', 'Accesso al grafico andamento ELO, storico compagni/avversari frequenti e registro di tutte le giornate giocate.');

// Section 3: Sorteggi & Creazione Tornei
sectionHeader('3. Sorteggi e Modalità di Torneo');
paragraph('Dalla sezione Sorteggi è possibile avviare 4 flussi guidati di configurazione:');
bullet('Multi Giornata', 'Tornei su più tappe con classifica cumulativa.');
bullet('Torneo a Squadre', 'Sfida tra team con partite di coppia e classifica a punti squadra.');
bullet('Torneo Singolo', 'Evento a coppie in una singola serata.');
bullet('Nuova Giornata', 'Aggancio rapido di un nuovo evento ad una serie esistente.');

paragraph('Modalità di Formazione Coppie disponibili:');
bullet('Casuale', 'Abbinamenti totalmente estrapolati a sorte.');
bullet('Bilanciato', 'Accoppia giocatori con ELO alto e giocatori con ELO più basso per equilibrare il campo.');
bullet('Teste di Serie', 'Separa i giocatori top e li abbina ai restanti partecipanti.');
bullet('Manuale', 'Definizione libera delle coppie direttamente dall\'organizzatore.');

// Section 4: Formati di Gioco
sectionHeader('4. Formati di Gioco Supportati');
bullet('TorneOtto', 'Formato classico a 8 giocatori su 2 campi con rotazione completa dei compagni e dei campi.');
bullet('Americano', 'Rotazione individuale in cui ogni giocatore gioca con compagni diversi accumulando punti individuali.');
bullet('Beat the Box', 'Sfida a box con promosse e retrocessioni dinamiche al termine di ogni turno.');
bullet('Round Robin + Finali', 'Girone all\'italiana con fase finale a eliminazione diretta.');
bullet('Gironi + Fase Finale', 'Suddivisione in 2, 3 o 4 gironi con passaggi diretti e migliori terze per semifinali o quarti.');
bullet('Eliminazione Diretta', 'Tabellone ad albero con quarti, semifinali e finale.');

// Section 5: Inserimento Risultati ed ELO
sectionHeader('5. Risultati e Calcolo ELO');
paragraph('I risultati possono essere inseriti in tempo reale oppure a fine serata.');
bullet('Validazione', 'I pareggi 0-0 non vuoti sono gestiti correttamente per la fase a gironi, mentre sono vietati nelle fasi ad eliminazione.');
bullet('Aggiornamento ELO', 'Al salvataggio di ogni partita l\'algoritmo ricalcola le variazioni punti in base al rating atteso dei contendenti con K-factor unificato K=16.');

// Section 6: Reportistica e PDF
sectionHeader('6. Stampa e Reportistica PDF');
paragraph('L\'app genera report PDF ad alta definizione formattati per la stampa:');
bullet('Tabelloni di Gioco', 'Griglie di campo vuote o parziali pronte per essere stampate su carta prima dell\'evento.');
bullet('Classifica Generale', 'Riepilogo e storico giornate per la bacheca del circolo.');
bullet('Torneo a Squadre', 'Report di giornata e riepilogo generale del campionato.');

doc.end();
console.log('Generated:', outPath);
