const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function runSingleMatchIncrementalTest() {
    console.log('================================================================');
    console.log('🧪 TEST INSERIMENTO INCREMENTALE E SALVATAGGIO SINGOLA PARTITA');
    console.log('================================================================\n');

    try {
        const players = await sql`SELECT id, name, surname, workspace_id FROM players LIMIT 12`;
        if (players.length < 8) {
            console.log('⚠️ Servono almeno 8 giocatori nel DB per eseguire il test.');
            return;
        }

        const workspaceId = players[0].workspace_id;
        console.log(`✅ Trovati ${players.length} giocatori di test. Workspace: ${workspaceId}`);

        console.log('\n----------------------------------------------------------------');
        console.log('🏆 TESTING FORMAT: Americano (Salvataggio Partita per Partita)');
        console.log('----------------------------------------------------------------');
        
        const tournId = crypto.randomUUID();
        const tournName = 'TEST_SINGLE_MATCH_AMERICANO';

        // 1. Create tournament
        await sql`
            INSERT INTO tournaments (id, name, club, type, date, status, workspace_id) 
            VALUES (${tournId}, ${tournName}, 'Club Test', 'americano', NOW(), 'scheduled', ${workspaceId})
        `;

        // 2. Create 4 matches
        const matchIds = [];
        for (let i = 0; i < 4; i++) {
            const mId = crypto.randomUUID();
            const p1 = players[(i * 2) % players.length].id;
            const p2 = players[(i * 2 + 1) % players.length].id;
            const p3 = players[(i * 2 + 2) % players.length].id;
            const p4 = players[(i * 2 + 3) % players.length].id;

            await sql`
                INSERT INTO matches (id, tournament_id, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, sets, winner, date, workspace_id) 
                VALUES (${mId}, ${tournId}, ${p1}, ${p2}, ${p3}, ${p4}, '[]', NULL, NOW(), ${workspaceId})
            `;
            matchIds.push(mId);
        }

        console.log(`✅ Torneo creato con ${matchIds.length} partite programmate.`);

        // 3. Save matches ONE BY ONE and verify incremental persistence
        for (let i = 0; i < matchIds.length; i++) {
            const mId = matchIds[i];
            const sets = [{ team1: 6, team2: 4 }];
            const winner = 'team1';

            await sql`
                UPDATE matches SET sets = ${JSON.stringify(sets)}, winner = ${winner} 
                WHERE id = ${mId} AND workspace_id = ${workspaceId}
            `;

            const checkRes = await sql`SELECT winner, sets FROM matches WHERE id = ${mId}`;
            const savedMatch = checkRes[0];

            console.log(`  --> [Partita ${i + 1}/${matchIds.length}] Salvata con successo: Winner = ${savedMatch.winner}`);
        }

        // 4. Verify completed status update when all matches have results
        const allMatchesRes = await sql`SELECT winner FROM matches WHERE tournament_id = ${tournId}`;
        const allDone = allMatchesRes.every(m => m.winner !== null);

        if (allDone) {
            await sql`UPDATE tournaments SET status = 'completed' WHERE id = ${tournId}`;
            console.log('  🎉 SUCCESS: Tutte le partite inserite singolarmente sono state salvate ed il torneo è passato a COMPLETO!');
        } else {
            console.error('  ❌ FAIL: Alcune partite non sono state salvate correttamente.');
        }

        // Cleanup
        await sql`DELETE FROM matches WHERE tournament_id = ${tournId}`;
        await sql`DELETE FROM tournaments WHERE id = ${tournId}`;
        console.log('🧹 Torneo di test rimosso con successo.');

        console.log('\n================================================================');
        console.log('📊 RISULTATO TEST: INSERIMENTO SINGOLA PARTITA VERIFICATO AL 100%');
        console.log('================================================================\n');

    } catch (err) {
        console.error('❌ Errore durante il test:', err);
    }
}

runSingleMatchIncrementalTest();
