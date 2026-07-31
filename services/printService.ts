import { RankingEntry, Tournament, TournamentStandingEntry, Match, Player, TournamentType, EloHistoryEntry, TeamTournamentConfig, TeamTournamentTeam, TeamTournamentSchedule, TeamTournamentMatchday, TeamTournamentPlayerEntry, TeamTournamentFixture } from '../types.ts';
import { calculateTeamTournamentStandings, TeamTournamentStandingRow } from './teamTournamentService.ts';
import { getTournamentDisplayName } from '../utils/tournamentLabels.ts';
import { APP_MONTH, APP_VERSION } from '../constants.ts';
import { buildPlayerEloTimeline, formatLabel, sumPlayerEventEloDelta } from './eloEventsService.ts';
import { BracketNode, generateTpraBracket } from './tpraService.ts';
import { normalizeTournamentRounds } from '../utils/tournamentRounds.ts';
import { showHIGAlert } from '../utils/higDialogService.ts';
import { formatPlayerShortName } from '../utils/format.ts';

export const MANROPE_PRINT_STYLESHEET = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap';

export const escapeHtml = (value: unknown): string => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const printableTeamName = (
    players: Array<Pick<Player, 'name' | 'surname'> | undefined>,
    separator = ' & ',
): string => {
    if (players.some(player => !player)) return 'Da definire';
    const names = players.map(player => escapeHtml(`${player!.name || ''} ${player!.surname || ''}`.trim()));
    return names.every(Boolean) ? names.join(escapeHtml(separator)) : 'Da definire';
};

const normalizedMatchPhase = (match: Match): string => String((match as Match & { phase?: string }).phase || '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');

export const partitionMatchesByPhase = (matches: Match[]) => {
    const semifinals = matches.filter(match => ['semifinal', 'semifinals'].includes(normalizedMatchPhase(match)));
    const finals = matches.filter(match => ['final', 'finals', 'final_1_2', 'final_3_4', 'finals1st2nd', 'finals3rd4th'].includes(normalizedMatchPhase(match)));
    const phaseIds = new Set([...semifinals, ...finals].map(match => match.id));
    return {
        regular: matches.filter(match => !phaseIds.has(match.id)),
        semifinals,
        finals,
        hasExplicitPhases: phaseIds.size > 0,
    };
};

const manropePrintLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${MANROPE_PRINT_STYLESHEET}" rel="stylesheet">`;

export const waitForPrintFontsScript = `
    (function waitForPrintFonts() {
        if (!document.fonts) return Promise.resolve();
        return Promise.race([
            Promise.all([
                document.fonts.load('400 12px Manrope'),
                document.fonts.load('700 12px Manrope'),
                document.fonts.ready
            ]),
            new Promise(function(resolve) { setTimeout(resolve, 4000); })
        ]);
    })()
`;

const getTournamentTypeDisplayName = (type: TournamentType): string => {
    switch (type) {
        case TournamentType.TorneOtto:
            return "TorneOtto 30'";
        case TournamentType.Americano:
            return "Americano";
        case TournamentType.RoundRobinFinali:
            return "Round Robin + Finali";
        case TournamentType.TorneoLibero:
            return "Torneo Libero";
        case TournamentType.GironiFaseFinale:
            return "Gironi + Fase Finale";
        case TournamentType.BeatTheBox:
            return "Beat the Box";
        case TournamentType.TorneoASquadre:
            return "Torneo a Squadre";
        default:
            return type;
    }
};

type BlankFinalPhaseMatch = { left: string; right: string };

const renderBlankFinalPhaseBlock = (
    title: string,
    icon: string,
    matches: BlankFinalPhaseMatch[],
    palette: { background: string; border: string; color: string },
): string => `
    <div class="blank-final-phase avoid-break">
        <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 8px; padding: 4px 6px; background: ${palette.background}; border-left: 4px solid ${palette.border}; color: ${palette.color};">
            ${icon} ${title}
        </h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px;">
            <tbody>
                ${matches.map(match => `
                    <tr style="height: 22px;">
                        <td style="width: 37%; text-align: right; padding: 5px 6px; line-height: 1.3;">
                            <div style="font-size: 9px; color: #666; margin-bottom: 2px;">${match.left}</div>
                            <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; width: 85%; min-width: 120px; background: #fff; color: #64748b;">Da definire</span>
                        </td>
                        <td style="text-align: center; width: 26%; padding: 5px 6px; white-space: nowrap;">
                            <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; background: #fff;">&nbsp;&nbsp;&nbsp;</span>
                            -
                            <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; background: #fff;">&nbsp;&nbsp;&nbsp;</span>
                        </td>
                        <td style="width: 37%; text-align: left; padding: 5px 6px; line-height: 1.3;">
                            <div style="font-size: 9px; color: #666; margin-bottom: 2px;">${match.right}</div>
                            <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; width: 85%; min-width: 120px; background: #fff; color: #64748b;">Da definire</span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
`;

const renderBlankFinalPhase = (includeSemifinals: boolean): string => `
    <div class="section-block blank-final-phases" style="margin: 20px 0;">
        ${includeSemifinals ? renderBlankFinalPhaseBlock(
            'FASE FINALE - SEMIFINALI',
            '⚡',
            [
                { left: '1° Classificato', right: '4° Classificato' },
                { left: '2° Classificato', right: '3° Classificato' },
            ],
            { background: '#eff6ff', border: '#0284c7', color: '#0369a1' },
        ) : ''}
        ${renderBlankFinalPhaseBlock(
            'FASE FINALE - 1°/2° POSTO',
            '🏆',
            [{ left: includeSemifinals ? 'Vincitore SF A' : '1° Classificato', right: includeSemifinals ? 'Vincitore SF B' : '2° Classificato' }],
            { background: '#fff3e0', border: '#ff9800', color: '#d97706' },
        )}
        ${renderBlankFinalPhaseBlock(
            'FASE FINALE - 3°/4° POSTO',
            '🥉',
            [{ left: includeSemifinals ? 'Perdente SF A' : '3° Classificato', right: includeSemifinals ? 'Perdente SF B' : '4° Classificato' }],
            { background: '#e8f5e8', border: '#4caf50', color: '#2e7d32' },
        )}
    </div>
`;

export const getPrintStyles = (fontImport: boolean = false) => `
    ${fontImport ? manropePrintLink : ''}
    <style>
        @media screen {
            body { 
                font-family: 'Manrope', sans-serif;
                line-height: 1.5; 
                color: #1c1c1e; 
                font-size: 11px;
                background-color: #f2f2f7;
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;
            }
        }
        @media print {
            body { 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
                -webkit-text-size-adjust: 100% !important;
                text-size-adjust: 100% !important;
                font-family: 'Manrope', sans-serif;
                color: #000000;
            }
            .no-print { display: none !important; }
        }
        .print-page {
            width: 100%;
            max-width: 190mm;
            margin: 0 auto;
        }
        /* Only small, explicitly marked units stay together. Long cards and
           sections must be allowed to continue on the following page. */
        .avoid-break,
        .keep-together,
        .match-row {
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .whitespace-nowrap {
            white-space: nowrap;
        }
        h2,
        h3,
        .section-title {
            break-after: avoid;
            page-break-after: avoid;
        }
        tr, thead, tfoot {
            break-inside: avoid;
            page-break-inside: avoid;
        }
        td {
            white-space: normal;
            overflow-wrap: anywhere;
        }
        th { white-space: nowrap; }
        @media screen {
            .print-page {
                max-width: 1100px;
                margin: 0 auto;
            }
        }
        @media print {
            .print-page {
                max-width: none;
            }
            h2,
            h3,
            .section-title {
                break-after: avoid;
                page-break-after: avoid;
            }
        }
        table { 
            width: 100%; 
            border-collapse: separate; 
            border-spacing: 0; 
            margin-top: 8px; 
            margin-bottom: 14px; 
            font-size: 11px;
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid #cbd5e1;
        }
        th, td { 
            border-bottom: 1px solid #e2e8f0; 
            border-right: 1px solid #e2e8f0;
            padding: 6px 8px; 
            text-align: left; 
            vertical-align: middle; 
            color: #0f172a;
        }
        th:last-child, td:last-child { border-right: none; }
        tr:last-child td { border-bottom: none; }
        th { 
            background-color: #f1f5f9; 
            font-weight: 700; 
            color: #0f172a;
            text-transform: uppercase;
            font-size: 9.5px;
            letter-spacing: 0.04em;
        }
        h1, h2, h3 { color: #0f172a; margin: 0; padding: 0; font-family: 'Manrope', sans-serif; }
        h1 { font-size: 22px; margin-bottom: 6px; font-weight: 800; letter-spacing: -0.02em; }
        h2 { font-size: 15px; margin-bottom: 6px; font-weight: 700; letter-spacing: -0.01em; color: #0284c7; }
        h3 { 
            font-size: 13px; 
            margin-top: 14px; 
            margin-bottom: 6px; 
            padding-bottom: 4px; 
            border-bottom: 1px solid #cbd5e1; 
            font-weight: 700;
        }
        .delta-positive { color: #16a34a !important; font-weight: 700; }
        .delta-negative { color: #dc2626 !important; font-weight: 700; }
        .player-name-cell { vertical-align: middle; font-weight: 600; }
        .score-box {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 3px 7px;
            background-color: #0284c7;
            border-radius: 4px;
            margin: 0 2px;
            font-weight: 700;
            font-size: 11px;
            color: #ffffff;
        }
    </style>
`;

// Detect iOS devices

export const formatScoreBoxes = (sets: any[], isScheduled: boolean = false) => {
    if (isScheduled) return '<span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 10px; display: inline-block; font-size: 11px; color: #94a3b8; background: #f8fafc;">&nbsp;&nbsp;&nbsp;</span> - <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 10px; display: inline-block; font-size: 11px; color: #94a3b8; background: #f8fafc;">&nbsp;&nbsp;&nbsp;</span>';
    if (!sets || sets.length === 0) return '<span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 10px; display: inline-block; font-size: 11px; color: #94a3b8; background: #f8fafc;">&nbsp;&nbsp;&nbsp;</span> - <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 10px; display: inline-block; font-size: 11px; color: #94a3b8; background: #f8fafc;">&nbsp;&nbsp;&nbsp;</span>';
    
    const isBlank = sets.every((s: any) => Number(s?.team1 || 0) === 0 && Number(s?.team2 || 0) === 0);
    if (isBlank) return '<span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 10px; display: inline-block; font-size: 11px; color: #94a3b8; background: #f8fafc;">&nbsp;&nbsp;&nbsp;</span> - <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 10px; display: inline-block; font-size: 11px; color: #94a3b8; background: #f8fafc;">&nbsp;&nbsp;&nbsp;</span>';

    return sets.map((s: any) => 
        `<span style="background: linear-gradient(135deg, #0284c7, #0284c7); color: #ffffff; padding: 3px 8px; border-radius: 5px; font-weight: 800; font-size: 11px; display: inline-block; margin: 0 2px; box-shadow: 0 1px 2px rgba(2,132,199,0.3);">${s.team1}-${s.team2}</span>`
    ).join('');
};

const isIOS = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// iOS: print via blob URL so iOS can reload content on zoom change without getting about:blank
const printViaIframe = (htmlContent: string): boolean => {
    try {
        // Inject print script before </body> — fires on load
        const htmlWithScript = htmlContent.replace(
            /<\/body>/i,
            `<script>
                window.addEventListener('load', function() {
                    ${waitForPrintFontsScript}.finally(function() {
                        setTimeout(function() {
                            try { window.print(); } catch(e) { console.error('Print error:', e); showHIGAlert('Impossibile aprire la finestra di stampa. Riprova e verifica i popup.'); }
                        }, 200);
                    });
                });
            <\/script></body>`
        );

        const blob = new Blob([htmlWithScript], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');

        if (!printWindow) {
            URL.revokeObjectURL(url);
            showHIGAlert('Impossibile aprire la finestra di stampa. Verifica che i popup non siano bloccati.');
            return false;
        }

        // Revoca il blob dopo 2 minuti (abbondante tempo per stampa)
        setTimeout(() => URL.revokeObjectURL(url), 120000);
        return true;
    } catch (error) {
        console.error('Error printing:', error);
        showHIGAlert('Errore durante la stampa.');
        return false;
    }
};

const openPrintWindow = (title: string, content: string, pageStyles = "", existingWindow?: Window | null): boolean => {
    try {
        const iOS = isIOS();

        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=1024, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <title>${title}</title>
                <style>@page { size: A4; margin: 12mm 10mm; } ${pageStyles}</style>
                ${getPrintStyles(true)}
            </head>
            <body>
                ${content}
                <script>
                    window.addEventListener('load', function() {
                        ${waitForPrintFontsScript}.finally(function() {
                            setTimeout(function() {
                                try {
                                    window.print();
                                    ${iOS ? '' : 'setTimeout(function() { window.close(); }, 100);'}
                                } catch(e) {
                                    console.error('Print error:', e);
                                    ${iOS ? '' : 'window.close();'}
                                }
                            }, ${iOS ? 300 : 150});
                        });
                    });
                <\/script>
            </body>
            </html>
        `;

        if (existingWindow) {
            if (iOS) {
                // On iOS, keeping team-tournament prints on about:blank breaks the native
                // preview shell and the user can get stuck without the close button.
                // Reuse the pre-opened tab, but load it through a blob URL just like the
                // legacy print flow so Safari shows the standard dismiss UI.
                const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                existingWindow.location.replace(url);
                setTimeout(() => URL.revokeObjectURL(url), 120000);
                return true;
            }

            existingWindow.document.open();
            existingWindow.document.write(fullHtml);
            existingWindow.document.close();
            return true;
        }

        if (iOS) {
            // iOS: usa blob URL invece di document.write su about:blank
            // Così iOS può ricaricare il contenuto al cambio zoom senza ottenere pagina bianca
            const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const printWindow = window.open(url, '_blank');
            if (!printWindow) {
                URL.revokeObjectURL(url);
                showHIGAlert('Impossibile aprire la finestra di stampa. Verifica che i popup non siano bloccati.');
                return false;
            }
            setTimeout(() => URL.revokeObjectURL(url), 120000);
            return true;
        }

        // Desktop/Android: document.write funziona bene (no re-render on zoom)
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            showHIGAlert('Impossibile aprire la finestra di stampa. Verifica che i popup non siano bloccati.');
            return false;
        }
        printWindow.document.write(fullHtml);
        printWindow.document.close();
        return true;
    } catch (error) {
        console.error('Error opening print window:', error);
        showHIGAlert('Errore durante l\'apertura della finestra di stampa.');
        return false;
    }
};

export const printChart = (chartContainerId: string): boolean => {
    const chartContainer = document.getElementById(chartContainerId);
    if (!chartContainer) {
        console.error('Chart container not found');
        return false;
    }
    const chartHtml = chartContainer.innerHTML;
    console.log('🎯 Printing ELO History Chart with HTML length:', chartHtml.length);

    const pageStyles = `
        @page {
            size: A4 landscape;
            margin: 7.5mm;
        }
        @media print {
            @page {
                size: A4 landscape;
                margin: 7.5mm;
            }
            body {
                font-size: 8px;
                width: 100%;
                height: 100%;
                margin: 0;
                padding: 0;
            }
            h1 {
                font-size: 22px;
                margin: 0 0 5px 0;
            }
            #elo-chart-container {
                width: 100% !important;
                height: calc(100vh - 80px) !important;
                min-height: 160mm !important;
            }
            #elo-chart-container .recharts-responsive-container {
                width: 100% !important;
                height: 100% !important;
            }
            #elo-chart-container svg {
                width: 100% !important;
                height: 100% !important;
                overflow: visible !important;
            }
            /* Nasconde la legenda di Recharts nel PDF */
            #elo-chart-container .recharts-legend-wrapper {
                display: none !important;
            }
            /* Stile per la legenda personalizzata */
            .print-only table {
                border: none !important;
                margin: 5px 0 !important;
                width: 100% !important;
            }
            .print-only td {
                border: none !important;
                padding: 4px 8px !important;
                vertical-align: middle !important;
            }
            .print-only span {
                font-size: 11px !important;
                font-weight: bold !important;
            }
        }
        body {
            font-size: 8px;
        }
        h1 {
            font-size: 16px;
            margin: 0 0 5px 0;
        }
        /* Ensure chart fills available space on screen too */
        #elo-chart-container {
            width: 100%;
            min-height: 160mm;
        }
        #elo-chart-container .recharts-responsive-container {
            width: 100% !important;
            height: 100% !important;
        }
    `;

    const svgFixScript = `
        <script>
            (function() {
                var container = document.getElementById('${chartContainerId}');
                if (container) {
                    var svg = container.querySelector('svg.recharts-surface');
                    if (svg) {
                        var origW = svg.getAttribute('width');
                        var origH = svg.getAttribute('height');
                        if (origW && origH) {
                            svg.setAttribute('viewBox', '0 0 ' + origW + ' ' + origH);
                            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                            svg.removeAttribute('width');
                            svg.removeAttribute('height');
                            svg.style.width = '100%';
                            svg.style.height = '100%';
                        }
                    }
                    var wrapper = container.querySelector('.recharts-wrapper');
                    if (wrapper) {
                        wrapper.style.width = '100%';
                        wrapper.style.height = '100%';
                    }
                    container.style.width = '100%';
                    container.style.height = 'calc(100vh - 80px)';
                    container.style.minHeight = '160mm';
                }
            })();
        </script>
    `;

    const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=1024, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>Grafico Andamento Storico ELO</title>
            ${getPrintStyles(true)}
            <style>${pageStyles}</style>
        </head>
        <body>
            <h1>Grafico Andamento Storico ELO</h1>
            <div id="${chartContainerId}">
                ${chartHtml}
            </div>
            ${svgFixScript}
            <script>
                setTimeout(() => {
                    try {
                        window.print();
                        setTimeout(() => window.close(), 100);
                    } catch (e) {
                        console.error('Print error:', e);
                        window.close();
                    }
                }, 500);
            </script>
        </body>
        </html>
    `;

    // iOS: use iframe approach
    if (isIOS()) {
        return printViaIframe(fullHtml);
    }

    // Desktop/Android: use window.open
    try {
        const printWindow = window.open('', '_blank');

        if (!printWindow) {
            showHIGAlert('Per favore, abilita i popup del browser per stampare il PDF.');
            return false;
        }

        printWindow.document.write(fullHtml);
        printWindow.document.close();
        return true;
    } catch (error) {
        console.error('Error opening print window:', error);
        showHIGAlert('Errore durante l\'apertura della finestra di stampa.');
        return false;
    }
};

const PRINT_COLORS = ['#38bdf8', '#818cf8', '#f87171', '#fbbf24', '#4ade80', '#a78bfa', '#f472b6', '#2dd4bf'];

export const printEloChart = (
    chartData: { eventIndex: number; sourceLabel?: string; [playerId: string]: any }[],
    playerIds: string[],
    players: Player[],
): boolean => {
    if (chartData.length < 2 || playerIds.length === 0) return false;

    const colors = PRINT_COLORS;
    const svgWidth = 1000;
    const svgHeight = 630;
    const pad = { top: 20, right: 120, bottom: 45, left: 65 };
    const plotW = svgWidth - pad.left - pad.right;
    const plotH = svgHeight - pad.top - pad.bottom;

    // Y domain
    let yMin = Infinity, yMax = -Infinity;
    chartData.forEach(d => {
        playerIds.forEach(pid => {
            const v = d[pid];
            if (v !== undefined && v !== null) {
                if (v < yMin) yMin = v;
                if (v > yMax) yMax = v;
            }
        });
    });
    const yPadding = Math.max((yMax - yMin) * 0.1, 10);
    yMin = Math.floor(yMin - yPadding);
    yMax = Math.ceil(yMax + yPadding);
    const yRange = yMax - yMin || 1;

    // X domain
    const xMin = chartData[0].eventIndex;
    const xMax = chartData[chartData.length - 1].eventIndex;
    const xRange = xMax - xMin || 1;

    const toX = (idx: number) => pad.left + ((idx - xMin) / xRange) * plotW;
    const toY = (elo: number) => pad.top + plotH - ((elo - yMin) / yRange) * plotH;

    let svg = '';

    // Horizontal grid lines + Y labels
    const numYTicks = 8;
    for (let i = 0; i <= numYTicks; i++) {
        const val = yMin + (yRange * i / numYTicks);
        const y = toY(val);
        svg += `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${svgWidth - pad.right}" y2="${y.toFixed(1)}" stroke="#e0e0e0" stroke-dasharray="4,3"/>`;
        svg += `<text x="${pad.left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#666" font-size="11" font-family="Manrope">${Number(val).toFixed(2)}</text>`;
    }

    // Vertical grid lines + X labels
    const maxLabels = 30;
    const step = chartData.length > maxLabels ? Math.ceil(chartData.length / maxLabels) : 1;
    chartData.forEach((d, i) => {
        const x = toX(d.eventIndex);
        svg += `<line x1="${x.toFixed(1)}" y1="${pad.top}" x2="${x.toFixed(1)}" y2="${svgHeight - pad.bottom}" stroke="#e0e0e0" stroke-dasharray="4,3"/>`;
        if (i % step === 0 || i === chartData.length - 1) {
            const defaultLabel = d.eventIndex >= 0 ? `G${d.eventIndex + 1}` : 'Start';
            const label = d.sourceLabel || defaultLabel;
            svg += `<text x="${x.toFixed(1)}" y="${svgHeight - pad.bottom + 16}" text-anchor="middle" fill="#666" font-size="10" font-family="Manrope">${label}</text>`;
        }
    });

    // Helper: monotone cubic spline (Catmull-Rom → cubic bezier path)
    const toSmoothPath = (pts: { x: number; y: number }[]): string => {
        if (pts.length < 2) return '';
        if (pts.length === 2) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
        let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[Math.max(0, i - 1)];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[Math.min(pts.length - 1, i + 2)];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
        }
        return d;
    };

    // Player lines (smooth curves)
    playerIds.forEach((pid, idx) => {
        const color = colors[idx % colors.length];
        const validPoints = chartData.filter(d => d[pid] !== undefined && d[pid] !== null);
        if (validPoints.length === 0) return;

        const pts = validPoints.map(d => ({ x: toX(d.eventIndex), y: toY(d[pid]) }));
        const pathD = toSmoothPath(pts);
        svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2"/>`;

        // Dots
        pts.forEach(p => {
            svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}"/>`;
        });

        // End label: "ELO - Cognome"
        if (validPoints.length > 0) {
            const last = validPoints[validPoints.length - 1];
            const lastPt = pts[pts.length - 1];
            const player = players.find(p => p.id === pid);
            const surname = player ? player.surname : '';
            svg += `<text x="${(lastPt.x + 6).toFixed(1)}" y="${(lastPt.y + 4).toFixed(1)}" fill="${color}" font-size="9" font-weight="bold" font-family="Manrope">${Number(last[pid]).toFixed(2)} - ${surname}</text>`;
        }
    });

    // Axes
    svg += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${svgHeight - pad.bottom}" stroke="#888" stroke-width="1"/>`;
    svg += `<line x1="${pad.left}" y1="${svgHeight - pad.bottom}" x2="${svgWidth - pad.right}" y2="${svgHeight - pad.bottom}" stroke="#888" stroke-width="1"/>`;

    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" style="width:100%;height:auto;display:block;">${svg}</svg>`;

    const content = `
        <div id="landscape-content">
            <h1 style="text-align:center;font-size:16px;margin:0 0 6px 0;color:#333;font-family:'Manrope',sans-serif;">Grafico Andamento Storico ELO</h1>
            ${fullSvg}
        </div>
    `;

    const fullHtml = `<!DOCTYPE html><html>
<head>
    <meta name="viewport" content="width=1024, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Grafico Andamento Storico ELO</title>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&display=swap" rel="stylesheet">
    <style>
        @page { size: A4 landscape; margin: 18mm 20mm; }
        body {
            font-family: 'Manrope', sans-serif;
            margin: 0; padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        @media print and (orientation: portrait) {
            @page { margin: 0; }
            body { margin: 0; padding: 0; overflow: hidden; }
            #landscape-content {
                transform-origin: top left;
                transform: rotate(-90deg) translateX(-100%);
                width: 267mm;
                padding: 15mm;
                box-sizing: border-box;
                position: absolute;
                top: 0; left: 0;
            }
        }
    </style>
</head><body>
    ${content}
</body></html>`;

    // iOS: use iframe approach
    if (isIOS()) {
        return printViaIframe(fullHtml);
    }

    // Desktop/Android: use window.open
    try {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            showHIGAlert('Impossibile aprire la finestra di stampa. Verifica che i popup non siano bloccati.');
            return false;
        }

        printWindow.document.write(fullHtml + `
            <script>
                setTimeout(function() {
                    try {
                        window.print();
                        setTimeout(function() { window.close(); }, 100);
                    } catch(e) {
                        console.error(e);
                        window.close();
                    }
                }, 400);
            </script>
        `);
        printWindow.document.close();
        return true;
    } catch (error) {
        console.error('Error printing ELO chart:', error);
        showHIGAlert('Errore durante la stampa del grafico.');
        return false;
    }
};


const getDeltaArrow = (delta: number | null) => {
    if (delta === null || delta === 0) return '<span>-</span>';
    if (delta > 0) return `<span class="delta-positive">▲</span>`;
    return `<span class="delta-negative">▼</span>`;
};

export const printRanking = (
    rankingData: RankingEntry[],
    eloHistory: EloHistoryEntry[],
    matches: Match[],
    tournaments: Tournament[],
    selectedTournamentId?: string | null,
    presenceThreshold?: number,
    tournamentGiornate?: string[],
    selectedTeamTournamentMatchdayIds?: string[],
    teamMatchdays?: TeamTournamentMatchday[]
) => {
    // Include ALL players of the selected ranking (even if ELO delta is 0)
    // Players without history will still be shown with '-' details
    const playersForReport = rankingData;

    const tableRows = playersForReport.map(player => {
        const playerHistory = buildPlayerEloTimeline(
            player.id,
            eloHistory,
            matches,
            tournaments,
            teamMatchdays || [],
            { parentTournamentName: selectedTournamentId }
        );

        const historyList = playerHistory.length > 0 ? `
            <div style="margin-top: 5px; padding-top: 5px; border-top: 1px solid #f0f0f0;">
                ${playerHistory.map(entry => {
                    const labelText = formatLabel(entry, !selectedTournamentId);
                    const deltaSign = entry.delta >= 0 ? '+' : '';
                    return `<div style="font-size: 8px; padding: 2px 0; display: flex; justify-content: space-between;">
                                <span>
                                    <span style="color: #777;">${labelText} il ${new Date(entry.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}:</span>
                                </span>
                                <strong style="white-space: nowrap; padding-left: 10px;" class="${entry.delta >= 0 ? 'delta-positive' : 'delta-negative'}">
                                    ${deltaSign}${entry.delta.toFixed(2)}
                                </strong>
                            </div>`;
                }).join('')}
            </div>
        ` : '';
        
        return `
            <tr style="background-color: #fff;">
                <td style="text-align: center;">${player.rank}</td>
                <td>
                    <div style="font-weight: bold; font-size: 11px;">${player.name} ${player.surname}</div>
                    ${historyList}
                </td>
                <td style="vertical-align: top; font-weight: bold; font-size: 11px;">${player.currentElo.toFixed(2)}</td>
                <td style="vertical-align: top; text-align: center;">${getDeltaArrow(player.lastDelta)}</td>
                <td style="vertical-align: top; text-align: center;">${player.matchesPlayed}</td>
                <td style="vertical-align: top; text-align: center;">${player.matchesWon}</td>
                <td style="vertical-align: top; text-align: center;">${player.gamesWon} - ${player.gamesLost}</td>
                <td style="vertical-align: top; text-align: center;">${player.winPercentage.toFixed(1)}%</td>
            </tr>
        `;
    });

    const tableRowsStr = tableRows.join('');

    // Get tournament info if filtered (by SERIES KEY)
    const selectedTournament = selectedTournamentId 
        ? tournaments.find(t => (t.giornataName || t.name) === selectedTournamentId)
        : null;

    // Generate table rows with separator
    let tableRowsWithSeparator = '';
    playersForReport.forEach((player, idx) => {
        const prevPlayer = idx > 0 ? playersForReport[idx - 1] : null;
        const showSeparator = selectedTournamentId && presenceThreshold && presenceThreshold > 0 &&
            prevPlayer &&
            prevPlayer.presencePercentage && player.presencePercentage &&
            prevPlayer.presencePercentage >= presenceThreshold &&
            player.presencePercentage < presenceThreshold;

        if (showSeparator && tournamentGiornate) {
            const minGiornate = Math.ceil(presenceThreshold * tournamentGiornate.length / 100);
            tableRowsWithSeparator += `
                <tr style="background-color: #f2f2f7; border-top: 3px solid #1e3a6e; border-bottom: 3px solid #1e3a6e;">
                    <td colspan="8" style="text-align: center; padding: 8px; font-weight: bold; color: #111827; font-size: 10px;">
                        ⬇️ SOGLIA ${presenceThreshold}% (${minGiornate} giornate su ${tournamentGiornate.length}) ⬇️
                    </td>
                </tr>
            `;
        }
        tableRowsWithSeparator += tableRows[idx];
    });

    const content = `
        <style>
            body { 
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum'; 
                font-size: 11px; 
                line-height: 1.4;
                margin: 0;
                padding: 20px;
                background: white;
            }
            h1 {
                font-size: 22px;
                margin: 0;
                color: #111827;
                font-weight: bold;
            }
            .separator {
                border-bottom: 3px solid #1e3a6e;
                margin: 16px 0;
            }
            .date-info {
                color: #666;
                font-size: 10px;
            }
            .filter-info {
                background-color: #eff6ff;
                border-left: 4px solid #1e3a6e;
                padding: 8px 12px;
                margin: 12px 0;
                font-size: 11px;
                color: #111827;
            }
            .filter-info strong {
                color: #111827;
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 8px 0 16px 0;
                font-size: 11px;
            }
            th { 
                background-color: #1e3a6e; /* Blu più chiaro */
                color: white; 
                padding: 8px 4px; 
                text-align: left; 
                font-weight: bold;
                font-size: 10px;
            }
            td { 
                padding: 8px 4px; 
                border-bottom: 1px solid #e5e7eb; 
                vertical-align: top;
                font-size: 11px;
                line-height: 1.3;
                min-height: 20px;
            }
            .court-cell {
                font-size: 9px;
                white-space: nowrap;
            }
            tr:nth-child(even) {
                background-color: #f0f5ff;
            }
            .delta-positive {
                color: #111827; /* Verde più chiaro */
            }
            .delta-negative {
                color: #dc2626; /* Rosso per perdite */
            }
            .footer {
                margin-top: 24px;
                padding-top: 16px;
                border-top: 1px solid #e5e7eb;
                font-size: 9px;
                color: #666;
            }
        </style>

        <div style="text-align: center; margin-bottom: 20px;">
            <h1>${selectedTournament ? `Classifica Giocatori (${selectedTournament.giornataName || selectedTournament.name})` : 'Classifica Generale'}</h1>
            <div class="date-info">Aggiornata al: ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}</div>
        </div>

        ${selectedTournament ? `
            <div class="filter-info" style="text-align: center;">
                <div style="font-size: 13px; font-weight: bold; margin-bottom: 4px;">${selectedTournament.giornataName || selectedTournament.name}</div>
                <div style="font-size: 11px;">${selectedTournament.club}</div>
                ${tournamentGiornate && tournamentGiornate.length > 1 ? `<div style="font-size: 10px; margin-top: 4px;">Giornate: ${tournamentGiornate.length}</div>` : ''}
            </div>
        ` : `
            <div class="filter-info" style="text-align: center;">
                <div style="font-size: 13px; font-weight: bold;">Classifica Generale</div>
                <div style="font-size: 11px;">Tutti i tornei completati</div>
            </div>
        `}

        ${presenceThreshold && presenceThreshold > 0 && tournamentGiornate ? `
            <div class="filter-info" style="text-align: center; background-color: #fef3c7; border-left-color: #f59e0b; color: #92400e;">
                <strong>Filtro Presenza:</strong> ≥${presenceThreshold}% (almeno ${Math.ceil(presenceThreshold * tournamentGiornate.length / 100)} giornate su ${tournamentGiornate.length})
                <br/>
                <em style="font-size: 9px;">I giocatori sotto questa soglia sono elencati dopo quelli che la superano</em>
            </div>
        ` : ''}

        <div class="separator"></div>

        <table>
            <thead>
                <tr>
                    <th style="text-align: center; width: 5%;">Rank</th>
                    <th style="width: 45%;">Player & ELO History</th>
                    <th style="width: 10%;">ELO</th>
                    <th style="text-align: center; width: 8%;">Last Δ</th>
                    <th style="text-align: center; width: 8%;">Played</th>
                    <th style="text-align: center; width: 8%;">Won</th>
                    <th style="text-align: center; width: 8%;">Games (W-L)</th>
                    <th style="text-align: center; width: 8%;">Win %</th>
                </tr>
            </thead>
            <tbody>
                ${tableRowsWithSeparator || tableRowsStr}
            </tbody>
        </table>

        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">
                Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}
            </div>
            <div style="text-align: right; font-size: 8px;">
                ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
            </div>
        </div>
    `;

    const pageTitle = selectedTournament 
        ? `Classifica Giocatori (${selectedTournament.giornataName || selectedTournament.name})` 
        : 'Classifica Generale';
    return openPrintWindow(`${pageTitle}, ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}`, content);
};

export const printTournamentReport = (
    tournament: Tournament, 
    standings: TournamentStandingEntry[], 
    matches: Match[], 
    getPlayerById: (id: string) => Player | undefined,
    americanoFields?: number,
    americanoScoringType?: 'games-diff' | 'points',
    roundRobinMatchCount?: number,  // Numero di partite del round robin (se presente)
    displayNameOverride?: string,
    roundRobinFields?: number  // Numero di campi per Round Robin
) => {
    const displayName = displayNameOverride || tournament.name;
    const safeDisplayName = escapeHtml(displayName);
    const safeClubName = escapeHtml(tournament.club);
    const isAmericano = tournament.type === TournamentType.Americano || 
                        (tournament.type === TournamentType.Serie && (americanoScoringType !== undefined || americanoFields !== undefined));
    const isRoundRobinFinali = tournament.type === TournamentType.RoundRobinFinali;
    const isGironiFaseFinale = tournament.type === TournamentType.GironiFaseFinale;

    if (isGironiFaseFinale) {
        return printGironiTournament(tournament, matches, getPlayerById, displayName);
    }
    
    // Teams section (only for non-Americano tournaments)
    let teamsContent = '';
    if (!isAmericano) {
        const teams = standings.map(s => s.team);
        teamsContent = teams.map((pair, index) => {
            const p1 = pair && pair[0] ? escapeHtml(`${pair[0].name || ''} ${pair[0].surname || ''}`.trim()) : 'Da definire';
            const p2 = pair && pair[1] ? escapeHtml(`${pair[1].name || ''} ${pair[1].surname || ''}`.trim()) : 'Da definire';
            return `
            <div class="team-box" style="text-align: center; font-weight: bold; padding: 6px 4px; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 11px; line-height: 1.2; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                <div class="team-number" style="color: #0284c7; font-weight: 800; font-size: 10px; uppercase; tracking-wider; margin-bottom: 2px;">SQUADRA ${index + 1}</div>
                <div style="color: #0f172a; font-weight: 600;">${p1}</div>
                <div style="color: #64748b; font-size: 10px; margin: 1px 0;">&</div>
                <div style="color: #0f172a; font-weight: 600;">${p2}</div>
            </div>
        `;
        }).join('');
    }

    // Helper function to generate match row HTML
    const generateMatchRow = (match: Match, index: number, isFinal: boolean = false, finalsIndex: number = -1) => {
        const resolveP = (id: string) => id ? getPlayerById(id) : undefined;
        const t1p1 = resolveP(match.team1[0]);
        const t1p2 = resolveP(match.team1[1]);
        const t2p1 = resolveP(match.team2[0]);
        const t2p2 = resolveP(match.team2[1]);

        const scoreHtml = formatScoreBoxes(match.sets, tournament.status === 'scheduled');
        
        if (isAmericano) {
            // Americano: show individual players, not teams
            const team1Name = printableTeamName([t1p1, t1p2]);
            const team2Name = printableTeamName([t2p1, t2p2]);
            const maxCourts = americanoFields || 2; // Use provided fields or default to 2
            const court = `Campo ${(index % maxCourts) + 1}`;
            
            return `
                <tr style="height: 20px;">
                    <td style="text-align: center; width: 10%; font-size: 10px; padding: 3px 4px; height: 20px; line-height: 1.2;">${court}</td>
                    <td style="width: 32%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; min-height: 20px; line-height: 1.2; overflow-wrap: anywhere;">${team1Name}</td>
                    <td style="text-align: center; width: 26%; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; white-space: nowrap;">
                        ${tournament.status === 'scheduled' ? 
                            '<span style="border: 1px solid #ccc; padding: 3px 8px; display: inline-block; font-size: 11px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 3px 8px; display: inline-block; font-size: 11px;">&nbsp;</span>' : 
                            scoreHtml
                        }
                    </td>
                    <td style="width: 32%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; min-height: 20px; line-height: 1.2; overflow-wrap: anywhere;">${team2Name}</td>
                </tr>
            `;
        } else {
            // Regular tournaments: show teams
            const team1Name = printableTeamName([t1p1, t1p2]);
            const team2Name = printableTeamName([t2p1, t2p2], ' / ');
            
            let court = '-';
            if (isFinal && finalsIndex >= 0) {
                court = finalsIndex === 0 ? 'Finale 1°-2°' : 'Finale 3°-4°';
            } else if (tournament.type === TournamentType.TorneOtto) {
                court = `Campo ${(index % 2) + 1}`;
            } else if (isRoundRobin) {
                const maxCourts = roundRobinFields || 2;
                court = `Campo ${(index % maxCourts) + 1}`;
            }

            return `
                <tr style="height: 20px;">
                    <td style="text-align: center; width: 10%; font-size: 10px; padding: 3px 4px; height: 20px; line-height: 1.2;">${court}</td>
                    <td style="width: 32%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; min-height: 20px; line-height: 1.2; overflow-wrap: anywhere;">${team1Name}</td>
                    <td style="text-align: center; width: 26%; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; white-space: nowrap;">
                        ${tournament.status === 'scheduled' ? 
                            '<span style="border: 1px solid #ccc; padding: 3px 8px; display: inline-block; font-size: 11px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 3px 8px; display: inline-block; font-size: 11px;">&nbsp;</span>' : 
                            scoreHtml
                        }
                    </td>
                    <td style="width: 32%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; min-height: 20px; line-height: 1.2; overflow-wrap: anywhere;">${team2Name}</td>
                </tr>
            `;
        }
    };
    
    // Split matches into Round Robin and Finals if applicable
    const phasePartition = partitionMatchesByPhase(matches);
    const hasExtraFinals = isRoundRobinFinali && (
        phasePartition.hasExplicitPhases || (!!roundRobinMatchCount && matches.length > roundRobinMatchCount)
    );
    const fallbackRoundRobinMatchCount = roundRobinMatchCount ?? matches.length;
    const roundRobinMatches = phasePartition.hasExplicitPhases
        ? phasePartition.regular
        : (hasExtraFinals ? matches.slice(0, fallbackRoundRobinMatchCount) : matches);
    const finalsMatches = phasePartition.hasExplicitPhases
        ? [...phasePartition.semifinals, ...phasePartition.finals]
        : (hasExtraFinals ? matches.slice(fallbackRoundRobinMatchCount) : []);
    const isFinalsCompleted = tournament.status === 'completed' && finalsMatches.length > 0 && finalsMatches.some(m => m.winner || (m.sets && m.sets.some(s => s.team1 > 0 || s.team2 > 0)));
    
    let roundRobinContent = '';
    const isRoundRobin = tournament.type === TournamentType.RoundRobinFinali;
    const isTorneOtto = tournament.type === TournamentType.TorneOtto;
    const isHomeAway = tournament.roundRobinHomeAway || false;

    if (isAmericano || isRoundRobin || isTorneOtto) {
        const matchesPerRound = (isAmericano && americanoFields && americanoFields > 0) ? americanoFields : 2;
        const roundsMap = new Map<number, typeof roundRobinMatches>();
        roundRobinMatches.forEach((m, idx) => {
            const r = m.roundNumber || (matchesPerRound > 0 ? Math.floor(idx / matchesPerRound) + 1 : 1);
            if (!roundsMap.has(r)) roundsMap.set(r, []);
            roundsMap.get(r)!.push(m);
        });

        const totalRoundsCount = roundsMap.size;
        let currentRound = 0;

        // Build list of all teams or players in tournament
        const allTeamsMap = new Map<string, [Player, Player]>();
        roundRobinMatches.forEach(m => {
            const k1 = m.team1.join(',');
            const k2 = m.team2.join(',');
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
            fields: matchesPerRound,
            homeAway: isHomeAway,
            participantIds: Array.from(allPlayersIds),
        });
        const orderedRoundRobinMatches = normalizedRounds.flatMap(round => round.matches.map(item => item.match));
        const normalizedRoundByNumber = new Map(normalizedRounds.map(round => [round.roundNumber, round]));
        const courtByMatch = new Map(
            normalizedRounds.flatMap(round => round.matches.map(item => [item.match, item.courtNumber] as const)),
        );

        roundRobinContent = orderedRoundRobinMatches.map((match, index) => {
            const r = match.roundNumber || (matchesPerRound > 0 ? Math.floor(index / matchesPerRound) + 1 : 1);
            let rowHtml = '';
            
            if (r !== currentRound) {
                currentRound = r;
                
                const roundTitle = normalizedRoundByNumber.get(currentRound)?.label || `Turno ${currentRound}`;

                const matchesInRound = roundsMap.get(currentRound) || [];
                let restingText = '';

                if (isAmericano) {
                    const playersInRound = new Set(matchesInRound.flatMap(m => [...m.team1, ...m.team2]));
                    const allPlayers = Array.from(allPlayersIds).map(id => getPlayerById(id)).filter(Boolean) as Player[];
                    const restingPlayers = allPlayers.filter(p => !playersInRound.has(p.id));
                    if (restingPlayers.length > 0) {
                        restingText = `<div style="font-size: 11px; color: #b45309; background: #fffbeb; padding: 4px; margin-top: 4px; border-radius: 4px; font-weight: normal;"><b>Giocatori a Riposo:</b> ${restingPlayers.map(p => `${p.name} ${p.surname}`).join(', ')}</div>`;
                    }
                } else if (isRoundRobin) {
                    const teamsInRoundKeys = new Set(matchesInRound.flatMap(m => [m.team1.join(','), m.team2.join(',')]));
                    const restingTeams: string[] = [];
                    allTeamsMap.forEach((pair, key) => {
                        if (!teamsInRoundKeys.has(key)) {
                            restingTeams.push(`${pair[0].name} ${pair[0].surname} & ${pair[1].name} ${pair[1].surname}`);
                        }
                    });
                    if (restingTeams.length > 0) {
                        restingText = `<div style="font-size: 11px; color: #b45309; background: #fffbeb; padding: 4px; margin-top: 4px; border-radius: 4px; font-weight: normal;"><b>Coppie a Riposo:</b> ${restingTeams.join(' | ')}</div>`;
                    }
                }

                rowHtml += `
                    <tr class="round-header">
                        <td colspan="4" style="background: #f3f4f6; font-weight: bold; padding: 6px; font-size: 13px;">
                            ${roundTitle}
                            ${restingText}
                        </td>
                    </tr>
                `;
            }
            
            rowHtml += generateMatchRow(match, (courtByMatch.get(match) || 1) - 1, false, -1);
            return rowHtml;
        }).join('');
    } else {
        roundRobinContent = roundRobinMatches.map((match, index) => generateMatchRow(match, index, false, -1)).join('');
    }
    
    const finalsContent = finalsMatches.map((match, index) => generateMatchRow(match, index, true, index)).join('');
    
    // For Gironi + Fase Finale tournaments, split matches into gironi, semifinals, and finals
    let gironiContent = '';
    let gironiStandingsContent = '';
    let gironiSemifinalsContent = '';
    let gironiFinals34Content = '';
    let gironiFinalsContent = '';
    
    if (isGironiFaseFinale) {
        let gironiMatches = matches;
        let semifinalMatches: Match[] = [];
        let finalMatches: Match[] = [];

        const explicitPhases = partitionMatchesByPhase(matches);
        if (explicitPhases.hasExplicitPhases) {
            gironiMatches = explicitPhases.regular;
            semifinalMatches = explicitPhases.semifinals;
            finalMatches = explicitPhases.finals;
        } else if (tournament.status === 'completed' && matches.length >= 4) {
            // Last 4 matches are: semifinal A, semifinal B, finale 3-4, finalissima
            gironiMatches = matches.slice(0, -4);
            semifinalMatches = matches.slice(-4, -2);
            finalMatches = matches.slice(-2);
        }
        
        // Calculate number of gironi (each girone has 6 matches for 4 teams)
        const numGironi = Math.ceil(gironiMatches.length / 6);
        
        // Store girone standings
        const gironiStandings: Map<string, { pair: [Player, Player], punti: number, gamesWon: number, gamesLost: number }[]> = new Map();
        
        // Create content for each girone
        for (let i = 0; i < numGironi; i++) {
            const gironeName = String.fromCharCode(65 + i); // A, B, C, D
            const gironeMatches = gironiMatches.slice(i * 6, (i + 1) * 6);
            const gironeMatchesHtml = gironeMatches.map((match, idx) => {
                const t1p1 = getPlayerById(match.team1[0]);
                const t1p2 = getPlayerById(match.team1[1]);
                const t2p1 = getPlayerById(match.team2[0]);
                const t2p2 = getPlayerById(match.team2[1]);
                if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return '';
                
                const team1Name = `${t1p1.name} ${t1p1.surname} & ${t1p2.name} ${t1p2.surname}`;
                const team2Name = `${t2p1.name} ${t2p1.surname} / ${t2p2.name} ${t2p2.surname}`;
                const scoreHtml = formatScoreBoxes(match.sets, tournament.status === 'scheduled');
                
                return `
                    <tr style="height: 16px;">
                        <td style="width: 37%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 9px; padding: 2px 3px; height: 16px; line-height: 1.0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team1Name}</td>
                        <td style="text-align: center; width: 26%; font-size: 9px; padding: 2px 3px; height: 16px; line-height: 1.0; white-space: nowrap;">
                            ${tournament.status === 'scheduled' ? 
                                '<span style="border: 1px solid #ccc; padding: 2px 8px; display: inline-block; font-size: 9px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 2px 8px; display: inline-block; font-size: 9px;">&nbsp;</span>' : 
                                scoreHtml
                            }
                        </td>
                        <td style="width: 37%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 9px; padding: 2px 3px; height: 16px; line-height: 1.0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team2Name}</td>
                    </tr>
                `;
            }).join('');
            
            gironiContent += `
                <div class="section-block">
                <h3 style="font-size: 11px; font-weight: bold; margin: 12px 0 2px 0; padding: 1px 2px; background: #f0f0f0;">PARTITE E RISULTATI GIRONE ${gironeName}</h3>
                <table style="margin-bottom: 2px;">
                    <tbody>
                        ${gironeMatchesHtml}
                    </tbody>
                </table>
                </div>
            `;
            
            // Calculate standings for this girone
            const gironeTeams = new Map<string, { pair: [Player, Player], punti: number, gamesWon: number, gamesLost: number }>();
            
            // Get all unique teams from girone matches
            gironeMatches.forEach(match => {
                const team1Key = `${match.team1[0]}-${match.team1[1]}`;
                const team2Key = `${match.team2[0]}-${match.team2[1]}`;
                
                if (!gironeTeams.has(team1Key)) {
                    const p1 = getPlayerById(match.team1[0]);
                    const p2 = getPlayerById(match.team1[1]);
                    if (p1 && p2) {
                        gironeTeams.set(team1Key, { pair: [p1, p2], punti: 0, gamesWon: 0, gamesLost: 0 });
                    }
                }
                if (!gironeTeams.has(team2Key)) {
                    const p1 = getPlayerById(match.team2[0]);
                    const p2 = getPlayerById(match.team2[1]);
                    if (p1 && p2) {
                        gironeTeams.set(team2Key, { pair: [p1, p2], punti: 0, gamesWon: 0, gamesLost: 0 });
                    }
                }
                
                // Calculate stats
                const team1Games = (match.sets || []).reduce((sum, set) => sum + set.team1, 0);
                const team2Games = (match.sets || []).reduce((sum, set) => sum + set.team2, 0);
                
                const team1Stat = gironeTeams.get(team1Key);
                const team2Stat = gironeTeams.get(team2Key);
                
                if (team1Stat) {
                    team1Stat.gamesWon += team1Games;
                    team1Stat.gamesLost += team2Games;
                    if (team1Games > team2Games) team1Stat.punti += 3;
                }
                
                if (team2Stat) {
                    team2Stat.gamesWon += team2Games;
                    team2Stat.gamesLost += team1Games;
                    if (team2Games > team1Games) team2Stat.punti += 3;
                }
            });
            
            // Sort standings
            const sortedStandings = Array.from(gironeTeams.values()).sort((a, b) => {
                if (b.punti !== a.punti) return b.punti - a.punti;
                return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
            });
            
            gironiStandings.set(gironeName, sortedStandings);
        }
        
        // Create standings tables side by side
        const standingsTables = Array.from(gironiStandings.entries()).map(([gironeName, standings]) => {
            const standingsRows = standings.map((entry, idx) => `
                <tr style="height: 14px;">
                    <td style="text-align: center; width: 15%; font-size: 8px; padding: 1px 2px; height: 14px; line-height: 1.0;">${idx + 1}°</td>
                    <td style="width: 55%; font-size: 8px; padding: 1px 2px; height: 14px; line-height: 1.0;">${entry.pair[0].name} ${entry.pair[0].surname} / ${entry.pair[1].name} ${entry.pair[1].surname}</td>
                    <td style="text-align: center; width: 15%; font-size: 8px; padding: 1px 2px; height: 14px; line-height: 1.0;">${entry.punti}</td>
                    <td style="text-align: center; width: 15%; font-size: 8px; padding: 1px 2px; height: 14px; line-height: 1.0;">${entry.gamesWon - entry.gamesLost >= 0 ? '+' : ''}${entry.gamesWon - entry.gamesLost}</td>
                </tr>
            `).join('');
            
            return `
                <div class="section-block" style="flex: 1; min-width: 0;">
                    <h3 style="font-size: 10px; font-weight: bold; margin: 12px 0 2px 0; padding: 1px 2px; background: #e8f5e9; text-align: center;">CLASSIFICA GIRONE ${gironeName}</h3>
                    <table style="margin-bottom: 2px; font-size: 8px;">
                        <thead>
                            <tr>
                                <th style="text-align: center; font-size: 8px; padding: 1px 2px;">Pos</th>
                                <th style="font-size: 8px; padding: 1px 2px;">Coppia</th>
                                <th style="text-align: center; font-size: 8px; padding: 1px 2px;">Pt</th>
                                <th style="text-align: center; font-size: 8px; padding: 1px 2px;">Diff</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${standingsRows}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
        
        gironiStandingsContent = `
            <div style="display: flex; gap: 4px; margin: 12px 0;">
                ${standingsTables}
            </div>
        `;
        
        // Semifinals content
        if (semifinalMatches.length > 0) {
            const generateSemifinalRow = (match: Match) => {
                const t1p1 = getPlayerById(match.team1[0]);
                const t1p2 = getPlayerById(match.team1[1]);
                const t2p1 = getPlayerById(match.team2[0]);
                const t2p2 = getPlayerById(match.team2[1]);
                if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return '';
                
                const team1Name = `${t1p1.name} ${t1p1.surname} & ${t1p2.name} ${t1p2.surname}`;
                const team2Name = `${t2p1.name} ${t2p1.surname} / ${t2p2.name} ${t2p2.surname}`;
                const scoreHtml = formatScoreBoxes(match.sets, tournament.status === 'scheduled');
                
                return `
                    <tr style="height: 16px;">
                        <td style="width: 37%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 9px; padding: 2px 3px; height: 16px; line-height: 1.0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team1Name}</td>
                        <td style="text-align: center; width: 26%; font-size: 9px; padding: 2px 3px; height: 16px; line-height: 1.0; white-space: nowrap;">
                            ${tournament.status === 'scheduled' ? 
                                '<span style="border: 1px solid #ccc; padding: 2px 8px; display: inline-block; font-size: 9px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 2px 8px; display: inline-block; font-size: 9px;">&nbsp;</span>' : 
                                scoreHtml
                            }
                        </td>
                        <td style="width: 37%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 9px; padding: 2px 3px; height: 16px; line-height: 1.0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team2Name}</td>
                    </tr>
                `;
            };
            
            gironiSemifinalsContent = `
                <div class="section-block">
                <h3 style="font-size: 11px; font-weight: bold; margin: 16px 0 2px 0; padding: 1px 2px; background: #eff6ff;">SEMIFINALE A</h3>
                <table style="margin-bottom: 2px;">
                    <tbody>
                        ${generateSemifinalRow(semifinalMatches[0])}
                    </tbody>
                </table>
                </div>
                ${semifinalMatches.length > 1 ? `
                <div class="section-block">
                <h3 style="font-size: 11px; font-weight: bold; margin: 12px 0 2px 0; padding: 1px 2px; background: #eff6ff;">SEMIFINALE B</h3>
                <table style="margin-bottom: 2px;">
                    <tbody>
                        ${generateSemifinalRow(semifinalMatches[1])}
                    </tbody>
                </table>
                </div>
                ` : ''}
            `;
        }
        
        // Finals content
        if (finalMatches.length > 0) {
            const generateFinalRow = (match: Match) => {
                const t1p1 = getPlayerById(match.team1[0]);
                const t1p2 = getPlayerById(match.team1[1]);
                const t2p1 = getPlayerById(match.team2[0]);
                const t2p2 = getPlayerById(match.team2[1]);
                if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return '';
                
                const team1Name = `${t1p1.name} ${t1p1.surname} & ${t1p2.name} ${t1p2.surname}`;
                const team2Name = `${t2p1.name} ${t2p1.surname} / ${t2p2.name} ${t2p2.surname}`;
                const scoreHtml = formatScoreBoxes(match.sets, tournament.status === 'scheduled');
                
                return `
                    <tr style="height: 16px;">
                        <td style="width: 37%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 9px; padding: 2px 3px; height: 16px; line-height: 1.0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team1Name}</td>
                        <td style="text-align: center; width: 26%; font-size: 9px; padding: 2px 3px; height: 16px; line-height: 1.0; white-space: nowrap;">
                            ${tournament.status === 'scheduled' ? 
                                '<span style="border: 1px solid #ccc; padding: 2px 8px; display: inline-block; font-size: 9px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 2px 8px; display: inline-block; font-size: 9px;">&nbsp;</span>' : 
                                scoreHtml
                            }
                        </td>
                        <td style="width: 37%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 9px; padding: 2px 3px; height: 16px; line-height: 1.0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team2Name}</td>
                    </tr>
                `;
            };
            
            gironiFinals34Content = `
                <div class="section-block">
                <h3 style="font-size: 11px; font-weight: bold; margin: 16px 0 2px 0; padding: 1px 2px; background: #ffe0b2;">FINALE 3° E 4° POSTO</h3>
                <table style="margin-bottom: 2px;">
                    <tbody>
                        ${generateFinalRow(finalMatches[0])}
                    </tbody>
                </table>
                </div>
            `;
            
            if (finalMatches.length > 1) {
                gironiFinalsContent = `
                    <div class="section-block">
                    <h3 style="font-size: 11px; font-weight: bold; margin: 12px 0 2px 0; padding: 1px 2px; background: #ffd700;">FINALISSIMA</h3>
                    <table style="margin-bottom: 2px;">
                        <tbody>
                            ${generateFinalRow(finalMatches[1])}
                        </tbody>
                    </table>
                    </div>
                `;
            }
        }
    }
    
    // For non-RoundRobinFinali and non-GironiFaseFinale tournaments, use all matches
    const matchesContent = !isRoundRobinFinali && !isGironiFaseFinale ? roundRobinContent : '';

    // Standings content - different for Americano vs regular tournaments
    const standingsContent = standings.map((entry, index) => {
        if (isAmericano) {
            // Americano: individual standings
            const player = entry.team[0]; // In Americano, each entry has only one player
            if (americanoScoringType === 'points') {
                // For "points" scoring: only show Punti Fatti and Punti Subiti
                return `
                    <tr style="height: 20px;">
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${index + 1}</td>
                        <td style="font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${player.name} ${player.surname}</td>
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.gamesWon}</td>
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.gamesLost}</td>
                    </tr>
                `;
            } else {
                // For "games-diff" scoring: show Games W, Games L, Differenza
                return `
                    <tr style="height: 20px;">
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${index + 1}</td>
                        <td style="font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${player.name} ${player.surname}</td>
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.gamesWon}</td>
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.gamesLost}</td>
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.gameDifference}</td>
                    </tr>
                `;
            }
        } else {
            // Regular tournaments: team standings
            return `
                <tr style="height: 20px;">
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${index + 1}</td>
                    <td style="font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.team[0].name} ${entry.team[0].surname} & ${entry.team[1].name} ${entry.team[1].surname}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.points}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.gamesWon}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.gamesLost}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${entry.gameDifference}</td>
                </tr>
            `;
        }
    }).join('');

    const content = `
        <style>
            @page {
                size: A4;
                margin: 12mm 10mm;
            }
            body {
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
                font-size: 11px;
                line-height: 1.3;
                margin: 0;
                padding: 0;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            h1 {
                font-size: 22px;
                margin: 0 0 3px 0;
                color: #111827;
                font-weight: bold;
            }
            h2 {
                font-size: 14px;
                margin: 0 0 2px 0;
                color: #666;
                font-weight: normal;
            }
            h3 {
                font-size: 13px;
                margin: 10px 0 3px 0;
                color: #000;
                font-weight: bold;
            }
            .separator {
                border-bottom: 1px solid #1e3a6e;
                margin: 5px 0;
            }
            .date-info {
                color: #111827;
                font-size: 13px;
                font-weight: bold;
                margin: 2px 0 0 0;
            }
            .team-box {
                text-align: center;
                font-weight: bold;
                padding: 2px 3px;
                background-color: #f0f5ff;
                border: 1px solid #c7d9f0;
                border-radius: 3px;
                font-size: 11px;
                line-height: 1.1;
                height: 60px;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
            .team-number {
                color: #111827;
                font-weight: bold;
                margin-bottom: 1px;
                font-size: 11px;
            }
            .score-box {
                background-color: #1e3a6e;
                color: white;
                padding: 5px 10px;
                border-radius: 3px;
                border: none;
                font-weight: bold;
                font-size: 12px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 24px;
            }
            .score-box-blank {
                background-color: white;
                border: 1px solid #c7d9f0;
                border-radius: 3px;
                padding: 5px 8px;
                margin: 0 1px;
                width: 30px;
                height: 30px;
                display: inline;
                font-size: 14px;
                font-weight: bold;
                color: #3b82f6;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 3px 0 6px 0;
                font-size: 11px;
            }
            th {
                background-color: #1e3a6e;
                color: white;
                padding: 5px 6px;
                text-align: left;
                font-weight: bold;
                font-size: 11px;
                height: 24px;
            }
            td {
                padding: 5px 6px;
                border-bottom: 1px solid #e5e7eb;
                vertical-align: middle;
                font-size: 11px;
                line-height: 1.3;
                height: 24px;
            }
            .court-cell {
                font-size: 10px;
                white-space: nowrap;
                width: 10%;
            }
            .team-name {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            tr:nth-child(even) {
                background-color: #f0f5ff;
            }
            /* Force UNIFORM row height 24px for ALL tables and ALL sections */
            table tbody tr {
                height: 24px !important;
            }
            table tbody td {
                height: 24px !important;
                padding: 5px 6px !important;
                font-size: 11px !important;
                line-height: 1.3 !important;
            }
            table thead tr {
                height: 24px !important;
            }
            table thead th {
                height: 24px !important;
                padding: 5px 6px !important;
                font-size: 11px !important;
            }
            .footer {
                margin-top: 10px;
                padding-top: 5px;
                border-top: 1px solid #e5e7eb;
                font-size: 8px;
                color: #666;
            }
            /* Le sezioni con molte partite devono poter continuare nella pagina
               successiva; righe e intestazioni dei turni restano invece unite. */
            .section-block {
                break-inside: auto;
                page-break-inside: auto;
            }
            tr.round-header {
                break-after: avoid;
                page-break-after: avoid;
            }
        </style>

        <div style="text-align: center; margin-bottom: 3px;">
            <h1>${safeDisplayName}</h1>
            <h2>${safeClubName} - ${escapeHtml(getTournamentTypeDisplayName(tournament.type))}</h2>
            <div class="date-info">Giornata del ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}</div>
        </div>

        <div class="separator"></div>

        ${!isAmericano ? `
        <div class="section-block">
            <h3 style="font-size: ${isGironiFaseFinale ? '11px' : '13px'}; font-weight: bold; margin: ${isGironiFaseFinale ? '8px' : '10px'} 0 3px 0;">SQUADRE</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 4px; margin-bottom: ${isGironiFaseFinale ? '12px' : '12px'};">
                ${teamsContent}
            </div>
        </div>
        ` : ''}

        ${isGironiFaseFinale ? `
        ${gironiContent}
        ${gironiStandingsContent}
        ${gironiSemifinalsContent}
        ${gironiFinals34Content}
        ${gironiFinalsContent}
        ` : isRoundRobinFinali && roundRobinMatchCount ? `
        <div class="section-block">
            <h3 style="margin-top: 12px;">Partite Round Robin</h3>
            <table>
                <thead>
                    <tr>
                        <th style="text-align: center;">Campo</th>
                        <th>Squadra A</th>
                        <th style="text-align: center;">Risultato</th>
                        <th>Squadra B</th>
                    </tr>
                </thead>
                <tbody>
                    ${roundRobinContent}
                </tbody>
            </table>
        </div>

        ${isFinalsCompleted && finalsContent ? `
        <div class="section-block">
            <h3 style="margin-top: 12px;">Finali</h3>
            <table>
                <thead>
                    <tr>
                        <th style="text-align: center;">Tipo</th>
                        <th>Squadra A</th>
                        <th style="text-align: center;">Risultato</th>
                        <th>Squadra B</th>
                    </tr>
                </thead>
                <tbody>
                    ${finalsContent}
                </tbody>
            </table>
        </div>
        ` : tournament.roundRobinPlayoffType === 'no_finals'
            ? ''
            : renderBlankFinalPhase(tournament.roundRobinPlayoffType === 'semifinals')}
        ` : `
        <div class="section-block">
            <h3 style="margin-top: 12px;">Partite e Risultati</h3>
            <table>
                <thead>
                    <tr>
                        <th style="text-align: center;">Campo</th>
                        <th>Squadra A</th>
                        <th style="text-align: center;">Risultato</th>
                        <th>Squadra B</th>
                    </tr>
                </thead>
                <tbody>
                    ${matchesContent}
                </tbody>
            </table>
        </div>
        `}

        ${tournament.status === 'completed' ? `
        <div class="section-block">
            <h3 style="font-size: ${isGironiFaseFinale ? '11px' : '13px'}; font-weight: bold; margin: ${isGironiFaseFinale ? '16px' : '14px'} 0 3px 0;">${isGironiFaseFinale ? 'CLASSIFICA' : 'Classifica Giornata'}</h3>
            <table style="margin-bottom: 2px;">
                <thead>
                    <tr>
                        <th style="text-align: center;">Pos</th>
                        <th>Squadra</th>
                        ${isAmericano && americanoScoringType === 'points' ? `
                            <th style="text-align: center;">Punti Fatti</th>
                            <th style="text-align: center;">Punti Subiti</th>
                        ` : isAmericano ? `
                            <th style="text-align: center;">Games V</th>
                            <th style="text-align: center;">Games P</th>
                            <th style="text-align: center;">Differenza</th>
                        ` : `
                            <th style="text-align: center;">Punti</th>
                            <th style="text-align: center;">Games V</th>
                            <th style="text-align: center;">Games P</th>
                            <th style="text-align: center;">Differenza</th>
                        `}
                    </tr>
                </thead>
                <tbody>
                    ${standingsContent}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">
                Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}
            </div>
            <div style="text-align: right; font-size: 8px;">
                ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
            </div>
        </div>
    `;

    return openPrintWindow(`${displayName.replace(' - ', ', ')}, Riepilogo Torneo, ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}`, content);
};

export const printTeamTournamentRoundRobinSchedule = (
    tournament: Pick<Tournament, 'name' | 'club' | 'type'>,
    config: TeamTournamentConfig,
    teams: TeamTournamentTeam[]
): boolean => {
    if (tournament.type !== TournamentType.TorneoASquadre) {
        showHIGAlert('Formato torneo non supportato per la stampa a squadre.');
        return false;
    }

    if (config.format !== 'ROUND ROBIN') {
        showHIGAlert('Stampa attualmente disponibile solo per Round Robin.');
        return false;
    }

    const schedule = (config.schedule || null) as TeamTournamentSchedule | null;
    if (!schedule || schedule.kind !== 'round_robin') {
        showHIGAlert('Calendario non disponibile. Completa la configurazione o modifica un parametro per rigenerarlo.');
        return false;
    }

    const teamNameByNumber = (teamNumber: number) => {
        const team = teams.find(t => t.teamNumber === teamNumber);
        return team?.name || `Squadra ${teamNumber}`;
    };

    // Defensive dedupe: some legacy/stale schedules could contain duplicates.
    const seenPairs = new Set<string>();
    const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

    const dayBlocks = schedule.days.map(day => {
        const byeLine = day.byeTeamNumber
            ? `<div class="bye-line">Riposa: <strong>${teamNameByNumber(day.byeTeamNumber)}</strong></div>`
            : '';

        const dayMatches = (day.matches || []).filter(match => {
            const key = pairKey(Number(match.team1Number), Number(match.team2Number));
            if (seenPairs.has(key)) return false;
            seenPairs.add(key);
            return true;
        });

        const matchRows = dayMatches.map(match => `
            <tr>
                <td style="text-align:center; width: 18%;">Partita ${match.matchNumber}</td>
                <td style="width: 41%;">${teamNameByNumber(match.team1Number)}</td>
                <td style="text-align:center; width: 41%;">${teamNameByNumber(match.team2Number)}</td>
            </tr>
        `).join('');

        return `
            <div class="day-block avoid-break">
                <h3>Giornata ${day.dayNumber} di ${schedule.days.length}</h3>
                ${byeLine}
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:center; width: 18%;">Match</th>
                            <th style="width: 41%;">Squadra A</th>
                            <th style="text-align:center; width: 41%;">Squadra B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${matchRows}
                    </tbody>
                </table>
            </div>
        `;
    }).join('');

	    const content = `
	        <style>
	            @page { size: A4; margin: 12mm 10mm; }
	            body {
	                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
	                font-size: 11px;
	                line-height: 1.3;
	                margin: 0;
	                padding: 0;
	                background: white;
	                -webkit-print-color-adjust: exact;
	                print-color-adjust: exact;
	            }
	            h1 {
	                font-size: 22px;
	                margin: 0 0 6px 0;
	                color: #111827;
	                font-weight: bold;
	                text-align: center;
	            }
	            h2 {
	                font-size: 14px;
	                margin: 0 0 10px 0;
	                color: #666;
	                font-weight: normal;
	                text-align: center;
	            }
            .separator { border-bottom: 3px solid #1e3a6e; margin: 16px 0; }
            .day-block { margin-bottom: 16px; }
            h3 {
                font-size: 13px;
                margin: 10px 0 5px 0;
                color: #000;
                font-weight: bold;
            }
            .bye-line {
                margin: 0 0 8px 0;
                font-size: 11px;
                color: #374151;
            }
            table { width: 100%; border-collapse: collapse; margin: 6px 0 12px 0; font-size: 11px; }
            th { background-color: #1e3a6e; color: white; padding: 6px 10px; text-align: left; font-weight: bold; font-size: 11px; border: 1px solid #1e3a6e; }
            td {
                padding: 5px 6px;
                border-bottom: 1px solid #e5e7eb;
                font-size: 11px;
            }
            tr:nth-child(even) { background-color: #f0f5ff; }
            .footer {
                margin-top: 14px;
                padding-top: 8px;
                border-top: 1px solid #e5e7eb;
                font-size: 8px;
                color: #666;
            }
        </style>
        <div class="print-page">
        <h1>${tournament.name}</h1>
        <h2>${tournament.club}</h2>
        <div class="separator"></div>
        ${dayBlocks}
        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}</div>
            <div style="text-align: right; font-size: 8px;">${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}</div>
        </div>
        </div>
    `;

    const printTitle = `${tournament.name.replace(' - ', ', ')}, Calendario Round Robin, ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}`;
    return openPrintWindow(printTitle, content);
};

export const printTeamTournamentMatchdayCalendar = (
    tournament: Pick<Tournament, 'name' | 'club' | 'type'>,
    matchday: Pick<TeamTournamentMatchday, 'date' | 'roundNumber' | 'matchesPerDay' | 'subMatches'>,
    team1Name: string,
    team2Name: string
): boolean => {
    if (tournament.type !== TournamentType.TorneoASquadre) {
        showHIGAlert('Formato torneo non supportato per la stampa a squadre.');
        return false;
    }

    // Copy the same visual language as other tournaments' blank printouts:
    // table layout + empty fields for handwriting results.
    const matchesContent = (matchday.subMatches || []).map((sm, idx) => {
        const t1Players = (sm.team1Players || []).map(p => `${p.name} ${p.surname}`.trim()).join(' & ');
        const t2Players = (sm.team2Players || []).map(p => `${p.name} ${p.surname}`.trim()).join(' & ');

        return `
            <tr style="height: 22px;">
                <td style="text-align: center; width: 25%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                    Partita ${idx + 1}
                </td>
                <td style="width: 32.5%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">
                    ${t1Players}
                </td>
                <td style="text-align: center; width: 20%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">
                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 13px;">&nbsp;</span>
                    -
                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 13px;">&nbsp;</span>
                </td>
                <td style="width: 32.5%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">
                    ${t2Players}
                </td>
            </tr>
        `;
    }).join('');

	    const content = `
	        <style>
	            @page {
	                size: A4;
	                margin: 12mm 10mm;
	            }
	            body {
	                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
	                font-size: 11px;
	                line-height: 1.3;
	                margin: 0;
	                padding: 0;
	                background: white;
	                -webkit-print-color-adjust: exact;
	                print-color-adjust: exact;
	            }
	            h1 {
	                font-size: 22px;
	                margin: 0 0 10px 0;
	                color: #111827;
	                font-weight: bold;
	                text-align: center;
	            }
	            h2 {
	                font-size: 14px;
	                margin: 0 0 10px 0;
	                color: #666;
	                font-weight: normal;
	                text-align: center;
	            }
            .separator {
                border-bottom: 3px solid #1e3a6e;
                margin: 16px 0;
            }
            .meta {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                font-size: 11px;
                color: #374151;
                margin-bottom: 8px;
            }
            .big-vs {
                text-align: center;
                font-size: 14px;
                margin: 8px 0 12px 0;
                color: #111;
            }
            .big-team {
                font-weight: 700;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th {
                background: #f8fafc;
                color: white;
                font-size: 11px;
                padding: 5px 6px;
                text-align: center;
                border: 1px solid #e5e7eb;
            }
            td {
                border: 1px solid #e5e7eb;
            }
            .footer {
                margin-top: 14px;
                padding-top: 8px;
                border-top: 1px solid #e5e7eb;
                font-size: 8px;
                color: #666;
            }
        </style>
        <div class="print-page">
        <h1>${tournament.name}</h1>
        <h2>${tournament.club}</h2>
        <div class="separator"></div>
        <div class="meta">
            <div>${new Date(matchday.date).toLocaleDateString('it-IT').replace(/\//g, '.')}</div>
            <div>${matchday.roundNumber ? `Giornata ${matchday.roundNumber}` : ''}</div>
        </div>
        <div class="big-vs">
            <span class="big-team">${team1Name}</span>
            <span style="font-weight: 400; margin: 0 8px;">vs</span>
            <span class="big-team">${team2Name}</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th style="width: 15%;">&nbsp;</th>
                    <th style="width: 32.5%;">Squadra A</th>
                    <th style="width: 20%;">Risultato</th>
                    <th style="width: 32.5%;">Squadra B</th>
                </tr>
            </thead>
            <tbody>
                ${matchesContent}
            </tbody>
        </table>
        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}</div>
            <div style="text-align: right; font-size: 8px;">${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}</div>
        </div>
        </div>
    `;

    const printTitle = `${tournament.name.replace(' - ', ', ')}, Calendario Giornata, ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}`;
    return openPrintWindow(printTitle, content);
};

const teamTournamentScoreIsBlank = (sets: any): boolean => {
    if (!Array.isArray(sets) || sets.length === 0) return true;
    return sets.every((s: any) => Number(s?.team1 || 0) === 0 && Number(s?.team2 || 0) === 0);
};

const expectedTeamTournamentTotalMatchdays = (config: TeamTournamentConfig): number => {
    const schedule = (config.schedule || null) as TeamTournamentSchedule | null;
    const rr = (schedule && schedule.kind === 'round_robin' && Array.isArray(schedule.days))
        ? schedule.days.reduce((sum, d: any) => sum + ((Array.isArray(d?.matches) ? d.matches.length : 0)), 0)
        : 0;

    // Playoffs are part of the tournament; show them in the "Partite Giocate: X di Y" progress.
    // FINALI: 1 matchday (1-2)
    // SEMIFINALI E FINALI: 4 matchdays (2 semifinali + 2 finali)
    // QUARTI, SEMIFINALI E FINALI: 8 matchdays (4 quarti + 2 semifinali + 2 finali)
    let finals = 0;
    if (String(config.format || 'ROUND ROBIN') === 'ROUND ROBIN') {
        if (config.roundRobinFinalPhase === 'FINALI') finals = 1;
        if (config.roundRobinFinalPhase === 'SEMIFINALI E FINALI') finals = 4;
        if (config.roundRobinFinalPhase === 'QUARTI, SEMIFINALI E FINALI') finals = 8;
    }

    // Guard rails: if the tournament doesn't have enough teams, don't count an impossible finals phase.
    const teamCount = Number((config as any)?.initialTeamCount || 0);
    if (teamCount > 0 && teamCount < 4) finals = 0;
    if (teamCount > 0 && teamCount < 8 && config.roundRobinFinalPhase === 'QUARTI, SEMIFINALI E FINALI') finals = 0;

    return rr + finals;
};

const expectedTeamTournamentRoundRobinMatchdays = (config: TeamTournamentConfig): number => {
    const schedule = (config.schedule || null) as TeamTournamentSchedule | null;
    if (schedule && schedule.kind === 'round_robin' && Array.isArray(schedule.days)) {
        return schedule.days.reduce((sum, d: any) => sum + ((Array.isArray(d?.matches) ? d.matches.length : 0)), 0);
    }
    const teamCount = Number((config as any)?.initialTeamCount || 0);
    if (!Number.isFinite(teamCount) || teamCount < 2) return 0;
    return Math.floor((teamCount * (teamCount - 1)) / 2);
};

const renderTeamTournamentStandingsTable = (
    standings: TeamTournamentStandingRow[],
    scoringType: TeamTournamentConfig['scoringType'],
    title: string,
    progress?: { played: number; total: number; provisional: boolean },
    qualifiedTeamNumbers: number[] = []
) => {
    const keyLabel = scoringType === 'Differenza Games' ? 'Diff' : 'Pt';

    // Always show G - V - P and Win%
	    const thStyle = 'background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb;';
	    const header = `<tr>
	            <th style="${thStyle} text-align:center; font-size: 10px; padding: 6px 6px;">Pos</th>
	            <th style="${thStyle} text-align:left; font-size: 10px; padding: 6px 6px;">Squadra</th>
	            <th style="${thStyle} text-align:center; font-size: 10px; padding: 6px 6px;">${keyLabel}</th>
	            <th style="${thStyle} text-align:center; font-size: 10px; padding: 6px 6px;">G</th>
	            <th style="${thStyle} text-align:center; font-size: 10px; padding: 6px 6px;">V</th>
	            <th style="${thStyle} text-align:center; font-size: 10px; padding: 6px 6px;">P</th>
	            <th style="${thStyle} text-align:center; font-size: 10px; padding: 6px 6px;">%</th>
	            <th style="${thStyle} text-align:center; font-size: 10px; padding: 6px 6px;">GF</th>
	            <th style="${thStyle} text-align:center; font-size: 10px; padding: 6px 6px;">GS</th>
	        </tr>`;

    const rows = standings.map((r, idx) => {
        const winPct = r.played > 0 ? Math.round((r.won / r.played) * 100) : 0;
        const keyValue = scoringType === 'Differenza Games' ? (r.gamesDiff >= 0 ? `+${r.gamesDiff}` : `${r.gamesDiff}`) : String(r.points);
        const isQualified = qualifiedTeamNumbers.includes(r.teamNumber);
        // Round Robin standings: no medals here; only highlight qualified teams (if applicable).
        const rowStyle = isQualified ? 'background: #dcfce7;' : '';

        return `
            <tr style="height: 20px; ${rowStyle}">
                <td style="text-align:center; font-size: 10px; padding: 3px 4px;">${idx + 1}</td>
                <td style="font-size: 10px; padding: 3px 4px;">${r.teamName}</td>
                <td style="text-align:center; font-size: 10px; padding: 3px 4px;">${keyValue}</td>
                <td style="text-align:center; font-size: 10px; padding: 3px 4px;">${r.played}</td>
                <td style="text-align:center; font-size: 10px; padding: 3px 4px;">${r.won}</td>
                <td style="text-align:center; font-size: 10px; padding: 3px 4px;">${r.lost}</td>
                <td style="text-align:center; font-size: 10px; padding: 3px 4px;">${winPct}%</td>
                <td style="text-align:center; font-size: 10px; padding: 3px 4px;">${r.gamesFor}</td>
                <td style="text-align:center; font-size: 10px; padding: 3px 4px;">${r.gamesAgainst}</td>
            </tr>
        `;
    }).join('');

        const finalTitle = progress?.provisional ? 'Classifica Provvisoria' : 'Classifica Finale Round Robin';
    const progressLine = progress
        ? `<div style="margin: 0 0 6px 0; font-size: 10px; color: #6b7280; font-weight: 700;">
                Partite Giocate: ${progress.played} di ${progress.total}
           </div>`
        : '';

    return `
        <div class="section-block" style="margin-top: 14px;">
        <h3 style="font-size: 13px; font-weight: bold; margin: 0 0 4px 0;">${finalTitle}</h3>
        ${progressLine}
	        <table style="width: 100%; border-collapse: collapse;">
	            <thead>
	                ${header}
	            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
        </div>
    `;
};

const getQualifiedTeamCount = (config: TeamTournamentConfig): number => {
    if (config.roundRobinFinalPhase === 'FINALI') return 2;
    if (config.roundRobinFinalPhase === 'SEMIFINALI E FINALI') return 4;
    if (config.roundRobinFinalPhase === 'QUARTI, SEMIFINALI E FINALI') return 8;
    return 0;
};

const teamTournamentFixturePhaseLabel = (phase: TeamTournamentFixture['phase'], slot: number) => {
    if (phase === 'round_of_32') return `${slot}° Trentaduesimo`;
    if (phase === 'round_of_16') return `${slot}° Ottavo di Finale`;
    if (phase === 'quarterfinal') return `${slot}° Quarto di Finale`;
    if (phase === 'semifinal') return `${slot}^ Semifinale`;
    if (phase === 'final_3_4') return 'Finale 3° e 4° Posto';
    if (phase === 'final_1_2') return 'Finale 1° e 2° Posto';
    return phase;
};

const TEAM_ELIMINATION_PHASES: TeamTournamentFixture['phase'][] = ['round_of_32', 'round_of_16', 'quarterfinal', 'semifinal', 'final_1_2'];

const isTeamTournamentEliminationDirect = (config: TeamTournamentConfig | null | undefined) =>
    String(config?.format || '') === 'ELIMINAZIONE DIRETTA';

const getTeamTournamentScoreValue = (summary: any, teamProp: 'team1Wins' | 'team2Wins', config?: TeamTournamentConfig | null | undefined) => {
    if (!summary) return null;
    if (config?.scoringType === 'Differenza Games') {
        const val = summary[teamProp.replace('Wins', 'Games')];
        return Number.isFinite(Number(val)) ? Number(val) : '';
    } else {
        const pts = summary[teamProp.replace('Wins', 'Points')];
        if (pts !== undefined && pts !== null) return Number(pts);
        const wins = summary[teamProp];
        return Number.isFinite(Number(wins)) ? Number(wins) : '';
    }
};

const buildTeamTournamentFixtureContext = (
    teams: TeamTournamentTeam[],
    fixtures: TeamTournamentFixture[],
    matchdays: TeamTournamentMatchday[],
    config?: TeamTournamentConfig | null
) => {
    const teamNameByNumber = (teamNumber: number | null | undefined) => {
        if (!teamNumber) return 'BYE';
        const team = teams.find(t => t.teamNumber === teamNumber);
        return team?.name || `Squadra ${teamNumber}`;
    };

    const matchdayByTournamentDayId = new Map<string, TeamTournamentMatchday>();
    matchdays.forEach(md => {
        matchdayByTournamentDayId.set(md.tournamentDayId, md);
    });

    const fixtureByPhaseSlot = new Map<string, TeamTournamentFixture>();
    fixtures.forEach(fixture => {
        fixtureByPhaseSlot.set(`${fixture.phase}:${fixture.slot}`, fixture);
    });

    const getFixtureSummary = (fixture: TeamTournamentFixture) => {
        const matchday = fixture.tournamentDayId ? (matchdayByTournamentDayId.get(fixture.tournamentDayId) || null) : null;
        const summary = matchday?.summary || null;
        const swap = !!(matchday && fixture.team1Number && fixture.team2Number && matchday.team1Number !== fixture.team1Number);
        const team1Wins = summary ? getTeamTournamentScoreValue(summary, swap ? 'team2Wins' : 'team1Wins', config) : null;
        const team2Wins = summary ? getTeamTournamentScoreValue(summary, swap ? 'team1Wins' : 'team2Wins', config) : null;

        return {
            matchday,
            summary,
            leftName: fixture.team1Number ? teamNameByNumber(fixture.team1Number) : 'BYE',
            rightName: fixture.team2Number ? teamNameByNumber(fixture.team2Number) : 'BYE',
            score: (team1Wins !== null && team2Wins !== null) ? `${team1Wins}-${team2Wins}` : '',
        };
    };

    const resolveFixtureName = (fixture: TeamTournamentFixture, side: 'left' | 'right') => {
        const teamNumber = side === 'left' ? fixture.team1Number : fixture.team2Number;
        if (teamNumber) return teamNameByNumber(teamNumber);
        if (fixture.isBye) return 'BYE';
        const dep = fixture.dependsOn;
        if (!dep) return 'Da definire';
        if (dep.type === 'winners' && Array.isArray(dep.slots)) {
            const sourceSlot = side === 'left' ? dep.slots[0] : dep.slots[1];
            const sourceFixture = fixtureByPhaseSlot.get(`${dep.from}:${sourceSlot}`);
            if (sourceFixture?.winnerTeamNumber) return teamNameByNumber(sourceFixture.winnerTeamNumber);
            // If the upstream fixture is completed but has no winner (e.g. BYE vs BYE),
            // render it explicitly as BYE instead of a misleading placeholder.
            if (sourceFixture?.status === 'completed' && !sourceFixture.winnerTeamNumber) return 'BYE';
            return `Vincente ${teamTournamentFixturePhaseLabel(dep.from, sourceSlot)}`;
        }
        if (dep.type === 'losers' && Array.isArray(dep.slots)) {
            const sourceSlot = side === 'left' ? dep.slots[0] : dep.slots[1];
            const sourceFixture = fixtureByPhaseSlot.get(`${dep.from}:${sourceSlot}`);
            if (sourceFixture?.loserTeamNumber) return teamNameByNumber(sourceFixture.loserTeamNumber);
            if (sourceFixture?.status === 'completed' && !sourceFixture.loserTeamNumber) return 'BYE';
            return `Perdente ${teamTournamentFixturePhaseLabel(dep.from, sourceSlot)}`;
        }
        return 'Da definire';
    };

    return {
        teamNameByNumber,
        matchdayByTournamentDayId,
        fixtureByPhaseSlot,
        getFixtureSummary,
        resolveFixtureName,
    };
};

const renderTeamTournamentEliminationBracket = (
    teams: TeamTournamentTeam[],
    fixtures: TeamTournamentFixture[],
    matchdays: TeamTournamentMatchday[],
    config?: TeamTournamentConfig | null
) => {
    const { getFixtureSummary, resolveFixtureName } = buildTeamTournamentFixtureContext(teams, fixtures, matchdays, config);
    const grouped = TEAM_ELIMINATION_PHASES
        .map(phase => ({
            phase,
            label: phase === 'final_1_2' ? 'Finale' : teamTournamentFixturePhaseLabel(phase, 1).replace(/^\d+[°^]\s*/, ''),
            fixtures: fixtures.filter(f => f.phase === phase).sort((a, b) => a.slot - b.slot),
        }))
        .filter(group => group.fixtures.length > 0);

    if (grouped.length === 0) {
        return '<div style="font-size: 12px; color: #6b7280; text-align: center;">Tabellone non ancora disponibile.</div>';
    }

    const columns = grouped.map(group => {
        const cards = group.fixtures.map(fixture => {
            const summary = getFixtureSummary(fixture);
            const leftName = resolveFixtureName(fixture, 'left');
            const rightName = resolveFixtureName(fixture, 'right');
            const isCompleted = fixture.status === 'completed';
            const isFinal = fixture.phase === 'final_1_2';
            const badge = fixture.isBye
                ? '<span class="bracket-badge">BYE</span>'
                : summary.score
                    ? `<span class="bracket-badge bracket-badge-score">${summary.score}</span>`
                    : (isCompleted ? '<span class="bracket-badge bracket-badge-score">CHIUSA</span>' : '');
            const dateLine = summary.matchday?.date
                ? `<div class="bracket-date">${new Date(summary.matchday.date).toLocaleDateString('it-IT').replace(/\//g, '.')}</div>`
                : '<div class="bracket-date bracket-date-empty"> </div>';

            return `
                <div class="bracket-match ${isFinal ? 'bracket-match-final' : ''} ${isCompleted ? 'bracket-match-completed' : ''}">
                    <div class="bracket-match-head">
                        <span class="bracket-slot">${teamTournamentFixturePhaseLabel(fixture.phase, fixture.slot)}</span>
                        ${badge}
                    </div>
                    ${dateLine}
                    <div class="bracket-team-row">${leftName}</div>
                    <div class="bracket-team-row">${rightName}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="bracket-column">
                <div class="bracket-column-title">${group.label}</div>
                <div class="bracket-column-body">${cards}</div>
            </div>
        `;
    }).join('');

    return `
        <div id="landscape-content">
            <div class="bracket-grid">
                ${columns}
            </div>
        </div>
    `;
};

const renderTeamTournamentEliminationCompletedFixtures = (
    teams: TeamTournamentTeam[],
    fixtures: TeamTournamentFixture[],
    matchdays: TeamTournamentMatchday[],
    currentMatchdayId?: string | null,
    config?: TeamTournamentConfig | null | undefined
) => {
    const { getFixtureSummary } = buildTeamTournamentFixtureContext(teams, fixtures, matchdays, config);
    const completed = fixtures
        .filter(fixture => fixture.status === 'completed' && !fixture.isBye)
        .sort((a, b) => {
            const phaseDelta = TEAM_ELIMINATION_PHASES.indexOf(a.phase) - TEAM_ELIMINATION_PHASES.indexOf(b.phase);
            if (phaseDelta !== 0) return phaseDelta;
            return a.slot - b.slot;
        });

    if (completed.length === 0) {
        return `
            <div style="border: 1px solid #e5e7eb; padding: 10px 12px; background: #ffffff; font-size: 11px; color: #6b7280;">
                Nessuna sfida completata finora.
            </div>
        `;
    }

    return completed.map(fixture => {
        const summary = getFixtureSummary(fixture);
        const isCurrent = !!(currentMatchdayId && summary.matchday?.id === currentMatchdayId);
        const score = summary.score || 'In attesa';
        const dateText = summary.matchday?.date ? new Date(summary.matchday.date).toLocaleDateString('it-IT').replace(/\//g, '.') : 'Data da definire';
        return `
            <div style="border: 1px solid ${isCurrent ? '#38bdf8' : '#e5e7eb'}; background: ${isCurrent ? '#eff6ff' : '#ffffff'}; padding: 9px 11px; margin-top: 8px;" class="avoid-break">
                <div style="display:flex; justify-content: space-between; gap: 10px; align-items: center;">
                    <div style="font-size: 11px; font-weight: 900; color: #0f172a;">${teamTournamentFixturePhaseLabel(fixture.phase, fixture.slot)}</div>
                    <div style="font-size: 10px; color: #6b7280;">${dateText}</div>
                </div>
                <div style="margin-top: 5px; font-size: 12px; color: #111; text-align: center;">
                    <strong>${summary.leftName}</strong> vs <strong>${summary.rightName}</strong>
                </div>
                <div style="margin-top: 6px; text-align: center;">
                    <span style="display:inline-block; padding: 4px 10px; background: #16a34a; color: #fff; font-size: 11px; font-weight: 900; border-radius: 3px;">${score}</span>
                </div>
            </div>
        `;
    }).join('');
};

export const printTeamTournamentMatchdayReport = (
    tournament: Pick<Tournament, 'name' | 'club' | 'type'>,
    config: TeamTournamentConfig,
    teams: TeamTournamentTeam[],
    allMatchdays: TeamTournamentMatchday[],
    matchday: TeamTournamentMatchday,
    fixtures: TeamTournamentFixture[] = [],
    existingWindow?: Window | null
): boolean => {
    if (tournament.type !== TournamentType.TorneoASquadre) {
        showHIGAlert('Formato torneo non supportato per la stampa a squadre.');
        return false;
    }

    const matchdayId = matchday.id;

    const teamNameByNumber = (teamNumber: number) => {
        const team = teams.find(t => t.teamNumber === teamNumber);
        return team?.name || `Squadra ${teamNumber}`;
    };

    const team1Name = teamNameByNumber(matchday.team1Number);
    const team2Name = teamNameByNumber(matchday.team2Number);
    const printTitle = `${team1Name} VS ${team2Name} - ${new Date(matchday.date || new Date()).toLocaleDateString('it-IT').replace(/\//g, '.')}`;

    const visibleSubMatches = (matchday.subMatches || []).filter(sm => !sm.cancelled);

    const matchRows = visibleSubMatches.map((sm, idx) => {
        const t1Players = (sm.team1Players || []).map(p => `${p.name} ${p.surname}`.trim()).join(' & ');
        const t2Players = (sm.team2Players || []).map(p => `${p.name} ${p.surname}`.trim()).join(' & ');
        const sets = sm.sets;
        const scoreTextHtml = formatScoreBoxes(sets, false);
        
        const t1Won = sm.winner === 'team1';
        const t2Won = sm.winner === 'team2';
        const t1Weight = t1Won ? 'bold' : 'normal';
        const t2Weight = t2Won ? 'bold' : 'normal';

        return `
            <tr style="height: 20px;">
                <td style="text-align: center; width: 10%; font-size: 10px; padding: 3px 4px;">Partita ${idx + 1}</td>
                <td style="width: 32%; text-align: right; font-size: 11px; padding: 3px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${t1Weight};">${t1Players}</td>
                <td style="text-align: center; width: 26%; font-size: 11px; padding: 3px 4px; white-space: nowrap;">
                    ${scoreTextHtml}
                </td>
                <td style="width: 32%; text-align: left; font-size: 11px; padding: 3px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${t2Weight};">${t2Players}</td>
            </tr>
        `;
    }).join('');

    const s = matchday.summary || null;
	    const finalLine = s
	        ? (() => {
	            const t1w = Number.isFinite(Number(s.team1Wins)) ? Number(s.team1Wins) : '';
	            const t2w = Number.isFinite(Number(s.team2Wins)) ? Number(s.team2Wins) : '';
	            const t1p = getTeamTournamentScoreValue(s, 'team1Wins', config);
	            const t2p = getTeamTournamentScoreValue(s, 'team2Wins', config);
	            const t1g = Number.isFinite(Number(s.team1Games)) ? Number(s.team1Games) : '';
	            const t2g = Number.isFinite(Number(s.team2Games)) ? Number(s.team2Games) : '';

	            const twoRowTable = (leftLabel: string, leftValue: any, rightLabel: string, rightValue: any) => `
	                <table style="width: 100%; border-collapse: collapse;">
	                    <tr>
	                        <td style="padding: 7px 9px; font-size: 12px; font-weight: 700; color: #111;">${leftLabel}</td>
	                        <td style="padding: 7px 9px; font-size: 14px; font-weight: 800; color: #111; text-align: right; width: 52px;">${leftValue}</td>
	                    </tr>
	                    <tr>
	                        <td style="padding: 7px 9px; font-size: 12px; font-weight: 700; color: #111; border-top: 1px solid #e5e7eb;">${rightLabel}</td>
	                        <td style="padding: 7px 9px; font-size: 14px; font-weight: 800; color: #111; text-align: right; width: 52px; border-top: 1px solid #e5e7eb;">${rightValue}</td>
	                    </tr>
	                </table>
	            `;

	            const block = (title: string, accentBg: string, bodyHtml: string) => `
	                <div style="border: 1px solid #e5e7eb; overflow: hidden;">
	                    <div style="background: ${accentBg}; color: white; font-weight: 900; font-size: 10px; padding: 6px 10px; letter-spacing: 0.05em; text-transform: uppercase;">
	                        ${title}
	                    </div>
	                    <div style="background: white;">
	                        ${bodyHtml}
	                    </div>
	                </div>
	            `;

            const resultBlock = block(
                'Risultato finale',
                '#1e3a6e',
                twoRowTable(team1Name, t1w, team2Name, t2w)
            );

	            const scoringBlock = (config.scoringType === 'Punti' || config.scoringType === 'Punti + Resilienza')
	                ? block(
	                    'Punti',
	                    '#1e3a6e',
	                    twoRowTable(team1Name, t1p, team2Name, t2p)
	                )
	                : block(
	                    'Games',
	                    '#FF9500',
	                    twoRowTable(team1Name, t1g, team2Name, t2g)
	                );

	            return `
	                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
	                    ${resultBlock}
	                    ${scoringBlock}
	                </div>
	            `;
	        })()
	        : '';

    if (isTeamTournamentEliminationDirect(config)) {
        const fixtureSlot = fixtures.find(f => f.matchdayId === matchday.id || f.tournamentDayId === matchday.tournamentDayId)?.slot ?? 1;
        const phaseLabel = matchday.phase && matchday.phase !== 'round_robin'
            ? teamTournamentFixturePhaseLabel(matchday.phase, fixtureSlot)
            : 'Sfida a eliminazione diretta';
        const reminderHtml = renderTeamTournamentEliminationCompletedFixtures(teams, fixtures, allMatchdays, matchday.id, config);
        const eliminationContent = `
            <style>
                @page { size: A4; margin: 12mm 10mm; }
                body {
                    font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
                    font-size: 11px;
                    line-height: 1.3;
                    margin: 0;
                    padding: 0;
                    background: white;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                h1 { font-size: 22px; margin: 0 0 8px 0; color: #111827; font-weight: bold; text-align: center; }
                h2 { font-size: 14px; margin: 0 0 10px 0; color: #666; font-weight: normal; text-align: center; }
                .separator { border-bottom: 3px solid #1e3a6e; margin: 16px 0; }
                .meta { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; color: #374151; margin-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #1e3a6e; color: white; font-size: 11px; padding: 5px 6px; text-align: center; border: 1px solid #e5e7eb; }
                td { border: 1px solid #e5e7eb; }
                .avoid-break { break-inside: avoid; page-break-inside: avoid; }
                @media print {
                    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
                    tr { break-inside: avoid; page-break-inside: avoid; }
                }
                .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 8px; color: #666; }
            </style>
            <div class="print-page">
                <h1>${tournament.name}</h1>
                <h2>${tournament.club}</h2>
                ${matchday.status !== 'completed' ? `
                <div style="display:flex; justify-content:center; margin: 0 0 8px 0;">
                    <div style="display:inline-flex; align-items:center; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:999px; padding:4px 10px; font-size:11px; font-weight:800;">
                        Dati parziali - Giornata da completare
                    </div>
                </div>
                ` : ''}
                <div class="separator"></div>
                <div class="meta">
                    <div>${new Date(matchday.date).toLocaleDateString('it-IT').replace(/\//g, '.')}</div>
                    <div>${phaseLabel}</div>
                </div>
                <div style="text-align:center; font-size: 16px; margin: 8px 0 12px 0; color: #111;">
                    <span style="font-weight: 700;">${team1Name}</span>
                    <span style="font-weight: 400; margin: 0 8px;">vs</span>
                    <span style="font-weight: 700;">${team2Name}</span>
                </div>
                <div class="avoid-break">
                    <table>
                        <tbody>
                            ${matchRows}
                        </tbody>
                    </table>
                </div>
                ${finalLine ? `<div class="avoid-break"><div class="separator" style="margin: 12px 0 12px 0;"></div>${finalLine}</div>` : ''}
                <div class="separator" style="margin: 12px 0 12px 0;"></div>
                <div class="avoid-break">
                    <h3 style="font-size: 13px; font-weight: 900; margin: 0 0 8px 0; padding: 7px 10px; background: #1e3a6e; color: #ffffff;">
                        Riepilogo tabellone
                    </h3>
                    ${reminderHtml}
                </div>
                <div class="footer">
                    <div style="text-align: left; margin-bottom: 4px;">Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}</div>
                    <div style="text-align: right; font-size: 8px;">${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}</div>
                </div>
            </div>
        `;

        return openPrintWindow(printTitle, eliminationContent, '', existingWindow);
    }

    const standingsCtx = (() => {
        const idx = allMatchdays.findIndex(md => md.id === matchdayId);
        const slice = idx >= 0 ? allMatchdays.slice(0, idx + 1) : allMatchdays;
        const totalTournament = expectedTeamTournamentTotalMatchdays(config);
        const playedTournament = slice.filter(md => md.status === 'completed' && md.summary).length;
        const totalRoundRobin = expectedTeamTournamentRoundRobinMatchdays(config);
        const playedRoundRobin = slice
            .filter(md => (md.phase ?? 'round_robin') === 'round_robin')
            .filter(md => md.status === 'completed' && md.summary).length;
        return {
            standings: calculateTeamTournamentStandings(teams, slice, config.scoringType),
            playedRoundRobin,
            totalRoundRobin,
            playedTournament,
            totalTournament,
        };
    })();

    const standingsHtml = renderTeamTournamentStandingsTable(
        standingsCtx.standings,
        config.scoringType,
        'Classifica',
        {
            played: standingsCtx.playedRoundRobin,
            total: standingsCtx.totalRoundRobin,
            provisional: standingsCtx.playedRoundRobin < standingsCtx.totalRoundRobin
        },
        standingsCtx.playedRoundRobin >= standingsCtx.totalRoundRobin
            ? standingsCtx.standings.slice(0, getQualifiedTeamCount(config)).map(r => r.teamNumber)
            : []
    );

		    const content = `
		        <style>
		            @page { size: A4; margin: 12mm 10mm; }
		            body {
		                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
		                font-size: 11px;
		                line-height: 1.3;
		                margin: 0;
		                padding: 0;
		                background: white;
		                -webkit-print-color-adjust: exact;
		                print-color-adjust: exact;
		            }
		            h1 { font-size: 22px; margin: 0 0 8px 0; color: #111827; font-weight: bold; text-align: center; }
		            h2 { font-size: 14px; margin: 0 0 10px 0; color: #666; font-weight: normal; text-align: center; }
		            .separator { border-bottom: 3px solid #1e3a6e; margin: 16px 0; }
		            .meta { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; color: #374151; margin-bottom: 10px; }
		            table { width: 100%; border-collapse: collapse; }
		            th { background: #1e3a6e; color: white; font-size: 11px; padding: 5px 6px; text-align: center; border: 1px solid #e5e7eb; }
		            td { border: 1px solid #e5e7eb; }
	            .avoid-break { break-inside: avoid; page-break-inside: avoid; }
	            @media print {
	                .avoid-break { break-inside: avoid; page-break-inside: avoid; }
	                tr { break-inside: avoid; page-break-inside: avoid; }
	            }
                .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 8px; color: #666; }
	        </style>
	        <div class="print-page">
	        <h1>${tournament.name}</h1>
	        <h2>${tournament.club}</h2>
                ${matchday.status !== 'completed' ? `
                <div style="display:flex; justify-content:center; margin: 0 0 8px 0;">
                    <div style="display:inline-flex; align-items:center; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:999px; padding:4px 10px; font-size:11px; font-weight:800;">
                        Dati parziali - Giornata da completare
                    </div>
                </div>
                ` : ''}
	        <div class="separator"></div>
	        <div class="meta">
	            <div>${new Date(matchday.date).toLocaleDateString('it-IT').replace(/\//g, '.')}</div>
	            <div>${matchday.roundNumber ? `Giornata ${matchday.roundNumber}` : ''}</div>
	        </div>
	        <div style="text-align:center; font-size: 16px; margin: 8px 0 12px 0; color: #111;">
	            <span style="font-weight: 700;">${team1Name}</span>
	            <span style="font-weight: 400; margin: 0 8px;">vs</span>
	            <span style="font-weight: 700;">${team2Name}</span>
	        </div>
	        <div class="avoid-break">
	            <table>
	                <tbody>
	                    ${matchRows}
	                </tbody>
	            </table>
	        </div>
	        ${finalLine ? `<div class="avoid-break"><div class="separator" style="margin: 12px 0 12px 0;"></div>${finalLine}<div class="separator" style="margin: 12px 0 12px 0;"></div></div>` : ''}
	        <div class="avoid-break">
	            ${standingsHtml}
	        </div>
            <div class="footer">
                <div style="text-align: left; margin-bottom: 4px;">Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}</div>
                <div style="text-align: right; font-size: 8px;">${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}</div>
            </div>
            </div>
	    `;

    return openPrintWindow(printTitle, content, "", existingWindow);
};

export const printTeamTournamentReport = (
    tournament: Pick<Tournament, 'name' | 'club' | 'type'>,
    config: TeamTournamentConfig,
    teams: TeamTournamentTeam[],
    matchdays: TeamTournamentMatchday[],
    fixtures: TeamTournamentFixture[] = [],
    existingWindow?: Window | null
): boolean => {
    if (tournament.type !== TournamentType.TorneoASquadre) {
        showHIGAlert('Formato torneo non supportato per la stampa a squadre.');
        return false;
    }

    const printTitle = `${tournament.name.replace(' - ', ', ')}, Riepilogo Torneo, ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}`;

    if (isTeamTournamentEliminationDirect(config)) {
        const bracketHtml = renderTeamTournamentEliminationBracket(teams, fixtures, matchdays, config);
        const playedFixtures = fixtures.filter(f => f.status === 'completed' && !f.isBye).length;
        const totalFixtures = fixtures.filter(f => !f.isBye).length;
        const pageStyles = `
            @page { size: A4 landscape; margin: 12mm 12mm; }
            body {
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
                font-size: 11px;
                line-height: 1.3;
                margin: 0;
                padding: 0;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .print-page {
                max-width: none;
            }
            h1 { font-size: 22px; margin: 0 0 8px 0; color: #111827; font-weight: bold; text-align: center; }
            h2 { font-size: 14px; margin: 0 0 10px 0; color: #666; font-weight: normal; text-align: center; }
            .separator { border-bottom: 3px solid #1e3a6e; margin: 16px 0; }
            .summary-strip {
                display: flex;
                justify-content: center;
                gap: 20px;
                margin: 0 0 10px 0;
                font-size: 10px;
                color: #334155;
            }
            .summary-pill {
                display: inline-block;
                padding: 4px 9px;
                border: 1px solid #cbd5e1;
                background: #f0f5ff;
                font-weight: 800;
            }
            .bracket-grid {
                display: grid;
                grid-template-columns: repeat(${Math.max(1, Math.min(TEAM_ELIMINATION_PHASES.filter(phase => fixtures.some(f => f.phase === phase)).length, 5))}, minmax(0, 1fr));
                gap: 6px;
                align-items: start;
            }
            .bracket-column-title {
                text-align: center;
                font-size: 10px;
                font-weight: 900;
                color: #111;
                background: #f8fafc;
                padding: 4px 5px;
                margin-bottom: 5px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                line-height: 1.1;
            }
            .bracket-column-body {
                display: flex;
                flex-direction: column;
                gap: 7px;
            }
            .bracket-match {
                border: 1px solid #cbd5e1;
                background: #ffffff;
                padding: 4px 5px;
                min-height: 46px;
            }
            .bracket-match-final {
                border-color: #f59e0b;
                background: #fef3c7;
            }
            .bracket-match-completed {
                box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
            }
            .bracket-match-head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 6px;
            }
            .bracket-slot {
                font-size: 9px;
                font-weight: 900;
                color: #0f172a;
                line-height: 1.05;
            }
            .bracket-badge {
                display: inline-block;
                padding: 2px 6px;
                background: #e2e8f0;
                color: #0f172a;
                font-size: 8px;
                font-weight: 900;
            }
            .bracket-badge-score {
                background: #f8fafc;
                color: #ffffff;
            }
            .bracket-date {
                margin-top: 2px;
                font-size: 8px;
                color: #64748b;
                text-align: center;
                min-height: 9px;
                line-height: 1;
            }
            .bracket-team-row {
                margin-top: 3px;
                padding: 2px 4px;
                border: 1px solid #e5e7eb;
                background: #ffffff;
                font-size: 9px;
                font-weight: 700;
                text-align: center;
                min-height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                line-height: 1.05;
                word-break: break-word;
                overflow-wrap: anywhere;
            }
            .footer { margin-top: 10px; padding-top: 6px; border-top: 1px solid #e5e7eb; font-size: 7px; color: #666; }
        `;

        const content = `
            <div class="print-page">
                <h1>${tournament.name}</h1>
                <h2>${tournament.club}</h2>
                ${playedFixtures < totalFixtures ? `
                <div style="display:flex; justify-content:center; margin: 0 0 8px 0;">
                    <div style="display:inline-flex; align-items:center; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:999px; padding:4px 10px; font-size:11px; font-weight:800;">
                        Dati parziali - torneo in corso
                    </div>
                </div>
                ` : ''}
                <div class="separator"></div>
                <div class="summary-strip">
                    <span class="summary-pill">Eliminazione Diretta</span>
                    <span class="summary-pill">Sfide completate: ${playedFixtures}/${totalFixtures}</span>
                    <span class="summary-pill">Finale secca 1°-2°</span>
                </div>
                ${bracketHtml}
                <div class="footer">
                    <div style="text-align: left; margin-bottom: 4px;">Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}</div>
                    <div style="text-align: right; font-size: 8px;">${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}</div>
                </div>
            </div>
        `;

        return openPrintWindow(printTitle, content, pageStyles, existingWindow);
    }

    const standings = calculateTeamTournamentStandings(teams, matchdays, config.scoringType);
    const totalRoundRobin = expectedTeamTournamentRoundRobinMatchdays(config);
    const playedRoundRobin = matchdays
        .filter(md => (md.phase ?? 'round_robin') === 'round_robin')
        .filter(md => md.status === 'completed' && md.summary).length;
    const standingsHtml = renderTeamTournamentStandingsTable(
        standings,
        config.scoringType,
        'Classifica',
        { played: playedRoundRobin, total: totalRoundRobin, provisional: playedRoundRobin < totalRoundRobin },
        playedRoundRobin >= totalRoundRobin
            ? standings.slice(0, getQualifiedTeamCount(config)).map(r => r.teamNumber)
            : []
    );

    const teamNameByNumber = (teamNumber: number) => {
        const team = teams.find(t => t.teamNumber === teamNumber);
        return team?.name || `Squadra ${teamNumber}`;
    };

    const isFinalStageCompleted = (() => {
        if (String(config.format || 'ROUND ROBIN') !== 'ROUND ROBIN') return false;
        if (!config.roundRobinFinalPhase) return false;
        const hasCompleted = (phase: any, slot: number) => fixtures.some(f => f.phase === phase && f.slot === slot && f.status === 'completed');
        if (config.roundRobinFinalPhase === 'FINALI') {
            return hasCompleted('final_1_2', 1);
        }
        if (config.roundRobinFinalPhase === 'SEMIFINALI E FINALI') {
            return (
                hasCompleted('semifinal', 1) &&
                hasCompleted('semifinal', 2) &&
                hasCompleted('final_3_4', 1) &&
                hasCompleted('final_1_2', 1)
            );
        }
        if (config.roundRobinFinalPhase === 'QUARTI, SEMIFINALI E FINALI') {
            return (
                hasCompleted('quarterfinal', 1) &&
                hasCompleted('quarterfinal', 2) &&
                hasCompleted('quarterfinal', 3) &&
                hasCompleted('quarterfinal', 4) &&
                hasCompleted('semifinal', 1) &&
                hasCompleted('semifinal', 2) &&
                hasCompleted('final_3_4', 1) &&
                hasCompleted('final_1_2', 1)
            );
        }
        return false;
    })();

    const isReportCompleted = (playedRoundRobin >= totalRoundRobin) && isFinalStageCompleted;

    const matchdayByPair = new Map<string, TeamTournamentMatchday>();
    matchdays.forEach(md => {
        const a = Math.min(md.team1Number, md.team2Number);
        const b = Math.max(md.team1Number, md.team2Number);
        matchdayByPair.set(`${a}-${b}`, md);
    });

    const schedule = (config.schedule || null) as TeamTournamentSchedule | null;
    const days = schedule?.kind === 'round_robin' ? schedule.days : [];

    // Defensive dedupe: we should never show the same RR pairing twice in the report.
    const seenPairs = new Set<string>();
    const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

	    const renderCompletedSubMatches = (md: TeamTournamentMatchday | null, swap: boolean = false) => {
	        if (!md || md.status !== 'completed') return '';
	        const visible = (md.subMatches || [])
	            .filter(sm => !sm.cancelled)
	            .filter(sm => Array.isArray(sm.sets) && !teamTournamentScoreIsBlank(sm.sets));

	        if (visible.length === 0) return '';

	        const rows = visible.map((sm, idx) => {
	            const rawT1 = (sm.team1Players || []).map(p => `${p.name} ${p.surname}`.trim()).join(' & ');
	            const rawT2 = (sm.team2Players || []).map(p => `${p.name} ${p.surname}`.trim()).join(' & ');
                
                const t1Players = swap ? rawT2 : rawT1;
                const t2Players = swap ? rawT1 : rawT2;

	            const sets = sm.sets || null;
                const swappedSets = swap ? (sets || []).map(s => ({...s, team1: s.team2, team2: s.team1})) : sets;
	            const scoreTextHtml = formatScoreBoxes(swappedSets, false);

                const t1Won = sm.winner === 'team1';
                const t2Won = sm.winner === 'team2';
                const leftWon = swap ? t2Won : t1Won;
                const rightWon = swap ? t1Won : t2Won;
                const t1Weight = leftWon ? 'bold' : 'normal';
                const t2Weight = rightWon ? 'bold' : 'normal';

	            return `
	                <tr style="height: 18px;">
	                    <td style="text-align: center; width: 10%; font-size: 9px; padding: 2px 4px;">Partita ${idx + 1}</td>
	                    <td style="width: 32%; text-align: right; font-size: 10px; padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${t1Weight};">${t1Players}</td>
	                    <td style="text-align: center; width: 26%; font-size: 10px; padding: 2px 4px; white-space: nowrap;">
	                        ${scoreTextHtml}
	                    </td>
	                    <td style="width: 32%; text-align: left; font-size: 10px; padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: ${t2Weight};">${t2Players}</td>
	                </tr>
	            `;
	        }).join('');

	        return `
	            <div style="margin-top: 6px;" class="avoid-break">
	                <table style="width: 100%; border-collapse: collapse;">
	                    <tbody>
	                        ${rows}
	                    </tbody>
	                </table>
	            </div>
	        `;
	    };

    const daySections = days.map(day => {
        const byeLine = day.byeTeamNumber
            ? `<div style="margin: 6px 0 8px 0; font-size: 11px; color: #374151;">Riposa: <strong>${teamNameByNumber(day.byeTeamNumber)}</strong></div>`
            : '';

        const dayMatches = (day.matches || []).filter(m => {
            const key = pairKey(Number(m.team1Number), Number(m.team2Number));
            if (seenPairs.has(key)) return false;
            seenPairs.add(key);
            return true;
        });

        const blocks = dayMatches.map((m, idx) => {
            const a = Math.min(m.team1Number, m.team2Number);
            const b = Math.max(m.team1Number, m.team2Number);
            const md = matchdayByPair.get(`${a}-${b}`) || null;

            const leftName = teamNameByNumber(m.team1Number);
            const rightName = teamNameByNumber(m.team2Number);

	            const overall = (md?.status === 'completed' && md?.summary)
	                ? (() => {
	                    const swap = (md.team1Number !== m.team1Number);
	                    const s = md.summary;
	                    const t1w = Number.isFinite(Number(s[swap ? 'team2Wins' : 'team1Wins'])) ? Number(s[swap ? 'team2Wins' : 'team1Wins']) : '';
	                    const t2w = Number.isFinite(Number(s[swap ? 'team1Wins' : 'team2Wins'])) ? Number(s[swap ? 'team1Wins' : 'team2Wins']) : '';
                    return `<div style="display: inline-flex; align-items: center; justify-content: center;"><span style="background-color: #FF9500; color: white; padding: 4px 8px; font-weight: 900; font-size: 12px; display: inline-block; line-height: 1; border-radius: 3px; min-width: 20px; text-align: center;">${t1w}</span><span style="margin: 0 4px; font-weight: bold; color: #4b5563;">-</span><span style="background-color: #FF9500; color: white; padding: 4px 8px; font-weight: 900; font-size: 12px; display: inline-block; line-height: 1; border-radius: 3px; min-width: 20px; text-align: center;">${t2w}</span></div>`;
	                })()
	                : '';

            const isSwapped = md ? (md.team1Number !== m.team1Number) : false;
            const subTable = renderCompletedSubMatches(md, isSwapped);
            const dateChip = (md?.status === 'completed' && md?.date)
                ? `<span style="margin-left: 8px; font-size: 10px; color:#6b7280; font-weight: 600;">${new Date(md.date).toLocaleDateString('it-IT').replace(/\//g, '.')}</span>`
                : '';

            return `
                <div style="margin-top: 10px; padding: 8px 10px; border: 1px solid #e5e7eb; background: #ffffff;" class="avoid-break">
                    <div style="display:flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 11px; font-weight: bold; color: #111;">
                            <span>Partita ${idx + 1} di ${dayMatches.length}</span>
                            ${dateChip}
                        </div>
                        <div>${overall}</div>
                    </div>
                    <div style="margin-top: 4px; text-align:center; font-size: 12px; color: #111;">
                        <span style="font-weight: 700;">${leftName}</span>
                        <span style="font-weight: 400; margin: 0 6px;">vs</span>
                        <span style="font-weight: 700;">${rightName}</span>
                    </div>
                    ${subTable}
                </div>
            `;
        });

        const divider = day.dayNumber === 1 ? '' : `<div style="border-bottom: 3px solid #1e3a6e; margin: 26px 0 26px 0;"></div>`;
        const firstBlock = blocks[0] || '';
        const remainingBlocks = blocks.slice(1).join('');

	        return `
	            <div>
	                <div class="section-block">
	                ${divider}
		                <h3 style="font-size: 13px; font-weight: 900; margin: 0 0 4px 0; padding: 7px 10px; background: #1e3a6e; color: #ffffff;">
		                    Giornata ${day.dayNumber} di ${days.length}
		                </h3>
	                ${byeLine}
	                ${firstBlock}
	                </div>
	                ${remainingBlocks}
	            </div>
	        `;
	    });
    const firstDaySection = daySections[0] || '';
    const remainingDaySections = daySections.slice(1).join('');
    const daysHtml = daySections.join('');

    const matchdayByTournamentDayId = new Map<string, TeamTournamentMatchday>();
    matchdays.forEach(md => {
        matchdayByTournamentDayId.set(md.tournamentDayId, md);
    });

    const renderFixtureSummary = (fixture: TeamTournamentFixture) => {
        const md = fixture.tournamentDayId ? (matchdayByTournamentDayId.get(fixture.tournamentDayId) || null) : null;
        const resolveWinnerLoser = (phase: TeamTournamentFixture['phase'], slot: number) => {
            const sourceFixture = fixtures.find(f => f.phase === phase && f.slot === slot);
            if (sourceFixture?.winnerTeamNumber) {
                return { winner: sourceFixture.winnerTeamNumber, loser: sourceFixture.loserTeamNumber ?? null };
            }
            if (!sourceFixture?.tournamentDayId) return null;
            const sourceMd = matchdayByTournamentDayId.get(sourceFixture.tournamentDayId);
            const s = sourceMd?.summary || null;
            if (!sourceMd || sourceMd.status !== 'completed' || !s?.winner) return null;
            if (s.winner === 'team1') {
                return { winner: sourceMd.team1Number, loser: sourceMd.team2Number };
            }
            if (s.winner === 'team2') {
                return { winner: sourceMd.team2Number, loser: sourceMd.team1Number };
            }
            return null;
        };
        const fixturePlaceholder = (side: 'left' | 'right') => {
            const dep = fixture.dependsOn;
            if (!dep) return 'Squadra da definire';
            if (dep.type === 'winners' && dep.from === 'semifinal') {
                const result = resolveWinnerLoser('semifinal', side === 'left' ? 1 : 2);
                if (result?.winner) return teamNameByNumber(result.winner);
            }
            if (dep.type === 'losers' && dep.from === 'semifinal') {
                const result = resolveWinnerLoser('semifinal', side === 'left' ? 1 : 2);
                if (result?.loser) return teamNameByNumber(result.loser);
            }
            if (dep.type === 'winners' && dep.from === 'quarterfinal' && Array.isArray(dep.slots)) {
                const slot = side === 'left' ? dep.slots[0] : dep.slots[1];
                const result = resolveWinnerLoser('quarterfinal', slot);
                if (result?.winner) return teamNameByNumber(result.winner);
            }
            if (dep.type === 'winners' && dep.from === 'semifinal') {
                return side === 'left' ? 'Vincente 1^ semifinale' : 'Vincente 2^ semifinale';
            }
            if (dep.type === 'losers' && dep.from === 'semifinal') {
                return side === 'left' ? 'Perdente 1^ semifinale' : 'Perdente 2^ semifinale';
            }
            if (dep.type === 'winners' && dep.from === 'quarterfinal' && Array.isArray(dep.slots)) {
                return side === 'left'
                    ? `Vincente ${dep.slots[0]}° quarto`
                    : `Vincente ${dep.slots[1]}° quarto`;
            }
            return 'Squadra da definire';
        };
        const leftName = fixture.team1Number ? teamNameByNumber(fixture.team1Number) : fixturePlaceholder('left');
        const rightName = fixture.team2Number ? teamNameByNumber(fixture.team2Number) : fixturePlaceholder('right');
        const dateLine = (md?.status === 'completed' && md?.date)
            ? `<div style="font-size: 10px; color: #6b7280; margin-top: 3px;">${new Date(md.date).toLocaleDateString('it-IT').replace(/\//g, '.')}</div>`
            : '';
        const overall = (md?.status === 'completed' && md?.summary)
            ? (() => {
                const swap = fixture.team1Number && fixture.team2Number && md.team1Number !== fixture.team1Number;
                const s = md.summary;
                const t1w = getTeamTournamentScoreValue(s, swap ? 'team2Wins' : 'team1Wins', config);
	                    const t2w = getTeamTournamentScoreValue(s, swap ? 'team1Wins' : 'team2Wins', config);
                return `<div style="display: inline-flex; align-items: center; justify-content: center;"><span style="background-color: #16a34a; color: white; padding: 4px 8px; font-weight: 900; font-size: 12px; display: inline-block; line-height: 1; border-radius: 3px; min-width: 20px; text-align: center;">${t1w}</span><span style="margin: 0 4px; font-weight: bold; color: #4b5563;">-</span><span style="background-color: #16a34a; color: white; padding: 4px 8px; font-weight: 900; font-size: 12px; display: inline-block; line-height: 1; border-radius: 3px; min-width: 20px; text-align: center;">${t2w}</span></div>`;
            })()
            : '';

        const subTable = md ? renderCompletedSubMatches(md) : '';
        const isGrandFinal = fixture.phase === 'final_1_2';
        const cardStyles = isGrandFinal
            ? 'border: 1px solid #f59e0b; background: #fef3c7;'
            : 'border: 1px solid #e5e7eb; background: #ffffff;';
        const titleColor = isGrandFinal ? '#92400e' : '#111';
        const textColor = isGrandFinal ? '#78350f' : '#111';

        return `
            <div style="margin-top: 10px; padding: 8px 10px; ${cardStyles}" class="avoid-break">
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <div>
                        <div style="font-size: 11px; font-weight: 900; color: ${titleColor};">${teamTournamentFixturePhaseLabel(fixture.phase, fixture.slot)}</div>
                        ${dateLine}
                    </div>
                    <div>${overall}</div>
                </div>
                <div style="margin-top: 6px; text-align:center; font-size: 12px; color: ${textColor};">
                    <span style="font-weight: 700;">${leftName}</span>
                    <span style="font-weight: 400; margin: 0 6px;">vs</span>
                    <span style="font-weight: 700;">${rightName}</span>
                </div>
                ${subTable}
            </div>
        `;
    };

    const phaseFixturesHtml = fixtures.length > 0
        ? (() => {
            const fixtureBlocks = fixtures.map(renderFixtureSummary);
            const firstFixture = fixtureBlocks[0] || '';
            const remainingFixtures = fixtureBlocks.slice(1).join('');
            return `
            <div>
                <div class="section-block">
                    <div style="border-bottom: 3px solid #1e3a6e; margin: 26px 0 26px 0;"></div>
                    <h3 style="font-size: 13px; font-weight: 900; margin: 0 0 4px 0; padding: 7px 10px; background: #1e3a6e; color: #ffffff; text-align: center;" class="avoid-break">
                        Fase Finale
                    </h3>
                    ${firstFixture}
                </div>
                ${remainingFixtures}
            </div>
        `;
        })()
        : '';
    const finalStandingsHtml = (() => {
        if (!isReportCompleted) return '';

        const fixtureByPhaseSlot = new Map<string, any>();
        fixtures.forEach(f => fixtureByPhaseSlot.set(`${f.phase}:${f.slot}`, f));

        const getWinnerLoser = (md: TeamTournamentMatchday | null) => {
            const s = md?.summary;
            if (!md || md.status !== 'completed' || !s?.winner) return null;
            if (s.winner === 'team1') return { winner: md.team1Number, loser: md.team2Number };
            if (s.winner === 'team2') return { winner: md.team2Number, loser: md.team1Number };
            return null;
        };

        const rrOrder = standings.map(r => r.teamNumber);
        const used = new Set<number>();
        const out: Array<{ pos: number; teamNumber: number; name: string }> = [];
        const push = (teamNumber: number | null, pos: number) => {
            if (!teamNumber) return;
            if (used.has(teamNumber)) return;
            used.add(teamNumber);
            out.push({ pos, teamNumber, name: teamNameByNumber(teamNumber) });
        };

        const fxFinal12 = fixtureByPhaseSlot.get('final_1_2:1') || null;
        const fxFinal34 = fixtureByPhaseSlot.get('final_3_4:1') || null;
        const mdFinal12 = fxFinal12?.tournamentDayId ? (matchdayByTournamentDayId.get(fxFinal12.tournamentDayId) || null) : null;
        const mdFinal34 = fxFinal34?.tournamentDayId ? (matchdayByTournamentDayId.get(fxFinal34.tournamentDayId) || null) : null;

        const r12 = getWinnerLoser(mdFinal12);
        const r34 = getWinnerLoser(mdFinal34);

        if (r12?.winner) push(r12.winner, 1);
        if (r12?.loser) push(r12.loser, 2);
        if (r34?.winner) push(r34.winner, 3);
        if (r34?.loser) push(r34.loser, 4);

        let nextPos = out.length + 1;
        for (const tn of rrOrder) {
            if (used.has(tn)) continue;
            push(tn, nextPos);
            nextPos += 1;
        }

        const rows = out
            .slice()
            .sort((a, b) => a.pos - b.pos)
            .map(r => {
                const medalStyle =
                    r.pos === 1 ? 'background: #fef3c7;' :
                    r.pos === 2 ? 'background: #e5e7eb;' :
                    r.pos === 3 ? 'background: #fed7aa;' :
                    '';
                const nameStyle = (r.pos <= 3) ? 'font-weight: 900;' : 'font-weight: 700;';
                return `
                <tr style="height: 26px; ${medalStyle}">
                    <td style="text-align:center; font-size: 13px; padding: 7px 10px; border: 1px solid #e5e7eb; width: 52px; font-weight: 900;">${r.pos}.</td>
                    <td style="text-align:center; font-size: 13px; padding: 7px 10px; border: 1px solid #e5e7eb; ${nameStyle}">${r.name}</td>
                </tr>
                `;
            })
            .join('');

        const rosterLineForTeam = (teamNumber: number | null) => {
            if (!teamNumber) return '—';
            const team = teams.find(t => t.teamNumber === teamNumber) || null;
            const roster = (team?.players || [])
                .map(p => ({ name: String(p?.name || '').trim(), surname: String(p?.surname || '').trim() }))
                .filter(p => p.surname);
            if (roster.length === 0) return '—';
            return roster
                .map((p, idx) => idx === 0 ? `${p.surname} (C)` : p.surname)
                .join(', ');
        };

        const top3LineBlocks = out
            .slice()
            .sort((a, b) => a.pos - b.pos)
            .filter(r => r.pos >= 1 && r.pos <= 3)
            .map(r => {
                const ord =
                    r.pos === 1 ? '1^' :
                    r.pos === 2 ? '2^' :
                    r.pos === 3 ? '3^' :
                    `${r.pos}^`;
                const roster = rosterLineForTeam(r.teamNumber);
                const bg =
                    r.pos === 1 ? 'background: #fef3c7; border-color: #f59e0b;' :
                    r.pos === 2 ? 'background: #e5e7eb; border-color: #9ca3af;' :
                    'background: #fed7aa; border-color: #fb923c;';
                return `
                    <div class="avoid-break" style="border: 1px solid #e5e7eb; padding: 10px 12px; ${bg} margin-top: 10px;">
                        <div style="font-size: 13px; font-weight: 900; color: #111; text-align: center;">
                            ${ord} Classificata: ${r.name}
                        </div>
                        <div style="margin-top: 6px; font-size: 11px; color: #374151; text-align: center;">
                            ${roster}
                        </div>
                    </div>
                `;
            });
        const firstTop3Line = top3LineBlocks[0] || '';
        const remainingTop3Lines = top3LineBlocks.slice(1).join('');

        const restRows = out
            .slice()
            .sort((a, b) => a.pos - b.pos)
            .filter(r => r.pos >= 4)
            .map(r => `
                <tr style="height: 24px;">
                    <td style="text-align:center; font-size: 13px; padding: 7px 10px; border: 1px solid #e5e7eb; width: 52px; font-weight: 900;">${r.pos}.</td>
                    <td style="text-align:center; font-size: 13px; padding: 7px 10px; border: 1px solid #e5e7eb; font-weight: 700;">${r.name}</td>
                </tr>
            `)
            .join('');

        return `
            <div>
                <div class="section-block">
                <div style="border-bottom: 3px solid #1e3a6e; margin: 26px 0 26px 0;"></div>
                <h3 style="font-size: 14px; font-weight: 900; margin: 0 0 6px 0; padding: 8px 10px; background: #1e3a6e; color: #ffffff; text-align: center;">
                    Classifica Finale
                </h3>
                ${firstTop3Line}
                </div>
                ${remainingTop3Lines}
                ${restRows ? `
                    <div class="avoid-break" style="margin-top: 12px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tbody>
                                ${restRows}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
            </div>
        `;
    })();

    const completedHeaderBlock = isReportCompleted
        ? `
            <h3 style="font-size: 13px; font-weight: 900; margin: 0 0 10px 0; padding: 7px 10px; background: #1e3a6e; color: #ffffff; text-align: center;">
                1^ Fase - Round Robin
            </h3>
        `
        : '';

    const appendedStatisticsHtml = isReportCompleted
        ? (() => {
            const blocks = buildTeamTournamentStatisticsBlocksHtml(config, teams, matchdays, false);
            return `
                <div class="section-block">
                <div style="border-bottom: 3px solid #1e3a6e; margin: 26px 0 26px 0;"></div>
                <div style="font-size: 26px; margin: 0 0 10px 0; color: #111827; font-weight: 900; text-align: center;">
                    Statistiche Torneo ${tournament.name}
                </div>
                ${blocks}
                </div>
            `;
        })()
        : '';

		const content = `
		        <style>
		            @page { size: A4; margin: 12mm 10mm; }
		            body {
		                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
		                font-size: 11px;
		                line-height: 1.3;
		                margin: 0;
		                padding: 0;
		                background: white;
		                -webkit-print-color-adjust: exact;
		                print-color-adjust: exact;
		            }
		            h1 { font-size: 22px; margin: 0 0 8px 0; color: #111827; font-weight: bold; text-align: center; }
		            h2 { font-size: 14px; margin: 0 0 10px 0; color: #666; font-weight: normal; text-align: center; }
		            .separator { border-bottom: 3px solid #1e3a6e; margin: 16px 0; }
		            table { width: 100%; border-collapse: collapse; }
		            td { border: 1px solid #e5e7eb; }
		            .avoid-break { break-inside: avoid; page-break-inside: avoid; }
	            @media print {
	                .avoid-break { break-inside: avoid; page-break-inside: avoid; }
	            }
                .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 8px; color: #666; }
	        </style>
	        <div class="print-page">
	        <h1>${tournament.name}</h1>
	        <h2>${tournament.club}</h2>
                ${!isReportCompleted ? `
                <div style="display:flex; justify-content:center; margin: 0 0 8px 0;">
                    <div style="display:inline-flex; align-items:center; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:999px; padding:4px 10px; font-size:11px; font-weight:800;">
                        Dati parziali - torneo in corso
                    </div>
                </div>
                ` : ''}
	        <div class="separator"></div>
            <div class="section-block">
                ${isReportCompleted ? completedHeaderBlock : ''}
                ${standingsHtml}
            </div>
            ${(playedRoundRobin >= totalRoundRobin) ? phaseFixturesHtml : ''}
            ${isReportCompleted ? finalStandingsHtml : ''}
            ${isReportCompleted ? `
                <div class="section-block">
                <div style="border-bottom: 3px solid #1e3a6e; margin: 30px 0 22px 0;"></div>
                <h3 style="font-size: 13px; font-weight: 900; margin: 0 0 12px 0; padding: 7px 10px; background: #1e3a6e; color: #ffffff; text-align: center;">
                    Riepilogo Round Robin
                </h3>
                ${firstDaySection}
                </div>
                ${remainingDaySections}
            ` : ''}
            ${isReportCompleted ? '' : daysHtml}
            ${appendedStatisticsHtml}
            <div class="footer">
                <div style="text-align: left; margin-bottom: 4px;">Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}</div>
                <div style="text-align: right; font-size: 8px;">${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}</div>
            </div>
            </div>
	    `;

    return openPrintWindow(printTitle, content, "", existingWindow);
};

const buildTeamTournamentStatisticsBlocksHtml = (
    config: TeamTournamentConfig,
    teams: TeamTournamentTeam[],
    matchdays: TeamTournamentMatchday[],
    isPartial: boolean,
    derivedStats?: any
): string => {
    const normalize = (s: string) => (s || '').trim().toLowerCase();
    const playerKey = (p: TeamTournamentPlayerEntry) => `${normalize(p.name)}|${normalize(p.surname)}`;
    const playerLabel = (p: TeamTournamentPlayerEntry) => `${p.name} ${p.surname}`.trim();

    const totalRoundRobin = expectedTeamTournamentRoundRobinMatchdays(config);
    const completedMatchdays = matchdays.filter(md => md.status === 'completed');
    const playedMatchdays = completedMatchdays.filter(md =>
        (md.subMatches || []).some(sm => !sm.cancelled && Array.isArray(sm.sets) && !teamTournamentScoreIsBlank(sm.sets))
    );
    const playedRoundRobin = playedMatchdays
        .filter(md => (md.phase ?? 'round_robin') === 'round_robin')
        .length;

    type PlayerAgg = {
        name: string;
        surname: string;
        matchesPlayed: number;
        matchesWon: number;
        matchesLost: number;
        gamesWon: number;
        gamesLost: number;
    };
    const playerAggByKey = new Map<string, PlayerAgg>();
    const upsertAgg = (p: TeamTournamentPlayerEntry) => {
        const key = playerKey(p);
        const existing = playerAggByKey.get(key);
        if (existing) return existing;
        const created: PlayerAgg = {
            name: p.name,
            surname: p.surname,
            matchesPlayed: 0,
            matchesWon: 0,
            matchesLost: 0,
            gamesWon: 0,
            gamesLost: 0,
        };
        playerAggByKey.set(key, created);
        return created;
    };

    const pairAgg = new Map<string, { label: string; played: number; wins: number; draws: number; losses: number }>();
    const bumpPair = (a: TeamTournamentPlayerEntry, b: TeamTournamentPlayerEntry) => {
        const ka = playerKey(a);
        const kb = playerKey(b);
        const [x, y] = [ka, kb].sort();
        const key = `${x}--${y}`;
        const prev = pairAgg.get(key);
        pairAgg.set(key, prev || { label: `${playerLabel(a)} & ${playerLabel(b)}`, played: 0, wins: 0, draws: 0, losses: 0 });
    };

    const streakByKey = new Map<string, { label: string; current: number; best: number }>();
    const touchStreak = (p: TeamTournamentPlayerEntry) => {
        const key = playerKey(p);
        const existing = streakByKey.get(key);
        if (existing) return existing;
        const created = { label: playerLabel(p), current: 0, best: 0 };
        streakByKey.set(key, created);
        return created;
    };

    const chronological = [...playedMatchdays].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const periodo = chronological.length > 0
        ? {
            inizio: new Date(chronological[0].date).toLocaleDateString('it-IT').replace(/\//g, '.'),
            fine: new Date(chronological[chronological.length - 1].date).toLocaleDateString('it-IT').replace(/\//g, '.'),
        }
        : { inizio: '—', fine: '—' };

    let gamesDisputati = 0;
    let partiteDisputate = 0; // sub-match realmente giocati (con set non blank)

    chronological.forEach(md => {
        (md.subMatches || [])
            .filter(sm => !sm.cancelled)
            .forEach(sm => {
                const t1 = sm.team1Players || [];
                const t2 = sm.team2Players || [];

                if (t1.length >= 2) bumpPair(t1[0], t1[1]);
                if (t2.length >= 2) bumpPair(t2[0], t2[1]);

                if (!Array.isArray(sm.sets) || teamTournamentScoreIsBlank(sm.sets)) return;

                const t1Games = (sm.sets || []).reduce((sum: number, s: any) => sum + Number(s.team1 || 0), 0);
                const t2Games = (sm.sets || []).reduce((sum: number, s: any) => sum + Number(s.team2 || 0), 0);
                gamesDisputati += (t1Games + t2Games);
                partiteDisputate += 1;
                const winner =
                    (sm.winner && sm.winner !== 'draw')
                        ? sm.winner
                        : (t1Games === t2Games ? null : (t1Games > t2Games ? 'team1' : 'team2'));

                if (t1.length >= 2) {
                    const key = [playerKey(t1[0]), playerKey(t1[1])].sort().join('--');
                    const p = pairAgg.get(key);
                    if (p) {
                        p.played += 1;
                        if (winner === 'team1') p.wins += 1;
                        else if (winner === 'team2') p.losses += 1;
                        else p.draws += 1;
                    }
                }
                if (t2.length >= 2) {
                    const key = [playerKey(t2[0]), playerKey(t2[1])].sort().join('--');
                    const p = pairAgg.get(key);
                    if (p) {
                        p.played += 1;
                        if (winner === 'team2') p.wins += 1;
                        else if (winner === 'team1') p.losses += 1;
                        else p.draws += 1;
                    }
                }

                t1.forEach(p => {
                    const agg = upsertAgg(p);
                    agg.matchesPlayed += 1;
                    agg.gamesWon += t1Games;
                    agg.gamesLost += t2Games;
                    if (winner === 'team1') agg.matchesWon += 1;
                    else if (winner === 'team2') agg.matchesLost += 1;

                    const st = touchStreak(p);
                    if (winner === 'team1') {
                        st.current += 1;
                        st.best = Math.max(st.best, st.current);
                    } else if (winner === 'team2') {
                        st.current = 0;
                    }
                });
                t2.forEach(p => {
                    const agg = upsertAgg(p);
                    agg.matchesPlayed += 1;
                    agg.gamesWon += t2Games;
                    agg.gamesLost += t1Games;
                    if (winner === 'team2') agg.matchesWon += 1;
                    else if (winner === 'team1') agg.matchesLost += 1;

                    const st = touchStreak(p);
                    if (winner === 'team2') {
                        st.current += 1;
                        st.best = Math.max(st.best, st.current);
                    } else if (winner === 'team1') {
                        st.current = 0;
                    }
                });
            });
    });

    const mediaGamesPerPartita = partiteDisputate > 0 ? (gamesDisputati / partiteDisputate) : 0;

    const top5Players = derivedStats ? derivedStats.top5 : Array.from(playerAggByKey.values())
        .map(p => {
            const diff = p.gamesWon - p.gamesLost;
            const pct = p.matchesPlayed > 0 ? Math.round((p.matchesWon / p.matchesPlayed) * 100) : 0;
            return { ...p, gamesDiff: diff, winPercentage: pct, eloVar: 0 };
        })
        .filter((p: any) => p.matchesPlayed > 0)
        .sort((a: any, b: any) => {
            if (b.eloVar !== a.eloVar) return b.eloVar - a.eloVar;
            return b.gamesDiff - a.gamesDiff;
        })
        .slice(0, 5);

    const playerStandings = derivedStats && derivedStats.playerRows 
        ? [...derivedStats.playerRows].sort((a: any, b: any) => {
            if (b.eloVar !== a.eloVar) return b.eloVar - a.eloVar;
            return b.gamesDiff - a.gamesDiff;
        }) 
        : Array.from(playerAggByKey.values())
        .map(p => {
            const diff = p.gamesWon - p.gamesLost;
            const pct = p.matchesPlayed > 0 ? Math.round((p.matchesWon / p.matchesPlayed) * 100) : 0;
            return { ...p, gamesDiff: diff, winPercentage: pct, eloVar: 0 };
        })
        .filter((p: any) => p.matchesPlayed > 0)
        .sort((a: any, b: any) => {
            if (b.eloVar !== a.eloVar) return b.eloVar - a.eloVar;
            return b.gamesDiff - a.gamesDiff;
        });

    const mostGamesWon = derivedStats ? derivedStats.mostGamesWon : Array.from(playerAggByKey.values())
        .filter(p => p.gamesWon > 0)
        .sort((a, b) => b.gamesWon - a.gamesWon)
        .slice(0, 3);

    const mostGamesLost = derivedStats ? derivedStats.mostGamesLost : Array.from(playerAggByKey.values())
        .filter(p => p.gamesLost > 0)
        .sort((a, b) => b.gamesLost - a.gamesLost)
        .slice(0, 3);

    const bestPairsByWinRate = Array.from(pairAgg.values())
        .filter(p => p.played >= 2)
        .map(p => ({ ...p, winRate: p.played > 0 ? (p.wins / p.played) * 100 : 0 }))
        .sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.played - a.played;
        })
        .slice(0, 3);

    const topStreak = Array.from(streakByKey.values())
        .filter(s => s.best > 0)
        .sort((a, b) => b.best - a.best)
        .slice(0, 5);

    const totalPlayers = (() => {
        const set = new Set<string>();
        teams.forEach(t => (t.players || []).forEach(p => set.add(playerKey(p))));
        return set.size;
    })();

    const smallListCard = (title: string, items: Array<{ label: string; value: string }>) => `
        <div class="avoid-break" style="border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden;">
            <div style="background: #1e3a6e; color: white; font-weight: 900; font-size: 10px; padding: 6px 10px; letter-spacing: 0.04em; text-transform: uppercase;">
                ${title}
            </div>
            <div style="background: #ffffff; padding: 8px 10px;">
                ${items.length === 0
                    ? `<div style="font-size: 10px; color: #6b7280;">Nessun dato disponibile.</div>`
                    : items.map((it, idx) => `
                        <div style="display:flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-top: ${idx === 0 ? '0' : '1px solid #e5e7eb'};">
                            <div style="font-size: 10px; color: #111; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${idx + 1}. ${it.label}</div>
                            <div style="font-size: 10px; color: #111; font-weight: 900;">${it.value}</div>
                        </div>
                    `).join('')
                }
            </div>
        </div>
    `;

    const advancedStatsHtml = derivedStats ? `
        <div class="avoid-break" style="margin: 0 0 22px 0;">
            <h3 style="font-size: 13px; font-weight: 900; margin: 0 0 10px 0; padding: 7px 10px; background: #9333ea; color: #ffffff; border-radius: 8px;">
                Statistiche Avanzate
            </h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                ${smallListCard('Miglior Guadagno ELO', derivedStats.maggiorGuadagnoElo.map((m: any) => ({ label: `${m.player.name} ${m.player.surname}`, value: `+${m.guadagno.toFixed(2)}` })))}
                ${smallListCard('Peggior Perdita ELO', derivedStats.peggiorPerditaElo.map((m: any) => ({ label: `${m.player.name} ${m.player.surname}`, value: `-${m.perdita.toFixed(2)}` })))}
                ${smallListCard('MVP Giocatori', derivedStats.mvp.slice(0, 3).map((m: any) => ({ label: `${m.player.name} ${m.player.surname}`, value: `${m.vittorieGiornate} vittorie` })))}
                ${smallListCard('Miglior Difesa', derivedStats.difesaFerrea.slice(0, 3).map((d: any) => ({ label: `${d.player.name} ${d.player.surname}`, value: `${d.ratio ? d.ratio.toFixed(2) : (d.avgGameDifference ? d.avgGameDifference.toFixed(2) : 0)} ratio` })))}
            </div>
            <div style="margin-top: 16px;">
                <h4 style="font-size: 11px; font-weight: 900; color: #4b5563; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.05em;">Stato di Forma (Ultime 5)</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                    ${derivedStats.form.map((f: any) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 8px; background: #f9fafb;">
                            <div style="font-size: 9px; font-weight: 800; color: #111; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;">${f.player.name} ${f.player.surname}</div>
                            <div style="display: flex; gap: 2px; font-size: 8px;">
                                ${f.form}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    ` : '';

    return `
        <div class="avoid-break" style="margin: 0 0 22px 0;">
            <h3 style="font-size: 13px; font-weight: 900; margin: 0 0 6px 0; padding: 7px 10px; background: #1e3a6e; color: #ffffff; border-radius: 8px;">
                Informazioni generali
            </h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                <div style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; background: #f0f5ff;">
                    <div style="font-size: 9px; color: #6b7280; font-weight: 800;">Periodo</div>
                    <div style="font-size: 12px; font-weight: 900; color: #111;">${periodo.inizio} - ${periodo.fine}</div>
                </div>
                <div style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; background: #f0f5ff;">
                    <div style="font-size: 9px; color: #6b7280; font-weight: 800;">Games Disputati</div>
                    <div style="font-size: 14px; font-weight: 900; color: #111;">${gamesDisputati}</div>
                </div>
                <div style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; background: #f0f5ff;">
                    <div style="font-size: 9px; color: #6b7280; font-weight: 800;">Media Games/Partita</div>
                    <div style="font-size: 14px; font-weight: 900; color: #111;">${mediaGamesPerPartita.toFixed(1)}</div>
                </div>
                <div style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; background: #f0f5ff;">
                    <div style="font-size: 9px; color: #6b7280; font-weight: 800;">Squadre</div>
                    <div style="font-size: 14px; font-weight: 900; color: #111;">${teams.length || config.initialTeamCount}</div>
                </div>
                <div style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; background: #f0f5ff;">
                    <div style="font-size: 9px; color: #6b7280; font-weight: 800;">Giocatori</div>
                    <div style="font-size: 14px; font-weight: 900; color: #111;">${totalPlayers || '—'}</div>
                </div>
                <div style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; background: #f0f5ff;">
                    <div style="font-size: 9px; color: #6b7280; font-weight: 800;">Partite/giornata</div>
                    <div style="font-size: 14px; font-weight: 900; color: #111;">${config.matchesPerDay}</div>
                </div>
            </div>
            <div style="margin-top: 8px; display:flex; flex-wrap: wrap; gap: 10px; align-items: center;">
                <div style="font-size: 10px; color: #374151; font-weight: 800;">
                    ${config.format === 'ELIMINAZIONE DIRETTA'
                        ? `Matchday giocati: ${playedMatchdays.length}`
                        : `Round robin: ${playedRoundRobin} / ${totalRoundRobin}`
                    }
                </div>
                ${isPartial ? `
                    <div style="display:inline-flex; align-items:center; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:999px; padding:3px 8px; font-size:10px; font-weight:800;">
                        Dati parziali
                    </div>
                ` : ''}
            </div>
        </div>

        <div class="avoid-break" style="margin: 0 0 22px 0;">
            ${top5Players.length === 0 ? `<div style="font-size: 11px; color: #6b7280;">Nessun dato disponibile.</div>` : `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:left; font-size: 10px; padding: 6px 6px;">Giocatori - TOP 5</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">G</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">V</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">P</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">GF</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">GS</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">Diff</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">%</th>
                            ${derivedStats ? `<th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">Var. ELO</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${top5Players.map((p: any) => `
                            <tr style="height: 20px;">
                                <td style="font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.name} ${p.surname}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.matchesPlayed}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.matchesWon}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.matchesLost}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.gamesWon}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.gamesLost}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.gamesDiff >= 0 ? `+${p.gamesDiff}` : p.gamesDiff}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.winPercentage}%</td>
                                ${derivedStats ? `<td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb; color: ${p.eloVar > 0 ? '#10b981' : p.eloVar < 0 ? '#ef4444' : '#6b7280'}">${p.eloVar > 0 ? `+${p.eloVar.toFixed(2)}` : p.eloVar.toFixed(2)}</td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>

        <div class="avoid-break" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 10px; margin-bottom: 22px;">
            ${smallListCard('Più games vinti', mostGamesWon.map(p => ({ label: `${p.name} ${p.surname}`, value: String(p.gamesWon) })))}
            ${smallListCard('Più games persi', mostGamesLost.map(p => ({ label: `${p.name} ${p.surname}`, value: String(p.gamesLost) })))}
            ${smallListCard('Miglior coppia (Win Rate)', bestPairsByWinRate.map(p => ({ label: p.label, value: `${p.winRate.toFixed(0)}% in ${p.played} partite` })))}
            ${smallListCard('Streak - Serie vittorie', topStreak.map(s => ({ label: s.label, value: String(s.best) })))}
        </div>

        ${advancedStatsHtml}

        <div class="avoid-break" style="margin: 0 0 0 0;">
            <h3 style="font-size: 12px; font-weight: 900; margin: 0 0 6px 0; padding: 6px 10px; background: #1e3a6e; color: #ffffff; border-radius: 8px;">
                Classifica giocatori
            </h3>
            ${playerStandings.length === 0 ? `<div style="font-size: 11px; color: #6b7280;">Nessun dato disponibile.</div>` : `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px; width: 44px;">Pos</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:left; font-size: 10px; padding: 6px 6px;">Giocatore</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">G</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">V</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">P</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">GF</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">GS</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">Diff</th>
                            <th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">%</th>
                            ${derivedStats ? `<th style="background: #1e3a6e; color: #fff; border: 1px solid #e5e7eb; text-align:center; font-size: 10px; padding: 6px 6px;">Var. ELO</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${playerStandings.map((p: any, idx: number) => `
                            <tr style="height: 20px;">
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${idx + 1}</td>
                                <td style="font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.name} ${p.surname}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.matchesPlayed}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.matchesWon}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.matchesLost}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.gamesWon}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.gamesLost}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.gamesDiff >= 0 ? `+${p.gamesDiff}` : p.gamesDiff}</td>
                                <td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb;">${p.winPercentage}%</td>
                                ${derivedStats ? `<td style="text-align:center; font-size: 10px; padding: 3px 6px; border: 1px solid #e5e7eb; color: ${p.eloVar > 0 ? '#10b981' : p.eloVar < 0 ? '#ef4444' : '#6b7280'}">${p.eloVar > 0 ? `+${p.eloVar.toFixed(2)}` : p.eloVar.toFixed(2)}</td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>
    `;
};

export const printTeamTournamentStatistics = (
    tournament: Pick<Tournament, 'name' | 'club' | 'type' | 'status'>,
    config: TeamTournamentConfig,
    teams: TeamTournamentTeam[],
    matchdays: TeamTournamentMatchday[],
    derivedStats?: any
): boolean => {
    if (tournament.type !== TournamentType.TorneoASquadre) {
        showHIGAlert('Formato torneo non supportato per la stampa a squadre.');
        return false;
    }

    const blocks = buildTeamTournamentStatisticsBlocksHtml(config, teams, matchdays, tournament.status !== 'completed', derivedStats);

    const content = `
        <style>
            @page { size: A4; margin: 12mm 10mm; }
            body {
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
                font-size: 12px;
                line-height: 1.35;
                margin: 0;
                padding: 18px;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            h1 { font-size: 22px; margin: 0 0 6px 0; color: #111827; font-weight: 900; text-align: center; }
            h2 { font-size: 14px; margin: 0 0 10px 0; color: #666; font-weight: 400; text-align: center; }
            .separator { border-bottom: 3px solid #1e3a6e; margin: 26px 0 26px 0; }
            .avoid-break { break-inside: avoid; page-break-inside: avoid; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; }
        </style>
        <div class="print-page">
        <h1>${tournament.name}</h1>
        <h2>${tournament.club}</h2>
        ${tournament.status !== 'completed' ? `
            <div style="display:flex; justify-content:center; margin: 0 0 8px 0;">
                <div style="display:inline-flex; align-items:center; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:999px; padding:4px 10px; font-size:11px; font-weight:800;">
                    Dati parziali - torneo in corso
                </div>
            </div>
        ` : ''}
        <div class="separator"></div>
        ${blocks}
        </div>
    `;

    return openPrintWindow('Torneo a Squadre - Statistiche', content);
};

export const printBlankScoreSheet = (
    tournamentDetails: Pick<Tournament, 'name' | 'club' | 'date' | 'type'>,
    pairs: [Player, Player][],
    matches: Omit<Match, 'id' | 'date' | 'winner' | 'sets'>[],
    getPlayerById: (id: string) => Player | undefined,
    americanoFields?: number
) => {
    const isAmericano = tournamentDetails.type === TournamentType.Americano;
    const isTorneOtto = tournamentDetails.type === TournamentType.TorneOtto;
    const isRoundRobin = tournamentDetails.type === TournamentType.RoundRobinFinali;
    const numPairs = pairs.length;
    // For 6 pairs, create 2 rows of 3. For 4 or less, create one row. For more, cap at 4 per row.
    const gridCols = numPairs <= 4 ? numPairs : (numPairs === 6 ? 3 : 4);

    let teamsContent = '';
    if (!isAmericano) {
        teamsContent = pairs.map((pair, index) => `
            <div class="team-box">
                <div class="team-number">Squadra ${index + 1}</div>
                <div style="color: #000;">${pair[0].name} ${pair[0].surname}</div>
                <div style="color: #000; margin: 2px 0;">&</div>
                <div style="color: #000;">${pair[1].name} ${pair[1].surname}</div>
            </div>
    `).join('');
    }

    let matchesContent = '';
    
    if (isAmericano) {
        const allPlayersIds = new Set(matches.flatMap(m => [...m.team1, ...m.team2]));
        const numPlayers = allPlayersIds.size;
        const matchesPerRound = Math.min(americanoFields || 2, Math.floor(numPlayers / 4));

        let currentRound = 0;
        
        matchesContent = matches.map((match, index) => {
            const t1p1 = getPlayerById(match.team1[0]);
            const t1p2 = getPlayerById(match.team1[1]);
            const t2p1 = getPlayerById(match.team2[0]);
            const t2p2 = getPlayerById(match.team2[1]);
            if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return '';

            const team1Name = `${t1p1.name} ${t1p1.surname} & ${t1p2.name} ${t1p2.surname}`;
            const team2Name = `${t2p1.name} ${t2p1.surname} & ${t2p2.name} ${t2p2.surname}`;
            
            const maxCourts = americanoFields || 2;
            const court = `Campo ${(index % maxCourts) + 1}`;
            
            const r = match.roundNumber || (matchesPerRound > 0 ? Math.floor(index / matchesPerRound) + 1 : 1);
            let rowHtml = '';
            
            if (r !== currentRound) {
                currentRound = r;
                
                const playersInRound = new Set(
                    matches
                        .filter((m, i) => (m.roundNumber || (matchesPerRound > 0 ? Math.floor(i / matchesPerRound) + 1 : 1)) === currentRound)
                        .flatMap(m => [...m.team1, ...m.team2])
                );
                const restingPlayers = pairs.flat().filter(p => !playersInRound.has(p.id));
                let restingText = '';
                if (restingPlayers.length > 0) {
                    restingText = `<div style="font-size: 11px; color: #b45309; background: #fffbeb; padding: 4px; margin-bottom: 4px; border-radius: 4px; font-weight: normal;"><b>Riposo:</b>${restingPlayers.map(p => `<div style="margin-top: 1px;">${p.name} ${p.surname}</div>`).join('')}</div>`;
                }

                rowHtml += `
                    <tr>
                        <td colspan="4" style="background: #f3f4f6; font-weight: bold; padding: 6px; font-size: 13px;">
                            Turno ${currentRound}
                            ${restingText}
                        </td>
                    </tr>
                `;
            }

            rowHtml += `
                <tr style="height: 22px;">
                    <td style="text-align: center; width: 25%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">${court}</td>
                    <td style="width: 32.5%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">${team1Name}</td>
                    <td style="text-align: center; width: 20%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">
                        <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 13px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 13px;">&nbsp;</span>
                    </td>
                    <td style="width: 32.5%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">${team2Name}</td>
                </tr>
            `;
            
            return rowHtml;
        }).join('');
    } else if (isTorneOtto || isRoundRobin) {
        let currentRound = 0;
        matchesContent = matches.map((match, index) => {
            const t1p1 = getPlayerById(match.team1[0]);
            const t1p2 = getPlayerById(match.team1[1]);
            const t2p1 = getPlayerById(match.team2[0]);
            const t2p2 = getPlayerById(match.team2[1]);
            if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return '';

            const team1Name = `${t1p1.name} ${t1p1.surname} & ${t1p2.name} ${t1p2.surname}`;
            const team2Name = `${t2p1.name} ${t2p1.surname} & ${t2p2.name} ${t2p2.surname}`;
            const round = match.roundNumber || Math.floor(index / 2) + 1;
            const indexInRound = matches
                .slice(0, index)
                .filter((m, previousIndex) => (m.roundNumber || Math.floor(previousIndex / 2) + 1) === round)
                .length;
            const court = `Campo ${indexInRound + 1}`;
            let rowHtml = '';

            if (round !== currentRound) {
                currentRound = round;
                rowHtml += `
                    <tr>
                        <td colspan="4" style="background: #f3f4f6; font-weight: bold; padding: 6px; font-size: 13px;">
                            ${isRoundRobin ? `Giornata ${round}` : `Turno ${round}`}
                        </td>
                    </tr>
                `;
            }

            rowHtml += `
                <tr style="height: 22px;">
                    <td style="text-align: center; width: 25%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">${court}</td>
                    <td style="width: 32.5%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">${team1Name}</td>
                    <td style="text-align: center; width: 20%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">
                        <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 13px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 13px;">&nbsp;</span>
                    </td>
                    <td style="width: 32.5%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">${team2Name}</td>
                </tr>
            `;
            return rowHtml;
        }).join('');
    } else {
        matchesContent = matches.map((match, index) => {
            const t1p1 = getPlayerById(match.team1[0]);
            const t1p2 = getPlayerById(match.team1[1]);
            const t2p1 = getPlayerById(match.team2[0]);
            const t2p2 = getPlayerById(match.team2[1]);
            if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return '';

            const team1Name = `${t1p1.name} ${t1p1.surname} & ${t1p2.name} ${t1p2.surname}`;
            const team2Name = `${t2p1.name} ${t2p1.surname} & ${t2p2.name} ${t2p2.surname}`;
            let court = '-';
            if (tournamentDetails.type === TournamentType.TorneOtto) {
                court = `Campo ${(index % 2) + 1}`;
            }

            return `
                    <tr style="height: 22px;">
                        <td style="text-align: center; width: 25%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">${court}</td>
                        <td style="width: 32.5%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">${team1Name}</td>
                        <td style="text-align: center; width: 20%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">
                            <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 13px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 13px;">&nbsp;</span>
                        </td>
                        <td style="width: 32.5%; font-size: 12px; padding: 4px 5px; height: 22px; line-height: 1.2;">${team2Name}</td>
                    </tr>
            `;
        }).join('');
    }
    
    const content = `
        <style>
            @page {
                size: A4;
                margin: 12mm 10mm;
            }
            body {
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
                font-size: 13px;
                line-height: 1.4;
                margin: 0;
                padding: 18px;
                background: white;
            }
            h1 {
                font-size: 22px;
                margin: 0 0 10px 0;
                color: #111827;
                font-weight: bold;
            }
            h2 {
                font-size: 14px;
                margin: 0 0 6px 0;
                color: #666;
                font-weight: normal;
            }
            h3 {
                font-size: 13px;
                margin: 18px 0 8px 0;
                color: #000;
                font-weight: bold;
            }
            .separator {
                border-bottom: 3px solid #1e3a6e;
                margin: 16px 0;
            }
            .date-info {
                color: #111827;
                font-size: 15px;
                font-weight: bold;
                margin: 6px 0 0 0;
            }
            .team-box {
                text-align: center; 
                font-weight: bold; 
                padding: 6px; 
                background-color: #f0f5ff; 
                border: 2px solid #1e3a6e; /* Blu chiaro */
                border-radius: 8px; 
                font-size: 12px;
                height: 66px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                line-height: 1.2;
            }
            .team-number {
                color: #111827; /* Blu più chiaro */
                font-weight: bold;
                margin-bottom: 3px;
            }
            .score-box-blank {
                background-color: white;
                border: 1px solid #c7d9f0; /* Blu più chiaro */
                border-radius: 4px;
                padding: 8px 11px;
                margin: 0 2px;
                width: 34px;
                height: 34px;
                display: inline;
                font-size: 16px;
                font-weight: bold;
                color: #3b82f6;
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 8px 0 16px 0;
                font-size: 13px;
            }
            th { 
                background-color: #1e3a6e; /* Blu più chiaro */
                color: white; 
                padding: 6px 7px; 
                text-align: left; 
                font-weight: bold;
                font-size: 12px;
                height: 26px;
            }
            td { 
                padding: 6px 7px; 
                border-bottom: 1px solid #e5e7eb; 
                vertical-align: middle;
                font-size: 12px;
                line-height: 1.3;
                height: 26px;
            }
            .court-cell {
                font-size: 11px;
                white-space: nowrap;
            }
            .team-name {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            tr:nth-child(even) {
                background-color: #f0f5ff;
            }
            /* Force UNIFORM row height 26px for ALL tables */
            table tbody tr {
                height: 26px !important;
            }
            table tbody td {
                height: 26px !important;
                padding: 6px 7px !important;
                font-size: 12px !important;
                line-height: 1.3 !important;
            }
            table thead tr {
                height: 26px !important;
            }
            table thead th {
                height: 26px !important;
                padding: 6px 7px !important;
                font-size: 12px !important;
            }
            .avoid-break { break-inside: avoid; page-break-inside: avoid; }
            .footer {
                margin-top: 20px;
                padding-top: 14px;
                border-top: 1px solid #e5e7eb;
                font-size: 10px;
                color: #666;
            }
        </style>

        <div style="text-align: center; margin-bottom: 20px;">
            <h1>${tournamentDetails.name} - Scheda Punteggi</h1>
            <h2>${tournamentDetails.club} - ${getTournamentTypeDisplayName(tournamentDetails.type)}</h2>
            <div class="date-info">Giornata del ${new Date(tournamentDetails.date).toLocaleDateString('it-IT').replace(/\//g, '.')}</div>
        </div>

        <div class="separator"></div>

        ${!isAmericano ? `
        <div class="avoid-break">
        <h3 style="margin-top: 16px;">SQUADRE</h3>
        <div style="display: grid; grid-template-columns: repeat(${gridCols}, 1fr); gap: 12px; margin-bottom: 18px;">
            ${teamsContent}
        </div>
        </div>
        ` : ''}

        <div class="avoid-break">
        <h3 style="margin-top: 18px;">Partite e Risultati</h3>
        <table>
            <thead>
                <tr>
                    <th style="text-align: center;">Campo</th>
                    <th>Squadra A</th>
                    <th style="text-align: center;">Risultato</th>
                    <th>Squadra B</th>
                </tr>
            </thead>
            <tbody>
                ${matchesContent}
            </tbody>
        </table>
        </div>

        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">
                Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}
            </div>
            <div style="text-align: right; font-size: 8px;">
                ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
            </div>
        </div>
    `;
    
    return openPrintWindow(`Scheda Punteggi - ${tournamentDetails.name}`, content);
};

export const printGironiTournament = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
) => {
    const displayName = displayNameOverride || tournament.name;
    const safeDisplayName = escapeHtml(displayName);
    const safeClubName = escapeHtml(tournament.club);
    const isScheduled = tournament.status === 'scheduled';

    // 1. SPLIT MATCHES
    let gironiMatchesFlat: Match[];
    let semifinalsMatches: Match[] = [];
    let finalsMatches: Match[] = [];
    
    // 1. SPLIT MATCHES: Only extract semifinals/finals if tournament is completed and has played extra phase matches
    const explicitPhases = partitionMatchesByPhase(matches);
    const hasFinalsMatches = tournament.status === 'completed' && matches.length >= 8 && matches.slice(matches.length - 4).some(m => !!m.winner || (m.sets && m.sets.some(s => s.team1 > 0 || s.team2 > 0)));
    if (explicitPhases.hasExplicitPhases) {
        gironiMatchesFlat = explicitPhases.regular;
        semifinalsMatches = explicitPhases.semifinals;
        finalsMatches = explicitPhases.finals;
    } else if (hasFinalsMatches) {
        const finalsCount = 4;
        gironiMatchesFlat = matches.slice(0, matches.length - finalsCount);
        semifinalsMatches = matches.slice(matches.length - finalsCount, matches.length - 2);
        finalsMatches = matches.slice(matches.length - 2);
    } else {
        gironiMatchesFlat = matches;
        semifinalsMatches = [];
        finalsMatches = [];
    }

    const teamKey = (team: [string, string]) => [...team].sort().join('-');
    const roundRobinMatchCount = (teamsCount: number) => teamsCount * (teamsCount - 1) / 2;
    const explicitNumGironi = Number(tournament.numGironi || 0);
    const groupGironiMatchesByConnectedTeams = () => {
        const parent = new Map<string, string>();
        const order: string[] = [];
        const ensure = (key: string) => {
            if (!parent.has(key)) {
                parent.set(key, key);
                order.push(key);
            }
        };
        const find = (key: string): string => {
            const current = parent.get(key) || key;
            if (current === key) return key;
            const root = find(current);
            parent.set(key, root);
            return root;
        };
        const union = (a: string, b: string) => {
            ensure(a);
            ensure(b);
            const rootA = find(a);
            const rootB = find(b);
            if (rootA !== rootB) parent.set(rootB, rootA);
        };

        gironiMatchesFlat.forEach(match => union(teamKey(match.team1), teamKey(match.team2)));

        const rootOrder: string[] = [];
        order.forEach(key => {
            const root = find(key);
            if (!rootOrder.includes(root)) rootOrder.push(root);
        });

        const groupsByRoot = new Map<string, Match[]>();
        gironiMatchesFlat.forEach(match => {
            const root = find(teamKey(match.team1));
            const group = groupsByRoot.get(root) || [];
            group.push(match);
            groupsByRoot.set(root, group);
        });

        return rootOrder
            .map(root => groupsByRoot.get(root) || [])
            .filter(group => group.length > 0);
    };

    const inferGironiConfig = () => {
        const totalGironiMatches = gironiMatchesFlat.length;
        const uniqueTeams = new Set<string>();
        gironiMatchesFlat.forEach(match => {
            uniqueTeams.add(teamKey(match.team1));
            uniqueTeams.add(teamKey(match.team2));
        });
        const totalTeams = uniqueTeams.size;
        const candidates = [explicitNumGironi, 4, 3, 2]
            .filter((value, index, array) => value >= 2 && array.indexOf(value) === index);

        for (const candidate of candidates) {
            if (totalTeams % candidate !== 0) continue;
            const teamsPerGirone = totalTeams / candidate;
            const expectedMatchesPerGirone = roundRobinMatchCount(teamsPerGirone);
            if (expectedMatchesPerGirone > 0 && totalGironiMatches === expectedMatchesPerGirone * candidate) {
                return { numGironi: candidate, matchesPerGirone: expectedMatchesPerGirone };
            }
        }

        if (explicitNumGironi >= 2) {
            return {
                numGironi: explicitNumGironi,
                matchesPerGirone: Math.ceil(totalGironiMatches / explicitNumGironi)
            };
        }

        const fallbackNumGironi = Math.max(1, Math.ceil(totalGironiMatches / 6));
        return {
            numGironi: fallbackNumGironi,
            matchesPerGirone: Math.ceil(totalGironiMatches / fallbackNumGironi)
        };
    };
    const { numGironi, matchesPerGirone } = inferGironiConfig();
    
    // 2. RAGGRUPPA MATCH PER GIRONE
    const connectedGironiGroups = groupGironiMatchesByConnectedTeams();
    const shouldUseConnectedGroups = connectedGironiGroups.length > 1
        && (explicitNumGironi < 2 || connectedGironiGroups.length === explicitNumGironi);
    const gironiGroups: Match[][] = shouldUseConnectedGroups
        ? connectedGironiGroups
        : Array.from({ length: numGironi }, (_, i) => {
            const start = i * matchesPerGirone;
            const end = Math.min(start + matchesPerGirone, gironiMatchesFlat.length);
            return gironiMatchesFlat.slice(start, end);
        });

    const getTeamsFromGironeMatches = (gironeMatches: Match[]) => {
        const teams: { key: string; pair: [Player, Player] }[] = [];
        const seen = new Set<string>();

        gironeMatches.forEach(match => {
            [match.team1, match.team2].forEach(team => {
                const key = teamKey(team);
                if (seen.has(key)) return;
                const p1 = getPlayerById(team[0]);
                const p2 = getPlayerById(team[1]);
                if (!p1 || !p2) return;
                seen.add(key);
                teams.push({ key, pair: [p1, p2] });
            });
        });

        return teams;
    };

    const sortGironeStandings = <T extends { punti: number; gamesWon: number; gamesLost: number }>(entries: T[]) =>
        entries.sort((a, b) => {
            if (b.punti !== a.punti) return b.punti - a.punti;
            return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
        });

    const calculateGironeStandings = (gironeMatches: Match[]) => {
        const pairStats = new Map<string, { key: string; pair: [Player, Player]; punti: number; gamesWon: number; gamesLost: number }>();

        getTeamsFromGironeMatches(gironeMatches).forEach(team => {
            pairStats.set(team.key, {
                key: team.key,
                pair: team.pair,
                punti: 0,
                gamesWon: 0,
                gamesLost: 0
            });
        });

        gironeMatches.forEach(match => {
            const team1Key = teamKey(match.team1);
            const team2Key = teamKey(match.team2);
            const team1Games = (match.sets || []).reduce((sum, set) => sum + set.team1, 0);
            const team2Games = (match.sets || []).reduce((sum, set) => sum + set.team2, 0);

            const team1Stat = pairStats.get(team1Key);
            const team2Stat = pairStats.get(team2Key);

            if (team1Stat) {
                team1Stat.gamesWon += team1Games;
                team1Stat.gamesLost += team2Games;
                if (team1Games > team2Games) team1Stat.punti += 3;
            }

            if (team2Stat) {
                team2Stat.gamesWon += team2Games;
                team2Stat.gamesLost += team1Games;
                if (team2Games > team1Games) team2Stat.punti += 3;
            }
        });

        return sortGironeStandings(Array.from(pairStats.values()));
    };

    const gironiStandings = gironiGroups.map(calculateGironeStandings);
    const firstQualified = gironiStandings.map(standing => standing[0]).filter(Boolean);
    const secondQualifiedCount = Math.max(0, 4 - firstQualified.length);
    const secondQualified = sortGironeStandings(gironiStandings.map(standing => standing[1]).filter(Boolean))
        .slice(0, secondQualifiedCount);
    const qualifiedKeys = new Set([...firstQualified, ...secondQualified].map(entry => entry.key));

    // 4. GENERA HTML PER OGNI GIRONE
    const gironiSections = gironiGroups.map((gironeMatches, gironeIdx) => {
        const gironeName = String.fromCharCode(65 + gironeIdx); // A, B, C
        
        // 4a. ESTRAI SQUADRE DEL GIRONE
        const gironeTeams = getTeamsFromGironeMatches(gironeMatches);
        
        // 4b. HTML SQUADRE
        const teamsHtml = gironeTeams.map(({ pair }, idx) => `
            <div class="team-box">
                <div class="team-number">Squadra ${idx + 1}</div>
                <div style="color: #000;">${pair[0].name} ${pair[0].surname}</div>
                <div style="color: #000; margin: 2px 0;">&</div>
                <div style="color: #000;">${pair[1].name} ${pair[1].surname}</div>
            </div>
        `).join('');
        
        // 4c. HTML PARTITE
        const matchesHtml = gironeMatches.map((match, matchIdx) => {
        const t1p1 = getPlayerById(match.team1[0]);
        const t1p2 = getPlayerById(match.team1[1]);
        const t2p1 = getPlayerById(match.team2[0]);
        const t2p2 = getPlayerById(match.team2[1]);
        if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return '';

            const team1Name = printableTeamName([t1p1, t1p2]);
            const team2Name = printableTeamName([t2p1, t2p2]);
        const scoreHtml = formatScoreBoxes(match.sets, tournament.status === 'scheduled');

        return `
            <tr>
                    <td style="text-align: center; width: 25%; font-size: 10px; padding: 3px 4px; white-space: nowrap;">G${gironeName}${matchIdx + 1}</td>
                <td style="width: 30%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team1Name}</td>
                <td style="text-align: center; width: 25%; font-size: 11px; padding: 3px 4px; white-space: nowrap;">
                    ${tournament.status === 'scheduled' ? 
                        '<span style="border: 1px solid #ccc; padding: 4px 12px; display: inline-block; font-size: 11px;">&nbsp;</span>' : 
                            scoreHtml
                    }
                </td>
                <td style="width: 30%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team2Name}</td>
            </tr>
        `;
        }).join('');
        
        // 4d. CALCOLA CLASSIFICA GIRONE (solo se completed)
        let standingsHtml = '';
        if (tournament.status !== 'scheduled') {
            const standings = gironiStandings[gironeIdx] || [];
            
            standingsHtml = standings.map((entry, idx) => {
                const isQualified = qualifiedKeys.has(entry.key);
        return `
                    <tr style="height: 20px; ${isQualified ? 'background: #d4edda;' : ''}">
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${idx + 1}</td>
                        <td style="font-size: 11px; padding: 3px 4px;">${entry.pair[0].name} ${entry.pair[0].surname} & ${entry.pair[1].name} ${entry.pair[1].surname}</td>
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${entry.punti}</td>
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${entry.gamesWon}</td>
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${entry.gamesLost}</td>
                        <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${entry.gamesWon - entry.gamesLost >= 0 ? '+' : ''}${entry.gamesWon - entry.gamesLost}</td>
                    </tr>
                `;
            }).join('');
        }
        
        // 4e. RETURN SEZIONE GIRONE COMPLETA
        return `
            <div class="section-block" style="margin-bottom: 20px;">
                <h2 style="font-size: 14px; font-weight: bold; margin: 10px 0; padding: 5px; background: #f0f0f0; border-left: 4px solid #007bff;">GIRONE ${gironeName}</h2>
                
                <h3 style="font-size: 11px; font-weight: bold; margin: 8px 0 4px 0;">Squadre</h3>
                <div class="team-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px;">
                    ${teamsHtml}
                </div>
                
                <h3 style="font-size: 11px; font-weight: bold; margin: 8px 0 4px 0;">Partite</h3>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 15%; text-align: center;">Partita</th>
                            <th style="width: 30%;">Squadra A</th>
                            <th style="width: 15%; text-align: center;">Risultato</th>
                            <th style="width: 30%;">Squadra B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${matchesHtml}
                    </tbody>
                </table>
                
                ${tournament.status !== 'scheduled' ? `
                    <h3 style="font-size: 11px; font-weight: bold; margin: 8px 0 4px 0;">Classifica Girone ${gironeName}</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Pos</th>
                                <th>Squadra</th>
                                <th>Punti</th>
                                <th>GW</th>
                                <th>GL</th>
                                <th>Diff</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${standingsHtml}
                        </tbody>
                    </table>
                ` : ''}
            </div>
        `;
    }).join('');

    // 5. GENERA SEMIFINALS/FINALS
    let semifinalsSection = '';
    let finalsSection = '';
    
    if (semifinalsMatches.length === 0) {
        semifinalsSection = `
            <div class="section-block" style="margin: 16px 0;">
                <h3 style="font-size: 13px; font-weight: bold; margin: 10px 0 6px 0; padding: 4px 6px; background: #eff6ff; border-left: 4px solid #0284c7; color: #0369a1;">
                    ⚡ FASE FINALE - SEMIFINALI
                </h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;">
                    <tbody>
                        <tr style="height: 22px;">
                            <td style="width: 37%; text-align: right; font-size: 11px; padding: 4px 6px;">
                                <div style="font-size: 9px; color: #666; margin-bottom: 2px;">1° Girone A</div>
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 11px; width: 85%; min-width: 120px; background: #fff;">&nbsp;</span>
                            </td>
                            <td style="text-align: center; width: 26%; font-size: 11px; padding: 4px 6px;">
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; font-size: 11px; background: #fff;">&nbsp;&nbsp;&nbsp;</span> - <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; font-size: 11px; background: #fff;">&nbsp;&nbsp;&nbsp;</span>
                            </td>
                            <td style="width: 37%; text-align: left; font-size: 11px; padding: 4px 6px;">
                                <div style="font-size: 9px; color: #666; margin-bottom: 2px;">2° Girone B</div>
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 11px; width: 85%; min-width: 120px; background: #fff;">&nbsp;</span>
                            </td>
                        </tr>
                        <tr style="height: 22px;">
                            <td style="width: 37%; text-align: right; font-size: 11px; padding: 4px 6px;">
                                <div style="font-size: 9px; color: #666; margin-bottom: 2px;">1° Girone B</div>
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 11px; width: 85%; min-width: 120px; background: #fff;">&nbsp;</span>
                            </td>
                            <td style="text-align: center; width: 26%; font-size: 11px; padding: 4px 6px;">
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; font-size: 11px; background: #fff;">&nbsp;&nbsp;&nbsp;</span> - <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; font-size: 11px; background: #fff;">&nbsp;&nbsp;&nbsp;</span>
                            </td>
                            <td style="width: 37%; text-align: left; font-size: 11px; padding: 4px 6px;">
                                <div style="font-size: 9px; color: #666; margin-bottom: 2px;">2° Girone A</div>
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 11px; width: 85%; min-width: 120px; background: #fff;">&nbsp;</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <h3 style="font-size: 13px; font-weight: bold; margin: 12px 0 6px 0; padding: 4px 6px; background: #fff3e0; border-left: 4px solid #ff9800; color: #d97706;">
                    🏆 FASE FINALE - 1°/2° POSTO
                </h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;">
                    <tbody>
                        <tr style="height: 22px;">
                            <td style="width: 37%; text-align: right; font-size: 11px; padding: 4px 6px;">
                                <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Vincitore SF A</div>
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 11px; width: 85%; min-width: 120px; background: #fff;">&nbsp;</span>
                            </td>
                            <td style="text-align: center; width: 26%; font-size: 11px; padding: 4px 6px;">
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; font-size: 11px; background: #fff;">&nbsp;&nbsp;&nbsp;</span> - <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; font-size: 11px; background: #fff;">&nbsp;&nbsp;&nbsp;</span>
                            </td>
                            <td style="width: 37%; text-align: left; font-size: 11px; padding: 4px 6px;">
                                <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Vincitore SF B</div>
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 11px; width: 85%; min-width: 120px; background: #fff;">&nbsp;</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <h3 style="font-size: 13px; font-weight: bold; margin: 12px 0 6px 0; padding: 4px 6px; background: #e8f5e8; border-left: 4px solid #4caf50; color: #2e7d32;">
                    🥉 FASE FINALE - 3°/4° POSTO
                </h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;">
                    <tbody>
                        <tr style="height: 22px;">
                            <td style="width: 37%; text-align: right; font-size: 11px; padding: 4px 6px;">
                                <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Perdente SF A</div>
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 11px; width: 85%; min-width: 120px; background: #fff;">&nbsp;</span>
                            </td>
                            <td style="text-align: center; width: 26%; font-size: 11px; padding: 4px 6px;">
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; font-size: 11px; background: #fff;">&nbsp;&nbsp;&nbsp;</span> - <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; display: inline-block; font-size: 11px; background: #fff;">&nbsp;&nbsp;&nbsp;</span>
                            </td>
                            <td style="width: 37%; text-align: left; font-size: 11px; padding: 4px 6px;">
                                <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Perdente SF B</div>
                                <span style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; display: inline-block; font-size: 11px; width: 85%; min-width: 120px; background: #fff;">&nbsp;</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
        finalsSection = '';
    } else {
        // PDF COMPLETO: Mostra semifinali/finali con risultati
        const generateMatchRow = (match: Match, label: string) => {
            const t1p1 = getPlayerById(match.team1[0]);
            const t1p2 = getPlayerById(match.team1[1]);
            const t2p1 = getPlayerById(match.team2[0]);
            const t2p2 = getPlayerById(match.team2[1]);
            const team1Name = printableTeamName([t1p1, t1p2]);
            const team2Name = printableTeamName([t2p1, t2p2]);
            const scoreHtml = formatScoreBoxes(match.sets, false);

            return `
                <tr>
                    <td style="text-align: center; width: 25%; font-size: 10px; padding: 3px 4px; white-space: nowrap;">${escapeHtml(label)}</td>
                    <td style="width: 30%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team1Name}</td>
                    <td style="text-align: center; width: 25%; font-size: 11px; padding: 3px 4px; white-space: nowrap;">
                        ${scoreHtml}
                    </td>
                    <td style="width: 30%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team2Name}</td>
                </tr>
            `;
        };
        
        const semifinalA = semifinalsMatches.length > 0 ? `
            <div class="section-block" style="margin: 8px 0;">
                <h3 style="font-size: 11px; font-weight: bold; margin: 4px 0; padding: 3px; background: #eff6ff;">SEMIFINALE A</h3>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 15%; text-align: center;">Partita</th>
                            <th style="width: 30%;">Squadra A</th>
                            <th style="width: 15%; text-align: center;">Risultato</th>
                            <th style="width: 30%;">Squadra B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateMatchRow(semifinalsMatches[0], 'SF A')}
                    </tbody>
                </table>
            </div>
        ` : '';

        const semifinalB = semifinalsMatches.length > 1 ? `
            <div class="section-block" style="margin: 8px 0;">
                <h3 style="font-size: 11px; font-weight: bold; margin: 4px 0; padding: 3px; background: #eff6ff;">SEMIFINALE B</h3>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 15%; text-align: center;">Partita</th>
                            <th style="width: 30%;">Squadra A</th>
                            <th style="width: 15%; text-align: center;">Risultato</th>
                            <th style="width: 30%;">Squadra B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateMatchRow(semifinalsMatches[1], 'SF B')}
                    </tbody>
                </table>
            </div>
        ` : '';
        
        semifinalsSection = `
            <div class="section-block">
                <h2 style="font-size: 14px; margin-top: 20px;">SEMIFINALI</h2>
                ${semifinalA}
            </div>
            ${semifinalB}
        `;
        
        const finale34 = finalsMatches.length > 0 ? `
            <div class="section-block" style="margin: 8px 0;">
                <h3 style="font-size: 11px; font-weight: bold; margin: 4px 0; padding: 3px; background: #ffe0b2;">FINALE 3° E 4° POSTO</h3>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 15%; text-align: center;">Partita</th>
                            <th style="width: 30%;">Squadra A</th>
                            <th style="width: 15%; text-align: center;">Risultato</th>
                            <th style="width: 30%;">Squadra B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateMatchRow(finalsMatches[0], 'F 3-4')}
                    </tbody>
                </table>
            </div>
        ` : '';

        const finalissima = finalsMatches.length > 1 ? `
            <div class="section-block" style="margin: 8px 0;">
                <h3 style="font-size: 11px; font-weight: bold; margin: 4px 0; padding: 3px; background: #ffd700;">FINALISSIMA</h3>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 15%; text-align: center;">Partita</th>
                            <th style="width: 30%;">Squadra A</th>
                            <th style="width: 15%; text-align: center;">Risultato</th>
                            <th style="width: 30%;">Squadra B</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateMatchRow(finalsMatches[1], 'F 1-2')}
                    </tbody>
                </table>
            </div>
        ` : '';
        
        finalsSection = `
            <div class="section-block">
                <h2 style="font-size: 14px; margin-top: 20px;">FINALI</h2>
                ${finale34}
            </div>
            ${finalissima}
        `;
    }

    // 6. CLASSIFICA FINALE (solo se completed)
    let finalStandingsHtml = '';
    if (tournament.status !== 'scheduled') {
        // Raccoglie tutti i match per calcolo classifica finale
        const allMatches = [...gironiGroups.flat(), ...semifinalsMatches, ...finalsMatches];
        const allPlayerIds = new Set<string>();
        allMatches.forEach(match => {
            match.team1.forEach(id => allPlayerIds.add(id));
            match.team2.forEach(id => allPlayerIds.add(id));
        });
        
        const allPlayers = Array.from(allPlayerIds).map(id => getPlayerById(id)).filter(Boolean) as Player[];
        const allPairs: [Player, Player][] = [];
        for (let i = 0; i < allPlayers.length; i += 2) {
            if (i + 1 < allPlayers.length) {
                allPairs.push([allPlayers[i], allPlayers[i + 1]]);
            }
        }
        
        const pairStats = new Map<string, any>();
    
    allPairs.forEach(pair => {
        const key = `${pair[0].id}-${pair[1].id}`;
        pairStats.set(key, {
            pair,
            punti: 0,
            gamesWon: 0,
            gamesLost: 0
        });
    });
    
    allMatches.forEach(match => {
        const team1Key = `${match.team1[0]}-${match.team1[1]}`;
        const team2Key = `${match.team2[0]}-${match.team2[1]}`;
        const team1Games = (match.sets || []).reduce((sum, set) => sum + set.team1, 0);
        const team2Games = (match.sets || []).reduce((sum, set) => sum + set.team2, 0);
        
        const team1Stat = pairStats.get(team1Key);
        const team2Stat = pairStats.get(team2Key);
        
        if (team1Stat) {
            team1Stat.gamesWon += team1Games;
            team1Stat.gamesLost += team2Games;
            if (team1Games > team2Games) team1Stat.punti += 3;
        }
        
        if (team2Stat) {
            team2Stat.gamesWon += team2Games;
            team2Stat.gamesLost += team1Games;
            if (team2Games > team1Games) team2Stat.punti += 3;
        }
    });
    
    const standings = Array.from(pairStats.values()).sort((a, b) => {
        if (b.punti !== a.punti) return b.punti - a.punti;
        return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
    });
    
        finalStandingsHtml = standings.map((entry, index) => {
        return `
                <tr style="height: 20px;">
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${index + 1}</td>
                    <td style="font-size: 11px; padding: 3px 4px;">${entry.pair[0].name} ${entry.pair[0].surname} & ${entry.pair[1].name} ${entry.pair[1].surname}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${entry.punti}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${entry.gamesWon}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${entry.gamesLost}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px;">${entry.gamesWon - entry.gamesLost >= 0 ? '+' : ''}${entry.gamesWon - entry.gamesLost}</td>
            </tr>
        `;
    }).join('');
    }

    // 7. HTML FINALE
    const content = `
        <style>
            @page {
                size: A4;
                margin: 12mm 10mm;
            }
            body {
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
                font-size: 11px;
                line-height: 1.3;
                margin: 0;
                padding: 0;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            h1 {
                font-size: 22px;
                margin: 0 0 3px 0;
                color: #111827;
                font-weight: bold;
            }
            h2 {
                font-size: 14px;
                margin: 0 0 2px 0;
                color: #666;
                font-weight: normal;
            }
            h3 {
                font-size: 13px;
                margin: 10px 0 3px 0;
                color: #000;
                font-weight: bold;
            }
            .team-box {
                text-align: center;
                font-weight: bold;
                padding: 2px 3px;
                background-color: #f0f5ff;
                border: 1px solid #c7d9f0;
                border-radius: 3px;
                font-size: 11px;
                line-height: 1.1;
                height: 60px;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
            .team-number {
                color: #111827;
                font-weight: bold;
                margin-bottom: 1px;
                font-size: 11px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 3px 0 6px 0;
                font-size: 11px;
            }
            th {
                background-color: #1e3a6e;
                color: white;
                padding: 5px 6px;
                text-align: left;
                font-weight: bold;
                font-size: 11px;
                height: 24px;
            }
            td {
                padding: 5px 6px;
                border-bottom: 1px solid #e5e7eb;
                vertical-align: middle;
                font-size: 11px;
                line-height: 1.3;
                height: 24px;
            }
            tr:nth-child(even) {
                background-color: #f0f5ff;
            }
        </style>
        
        <div style="text-align: center; margin-bottom: 3px;">
            <h1>${safeDisplayName}</h1>
            <h2>${safeClubName} - ${escapeHtml(tournament.type)}</h2>
            <div style="color: #111827; font-size: 13px; font-weight: bold; margin: 2px 0 0 0;">
                Giornata del ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}
            </div>
        </div>
        
        <div style="border-bottom: 1px solid #1e3a6e; margin: 5px 0;"></div>
        
        ${gironiSections}
        
        ${semifinalsSection}
        
        ${finalsSection}
        
        ${!isScheduled && finalStandingsHtml ? `
            <div class="section-block">
            <h2 style="font-size: 14px; margin-top: 20px;">CLASSIFICA FINALE</h2>
            <table>
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Squadra</th>
                        <th>Punti</th>
                        <th>GW</th>
                        <th>GL</th>
                        <th>Diff</th>
                    </tr>
                </thead>
                <tbody>
                    ${finalStandingsHtml}
                </tbody>
            </table>
            </div>
        ` : ''}
    `;
    
    return openPrintWindow(`${displayName.replace(' - ', ', ')}, Gironi e Fase Finale, ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}`, content);
};

// Funzione per stampare il report del torneo TPRA (Eliminazione Diretta Singolo) con Tabellone ad Albero ed Albo d'Oro
export const printTpraTournamentReport = (
    tournament: Tournament,
    matches: Match[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
) => {
    const displayName = displayNameOverride || tournament.name;

    const formatTeamName = (team?: [Player, Player]) => {
        if (!team || !team[0] || !team[1]) return 'TBD';
        return `${team[0].surname || team[0].name} & ${team[1].surname || team[1].name}`;
    };

    const findMatchWinner = (team1: [Player, Player], team2: [Player, Player]) => {
        const match = matches.find(m => {
            const mTeam1Ids = [m.team1[0], m.team1[1]].sort().join(',');
            const mTeam2Ids = [m.team2[0], m.team2[1]].sort().join(',');
            const t1Ids = [team1[0].id, team1[1].id].sort().join(',');
            const t2Ids = [team2[0].id, team2[1].id].sort().join(',');
            return (mTeam1Ids === t1Ids && mTeam2Ids === t2Ids) || (mTeam1Ids === t2Ids && mTeam2Ids === t1Ids);
        });
        if (!match || !match.winner || match.winner === 'draw') return { winner: undefined, match: undefined };
        const matchTeam1Ids = [match.team1[0], match.team1[1]].sort().join(',');
        const nodeTeam1Ids = [team1[0].id, team1[1].id].sort().join(',');
        const winner = matchTeam1Ids === nodeTeam1Ids ? match.winner : (match.winner === 'team1' ? 'team2' : 'team1');
        return { winner, match };
    };

    let initialRound: BracketNode[] = [];
    if (tournament.finalStandings && (tournament.finalStandings as any).bracket) {
        initialRound = (tournament.finalStandings as any).bracket as BracketNode[];
    } else {
        const pairMap = new Map<string, [Player, Player]>();
        matches.forEach(m => {
            const p1 = getPlayerById(m.team1[0]);
            const p2 = getPlayerById(m.team1[1]);
            const p3 = getPlayerById(m.team2[0]);
            const p4 = getPlayerById(m.team2[1]);
            if (p1 && p2) pairMap.set([p1.id, p2.id].sort().join('-'), [p1, p2]);
            if (p3 && p4) pairMap.set([p3.id, p4.id].sort().join('-'), [p3, p4]);
        });
        initialRound = generateTpraBracket(Array.from(pairMap.values()));
    }

    const computedRounds: BracketNode[][] = [];
    let currentRound: BracketNode[] = initialRound.map(node => {
        if (node.isBye) {
            const autoWinner = node.team1 ? 'team1' : 'team2';
            return { ...node, winner: autoWinner };
        }
        let winner = node.winner;
        let match = node.match;
        if (node.team1 && node.team2) {
            const res = findMatchWinner(node.team1, node.team2);
            if (res.winner) winner = res.winner;
            if (res.match) match = res.match;
        }
        return { ...node, winner, match };
    });

    computedRounds.push(currentRound);
    let rIdx = 0;
    while (currentRound.length > 1) {
        const nextRound: BracketNode[] = [];
        for (let i = 0; i < currentRound.length; i += 2) {
            const n1 = currentRound[i];
            const n2 = currentRound[i + 1];
            const w1 = n1.winner === 'team1' ? n1.team1 : (n1.winner === 'team2' ? n1.team2 : undefined);
            const w2 = n2.winner === 'team1' ? n2.team1 : (n2.winner === 'team2' ? n2.team2 : undefined);
            let nextWinner: 'team1' | 'team2' | undefined = undefined;
            let nextMatch: Match | undefined = undefined;
            if (w1 && w2) {
                const res = findMatchWinner(w1, w2);
                nextWinner = res.winner;
                nextMatch = res.match;
            }
            nextRound.push({
                id: `r${rIdx + 1}_p${i / 2}`,
                round: rIdx + 1,
                position: i / 2,
                team1: w1,
                team2: w2,
                isBye: false,
                winner: nextWinner,
                match: nextMatch
            });
        }
        computedRounds.push(nextRound);
        currentRound = nextRound;
        rIdx++;
    }

    const totalRounds = computedRounds.length;
    const getRoundTitle = (idx: number) => {
        const distFromFinal = totalRounds - 1 - idx;
        if (distFromFinal === 0) return 'FINALE 🏆';
        if (distFromFinal === 1) return 'Semifinali';
        if (distFromFinal === 2) return 'Quarti di Finale';
        if (distFromFinal === 3) return 'Ottavi di Finale';
        return `Turno ${idx + 1}`;
    };

    const columnsHtml = computedRounds.map((roundNodes, idx) => {
        const isFinalCol = idx === totalRounds - 1;
        const roundTitle = getRoundTitle(idx);

        const cards = roundNodes.map((node, nIdx) => {
            const isFinalNode = isFinalCol;
            const isBye = node.isBye;

            let badge = '';
            let scoreText = '';
            if (isBye) {
                badge = `<span style="font-size: 8px; font-weight: 900; background: #e2e8f0; color: #475569; padding: 2px 5px; border-radius: 3px;">BYE</span>`;
            } else if (node.match && node.match.sets && node.match.sets.length > 0) {
                scoreText = node.match.sets.map(s => `${s.team1}-${s.team2}`).join(' ');
                badge = `<span style="font-size: 8px; font-weight: 900; background: #dbeafe; color: #1e40af; padding: 2px 5px; border-radius: 3px;">${scoreText}</span>`;
            } else if (node.winner) {
                badge = `<span style="font-size: 8px; font-weight: 900; background: #dcfce7; color: #166534; padding: 2px 5px; border-radius: 3px;">CONCLUSA</span>`;
            }

            const t1Name = node.team1 ? formatTeamName(node.team1) : 'TBD';
            const t2Name = node.team2 ? formatTeamName(node.team2) : 'TBD';

            const t1Win = node.winner === 'team1';
            const t2Win = node.winner === 'team2';

            return `
                <div style="border: 1px solid ${isFinalNode ? '#f59e0b' : '#cbd5e1'}; background: ${isFinalNode ? '#fffbeb' : '#ffffff'}; padding: 6px 8px; border-radius: 6px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-size: 8px; font-weight: 800; color: #64748b; text-transform: uppercase;">Match ${nIdx + 1}</span>
                        ${badge}
                    </div>
                    <div style="font-size: 10px; padding: 2px 0; font-weight: ${t1Win ? '900' : '500'}; color: ${t1Win ? '#0f172a' : '#64748b'};">
                        ${t1Win ? '🏆 ' : ''}${t1Name}
                    </div>
                    <div style="border-top: 1px dashed #e2e8f0; margin: 2px 0;"></div>
                    <div style="font-size: 10px; padding: 2px 0; font-weight: ${t2Win ? '900' : '500'}; color: ${t2Win ? '#0f172a' : '#64748b'};">
                        ${t2Win ? '🏆 ' : ''}${t2Name}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div style="flex: 1; min-width: 140px; margin: 0 4px;">
                <div style="text-align: center; font-size: 10px; font-weight: 900; color: #0f172a; background: #f1f5f9; padding: 5px; margin-bottom: 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em;">
                    ${roundTitle}
                </div>
                ${cards}
            </div>
        `;
    }).join('');

    const finalNode = computedRounds[computedRounds.length - 1]?.[0];
    let winnersText = 'Da disputare';
    let runnersUpText = 'Da disputare';
    let semiFinalistsText = 'Da disputare';

    if (finalNode && finalNode.winner) {
        const winnerTeam = finalNode.winner === 'team1' ? finalNode.team1 : finalNode.team2;
        const runnerTeam = finalNode.winner === 'team1' ? finalNode.team2 : finalNode.team1;
        if (winnerTeam) winnersText = `${winnerTeam[0].name} ${winnerTeam[0].surname} & ${winnerTeam[1].name} ${winnerTeam[1].surname}`;
        if (runnerTeam) runnersUpText = `${runnerTeam[0].name} ${runnerTeam[0].surname} & ${runnerTeam[1].name} ${runnerTeam[1].surname}`;
    }

    if (computedRounds.length >= 2) {
        const semis = computedRounds[computedRounds.length - 2];
        const semiTeams: string[] = [];
        semis.forEach(sf => {
            if (sf.winner && sf.team1 && sf.team2) {
                const loserTeam = sf.winner === 'team1' ? sf.team2 : sf.team1;
                semiTeams.push(`${loserTeam[0].name} ${loserTeam[0].surname} & ${loserTeam[1].name} ${loserTeam[1].surname}`);
            }
        });
        if (semiTeams.length > 0) semiFinalistsText = semiTeams.join(' | ');
    }

    const totalMatchesCount = matches.length;
    const completedMatchesCount = matches.filter(m => m.winner && m.sets.length > 0).length;
    const totalGamesPlayed = matches.reduce((sum, m) => sum + (m.sets || []).reduce((sSum, s) => sSum + s.team1 + s.team2, 0), 0);

    const honorRollHtml = `
        <div style="margin-top: 15px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
            <div style="border: 2px solid #f59e0b; background: #fffbeb; padding: 10px; border-radius: 8px; text-align: center;">
                <div style="font-size: 10px; font-weight: 900; color: #b45309; text-transform: uppercase;">🏆 VINCITORI (1° POSTO)</div>
                <div style="font-size: 12px; font-weight: 900; color: #78350f; margin-top: 4px;">${winnersText}</div>
            </div>
            <div style="border: 1px solid #94a3b8; background: #f8fafc; padding: 10px; border-radius: 8px; text-align: center;">
                <div style="font-size: 10px; font-weight: 900; color: #475569; text-transform: uppercase;">🥈 FINALISTI (2° POSTO)</div>
                <div style="font-size: 12px; font-weight: 800; color: #1e293b; margin-top: 4px;">${runnersUpText}</div>
            </div>
            <div style="border: 1px solid #cbd5e1; background: #ffffff; padding: 10px; border-radius: 8px; text-align: center;">
                <div style="font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase;">🥉 SEMIFINALISTI</div>
                <div style="font-size: 11px; font-weight: 700; color: #334155; margin-top: 4px;">${semiFinalistsText}</div>
            </div>
        </div>

        <div style="margin-top: 12px; border: 1px solid #e2e8f0; background: #f8fafc; padding: 8px 12px; border-radius: 6px; display: flex; justify-content: space-around; font-size: 11px; color: #475569;">
            <div><strong>Partite Completate:</strong> ${completedMatchesCount} di ${totalMatchesCount}</div>
            <div><strong>Games Disputati:</strong> ${totalGamesPlayed}</div>
            <div><strong>Formato:</strong> TPRA Eliminazione Diretta</div>
        </div>
    `;

    const content = `
        <style>
            @page {
                size: A4 landscape;
                margin: 10mm;
            }
            body {
                font-family: 'Manrope', sans-serif;
                font-size: 11px;
                margin: 0;
                padding: 0;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            h1 { font-size: 20px; margin: 0 0 2px 0; color: #0f172a; font-weight: 900; }
            h2 { font-size: 12px; margin: 0; color: #64748b; font-weight: 600; }
        </style>
        
        <div style="text-align: center; margin-bottom: 12px;">
            <h1>${displayName}</h1>
            <h2>${tournament.club} — Torneo TPRA ad Eliminazione Diretta (${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')})</h2>
        </div>
        
        <div style="border-bottom: 2px solid #0f172a; margin-bottom: 12px;"></div>

        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            ${columnsHtml}
        </div>

        ${honorRollHtml}
    `;

    return openPrintWindow(`${displayName}, Torneo TPRA Tabellone, ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}`, content);
};

// Funzione per stampare le statistiche del torneo
export const printTournamentStatistics = (stats: any) => {
    // Generate top 5 rows
    const top5Rows = stats.top5.map((entry: any, idx: number) => {
        const varColor = entry.variazioneElo >= 0 ? '#059669' : '#dc2626';
        const varSign = entry.variazioneElo >= 0 ? '+' : '';
        return `
            <tr>
                <td style="text-align: center;">${idx + 1}°</td>
                <td>${entry.player.name} ${entry.player.surname}</td>
                <td style="text-align: center; font-weight: bold;">${entry.eloTorneo.toFixed(2)}</td>
                <td style="text-align: center; font-weight: bold; color: ${varColor};">
                    ${varSign}${entry.variazioneElo.toFixed(2)}
                </td>
                <td style="text-align: center;">${entry.gamesWon} / ${entry.gamesLost}</td>
            </tr>
        `;
    }).join('');

    // Generate stat cards
    const gamesVintiEntries = stats.giocatoreConPiuGamesVinti.slice(0, 3).map((e: any, i: number) => 
        e.games > 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.games})</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const gamesPersiEntries = stats.giocatoreConPiuGamesPersi.slice(0, 3).map((e: any, i: number) => 
        e.games > 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.games})</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const coppiaEntries = stats.coppiaFrequente.length > 0 
        ? stats.coppiaFrequente.slice(0, 3).map((c: any, i: number) => 
            `<div class="stat-card-entry">${i+1}. ${escapeHtml(formatPlayerShortName(c.players[0]))} & ${escapeHtml(formatPlayerShortName(c.players[1]))} (${c.partite})</div>`
        ).join('')
        : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>';

    const vittorieEntries = stats.serieVittorie.slice(0, 3).map((s: any, i: number) =>
        s.vittorie > 0
            ? `<div class="stat-card-entry">${i+1}. ${s.player.name} ${s.player.surname} (${s.vittorie})</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const upsetEntries = stats.upset[0].count > 0
        ? stats.upset[0].details.slice(0, 3).map((d: string, i: number) =>
            `<div class="stat-card-entry">${i+1}. ${d}</div>`
          ).join('')
        : '<div class="stat-card-entry">Nessun upset</div>';

    const guadagnoEntries = stats.maggiorGuadagnoElo.slice(0, 3).map((e: any, i: number) => 
        e.guadagno > 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (+${e.guadagno.toFixed(1)})</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const perditaEntries = stats.peggiorPerditaElo.slice(0, 3).map((e: any, i: number) => 
        e.perdita > 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (-${e.perdita.toFixed(1)})</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const mvpEntries = stats.mvp.slice(0, 3).map((m: any) => 
        m.vittorieGiornate > 0 
            ? `<div class="award-entry">${m.player.name} ${m.player.surname}<br/>${m.vittorieGiornate} giornat${m.vittorieGiornate === 1 ? 'a' : 'e'}</div>`
            : '<div class="award-entry" style="font-size: 8px;">(in attesa di dati ulteriori)</div>'
    ).join('');

    // Nuove statistiche per PDF
    const gameWinRateEntries = stats.gameWinRate.slice(0, 3).map((e: any, i: number) => 
        e.percentage > 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.percentage.toFixed(1)}%)</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const gameRatioEntries = stats.gameRatio.slice(0, 3).map((e: any, i: number) => 
        e.ratio > 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.ratio.toFixed(2)})</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const partiteVinteEntries = stats.partiteVinte.slice(0, 3).map((e: any, i: number) => 
        e.wins > 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.wins} vittorie)</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const eloPerPartitaEntries = stats.eloPerPartita.slice(0, 3).map((e: any, i: number) => 
        e.eloPerMatch !== 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.eloPerMatch >= 0 ? '+' : ''}${e.eloPerMatch.toFixed(1)})</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const upsetPercentageEntries = stats.upsetPercentage.slice(0, 3).map((e: any, i: number) => 
        e.percentage > 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.percentage.toFixed(1)}%)</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const migliorCoppiaEntries = stats.migliorCoppiaWinRate.slice(0, 3).map((e: any, i: number) => 
        e.winRate > 0 
            ? `<div class="stat-card-entry">${i+1}. ${escapeHtml(formatPlayerShortName(e.players[0]))} & ${escapeHtml(formatPlayerShortName(e.players[1]))} (${e.winRate.toFixed(1)}% - ${e.partite} partite)</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const serieSconfitteEntries = stats.serieSconfitte.slice(0, 3).map((e: any, i: number) => 
        e.sconfitte > 0 
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.sconfitte} sconfitte)</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');


    const resilienzaEntries = stats.resilienza.slice(0, 3).map((e: any, i: number) =>
        e.perditaMedia > 0
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (-${e.perditaMedia.toFixed(1)} ELO/match)</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    // Nuove statistiche
    const formEntries = stats.form.slice(0, 5).map((e: any, i: number) =>
        e.form !== 'N/A'
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.form})</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const clutchEntries = stats.clutchPerformance.slice(0, 3).map((e: any, i: number) =>
        e.clutchMatches > 0
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (${e.clutchWinRate.toFixed(1)}% in ${e.clutchMatches} match)</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    const difesaEntries = stats.difesaFerrea.slice(0, 3).map((e: any, i: number) =>
        e.wins > 0
            ? `<div class="stat-card-entry">${i+1}. ${e.player.name} ${e.player.surname} (+${e.avgGameDifference.toFixed(1)} games/match in ${e.wins} vittorie)</div>`
            : '<div class="stat-card-entry">(in attesa di dati ulteriori)</div>'
    ).join('');

    // Premi Speciali
    const cecchinoEntries = stats.gameWinRate.length > 0
        ? stats.gameWinRate.slice(0, 3).map((m: any) =>
            `<div class="award-entry">${m.player.name} ${m.player.surname}<br/>${m.percentage.toFixed(1)}%</div>`
          ).join('')
        : '<div class="award-entry" style="font-size: 8px;">(in attesa di dati ulteriori)</div>';

    const giantKillerEntries = stats.upsetPercentage.length > 0
        ? stats.upsetPercentage.slice(0, 3).map((m: any) =>
            `<div class="award-entry">${m.player.name} ${m.player.surname}<br/>${m.percentage.toFixed(1)}%</div>`
          ).join('')
        : '<div class="award-entry" style="font-size: 8px;">(in attesa di dati ulteriori)</div>';

    const incassatoreEntries = stats.resilienza.length > 0
        ? stats.resilienza.slice(0, 3).map((m: any) =>
            `<div class="award-entry">${m.player.name} ${m.player.surname}<br/>-${m.perditaMedia.toFixed(1)} ELO/match</div>`
          ).join('')
        : '<div class="award-entry" style="font-size: 8px;">(in attesa di dati ulteriori)</div>';

    const mutedAwardCard = (title: string, subtitle: string, entries: string, accent: 'blue' | 'green' | 'orange' | 'gray') => {
        const palette = {
            blue: { bg: '#eff6ff', border: '#1e3a6e' },
            green: { bg: '#f0fdf4', border: '#16a34a' },
            orange: { bg: '#fff7ed', border: '#ea580c' },
            gray: { bg: '#f8fafc', border: '#94a3b8' },
        }[accent];
        return `
            <div class="award-card avoid-break" style="background: ${palette.bg}; border-color: ${palette.border};">
                <div class="award-title">${title}</div>
                <div class="award-subtitle">${subtitle}</div>
                ${entries}
            </div>
        `;
    };

    const content = `
        <style>
            @page {
                size: A4;
                margin: 10mm;
            }
            body {
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
                font-size: 11px;
                line-height: 1.3;
                margin: 0;
                padding: 0;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            h1 {
                font-size: 22px;
                margin: 0 0 4px 0;
                color: #111827;
                font-weight: bold;
                text-align: center;
            }
            h2 {
                font-size: 14px;
                margin: 0 0 6px 0;
                color: #666;
                font-weight: normal;
                text-align: center;
            }
            h3 {
                font-size: 13px;
                margin: 12px 0 6px 0;
                color: #000;
                font-weight: bold;
                padding: 0;
            }
            .separator {
                border-bottom: 3px solid #1e3a6e;
                margin: 12px 0 14px 0;
            }
            .info-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
                margin: 8px 0;
            }
            .info-box {
                background: #f0f5ff;
                border: 1px solid #e5e7eb;
                border-radius: 4px;
                padding: 6px;
                text-align: center;
            }
            .info-label {
                font-size: 8px;
                color: #666;
                margin-bottom: 2px;
            }
            .info-value {
                font-size: 14px;
                font-weight: bold;
                color: #000;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 6px 0 12px 0;
                font-size: 11px;
            }
            th { background-color: #1e3a6e; color: white; padding: 6px 10px; text-align: left; font-weight: bold; font-size: 11px; border: 1px solid #1e3a6e; }
            td {
                padding: 5px 6px;
                border-bottom: 1px solid #e5e7eb;
                vertical-align: middle;
                font-size: 11px;
                line-height: 1.3;
            }
            tr:nth-child(even) {
                background-color: #f0f5ff;
            }
            .stat-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 6px;
                margin: 8px 0 14px 0;
            }
            .stat-card {
                background: #f0f5ff;
                border: 1px solid #e5e7eb;
                padding: 8px 10px;
            }
            .stat-card-title {
                font-size: 10px;
                font-weight: bold;
                margin-bottom: 4px;
                color: #000;
            }
            .stat-card-entry { font-size: 11px; color: #000; margin-bottom: 6px; line-height: 1.3; }
            .award-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
                margin: 8px 0 14px 0;
            }
            .award-card {
                border: 1px solid;
                padding: 8px 10px;
                text-align: center;
            }
            
            /* WebKit Print Fix for Grids */
            @media print {
                .info-grid { display: block; margin: 8px 0; }
                .info-box { display: inline-block; width: 31%; box-sizing: border-box; vertical-align: top; margin-bottom: 8px; margin-right: 2%; }
                .info-box:nth-child(3n) { margin-right: 0; }
                
                .stat-grid { display: block; margin: 8px 0; }
                .stat-card { display: inline-block; width: 48%; box-sizing: border-box; vertical-align: top; margin-bottom: 8px; margin-right: 2%; }
                .stat-card:nth-child(even) { margin-left: 0; margin-right: 0; }
                
                .award-grid { display: block; margin: 8px 0; }
                .award-card { display: inline-block; width: 23%; box-sizing: border-box; vertical-align: top; margin-bottom: 8px; margin-right: 2%; }
                .award-card:nth-child(4n) { margin-right: 0; }
            }
            
            .award-title {
                font-size: 10px;
                font-weight: bold;
                margin-bottom: 3px;
            }
            .award-subtitle {
                font-size: 8px;
                color: #666;
                margin-bottom: 4px;
            }
            .award-entry {
                font-size: 10px;
                font-weight: bold;
                margin: 2px 0;
            }
            .footer {
                margin-top: 14px;
                padding-top: 8px;
                border-top: 1px solid #e5e7eb;
                font-size: 8px;
                color: #666;
            }
        </style>

        <div style="margin-bottom: 2px;">
            <h1>Statistiche Torneo</h1>
            <h2>${stats.tournament.name} &mdash; ${stats.tournament.club}</h2>
            ${stats.isPartial ? `
                <div style="display:flex; justify-content:center; margin: 0 0 6px 0;">
                    <div style="display:inline-flex; align-items:center; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; border-radius:999px; padding:4px 10px; font-size:11px; font-weight:800;">
                        Dati parziali - torneo in corso
                    </div>
                </div>
            ` : ''}
        </div>

        <div class="separator"></div>

        <h3 style="background: #1e3a6e; color: #ffffff; padding: 6px 10px; font-size: 14px; font-weight: bold; border-radius: 6px 6px 0 0; margin: 0; text-transform: uppercase;">Informazioni generali</h3>
        <div class="info-grid" style=" padding: 8px; margin-top: 0; margin-bottom: 18px;">
            <div class="info-box avoid-break">
                <div class="info-label">Periodo</div>
                <div class="info-value" style="font-size: 11px;">${stats.periodo.inizio} — ${stats.periodo.fine}</div>
            </div>
            <div class="info-box avoid-break">
                <div class="info-label">Giornate</div>
                <div class="info-value">${stats.numeroGiornate}</div>
            </div>
            <div class="info-box avoid-break">
                <div class="info-label">Partite</div>
                <div class="info-value">${stats.totalePartite}</div>
            </div>
            <div class="info-box avoid-break">
                <div class="info-label">Games</div>
                <div class="info-value">${stats.totaleGamesDisputati}</div>
            </div>
            <div class="info-box avoid-break">
                <div class="info-label">Media G/P</div>
                <div class="info-value">${stats.mediaGamesPerPartita.toFixed(1)}</div>
            </div>
            <div class="info-box avoid-break">
                <div class="info-label">Giocatori</div>
                <div class="info-value">${stats.giocatoriPartecipanti}</div>
            </div>
        </div>

        <h3 style="background: #1e3a6e; color: #ffffff; padding: 6px 10px; font-size: 14px; font-weight: bold; border-radius: 6px 6px 0 0; margin: 0; text-transform: uppercase;">GIOCATORI - TOP 5</h3>
        <table class="avoid-break" style="margin-top: 0; ">
            <thead>
                <tr>
                    <th style="text-align: center; width: 10%;">Pos</th>
                    <th style="width: 40%;">Giocatore</th>
                    <th style="text-align: center; width: 16%;">ELO</th>
                    <th style="text-align: center; width: 17%;">Var. ELO</th>
                    <th style="text-align: center; width: 17%;">Games V/P</th>
                </tr>
            </thead>
            <tbody>
                ${top5Rows}
            </tbody>
        </table>

        
        <div class="stat-grid">
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Più Games Vinti</div>
                <div style="padding: 8px;">
                    
                ${gamesVintiEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Più Games Persi</div>
                <div style="padding: 8px;">
                    
                ${gamesPersiEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Coppia Più Frequente</div>
                <div style="padding: 8px;">
                    
                ${coppiaEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Serie Vittorie</div>
                <div style="padding: 8px;">
                    
                ${vittorieEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Upset</div>
                <div style="padding: 8px;">
                    
                ${upsetEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Maggior Guadagno ELO</div>
                <div style="padding: 8px;">
                    
                ${guadagnoEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Peggior Perdita ELO</div>
                <div style="padding: 8px;">
                    
                ${perditaEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Game Win Rate %</div>
                <div style="padding: 8px;">
                    
                ${gameWinRateEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Game Ratio</div>
                <div style="padding: 8px;">
                    
                ${gameRatioEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Partite Vinte</div>
                <div style="padding: 8px;">
                    
                ${partiteVinteEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">ELO per Partita</div>
                <div style="padding: 8px;">
                    
                ${eloPerPartitaEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">% Upset Riusciti</div>
                <div style="padding: 8px;">
                    
                ${upsetPercentageEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Miglior Coppia</div>
                <div style="padding: 8px;">
                    
                ${migliorCoppiaEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Serie Sconfitte</div>
                <div style="padding: 8px;">
                    
                ${serieSconfitteEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Resilienza</div>
                <div style="padding: 8px;">
                    
                ${resilienzaEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Form (Ultimi Match)</div>
                <div style="padding: 8px;">
                    
                ${formEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Clutch Performance</div>
                <div style="padding: 8px;">
                    
                ${clutchEntries}
                </div>
            </div>
            <div class="stat-card avoid-break" style="">
                <div class="stat-card-title" style="background: #1e3a6e; color: #fff; padding: 6px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin: 0;">Difesa Ferrea</div>
                <div style="padding: 8px;">
                    
                ${difesaEntries}
                </div>
            </div>
        </div>

        <h3>Premi Simbolici</h3>
        <div class="award-grid">
            ${mutedAwardCard('MVP', 'Più giornate vinte', mvpEntries, 'green')}
            ${mutedAwardCard('Cecchino', 'Miglior Game Win Rate', cecchinoEntries, 'blue')}
            ${mutedAwardCard('Giant Killer', 'Vittorie contro ELO superiori', giantKillerEntries, 'orange')}
            ${mutedAwardCard('Incassatore', 'Resilienza', incassatoreEntries, 'gray')}
        </div>

        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">Padel ELO Manager - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}</div>
            <div style="text-align: right; font-size: 8px;">${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')} ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}</div>
        </div>
    `;

    const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=1024, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>Statistiche - ${stats.tournament.name}</title>
            <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&display=swap" rel="stylesheet">
            <style>@page { size: A4; margin: 10mm; }</style>
        </head>
        <body>
            ${content}
        </body>
        </html>
    `;

    if (isIOS()) {
        printViaIframe(fullHtml);
        return;
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(fullHtml + `
            <script>
                setTimeout(() => {
                    window.print();
                    window.close();
                }, 250);
            </script>
        `);
        printWindow.document.close();
    }
};

/**
 * Stampa il tabellone vuoto per Beat the Box (senza risultati)
 */
export const printBeatTheBoxBlank = (
    tournamentDetails: Pick<Tournament, 'name' | 'club' | 'date' | 'type'>,
    boxes: { boxNumber: number; players: Player[]; matches: Omit<Match, 'id' | 'tournamentId'>[] }[],
    getPlayerById: (id: string) => Player | undefined
) => {
    const numBoxes = boxes.length;
    
    // Genera il contenuto delle finali basato sul numero di box
    const generateFinalsContent = () => {
        if (numBoxes === 2) {
            // 4 coppie (2 box)
            return `
                <div class="section-block" style="margin: 20px 0;">
                    <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 8px 0; padding: 4px 6px; background: #fff3e0; border-left: 4px solid #ff9800;">
                        🏆 FASE FINALE - 1°/2° POSTO
                    </h3>
                    <table style="margin-bottom: 16px; font-size: 11px;">
                        <tbody>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">1° Box 1</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">1° Box 2</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666;">2° Box 2</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <div style="margin: 8px 0; font-weight: bold;">vs</div>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666;">2° Box 1</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 8px 0; padding: 4px 6px; background: #e8f5e8; border-left: 4px solid #4caf50;">
                        🥉 FASE FINALE - 3°/4° POSTO
                    </h3>
                    <table style="margin-bottom: 16px; font-size: 11px;">
                        <tbody>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">3° Box 1</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">3° Box 2</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666;">4° Box 2</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <div style="margin: 8px 0; font-weight: bold;">vs</div>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666;">4° Box 1</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        } else if (numBoxes === 3) {
            // 6 coppie (3 box)
            return `
                <div class="section-block" style="margin: 20px 0;">
                    <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 8px 0; padding: 4px 6px; background: #fff3e0; border-left: 4px solid #ff9800;">
                        🏆 FASE FINALE - 1°/2° POSTO
                    </h3>
                    <table style="margin-bottom: 16px; font-size: 11px;">
                        <tbody>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">1° Box A + Miglior Secondo</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">1° Box B + 1° Box C</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <div style="margin: 8px 0; font-weight: bold;">vs</div>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 8px 0; padding: 4px 6px; background: #e8f5e8; border-left: 4px solid #4caf50;">
                        🥉 FASE FINALE - 3°/4° POSTO
                    </h3>
                    <table style="margin-bottom: 16px; font-size: 11px;">
                        <tbody>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Secondo 2° + Peggior Terzo</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Terzo 2° + Secondo Terzo</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <div style="margin: 8px 0; font-weight: bold;">vs</div>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 8px 0; padding: 4px 6px; background: #f3e5f5; border-left: 4px solid #9c27b0;">
                        🎯 PARTITA CONSOLAZIONE
                    </h3>
                    <table style="margin-bottom: 16px; font-size: 11px;">
                        <tbody>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Quarto Terzo + Ultimo Quarto</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Terzo Quarto + Secondo Quarto</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <div style="margin: 8px 0; font-weight: bold;">vs</div>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            // 8+ coppie (4+ box) - Semifinali + Finali
            const semifinalsHtml = Array.from({ length: Math.floor(numBoxes / 2) }, (_, i) => {
                const box1 = i * 2 + 1;
                const box2 = i * 2 + 2;
                return `
                    <div class="section-block">
                    <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 8px 0; padding: 4px 6px; background: #eff6ff; border-left: 4px solid #2196f3;">
                        🏆 SEMIFINALE ${i + 1}
                    </h3>
                    <table style="margin-bottom: 16px; font-size: 11px;">
                        <tbody>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">1° Box ${box1} + 2° Box ${box1}</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">1° Box ${box2} + 2° Box ${box2}</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <div style="margin: 8px 0; font-weight: bold;">vs</div>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                `;
            }).join('');
            
            return `
                <div style="margin: 20px 0;">
                    ${semifinalsHtml}
                    
                    <div class="section-block">
                    <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 8px 0; padding: 4px 6px; background: #fff3e0; border-left: 4px solid #ff9800;">
                        🏆 FINALE 1°/2° POSTO
                    </h3>
                    <table style="margin-bottom: 16px; font-size: 11px;">
                        <tbody>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Vincitore SF1</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Vincitore SF2</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                    
                    <div class="section-block">
                    <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 8px 0; padding: 4px 6px; background: #e8f5e8; border-left: 4px solid #4caf50;">
                        🥉 FINALINA 3°/4° POSTO
                    </h3>
                    <table style="margin-bottom: 16px; font-size: 11px;">
                        <tbody>
                            <tr style="height: 22px;">
                                <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Perdente SF1</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
                                </td>
                                <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <div style="font-size: 9px; color: #666; margin-bottom: 2px;">Perdente SF2</div>
                                    <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px; width: 85%; min-width: 120px;">&nbsp;</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                </div>
            `;
        }
    };
    const boxesContent = boxes.map((box) => {
        const matchesHtml = box.matches.map((match, matchIdx) => {
            const t1p1 = getPlayerById(match.team1[0]);
            const t1p2 = getPlayerById(match.team1[1]);
            const t2p1 = getPlayerById(match.team2[0]);
            const t2p2 = getPlayerById(match.team2[1]);
            
            if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return '';
            
            const team1Name = `${t1p1.name} ${t1p1.surname} & ${t1p2.name} ${t1p2.surname}`;
            const team2Name = `${t2p1.name} ${t2p1.surname} / ${t2p2.name} ${t2p2.surname}`;
            
            return `
                <tr style="height: 22px;">
                    <td style="width: 37%; text-align: right; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team1Name}</td>
                    <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                        <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span> - <span style="border: 1px solid #ccc; padding: 4px 10px; display: inline-block; font-size: 12px;">&nbsp;</span>
                    </td>
                    <td style="width: 37%; text-align: left; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team2Name}</td>
                </tr>
            `;
        }).join('');
        
        const playersHtml = box.players.map((player, idx) => `
            <div style="font-size: 10px; color: #555; margin: 2px 0;">
                ${idx + 1}. ${player.name} ${player.surname} <span style="color: #999;">(ELO: ${player.currentElo.toFixed(2)})</span>
            </div>
        `).join('');
        
        return `
            <div class="section-block box-card" style="margin-bottom: 20px;">
                <h3 style="font-size: 14px; font-weight: bold; margin: 12px 0 4px 0; padding: 4px 6px; background: #eff6ff; border-left: 4px solid #2196f3;">
                    📦 BOX ${box.boxNumber} - CAMPO ${box.boxNumber}
                </h3>
                <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin-bottom: 8px;">
                    ${playersHtml}
                </div>
                <table style="margin-bottom: 2px; font-size: 11px;">
                    <tbody>
                        ${matchesHtml}
                    </tbody>
                </table>
            </div>
        `;
    }).join('');
    
    const content = `
        <style>
            @page {
                size: A4;
                margin: 12mm 10mm;
            }
            body {
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
                font-size: 12px;
                line-height: 1.4;
                margin: 0;
                padding: 18px;
                background: white;
            }
            h1 {
                font-size: 22px;
                margin: 0 0 8px 0;
                color: #2196f3;
                font-weight: bold;
            }
            h2 {
                font-size: 14px;
                margin: 0 0 6px 0;
                color: #666;
                font-weight: normal;
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 6px 0;
                font-size: 11px;
            }
            td { 
                padding: 6px 7px; 
                border-bottom: 1px solid #e5e7eb; 
                vertical-align: middle;
                font-size: 11px;
                line-height: 1.3;
            }
            tr:nth-child(even) {
                background-color: #f0f5ff;
            }
            .footer {
                margin-top: 20px;
                padding-top: 14px;
                border-top: 1px solid #e5e7eb;
                font-size: 9px;
                color: #666;
            }
        </style>

        <div style="text-align: center; margin-bottom: 16px;">
            <h1>📦 ${tournamentDetails.name} - Scheda Punteggi</h1>
            <h2>${tournamentDetails.club} - Beat the Box</h2>
            <div style="color: #2196f3; font-size: 13px; font-weight: bold; margin: 4px 0 0 0;">
                ${new Date(tournamentDetails.date).toLocaleDateString('it-IT').replace(/\//g, '.')}
            </div>
        </div>

        <div style="border-bottom: 2px solid #2196f3; margin: 12px 0;"></div>

        ${boxesContent}

        ${generateFinalsContent()}

        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">
                Padel ELO Manager - Beat the Box - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}
            </div>
            <div style="text-align: right; font-size: 8px;">
                ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
            </div>
        </div>
    `;
    
    return openPrintWindow(`${tournamentDetails.name.replace(' - ', ', ')}, Beat the Box, ${new Date(tournamentDetails.date).toLocaleDateString('it-IT').replace(/\//g, '.')}`, content);
};

/**
 * Stampa il report completo per Beat the Box (con risultati)
 * UNIFORMITÀ: font-size 10px, height 20px per TUTTE le righe, margin 20px tra sezioni
 */
export const printBeatTheBoxComplete = (
    tournament: Tournament,
    boxes: { boxNumber: number; players: Player[]; matches: Match[] }[],
    boxStandings: { boxNumber: number; standings: any[] }[],
    semifinalMatches: Match[],
    finalMatches: Match[],
    individualStandings: { player: Player; eloChange: number; rank: number; gamesWon: number; gamesLost: number; winPercentage: number }[],
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
) => {
    const displayName = displayNameOverride || tournament.name;
    // 🔍 LOGGING DETTAGLIATO - Verifica dati in ingresso
    console.log('📄 === PRINT BEAT THE BOX DEBUG ===');
    console.log('📦 Boxes ricevuti:', boxes.length);
    boxes.forEach((box, idx) => {
        console.log(`📦 Box ${box.boxNumber}:`, {
            playersCount: box.players.length,
            playerIds: box.players.map(p => p.id),
            playerNames: box.players.map(p => `${p.name} ${p.surname}`),
            matchesCount: box.matches.length
        });
    });
    
    // Verifica duplicati nei box
    const allPlayerIdsInBoxes = boxes.flatMap(b => b.players.map(p => p.id));
    const uniquePlayerIdsInBoxes = [...new Set(allPlayerIdsInBoxes)];
    console.log('📊 Total player IDs in boxes:', allPlayerIdsInBoxes.length);
    console.log('📊 Unique player IDs in boxes:', uniquePlayerIdsInBoxes.length);
    if (allPlayerIdsInBoxes.length !== uniquePlayerIdsInBoxes.length) {
        console.warn('⚠️ DUPLICATI TROVATI nei box players!');
    }
    
    console.log('📊 Individual standings ricevuti:', individualStandings.length);
    console.log('📊 Individual standings IDs:', individualStandings.map(s => s.player.id));
    
    // 🛡️ DEDUPLICAZIONE SICURA - Pulisci i box da eventuali duplicati
    const cleanedBoxes = boxes.map(box => ({
        ...box,
        players: Array.from(new Map(box.players.map(p => [p.id, p])).values())
    }));
    
    console.log('✅ Boxes dopo deduplicazione:', cleanedBoxes.map(b => ({ 
        boxNum: b.boxNumber, 
        players: b.players.length 
    })));
    
    const generateMatchRow = (match: Match) => {
        const t1p1 = getPlayerById(match.team1[0]);
        const t1p2 = getPlayerById(match.team1[1]);
        const t2p1 = getPlayerById(match.team2[0]);
        const t2p2 = getPlayerById(match.team2[1]);
        
        if (!t1p1 || !t1p2 || !t2p1 || !t2p2) return '';
        
        const team1Name = `${t1p1.name} ${t1p1.surname} & ${t1p2.name} ${t1p2.surname}`;
        const team2Name = `${t2p1.name} ${t2p1.surname} / ${t2p2.name} ${t2p2.surname}`;
        const scoreHtml = formatScoreBoxes(match.sets, false);
        
        return `
            <tr style="height: 24px;">
                <td style="width: 37%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team1Name}</td>
                <td style="text-align: center; width: 26%; font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap;">
                    ${scoreHtml}
                </td>
                <td style="width: 37%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 5px 6px; height: 24px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team2Name}</td>
            </tr>
        `;
    };
    
    const boxesContent = cleanedBoxes.map((box, boxIdx) => {
        const matchesHtml = box.matches.map(match => generateMatchRow(match)).join('');
        
        const boxStanding = boxStandings.find(bs => bs.boxNumber === box.boxNumber);
        const standingsHtml = boxStanding ? boxStanding.standings.map((entry: any, idx: number) => `
            <tr style="height: 24px;">
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${idx + 1}°</td>
                <td style="width: 55%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.player.name} ${entry.player.surname}</td>
                <td style="text-align: center; width: 25%; font-size: 11px; padding: 5px 6px; height: 24px; white-space: nowrap;">${entry.points}</td>
                <td style="text-align: center; width: 20%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.gameDifference >= 0 ? '+' : ''}${entry.gameDifference}</td>
            </tr>
        `).join('') : '';
        
        return `
            <div class="section-block box-card" style="margin-bottom: 24px;">
                <h3 style="font-size: 12px; font-weight: bold; margin: 20px 0 6px 0; padding: 4px 6px; background: #eff6ff; border-left: 4px solid #2196f3;">
                    📦 BOX ${box.boxNumber} - CAMPO ${box.boxNumber}
                </h3>
                <table style="margin-bottom: 6px; font-size: 10px;">
                    <tbody>
                        ${matchesHtml}
                    </tbody>
                </table>
                <h4 style="font-size: 11px; font-weight: bold; margin: 12px 0 4px 0; background: #f0f9ff; padding: 3px 5px;">CLASSIFICA BOX ${box.boxNumber}</h4>
                <table style="margin-bottom: 6px; font-size: 10px;">
                    <thead>
                        <tr style="height: 20px;">
                            <th style="text-align: center; font-size: 11px; padding: 5px 6px; height: 24px;">Pos</th>
                            <th style="font-size: 11px; padding: 5px 6px; height: 24px;">Giocatore</th>
                            <th style="text-align: center; font-size: 11px; padding: 5px 6px; height: 24px;">Pt</th>
                            <th style="text-align: center; font-size: 11px; padding: 5px 6px; height: 24px;">Diff</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${standingsHtml}
                    </tbody>
                </table>
            </div>
        `;
    }).join('');
    
    let semifinalsContent = '';
    if (semifinalMatches.length > 0) {
        semifinalsContent = `
            <div class="section-block">
            <h3 style="font-size: 12px; font-weight: bold; margin: 24px 0 6px 0; padding: 4px 6px; background: #e8eaf6; border-left: 4px solid #5c6bc0;">SEMIFINALI</h3>
            <table style="margin-bottom: 6px;">
                <tbody>
                    ${semifinalMatches.map((match, idx) => `
                        <tr style="height: 20px;">
                            <td colspan="3" style="background: #f5f5f5; padding: 5px 6px; font-size: 11px; font-weight: bold; height: 24px;">Semifinale ${idx + 1}</td>
                        </tr>
                        ${generateMatchRow(match)}
                    `).join('')}
                </tbody>
            </table>
            </div>
        `;
    }
    
    const finalsContent = finalMatches.map((match, idx) => {
        let matchTitle = '';
        let bgColor = '#fff9c4';
        
        if (idx === 0) {
            matchTitle = 'FINALE 1° - 2° POSTO';
            bgColor = '#ffd54f';
        } else if (idx === 1) {
            matchTitle = 'FINALINA 3° - 4° POSTO';
            bgColor = '#ffe0b2';
        } else if (idx === 2) {
            matchTitle = 'PARTITA CONSOLAZIONE';
            bgColor = '#f5f5f5';
        }
        
        return {
            order: idx === 0 ? 3 : (idx === 1 ? 2 : 1),
            html: `
            <tr style="height: 20px;">
                <td colspan="3" style="background: ${bgColor}; padding: 5px 6px; font-size: 11px; font-weight: bold; text-align: center; height: 24px;">${matchTitle}</td>
            </tr>
            ${generateMatchRow(match)}
        `
        };
    }).sort((a, b) => a.order - b.order).map(x => x.html).join('');
    
    const finalsHtml = finalMatches.length > 0 ? `
        <div class="section-block">
        <h3 style="font-size: 12px; font-weight: bold; margin: 24px 0 6px 0; padding: 4px 6px; background: #fff9c4; border-left: 4px solid #fbc02d;">FINALI</h3>
        <table style="margin-bottom: 6px;">
            <tbody>
                ${finalsContent}
            </tbody>
        </table>
        </div>
    ` : '';
    
    // Calcola classifica di squadra finale basata sui risultati delle finali
    let teamStandingsHtml = '';
    if (finalMatches.length > 0 && tournament.status === 'completed') {
        const teamStandings: Array<{ position: number; team: string; medal: string; bgColor: string }> = [];
        
        // Finale 1°-2° (primo match)
        const finale1_2 = finalMatches[0];
        if (finale1_2 && finale1_2.winner) {
            const winner1_2Team = finale1_2.winner === 'team1' ? finale1_2.team1 : finale1_2.team2;
            const loser1_2Team = finale1_2.winner === 'team1' ? finale1_2.team2 : finale1_2.team1;
            
            const w1p1 = getPlayerById(winner1_2Team[0]);
            const w1p2 = getPlayerById(winner1_2Team[1]);
            const l1p1 = getPlayerById(loser1_2Team[0]);
            const l1p2 = getPlayerById(loser1_2Team[1]);
            
            if (w1p1 && w1p2) {
                teamStandings.push({
                    position: 1,
                    team: `${w1p1.name} ${w1p1.surname} / ${w1p2.name} ${w1p2.surname}`,
                    medal: '🥇',
                    bgColor: '#ffd700'
                });
            }
            if (l1p1 && l1p2) {
                teamStandings.push({
                    position: 2,
                    team: `${l1p1.name} ${l1p1.surname} / ${l1p2.name} ${l1p2.surname}`,
                    medal: '🥈',
                    bgColor: '#c0c0c0'
                });
            }
        }
        
        // Finalina 3°-4° (secondo match se presente)
        if (finalMatches.length > 1) {
            const finalina3_4 = finalMatches[1];
            if (finalina3_4 && finalina3_4.winner) {
                const winner3_4Team = finalina3_4.winner === 'team1' ? finalina3_4.team1 : finalina3_4.team2;
                const loser3_4Team = finalina3_4.winner === 'team1' ? finalina3_4.team2 : finalina3_4.team1;
                
                const w3p1 = getPlayerById(winner3_4Team[0]);
                const w3p2 = getPlayerById(winner3_4Team[1]);
                const l3p1 = getPlayerById(loser3_4Team[0]);
                const l3p2 = getPlayerById(loser3_4Team[1]);
                
                if (w3p1 && w3p2) {
                    teamStandings.push({
                        position: 3,
                        team: `${w3p1.name} ${w3p1.surname} / ${w3p2.name} ${w3p2.surname}`,
                        medal: '🥉',
                        bgColor: '#cd7f32'
                    });
                }
                if (l3p1 && l3p2) {
                    teamStandings.push({
                        position: 4,
                        team: `${l3p1.name} ${l3p1.surname} / ${l3p2.name} ${l3p2.surname}`,
                        medal: '',
                        bgColor: '#f5f5f5'
                    });
                }
            }
        }
        
        if (teamStandings.length > 0) {
            teamStandingsHtml = `
                <div class="section-block">
                <h3 style="font-size: 12px; font-weight: bold; margin: 24px 0 6px 0; padding: 4px 6px; background: #fff3e0; border-left: 4px solid #ff9800;">🏆 CLASSIFICA SQUADRE FINALE</h3>
                <table style="margin-bottom: 6px;">
                    <thead>
                        <tr style="height: 20px;">
                            <th style="text-align: center; font-size: 11px; padding: 5px 6px; width: 15%; height: 24px;">Posizione</th>
                            <th style="font-size: 11px; padding: 5px 6px; height: 24px;">Coppia</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teamStandings.map(entry => `
                            <tr style="background-color: ${entry.bgColor}; height: 20px;">
                                <td style="text-align: center; font-size: 11px; font-weight: bold; padding: 5px 6px; height: 24px;">
                                    ${entry.medal} ${entry.position}°
                                </td>
                                <td style="font-size: 11px; font-weight: bold; padding: 5px 6px; height: 24px;">
                                    ${entry.team}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
            `;
        }
    }
    
    // 🛡️ DEDUPLICAZIONE INDIVIDUAL STANDINGS - Rimuovi eventuali duplicati per ID
    const cleanedIndividualStandings = Array.from(
        new Map(individualStandings.map(entry => [entry.player.id, entry])).values()
    ).sort((a, b) => b.eloChange - a.eloChange)
     .map((e, idx) => ({ ...e, rank: idx + 1 })); // Ricalcola rank dopo dedup
    
    console.log('✅ Individual standings dopo deduplicazione:', cleanedIndividualStandings.length);
    
    // 🔍 CONTROLLO DI CONSISTENZA - Verifica numero giocatori
    const expectedPlayers = cleanedBoxes.reduce((sum, box) => sum + box.players.length, 0);
    const actualIndividualStandings = cleanedIndividualStandings.length;
    
    console.log('🔍 Controllo consistenza:');
    console.log(`   - Giocatori attesi (da boxes): ${expectedPlayers}`);
    console.log(`   - Giocatori in classifica individuale: ${actualIndividualStandings}`);
    
    if (expectedPlayers !== actualIndividualStandings) {
        console.error(`❌ INCONSISTENZA! Attesi ${expectedPlayers} giocatori, trovati ${actualIndividualStandings} in classifica`);
    } else {
        console.log('✅ Consistenza verificata: numeri corretti!');
    }
    
    const individualStandingsHtml = cleanedIndividualStandings.map(entry => {
        return `
            <tr style="height: 20px;">
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.rank}°</td>
                <td style="width: 50%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.player.name} ${entry.player.surname}</td>
                <td style="text-align: center; width: 25%; font-size: 11px; padding: 5px 6px; height: 24px; white-space: nowrap;">${entry.gamesWon}</td>
                <td style="text-align: center; width: 25%; font-size: 11px; padding: 5px 6px; height: 24px; white-space: nowrap;">${entry.gamesLost}</td>
                <td style="text-align: center; width: 10%; font-size: 11px; padding: 5px 6px; height: 24px;">${entry.winPercentage.toFixed(1)}%</td>
            </tr>
        `;
    }).join('');
    
    const content = `
        <style>
            @page { size: A4; margin: 12mm 10mm; }
            body { font-family: 'Manrope', sans-serif; font-size: 11px; margin: 0; padding: 0; }
            h1 { font-size: 22px; margin: 0 0 4px 0; color: #2196f3; font-weight: bold; }
            h2 { font-size: 14px; margin: 0 0 3px 0; color: #666; }
            h3 { font-size: 13px; font-weight: bold; margin: 24px 0 6px 0; padding: 4px 6px; }
            table { width: 100%; border-collapse: collapse; margin: 6px 0 12px 0; font-size: 11px; }
            th { background-color: #1e3a6e; color: white; padding: 5px 6px; font-weight: bold; font-size: 11px; height: 24px; }
            td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; font-size: 11px; height: 24px; }
            tr { height: 24px; }
            tr:nth-child(even) { background-color: #f0f5ff; }
            .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 8px; color: #666; }
        </style>

        <div style="text-align: center; margin-bottom: 12px;">
            <h1>📦 ${displayName}</h1>
            <h2>${tournament.club} - Beat the Box</h2>
            <div style="color: #2196f3; font-size: 11px; font-weight: bold; margin: 3px 0 0 0;">
                ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}
            </div>
        </div>

        <div style="border-bottom: 2px solid #2196f3; margin: 10px 0 20px 0;"></div>

        ${boxesContent}
        
        ${semifinalsContent}
        
        ${finalsHtml}
        
        ${teamStandingsHtml}
        
        <div class="section-block">
            <h3 style="font-size: 12px; font-weight: bold; margin: 24px 0 6px 0; padding: 4px 6px; background: #e8f5e9; border-left: 4px solid #4caf50;">📊 CLASSIFICA INDIVIDUALE</h3>
            <table style="margin-bottom: 6px;">
                <thead>
                    <tr style="height: 20px;">
                        <th style="text-align: center; font-size: 11px; padding: 5px 6px; height: 24px;">Pos</th>
                        <th style="font-size: 11px; padding: 5px 6px; height: 24px;">Giocatore</th>
                        <th style="text-align: center; font-size: 11px; padding: 5px 6px; height: 24px;">Games V</th>
                        <th style="text-align: center; font-size: 11px; padding: 5px 6px; height: 24px;">Games P</th>
                        <th style="text-align: center; font-size: 11px; padding: 5px 6px; height: 24px;">% Vitt.</th>
                    </tr>
                </thead>
                <tbody>
                    ${individualStandingsHtml}
                </tbody>
            </table>
        </div>

        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">
                Padel ELO Manager - Beat the Box - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}
            </div>
            <div style="text-align: right; font-size: 8px;">
                ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
            </div>
        </div>
    `;
    
    return openPrintWindow(`${displayName.replace(' - ', ', ')}, Riepilogo Beat the Box, ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}`, content);
};

/**
 * Stampa il tabellone vuoto per Torneo Libero (SOLO CAMPI VUOTI)
 * Come le finali di Beat the Box: nessun nome precompilato
 */
export const printTorneoLiberoBlank = (
    tournamentDetails: { name: string; club: string; date: string },
    numeroPartite: number
) => {
    // Genera urls partite vuote
    let partiteContent = '';
    
    for (let i = 1; i <= numeroPartite; i++) {
        partiteContent += `
            <div style="page-break-inside: avoid; margin: 20px 0; border: 1px solid #e0e0e0; padding: 12px; border-radius: 4px;">
                <h3 style="font-size: 14px; font-weight: bold; margin: 0 0 12px 0; padding: 4px 6px; background: #eff6ff; border-left: 4px solid #2196f3;">
                    Partita ${i}
                </h3>
                <table style="width: 100%; font-size: 11px;">
                    <tbody>
                        <tr style="height: 28px;">
                            <td style="width: 37%; text-align: right; padding: 4px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                <div style="font-size: 10px; color: #666; margin-bottom: 4px;">Squadra A</div>
                                <div style="display: flex; gap: 4px; justify-content: flex-end;">
                                    <span style="border: 1px solid #ccc; padding: 6px 12px; display: inline-block; min-width: 100px; background: #fafafa;">&nbsp;</span>
                                    <span style="border: 1px solid #ccc; padding: 6px 12px; display: inline-block; min-width: 100px; background: #fafafa;">&nbsp;</span>
                                </div>
                            </td>
                            <td style="text-align: center; width: 26%; padding: 4px 8px; white-space: nowrap;">
                                <span style="border: 1px solid #ccc; padding: 6px 12px; display: inline-block; min-width: 30px;">&nbsp;</span>
                                <span style="margin: 0 4px;">-</span>
                                <span style="border: 1px solid #ccc; padding: 6px 12px; display: inline-block; min-width: 30px;">&nbsp;</span>
                            </td>
                            <td style="width: 37%; text-align: left; padding: 4px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                <div style="font-size: 10px; color: #666; margin-bottom: 4px;">Squadra B</div>
                                <div style="display: flex; gap: 4px; justify-content: flex-start;">
                                    <span style="border: 1px solid #ccc; padding: 6px 12px; display: inline-block; min-width: 100px; background: #fafafa;">&nbsp;</span>
                                    <span style="border: 1px solid #ccc; padding: 6px 12px; display: inline-block; min-width: 100px; background: #fafafa;">&nbsp;</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }
    
    const content = `
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum'; 
                padding: 20px;
                font-size: 10px;
            }
            .footer {
                position: fixed;
                bottom: 10px;
                left: 20px;
                right: 20px;
                font-size: 8px;
                color: #666;
                border-top: 1px solid #ddd;
                padding-top: 8px;
            }
        </style>

        <div style="text-align: center; margin-bottom: 16px;">
            <h1 style="font-size: 22px; margin: 8px 0;">📋 ${tournamentDetails.name}</h1>
            <h2 style="font-size: 14px; color: #666; font-weight: normal;">${tournamentDetails.club} - Torneo Libero</h2>
            <div style="color: #2196f3; font-size: 12px; font-weight: bold; margin: 4px 0 0 0;">
                ${new Date(tournamentDetails.date).toLocaleDateString('it-IT').replace(/\//g, '.')}
            </div>
        </div>

        <div style="border-bottom: 2px solid #2196f3; margin: 12px 0;"></div>

        ${partiteContent}

        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">
                Padel ELO Manager - Torneo Libero - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}
            </div>
            <div style="text-align: right; font-size: 8px;">
                ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
            </div>
        </div>
    `;
    
    return openPrintWindow(`${tournamentDetails.name.replace(' - ', ', ')}, Torneo Libero, ${new Date(tournamentDetails.date).toLocaleDateString('it-IT').replace(/\//g, '.')}`, content);
};

/**
 * Stampa il report completo per Torneo Libero (con risultati)
 * Mostra coppie sorteggiate solo se modalità "fixed"
 */
export const printTorneoLiberoComplete = (
    tournament: Tournament,
    matches: Match[],
    pairs: [Player, Player][],
    mode: 'fixed' | 'rotating',
    getPlayerById: (id: string) => Player | undefined,
    displayNameOverride?: string
) => {
    const displayName = displayNameOverride || tournament.name;
    // Sezione coppie sorteggiate (solo per modalità fixed)
    let coppieSection = '';
    if (mode === 'fixed') {
        const teamsContent = pairs.map((pair, index) => `
            <div class="team-box">
                <div class="team-number">Coppia ${index + 1}</div>
                <div style="color: #000;">${pair[0].name} ${pair[0].surname}</div>
                <div style="color: #000; margin: 2px 0;">&</div>
                <div style="color: #000;">${pair[1].name} ${pair[1].surname}</div>
            </div>
        `).join('');
        
        coppieSection = `
            <div class="section-block">
            <h3 style="margin-top: 12px;">COPPIE SORTEGGIATE</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 4px; margin-bottom: 12px;">
                ${teamsContent}
            </div>
            </div>
        `;
    }
    
    // Sezione partite giocate - Tabella strutturata
    let partiteContent = '';
    matches.forEach((match, idx) => {
        const p1a = getPlayerById(match.team1[0]);
        const p1b = getPlayerById(match.team1[1]);
        const p2a = getPlayerById(match.team2[0]);
        const p2b = getPlayerById(match.team2[1]);
        
        if (!p1a || !p1b || !p2a || !p2b) return;
        
        const team1Name = mode === 'fixed' 
            ? `Coppia ${pairs.findIndex(p => p[0].id === p1a.id && p[1].id === p1b.id) + 1}`
            : `${p1a.name} ${p1a.surname} / ${p1b.name} ${p1b.surname}`;
        const team2Name = mode === 'fixed'
            ? `Coppia ${pairs.findIndex(p => p[0].id === p2a.id && p[1].id === p2b.id) + 1}`
            : `${p2a.name} ${p2a.surname} / ${p2b.name} ${p2b.surname}`;
        
        const scoreHtml = formatScoreBoxes(match.sets, false);
        
        partiteContent += `
            <tr style="height: 20px;">
                <td style="text-align: center; width: 10%; font-size: 10px; padding: 3px 4px; height: 20px; line-height: 1.2;">${idx + 1}</td>
                <td style="width: 32%; text-align: right; ${match.winner === 'team1' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team1Name}</td>
                <td style="text-align: center; width: 26%; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; white-space: nowrap;">
                    ${scoreHtml}
                </td>
                <td style="width: 32%; text-align: left; ${match.winner === 'team2' ? 'font-weight: bold;' : ''} font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${team2Name}</td>
            </tr>
        `;
    });
    
    // Calcola classifica condizionale (coppie vs individuale)
    let classificaContent: string = '';
    
    if (mode === 'fixed') {
        // CLASSIFICA COPPIE per coppie fisse
        
        // Mappa pair key → stats
        const pairStats = new Map<string, {
            pair: [Player, Player];
            wins: number;
            losses: number;
            gamesWon: number;
            gamesLost: number;
        }>();
        
        // Inizializza per ogni coppia
        pairs.forEach(pair => {
            const key = [pair[0].id, pair[1].id].sort().join('-');
            pairStats.set(key, {
                pair,
                wins: 0,
                losses: 0,
                gamesWon: 0,
                gamesLost: 0
            });
        });
        
        // Conta da matches
        matches.forEach(match => {
            if (!match.winner || match.winner === 'draw') return;
            
            const team1Key = [match.team1[0], match.team1[1]].sort().join('-');
            const team2Key = [match.team2[0], match.team2[1]].sort().join('-');
            
            const team1Games = (match.sets || []).reduce((sum, set) => sum + set.team1, 0);
            const team2Games = (match.sets || []).reduce((sum, set) => sum + set.team2, 0);
            
            const stats1 = pairStats.get(team1Key);
            const stats2 = pairStats.get(team2Key);
            
            if (stats1) {
                stats1.gamesWon += team1Games;
                stats1.gamesLost += team2Games;
                if (match.winner === 'team1') stats1.wins++;
                else stats1.losses++;
            }
            
            if (stats2) {
                stats2.gamesWon += team2Games;
                stats2.gamesLost += team1Games;
                if (match.winner === 'team2') stats2.wins++;
                else stats2.losses++;
            }
        });
        
        // Ordina
        const sortedPairs = Array.from(pairStats.values())
            .sort((a, b) => {
                if (b.wins !== a.wins) return b.wins - a.wins;
                const aPercent = (a.gamesWon + a.gamesLost) > 0 ? a.gamesWon / (a.gamesWon + a.gamesLost) : 0;
                const bPercent = (b.gamesWon + b.gamesLost) > 0 ? b.gamesWon / (b.gamesWon + b.gamesLost) : 0;
                return bPercent - aPercent;
            });
        
        // HTML classifica coppie
        classificaContent = `
            <div class="section-block">
            <h3 style="font-size: 13px; font-weight: bold; margin: 14px 0 3px 0;">Classifica Coppie</h3>
            <table style="margin-bottom: 2px;">
                    <thead>
                    <tr>
                        <th style="text-align: center;">Pos</th>
                        <th>Coppia</th>
                        <th style="text-align: center;">Vinte</th>
                        <th style="text-align: center;">Perse</th>
                        <th style="text-align: center;">Games</th>
                        <th style="text-align: center;">% Vitt.</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        sortedPairs.forEach((stats, idx) => {
            const [p1, p2] = stats.pair;
            const totalMatches = stats.wins + stats.losses;
            const winPercent = totalMatches > 0 ? ((stats.wins / totalMatches) * 100).toFixed(1) : '0.0';
            const gameDiff = stats.gamesWon - stats.gamesLost;
            const diffColor = gameDiff > 0 ? '#2e7d32' : gameDiff < 0 ? '#d32f2f' : '#666';
            
            classificaContent += `
                <tr style="height: 20px;">
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${idx + 1}</td>
                    <td style="font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${p1.name} ${p1.surname} / ${p2.name} ${p2.surname}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; color: #111827; font-weight: bold;">${stats.wins}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; color: #d32f2f;">${stats.losses}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; color: ${diffColor};">${stats.gamesWon}-${stats.gamesLost} (${gameDiff > 0 ? '+' : ''}${gameDiff})</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; font-weight: bold;">${winPercent}%</td>
                </tr>
            `;
        });
        
        classificaContent += `
                    </tbody>
                </table>
            </div>
        `;
        
    } else {
        // CLASSIFICA INDIVIDUALE per coppie a girare
        
        const playerStats = new Map<string, { player: Player; wins: number; losses: number; gamesWon: number; gamesLost: number }>();
        
        // Estrai tutti i giocatori unici
        const allPlayerIds = new Set<string>();
        matches.forEach(m => {
            m.team1.forEach(id => allPlayerIds.add(id));
            m.team2.forEach(id => allPlayerIds.add(id));
        });
        
        // Inizializza statistiche
        allPlayerIds.forEach(id => {
            const player = getPlayerById(id);
            if (player) {
                playerStats.set(id, { player, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0 });
            }
        });
        
        // Calcola statistiche da ogni match
        matches.forEach(match => {
            if (!match.winner || match.winner === 'draw') return;
            
            const team1Games = (match.sets || []).reduce((sum, set) => sum + set.team1, 0);
            const team2Games = (match.sets || []).reduce((sum, set) => sum + set.team2, 0);
            
            match.team1.forEach(pid => {
                const stats = playerStats.get(pid);
                if (stats) {
                    stats.gamesWon += team1Games;
                    stats.gamesLost += team2Games;
                    if (match.winner === 'team1') stats.wins++;
                    else stats.losses++;
                }
            });
            
            match.team2.forEach(pid => {
                const stats = playerStats.get(pid);
                if (stats) {
                    stats.gamesWon += team2Games;
                    stats.gamesLost += team1Games;
                    if (match.winner === 'team2') stats.wins++;
                    else stats.losses++;
                }
            });
        });
        
        // Ordina per vittorie, poi per % vittorie giochi
        const sortedPlayers = Array.from(playerStats.values())
            .sort((a, b) => {
                if (b.wins !== a.wins) return b.wins - a.wins;
                const aPercent = (a.gamesWon + a.gamesLost) > 0 ? a.gamesWon / (a.gamesWon + a.gamesLost) : 0;
                const bPercent = (b.gamesWon + b.gamesLost) > 0 ? b.gamesWon / (b.gamesWon + b.gamesLost) : 0;
                return bPercent - aPercent;
            });
        
        // HTML classifica individuale
        classificaContent = `
            <div class="section-block">
            <h3 style="font-size: 13px; font-weight: bold; margin: 14px 0 3px 0;">Classifica Singola Giocatori</h3>
            <table style="margin-bottom: 2px;">
                    <thead>
                    <tr>
                        <th style="text-align: center;">Pos</th>
                        <th>Giocatore</th>
                        <th style="text-align: center;">Vinte</th>
                        <th style="text-align: center;">Perse</th>
                        <th style="text-align: center;">Games</th>
                        <th style="text-align: center;">% Vitt.</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        sortedPlayers.forEach((stats, idx) => {
            const totalMatches = stats.wins + stats.losses;
            const winPercent = totalMatches > 0 ? ((stats.wins / totalMatches) * 100).toFixed(1) : '0.0';
            const gameDiff = stats.gamesWon - stats.gamesLost;
            const diffColor = gameDiff > 0 ? '#2e7d32' : gameDiff < 0 ? '#d32f2f' : '#666';
            
            classificaContent += `
                <tr style="height: 20px;">
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${idx + 1}</td>
                    <td style="font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2;">${stats.player.name} ${stats.player.surname}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; color: #111827; font-weight: bold;">${stats.wins}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; color: #d32f2f;">${stats.losses}</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; color: ${diffColor};">${stats.gamesWon}-${stats.gamesLost} (${gameDiff > 0 ? '+' : ''}${gameDiff})</td>
                    <td style="text-align: center; font-size: 11px; padding: 3px 4px; height: 20px; line-height: 1.2; font-weight: bold;">${winPercent}%</td>
                </tr>
            `;
        });
        
        classificaContent += `
                    </tbody>
                </table>
            </div>
        `;
    }
    
    const content = `
        <style>
            @page {
                size: A4;
                margin: 12mm 10mm;
            }
            body {
                font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
                font-size: 11px;
                line-height: 1.3;
                margin: 0;
                padding: 0;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            h1 {
                font-size: 22px;
                margin: 0 0 3px 0;
                color: #111827;
                font-weight: bold;
            }
            h2 {
                font-size: 14px;
                margin: 0 0 2px 0;
                color: #666;
                font-weight: normal;
            }
            h3 {
                font-size: 13px;
                margin: 10px 0 3px 0;
                color: #000;
                font-weight: bold;
            }
            .separator {
                border-bottom: 1px solid #1e3a6e;
                margin: 5px 0;
            }
            .date-info {
                color: #111827;
                font-size: 13px;
                font-weight: bold;
                margin: 2px 0 0 0;
            }
            .team-box {
                text-align: center;
                font-weight: bold;
                padding: 2px 3px;
                background-color: #f0f5ff;
                border: 1px solid #c7d9f0;
                border-radius: 3px;
                font-size: 11px;
                line-height: 1.1;
                height: 60px;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
            .team-number {
                color: #111827;
                font-weight: bold;
                margin-bottom: 1px;
                font-size: 11px;
            }
            .score-box {
                background-color: #1e3a6e;
                color: white;
                padding: 5px 10px;
                border-radius: 3px;
                border: none;
                font-weight: bold;
                font-size: 12px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 24px;
            }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 3px 0 6px 0;
                font-size: 11px;
            }
            th { 
                background-color: #1e3a6e;
                color: white; 
                padding: 5px 6px; 
                text-align: left; 
                font-weight: bold;
                font-size: 11px;
                height: 24px;
            }
            td { 
                padding: 5px 6px; 
                border-bottom: 1px solid #e5e7eb; 
                vertical-align: middle;
                font-size: 11px;
                line-height: 1.3;
                height: 24px;
            }
            tr:nth-child(even) {
                background-color: #f0f5ff;
            }
            /* Force UNIFORM row height 24px for ALL tables and ALL sections */
            table tbody tr {
                height: 24px !important;
            }
            table tbody td {
                height: 24px !important;
                padding: 5px 6px !important;
                font-size: 11px !important;
                line-height: 1.3 !important;
            }
            table thead tr {
                height: 24px !important;
            }
            table thead th {
                height: 24px !important;
                padding: 5px 6px !important;
                font-size: 11px !important;
            }
            .footer {
                margin-top: 10px;
                padding-top: 5px;
                border-top: 1px solid #e5e7eb;
                font-size: 8px;
                color: #666;
            }
        </style>

        <div style="text-align: center; margin-bottom: 3px;">
            <h1>${displayName}</h1>
            <h2>${tournament.club} - Torneo Libero</h2>
            <div class="date-info">Giornata del ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}</div>
        </div>

        <div class="separator"></div>

        ${coppieSection}

        <div class="section-block">
            <h3 style="margin-top: 12px;">Partite e Risultati</h3>
            <table>
                <thead>
                    <tr>
                        <th style="text-align: center;">Partita</th>
                        <th>Squadra A</th>
                        <th style="text-align: center;">Risultato</th>
                        <th>Squadra B</th>
                    </tr>
                </thead>
                <tbody>
                ${partiteContent}
                </tbody>
            </table>
        </div>

        ${classificaContent}

        <div class="footer">
            <div style="text-align: left; margin-bottom: 4px;">
                Padel ELO Manager - Torneo Libero - Versione ${APP_VERSION} @ Mattia Ianniello, ${APP_MONTH}
            </div>
            <div style="text-align: right; font-size: 8px;">
                ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')}, ${new Date().toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'})}
            </div>
        </div>
    `;
    
    return openPrintWindow(`${displayName.replace(' - ', ', ')}, Torneo Libero, ${new Date(tournament.date).toLocaleDateString('it-IT').replace(/\//g, '.')}`, content);
};

// Stampa profili giocatori - 1 giocatore per pagina A4
export const printPlayerProfiles = (
    playerIds: string[],
    allPlayers: Player[],
    allMatches: Match[],
    allEloHistory: EloHistoryEntry[],
    allTournaments: Tournament[]
): boolean => {
    const getPlayer = (id: string) => allPlayers.find(p => p.id === id);

    // Helper: generate SVG line chart
    const generateEloSvg = (chartPoints: { elo: number; label: string }[], width: number, height: number): string => {
        if (chartPoints.length < 2) return '';
        const pad = { top: 15, right: 15, bottom: 25, left: 40 };
        const w = width - pad.left - pad.right;
        const h = height - pad.top - pad.bottom;
        const elos = chartPoints.map(p => p.elo);
        const minElo = Math.floor(Math.min(...elos) - 10);
        const maxElo = Math.ceil(Math.max(...elos) + 10);
        const range = maxElo - minElo || 1;

        const xScale = (i: number) => pad.left + (i / (chartPoints.length - 1)) * w;
        const yScale = (v: number) => pad.top + h - ((v - minElo) / range) * h;

        // Smooth curve (Catmull-Rom → cubic bezier)
        const pts = chartPoints.map((p, i) => ({ x: xScale(i), y: yScale(p.elo) }));
        let pathD = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
        if (pts.length === 2) {
            pathD += ` L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
        } else {
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(0, i - 1)];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[Math.min(pts.length - 1, i + 2)];
                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;
                pathD += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
            }
        }
        const dots = chartPoints.map((p, i) =>
            `<circle cx="${xScale(i).toFixed(1)}" cy="${yScale(p.elo).toFixed(1)}" r="3" fill="#1e3a6e" />`
        ).join('');

        // Grid lines (5 horizontal)
        const gridLines: string[] = [];
        const gridLabels: string[] = [];
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
            const val = minElo + (range * i / steps);
            const y = yScale(val);
            gridLines.push(`<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.5" />`);
            gridLabels.push(`<text x="${pad.left - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="7" fill="#666">${Number(val).toFixed(2)}</text>`);
        }

        // X-axis labels (show max ~10 evenly spaced)
        const xLabels: string[] = [];
        const maxLabels = Math.min(chartPoints.length, 10);
        const step = Math.max(1, Math.floor((chartPoints.length - 1) / (maxLabels - 1)));
        for (let i = 0; i < chartPoints.length; i += step) {
            xLabels.push(`<text x="${xScale(i).toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="6" fill="#666">${chartPoints[i].label}</text>`);
        }
        if ((chartPoints.length - 1) % step !== 0) {
            const last = chartPoints.length - 1;
            xLabels.push(`<text x="${xScale(last).toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="6" fill="#666">${chartPoints[last].label}</text>`);
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:white;border:1px solid #e2e8f0;border-radius:4px;">
            ${gridLines.join('')}
            ${gridLabels.join('')}
            <path d="${pathD}" fill="none" stroke="#1e3a6e" stroke-width="2" />
            ${dots}
            ${xLabels.join('')}
        </svg>`;
    };

    // Compute stats for each player
    const playerPages = playerIds.map(playerId => {
        const player = getPlayer(playerId);
        if (!player) return null;

        const playerMatches = allMatches
            .filter(m => m.team1.includes(playerId) || m.team2.includes(playerId))
            // Conta TUTTE le partite salvate — nessun filtro sul winner
            .filter(m => {
                if (!m.tournamentId) return true;
                const t = allTournaments.find(t2 => t2.id === m.tournamentId);
                return t?.status === 'completed';
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const total = playerMatches.length;
        const wins = playerMatches.filter(m => {
            const isTeam1 = m.team1.includes(playerId);
            return (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
        }).length;
        const losses = playerMatches.filter(m => {
            const isTeam1 = m.team1.includes(playerId);
            return (isTeam1 && m.winner === 'team2') || (!isTeam1 && m.winner === 'team1');
        }).length;

        let gamesWon = 0, gamesLost = 0;
        playerMatches.forEach(m => {
            const isTeam1 = m.team1.includes(playerId);
            m.sets.forEach(s => {
                gamesWon += isTeam1 ? s.team1 : s.team2;
                gamesLost += isTeam1 ? s.team2 : s.team1;
            });
        });

        // Best streak
        let bestStreak = 0, currentStreak = 0;
        playerMatches.forEach(m => {
            const isTeam1 = m.team1.includes(playerId);
            const won = (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
            if (won) { currentStreak++; bestStreak = Math.max(bestStreak, currentStreak); }
            else { currentStreak = 0; }
        });

        // Form last 5
        const last5 = playerMatches.slice(-5);
        const form = last5.map(m => {
            const isTeam1 = m.team1.includes(playerId);
            return (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
        });

        const gameWinRate = (gamesWon + gamesLost) > 0 ? (gamesWon / (gamesWon + gamesLost) * 100) : 0;

        // ELO history + per-tournament data using central service
        const timeline = buildPlayerEloTimeline(playerId, allEloHistory, allMatches, allTournaments);
        const chronologicalTimeline = [...timeline].reverse();

        const lastDelta = timeline.length > 0 ? timeline[0].delta : 0;
        
        let currentElo = player.initialElo || 1500;
        let peakElo = currentElo;
        const chartPoints: { elo: number; label: string }[] = [{ elo: currentElo, label: 'Start' }];

        chronologicalTimeline.forEach(event => {
            currentElo += event.delta;
            peakElo = Math.max(peakElo, currentElo);
            chartPoints.push({
                elo: currentElo,
                label: new Date(event.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
            });
        });

        // Per-tournament breakdown
        const completedTournaments = allTournaments
            .filter(t => t.status === 'completed')
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const tournamentBreakdown = completedTournaments.map(t => {
            const tMatches = playerMatches.filter(m => m.tournamentId === t.id);
            if (tMatches.length === 0) return null;
            const tWins = tMatches.filter(m => {
                const isTeam1 = m.team1.includes(playerId);
                return (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
            }).length;
            const tLosses = tMatches.filter(m => {
                const isTeam1 = m.team1.includes(playerId);
                return (isTeam1 && m.winner === 'team2') || (!isTeam1 && m.winner === 'team1');
            }).length;
            const pct = tMatches.length > 0 ? ((tWins / tMatches.length) * 100).toFixed(0) : '0';
            // Lo storico può riferirsi al torneo oppure alle singole partite,
            // a seconda del percorso con cui l'ELO è stato calcolato.
            const linkedDelta = sumPlayerEventEloDelta(
                playerId,
                t.id,
                allEloHistory,
                tMatches.map(match => match.id)
            );
            const tournamentDay = new Date(t.date).toISOString().split('T')[0];
            const acceptedParentNames = new Set([t.parentTournamentName, t.giornataName, t.name].filter(Boolean));
            const contextualDelta = chronologicalTimeline
                .filter(event => new Date(event.date).toISOString().split('T')[0] === tournamentDay)
                .filter(event => (event.parentTournamentName && acceptedParentNames.has(event.parentTournamentName))
                    || event.dayLabel === t.type
                    || (!!t.giornataName && event.dayLabel === t.giornataName))
                .reduce((sum, event) => sum + event.delta, 0);
            const delta = linkedDelta !== 0 ? linkedDelta : contextualDelta;
            const tDraws = tMatches.length - tWins - tLosses;
            return {
                date: new Date(t.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }),
                type: getTournamentTypeDisplayName(t.type),
                matches: tMatches.length,
                wins: tWins,
                draws: tDraws,
                losses: tLosses,
                pct,
                delta,
            };
        }).filter(Boolean);

        // Partners
        const partnerMap = new Map<string, { total: number; wins: number }>();
        playerMatches.forEach(m => {
            const isTeam1 = m.team1.includes(playerId);
            const team = isTeam1 ? m.team1 : m.team2;
            const partnerId = team.find(id => id !== playerId);
            if (!partnerId) return;
            if (!partnerMap.has(partnerId)) partnerMap.set(partnerId, { total: 0, wins: 0 });
            const s = partnerMap.get(partnerId)!;
            s.total++;
            const won = (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
            if (won) s.wins++;
        });
        const topPartners = [...partnerMap.entries()]
            .map(([id, s]) => ({ player: getPlayer(id), ...s }))
            .filter(e => e.player)
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        // Opponents
        const opponentMap = new Map<string, { total: number; wins: number }>();
        playerMatches.forEach(m => {
            const isTeam1 = m.team1.includes(playerId);
            const oppTeam = isTeam1 ? m.team2 : m.team1;
            const won = (isTeam1 && m.winner === 'team1') || (!isTeam1 && m.winner === 'team2');
            oppTeam.forEach(oppId => {
                if (!opponentMap.has(oppId)) opponentMap.set(oppId, { total: 0, wins: 0 });
                const s = opponentMap.get(oppId)!;
                s.total++;
                if (won) s.wins++;
            });
        });
        const topOpponents = [...opponentMap.entries()]
            .map(([id, s]) => ({ player: getPlayer(id), ...s }))
            .filter(e => e.player)
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        // Ranking position
        const sortedByElo = [...allPlayers].sort((a, b) => b.currentElo - a.currentElo);
        const rank = sortedByElo.findIndex(p => p.id === playerId) + 1;
        const tournamentsPlayed = new Set(playerMatches.filter(m => m.tournamentId).map(m => m.tournamentId!)).size;

        return {
            player, total, wins, losses, gamesWon, gamesLost, bestStreak,
            form, gameWinRate, tournamentsPlayed, lastDelta, peakElo,
            topPartners, topOpponents, tournamentBreakdown, chartPoints, rank
        };
    }).filter(Boolean);

    if (playerPages.length === 0) return false;

    const formDots = (form: boolean[]) =>
        form.map(w =>
            `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${w ? '#22c55e' : '#ef4444'};margin-right:3px;"></span>`
        ).join('');

    const pagesHtml = playerPages.map((data: any) => {
        const p = data.player;
        const deltaColor = data.lastDelta >= 0 ? '#059669' : '#dc2626';
        const deltaSign = data.lastDelta >= 0 ? '+' : '';
        const winRate = data.total > 0 ? ((data.wins / data.total) * 100).toFixed(0) : '0';

        const partnersRows = data.topPartners.map((tp: any) =>
            `<tr>
                <td>${tp.player.name} ${tp.player.surname}</td>
                <td style="text-align:center;">${tp.total}</td>
                <td style="text-align:center;">${tp.total > 0 ? ((tp.wins / tp.total) * 100).toFixed(0) : 0}%</td>
            </tr>`
        ).join('');

        const opponentsRows = data.topOpponents.map((to: any) =>
            `<tr>
                <td>${to.player.name} ${to.player.surname}</td>
                <td style="text-align:center;">${to.total}</td>
                <td style="text-align:center;">${to.total > 0 ? ((to.wins / to.total) * 100).toFixed(0) : 0}%</td>
            </tr>`
        ).join('');

        const tournamentRows = data.tournamentBreakdown.map((t: any) => {
            const deltaColor2 = t.delta >= 0 ? '#059669' : '#dc2626';
            const deltaSign2 = t.delta >= 0 ? '+' : '';
            return `<tr>
                <td style="font-family:'Manrope',sans-serif;font-variant-numeric:tabular-nums;font-size:8px;">${t.date}</td>
                <td>${t.type}</td>
                <td style="text-align:center;">${t.matches}</td>
                <td style="text-align:center;"><span style="color:#16a34a;">${t.wins}V</span>${t.draws > 0 ? ` / <span style="color:#f59e0b;">${t.draws}P</span>` : ''} / <span style="color:#dc2626;">${t.losses}S</span></td>
                <td style="text-align:center;">${t.pct}%</td>
                <td style="text-align:center;font-weight:bold;color:${deltaColor2};">${deltaSign2}${t.delta.toFixed(1)}</td>
            </tr>`;
        }).join('');

        const eloSvg = generateEloSvg(data.chartPoints, 540, 140);

        return `
            <div class="player-page">
                <!-- Header -->
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div>
                        <div style="font-size:22px;font-weight:bold;color:#1e3a5f;">${p.name} ${p.surname}</div>
                        <div style="font-size:10px;color:#666;">Posizione: ${p.position} &middot; Ranking: #${data.rank} &middot; Giornate giocate: ${data.tournamentsPlayed}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:28px;font-weight:bold;color:#1e3a6e;">${p.currentElo.toFixed(2)}</div>
                        <div style="font-size:11px;font-weight:bold;color:${deltaColor};">${deltaSign}${data.lastDelta.toFixed(1)} ultimo evento</div>
                    </div>
                </div>
                <div style="border-bottom:2px solid #1e3a6e;margin-bottom:10px;"></div>

                <!-- Stats Grid -->
                <div class="stats-grid">
                    <div class="stat-box">
                        <div class="stat-value">${data.total}</div>
                        <div class="stat-label">Partite</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value" style="color:#16a34a;">${data.wins} <span style="font-size:10px;font-weight:normal;">(${winRate}%)</span></div>
                        <div class="stat-label">Vinte</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value" style="color:#dc2626;">${data.losses}</div>
                        <div class="stat-label">Perse</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${data.gamesWon} <span style="font-size:10px;color:#999;">/ ${data.gamesLost}</span></div>
                        <div class="stat-label">Games V/P</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${data.gameWinRate.toFixed(1)}%</div>
                        <div class="stat-label">Game Win Rate</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value" style="color:#ea580c;">${data.bestStreak}</div>
                        <div class="stat-label">Best Streak</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value" style="color:#1e3a6e;">${data.peakElo.toFixed(2)}</div>
                        <div class="stat-label">ELO Massimo</div>
                    </div>
                    <div class="stat-box">
                        <div>${formDots(data.form)}</div>
                        <div class="stat-label" style="margin-top:2px;">Form (ultime 5)</div>
                    </div>
                </div>

                <!-- ELO Chart -->
                ${eloSvg ? `
                <div style="margin-top:8px;">
                    <div class="section-title">Andamento ELO</div>
                    <div style="text-align:center;margin-top:4px;">
                        ${eloSvg}
                    </div>
                </div>` : ''}

                <!-- Two columns: Partners & Opponents -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;">
                    <div>
                        <div class="section-title">Compagni Frequenti</div>
                        <table class="mini-table">
                            <thead><tr><th>Giocatore</th><th style="text-align:center;">Partite</th><th style="text-align:center;">Win%</th></tr></thead>
                            <tbody>${partnersRows || '<tr><td colspan="3" style="text-align:center;color:#999;">Nessun dato</td></tr>'}</tbody>
                        </table>
                    </div>
                    <div>
                        <div class="section-title">Avversari Frequenti</div>
                        <table class="mini-table">
                            <thead><tr><th>Giocatore</th><th style="text-align:center;">Partite</th><th style="text-align:center;">Win%</th></tr></thead>
                            <tbody>${opponentsRows || '<tr><td colspan="3" style="text-align:center;color:#999;">Nessun dato</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>

                <!-- Tournament Breakdown -->
                <div style="margin-top:8px;">
                    <div class="section-title">Storico Giornate</div>
                    <table class="mini-table">
                        <thead><tr><th>Data</th><th>Tipo</th><th style="text-align:center;">Partite</th><th style="text-align:center;">W/L</th><th style="text-align:center;">%</th><th style="text-align:center;">Var. ELO</th></tr></thead>
                        <tbody>${tournamentRows || '<tr><td colspan="6" style="text-align:center;color:#999;">Nessuna giornata</td></tr>'}</tbody>
                    </table>
                </div>

                <!-- Footer -->
                <div class="page-footer">
                    Padel ELO Manager v${APP_VERSION} &middot; ${new Date().toLocaleDateString('it-IT').replace(/\//g, '.')} &middot; Profilo ${p.name} ${p.surname}
                </div>
            </div>
        `;
    }).join('');

    const pageStyles = `
        @page {
            size: A4;
            margin: 12mm 10mm;
        }
        body {
            font-family: 'Manrope', sans-serif;
                font-feature-settings: 'cv11', 'tnum', 'lnum';
            font-size: 10px;
            color: #111;
            margin: 0;
            padding: 0;
        }
        .player-page {
            page-break-after: always;
            padding: 0;
        }
        .player-page:last-child {
            page-break-after: auto;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
            margin: 8px 0;
        }
        .stat-box {
            background: #f0f5ff;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 6px;
            text-align: center;
        }
        .stat-value {
            font-size: 16px;
            font-weight: bold;
            color: #1e293b;
        }
        .stat-label {
            font-size: 8px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .section-title {
            font-size: 11px;
            font-weight: bold;
            color: #1e3a5f;
            background: #f0f9ff;
            padding: 3px 6px;
            border-radius: 3px;
            margin-bottom: 4px;
            border-left: 3px solid #1e3a6e;
        }
        .mini-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
        }
        .mini-table th {
            background: #f1f5f9;
            color: #475569;
            padding: 3px 5px;
            text-align: left;
            font-size: 8px;
            font-weight: bold;
            border-bottom: 1px solid #cbd5e1;
        }
        .mini-table td {
            padding: 3px 5px;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: middle;
        }
        .page-footer {
            margin-top: 8px;
            padding-top: 4px;
            border-top: 1px solid #e2e8f0;
            font-size: 8px;
            color: #94a3b8;
            text-align: center;
        }
    `;

    return openPrintWindow('Profili Giocatori - Padel ELO Manager', pagesHtml, pageStyles);
};
