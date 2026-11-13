import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';
import { calculateMexicanStandings } from './jitEngine';
import {
    formatScoreBoxes,
    MANROPE_PRINT_STYLESHEET,
    printableTeamName,
    escapeHtml,
    PDF_ICONS,
    openPrintWindow,
    waitForPrintFontsScript
} from '../../services/printService';
import { APP_MONTH, APP_VERSION } from '../../constants';

export const MexicanPrinter: TournamentPrinter = {
    type: TournamentType.Mexican,
    generatePdfHtml: (
        tournament: Tournament,
        matches: Match[],
        getPlayerById: (id: string) => Player | undefined,
        displayNameOverride?: string
    ): string => {
        return generateMexicanPdfHtml(tournament, matches, getPlayerById, displayNameOverride, false);
    }
};

export const generateMexicanPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string,
    isBlank: boolean = false
): string => {
    const displayName = displayNameOverride || tournament.name;
    const safeDisplayName = escapeHtml(displayName);
    const safeClubName = escapeHtml(tournament.club || 'Circolo Padel');

    const fieldsCount = tournament.mexicanFields || tournament.americanoFields || (matches.length > 0 ? Math.max(...matches.map(m => m.courtNumber || m.groupNumber || 1)) : 2);
    const scoringType = tournament.mexicanScoringType || tournament.americanoScoringType || 'games-diff';

    // Raccoglie tutti i giocatori unici
    const allPlayerIds = new Set<string>();
    matches.forEach(m => {
        [...(m.team1 || []), ...(m.team2 || [])].forEach(id => {
            if (id) allPlayerIds.add(id);
        });
    });

    const allPlayers: Player[] = Array.from(allPlayerIds).map(id => {
        return getPlayerById(id) || ({
            id,
            name: 'Giocatore',
            surname: '',
            currentElo: 1500,
            initialElo: 1500
        } as Player);
    });

    const standings = calculateMexicanStandings(isBlank ? [] : matches, allPlayers, scoringType);

    // Raggruppa i match per turno
    const roundsMap = new Map<number, Match[]>();
    matches.forEach(m => {
        const r = m.roundNumber || 1;
        if (!roundsMap.has(r)) roundsMap.set(r, []);
        roundsMap.get(r)!.push(m);
    });

    // Tabellone in bianco: tutti i turni previsti, con segnaposto per quelli non ancora generati
    if (isBlank) {
        const plannedRounds = tournament.mexicanRounds || 0;
        const courts = Math.max(1, Math.floor(allPlayers.length / 4) || fieldsCount);
        for (let r = 1; r <= plannedRounds; r++) {
            if (roundsMap.has(r)) continue;
            roundsMap.set(r, Array.from({ length: courts }, (_, i) => ({
                id: `blank-r${r}-c${i + 1}`,
                date: tournament.date,
                team1: [] as unknown as [string, string],
                team2: [] as unknown as [string, string],
                sets: [],
                winner: null,
                roundNumber: r,
                courtNumber: i + 1,
            } as Match)));
        }
    }
    const sortedRounds = Array.from(roundsMap.keys()).sort((a, b) => a - b);

    const generateMatchRow = (match: Match) => {
        const court = match.courtNumber ?? match.groupNumber;
        const courtLabel = court ? `Campo ${court}` : '-';
        const hasScore = match.sets && match.sets.length > 0 && match.sets.some(s => (s.team1 || 0) > 0 || (s.team2 || 0) > 0);

        let team1Name: string;
        let team2Name: string;

        if (!match.team1?.[0] && !match.team2?.[0]) {
            if (isBlank) {
                team1Name = '&nbsp;';
                team2Name = '&nbsp;';
            } else {
                const cNum = court || 1;
                const topP1 = (cNum - 1) * 4 + 1;
                const topP2 = (cNum - 1) * 4 + 2;
                const topP3 = (cNum - 1) * 4 + 3;
                const topP4 = (cNum - 1) * 4 + 4;
                team1Name = `[${topP1}° Class.] & [${topP4}° Class.]`;
                team2Name = `[${topP2}° Class.] & [${topP3}° Class.]`;
            }
        } else {
            const t1p1 = getPlayerById(match.team1?.[0]);
            const t1p2 = getPlayerById(match.team1?.[1]);
            const t2p1 = getPlayerById(match.team2?.[0]);
            const t2p2 = getPlayerById(match.team2?.[1]);
            if (isBlank && (!t1p1 || !t1p2)) {
                team1Name = '&nbsp;';
            } else {
                team1Name = printableTeamName([t1p1, t1p2]);
            }
            if (isBlank && (!t2p1 || !t2p2)) {
                team2Name = '&nbsp;';
            } else {
                team2Name = printableTeamName([t2p1, t2p2]);
            }
        }

        const scoreHtml = isBlank || !hasScore
            ? `<span class="score-box-blank score-box" style="display: inline-block; width: 28px; height: 22px; line-height: 22px; border: 1.5px solid #cbd5e1; border-radius: 4px; background: #ffffff !important; background-color: #ffffff !important; color: transparent; text-align: center; vertical-align: middle;">&nbsp;</span> <span style="color: #94a3b8; font-weight: bold; margin: 0 4px;">-</span> <span class="score-box-blank score-box" style="display: inline-block; width: 28px; height: 22px; line-height: 22px; border: 1.5px solid #cbd5e1; border-radius: 4px; background: #ffffff !important; background-color: #ffffff !important; color: transparent; text-align: center; vertical-align: middle;">&nbsp;</span>`
            : formatScoreBoxes(match.sets, false);

        const isT1Winner = !isBlank && (match.winner === 'team1' || (!match.winner && hasScore && (match.sets[0]?.team1 || 0) > (match.sets[0]?.team2 || 0)));
        const isT2Winner = !isBlank && (match.winner === 'team2' || (!match.winner && hasScore && (match.sets[0]?.team2 || 0) > (match.sets[0]?.team1 || 0)));

        return `
            <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                <td style="text-align: center; width: 12%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3;">
                    <span style="display: inline-block; font-size: 9.5px; font-weight: 700; color: #0055D4; background: #eff6ff; padding: 2px 6px; border-radius: 4px; border: 1px solid #bfdbfe;">
                        ${courtLabel}
                    </span>
                </td>
                <td style="width: 32%; text-align: right; ${isT1Winner ? 'font-weight: 700; color: #0055D4;' : 'color: #334155;'} font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; overflow-wrap: anywhere;">
                    ${team1Name}
                </td>
                <td style="text-align: center; width: 24%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                    ${scoreHtml}
                </td>
                <td style="width: 32%; text-align: left; ${isT2Winner ? 'font-weight: 700; color: #0055D4;' : 'color: #334155;'} font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; overflow-wrap: anywhere;">
                    ${team2Name}
                </td>
            </tr>
        `;
    };

    let roundsHtml = '';
    sortedRounds.forEach(rNum => {
        const roundMatches = roundsMap.get(rNum) || [];
        const rows = roundMatches.map(m => generateMatchRow(m)).join('');

        roundsHtml += `
            <div style="margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid;">
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-bottom: none; border-radius: 6px 6px 0 0; padding: 6px 10px; font-weight: 700; font-size: 11.5px; color: #0f172a; display: flex; justify-content: space-between; align-items: center;">
                    <span>Turno ${rNum}</span>
                    <span style="font-size: 9.5px; font-weight: 600; color: #64748b; background: #ffffff; padding: 1px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                        ${roundMatches.length} ${roundMatches.length === 1 ? 'partita' : 'partite'}
                    </span>
                </div>
                <table style="margin: 0; border-radius: 0 0 6px 6px;">
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 12%;">Campo</th>
                            <th style="width: 32%; text-align: right;">Squadra A</th>
                            <th style="text-align: center; width: 24%;">Risultato</th>
                            <th style="width: 32%; text-align: left;">Squadra B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    });

    // Standings HTML
    const standingsRowsHtml = standings.map((entry, idx) => {
        const playerName = `${escapeHtml(entry.player.name)} ${escapeHtml(entry.player.surname)}`;
        let rankBadge = `<span style="font-weight: 700; color: #64748b;">${idx + 1}°</span>`;
        if (idx === 0) {
            rankBadge = `<span style="background: #fef3c7; color: #92400e; padding: 2px 7px; border-radius: 9999px; font-weight: 800; border: 1px solid #fde68a;">1°</span>`;
        } else if (idx === 1) {
            rankBadge = `<span style="background: #f1f5f9; color: #475569; padding: 2px 7px; border-radius: 9999px; font-weight: 800; border: 1px solid #cbd5e1;">2°</span>`;
        } else if (idx === 2) {
            rankBadge = `<span style="background: #ffedd5; color: #9a3412; padding: 2px 7px; border-radius: 9999px; font-weight: 800; border: 1px solid #fed7aa;">3°</span>`;
        }

        if (scoringType === 'points') {
            return `
                <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                    <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${rankBadge}</td>
                    <td style="width: 60%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: 600; overflow-wrap: anywhere;">${playerName}</td>
                    <td style="text-align: center; width: 15%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: bold; color: #0055D4;">${entry.gamesWon}</td>
                    <td style="text-align: center; width: 15%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.gamesLost}</td>
                </tr>
            `;
        }

        return `
            <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${rankBadge}</td>
                <td style="width: 50%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: 600; overflow-wrap: anywhere;">${playerName}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: bold; color: #0055D4;">${entry.points}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.gamesWon}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.gamesLost}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.gameDifference >= 0 ? '+' : ''}${entry.gameDifference}</td>
            </tr>
        `;
    }).join('');

    const formattedDate = new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.');

    return `
        <style>
            @page { size: A4; margin: 12mm 10mm; }
            table { width: 100%; border-collapse: collapse; margin: 6px 0 12px 0; font-size: 11px; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
            th { background-color: #f8fafc; color: #1e293b; padding: 6px 8px; font-weight: 700; font-size: 11px; height: 24px; text-align: left; border: 1px solid #e2e8f0; }
            td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; font-size: 11px; height: 24px; border: 1px solid #e2e8f0; }
            tr { height: 24px; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .score-box { display: inline-block; width: 22px; height: 20px; line-height: 20px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; font-size: 11px; background: #ffffff; }
            .score-box-blank { display: inline-block !important; width: 28px !important; height: 22px !important; line-height: 22px !important; border: 1.5px solid #cbd5e1 !important; border-radius: 4px !important; background: #ffffff !important; background-color: #ffffff !important; color: transparent !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8.5px; color: #64748b; display: flex; justify-content: space-between; align-items: center; }
        </style>
        <div class="print-page">
            <div style="text-align: center; margin-bottom: 14px;">
                <h1 style="font-size: 22px; margin: 0 0 4px 0; color: #0f172a; font-weight: 800;">${PDF_ICONS.trophy} ${safeDisplayName}</h1>
                <h2 style="font-size: 14px; margin: 0 0 3px 0; color: #64748b; font-weight: 500;">${safeClubName} • Torneo Messicano (JIT Coppie Mobili) • ${isBlank ? 'Tabellone Vuoto' : 'Riepilogo'}</h2>
                <div style="display: inline-flex; align-items: center; gap: 4px; color: #0055D4; font-size: 12px; font-weight: 700; background: #eff6ff; padding: 3px 10px; border-radius: 9999px; border: 1px solid #bfdbfe; margin-top: 4px;">
                    ${PDF_ICONS.calendar} Data: ${formattedDate}
                </div>
            </div>

            <div style="border-bottom: 2px solid #0055D4; margin: 10px 0 18px 0;"></div>

            <!-- PARTITE PER TURNO -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 13px; font-weight: 700; margin: 14px 0 8px 0; padding: 6px 10px; background: #eff6ff; border-left: 4px solid #0055D4; color: #1e3a8a; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.box} TURNI E PARTITE SUI CAMPI (${fieldsCount} ${fieldsCount === 1 ? 'CAMPO' : 'CAMPI'})
                </div>
                ${roundsHtml}
            </div>

            <!-- CLASSIFICA DEFINITIVA O PROVVISORIA INDIVIDUALE -->
            ${!isBlank ? `
            <div style="margin-top: 20px; page-break-inside: avoid; break-inside: avoid;">
                <div style="font-size: 13px; font-weight: 700; margin: 14px 0 8px 0; padding: 6px 10px; background: #ecfdf5; border-left: 4px solid #059669; color: #065f46; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.medal} CLASSIFICA INDIVIDUALE
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 10%;">Pos</th>
                            <th style="width: ${scoringType === 'points' ? '60%' : '50%'};">Giocatore</th>
                            ${scoringType === 'points' ? `
                                <th style="text-align: center; width: 15%;">Punti Fatti</th>
                                <th style="text-align: center; width: 15%;">Punti Subiti</th>
                            ` : `
                                <th style="text-align: center; width: 10%;">Punti</th>
                                <th style="text-align: center; width: 10%;">GV</th>
                                <th style="text-align: center; width: 10%;">GS</th>
                                <th style="text-align: center; width: 10%;">Diff</th>
                            `}
                        </tr>
                    </thead>
                    <tbody>
                        ${standingsRowsHtml}
                    </tbody>
                </table>
            </div>
            ` : ''}

            <!-- FOOTER APPLE HIG -->
            <div class="footer">
                <div>Padel ELO Manager • Torneo Messicano • Versione ${APP_VERSION} © Mattia Ianniello, ${APP_MONTH}</div>
                <div>Documento generato il ${new Date().toLocaleDateString('it-IT')} alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        </div>
    `;
};

export const printMexicanTournamentReport = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string,
    isBlank: boolean = false
) => {
    const html = generateMexicanPdfHtml(tournament, matches, getPlayerById, displayNameOverride, isBlank);
    const title = `${displayNameOverride || tournament.name} - Torneo Messicano`;
    return openPrintWindow(title, html);
};
