import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';
import { calculateAmericanoStandings } from './engine';
import { formatScoreBoxes, MANROPE_PRINT_STYLESHEET, printableTeamName, escapeHtml, PDF_ICONS } from '../../services/printService';
import { normalizeTournamentRounds } from '../../utils/tournamentRounds';
import { APP_MONTH, APP_VERSION } from '../../constants';

export const generateAmericanoPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    const displayName = displayNameOverride || tournament.name;
    const safeDisplayName = escapeHtml(displayName);
    const safeClubName = escapeHtml(tournament.club);

    const standings = calculateAmericanoStandings(matches, tournament, getPlayerById);
    const fieldsCount = tournament.americanoFields || 2;
    const americanoScoringType = tournament.americanoScoringType || 'games-diff';

    const allPlayersIds = new Set(matches.flatMap(m => [...m.team1, ...m.team2]));
    const normalizedRounds = normalizeTournamentRounds(matches, tournament.type, {
        fields: fieldsCount,
        homeAway: false,
        participantIds: Array.from(allPlayersIds),
    });

    const orderedMatches = normalizedRounds.flatMap(round => round.matches.map(item => item.match));
    const normalizedRoundByNumber = new Map(normalizedRounds.map(round => [round.roundNumber, round]));
    const courtByMatch = new Map(
        normalizedRounds.flatMap(round => round.matches.map(item => [item.match, item.courtNumber] as const)),
    );

    const roundsMap = new Map<number, Match[]>();
    matches.forEach((m, idx) => {
        const r = m.roundNumber || (fieldsCount > 0 ? Math.floor(idx / fieldsCount) + 1 : 1);
        if (!roundsMap.has(r)) roundsMap.set(r, []);
        roundsMap.get(r)!.push(m);
    });

    const generateMatchRow = (match: Match, courtLabel: string = '-') => {
        const t1p1 = getPlayerById(match.team1[0]);
        const t1p2 = getPlayerById(match.team1[1]);
        const t2p1 = getPlayerById(match.team2[0]);
        const t2p2 = getPlayerById(match.team2[1]);

        const team1Name = printableTeamName([t1p1, t1p2]);
        const team2Name = printableTeamName([t2p1, t2p2]);
        const scoreHtml = formatScoreBoxes(match.sets, false);

        return `
            <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3;">${courtLabel}</td>
                <td style="width: 32%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; overflow-wrap: anywhere;">${team1Name}</td>
                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                    ${scoreHtml}
                </td>
                <td style="width: 32%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; overflow-wrap: anywhere;">${team2Name}</td>
            </tr>
        `;
    };

    let currentRound = 0;
    const matchesContentHtml = orderedMatches.map((match, index) => {
        const r = match.roundNumber || (fieldsCount > 0 ? Math.floor(index / fieldsCount) + 1 : 1);
        let rowHtml = '';

        if (r !== currentRound) {
            currentRound = r;
            const roundTitle = normalizedRoundByNumber.get(currentRound)?.label || `Turno ${currentRound}`;
            const matchesInRound = roundsMap.get(currentRound) || [];

            const playersInRound = new Set(matchesInRound.flatMap(m => [...m.team1, ...m.team2]));
            const allPlayers = Array.from(allPlayersIds).map(id => getPlayerById(id)).filter(Boolean) as Player[];
            const restingPlayers = allPlayers.filter(p => !playersInRound.has(p.id));

            let restingText = '';
            if (restingPlayers.length > 0) {
                restingText = `<div style="font-size: 11px; color: #b45309; background: #fffbeb; padding: 4px; margin-top: 4px; border-radius: 4px; font-weight: normal;"><b>Giocatori a Riposo:</b> ${restingPlayers.map(p => `${p.name} ${p.surname}`).join(', ')}</div>`;
            }

            rowHtml += `
                <tr class="round-header" style="page-break-inside: avoid; break-inside: avoid;">
                    <td colspan="4" style="background: #f3f4f6; font-weight: bold; padding: 6px; font-size: 13px;">
                        ${roundTitle}
                        ${restingText}
                    </td>
                </tr>
            `;
        }

        const courtNumber = courtByMatch.get(match) || ((index % fieldsCount) + 1);
        rowHtml += generateMatchRow(match, `Campo ${courtNumber}`);
        return rowHtml;
    }).join('');

    // Standings HTML
    const standingsRowsHtml = standings.map((entry, idx) => {
        const player = (entry as any).team?.[0] || entry.player || entry.pair?.[0];
        const playerName = player ? `${escapeHtml(player.name)} ${escapeHtml(player.surname)}` : 'Giocatore';
        let rankBadge = `<span style="font-weight: 700; color: #64748b;">${idx + 1}°</span>`;
        if (idx === 0) {
            rankBadge = `<span style="background: #fef3c7; color: #92400e; padding: 2px 7px; border-radius: 9999px; font-weight: 800; border: 1px solid #fde68a;">1°</span>`;
        } else if (idx === 1) {
            rankBadge = `<span style="background: #f1f5f9; color: #475569; padding: 2px 7px; border-radius: 9999px; font-weight: 800; border: 1px solid #cbd5e1;">2°</span>`;
        } else if (idx === 2) {
            rankBadge = `<span style="background: #ffedd5; color: #9a3412; padding: 2px 7px; border-radius: 9999px; font-weight: 800; border: 1px solid #fed7aa;">3°</span>`;
        }

        if (americanoScoringType === 'points') {
            return `
                <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                    <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${rankBadge}</td>
                    <td style="width: 60%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: 600;">${playerName}</td>
                    <td style="text-align: center; width: 15%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: bold; color: #0055D4;">${entry.gamesWon}</td>
                    <td style="text-align: center; width: 15%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.gamesLost}</td>
                </tr>
            `;
        }

        return `
            <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${rankBadge}</td>
                <td style="width: 50%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: 600;">${playerName}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: bold; color: #0055D4;">${entry.points}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.gamesWon}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.gamesLost}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.gameDifference >= 0 ? '+' : ''}${entry.gameDifference}</td>
            </tr>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${safeDisplayName} - Riepilogo Torneo Americano</title>
            <link rel="stylesheet" href="${MANROPE_PRINT_STYLESHEET}">
            <style>
                @page { size: A4; margin: 12mm 10mm; }
                body { font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 0; }
                h1 { font-size: 22px; margin: 0 0 4px 0; color: #0f172a; font-weight: 800; }
                h2 { font-size: 14px; margin: 0 0 3px 0; color: #64748b; font-weight: 500; }
                table { width: 100%; border-collapse: collapse; margin: 6px 0 12px 0; font-size: 11px; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
                th { background-color: #f8fafc; color: #1e293b; padding: 6px 8px; font-weight: 700; font-size: 11px; height: 24px; text-align: left; border: 1px solid #e2e8f0; }
                td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; font-size: 11px; height: 24px; border: 1px solid #e2e8f0; }
                tr { height: 24px; }
                tr:nth-child(even) { background-color: #f8fafc; }
                .section-block { page-break-inside: avoid; break-inside: avoid; }
                .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8.5px; color: #64748b; display: flex; justify-content: space-between; align-items: center; }
            </style>
        </head>
        <body>
            <div style="text-align: center; margin-bottom: 14px;">
                <h1>${PDF_ICONS.trophy} ${safeDisplayName}</h1>
                <h2>${safeClubName} • Torneo Americano</h2>
                <div style="display: inline-flex; align-items: center; gap: 4px; color: #0055D4; font-size: 12px; font-weight: 700; background: #eff6ff; padding: 3px 10px; border-radius: 9999px; border: 1px solid #bfdbfe; margin-top: 4px;">
                    ${PDF_ICONS.calendar} ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}
                </div>
            </div>

            <div style="border-bottom: 2px solid #0055D4; margin: 10px 0 20px 0;"></div>

            <div class="section-block">
                <div style="font-size: 13px; font-weight: 700; margin: 14px 0 8px 0; padding: 6px 10px; background: #eff6ff; border-left: 4px solid #0055D4; color: #1e3a8a; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.box} PARTITE E RISULTATI
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 10%;">Campo</th>
                            <th style="width: 32%;">Coppia A</th>
                            <th style="text-align: center; width: 26%;">Risultato</th>
                            <th style="width: 32%;">Coppia B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${matchesContentHtml}
                    </tbody>
                </table>
            </div>

            <!-- CLASSIFICA DEFINITIVA INDIVIDUALE ALWAYS AT THE VERY END -->
            <div class="section-block" style="margin-top: 20px;">
                <div style="font-size: 13px; font-weight: 700; margin: 14px 0 8px 0; padding: 6px 10px; background: #ecfdf5; border-left: 4px solid #059669; color: #065f46; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.medal} CLASSIFICA DEFINITIVA INDIVIDUALE
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 10%;">Pos</th>
                            <th style="width: ${americanoScoringType === 'points' ? '60%' : '50%'};">Giocatore</th>
                            ${americanoScoringType === 'points' ? `
                                <th style="text-align: center; width: 15%;">Punti Fatti</th>
                                <th style="text-align: center; width: 15%;">Punti Subiti</th>
                            ` : `
                                <th style="text-align: center; width: 10%;">Punti</th>
                                <th style="text-align: center; width: 10%;">GV</th>
                                <th style="text-align: center; width: 10%;">GP</th>
                                <th style="text-align: center; width: 10%;">Diff</th>
                            `}
                        </tr>
                    </thead>
                    <tbody>
                        ${standingsRowsHtml}
                    </tbody>
                </table>
            </div>

            <div class="footer">
                <div style="text-align: left;">
                    Padel ELO Manager • Torneo Americano • Versione ${APP_VERSION} © Mattia Ianniello, ${APP_MONTH}
                </div>
                <div style="text-align: right; font-size: 8px;">
                    Generato: ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
                </div>
            </div>
        </body>
        </html>
    `;
};

export const AmericanoPrinter: TournamentPrinter = {
    type: TournamentType.Americano,
    generatePdfHtml: generateAmericanoPdfHtml
};
