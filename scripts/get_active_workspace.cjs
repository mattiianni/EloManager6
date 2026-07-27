require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function findWs() {
  const rows = await sql`SELECT workspace_id, COUNT(*) FROM players GROUP BY workspace_id ORDER BY count DESC LIMIT 1`;
  console.log('ACTIVE_WORKSPACE_ID:', rows[0]?.workspace_id);
}

findWs();
