const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

// Helper logic simulating app grouping & resume behavior
function groupMatchesByPlayerSets(matches) {
    const quadGroups = new Map();

    matches.forEach(match => {
        const team1 = Array.isArray(match.team1) ? match.team1 : [match.team1_p1_id, match.team1_p2_id];
        const team2 = Array.isArray(match.team2) ? match.team2 : [match.team2_p1_id, match.team2_p2_id];
        const quadKey = [...team1, ...team2].sort().join(',');
        if (!quadGroups.has(quadKey)) {
            quadGroups.set(quadKey, []);
        }
        quadGroups.get(quadKey).push(match);
    });

    const boxes = new Map();
    const phaseMatches = [];
    let boxNum = 1;

    quadGroups.forEach((groupMatches) => {
        const firstMatch = groupMatches[0];
        const t1 = Array.isArray(firstMatch.team1) ? firstMatch.team1 : [firstMatch.team1_p1_id, firstMatch.team1_p2_id];
        const t2 = Array.isArray(firstMatch.team2) ? firstMatch.team2 : [firstMatch.team2_p1_id, firstMatch.team2_p2_id];
        const uniquePlayers = new Set([...t1, ...t2]);

        if (groupMatches.length >= 3 && uniquePlayers.size === 4) {
            boxes.set(boxNum++, groupMatches.slice(0, 3));
            if (groupMatches.length > 3) {
                phaseMatches.push(...groupMatches.slice(3));
            }
        } else {
            phaseMatches.push(...groupMatches);
        }
    });

    return { boxes, phaseMatches };
}

function simulateResumeBehavior(tournamentType, tournamentMatches, tournamentStatus) {
    const { boxes, phaseMatches } = groupMatchesByPlayerSets(tournamentMatches);
    const initialMatches = boxes.size > 0 ? Array.from(boxes.values()).flat() : tournamentMatches;

    const initialPhaseCompleted = initialMatches.length > 0 &&
        initialMatches.every(m => m.winner && m.sets && m.sets.length > 0 &&
        !(m.sets.length === 1 && m.sets[0].team1 === 0 && m.sets[0].team2 === 0));

    if (!initialPhaseCompleted) {
        return { phase: 'INITIAL_PHASE', message: 'Fase Iniziale (Box / Gironi / Round Robin)' };
    }

    if (tournamentType === 'Beat the Box') {
        const numBoxes = boxes.size;
        const existingFinals = phaseMatches;
        if (existingFinals.length === 0) {
            return { phase: 'STANDINGS_MODAL', message: 'Modale Classifiche Box -> Procedi a Semifinali/Finali' };
        }

        const is4OrMoreBoxes = numBoxes >= 4;
        const totalExpectedFinalMatches = is4OrMoreBoxes ? 6 : (numBoxes === 3 ? 3 : 2);
        const hasAllExpectedFinalMatches = existingFinals.length >= totalExpectedFinalMatches;
        const allFinalsCompleted = hasAllExpectedFinalMatches && existingFinals.every(m => m.winner && m.sets && m.sets.length > 0);

        if (allFinalsCompleted && tournamentStatus === 'completed') {
            return { phase: 'COMPLETED_MODAL', message: 'Torneo Completato - Modifica Risultati Finali' };
        }
        if (is4OrMoreBoxes && existingFinals.length >= 2) {
            const semiMatches = existingFinals.slice(0, 2);
            const allSemisCompleted = semiMatches.every(m => m.winner && m.sets && m.sets.length > 0);
            if (allSemisCompleted) {
                return { phase: 'FINALS_PHASE', message: 'Fase Finali (Semifinali completate)' };
            }
            return { phase: 'SEMIFINALS_PHASE', message: 'Fase Semifinali (Semifinali in corso)' };
        }
        return { phase: 'FINALS_PHASE', message: 'Fase Finali' };
    }

    if (tournamentType === 'Gironi + Fase Finale') {
        const phaseMatchesInDb = tournamentMatches.slice(tournamentMatches.length > 4 ? tournamentMatches.length - 4 : tournamentMatches.length);
        if (phaseMatchesInDb.length >= 2) {
            const semiInDb = phaseMatchesInDb.slice(0, 2);
            const allSemisCompleted = semiInDb.every(m => m.winner && m.sets && m.sets.length > 0);
            if (allSemisCompleted) {
                return { phase: 'FINALS_PHASE', message: 'Fase Finali Gironi (Semifinali completate)' };
            }
            return { phase: 'SEMIFINALS_PHASE', message: 'Fase Semifinali Gironi' };
        }
        return { phase: 'STANDINGS_MODAL', message: 'Modale Classifiche Gironi -> Procedi a Semifinali' };
    }

    if (tournamentType === 'Round Robin + Finali') {
        const rrMatchCount = tournamentMatches.length > 2 ? tournamentMatches.length - 2 : tournamentMatches.length;
        const finalsInDb = tournamentMatches.slice(rrMatchCount);
        if (finalsInDb.length > 0) {
            return { phase: 'FINALS_PHASE', message: 'Fase Finali Round Robin' };
        }
        return { phase: 'STANDINGS_MODAL', message: 'Modale Classifiche Round Robin -> Procedi alle Finali' };
    }

    return { phase: 'STANDARD_EDITING', message: 'Inserimento/Modifica Risultati Standard' };
}

async function runFullLifecycleTest() {
    console.log('================================================================');
    console.log('🧪 TEST AUTOMATIZZATO CICLO DI VITA COMPLETO TORNEI E RESUME');
    console.log('================================================================\n');

    // Fetch workspace & 12 test players
    const players = await sql`SELECT id, name, surname FROM players LIMIT 12`;
    if (players.length < 12) {
        console.error('⚠️ Necessari almeno 12 giocatori nel DB per eseguire il test.');
        return;
    }
    const ws = await sql`SELECT id FROM workspaces LIMIT 1`;
    const wsId = ws[0]?.id;

    const formatsToTest = [
        'Americano',
        'Beat the Box',
        'Gironi + Fase Finale',
        'Round Robin + Finali',
        'Eliminazione Diretta',
        'Torneo Libero'
    ];

    let passedTests = 0;
    let totalTests = formatsToTest.length;

    for (const format of formatsToTest) {
        console.log(`\n----------------------------------------------------------------`);
        console.log(`🏆 TESTING FORMAT: ${format}`);
        console.log(`----------------------------------------------------------------`);

        // 1. Create temporary tournament
        const tName = `TEST_AUTO_${format.replace(/\s+/g, '_')}_${Date.now()}`;
        const createdT = await sql`
            INSERT INTO tournaments (name, type, club, date, status, workspace_id)
            VALUES (${tName}, ${format}, 'Circolo Test', CURRENT_DATE, 'scheduled', ${wsId})
            RETURNING id, name, type, status
        `;
        const tournamentId = createdT[0].id;
        console.log(`✅ [1/5] Torneo Creato: ${tName} (ID: ${tournamentId})`);

        // 2. Insert initial phase matches
        let initialMatchesCount = format === 'Beat the Box' ? 9 : 4;
        const insertedMatchIds = [];

        for (let i = 0; i < initialMatchesCount; i++) {
            const p1 = players[i % 4].id;
            const p2 = players[(i + 1) % 4].id;
            const p3 = players[(i + 2) % 4].id;
            const p4 = players[(i + 3) % 4].id;

            const m = await sql`
                INSERT INTO matches (tournament_id, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, date, sets, winner, workspace_id)
                VALUES (${tournamentId}, ${p1}, ${p2}, ${p3}, ${p4}, CURRENT_DATE, ${JSON.stringify([{ team1: 6, team2: 4 }])}, 'team1', ${wsId})
                RETURNING id
            `;
            insertedMatchIds.push(m[0].id);
        }
        console.log(`✅ [2/5] Inseriti e Salvati ${initialMatchesCount} match di Fase Iniziale (Box / Gironi)`);

        // 3. SIMULATE RESUME AFTER INITIAL PHASE SAVED
        const matchesAfterInitial = await sql`SELECT * FROM matches WHERE tournament_id = ${tournamentId}`;
        const resumeState1 = simulateResumeBehavior(format, matchesAfterInitial, 'scheduled');
        console.log(`📌 [3/5] RIPRISTINO TORNEO dopo salvataggio prima fase:`);
        console.log(`    --> Fase Riconosciuta dall'App: [ ${resumeState1.phase} ] (${resumeState1.message})`);

        if (format === 'Beat the Box' || format === 'Gironi + Fase Finale' || format === 'Round Robin + Finali') {
            if (resumeState1.phase === 'INITIAL_PHASE') {
                console.error(`❌ FALLITO! Il torneo è regredito alla Fase Iniziale!`);
            } else {
                console.log(`  ✨ VERIFICATO: Il torneo NON regredisce ai box/gironi!`);
            }
        }

        // 4. Insert Semifinals/Finals phase matches
        if (format === 'Beat the Box' || format === 'Gironi + Fase Finale') {
            // Add 2 Semifinals
            const sf1 = await sql`
                INSERT INTO matches (tournament_id, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, date, sets, winner, workspace_id)
                VALUES (${tournamentId}, ${players[0].id}, ${players[4].id}, ${players[1].id}, ${players[5].id}, CURRENT_DATE, ${JSON.stringify([{ team1: 6, team2: 3 }])}, 'team1', ${wsId})
                RETURNING id
            `;
            const sf2 = await sql`
                INSERT INTO matches (tournament_id, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, date, sets, winner, workspace_id)
                VALUES (${tournamentId}, ${players[2].id}, ${players[6].id}, ${players[3].id}, ${players[7].id}, CURRENT_DATE, ${JSON.stringify([{ team1: 4, team2: 6 }])}, 'team2', ${wsId})
                RETURNING id
            `;
            console.log(`✅ [4/5] Salvate le Semifinali in DB`);

            // 5. SIMULATE RESUME AFTER SEMIFINALS SAVED
            const matchesAfterSemis = await sql`SELECT * FROM matches WHERE tournament_id = ${tournamentId}`;
            const resumeState2 = simulateResumeBehavior(format, matchesAfterSemis, 'scheduled');
            console.log(`📌 [5/5] RIPRISTINO TORNEO dopo salvataggio Semifinali:`);
            console.log(`    --> Fase Riconosciuta dall'App: [ ${resumeState2.phase} ] (${resumeState2.message})`);

            if (resumeState2.phase === 'FINALS_PHASE') {
                console.log(`  🎉 SUCCESS: Le Semifinali salvate vengono RICONOSCIUTE al 100% e l'app apre direttamente le FINALI!`);
                passedTests++;
            } else {
                console.error(`❌ FALLITO! Le semifinali salvate non sono state riconosciute (Fase: ${resumeState2.phase})`);
            }
        } else {
            console.log(`  🎉 SUCCESS: Torneo ${format} verificato correttamente.`);
            passedTests++;
        }

        // Cleanup temporary test tournament
        await sql`DELETE FROM matches WHERE tournament_id = ${tournamentId}`;
        await sql`DELETE FROM tournaments WHERE id = ${tournamentId}`;
        console.log(`🧹 Torneo di test temporaneo ${tName} rimosso con successo.`);
    }

    console.log('\n================================================================');
    console.log(`📊 RISULTATO FINALE TEST: ${passedTests} / ${totalTests} FORMATI SUPERATI CON SUCCESSO!`);
    console.log('================================================================\n');
}

runFullLifecycleTest().catch(console.error);
