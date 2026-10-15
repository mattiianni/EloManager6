import { Match, Tournament, Player, TournamentType } from '../../types';
import { TournamentPrinter } from '../types';
import { calculateRoundRobinStandings } from './engine';
import { formatScoreBoxes, MANROPE_PRINT_STYLESHEET, printableTeamName, escapeHtml, PDF_ICONS } from '../../services/printService';
import { normalizeTournamentRounds } from '../../utils/tournamentRounds';
import { getCanonicalTeamKey } from '../../utils/matchIdentity';
import { APP_MONTH, APP_VERSION } from '../../constants';

export const generateRoundRobinPdfHtml = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
): string => {
    const displayName = displayNameOverride || tournament.name;
    const safeDisplayName = escapeHtml(displayName);
    const safeClubName = escapeHtml(tournament.club);

    const standings = calculateRoundRobinStandings(matches, tournament, getPlayerById);

    // Filter matches by explicit phase
    const quarterfinalMatches = matches.filter(m => m.phase === 'quarterfinal');
    const semifinalMatches = matches.filter(m => m.phase === 'semifinal');
    const finalMatches = matches.filter(m => m.phase === 'final_1_2' || m.phase === 'final_3_4');

    const playoffMatches = [...quarterfinalMatches, ...semifinalMatches, ...finalMatches];
    const playoffMatchIds = new Set(playoffMatches.map(m => m.id));
    const roundRobinMatches = matches.filter(m => !playoffMatchIds.has(m.id));

    const fieldsCount = tournament.roundRobinFields || 2;
    const isHomeAway = tournament.roundRobinHomeAway || false;

    // Build Round Robin HTML
    const roundsMap = new Map<number, Match[]>();
    roundRobinMatches.forEach((m, idx) => {
        const r = m.roundNumber ?? (fieldsCount > 0 ? Math.floor(idx / fieldsCount) + 1 : 1);
        if (!roundsMap.has(r)) roundsMap.set(r, []);
        roundsMap.get(r)!.push(m);
    });

    const allTeamsMap = new Map<string, [Player, Player]>();
    roundRobinMatches.forEach(m => {
        const k1 = getCanonicalTeamKey(m.team1);
        const k2 = getCanonicalTeamKey(m.team2);
        if (!allTeamsMap.has(k1)) {
            allTeamsMap.set(k1, [
                getPlayerById(m.team1[0]) || ({ id: m.team1[0], name: 'Giocatore', surname: '1' } as Player),
                getPlayerById(m.team1[1]) || ({ id: m.team1[1], name: 'Giocatore', surname: '2' } as Player)
            ]);
        }
        if (!allTeamsMap.has(k2)) {
            allTeamsMap.set(k2, [
                getPlayerById(m.team2[0]) || ({ id: m.team2[0], name: 'Giocatore', surname: '1' } as Player),
                getPlayerById(m.team2[1]) || ({ id: m.team2[1], name: 'Giocatore', surname: '2' } as Player)
            ]);
        }
    });

    const allPlayersIds = new Set(matches.flatMap(m => [...m.team1, ...m.team2]));

    const normalizedRounds = normalizeTournamentRounds(roundRobinMatches, tournament.type, {
        fields: fieldsCount,
        homeAway: isHomeAway,
        participantIds: Array.from(allPlayersIds),
    });
    const orderedRoundRobinMatches = normalizedRounds.flatMap(round => round.matches.map(item => item.match));
    const normalizedRoundByNumber = new Map(normalizedRounds.map(round => [round.roundNumber, round]));
    const courtByMatch = new Map(
        normalizedRounds.flatMap(round => round.matches.map(item => [item.match, item.courtNumber] as const)),
    );

    const generateMatchRow = (match: Match, courtLabel: string = '-') => {
        const t1p1 = getPlayerById(match.team1[0]);
        const t1p2 = getPlayerById(match.team1[1]);
        const t2p1 = getPlayerById(match.team2[0]);
        const t2p2 = getPlayerById(match.team2[1]);

        const team1Name = printableTeamName([t1p1, t1p2]);
        const team2Name = printableTeamName([t2p1, t2p2], ' / ');
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

    const generateEmptyMatchRow = (courtLabel: string = '-') => `
        <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
            <td style="width: 10%; text-align: center; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3;">${courtLabel}</td>
            <td style="width: 32%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3;">
                <span style="border: 1px solid #ccc; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%;">&nbsp;</span>
            </td>
            <td style="width: 26%; text-align: center; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3;">
                <span style="border: 1px solid #ccc; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
            </td>
            <td style="width: 32%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3;">
                <span style="border: 1px solid #ccc; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%;">&nbsp;</span>
            </td>
        </tr>
    `;

    let currentRound = 0;
    const roundRobinContentHtml = orderedRoundRobinMatches.map((match, index) => {
        const r = match.roundNumber ?? (fieldsCount > 0 ? Math.floor(index / fieldsCount) + 1 : 1);
        let rowHtml = '';

        if (r !== currentRound) {
            currentRound = r;
            const roundTitle = normalizedRoundByNumber.get(currentRound)?.label || `Turno ${currentRound}`;
            const matchesInRound = roundsMap.get(currentRound) || [];
            let restingText = '';

            const teamsInRoundKeys = new Set(matchesInRound.flatMap(m => [getCanonicalTeamKey(m.team1), getCanonicalTeamKey(m.team2)]));
            const restingTeams: string[] = [];
            allTeamsMap.forEach((pair, key) => {
                if (!teamsInRoundKeys.has(key)) {
                    restingTeams.push(`${pair[0].name} ${pair[0].surname} & ${pair[1].name} ${pair[1].surname}`);
                }
            });
            if (restingTeams.length > 0) {
                restingText = `<div style="font-size: 11px; color: #b45309; background: #fffbeb; padding: 4px; margin-top: 4px; border-radius: 4px; font-weight: normal;"><b>Coppie a Riposo:</b> ${restingTeams.join(' | ')}</div>`;
            }

            rowHtml += `
                <tr class="round-header" style="page-break-inside: avoid; break-inside: avoid;">
                    <td colspan="4" style="background: #f8fafc; font-weight: bold; padding: 6px 8px; font-size: 12px; border-left: 3px solid #0055D4; color: #0f172a; border: 1px solid #e2e8f0;">
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

    const playoffType = (tournament.roundRobinPlayoffType || tournament.round_robin_playoff_type) || 'finals_only';

    // Playoff Sections (Quarti, Semifinali, Finali)
    let displayQuarterfinalMatches = [...quarterfinalMatches];
    if (displayQuarterfinalMatches.length === 0 && playoffType === 'quarterfinals') {
        displayQuarterfinalMatches = [
            { id: 'ph-q1', date: '', team1: ['', ''], team2: ['', ''], sets: [], winner: null },
            { id: 'ph-q2', date: '', team1: ['', ''], team2: ['', ''], sets: [], winner: null },
            { id: 'ph-q3', date: '', team1: ['', ''], team2: ['', ''], sets: [], winner: null },
            { id: 'ph-q4', date: '', team1: ['', ''], team2: ['', ''], sets: [], winner: null },
        ];
    }

    let quartersHtml = '';
    if (displayQuarterfinalMatches.length > 0) {
        const qLabels = ['Quarto 1 (1° vs 8°)', 'Quarto 2 (2° vs 7°)', 'Quarto 3 (3° vs 6°)', 'Quarto 4 (4° vs 5°)'];
        quartersHtml = `
            <div class="section-block" style="margin-top: 16px; page-break-inside: avoid; break-inside: avoid;">
                <div style="font-size: 13px; font-weight: 700; margin: 16px 0 8px 0; padding: 6px 10px; background: #faf5ff; border-left: 4px solid #7c3aed; color: #581c87; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.zap} QUARTI DI FINALE
                </div>
                <table style="margin-bottom: 6px; width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden;">
                    <tbody>
                        ${displayQuarterfinalMatches.map((match, idx) => {
                            const title = (!match.team1 || !match.team1[0]) ? qLabels[idx] : `Quarto ${idx + 1}`;
                            const matchRowHtml = (!match.team1 || !match.team1[0])
                                ? generateEmptyMatchRow(`Campo ${(idx % fieldsCount) + 1}`)
                                : generateMatchRow(match, `Campo ${(idx % fieldsCount) + 1}`);
                            return `
                                <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                                    <td colspan="4" style="background: #f8fafc; padding: 5px 8px; font-size: 11px; font-weight: bold; height: 24px; color: #334155; border: 1px solid #e2e8f0;">
                                        ${title}
                                    </td>
                                </tr>
                                ${matchRowHtml}
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    let displaySemifinalMatches = [...semifinalMatches];
    if (displaySemifinalMatches.length === 0 && (playoffType === 'quarterfinals' || playoffType === 'semifinals')) {
        displaySemifinalMatches = [
            { id: 'ph-sf1', date: '', team1: ['', ''], team2: ['', ''], sets: [], winner: null },
            { id: 'ph-sf2', date: '', team1: ['', ''], team2: ['', ''], sets: [], winner: null },
        ];
    }

    let semifinalsHtml = '';
    if (displaySemifinalMatches.length > 0) {
        const sfLabels = playoffType === 'quarterfinals'
            ? ['Semifinale 1 (Vinc. Q1 vs Vinc. Q4)', 'Semifinale 2 (Vinc. Q2 vs Vinc. Q3)']
            : ['Semifinale 1 (1° vs 4°)', 'Semifinale 2 (2° vs 3°)'];

        semifinalsHtml = `
            <div class="section-block" style="margin-top: 16px; page-break-inside: avoid; break-inside: avoid;">
                <div style="font-size: 13px; font-weight: 700; margin: 16px 0 8px 0; padding: 6px 10px; background: #eff6ff; border-left: 4px solid #0055D4; color: #1e3a8a; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.trophy} SEMIFINALI
                </div>
                <table style="margin-bottom: 6px; width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden;">
                    <tbody>
                        ${displaySemifinalMatches.map((match, idx) => {
                            const title = (!match.team1 || !match.team1[0]) ? sfLabels[idx] : `Semifinale ${idx + 1}`;
                            const matchRowHtml = (!match.team1 || !match.team1[0])
                                ? generateEmptyMatchRow(`Campo ${(idx % fieldsCount) + 1}`)
                                : generateMatchRow(match, `Campo ${(idx % fieldsCount) + 1}`);
                            return `
                                <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                                    <td colspan="4" style="background: #f8fafc; padding: 5px 8px; font-size: 11px; font-weight: bold; height: 24px; color: #334155; border: 1px solid #e2e8f0;">
                                        ${title}
                                    </td>
                                </tr>
                                ${matchRowHtml}
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    let displayFinalMatches = [...finalMatches];
    if (displayFinalMatches.length === 0 && playoffType !== 'no_finals') {
        displayFinalMatches = [
            { id: 'ph-f1', date: '', team1: ['', ''], team2: ['', ''], sets: [], winner: null },
            { id: 'ph-f2', date: '', team1: ['', ''], team2: ['', ''], sets: [], winner: null },
        ];
    }

    let finalsHtml = '';
    if (displayFinalMatches.length > 0) {
        const finalsRowsHtml = displayFinalMatches.map((match, idx) => {
            let matchTitle = '';
            let headerBg = '#f8fafc';
            let headerColor = '#1e293b';

            if (idx === 0) {
                matchTitle = 'FINALE 1° - 2° POSTO';
                headerBg = '#fef3c7';
                headerColor = '#92400e';
            } else if (idx === 1) {
                matchTitle = 'FINALINA 3° - 4° POSTO';
                headerBg = '#ffedd5';
                headerColor = '#9a3412';
            } else {
                matchTitle = `FINALE ${idx + 1}`;
                headerBg = '#f8fafc';
                headerColor = '#1e293b';
            }

            const matchRowHtml = (!match.team1 || !match.team1[0])
                ? generateEmptyMatchRow(`Campo ${(idx % fieldsCount) + 1}`)
                : generateMatchRow(match, `Campo ${(idx % fieldsCount) + 1}`);

            return `
                <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                    <td colspan="4" style="background: ${headerBg}; padding: 5px 6px; font-size: 11px; font-weight: bold; text-align: center; height: 24px; color: ${headerColor}; border: 1px solid #e2e8f0;">
                        ${matchTitle}
                    </td>
                </tr>
                ${matchRowHtml}
            `;
        }).join('');

        finalsHtml = `
            <div class="section-block" style="margin-top: 16px; page-break-inside: avoid; break-inside: avoid;">
                <div style="font-size: 13px; font-weight: 700; margin: 16px 0 8px 0; padding: 6px 10px; background: #fffbeb; border-left: 4px solid #d97706; color: #92400e; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.trophy} FINALI
                </div>
                <table style="margin-bottom: 6px; width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden;">
                    <tbody>
                        ${finalsRowsHtml}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Determine Final Podium & Standings
    let finalOrderedStandings = [...standings];
    const finale1_2 = finalMatches.find(m => m.phase === 'final_1_2');
    const finale3_4 = finalMatches.find(m => m.phase === 'final_3_4');

    if (finale1_2 && finale1_2.winner) {
        const winnerTeam = finale1_2.winner === 'team1' ? getCanonicalTeamKey(finale1_2.team1) : getCanonicalTeamKey(finale1_2.team2);
        const loserTeam = finale1_2.winner === 'team1' ? getCanonicalTeamKey(finale1_2.team2) : getCanonicalTeamKey(finale1_2.team1);

        let winner3_4Team = '';
        let loser3_4Team = '';
        if (finale3_4 && finale3_4.winner) {
            winner3_4Team = finale3_4.winner === 'team1' ? getCanonicalTeamKey(finale3_4.team1) : getCanonicalTeamKey(finale3_4.team2);
            loser3_4Team = finale3_4.winner === 'team1' ? getCanonicalTeamKey(finale3_4.team2) : getCanonicalTeamKey(finale3_4.team1);
        }

        const podiumTeamsMap = new Map<string, number>();
        podiumTeamsMap.set(winnerTeam, 1);
        podiumTeamsMap.set(loserTeam, 2);
        if (winner3_4Team) podiumTeamsMap.set(winner3_4Team, 3);
        if (loser3_4Team) podiumTeamsMap.set(loser3_4Team, 4);

        finalOrderedStandings.sort((a, b) => {
            const keyA = getCanonicalTeamKey(a.pair.map(p => p.id));
            const keyB = getCanonicalTeamKey(b.pair.map(p => p.id));
            const rankA = podiumTeamsMap.get(keyA) || 100;
            const rankB = podiumTeamsMap.get(keyB) || 100;
            if (rankA !== rankB) return rankA - rankB;
            return b.points - a.points || b.gameDifference - a.gameDifference;
        });
    }

    // Round Robin Phase Standings HTML (before playoffs)
    const roundRobinStandingsRowsHtml = standings.map((entry, idx) => `
        <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
            <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: bold; color: #64748b; border: 1px solid #e2e8f0;">${idx + 1}°</td>
            <td style="width: 55%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: 600; border: 1px solid #e2e8f0;">${escapeHtml(entry.pair[0].name)} ${escapeHtml(entry.pair[0].surname)} &amp; ${escapeHtml(entry.pair[1].name)} ${escapeHtml(entry.pair[1].surname)}</td>
            <td style="text-align: center; width: 15%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: bold; color: #0055D4; border: 1px solid #e2e8f0;">${entry.points}</td>
            <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; border: 1px solid #e2e8f0;">${entry.gamesWon}</td>
            <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; border: 1px solid #e2e8f0;">${entry.gamesLost}</td>
            <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; border: 1px solid #e2e8f0;">${entry.gameDifference >= 0 ? '+' : ''}${entry.gameDifference}</td>
        </tr>
    `).join('');

    // Standings HTML at the end of report (Podium / Definitive)
    const standingsRowsHtml = finalOrderedStandings.map((entry, idx) => {
        let rankBadge = `<span style="color: #64748b; font-weight: 700;">${idx + 1}°</span>`;
        if (idx === 0) {
            rankBadge = `<span style="background: #fef3c7; color: #92400e; padding: 2px 7px; border-radius: 9999px; font-weight: 800; border: 1px solid #fde68a;">1°</span>`;
        } else if (idx === 1) {
            rankBadge = `<span style="background: #f1f5f9; color: #475569; padding: 2px 7px; border-radius: 9999px; font-weight: 800; border: 1px solid #cbd5e1;">2°</span>`;
        } else if (idx === 2) {
            rankBadge = `<span style="background: #ffedd5; color: #9a3412; padding: 2px 7px; border-radius: 9999px; font-weight: 800; border: 1px solid #fed7aa;">3°</span>`;
        }

        return `
            <tr style="height: 24px; page-break-inside: avoid; break-inside: avoid;">
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; border: 1px solid #e2e8f0;">${rankBadge}</td>
                <td style="width: 55%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: 600; border: 1px solid #e2e8f0;">${escapeHtml(entry.pair[0].name)} ${escapeHtml(entry.pair[0].surname)} &amp; ${escapeHtml(entry.pair[1].name)} ${escapeHtml(entry.pair[1].surname)}</td>
                <td style="text-align: center; width: 15%; font-size: 11px; padding: 5px 6px; height: 24px; font-weight: bold; color: #0055D4; border: 1px solid #e2e8f0;">${entry.points}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; border: 1px solid #e2e8f0;">${entry.gamesWon}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; border: 1px solid #e2e8f0;">${entry.gamesLost}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px; border: 1px solid #e2e8f0;">${entry.gameDifference >= 0 ? '+' : ''}${entry.gameDifference}</td>
            </tr>
        `;
    }).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${safeDisplayName} - Riepilogo Torneo</title>
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
                <h2>${safeClubName} • Round Robin + Finali</h2>
                <div style="display: inline-flex; align-items: center; gap: 4px; color: #0055D4; font-size: 12px; font-weight: 700; background: #eff6ff; padding: 3px 10px; border-radius: 9999px; border: 1px solid #bfdbfe; margin-top: 4px;">
                    ${PDF_ICONS.calendar} ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}
                </div>
            </div>

            <div style="border-bottom: 2px solid #0055D4; margin: 10px 0 20px 0;"></div>

            <div class="section-block">
                <div style="font-size: 13px; font-weight: 700; margin: 14px 0 8px 0; padding: 6px 10px; background: #eff6ff; border-left: 4px solid #0055D4; color: #1e3a8a; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.box} PARTITE ROUND ROBIN
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 10%;">Campo</th>
                            <th style="width: 32%;">Squadra A</th>
                            <th style="text-align: center; width: 26%;">Risultato</th>
                            <th style="width: 32%;">Squadra B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${roundRobinContentHtml}
                    </tbody>
                </table>
            </div>

            <!-- CLASSIFICA FASE ROUND ROBIN -->
            <div class="section-block" style="margin-top: 16px;">
                <div style="font-size: 13px; font-weight: 700; margin: 14px 0 8px 0; padding: 6px 10px; background: #eff6ff; border-left: 4px solid #0055D4; color: #1e3a8a; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.standings} CLASSIFICA ROUND ROBIN
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 10%;">Pos</th>
                            <th style="width: 55%;">Squadra</th>
                            <th style="text-align: center; width: 15%;">Punti</th>
                            <th style="text-align: center; width: 10%;">GV</th>
                            <th style="text-align: center; width: 10%;">GP</th>
                            <th style="text-align: center; width: 10%;">Diff</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${roundRobinStandingsRowsHtml}
                    </tbody>
                </table>
            </div>

            ${quartersHtml}
            ${semifinalsHtml}
            ${finalsHtml}

            <!-- CLASSIFICA DEFINITIVA ALWAYS AT THE VERY END -->
            <div class="section-block" style="margin-top: 20px;">
                <div style="font-size: 13px; font-weight: 700; margin: 14px 0 8px 0; padding: 6px 10px; background: #ecfdf5; border-left: 4px solid #059669; color: #065f46; border-radius: 4px; display: flex; align-items: center;">
                    ${PDF_ICONS.medal} CLASSIFICA DEFINITIVA
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="text-align: center; width: 10%;">Pos</th>
                            <th style="width: 55%;">Squadra</th>
                            <th style="text-align: center; width: 15%;">Punti</th>
                            <th style="text-align: center; width: 10%;">GV</th>
                            <th style="text-align: center; width: 10%;">GP</th>
                            <th style="text-align: center; width: 10%;">Diff</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${standingsRowsHtml}
                    </tbody>
                </table>
            </div>

            <div class="footer">
                <div style="text-align: left;">
                    Padel ELO Manager • Round Robin + Finali • Versione ${APP_VERSION} © Mattia Ianniello, ${APP_MONTH}
                </div>
                <div style="text-align: right; font-size: 8px;">
                    Generato: ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
                </div>
            </div>
        </body>
        </html>
    `;
};

export const RoundRobinPrinter: TournamentPrinter = {
    type: TournamentType.RoundRobinFinali,
    generatePdfHtml: generateRoundRobinPdfHtml
};
