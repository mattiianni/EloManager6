import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
const APP_VERSION = pkg.version;
const APP_MONTH = 'Nov 2026';

const outDir = path.resolve(process.cwd(), 'docs');
const outPath = path.join(outDir, `Guida_Uso_v${APP_VERSION}.pdf`);

fs.mkdirSync(outDir, { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 48, left: 48, right: 48, bottom: 48 },
  info: {
    Title: `Guida all'Uso - Padel ELO Manager (v${APP_VERSION})`,
    Author: 'Mattia Ianniello',
    Subject: 'Istruzioni e manuale utente - Padel ELO Manager',
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
paragraph('Manuale operativo per organizzare serate, tornei singoli, tornei a tappe e tornei a squadre, gestire i giocatori e consultare classifiche e statistiche ELO.');

// 1. Accesso, Home, navigazione
sectionHeader('1. Accesso, Home e navigazione');
paragraph('Padel ELO Manager usa un codice di accesso a 6 cifre. Ogni codice porta nel workspace di un circolo: i dati di ogni circolo sono separati da quelli degli altri.');
bullet('Accesso', 'Apri l\'app e inserisci il codice a 6 cifre ricevuto dall\'amministratore. La sessione resta attiva sul dispositivo; se un codice scade o viene disattivato, l\'app ti chiede di inserirne uno nuovo.');
bullet('Home (Panoramica)', 'Riassume la situazione del circolo: azioni rapide per iniziare un nuovo sorteggio o inserire una giornata, i primi 5 giocatori della classifica, l\'ultima giornata completata e le ultime partite giocate.');
bullet('Su smartphone', 'Usi la barra in basso: Home, Tornei, Classifiche, Giocatori e Stats.');
bullet('Su computer e tablet', 'Usi il menu laterale, che comprende anche Risultati, Sorteggi, Statistiche e, se hai i privilegi, Admin.');
bullet('Tema', 'Puoi passare dal tema chiaro a quello scuro con l\'interruttore in alto.');
bullet('Installazione', 'Puoi aggiungere l\'app alla schermata Home del telefono (da Safari su iPhone e iPad, dal browser su Android) e usarla come una normale app.');

// 2. Giocatori
sectionHeader('2. Giocatori, profili e livello Playtomic');
paragraph('Ogni giocatore ha un profilo con rating ELO e livello Playtomic equivalente. ELO e livello Playtomic sono collegati: se modifichi uno dei due, l\'altro si aggiorna subito.');
bullet('Aggiunta e modifica', 'Inserisci nome, cognome, posizione in campo (Sinistra, Destra o Indifferente) ed ELO iniziale (di default 1500). Puoi anche eliminare un giocatore.');
bullet('Giocatore Esistente Trovato', 'Se aggiungi un giocatore con un nome simile a uno già presente, l\'app ti chiede se collegare l\'inserimento al giocatore esistente oppure crearne uno nuovo, così eviti i doppioni.');
bullet('Profilo giocatore', 'Mostra il grafico dell\'andamento ELO, i compagni e gli avversari più frequenti e lo storico delle giornate.');
paragraph('Il pulsante di stampa dei profili offre tre opzioni:');
bullet('Tutti i Giocatori', 'Stampa l\'intero archivio.');
bullet('Giocatori Singolo Torneo', 'Scegli un torneo dal menu a tendina: vengono stampati solo i giocatori con almeno una partita con punteggio registrato in quel torneo. Statistiche e grafico ELO (Start, E1, E2...) sono riferiti solo a quel torneo. L\'ELO mostrato è l\'ELO del torneo (1500 più il delta ottenuto nel torneo, come in Classifiche), non l\'ELO generale.');
bullet('Scegli Giocatori', 'Selezioni a mano i giocatori da stampare.');
paragraph('Ogni giocatore occupa una pagina del PDF.');

// 3. Sorteggi
sectionHeader('3. Sorteggi: cosa vuoi organizzare oggi');
paragraph('Nella sezione Sorteggi un percorso guidato propone cinque flussi:');
bullet('Multi Giornata', 'Torneo a coppie su più tappe, con classifica cumulativa.');
bullet('Torneo a Squadre', 'Sfide tra squadre numerate.');
bullet('Torneo Singolo', 'Evento a coppie o a giocatori singoli in un solo appuntamento, con scelta anticipata del formato.');
bullet('Nuova Giornata', 'Aggancia una nuova giornata a un torneo già attivo.');
bullet('Crea Torneo Personale', 'Componi il torneo con il drag and drop scegliendo le fasi: Box, Americano, Gironi, TorneOtto, Quarti, Semifinali e Finali.');
paragraph('In qualsiasi momento puoi premere "← Torna indietro" per tornare alla schermata iniziale. Su smartphone il pulsante per proseguire è fissato in basso.');
paragraph('In alto puoi scegliere tra Coppie Fisse e Giocatori Singoli:');
bullet('Coppie Fisse', 'Selezioni i partecipanti, scegli come formare le coppie e confermi.');
bullet('Giocatori Singoli', 'Il Messicano richiede un multiplo di 4 (8, 12, 16, 20 o 24 giocatori); gli altri formati accettano 4, 5, 6, 7, 8 o più giocatori. L\'app propone solo i formati adatti: Messicano, Americano, Box (Beat the Box singoli, con teste di serie secondo l\'ELO), Torneo Libero (scegli tu i quattro giocatori di ogni partita) e Crea Torneo Personale.');
paragraph('Modalità di formazione delle coppie:');
bullet('Casuale', 'Abbinamenti decisi dal sorteggio.');
bullet('Bilanciato', 'Accoppia un giocatore forte con uno meno forte (metodo a serpentina sull\'ELO).');
bullet('Teste di serie', 'Separa i giocatori più forti e li abbina agli altri.');
bullet('Manuale', 'Scegli tu le coppie.');

// 4. Creazione
sectionHeader('4. Creazione del torneo');
paragraph('Dopo il sorteggio: scegli il formato, decidi se creare un nuovo torneo o aggiungere una giornata a una serie esistente, imposta data e circolo e controlla il calendario. Ogni partita è una scheda a tutta larghezza, con la Squadra A a sinistra, la Squadra B a destra, il badge VS al centro e i campi del punteggio sotto; i nomi dei compagni stanno su righe separate. Puoi inserire subito i risultati oppure salvare il calendario per compilarli più tardi (se il formato lo permette).');
paragraph('Il PDF del calendario si può stampare prima di giocare, in bianco, da far compilare a mano. Poi inserisci i punteggi nell\'app. I dati vengono salvati subito: puoi salvare anche una partita alla volta e riprendere il torneo in un secondo momento da Risultati.');

// 5. Formati
sectionHeader('5. Formati disponibili (10 formati più Match Singolo)');
bullet('Match Singolo', 'Una sola partita tra due coppie.');
bullet('TorneOtto 30\'', 'Formato a 8 giocatori su 2 campi, con rotazione di compagni e campi.');
bullet('Round Robin + Finali', 'Girone all\'italiana con gestione dei campi, andata e ritorno e riposi equi. La fase finale può essere solo girone, solo finale, oppure semifinali + finali.');
bullet('Americano', 'Rotazione individuale a punti, con rotazione continua su tutti i campi.');
bullet('Messicano', 'Coppie mobili per 8, 12, 16, 20 o 24 giocatori (vedi sotto).');
bullet('Beat the Box', 'I partecipanti sono divisi in box, con fasi finali tra i migliori.');
bullet('Gironi + Fase Finale', '2, 3 o 4 gironi, poi quarti o semifinali.');
bullet('Eliminazione Diretta (TPRA)', 'Tabellone ad albero.');
bullet('Torneo Libero', 'Accoppiamenti liberi.');
bullet('Torneo Personale', 'Fasi componibili a piacere.');
bullet('Torneo a Squadre', 'Campionato tra squadre, con Round Robin (vedi sezione 6).');
paragraph('Torneo Messicano: è un torneo a coppie mobili. Nel Turno 1 scegli come distribuire i giocatori sui campi: teste di serie (Seeded), bilanciato (serpentina), casuale (Normal). A turno completo premi Procedi: l\'app calcola il turno successivo in base alla classifica provvisoria e lo salva in automatico; finché il turno in corso non è completo il pulsante resta disattivato e i turni successivi mostrano segnaposto del tipo [1° Class.] & [4° Class.] vs [2° Class.] & [3° Class.]. I campi sono sempre da 4 giocatori. Il Campo 1 è il Top Court (posizioni 1-4), i campi intermedi sono i Mid Courts e l\'ultimo è il Flop Court. L\'app evita di rimettere insieme compagni già avuti; se non è possibile, usa l\'accoppiamento di merito (1° + 4° contro 2° + 3°). Può essere un evento a sé o una tappa di una serie. Nell\'ultimo turno il pulsante diventa Concludi Torneo e calcola classifica finale ed ELO. Puoi interrompere in qualsiasi momento e riprendere da Risultati dal turno in cui eri arrivato.');

// 6. Torneo a Squadre
sectionHeader('6. Torneo a Squadre (Round Robin)');
paragraph('Il Torneo a Squadre non segue il percorso dei tornei a coppie. In Tornei avvia "Nuovo torneo / Nuova giornata", scegli "Torneo a Squadre" nella pagina Sorteggi e inserisci nome, circolo, numero di squadre e giocatori per squadra (valori iniziali, modificabili in seguito). Poi, nel blocco "Gestione torneo", premi "+ Completa configurazione": imposta le opzioni (Round Robin, fase finale, tipo di punteggio, partite per giornata) e inserisci nome e giocatori di ogni squadra. Il pulsante arancione "Completa configurazione" si attiva solo quando i dati minimi sono completi.');
paragraph('Con "+ Inserisci giornata" crei la singola giornata: scegli la data e la sfida squadra contro squadra (le combinazioni già giocate sono escluse) e inserisci i giocatori delle 3 o 5 partite della serata (ogni giocatore gioca al massimo una partita a sera). Poi puoi salvare, stampare, inserire i risultati e chiudere la giornata.');
bullet('Limiti attuali', 'Per ora è selezionabile solo il Round Robin. Le 5 partite per giornata richiedono almeno 8 giocatori per squadra. Quando esistono dei risultati, alcune opzioni non sono più modificabili.');
bullet('Finali e riepilogo', 'A girone completato, "+ Inserisci giornata" diventa "+ Inserisci Finali". A fase finale completata il pulsante diventa "Riepilogo": il PDF di riepilogo include in fondo anche statistiche e classifica individuale dei giocatori.');

// 7. Risultati e Bypass
sectionHeader('7. Risultati e Bypass / Modifica delle fasi finali');
paragraph('In Risultati puoi aprire un torneo, modificare i set, salvare i risultati e stampare il report. Nei tornei a più fasi, se modifichi una fase iniziale già conclusa, l\'app elimina semifinali e finali e le rigenera in modo coerente (reset a cascata).');
paragraph('Se il referto cartaceo contiene un errore e le coppie che hanno giocato semifinali o finali non coincidono con quelle calcolate, in tutte le fasi finali calcolate (Beat the Box, Gironi + Fase Finale, Round Robin + Finali, Torneo Personale) trovi in alto a destra il pulsante rosso "Bypass / Modifica". La procedura ha tre passaggi:');
bullet('Passaggio 1', 'Premi "Bypass / Modifica": compare l\'avviso "Stai per modificare la fase finale del torneo. L\'azione è irreversibile. Vuoi proseguire?".');
bullet('Passaggio 2', 'Premi "Sì, procedi": ogni giocatore delle coppie diventa un menu a tendina.');
bullet('Passaggio 3', 'Scegli le coppie reali e premi "Conferma Nuove Coppie".');
paragraph('Regole di sicurezza: un giocatore già scelto in uno slot non è selezionabile negli altri; si possono scegliere solo i giocatori che hanno partecipato al torneo; le coppie devono essere complete e senza duplicati; i punteggi già inseriti restano; l\'ELO viene calcolato sulle coppie scese in campo davvero.');

// 8. Classifiche e Statistiche
sectionHeader('8. Classifiche e Statistiche');
bullet('Classifiche', 'Classifica globale del circolo con podio, filtro per serie di tornei, soglia di presenze (i giocatori sotto la soglia sono mostrati in fondo), andamento dell\'ELO e stampa della classifica e del grafico ELO.');
bullet('Statistiche', 'Filtro per serie di tornei, migliori giocatori, premi, serie di vittorie, sorprese (upset) e picco ELO. La forma recente è indicata con V (vittoria) e P (persa). Per i tornei a squadre c\'è una sezione dedicata e il PDF delle statistiche è separato dal report del torneo.');
bullet('Tornei', 'Vedi le serie raggruppate, apri i risultati, stampi il torneo, ne modifichi data, nome e circolo, lo elimini oppure inserisci una nuova giornata in una serie esistente.');

// 9. ELO
sectionHeader('9. Come funziona l\'ELO');
bullet('Punteggio iniziale', 'Ogni giocatore parte da 1500 punti, oppure dal valore che imposti tu.');
bullet('Fattore K', 'In tutti i formati l\'app usa lo stesso fattore K = 16. In ogni partita i punti guadagnati da una coppia sono esattamente quelli persi dall\'altra (somma zero).');
bullet('Forza dell\'avversario', 'Battere una coppia più forte vale più punti; battere una coppia più debole ne vale pochi.');
bullet('Aggiornamento', 'Nei tornei l\'ELO si aggiorna al completamento del torneo, non a ogni singola partita. Se correggi un risultato e completi di nuovo il torneo, l\'ELO viene ricalcolato correttamente.');
bullet('Playtomic', 'Il livello Playtomic equivalente si ricava automaticamente dall\'ELO.');

// 10. Stampa
sectionHeader('10. Stampa e PDF');
paragraph('Ogni formato ha il proprio PDF, in due versioni: in bianco (da stampare prima del torneo e far compilare a mano, con caselle punteggio bianche e campi squadre vuoti pronti per la scrittura a penna) e completo (con risultati e classifiche). Tutti i PDF hanno lo stesso stile e lo stesso piè di pagina.');
bullet('Computer e Android', 'L\'app apre il documento in una nuova scheda. In alto trovi la barra con "Stampa / Salva PDF" e "Chiudi"; la barra non compare nella stampa.');
bullet('iPhone e iPad (Safari o iPad app)', 'Toccando l\'icona di stampa si apre direttamente la schermata nativa AirPrint di iOS con le miniature delle pagine e la scelta della stampante.');
bullet('iPhone PWA (schermata Home)', 'Genera il documento PDF in memoria e apre istantaneamente il foglio nativo iOS con l\'azione Stampa (AirPrint) e Salva su File, mantenendo l\'app al 100% a tutto schermo.');
bullet('Profili giocatore', 'Una pagina per ogni giocatore.');
paragraph('Se il documento non si apre, controlla che il browser non blocchi i popup per questo sito.');

// 11. Admin
sectionHeader('11. Admin');
paragraph('Se il codice ha privilegi di amministratore, in Admin trovi quattro sezioni:');
bullet('Workspace', 'Crei i circoli, li attivi o disattivi e puoi entrare in un circolo (impersonificazione). Nella stessa pagina trovi "Ricalcola ELO" (allinea i valori correnti allo storico, per tutti i circoli) e il ricalcolo completo: sono operazioni delicate, usale solo se sai che servono.');
bullet('Accessi', 'Generi e disattivi i codici di accesso, con scadenza facoltativa. Quando disponibile, vedi il codice in chiaro.');
bullet('Invia dati', 'Copi un torneo da un circolo a un altro. L\'operazione è atomica: o viene copiato tutto, oppure niente.');
bullet('Audit Log', 'Consulti gli ultimi accessi e le operazioni registrate.');

doc.end();
console.log('Generated:', outPath);
