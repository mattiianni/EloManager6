import { PhaseBlockId, PlayerMode } from '../types/customTournament.ts';

export interface FlowValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  distributionInfo?: string;
}

/**
 * Valida la sequenza di blocchi fase per un Torneo Personale in base a:
 * - phases: array ordinato di blocchi
 * - playerMode: 'pairs' o 'singles'
 * - numPartecipanti: numero di coppie (se pairs) o giocatori (se singles)
 * - numCampi: numero di campi da padel a disposizione
 */
export function validateCustomFlow(
  phases: PhaseBlockId[],
  playerMode: PlayerMode,
  numPartecipanti: number,
  numCampi: number
): FlowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!phases || phases.length === 0) {
    return {
      isValid: false,
      errors: ['Trascina almeno un blocco nella sequenza del torneo per continuare.'],
      warnings: [],
    };
  }

  // 1. Compatibilità modalità (Coppie Fisse vs Singolo)
  if (playerMode === 'pairs') {
    if (phases.includes('americano')) {
      errors.push("L'Americano è consentito solo con modalità Giocatori Singoli (no coppie fisse).");
    }
  } else {
    // singles
    if (phases.includes('girone')) {
      errors.push("Il Girone Italiano richiede la modalità Coppie Fisse.");
    }
    if (phases.includes('torneotto')) {
      errors.push("Il TorneOtto richiede la modalità Coppie Fisse.");
    }
    if (phases.includes('ritorno')) {
      errors.push("La fase di Ritorno è disponibile solo con Coppie Fisse.");
    }
  }

  // 2. Controllo ordine logico
  const semiIndex = phases.indexOf('semifinali');
  const finaliIndex = phases.indexOf('finali');
  const quartiIndex = phases.indexOf('quarti');
  const ritornoIndex = phases.indexOf('ritorno');
  const gironeIndex = phases.indexOf('girone');
  const boxIndex = phases.indexOf('box');
  const americanoIndex = phases.indexOf('americano');
  const torneottoIndex = phases.indexOf('torneotto');

  if (quartiIndex !== -1 && semiIndex !== -1 && quartiIndex > semiIndex) {
    errors.push('I Quarti di Finale devono essere posizionati prima delle Semifinali.');
  }

  if (semiIndex !== -1 && finaliIndex !== -1 && semiIndex > finaliIndex) {
    errors.push('Le Semifinali devono essere posizionate prima delle Finali.');
  }

  if (quartiIndex !== -1 && finaliIndex !== -1 && quartiIndex > finaliIndex) {
    errors.push('I Quarti di Finale devono essere posizionati prima delle Finali.');
  }

  if (ritornoIndex !== -1) {
    if (gironeIndex === -1 && torneottoIndex === -1) {
      errors.push('Il Ritorno può essere inserito solo dopo un Girone Italiano o TorneOtto.');
    } else {
      const parentIndex = gironeIndex !== -1 ? gironeIndex : torneottoIndex;
      if (ritornoIndex < parentIndex) {
        errors.push('La fase di Ritorno deve trovarsi dopo il Girone iniziale.');
      }
    }
  }

  // Controllo fasi a eliminazione / playoff senza fase preliminare
  const hasRankingPhase = phases.some(p => ['girone', 'torneotto', 'box', 'americano'].includes(p));
  if ((quartiIndex !== -1 || semiIndex !== -1 || finaliIndex !== -1) && !hasRankingPhase) {
    warnings.push('Il torneo è a eliminazione diretta pura (nessuna fase preliminare a gironi/box/americano).');
  }

  // 3. Regole sui numeri partecipanti
  if (numPartecipanti > 0) {
    // Quarti di finale: almeno 8 coppie (se pairs) o 16 giocatori (se singles)
    if (quartiIndex !== -1) {
      const minRequired = playerMode === 'pairs' ? 8 : 16;
      if (numPartecipanti < minRequired) {
        errors.push(`Per creare i Quarti di Finale hai bisogno di almeno ${minRequired} ${playerMode === 'pairs' ? 'coppie' : 'giocatori'}. Attuali: ${numPartecipanti}.`);
      }
    }

    // Semifinali: almeno 4 coppie (se pairs) o 8 giocatori (se singles)
    if (semiIndex !== -1 && quartiIndex === -1) {
      const minRequired = playerMode === 'pairs' ? 4 : 8;
      if (numPartecipanti < minRequired) {
        errors.push(`Per creare le Semifinali hai bisogno di almeno ${minRequired} ${playerMode === 'pairs' ? 'coppie' : 'giocatori'}. Attuali: ${numPartecipanti}.`);
      }
    }

    // Finali dirette: almeno 2 coppie o 4 giocatori
    if (finaliIndex !== -1 && semiIndex === -1 && quartiIndex === -1 && !hasRankingPhase) {
      const minRequired = playerMode === 'pairs' ? 2 : 4;
      if (numPartecipanti < minRequired) {
        errors.push(`Per creare la Finale diretta hai bisogno di almeno ${minRequired} ${playerMode === 'pairs' ? 'coppie' : 'giocatori'}. Attuali: ${numPartecipanti}.`);
      }
    }

    // Girone Italiano: almeno 4 coppie
    if (phases.includes('girone') && playerMode === 'pairs') {
      if (numPartecipanti < 4) {
        errors.push(`Il Girone Italiano richiede almeno 4 coppie. Attuali: ${numPartecipanti}.`);
      }
    }

    // TorneOtto: esattamente 4 coppie
    if (phases.includes('torneotto')) {
      if (numPartecipanti !== 4) {
        errors.push(`Il TorneOtto prevede esattamente 4 coppie. Attualmente ne hai selezionate ${numPartecipanti}.`);
      }
    }

    // Americano: almeno 6 giocatori
    if (phases.includes('americano')) {
      if (numPartecipanti < 6) {
        errors.push(`L'Americano richiede almeno 6 giocatori (attuali: ${numPartecipanti}).`);
      }
    }

    // Box Singolo: 4 o 5 giocatori per campo (con 5, 1 riposa per turno)
    if (phases.includes('box') && playerMode === 'singles') {
      const fields = Math.max(1, numCampi || 1);
      const minPlayers = fields * 4;
      const maxPlayers = fields * 5;

      if (numPartecipanti < 4) {
        errors.push('Il Box singolo richiede almeno 4 giocatori.');
      } else if (numPartecipanti < minPlayers || numPartecipanti > maxPlayers) {
        errors.push(`Con ${fields} ${fields === 1 ? 'campo' : 'campi'} a disposizione, il Box singolo supporta tra ${minPlayers} e ${maxPlayers} giocatori (4 o 5 per campo con 1 a riposo nei box da 5). Attuali: ${numPartecipanti}.`);
      }
    }

    // Box Coppie: ogni box deve avere SOLO 3 o 4 coppie
    if (phases.includes('box') && playerMode === 'pairs') {
      const fields = Math.max(1, numCampi || 1);
      const minPairs = fields * 3;
      const maxPairs = fields * 4;

      if (numPartecipanti < 3) {
        errors.push('Il Box a coppie richiede almeno 3 coppie.');
      } else if (numPartecipanti < minPairs || numPartecipanti > maxPairs) {
        errors.push(`Con ${fields} ${fields === 1 ? 'campo' : 'campi'} a disposizione, il Box a coppie supporta tra ${minPairs} e ${maxPairs} coppie (3 o 4 coppie per campo). Attuali: ${numPartecipanti}.`);
      }
    }
  }

  // 4. Calcolo info distribuzione per i campi
  let distributionInfo = '';
  if (numPartecipanti > 0 && numCampi > 0) {
    if (phases.includes('box')) {
      const fields = Math.max(1, numCampi);
      const base = Math.floor(numPartecipanti / fields);
      const remainder = numPartecipanti % fields;
      const dist = Array.from({ length: fields }, (_, i) => base + (i < remainder ? 1 : 0));

      if (playerMode === 'singles') {
        distributionInfo = `Distribuzione: ${dist.map(c => `${c} giocatori${c === 5 ? ' (1 riposa a turno)' : ''}`).join(', ')} su ${fields} ${fields === 1 ? 'campo' : 'campi'}.`;
      } else {
        // Pairs: distribuisci coppie sui campi
        distributionInfo = `Distribuzione: ${dist.map(c => `${c} coppie`).join(', ')} su ${fields} ${fields === 1 ? 'campo' : 'campi'}.`;
      }
    } else if (phases.includes('americano')) {
      const activePerRound = Math.min(numPartecipanti, numCampi * 4);
      const benched = numPartecipanti - Math.floor(activePerRound / 4) * 4;
      distributionInfo = `Americano: ${Math.floor(activePerRound / 4)} partite in contemporanea (${benched > 0 ? `${benched} a riposo per turno` : 'nessun riposo'}).`;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    distributionInfo: distributionInfo || undefined,
  };
}
