require('dotenv').config();
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:3001/api';
const JWT_SECRET = process.env.JWT_SECRET || 'padel-elo-manager-dev-secret-change-in-production';
const testWorkspaceId = '3d23914d-4b49-4f46-a1bc-ad532fe16845';
const token = jwt.sign({ sub: testWorkspaceId, wname: 'Test Workspace', admin: true }, JWT_SECRET, { expiresIn: '1h' });

async function runApiTests() {
  console.log('🚀 INIZIO TEST COMPLETO: 2 Tornei per ciascuna delle 6 tipologie (12 Tornei Totali) con Salvataggio Intermedio...\n');

  try {
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 1. Prendi dati dal backend (Giocatori reali del workspace)
    let dataRes = await fetch(`${API_BASE}/data`, { headers: authHeaders });
    if (!dataRes.ok) {
      throw new Error(`Impossibile recuperare i dati dalle API (Status: ${dataRes.status})`);
    }
    let data = await dataRes.json();
    let players = data.players || [];

    if (players.length < 8) {
      throw new Error(`Giocatori insufficienti nel workspace (${players.length}). Occorrono almeno 8 giocatori.`);
    }

    console.log(`✅ Autenticazione JWT ed API OK: Trovati ${players.length} giocatori attivi nel workspace.`);

    const formats = [
      { type: 'americano', name: 'Americano' },
      { type: 'eliminazione-diretta', name: 'Eliminazione Diretta TPRA' },
      { type: 'torneo-libero', name: 'Torneo Libero' },
      { type: 'gironi-fase-finale', name: 'Gironi + Fase Finale' },
      { type: 'round-robin-finali', name: 'Round Robin + Finali' },
      { type: 'beat-the-box', name: 'Beat The Box' }
    ];

    let totalPassed = 0;
    let totalTests = 0;

    for (const fmt of formats) {
      console.log(`\n==================================================`);
      console.log(`🏆 TESTING FORMATO: ${fmt.name} (${fmt.type})`);
      console.log(`==================================================`);

      for (let i = 1; i <= 2; i++) {
        totalTests++;
        const tournamentName = `TEST ${fmt.name.toUpperCase()} ${i} (${Date.now()})`;
        const dateIso = new Date().toISOString();

        console.log(`\n🔹 [Test #${totalTests}] Creazione e Salvataggio Iniziale: ${fmt.name} (${i}/2)`);

        const teamA = [players[0].id, players[1].id];
        const teamB = [players[2].id, players[3].id];
        const teamC = [players[4].id, players[5].id];
        const teamD = [players[6].id, players[7].id];

        // STEP 1: Creazione e Salvataggio Iniziale (bulk-matches con match programmati senza vincitori)
        const bulkRes = await fetch(`${API_BASE}/tournaments/bulk-matches`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            tournament: {
              name: tournamentName,
              type: fmt.type,
              date: dateIso,
              club: 'Circolo Padel Test',
              status: 'scheduled',
              numGironi: 2
            },
            matches: [
              {
                date: dateIso,
                team1: teamA,
                team2: teamB,
                sets: [{ team1: 0, team2: 0 }],
                winner: null,
                roundNumber: 1
              },
              {
                date: dateIso,
                team1: teamC,
                team2: teamD,
                sets: [{ team1: 0, team2: 0 }],
                winner: null,
                roundNumber: 1
              }
            ]
          })
        });

        if (!bulkRes.ok) {
          throw new Error(`Fallito salvataggio iniziale torneo ${tournamentName} (Status: ${bulkRes.status})`);
        }
        const bulkData = await bulkRes.json();
        const tournamentId = bulkData.tournamentId;
        console.log(`   └─ Step 1 completato: Torneo creato con ID ${tournamentId}.`);

        // STEP 2: Recupera i match salvati tramite /api/data
        const checkDataRes = await fetch(`${API_BASE}/data`, { headers: authHeaders });
        const checkData = await checkDataRes.json();
        const createdMatches = checkData.matches.filter(m => (m.tournament_id || m.tournamentId) === tournamentId);

        if (!createdMatches || createdMatches.length < 2) {
          throw new Error(`I match del torneo ${tournamentId} non sono stati salvati correttamente nel DB.`);
        }

        const match1Id = createdMatches[0].id;
        const match2Id = createdMatches[1].id;

        // STEP 3: SALVATAGGIO INTERMEDIO (Inserimento Punteggio Match 1: 6-4 via PUT /api/matches)
        const interimRes = await fetch(`${API_BASE}/matches`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({
            matchUpdates: [{
              matchId: match1Id,
              sets: [{ team1: 6, team2: 4 }],
              winner: 'team1'
            }]
          })
        });
        if (!interimRes.ok) {
          throw new Error(`Errore durante il salvataggio intermedio per Match 1 (${match1Id}).`);
        }
        console.log(`   └─ Step 2 completato: Salvataggio intermedio verificato (Match 1: 6-4).`);

        // STEP 4: SALVATAGGIO FINALE (Punteggio Match 2: 3-6) + VERIFICA CHIUSURA
        const finalMatchRes = await fetch(`${API_BASE}/matches`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({
            matchUpdates: [{
              matchId: match2Id,
              sets: [{ team1: 3, team2: 6 }],
              winner: 'team2'
            }]
          })
        });
        if (!finalMatchRes.ok) {
          throw new Error(`Errore durante il salvataggio finale per Match 2 (${match2Id}).`);
        }

        // STEP 5: VERIFICA FINALE SUL DATABASE
        const verifyDataRes = await fetch(`${API_BASE}/data`, { headers: authHeaders });
        const verifyData = await verifyDataRes.json();
        const verifyTourn = verifyData.tournaments.find(t => t.id === tournamentId);
        const verifyMatches = verifyData.matches.filter(m => (m.tournament_id || m.tournamentId) === tournamentId);

        const allFinished = verifyMatches.length >= 2 && verifyMatches.every(m => m.winner !== null && m.winner !== undefined);

        if (verifyTourn && allFinished) {
          console.log(`   └─ Step 3 completato: Torneo ${fmt.name} (${i}/2) SALVATO E VERIFICATO CON SUCCESSO!`);
          totalPassed++;
        } else {
          throw new Error(`Verifica finale fallita per il torneo ${tournamentName}.`);
        }
      }
    }

    console.log(`\n==================================================`);
    console.log(`🎉 TEST COMPLETO SUPERATO CON SUCCESSO SENZA NESSUN ERRORE!`);
    console.log(`🏆 RISULTATO: ${totalPassed}/${totalTests} TORNEI CREATI, AGGIORNATI CON SALVATAGGIO INTERMEDIO E PERSISTITI SUL DB NEON!`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error('❌ ERRORE DURANTE IL TEST API:', err.message);
  }
}

runApiTests();
