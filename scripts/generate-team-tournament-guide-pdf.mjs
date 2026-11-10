import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
const APP_VERSION = pkg.version;
const APP_MONTH = 'Nov 2026';

const outDir = path.resolve(process.cwd(), 'docs');
const outPath = path.join(outDir, `Guida_Torneo_a_Squadre_v${APP_VERSION}.pdf`);

fs.mkdirSync(outDir, { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 48, left: 48, right: 48, bottom: 48 },
  info: {
    Title: `Guida Torneo a Squadre (v${APP_VERSION})`,
    Author: 'Mattia Ianniello',
    Subject: 'Istruzioni utilizzo Torneo a Squadre - Padel ELO Manager',
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
  orange: '#f97316',
  border: '#e2e8f0',
  card: '#f8fafc',
};

const font = {
  h1: 22,
  h2: 14,
  h3: 12,
  p: 10.5,
  s: 9,
};

const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

function hr(yGap = 10) {
  doc.moveDown(0.4);
  const y = doc.y + yGap / 2;
  doc
    .save()
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.margins.left + pageWidth, y)
    .lineWidth(2)
    .strokeColor(colors.blue)
    .stroke()
    .restore();
  doc.y = y + yGap;
}

function paragraph(text, opts = {}) {
  doc
    .fontSize(font.p)
    .fillColor(colors.ink)
    .text(text, { width: pageWidth, lineGap: 2, ...opts });
  doc.moveDown(0.35);
}

function muted(text, opts = {}) {
  doc
    .fontSize(font.p)
    .fillColor(colors.muted)
    .text(text, { width: pageWidth, lineGap: 2, ...opts });
  doc.moveDown(0.25);
  doc.fillColor(colors.ink);
}

function titleBlock() {
  doc
    .fontSize(font.h1)
    .fillColor(colors.ink)
    .text('Guida: Torneo a Squadre', { align: 'center' });

  doc
    .moveDown(0.2)
    .fontSize(font.h2)
    .fillColor(colors.muted)
    .text(`Padel ELO Manager · Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}`, { align: 'center' });

  doc.moveDown(0.55);
  hr(12);

  paragraph(
    "Questa guida spiega, passo dopo passo, come usare il formato “Torneo a Squadre” nell’app. I nomi dei pulsanti e delle sezioni sono quelli reali dell’interfaccia: Tornei, Sorteggi, Statistiche, e i pulsanti “+ Completa configurazione”, “+ Inserisci giornata” e “+ Inserisci Finali”."
  );
  muted("Stato attuale: per ora è selezionabile solo il Round Robin (gli altri formati verranno attivati in seguito); sono disponibili calendario, giornate, fasi finali e stampe dedicate.");
}

function sectionHeading(text) {
  doc.moveDown(0.8);
  doc.fontSize(font.h2).fillColor(colors.ink).text(text);
  doc.moveDown(0.25);
}

function callout({ title, accent, text }) {
  const x = doc.page.margins.left;
  const y = doc.y;
  const pad = 12;
  const headerH = 22;

  const cardW = pageWidth;
  const startY = y;

  // Measure height roughly based on text length.
  const approxLines = Math.max(3, Math.ceil((text.length || 0) / 95));
  const bodyH = Math.max(52, approxLines * 14 + 18);
  const cardH = headerH + bodyH;

  // Page break safety
  if (startY + cardH > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }

  const cy = doc.y;
  doc
    .save()
    .roundedRect(x, cy, cardW, cardH, 12)
    .fillColor(colors.card)
    .fill()
    .restore();

  doc
    .save()
    .roundedRect(x, cy, cardW, headerH, 12)
    .fillColor(accent)
    .fill()
    .restore();

  doc
    .fontSize(font.h3)
    .fillColor('#ffffff')
    .text(title, x + pad, cy + 6, { width: cardW - pad * 2 });

  doc.fontSize(font.p).fillColor(colors.ink);
  doc.text(text, x + pad, cy + headerH + 10, { width: cardW - pad * 2, lineGap: 2 });

  doc.y = cy + cardH + 14;
}

function steps(items) {
  doc.fontSize(font.p).fillColor(colors.ink);
  items.forEach((t, idx) => {
    doc.text(`${idx + 1}. ${t}`, { width: pageWidth, lineGap: 2 });
    doc.moveDown(0.15);
  });
  doc.moveDown(0.35);
}

titleBlock();

sectionHeading('1) Creazione del torneo');
paragraph("La creazione del Torneo a Squadre parte dalla pagina “Tornei”. In questa fase crei il “contenitore” del torneo con i dati di base. Non stai ancora creando una giornata.");
steps([
  "Apri il menu laterale e vai su “Tornei”.",
  "Premi il bottone “Nuovo torneo / Nuova giornata”.",
  "Si apre la pagina “Sorteggi”. Tra le opzioni di sorteggio, scegli “Torneo a Squadre”.",
  "Inserisci: nome del torneo, circolo, numero di squadre e giocatori per squadra (valori iniziali, modificabili in seguito).",
  "Conferma: l’app crea subito il torneo e lo mostra in “Tornei”.",
]);
callout({
  title: 'Nota',
  accent: colors.sky,
  text: "Se devi modificare questi dati, potrai farlo più avanti con il tasto “Modifica” nella pagina di configurazione, ma alcune opzioni non sono più modificabili dopo l’inserimento dei primi risultati.",
});

sectionHeading('2) Completa configurazione');
paragraph("Appena creato il torneo, in “Tornei” vedrai un blocco “Gestione torneo” con il pulsante arancione “+ Completa configurazione”. Questa fase serve a inserire tutto ciò che manca (squadre, giocatori e impostazioni). Finché non la completi non puoi inserire giornate, perché mancano dati fondamentali.");
steps([
  "Vai su “Tornei” e apri il torneo appena creato.",
  "Nel riquadro “Gestione torneo”, premi “+ Completa configurazione”.",
  "Imposta le opzioni: “Tipo torneo” (per ora solo Round Robin), “Fase finale”, “Tipo punteggio” e “Partite per giornata” (3 o 5).",
  "Per ogni squadra: premi “Modifica”, inserisci il nome della squadra e poi i giocatori (nome e cognome).",
  "Premi il pulsante arancione “Completa configurazione” (si attiva solo quando i dati minimi sono completi).",
]);
callout({
  title: 'Vincoli e buone pratiche',
  accent: colors.orange,
  text: "• 5 partite per giornata richiede almeno 8 giocatori per squadra.\n• Non inserire risultati finché una squadra non ha i giocatori necessari: l’app blocca l’inserimento se mancano dati.\n• Dopo i primi risultati alcune opzioni non sono più modificabili, per coerenza dei dati.",
});

sectionHeading('3) Inserisci giornata (calendario e risultati)');
paragraph("Una volta completata la configurazione, il pulsante “+ Inserisci giornata” diventa il punto di ingresso operativo. Qui crei la giornata (anche fuori ordine: puoi giocare una giornata “più avanti” per esigenze organizzative).");
steps([
  "Da “Tornei”, nel torneo a squadre, premi “+ Inserisci giornata”.",
  "Seleziona la data.",
  "Scegli la sfida “Squadra A vs Squadra B” dai menu a tendina. Le sfide già giocate sono escluse e non possono essere reinserite.",
  "Inserisci le partite della serata (3 o 5). Per ogni partita scegli i giocatori: ogni giocatore gioca al massimo una partita a sera.",
  "Salva. Se vuoi, puoi stampare subito o passare direttamente all’inserimento dei risultati.",
]);

sectionHeading('4) Dopo il salvataggio, finali e riepilogo');
paragraph("Dopo aver salvato una giornata, la vedrai comparire sotto il riquadro “Gestione torneo”. Le giornate sono ordinate dalla meno recente alla più recente. A girone completato, “+ Inserisci giornata” diventa “+ Inserisci Finali” e usa le partite finali già calcolate; a fase finale completata il pulsante diventa “Riepilogo” e apre la pagina di riepilogo.");
callout({
  title: 'Cosa vedi in Tornei',
  accent: colors.blue,
  text: "Nel riquadro “Gestione torneo” trovi: tipo torneo, circolo e la riga “Partite completate: X su Y”. Ogni giornata mostra data e la pill “Giornata X di Y” accanto alla data (non accanto al nome delle squadre, per evitare problemi con nomi lunghi).",
});

sectionHeading('5) Stampe PDF');
paragraph("Il Torneo a Squadre ha stampe dedicate. È importante stamparle dal posto giusto, perché report del torneo e statistiche sono documenti diversi. Su computer e Android il documento si apre in una nuova scheda con la barra “Stampa / Salva PDF”; su iPhone e iPad si apre direttamente il menu di stampa di iOS (AirPrint).");
steps([
  "Da “Tornei” (Gestione torneo) puoi stampare il report generale del torneo (classifica e riepilogo delle giornate). Il PDF di riepilogo include in fondo anche le statistiche e la classifica individuale dei giocatori.",
  "Dalla singola giornata puoi stampare il report della giornata (con risultati se inseriti).",
  "Da “Statistiche” puoi stampare il PDF delle statistiche: è separato dal report del torneo e contiene dati aggregati (primi 5 giocatori, classifica giocatori, ecc.).",
]);

sectionHeading('6) Statistiche');
paragraph("Nella pagina “Statistiche” puoi selezionare il Torneo a Squadre dal filtro. Troverai una sezione dedicata che calcola le statistiche essenziali sulle partite completate.");
callout({
  title: 'Cosa include',
  accent: colors.blue,
  text: "• Informazioni generali: periodo, games disputati, media games/partita.\n• Giocatori: primi 5 e classifica completa.\n• Altre info: più games vinti, più games persi, miglior coppia (win rate), serie di vittorie.\n\nLa stampa “Statistiche” genera un PDF con le stesse sezioni.",
});

sectionHeading('Checklist rapida');
paragraph("Se qualcosa non torna, in genere dipende da una configurazione incompleta o da un vincolo (ad esempio 5 partite senza abbastanza giocatori). Usa questa checklist per ricontrollare i passaggi:");
steps([
  'Ho creato il Torneo a Squadre con nome e circolo corretti.',
  'Ho completato la configurazione e nominato tutte le squadre.',
  'Ho inserito i giocatori per ogni squadra (almeno quelli necessari per le partite previste).',
  'Ho scelto 3 o 5 partite per giornata (5 solo con almeno 8 giocatori per squadra).',
  'Inserisco le giornate senza duplicare la stessa sfida.',
  'Stampo il report del torneo da “Tornei” e le statistiche dalla pagina “Statistiche”.',
]);

hr(14);
doc
  .fontSize(font.s)
  .fillColor(colors.muted)
  .text('Padel ELO Manager · Guida operativa (Torneo a Squadre)', { align: 'center' });

doc.end();

await new Promise((resolve, reject) => {
  stream.on('finish', resolve);
  stream.on('error', reject);
});

console.log(outPath);
