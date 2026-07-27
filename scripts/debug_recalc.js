import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

const K_FACTOR = 16;
// No rounding! Keep precision
function calculateEloChange(ratingA, ratingB, scoreA, tournamentType, phase) {
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));
    const deltaA = K_FACTOR * (scoreA - expectedA);
    const deltaB = K_FACTOR * ((1 - scoreA) - expectedB);
    return { delta1: deltaA, delta2: deltaB };
}

async function run() {
  const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  
  console.log("Deleting old history...");
  await sql`DELETE FROM elo_history`;
  await sql`UPDATE players SET current_elo = 1500`;

  console.log("Fetching matches...");
  const matches = await sql`
      SELECT m.*, t.type as tournament_type, t.date as tournament_date, t.name as tournament_name, t.giornata_name
      FROM matches m
      JOIN tournaments t ON m.tournament_id = t.id
      WHERE m.winner IS NOT NULL
      ORDER BY t.date ASC, m.created_at ASC
  `;
  
  const playersData = await sql`SELECT id, name, surname, workspace_id, 1500::float8 as current_elo FROM players`;
  const playersState = {};
  for (const p of playersData) {
      playersState[p.id] = p;
  }
  
  let currentTournamentId = null;
  let currentTournamentDate = null;
  let currentTournamentName = null;
  const tournamentEloChanges = new Map();

  const flushHistory = async () => {
      if (!currentTournamentId) return;
      console.log(`Flushing ${tournamentEloChanges.size} players for tournament ${currentTournamentId}`);
      for (const [playerId, data] of tournamentEloChanges) {
          if(Math.abs(data.totalDelta) < 0.001) continue; // Skip practically zero changes
          await sql`
              INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id, source_label)
              VALUES (${currentTournamentId}, ${playerId}, ${data.oldElo}, ${data.newElo}, ${data.totalDelta}, ${currentTournamentDate}, 'tournament', ${data.workspace_id}, ${currentTournamentName})
          `;
      }
      tournamentEloChanges.clear();
  };
  
  console.log(`Found ${matches.length} matches.`);
  for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (m.tournament_id !== currentTournamentId) {
          await flushHistory();
          currentTournamentId = m.tournament_id;
          currentTournamentDate = m.tournament_date;
          currentTournamentName = m.giornata_name || m.tournament_name;
      }

      const p1 = playersState[m.team1_p1_id];
      const p2 = playersState[m.team1_p2_id];
      const p3 = playersState[m.team2_p1_id];
      const p4 = playersState[m.team2_p2_id];

      if (!p1 || !p2 || !p3 || !p4) {
          console.log(`Missing players for match ${m.id}`);
          continue;
      }

      const t1Elo = (p1.current_elo + p2.current_elo) / 2;
      const t2Elo = (p3.current_elo + p4.current_elo) / 2;
      const score1 = m.winner === 'team1' ? 1 : (m.winner === 'team2' ? 0 : 0.5);

      const { delta1, delta2 } = calculateEloChange(t1Elo, t2Elo, score1, m.tournament_type, m.phase);

      const updatePlayer = (p, delta) => {
          if (!tournamentEloChanges.has(p.id)) {
              tournamentEloChanges.set(p.id, { oldElo: p.current_elo, totalDelta: 0, newElo: p.current_elo, workspace_id: m.workspace_id });
          }
          const track = tournamentEloChanges.get(p.id);
          p.current_elo += delta;
          track.totalDelta += delta;
          track.newElo = p.current_elo;
      };

      updatePlayer(p1, delta1);
      updatePlayer(p2, delta1);
      updatePlayer(p3, delta2);
      updatePlayer(p4, delta2);
  }
  await flushHistory();
  
  for (const pId in playersState) {
      const p = playersState[pId];
      if (Math.abs(p.current_elo - 1500) > 0.001) {
          await sql`UPDATE players SET current_elo = ${p.current_elo} WHERE id = ${p.id}`;
      }
  }
  console.log("Success!");
}

run().catch(console.error);
