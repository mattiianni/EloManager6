import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const APP_VERSION = '6.7.19';
const APP_MONTH = 'Ago 2026';

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
    "Questa guida spiega, in modo discorsivo e passo-passo, come usare il formato “Torneo a Squadre” nell’app. I nomi dei pulsanti e delle sezioni sono quelli reali dell’interfaccia: Tornei, Sorteggi, Statistiche, e i pulsanti “+ Completa configurazione”, “+ Inserisci giornata” e “+ Inserisci Finali”."
  );
  muted("Stato attuale: sono disponibili Round Robin, Andata/Ritorno ed Eliminazione Diretta, con calendario, giornate, fasi finali e stampe dedicate.");
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

sectionHeading('1) Creazione del torneo (shell)');
paragraph("La creazione del torneo a squadre parte dalla pagina “Tornei”. In questa fase crei il “contenitore” del torneo (il torneo root) con i dati di base. Non stai ancora creando una giornata.");
steps([
  "Apri il menu laterale e vai su “Tornei”.",
  "Premi il bottone “Nuovo Torneo / Nuova Giornata”.",
  "Si apre la pagina “Sorteggi”. Nella sezione “Opzioni sorteggio coppie”, seleziona “Torneo a squadre”.",
  "Inserisci: “Nome torneo”, “Circolo”, “Numero squadre” e “Giocatori per squadra”.",
  "Conferma: l’app crea subito il torneo e lo rende visibile in “Tornei”.",
]);
callout({
  title: 'Nota',
  accent: colors.sky,
  text: "Se ti serve modificare questi dati dopo, potrai farlo più avanti con il tasto “Modifica” nella pagina di configurazione, ma alcune opzioni vengono bloccate dopo l’inserimento dei primi risultati.",
});

sectionHeading('2) Completa configurazione');
paragraph("Appena creato il torneo, in “Tornei” vedrai un blocco “Gestione torneo” con il pulsante arancione “+ Completa configurazione”. Questa fase serve a inserire tutto ciò che manca (squadre, giocatori e impostazioni). Finché non la completi, non ha senso inserire giornate perché mancano dati fondamentali.");
steps([
  "Vai su “Tornei” e apri il torneo appena creato.",
  "Nel riquadro “Gestione torneo”, premi “+ Completa configurazione”.",
  "Imposta le opzioni: “Tipo torneo” (Round Robin, Andata/Ritorno o Eliminazione Diretta), “Fase finale”, “Tipo punteggio” e “Partite per giornata”.",
  "Per ogni squadra: premi “Modifica”, inserisci “Nome squadra” e poi i giocatori (nome e cognome affiancati).",
  "In basso a destra premi “Completa configurazione” (si attiva solo quando i requisiti minimi sono rispettati).",
]);
callout({
  title: 'Vincoli e buone pratiche',
  accent: colors.orange,
  text: "• 5 partite per giornata richiede almeno 8 giocatori per squadra.\n• Evita di inserire risultati finché una squadra non ha i giocatori necessari: l’app blocca l’inserimento se mancano dati.\n• Dopo i primi risultati alcune opzioni possono diventare non modificabili per coerenza dei dati.",
});

sectionHeading('3) Inserisci giornata (calendario e risultati)');
paragraph("Una volta completata la configurazione, il pulsante verde “+ Inserisci giornata” diventa il tuo punto di ingresso operativo. Qui crei la giornata (anche fuori ordine: puoi giocare una giornata “più avanti” per esigenze organizzative).");
steps([
  "Da “Tornei”, nel torneo a squadre, premi “+ Inserisci giornata”.",
  "Seleziona la data.",
  "Scegli la sfida “Squadra A vs Squadra B” dai menu a discesa. Se una sfida è già stata giocata, non potrai reinserirla.",
  "Inserisci le partite della serata (3 o 5). Per ogni partita scegli i giocatori: un giocatore può giocare una sola volta nella stessa serata.",
  "Salva. Se vuoi puoi anche stampare subito o passare direttamente all’inserimento risultati.",
]);

sectionHeading('4) Dopo il salvataggio');
paragraph("Dopo aver salvato una giornata, la vedrai comparire sotto il riquadro “Gestione torneo”. Le giornate sono ordinate dalla meno recente alla più recente per facilitare la ricerca.");
callout({
  title: 'Cosa vedi in Tornei',
  accent: colors.blue,
  text: "Nel riquadro “Gestione torneo” trovi: tipo torneo, circolo e la riga “Partite completate: X su Y”. Ogni giornata mostra data e la pill “Giornata X di Y” accanto alla data (non accanto al nome delle squadre, per evitare problemi con nomi lunghi).",
});

sectionHeading('5) Stampe PDF');
paragraph("Il Torneo a squadre ha stampe dedicate. È importante stamparle dal posto giusto, perché report torneo e statistiche sono documenti diversi.");
steps([
  "Da “Tornei” (Gestione torneo) puoi stampare il report generale del torneo (classifica + riepilogo giornate).",
  "Dalla singola giornata puoi stampare il report della giornata (con risultati se inseriti).",
  "Da “Statistiche” puoi stampare il PDF Statistiche: è separato dal report torneo e contiene dati aggregati (top 5, classifica giocatori, ecc.).",
]);

sectionHeading('6) Statistiche (bozza iniziale)');
paragraph("Nella pagina “Statistiche” puoi selezionare il Torneo a squadre dal filtro. Troverai una sezione dedicata che calcola (sui match completati) le prime statistiche essenziali.");
callout({
  title: 'Cosa include (per ora)',
  accent: colors.blue,
  text: "• Informazioni generali: periodo, games disputati, media games/partita.\n• Giocatori: Top 5 e classifica completa.\n• Altre info: più games vinti, più games persi, miglior coppia (win rate), streak - serie vittorie.\n\nLa stampa “Statistiche” genera un PDF con le stesse sezioni.",
});

sectionHeading('Checklist rapida');
paragraph("Se qualcosa non torna, in genere dipende da configurazione incompleta o da vincoli (es. 5 partite senza abbastanza giocatori). Usa questa checklist per ricontrollare i passaggi:");
steps([
  'Ho creato il torneo a squadre (root) con nome e circolo corretti.',
  'Ho completato la configurazione e nominato tutte le squadre.',
  'Ho inserito i giocatori per ogni squadra (almeno quelli necessari per le partite previste).',
  'Ho scelto 3 o 5 partite per giornata (5 solo con >= 8 giocatori per squadra).',
  'Inserisco le giornate senza duplicare la stessa sfida.',
  'Stampo “Report torneo” da Tornei e “Statistiche” dalla pagina Statistiche.',
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
