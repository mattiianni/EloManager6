import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import logger from './utils/logger.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import stringSimilarity from 'string-similarity';

// Auth configuration
const JWT_SECRET = process.env.JWT_SECRET || 'padel-elo-manager-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-secret-change-in-production';
const MAX_FAILED_ATTEMPTS = parseInt(process.env.MAX_FAILED_ATTEMPTS || '10');
const LOCKOUT_DURATION_MINUTES = parseInt(process.env.LOCKOUT_DURATION_MINUTES || '30');

const INITIAL_ELO = 1500;

// Catch unhandled errors to prevent silent crashes
process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION - server crashing', err);
    console.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger.error('UNHANDLED REJECTION', reason);
    console.error('UNHANDLED REJECTION:', reason);
});

/**
 * Calculates the change in ELO rating for both teams using a global standard K-factor of 16.
 */
function calculateEloChange(elo1, elo2, score1, tournamentType, phase) {
    const expectedScore1 = 1 / (1 + Math.pow(10, (elo2 - elo1) / 400));
    const expectedScore2 = 1 - expectedScore1;
    const score2 = 1 - score1;
    
    // Global standard K-factor for all tournaments and phases
    const kFactor1 = 16;
    const kFactor2 = 16;
    
    const delta1 = kFactor1 * (score1 - expectedScore1);
    const delta2 = kFactor2 * (score2 - expectedScore2);
    
    return { delta1, delta2 };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
// Avoid stale UI/prints: never cache API responses
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

// General rate limiting
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10);
const RATE_LIMIT_MAX = parseInt(
    process.env.RATE_LIMIT_MAX || (process.env.NODE_ENV === 'development' ? '2000' : '200'),
    10
);
const generalLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Troppe richieste, riprova tra qualche minuto' }
});
app.use('/api/', generalLimiter);

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Troppi tentativi di accesso. Riprova tra 15 minuti.' }
});

// JWT verification middleware
function authenticateToken(req, res, next) {
    // Skip auth for public routes
    const publicPaths = ['/health', '/api/auth/login'];
    if (publicPaths.includes(req.path)) return next();
    // Skip auth for static files
    if (!req.path.startsWith('/api/')) return next();

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Token di accesso richiesto' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.workspaceId = decoded.sub;
        req.workspaceName = decoded.wname;
        req.isAdmin = decoded.admin === true;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token non valido o scaduto' });
    }
}
app.use(authenticateToken);

// Health check endpoint for platform probes
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Database connection - ALWAYS USE NEON (dev and prod)
let DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (DATABASE_URL) {
    DATABASE_URL = DATABASE_URL.trim().replace(/^["']|["']$/g, '');
}

if (!DATABASE_URL) {
    logger.error('DATABASE_URL environment variable is not set');
    process.exit(1);
}

const sql = neon(DATABASE_URL);
const dbUrl = new URL(DATABASE_URL);
logger.info('Database connected', { 
    host: dbUrl.host, 
    database: dbUrl.pathname.replace('/', ''),
    ssl: 'enabled'
});

// Helper function to create tables if they don't exist
async function ensureTablesExist() {
    // Ensure pgcrypto is available for gen_random_uuid()
    try {
        await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    } catch (error) {
        logger.warn('Failed to create pgcrypto extension (may already exist or not permitted)', { message: error.message });
    }
    await sql`
        CREATE TABLE IF NOT EXISTS players (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            surname VARCHAR(255) NOT NULL,
            position VARCHAR(50) NOT NULL,
            initial_elo REAL NOT NULL DEFAULT 1500,
            current_elo REAL NOT NULL DEFAULT 1500
        );
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS tournaments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            type VARCHAR(100) NOT NULL,
            date TIMESTAMPTZ NOT NULL,
            club VARCHAR(255) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        );
    `;
    
    // Add status column if it doesn't exist (for existing databases)
    try {
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed'`;
        // Update existing tournaments to 'completed' status
        await sql`UPDATE tournaments SET status = 'completed' WHERE status IS NULL`;
    } catch (error) {
        logger.debug('Status column update attempt', { message: error.message });
    }
    
    // Add Americano-specific columns if they don't exist
    try {
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS americano_fields INTEGER`;
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS americano_scoring_type VARCHAR(20)`;
    } catch (error) {
        logger.debug('Americano columns update attempt', { message: error.message });
    }
    
    // Add final_standings column for Beat the Box (and other tournaments)
    try {
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS final_standings JSONB`;
    } catch (error) {
        logger.debug('Final standings column update attempt', { message: error.message });
    }
    
    // Add giornata_name column if it doesn't exist
    try {
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS giornata_name VARCHAR(255)`;
    } catch (error) {
        logger.debug('Giornata name column update attempt', { message: error.message });
    }

    // Add num_gironi column for Gironi + Fase Finale tournaments
    try {
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS num_gironi INTEGER`;
    } catch (error) {
        logger.debug('Num gironi column update attempt', { message: error.message });
    }

    // Add playoff_type column for Beat the Box
    try {
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS playoff_type VARCHAR(50)`;
    } catch (error) {
        logger.debug('Playoff type column update attempt', { message: error.message });
    }

    // Root tournament id for team tournaments (allows child "giornate" to inherit configuration state)
    try {
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS team_tournament_root_id UUID`;
        // Backfill existing team tournament roots
        await sql`
            UPDATE tournaments t
            SET team_tournament_root_id = t.id
            WHERE t.type = ${'Torneo a Squadre'}
            AND t.team_tournament_root_id IS NULL
            AND EXISTS (SELECT 1 FROM team_tournament_configs c WHERE c.tournament_id = t.id)
        `;
    } catch (error) {
        logger.debug('team_tournament_root_id column migration attempt', { message: error.message });
    }
    await sql`
        CREATE TABLE IF NOT EXISTS matches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            date TIMESTAMPTZ NOT NULL,
            team1_p1_id UUID REFERENCES players(id) ON DELETE CASCADE,
            team1_p2_id UUID REFERENCES players(id) ON DELETE CASCADE,
            team2_p1_id UUID REFERENCES players(id) ON DELETE CASCADE,
            team2_p2_id UUID REFERENCES players(id) ON DELETE CASCADE,
            sets JSONB NOT NULL,
            winner VARCHAR(10),
            tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE
        );
    `;
    
    // Fix winner column constraint (allow NULL for scheduled matches)
    try {
        await sql`ALTER TABLE matches ALTER COLUMN winner DROP NOT NULL`;
    } catch (error) {
        logger.debug('Winner column constraint update attempt', { message: error.message });
    }

    // Add created_at column for reliable match ordering (preserves insertion order)
    try {
        await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
        await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS round_number INTEGER`;
        // Backfill existing rows: set created_at = date for old matches
        await sql`UPDATE matches SET created_at = date WHERE created_at IS NULL`;
    } catch (error) {
        logger.debug('created_at column migration attempt', { message: error.message });
    }
    await sql`
        CREATE TABLE IF NOT EXISTS elo_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            event_id UUID NOT NULL,
            player_id UUID REFERENCES players(id) ON DELETE CASCADE,
            elo_before REAL NOT NULL,
            elo_after REAL NOT NULL,
            delta REAL NOT NULL,
            date TIMESTAMPTZ NOT NULL,
            type VARCHAR(50) NOT NULL
        );
    `;

    // Auth tables
    await sql`
        CREATE TABLE IF NOT EXISTS workspaces (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            owner_name VARCHAR(255),
            owner_email VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            is_active BOOLEAN DEFAULT true,
            settings JSONB DEFAULT '{}'::jsonb
        );
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS access_codes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code_hash VARCHAR(255) NOT NULL UNIQUE,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            label VARCHAR(255),
            is_admin BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ,
            last_used_at TIMESTAMPTZ,
            failed_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMPTZ
        );
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
            action VARCHAR(100) NOT NULL,
            ip_address VARCHAR(45),
            user_agent TEXT,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS team_tournament_configs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tournament_id UUID NOT NULL UNIQUE REFERENCES tournaments(id) ON DELETE CASCADE,
            initial_team_count INTEGER NOT NULL,
            default_players_per_team INTEGER NOT NULL,
            format VARCHAR(50) NOT NULL DEFAULT 'ROUND ROBIN',
            matches_per_day INTEGER NOT NULL DEFAULT 3,
            round_robin_final_phase VARCHAR(50),
            scoring_type VARCHAR(50) NOT NULL DEFAULT 'Punti',
            config_completed BOOLEAN NOT NULL DEFAULT FALSE,
            schedule_json JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS team_tournament_teams (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            team_number INTEGER NOT NULL,
            name VARCHAR(255) NOT NULL,
            target_player_count INTEGER NOT NULL,
            players JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_seeded BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(tournament_id, team_number)
        );
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS team_tournament_matchdays (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            root_tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            tournament_day_id UUID NOT NULL UNIQUE REFERENCES tournaments(id) ON DELETE CASCADE,
            date TIMESTAMPTZ NOT NULL,
            team1_number INTEGER NOT NULL,
            team2_number INTEGER NOT NULL,
            round_number INTEGER,
            phase VARCHAR(30) NOT NULL DEFAULT 'round_robin',
            matches_per_day INTEGER NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
            summary_json JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;

    await sql`
        CREATE TABLE IF NOT EXISTS team_tournament_matchday_matches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            matchday_id UUID NOT NULL REFERENCES team_tournament_matchdays(id) ON DELETE CASCADE,
            match_index INTEGER NOT NULL,
            team1_players JSONB NOT NULL DEFAULT '[]'::jsonb,
            team2_players JSONB NOT NULL DEFAULT '[]'::jsonb,
            sets JSONB,
            winner VARCHAR(10),
            cancelled BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(matchday_id, match_index)
        );
    `;

    // Add code_plain column to access_codes (for admin visibility)
    try {
        await sql`ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS code_plain VARCHAR(10)`;
    } catch (error) {
        logger.debug('code_plain column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_teams ADD COLUMN IF NOT EXISTS players JSONB NOT NULL DEFAULT '[]'::jsonb`;
    } catch (error) {
        logger.debug('team_tournament_teams players column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_teams ADD COLUMN IF NOT EXISTS is_seeded BOOLEAN NOT NULL DEFAULT FALSE`;
    } catch (error) {
        logger.debug('team_tournament_teams is_seeded column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_configs ADD COLUMN IF NOT EXISTS format VARCHAR(50) NOT NULL DEFAULT 'ROUND ROBIN'`;
    } catch (error) {
        logger.debug('team_tournament_configs format column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_configs ADD COLUMN IF NOT EXISTS round_robin_final_phase VARCHAR(50)`;
    } catch (error) {
        logger.debug('team_tournament_configs round_robin_final_phase column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_configs ADD COLUMN IF NOT EXISTS matches_per_day INTEGER NOT NULL DEFAULT 3`;
    } catch (error) {
        logger.debug('team_tournament_configs matches_per_day column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_matchday_matches ADD COLUMN IF NOT EXISTS cancelled BOOLEAN NOT NULL DEFAULT FALSE`;
    } catch (error) {
        logger.debug('team_tournament_matchday_matches cancelled column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_matchdays ADD COLUMN IF NOT EXISTS phase VARCHAR(30) NOT NULL DEFAULT 'round_robin'`;
    } catch (error) {
        logger.debug('team_tournament_matchdays phase column migration attempt', { message: error.message });
    }

    await sql`
        CREATE TABLE IF NOT EXISTS team_tournament_fixtures (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            root_tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
            phase VARCHAR(30) NOT NULL,
            slot INTEGER NOT NULL,
            team1_number INTEGER,
            team2_number INTEGER,
            winner_team_number INTEGER,
            loser_team_number INTEGER,
            is_bye BOOLEAN NOT NULL DEFAULT FALSE,
            depends_on JSONB,
            status VARCHAR(20) NOT NULL DEFAULT 'planned',
            tournament_day_id UUID UNIQUE REFERENCES tournaments(id) ON DELETE SET NULL,
            matchday_id UUID UNIQUE REFERENCES team_tournament_matchdays(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(root_tournament_id, phase, slot)
        );
    `;

    // Data fix: 5 matches/day is not allowed with < 8 players/team. Normalize any old configs.
    try {
        await sql`
            UPDATE team_tournament_configs
            SET matches_per_day = 3,
                updated_at = NOW()
            WHERE matches_per_day = 5
            AND default_players_per_team < 8
        `;
    } catch (error) {
        logger.debug('team_tournament_configs matches_per_day normalization attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_configs ADD COLUMN IF NOT EXISTS scoring_type VARCHAR(50) NOT NULL DEFAULT 'Punti'`;
    } catch (error) {
        logger.debug('team_tournament_configs scoring_type column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_configs ADD COLUMN IF NOT EXISTS config_completed BOOLEAN NOT NULL DEFAULT FALSE`;
    } catch (error) {
        logger.debug('team_tournament_configs config_completed column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_configs ADD COLUMN IF NOT EXISTS schedule_json JSONB`;
    } catch (error) {
        logger.debug('team_tournament_configs schedule_json column migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE team_tournament_fixtures ADD COLUMN IF NOT EXISTS winner_team_number INTEGER`;
        await sql`ALTER TABLE team_tournament_fixtures ADD COLUMN IF NOT EXISTS loser_team_number INTEGER`;
        await sql`ALTER TABLE team_tournament_fixtures ADD COLUMN IF NOT EXISTS is_bye BOOLEAN NOT NULL DEFAULT FALSE`;
    } catch (error) {
        logger.debug('team_tournament_fixtures bracket columns migration attempt', { message: error.message });
    }

    // Add workspace_id to existing tables (nullable first, then migrate)
    try {
        await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE`;
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE`;
        await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE`;
        await sql`ALTER TABLE elo_history ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE`;
    } catch (error) {
        logger.debug('workspace_id columns migration attempt', { message: error.message });
    }

    try {
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS parent_tournament_name VARCHAR(255)`;
        await sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS day_label VARCHAR(255)`;
    } catch (error) {
        logger.debug('tournaments parent_tournament_name / day_label column migration attempt', { message: error.message });
    }

    // One-time backfill migration for existing tournaments
    try {
        await sql`
            UPDATE tournaments
            SET parent_tournament_name = COALESCE(parent_tournament_name, giornata_name),
                day_label = CASE
                    WHEN giornata_name IS NOT NULL AND type NOT IN ('Torneo a Squadre') THEN name
                    WHEN giornata_name IS NULL AND type NOT IN ('Torneo a Squadre') THEN type
                    ELSE COALESCE(giornata_name, name)
                END
        `;
        logger.info('Tournaments backfill migration successfully executed');
    } catch (error) {
        logger.debug('Tournaments backfill migration attempt', { message: error.message });
    }

    // Create indexes for workspace scoping
    try {
        await sql`CREATE INDEX IF NOT EXISTS idx_players_workspace ON players(workspace_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_tournaments_workspace ON tournaments(workspace_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_matches_workspace ON matches(workspace_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_elo_history_workspace ON elo_history(workspace_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_access_codes_workspace ON access_codes(workspace_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_team_tournament_configs_tournament ON team_tournament_configs(tournament_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_team_tournament_teams_tournament ON team_tournament_teams(tournament_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_tournaments_team_tournament_root ON tournaments(team_tournament_root_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_team_tournament_matchdays_root ON team_tournament_matchdays(root_tournament_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_team_tournament_matchdays_tournament_day ON team_tournament_matchdays(tournament_day_id)`;
    } catch (error) {
        logger.debug('Index creation attempt', { message: error.message });
    }

    // Auto-setup: create default workspace and admin code if none exist
    try {
        const workspaceCount = await sql`SELECT COUNT(*) as count FROM workspaces`;
        if (parseInt(workspaceCount[0].count) === 0) {
            logger.info('No workspaces found. Creating default workspace and admin code...');

            const defaultWsResult = await sql`
                INSERT INTO workspaces (name, owner_name)
                VALUES ('Workspace Principale', 'Admin')
                RETURNING id
            `;
            const defaultWsId = defaultWsResult[0].id;

            // Hash the default admin code (022733)
            const defaultCode = '022733';
            const codeHash = await bcrypt.hash(defaultCode, 10);
            await sql`
                INSERT INTO access_codes (code_hash, code_plain, workspace_id, label, is_admin)
                VALUES (${codeHash}, ${defaultCode}, ${defaultWsId}, 'Codice Admin', true)
            `;

            // Assign existing data to default workspace
            await sql`UPDATE players SET workspace_id = ${defaultWsId} WHERE workspace_id IS NULL`;
            await sql`UPDATE tournaments SET workspace_id = ${defaultWsId} WHERE workspace_id IS NULL`;
            await sql`UPDATE matches SET workspace_id = ${defaultWsId} WHERE workspace_id IS NULL`;
            await sql`UPDATE elo_history SET workspace_id = ${defaultWsId} WHERE workspace_id IS NULL`;

            logger.info('Default workspace created', { workspaceId: defaultWsId, code: defaultCode });
        }
    } catch (error) {
        logger.warn('Auto-setup attempt', { message: error.message });
    }
}

// Initialize tables on startup
ensureTablesExist().catch(err => logger.error('Failed to ensure tables exist', err));

// ==================== AUTH ROUTES ====================

// POST /api/auth/login - Authenticate with 6-digit code
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: 'Codice a 6 cifre richiesto' });
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Get all active codes
        const activeCodes = await sql`
            SELECT ac.id, ac.code_hash, ac.workspace_id, ac.is_admin, ac.failed_attempts, ac.locked_until, ac.expires_at, ac.label,
                   w.name as workspace_name, w.is_active as workspace_active
            FROM access_codes ac
            JOIN workspaces w ON ac.workspace_id = w.id
            WHERE ac.is_active = true AND w.is_active = true
        `;

        // Check each code (bcrypt compare)
        let matchedCode = null;
        let expiredMatchedCode = null;
        for (const ac of activeCodes) {
            // Check if locked
            if (ac.locked_until && new Date(ac.locked_until) > new Date()) {
                continue;
            }
            const isMatch = await bcrypt.compare(code, ac.code_hash);
            if (isMatch) {
                if (ac.expires_at && new Date(ac.expires_at) <= new Date()) {
                    expiredMatchedCode = ac;
                    break;
                }
                matchedCode = ac;
                break;
            }
        }

        if (expiredMatchedCode) {
            await sql`
                UPDATE access_codes
                SET is_active = false
                WHERE id = ${expiredMatchedCode.id}
            `;

            await sql`
                INSERT INTO audit_logs (workspace_id, action, ip_address, user_agent, details)
                VALUES (${expiredMatchedCode.workspace_id}, 'login_failed', ${ip}, ${req.headers['user-agent'] || ''}, ${JSON.stringify({ reason: 'code_expired', label: expiredMatchedCode.label })})
            `;

            return res.status(401).json({ message: 'Codice scaduto' });
        }

        if (!matchedCode) {
            // Increment failed attempts for all codes (we don't know which one they tried)
            // Log the failed attempt
            await sql`
                INSERT INTO audit_logs (action, ip_address, user_agent, details)
                VALUES ('login_failed', ${ip}, ${req.headers['user-agent'] || ''}, ${JSON.stringify({ code_hint: code.substring(0, 2) + '****' })})
            `;

            return res.status(401).json({ message: 'Codice non valido' });
        }

        // Reset failed attempts and update last used
        await sql`
            UPDATE access_codes
            SET failed_attempts = 0, last_used_at = NOW()
            WHERE id = ${matchedCode.id}
        `;

        // Generate JWT
        const token = jwt.sign({
            sub: matchedCode.workspace_id,
            wname: matchedCode.workspace_name,
            admin: matchedCode.is_admin
        }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, issuer: 'padel-elo-manager' });

        // Log successful login
        await sql`
            INSERT INTO audit_logs (workspace_id, action, ip_address, user_agent, details)
            VALUES (${matchedCode.workspace_id}, 'login_success', ${ip}, ${req.headers['user-agent'] || ''}, ${JSON.stringify({ label: matchedCode.label, isAdmin: matchedCode.is_admin })})
        `;

        logger.info('Login successful', { workspace: matchedCode.workspace_name, admin: matchedCode.is_admin });

        res.json({
            token,
            workspace: {
                id: matchedCode.workspace_id,
                name: matchedCode.workspace_name
            },
            isAdmin: matchedCode.is_admin
        });
    } catch (error) {
        logger.error('Login failed', error);
        res.status(500).json({ message: 'Errore durante il login' });
    }
});

// POST /api/auth/verify - Verify JWT token validity
app.post('/api/auth/verify', async (req, res) => {
    res.json({
        valid: true,
        workspace: { id: req.workspaceId, name: req.workspaceName },
        isAdmin: req.isAdmin
    });
});

// ==================== ADMIN ROUTES ====================

// Middleware to check admin access
function requireAdmin(req, res, next) {
    if (!req.isAdmin) {
        return res.status(403).json({ message: 'Accesso admin richiesto' });
    }
    next();
}

// GET /api/admin/workspaces/:workspaceId/tournaments - List selectable tournaments for a workspace
app.get('/api/admin/workspaces/:workspaceId/tournaments', requireAdmin, async (req, res) => {
    try {
        const { workspaceId } = req.params;
        if (!workspaceId) return res.status(400).json({ message: 'workspaceId richiesto' });

        const ws = await sql`SELECT id, is_active FROM workspaces WHERE id = ${workspaceId} LIMIT 1`;
        if (ws.length === 0) return res.status(404).json({ message: 'Workspace non trovato' });

        const tournaments = await sql`
            SELECT id, name, type, date, club, status, giornata_name, team_tournament_root_id
            FROM tournaments
            WHERE workspace_id = ${workspaceId}
              AND (
                type <> ${'Torneo a Squadre'}
                OR (
                    type = ${'Torneo a Squadre'}
                    AND COALESCE(team_tournament_root_id, id) = id
                    AND (giornata_name IS NULL OR BTRIM(giornata_name) = '')
                )
              )
            ORDER BY date DESC, id DESC
        `;

        res.json({
            tournaments: tournaments.map(t => ({
                id: t.id,
                name: t.name,
                type: t.type,
                date: t.date,
                club: t.club,
                status: t.status,
            }))
        });
    } catch (error) {
        logger.error('Failed to list workspace tournaments', error);
        res.status(500).json({ message: 'Errore nel recupero tornei workspace' });
    }
});

// POST /api/admin/transfer/tournament - Copy a tournament dataset between workspaces
app.post('/api/admin/transfer/tournament', requireAdmin, async (req, res) => {
    const txId = randomUUID();
    try {
        const { sourceWorkspaceId, destinationWorkspaceId, tournamentId } = req.body || {};
        if (!sourceWorkspaceId || !destinationWorkspaceId || !tournamentId) {
            return res.status(400).json({ message: 'sourceWorkspaceId, destinationWorkspaceId e tournamentId richiesti' });
        }
        if (sourceWorkspaceId === destinationWorkspaceId) {
            return res.status(400).json({ message: 'Workspace sorgente e destinatario devono essere diversi' });
        }

        const [srcWs, dstWs] = await Promise.all([
            sql`SELECT id, name, is_active FROM workspaces WHERE id = ${sourceWorkspaceId} LIMIT 1`,
            sql`SELECT id, name, is_active FROM workspaces WHERE id = ${destinationWorkspaceId} LIMIT 1`,
        ]);
        if (srcWs.length === 0) return res.status(404).json({ message: 'Workspace sorgente non trovato' });
        if (dstWs.length === 0) return res.status(404).json({ message: 'Workspace destinatario non trovato' });
        if (!srcWs[0].is_active) return res.status(400).json({ message: 'Workspace sorgente non attivo' });
        if (!dstWs[0].is_active) return res.status(400).json({ message: 'Workspace destinatario non attivo' });

        const tRows = await sql`
            SELECT id, name, type, date, club, status, americano_fields, americano_scoring_type, final_standings,
                   giornata_name, num_gironi, team_tournament_root_id
            FROM tournaments
            WHERE id = ${tournamentId}
              AND workspace_id = ${sourceWorkspaceId}
            LIMIT 1
        `;
        if (tRows.length === 0) return res.status(404).json({ message: 'Torneo non trovato nel workspace sorgente' });

        const selectedTournament = tRows[0];
        const sourceRootId = selectedTournament.type === 'Torneo a Squadre'
            ? (selectedTournament.team_tournament_root_id || selectedTournament.id)
            : null;
        const isTeamTournament = selectedTournament.type === 'Torneo a Squadre';

        // Determine which tournaments to copy.
        const tournamentsToCopy = isTeamTournament
            ? await sql`
                SELECT id, name, type, date, club, status, americano_fields, americano_scoring_type, final_standings,
                       giornata_name, num_gironi, team_tournament_root_id
                FROM tournaments
                WHERE workspace_id = ${sourceWorkspaceId}
                  AND (id = ${sourceRootId} OR team_tournament_root_id = ${sourceRootId})
                ORDER BY date ASC, id ASC
            `
            : [selectedTournament];

        const oldTournamentIds = tournamentsToCopy.map(t => t.id);

        // Fetch matches only for classic tournaments.
        const oldMatches = isTeamTournament
            ? []
            : await sql`
                SELECT id, date, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, sets, winner, tournament_id, created_at
                FROM matches
                WHERE workspace_id = ${sourceWorkspaceId}
                  AND tournament_id = ANY(${oldTournamentIds}::uuid[])
                ORDER BY created_at ASC, date ASC
            `;

        const oldMatchIds = oldMatches.map(m => m.id);

        const playerIdSet = new Set();
        for (const m of oldMatches) {
            for (const pid of [m.team1_p1_id, m.team1_p2_id, m.team2_p1_id, m.team2_p2_id]) {
                if (pid) playerIdSet.add(String(pid));
            }
        }
        const oldPlayerIds = Array.from(playerIdSet);

        const oldPlayers = oldPlayerIds.length > 0
            ? await sql`
                SELECT id, name, surname, position, initial_elo, current_elo
                FROM players
                WHERE workspace_id = ${sourceWorkspaceId}
                  AND id = ANY(${oldPlayerIds}::uuid[])
            `
            : [];

        const oldEloHistory = (!isTeamTournament && (oldTournamentIds.length > 0 || oldMatchIds.length > 0) && oldPlayerIds.length > 0)
            ? await sql`
                SELECT event_id, player_id, elo_before, elo_after, delta, date, type, source_label
                FROM elo_history
                WHERE workspace_id = ${sourceWorkspaceId}
                  AND player_id = ANY(${oldPlayerIds}::uuid[])
                  AND event_id = ANY(${[...oldTournamentIds, ...oldMatchIds]}::uuid[])
                ORDER BY date ASC
            `
            : [];

        // Team tournament scoped tables
        const [oldTeamConfigRows, oldTeamRows, oldMatchdays, oldMatchdayMatches, oldFixtures] = isTeamTournament
            ? await Promise.all([
                sql`SELECT * FROM team_tournament_configs WHERE tournament_id = ${sourceRootId} LIMIT 1`,
                sql`SELECT * FROM team_tournament_teams WHERE tournament_id = ${sourceRootId} ORDER BY team_number ASC`,
                sql`SELECT * FROM team_tournament_matchdays WHERE root_tournament_id = ${sourceRootId} ORDER BY created_at ASC`,
                sql`
                    SELECT m.*
                    FROM team_tournament_matchday_matches m
                    JOIN team_tournament_matchdays d ON d.id = m.matchday_id
                    WHERE d.root_tournament_id = ${sourceRootId}
                    ORDER BY d.created_at ASC, m.match_index ASC
                `,
                sql`SELECT * FROM team_tournament_fixtures WHERE root_tournament_id = ${sourceRootId} ORDER BY phase ASC, slot ASC`,
            ])
            : [[], [], [], [], []];

        // Build ID maps
        const tournamentIdMap = new Map();
        const playerIdMap = new Map();
        const matchIdMap = new Map();
        const matchdayIdMap = new Map();

        const newRootTournamentId = isTeamTournament ? randomUUID() : null;

        for (const t of tournamentsToCopy) {
            const newId = (isTeamTournament && String(t.id) === String(sourceRootId))
                ? newRootTournamentId
                : randomUUID();
            tournamentIdMap.set(String(t.id), newId);
        }
        for (const p of oldPlayers) playerIdMap.set(String(p.id), randomUUID());
        for (const m of oldMatches) matchIdMap.set(String(m.id), randomUUID());
        for (const md of oldMatchdays) matchdayIdMap.set(String(md.id), randomUUID());

        // Start transaction
        await sql`BEGIN`;

        // Copy tournaments
        for (const t of tournamentsToCopy) {
            const newId = tournamentIdMap.get(String(t.id));
            const newTeamRootId = isTeamTournament ? newRootTournamentId : null;

            await sql`
                INSERT INTO tournaments (
                    id, name, type, date, club, status,
                    americano_fields, americano_scoring_type, final_standings,
                    giornata_name, num_gironi, team_tournament_root_id,
                    workspace_id
                )
                VALUES (
                    ${newId}, ${t.name}, ${t.type}, ${t.date}, ${t.club}, ${t.status},
                    ${t.americano_fields ?? null}, ${t.americano_scoring_type ?? null}, ${t.final_standings ?? null},
                    ${t.giornata_name ?? null}, ${t.num_gironi ?? null},
                    ${newTeamRootId},
                    ${destinationWorkspaceId}
                )
            `;
        }

        // Copy players (classic tournaments)
        for (const p of oldPlayers) {
            const newId = playerIdMap.get(String(p.id));
            await sql`
                INSERT INTO players (id, name, surname, position, initial_elo, current_elo, workspace_id)
                VALUES (${newId}, ${p.name}, ${p.surname}, ${p.position}, ${p.initial_elo}, ${p.current_elo}, ${destinationWorkspaceId})
            `;
        }

        // Copy matches (classic tournaments)
        for (const m of oldMatches) {
            const newId = matchIdMap.get(String(m.id));
            const newTournamentId = tournamentIdMap.get(String(m.tournament_id));
            const mapPid = (pid) => (pid ? playerIdMap.get(String(pid)) : null);
            await sql`
                INSERT INTO matches (
                    id, date, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id,
                    sets, winner, tournament_id, workspace_id, created_at
                )
                VALUES (
                    ${newId}, ${m.date},
                    ${mapPid(m.team1_p1_id)}, ${mapPid(m.team1_p2_id)}, ${mapPid(m.team2_p1_id)}, ${mapPid(m.team2_p2_id)},
                    ${m.sets}, ${m.winner ?? null}, ${newTournamentId}, ${destinationWorkspaceId}, ${m.created_at ?? m.date}
                )
            `;
        }

        // Copy elo history (classic tournaments)
        for (const h of oldEloHistory) {
            const newPlayerId = playerIdMap.get(String(h.player_id));
            const eventIdKey = String(h.event_id);
            const newEventId = tournamentIdMap.get(eventIdKey) || matchIdMap.get(eventIdKey);
            if (!newPlayerId || !newEventId) continue;
            await sql`
                INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id, source_label)
                VALUES (${newEventId}, ${newPlayerId}, ${h.elo_before}, ${h.elo_after}, ${h.delta}, ${h.date}, ${h.type}, ${destinationWorkspaceId}, ${h.source_label})
            `;
        }

        // Copy team tournament tables (team tournaments only)
        if (isTeamTournament) {
            const newRootId = newRootTournamentId;

            if (oldTeamConfigRows.length > 0) {
                const c = oldTeamConfigRows[0];
                await sql`
                    INSERT INTO team_tournament_configs (
                        tournament_id, initial_team_count, default_players_per_team, format, matches_per_day,
                        round_robin_final_phase, scoring_type, config_completed, schedule_json, created_at, updated_at
                    )
                    VALUES (
                        ${newRootId}, ${c.initial_team_count}, ${c.default_players_per_team}, ${c.format}, ${c.matches_per_day},
                        ${c.round_robin_final_phase ?? null}, ${c.scoring_type ?? 'Punti'}, ${c.config_completed},
                        ${c.schedule_json ? JSON.stringify(c.schedule_json) : null}::jsonb,
                        NOW(), NOW()
                    )
                `;
            }

            for (const tt of oldTeamRows) {
                await sql`
                    INSERT INTO team_tournament_teams (
                        tournament_id, team_number, name, target_player_count, players, is_seeded, created_at, updated_at
                    )
                    VALUES (
                        ${newRootId}, ${tt.team_number}, ${tt.name}, ${tt.target_player_count},
                        ${JSON.stringify(Array.isArray(tt.players) ? tt.players : [])}::jsonb,
                        ${tt.is_seeded ?? false}, NOW(), NOW()
                    )
                `;
            }

            for (const md of oldMatchdays) {
                const newMdId = matchdayIdMap.get(String(md.id));
                const newTournamentDayId = tournamentIdMap.get(String(md.tournament_day_id));
                await sql`
                    INSERT INTO team_tournament_matchdays (
                        id, root_tournament_id, tournament_day_id, date,
                        team1_number, team2_number, round_number, phase, matches_per_day, status, summary_json,
                        created_at, updated_at
                    )
                    VALUES (
                        ${newMdId}, ${newRootId}, ${newTournamentDayId}, ${md.date},
                        ${md.team1_number}, ${md.team2_number}, ${md.round_number ?? null}, ${md.phase ?? 'round_robin'},
                        ${md.matches_per_day}, ${md.status ?? 'scheduled'}, ${md.summary_json ? JSON.stringify(md.summary_json) : null}::jsonb,
                        NOW(), NOW()
                    )
                `;
            }

            for (const mm of oldMatchdayMatches) {
                const newMatchdayId = matchdayIdMap.get(String(mm.matchday_id));
                await sql`
                    INSERT INTO team_tournament_matchday_matches (
                        matchday_id, match_index, team1_players, team2_players, sets, winner, cancelled, created_at, updated_at
                    )
                    VALUES (
                        ${newMatchdayId}, ${mm.match_index},
                        ${JSON.stringify(Array.isArray(mm.team1_players) ? mm.team1_players : [])}::jsonb,
                        ${JSON.stringify(Array.isArray(mm.team2_players) ? mm.team2_players : [])}::jsonb,
                        ${mm.sets ? JSON.stringify(mm.sets) : null}::jsonb, ${mm.winner ?? null}, ${mm.cancelled ?? false},
                        NOW(), NOW()
                    )
                `;
            }

            for (const f of oldFixtures) {
                const newTournamentDayId = f.tournament_day_id ? tournamentIdMap.get(String(f.tournament_day_id)) : null;
                const newMatchdayId = f.matchday_id ? matchdayIdMap.get(String(f.matchday_id)) : null;
                await sql`
                    INSERT INTO team_tournament_fixtures (
                        root_tournament_id, phase, slot, team1_number, team2_number, winner_team_number, loser_team_number, is_bye,
                        depends_on, status, tournament_day_id, matchday_id, created_at, updated_at
                    )
                    VALUES (
                        ${newRootId}, ${f.phase}, ${f.slot}, ${f.team1_number ?? null}, ${f.team2_number ?? null},
                        ${f.winner_team_number ?? null}, ${f.loser_team_number ?? null}, ${f.is_bye ?? false},
                        ${f.depends_on ? JSON.stringify(f.depends_on) : null}::jsonb, ${f.status ?? 'planned'}, ${newTournamentDayId}, ${newMatchdayId},
                        NOW(), NOW()
                    )
                `;
            }
        }

        await sql`
            INSERT INTO audit_logs (workspace_id, action, ip_address, user_agent, details)
            VALUES (
                ${destinationWorkspaceId},
                ${'tournament_transfer'},
                ${req.ip || null},
                ${req.headers['user-agent'] || ''},
                ${JSON.stringify({
                    txId,
                    sourceWorkspaceId,
                    destinationWorkspaceId,
                    sourceTournamentId: tournamentId,
                    copiedTournaments: tournamentsToCopy.length,
                    copiedPlayers: oldPlayers.length,
                    copiedMatches: oldMatches.length,
                    copiedEloHistory: oldEloHistory.length,
                    isTeamTournament
                })}
            )
        `;

        await sql`COMMIT`;

        res.json({
            message: 'Invio completato',
            txId,
            isTeamTournament,
            source: { id: sourceWorkspaceId, name: srcWs[0].name },
            destination: { id: destinationWorkspaceId, name: dstWs[0].name },
            counts: {
                tournaments: tournamentsToCopy.length,
                players: oldPlayers.length,
                matches: oldMatches.length,
                eloHistory: oldEloHistory.length,
                teamConfigs: isTeamTournament ? (oldTeamConfigRows.length) : 0,
                teamTeams: isTeamTournament ? (oldTeamRows.length) : 0,
                teamMatchdays: isTeamTournament ? (oldMatchdays.length) : 0,
                teamMatchdayMatches: isTeamTournament ? (oldMatchdayMatches.length) : 0,
                teamFixtures: isTeamTournament ? (oldFixtures.length) : 0,
            },
            newRootTournamentId: isTeamTournament ? newRootTournamentId : tournamentIdMap.get(String(tournamentId)),
        });
    } catch (error) {
        try { await sql`ROLLBACK`; } catch {}
        logger.error('Failed to transfer tournament', { txId, error });
        res.status(500).json({ message: 'Errore durante invio dati torneo', error: error?.message || String(error) });
    }
});

// GET /api/admin/workspaces - List all workspaces
app.get('/api/admin/workspaces', requireAdmin, async (req, res) => {
    try {
        const workspaces = await sql`
            SELECT w.*,
                   (SELECT COUNT(*) FROM players WHERE workspace_id = w.id) as player_count,
                   (SELECT COUNT(DISTINCT COALESCE(team_tournament_root_id::text, NULLIF(giornata_name, ''), id::text)) FROM tournaments WHERE workspace_id = w.id) as tournament_count,
                   (SELECT COUNT(*) FROM access_codes WHERE workspace_id = w.id AND is_active = true) as active_codes
            FROM workspaces w
            ORDER BY w.created_at DESC
        `;
        res.json({ workspaces });
    } catch (error) {
        logger.error('Failed to list workspaces', error);
        res.status(500).json({ message: 'Errore nel recupero workspace' });
    }
});

// POST /api/admin/workspaces - Create new workspace
app.post('/api/admin/workspaces', requireAdmin, async (req, res) => {
    try {
        const { name, ownerName, ownerEmail } = req.body;
        if (!name) return res.status(400).json({ message: 'Nome workspace richiesto' });

        const result = await sql`
            INSERT INTO workspaces (name, owner_name, owner_email)
            VALUES (${name}, ${ownerName || null}, ${ownerEmail || null})
            RETURNING id, name, owner_name, created_at
        `;

        logger.info('Workspace created', { id: result[0].id, name });
        res.json({ workspace: result[0] });
    } catch (error) {
        logger.error('Failed to create workspace', error);
        res.status(500).json({ message: 'Errore nella creazione workspace' });
    }
});

// DELETE /api/admin/workspaces/:id - Permanently delete a workspace and all scoped data
app.delete('/api/admin/workspaces/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await sql`
            SELECT id, name
            FROM workspaces
            WHERE id = ${id}
        `;

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Workspace non trovato' });
        }

        if (id === req.workspaceId) {
            return res.status(400).json({ message: 'Non puoi cancellare il workspace attualmente in uso' });
        }

        const workspaceCount = await sql`SELECT COUNT(*) as count FROM workspaces`;
        if (parseInt(workspaceCount[0].count, 10) <= 1) {
            return res.status(400).json({ message: 'Non puoi cancellare l’ultimo workspace disponibile' });
        }

        await sql`DELETE FROM workspaces WHERE id = ${id}`;

        logger.info('Workspace permanently deleted', {
            id,
            name: existing[0].name,
            deletedBy: req.workspaceName
        });

        res.json({ message: 'Workspace cancellato definitivamente' });
    } catch (error) {
        logger.error('Failed to delete workspace', error);
        res.status(500).json({ message: 'Errore nella cancellazione workspace' });
    }
});

// POST /api/admin/codes/generate - Generate access code for a workspace
app.post('/api/admin/codes/generate', requireAdmin, async (req, res) => {
    try {
        const { workspaceId, code, label, isAdmin, expiresAt } = req.body;
        if (!workspaceId || !code) {
            return res.status(400).json({ message: 'workspaceId e code richiesti' });
        }
        if (!/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: 'Il codice deve essere di 6 cifre numeriche' });
        }

        // Check workspace exists
        const ws = await sql`SELECT id FROM workspaces WHERE id = ${workspaceId}`;
        if (ws.length === 0) return res.status(404).json({ message: 'Workspace non trovato' });

        const codeHash = await bcrypt.hash(code, 10);

        const result = await sql`
            INSERT INTO access_codes (code_hash, code_plain, workspace_id, label, is_admin, expires_at)
            VALUES (${codeHash}, ${code}, ${workspaceId}, ${label || null}, ${isAdmin || false}, ${expiresAt || null})
            RETURNING id, label, is_admin, created_at, expires_at
        `;

        logger.info('Access code created', { workspaceId, label, isAdmin: isAdmin || false });
        res.json({ accessCode: result[0], code });
    } catch (error) {
        logger.error('Failed to generate code', error);
        res.status(500).json({ message: 'Errore nella generazione codice' });
    }
});

// GET /api/admin/codes - List all access codes
app.get('/api/admin/codes', requireAdmin, async (req, res) => {
    try {
        const codes = await sql`
            SELECT ac.id, ac.label, ac.code_plain, ac.is_admin, ac.is_active, ac.created_at, ac.expires_at, ac.last_used_at, ac.failed_attempts,
                   w.name as workspace_name, w.id as workspace_id
            FROM access_codes ac
            JOIN workspaces w ON ac.workspace_id = w.id
            ORDER BY ac.created_at DESC
        `;
        res.json({ codes });
    } catch (error) {
        logger.error('Failed to list codes', error);
        res.status(500).json({ message: 'Errore nel recupero codici' });
    }
});

// PUT /api/admin/codes/:id/set-plain - Set plaintext code for existing codes
app.put('/api/admin/codes/:id/set-plain', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { code } = req.body;
        if (!code || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: 'Il codice deve essere di 6 cifre numeriche' });
        }
        // Verify the code matches the hash
        const existing = await sql`SELECT code_hash FROM access_codes WHERE id = ${id}`;
        if (existing.length === 0) return res.status(404).json({ message: 'Codice non trovato' });

        const isMatch = await bcrypt.compare(code, existing[0].code_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Il codice inserito non corrisponde al codice hash salvato' });
        }

        await sql`UPDATE access_codes SET code_plain = ${code} WHERE id = ${id}`;
        logger.info('Code plain text set', { id });
        res.json({ message: 'Codice aggiornato' });
    } catch (error) {
        logger.error('Failed to set plain code', error);
        res.status(500).json({ message: 'Errore nell\'aggiornamento' });
    }
});

// DELETE /api/admin/codes/:id - Deactivate an access code
app.delete('/api/admin/codes/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await sql`UPDATE access_codes SET is_active = false WHERE id = ${id}`;
        logger.info('Access code deactivated', { id });
        res.json({ message: 'Codice disattivato' });
    } catch (error) {
        logger.error('Failed to deactivate code', error);
        res.status(500).json({ message: 'Errore nella disattivazione codice' });
    }
});

// DELETE /api/admin/codes/:id/permanent - Permanently delete a deactivated access code
app.delete('/api/admin/codes/:id/permanent', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await sql`
            SELECT id, is_active
            FROM access_codes
            WHERE id = ${id}
        `;

        if (existing.length === 0) {
            return res.status(404).json({ message: 'Codice non trovato' });
        }

        if (existing[0].is_active) {
            return res.status(400).json({ message: 'Disattiva prima il codice' });
        }

        await sql`DELETE FROM access_codes WHERE id = ${id}`;
        logger.info('Access code permanently deleted', { id });
        res.json({ message: 'Codice cancellato' });
    } catch (error) {
        logger.error('Failed to permanently delete code', error);
        res.status(500).json({ message: 'Errore nella cancellazione codice' });
    }
});

// POST /api/admin/impersonate - Switch to another workspace (admin only)
app.post('/api/admin/impersonate', requireAdmin, async (req, res) => {
    try {
        const { workspaceId } = req.body;
        if (!workspaceId) return res.status(400).json({ message: 'workspaceId richiesto' });

        const ws = await sql`SELECT id, name FROM workspaces WHERE id = ${workspaceId} AND is_active = true`;
        if (ws.length === 0) return res.status(404).json({ message: 'Workspace non trovato' });

        const token = jwt.sign({
            sub: ws[0].id,
            wname: ws[0].name,
            admin: true
        }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, issuer: 'padel-elo-manager' });

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await sql`
            INSERT INTO audit_logs (workspace_id, action, ip_address, user_agent, details)
            VALUES (${ws[0].id}, 'admin_impersonate', ${ip}, ${req.headers['user-agent'] || ''}, ${JSON.stringify({ from_workspace: req.workspaceName, to_workspace: ws[0].name })})
        `;

        logger.info('Admin impersonated workspace', { from: req.workspaceName, to: ws[0].name });
        res.json({ token, workspace: { id: ws[0].id, name: ws[0].name } });
    } catch (error) {
        logger.error('Failed to impersonate', error);
        res.status(500).json({ message: 'Errore nel cambio workspace' });
    }
});

// POST /api/admin/recalculate-elos - Recalculate all players' current_elo from elo_history
// If workspaceId is provided, only that workspace; otherwise ALL workspaces
app.post('/api/admin/recalculate-elos', requireAdmin, async (req, res) => {
    try {
        const { workspaceId } = req.body;

        // Get players: all workspaces or just one
        const players = workspaceId
            ? await sql`SELECT id, name, surname, current_elo, workspace_id FROM players WHERE workspace_id = ${workspaceId}`
            : await sql`SELECT id, name, surname, current_elo, workspace_id FROM players`;

        const results = [];
        for (const player of players) {
            const historyResult = await sql`
                SELECT COALESCE(SUM(delta), 0) as total_delta
                FROM elo_history
                WHERE player_id = ${player.id} AND workspace_id = ${player.workspace_id}
            `;
            const totalDelta = parseFloat(historyResult[0].total_delta);
            const correctElo = 1500 + totalDelta;
            const oldElo = parseFloat(player.current_elo);
            const diff = correctElo - oldElo;

            if (Math.abs(diff) > 0.001) {
                await sql`UPDATE players SET current_elo = ${correctElo} WHERE id = ${player.id}`;
                results.push({ name: `${player.name} ${player.surname}`, workspaceId: player.workspace_id, oldElo, newElo: correctElo, diff });
                logger.info('ELO recalculated', { player: `${player.name} ${player.surname}`, oldElo, newElo: correctElo, diff });
            }
        }

        logger.info('Recalculate ELOs completed', { scope: workspaceId || 'ALL', corrected: results.length });
        res.json({ success: true, corrected: results.length, changes: results });
    } catch (error) {
        logger.error('Failed to recalculate ELOs', error);
        res.status(500).json({ message: 'Errore nel ricalcolo ELO', error: error.message });
    }
});

// POST /api/admin/recalculate-elos-full - Full ELO recalculation: reset all + replay all matches chronologically
app.post('/api/admin/recalculate-elos-full', requireAdmin, async (req, res) => {
    try {
        // 1. Reset all players to initial_elo
        await sql`UPDATE players SET current_elo = initial_elo`;

        // 2. Clear all elo_history
        await sql`DELETE FROM elo_history`;

        // 3. Fetch normal matches
        const normalMatches = await sql`
            SELECT m.id, m.date, m.team1_p1_id, m.team1_p2_id, m.team2_p1_id, m.team2_p2_id, m.winner, m.tournament_id, t.workspace_id, t.name as tournament_name
            FROM matches m
            JOIN tournaments t ON m.tournament_id = t.id
            WHERE m.winner IS NOT NULL
            ORDER BY m.date ASC
        `;

        // 4. Fetch team tournament matches
        const teamMatches = await sql`
            SELECT tm.id, tm.team1_players, tm.team2_players, tm.winner as team_winner, tm.matchday_id, md.date, t.workspace_id, t.name as tournament_name, md.tournament_day_id as tournament_id
            FROM team_tournament_matchday_matches tm
            JOIN team_tournament_matchdays md ON tm.matchday_id = md.id
            JOIN tournaments t ON md.tournament_day_id = t.id
            WHERE tm.winner IS NOT NULL AND tm.cancelled = FALSE
            ORDER BY md.date ASC
        `;

        // 5. Merge and sort all matches chronologically
        const allMatches = [
            ...normalMatches.map(m => ({ ...m, isTeamMatch: false, sortDate: new Date(m.date) })),
            ...teamMatches.map(m => ({ ...m, isTeamMatch: true, sortDate: new Date(m.date) })),
        ].sort((a, b) => a.sortDate - b.sortDate);

        const kFactor = 16;
        const eloCache = {}; // player_id -> current_elo

        // Preload all players for name-based lookup
        const allPlayersRes = await sql`SELECT id, name, surname, initial_elo, current_elo, workspace_id FROM players`;
        const nameToIdMap = {}; // workspace_id -> "name surname" -> id
        
        for (const p of allPlayersRes) {
            eloCache[p.id] = parseFloat(p.initial_elo);
            if (!nameToIdMap[p.workspace_id]) nameToIdMap[p.workspace_id] = {};
            const key = `${p.name.trim().toLowerCase()} ${p.surname.trim().toLowerCase()}`;
            nameToIdMap[p.workspace_id][key] = p.id;
        }

        const getElo = async (id) => {
            return eloCache[id] !== undefined ? eloCache[id] : null;
        };

        const extractIds = (arr, wsId) => (arr || []).map(item => {
            if (!item) return null;
            if (typeof item === 'string') return item;
            if (typeof item === 'object') {
                if (item.id) return item.id;
                // Fallback to name+surname lookup
                if (item.name && item.surname && nameToIdMap[wsId]) {
                    const key = `${item.name.trim().toLowerCase()} ${item.surname.trim().toLowerCase()}`;
                    if (nameToIdMap[wsId][key]) return nameToIdMap[wsId][key];
                }
            }
            return null;
        }).filter(Boolean);

        let processed = 0;
        for (const match of allMatches) {
            let team1Ids, team2Ids, score1;

            if (match.isTeamMatch) {
                team1Ids = extractIds(match.team1_players, match.workspace_id);
                team2Ids = extractIds(match.team2_players, match.workspace_id);
                if (match.team_winner === 'team1') score1 = 1;
                else if (match.team_winner === 'team2') score1 = 0;
                else if (match.team_winner === 'draw') score1 = 0.5;
                else continue;
            } else {
                team1Ids = [match.team1_p1_id, match.team1_p2_id].filter(Boolean);
                team2Ids = [match.team2_p1_id, match.team2_p2_id].filter(Boolean);
                if (match.winner === 'team1') score1 = 1;
                else if (match.winner === 'team2') score1 = 0;
                else if (match.winner === 'draw') score1 = 0.5;
                else continue;
            }

            if (team1Ids.length === 0 || team2Ids.length === 0) continue;

            const validT1 = [], validT2 = [];
            for (const id of team1Ids) { if (await getElo(id) !== null) validT1.push(id); }
            for (const id of team2Ids) { if (await getElo(id) !== null) validT2.push(id); }
            if (validT1.length === 0 || validT2.length === 0) continue;

            const t1Avg = validT1.reduce((s, id) => s + eloCache[id], 0) / validT1.length;
            const t2Avg = validT2.reduce((s, id) => s + eloCache[id], 0) / validT2.length;

            const expected1 = 1 / (1 + Math.pow(10, (t2Avg - t1Avg) / 400));
            const delta1 = kFactor * (score1 - expected1);
            const delta2 = kFactor * ((1 - score1) - (1 - expected1));

            const eventId = match.isTeamMatch ? match.matchday_id : match.id;
            const type = match.isTeamMatch ? 'team_tournament_matchday' : 'tournament';
            const dateStr = match.sortDate.toISOString();

            for (const id of validT1) {
                const oldElo = eloCache[id];
                const newElo = oldElo + delta1;
                await sql`UPDATE players SET current_elo = ${newElo} WHERE id = ${id}`;
                await sql`INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id, source_label)
                    VALUES (${eventId}, ${id}, ${oldElo}, ${newElo}, ${delta1}, ${dateStr}, ${type}, ${match.workspace_id}, ${match.tournament_name})`;
                eloCache[id] = newElo;
            }
            for (const id of validT2) {
                const oldElo = eloCache[id];
                const newElo = oldElo + delta2;
                await sql`UPDATE players SET current_elo = ${newElo} WHERE id = ${id}`;
                await sql`INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id, source_label)
                    VALUES (${eventId}, ${id}, ${oldElo}, ${newElo}, ${delta2}, ${dateStr}, ${type}, ${match.workspace_id}, ${match.tournament_name})`;
                eloCache[id] = newElo;
            }
            processed++;
        }

        logger.info('Full ELO recalculation completed', { totalMatches: allMatches.length, processed });
        res.json({ success: true, totalMatches: allMatches.length, processed });
    } catch (error) {
        logger.error('Failed to run full ELO recalculation', error);
        res.status(500).json({ message: 'Errore nel ricalcolo ELO completo', error: error.message });
    }
});

// GET /api/admin/audit-logs - Get audit logs
app.get('/api/admin/audit-logs', requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = await sql`
            SELECT al.*, w.name as workspace_name
            FROM audit_logs al
            LEFT JOIN workspaces w ON al.workspace_id = w.id
            ORDER BY al.created_at DESC
            LIMIT ${limit}
        `;
        res.json({ logs });
    } catch (error) {
        logger.error('Failed to fetch audit logs', error);
        res.status(500).json({ message: 'Errore nel recupero audit logs' });
    }
});

// ==================== DATA ROUTES ====================

const generateRoundRobinSchedule = (teamCount) => {
    const byeTeam = 0;
    let teams = Array.from({ length: teamCount }, (_, idx) => idx + 1);
    if (teams.length % 2 === 1) teams = [...teams, byeTeam];

    const n = teams.length;
    const rounds = n - 1;

    const days = [];
    for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
        const matches = [];
        let byeTeamNumber = null;

        // Circle method: pair first-last, second-secondLast, ...
        for (let i = 0; i < n / 2; i++) {
            const team1 = teams[i];
            const team2 = teams[n - 1 - i];
            if (team1 === byeTeam || team2 === byeTeam) {
                byeTeamNumber = team1 === byeTeam ? team2 : team1;
                continue;
            }
            matches.push({ matchNumber: matches.length + 1, team1Number: team1, team2Number: team2 });
        }

        days.push({ dayNumber: roundIndex + 1, byeTeamNumber, matches });

        // Rotation: keep first fixed, move last to index 1, shift the rest right.
        const fixed = teams[0];
        const rest = teams.slice(1);
        const last = rest.pop();
        teams = [fixed, last, ...rest];
    }

    return {
        kind: 'round_robin',
        days
    };
};

const validateRoundRobinSchedule = (scheduleJson, teamCount) => {
    if (!scheduleJson || scheduleJson.kind !== 'round_robin' || !Array.isArray(scheduleJson.days)) return { valid: false, reason: 'missing' };
    const expectedPairs = new Set();
    for (let a = 1; a <= teamCount; a++) {
        for (let b = a + 1; b <= teamCount; b++) expectedPairs.add(`${a}-${b}`);
    }
    const seen = new Set();
    for (const d of scheduleJson.days) {
        const matches = Array.isArray(d.matches) ? d.matches : [];
        for (const m of matches) {
            const t1 = Number(m.team1Number);
            const t2 = Number(m.team2Number);
            if (!Number.isInteger(t1) || !Number.isInteger(t2) || t1 < 1 || t2 < 1 || t1 === t2) return { valid: false, reason: 'invalid_match' };
            const a = Math.min(t1, t2);
            const b = Math.max(t1, t2);
            const key = `${a}-${b}`;
            if (seen.has(key)) return { valid: false, reason: 'duplicate', pair: key };
            seen.add(key);
        }
    }
    if (seen.size !== expectedPairs.size) return { valid: false, reason: 'missing_pairs', seen: seen.size, expected: expectedPairs.size };
    return { valid: true };
};

const hasAnyTeamTournamentResults = async (rootTournamentId, workspaceId) => {
    const result = await sql`
        SELECT EXISTS (
            SELECT 1
            FROM team_tournament_matchdays d
            JOIN team_tournament_matchday_matches m ON m.matchday_id = d.id
            JOIN tournaments t ON t.id = d.tournament_day_id
            WHERE d.root_tournament_id = ${rootTournamentId}
            AND t.workspace_id = ${workspaceId}
            AND m.sets IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(m.sets) s
                WHERE COALESCE((s->>'team1')::int, 0) <> 0
                   OR COALESCE((s->>'team2')::int, 0) <> 0
            )
        ) AS has_results
    `;
    return !!result?.[0]?.has_results;
};

// GET /api/data - Fetch all data
app.get('/api/data', async (req, res) => {
    try {
        await ensureTablesExist();

        const wsId = req.workspaceId;
        const [playersResult, deletedPlayersResult, matchesResult, teamMatchesResult, tournamentsResult, eloHistoryResult] = await Promise.all([
            sql`SELECT * FROM players WHERE workspace_id = ${wsId} AND (is_deleted = FALSE OR is_deleted IS NULL);`,
            sql`SELECT id, name, surname FROM players WHERE workspace_id = ${wsId} AND is_deleted = TRUE;`,
            sql`
                SELECT id, date, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, sets, winner, tournament_id, round_number 
                FROM matches 
                WHERE workspace_id = ${wsId}
                ORDER BY id ASC
            `,
            sql`
                SELECT 
                    tm.id, 
                    md.date,
                    tm.team1_players,
                    tm.team2_players,
                    tm.sets, 
                    tm.winner, 
                    md.tournament_day_id as tournament_id
                FROM team_tournament_matchday_matches tm
                JOIN team_tournament_matchdays md ON tm.matchday_id = md.id
                JOIN tournaments t ON md.tournament_day_id = t.id
                WHERE t.workspace_id = ${wsId} AND tm.cancelled = FALSE AND tm.winner IS NOT NULL
            `,
            sql`
                SELECT 
                    t.id, t.name, t.type, t.date, t.club, t.status, t.americano_fields, t.americano_scoring_type, t.final_standings, t.giornata_name, t.num_gironi,
                    t.playoff_type, t.team_tournament_root_id, t.parent_tournament_name, t.day_label,
                    c.config_completed AS team_tournament_config_completed,
                    d.round_number AS team_tournament_round_number,
                    d.team1_number AS team_tournament_team1_number,
                    d.team2_number AS team_tournament_team2_number,
                    d.phase AS team_tournament_phase,
                    CASE
                        WHEN c.schedule_json IS NOT NULL THEN jsonb_array_length(c.schedule_json->'days')
                        ELSE NULL
                    END AS team_tournament_total_days
                FROM tournaments t
                LEFT JOIN team_tournament_configs c ON c.tournament_id = COALESCE(t.team_tournament_root_id, t.id)
                LEFT JOIN team_tournament_matchdays d ON d.tournament_day_id = t.id
                WHERE t.workspace_id = ${wsId};
            `,
            sql`SELECT event_id, player_id, elo_before, elo_after, delta, date, type, source_label FROM elo_history WHERE workspace_id = ${wsId};`
        ]);

        const players = playersResult.map(p => ({
            id: p.id,
            name: p.name,
            surname: p.surname,
            position: p.position,
            initialElo: p.initial_elo,
            currentElo: p.current_elo,
        }));

        // Ghost players: soft-deleted but needed for name resolution in old matches
        const ghostPlayers = deletedPlayersResult.map(p => ({
            id: p.id,
            name: p.name,
            surname: p.surname,
            isDeleted: true,
        }));

        const tournaments = tournamentsResult.map(t => ({
            id: t.id,
            name: t.name,
            type: t.type,
            date: t.date,
            club: t.club,
            matchIds: [], // This can be populated if needed by another query
            status: t.status || 'scheduled',
            americanoFields: t.americano_fields,
            americanoScoringType: t.americano_scoring_type,
            finalStandings: t.final_standings || null,
            giornataName: t.giornata_name || null,
            parentTournamentName: t.parent_tournament_name || null,
            dayLabel: t.day_label || null,
            numGironi: t.num_gironi || null,
            playoffType: t.playoff_type || null,
            teamTournamentConfigCompleted: !!t.team_tournament_config_completed,
            teamTournamentRootId: t.team_tournament_root_id || null,
            teamTournamentRoundNumber: t.team_tournament_round_number || null,
            teamTournamentTotalDays: t.team_tournament_total_days || null,
            teamTournamentTeam1Number: t.team_tournament_team1_number ?? null,
            teamTournamentTeam2Number: t.team_tournament_team2_number ?? null,
            teamTournamentPhase: t.team_tournament_phase || null,
        }));

        const nameToIdMap = {};
        for (const p of [...players, ...ghostPlayers]) {
            const key = `${p.name.trim().toLowerCase()} ${p.surname.trim().toLowerCase()}`;
            nameToIdMap[key] = p.id;
        }

        const extractId = (item) => {
            if (!item) return null;
            if (typeof item === 'string') return item;
            if (typeof item === 'object') {
                if (item.id) return item.id;
                if (item.name && item.surname) {
                    const key = `${item.name.trim().toLowerCase()} ${item.surname.trim().toLowerCase()}`;
                    if (nameToIdMap[key]) return nameToIdMap[key];
                }
            }
            return null;
        };

        const parseSetsJson = (raw) => {
            if (!raw) return [];
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'string') {
                try {
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    return [];
                }
            }
            return [];
        };

        const normalMatches = matchesResult.map(m => ({
            id: m.id,
            date: m.date,
            team1: [m.team1_p1_id, m.team1_p2_id].filter(Boolean),
            team2: [m.team2_p1_id, m.team2_p2_id].filter(Boolean),
            sets: parseSetsJson(m.sets),
            winner: m.winner,
            tournamentId: m.tournament_id,
            roundNumber: m.round_number || undefined,
        }));

        const teamMatches = teamMatchesResult.map(m => {
            const team1 = (m.team1_players || []).map(extractId).filter(Boolean);
            const team2 = (m.team2_players || []).map(extractId).filter(Boolean);
            return {
                id: m.id,
                date: m.date,
                team1,
                team2,
                sets: parseSetsJson(m.sets),
                winner: m.winner,
                tournamentId: m.tournament_id,
            };
        });

        const matches = [...normalMatches, ...teamMatches].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const eloHistory = eloHistoryResult.map(h => ({
            eventId: h.event_id,
            playerId: h.player_id,
            eloBefore: h.elo_before,
            eloAfter: h.elo_after,
            delta: h.delta,
            date: h.date,
            type: h.type,
            sourceLabel: h.source_label
        }));

        res.json({ players, ghostPlayers, matches, tournaments, eloHistory });
    } catch (error) {
        logger.error('Failed to fetch data', error);
        res.status(500).json({ message: 'Failed to fetch data', error: error.message });
    }
});

// POST /api/tournaments/starting-elos - Get starting ELOs for a tournament
app.post('/api/tournaments/starting-elos', async (req, res) => {
    try {
        const { tournamentName, giornataName, playerIds, date } = req.body;
        
        if (!tournamentName || !playerIds || !Array.isArray(playerIds) || !date) {
            return res.status(400).json({ message: 'Missing required fields: tournamentName, playerIds, date' });
        }
        
        const searchKey = giornataName || tournamentName;
        
        // Find previous giornate of the same tournament series
        // If giornataName is provided, it's the series name, so look for tournaments with that name
        const previousGiornate = await sql`
            SELECT id, date
            FROM tournaments
            WHERE name = ${searchKey}
            AND date <= ${date}
            AND status = 'completed'
            AND workspace_id = ${req.workspaceId}
            ORDER BY date DESC, id DESC
        `;
        
        logger.debug("Starting ELOs request", { 
            tournamentName, 
            giornataName, 
            searchKey,
            previousGiornateCount: previousGiornate.length,
            playerIds: playerIds.length 
        });
        
        const startingElos = {};
        
        for (const playerId of playerIds) {
            if (previousGiornate.length > 0) {
                // Get ELO from the most recent previous giornata
                const lastGiornataId = previousGiornate[0].id;
                const eloHistoryResult = await sql`
                    SELECT elo_after
                    FROM elo_history
                    WHERE player_id = ${playerId}
                    AND event_id = ${lastGiornataId}
                    AND type = 'tournament'
                    AND workspace_id = ${req.workspaceId}
                `;
                
                if (eloHistoryResult.length > 0) {
                    startingElos[playerId] = eloHistoryResult[0].elo_after;
                    logger.debug("Player starting ELO from previous giornata", { 
                        playerId, 
                        elo: eloHistoryResult[0].elo_after 
                    });
                } else {
                    // Player didn't participate in previous giornata
                    startingElos[playerId] = 1500;
                    logger.debug("Player starting ELO (first time)", { playerId, elo: 1500 });
                }
            } else {
                // First giornata of this tournament series
                startingElos[playerId] = 1500;
                logger.debug("Player starting ELO (new tournament)", { playerId, elo: 1500 });
            }
        }
        
        logger.info("Starting ELOs calculated", { 
            tournamentName,
            giornataName,
            playersCount: Object.keys(startingElos).length 
        });
        
        res.json({ startingElos });
    } catch (error) {
        logger.error('Failed to get starting ELOs', error);
        res.status(500).json({ message: 'Failed to get starting ELOs', error: error.message });
    }
});

// GET /api/players/search - Search for players with similarity >= 70%
app.get('/api/players/search', async (req, res) => {
    try {
        const { name, surname, workspaceId } = req.query;
        if (!name || !surname || !workspaceId) {
            return res.status(400).json({ message: 'Missing query parameters' });
        }

        const players = await sql`
            SELECT id, name, surname, current_elo 
            FROM players 
            WHERE workspace_id = ${workspaceId} AND (is_deleted = FALSE OR is_deleted IS NULL)
        `;

        const candidates = [];
        const targetSurname = surname.toLowerCase();
        
        for (const p of players) {
            const targetS = targetSurname.trim();
            const pS = p.surname.toLowerCase().trim();
            let surnameSim = 0;
            
            if (targetS.length < 2 || pS.length < 2) {
                surnameSim = targetS === pS ? 1.0 : 0.0;
            } else {
                surnameSim = stringSimilarity.compareTwoStrings(targetS, pS);
                if (surnameSim === 0 && (targetS.length <= 3 || pS.length <= 3)) {
                    surnameSim = targetS === pS ? 1.0 : (levenshtein(targetS, pS) === 1 ? 0.75 : 0.0);
                }
            }
            
            if (surnameSim >= 0.70) {
                const nameSim = stringSimilarity.compareTwoStrings(name.toLowerCase(), p.name.toLowerCase());
                candidates.push({
                    player: {
                        id: p.id,
                        name: p.name,
                        surname: p.surname,
                        currentElo: p.current_elo
                    },
                    surnameSimilarity: surnameSim,
                    nameSimilarity: nameSim
                });
            }
        }

        candidates.sort((a, b) => b.surnameSimilarity - a.surnameSimilarity);
        res.json(candidates);
    } catch (error) {
        logger.error('Failed to search players', error);
        res.status(500).json({ message: 'Failed to search players', error: error.message });
    }
});

// POST /api/players - Add player
app.post('/api/players', async (req, res) => {
    try {
        const { name, surname, position, currentElo } = req.body;
        if (!name || !surname || !position) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        if (name.trim().length < 2 || surname.trim().length < 2) {
            return res.status(400).json({ message: 'Nome e cognome devono avere almeno 2 caratteri' });
        }
        
        const initialEloToSet = currentElo !== undefined ? currentElo : 1500;

        await sql`
            INSERT INTO players (name, surname, position, initial_elo, current_elo, workspace_id)
            VALUES (${name.trim()}, ${surname.trim()}, ${position}, ${initialEloToSet}, ${initialEloToSet}, ${req.workspaceId});
        `;

        logger.info('Giocatore aggiunto con successo', { name, surname, position, initialEloToSet });
        res.json({ message: 'Giocatore aggiunto con successo' });
    } catch (error) {
        logger.error('Failed to add player', error);
        res.status(500).json({ message: 'Failed to add player', error: error.message });
    }
});

// Helper: Levenshtein distance (inline, no external dependencies)
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
}

// PUT /api/players - Update player
app.put('/api/players', async (req, res) => {
    try {
        const { id, name, surname, position, currentElo, tournamentId } = req.body;
        if (!id || !name || !surname || !position || currentElo === undefined) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        if (name.trim().length < 2 || surname.trim().length < 2) {
            return res.status(400).json({ message: 'Nome e cognome devono avere almeno 2 caratteri' });
        }

        const playerResult = await sql`SELECT name, surname, current_elo FROM players WHERE id = ${id} AND workspace_id = ${req.workspaceId}`;
        if (playerResult.length === 0) {
            return res.status(404).json({ message: 'Player not found' });
        }
        const oldElo = playerResult[0].current_elo;
        const oldSurname = playerResult[0].surname;
        const newSurname = surname.trim();

        // --- Levenshtein 20% surname protection ---
        // Only enforced when the player has already played at least one match.
        // Nome (first name) is always freely editable.
        if (newSurname.toLowerCase() !== oldSurname.toLowerCase()) {
            const matchCount = await sql`
                SELECT COUNT(*) AS cnt FROM matches
                WHERE (team1_p1_id = ${id} OR team1_p2_id = ${id} OR team2_p1_id = ${id} OR team2_p2_id = ${id})
                  AND workspace_id = ${req.workspaceId}
            `;
            const hasMatches = parseInt(matchCount[0].cnt) > 0;

            if (hasMatches) {
                const dist = levenshtein(oldSurname.toLowerCase(), newSurname.toLowerCase());
                const maxLen = Math.max(oldSurname.length, newSurname.length);
                const changeRatio = dist / maxLen;

                const LEVENSHTEIN_SAFEGUARD = 2;  // always allow minor typo fixes (<=2 chars)
                const RATIO_MAX = 0.20;            // 20% maximum change allowed

                if (dist > LEVENSHTEIN_SAFEGUARD && changeRatio > RATIO_MAX) {
                    return res.status(400).json({
                        message: `Il cognome non può essere modificato radicalmente. La modifica "${oldSurname}" → "${newSurname}" supera il limite del 20% (variazione: ${Math.round(changeRatio * 100)}%, distanza: ${dist} caratteri). Solo correzioni ortografiche minori sono consentite.`,
                        levenshteinDistance: dist,
                        changeRatio: Math.round(changeRatio * 100)
                    });
                }
            }
        }
        // --- End Levenshtein check ---

        await sql`
            UPDATE players
            SET name = ${name.trim()}, surname = ${newSurname}, position = ${position}, current_elo = ${currentElo}
            WHERE id = ${id} AND workspace_id = ${req.workspaceId}
        `;

        if (oldElo !== currentElo) {
            const delta = currentElo - oldElo;
            logger.eloChange(id, oldElo, currentElo, delta, 'manual update');

            if (tournamentId) {
                // Update also the tournament's elo_history: add a manual record linked to that tournament
                // so the tournament-filtered ranking reflects the change too
                await sql`
                    INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id, source_label)
                    VALUES (${tournamentId}, ${id}, ${oldElo}, ${currentElo}, ${delta}, NOW(), 'manual', ${req.workspaceId}, 'Aggiornamento Manuale')
                `;
                logger.info('Manual ELO update linked to tournament', { playerId: id, tournamentId, delta });
            } else {
                // Global-only update: random event_id, not linked to any tournament
                await sql`
                    INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id, source_label)
                    VALUES (gen_random_uuid(), ${id}, ${oldElo}, ${currentElo}, ${delta}, NOW(), 'manual', ${req.workspaceId}, 'Aggiornamento Manuale')
                `;
            }
        }

        logger.info('Giocatore aggiornato con successo', { id, name, surname, tournamentId: tournamentId || 'global' });
        res.json({ message: 'Giocatore aggiornato con successo' });
    } catch (error) {
        logger.error('Failed to update player', error);
        res.status(500).json({ message: 'Failed to update player', error: error.message });
    }
});

// DELETE /api/players - Delete player
app.delete('/api/players', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ message: 'Player ID is required' });
        }
        
        // Soft delete the player
        await sql`UPDATE players SET is_deleted = TRUE WHERE id = ${id} AND workspace_id = ${req.workspaceId};`;
        
        // Delete their ELO history
        await sql`DELETE FROM elo_history WHERE player_id = ${id};`;

        // Remove the player from any team_tournament_teams JSONB arrays
        await sql`
            UPDATE team_tournament_teams
            SET players = (
                SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                FROM jsonb_array_elements(players) elem
                WHERE elem::text <> ${JSON.stringify(id)}::text
            )
            WHERE players @> ${JSON.stringify([id])}::jsonb;
        `;

        logger.info('Giocatore eliminato (soft) con successo', { id });
        res.json({ message: 'Giocatore eliminato con successo' });
    } catch (error) {
        logger.error('Failed to delete player', error);
        res.status(500).json({ message: 'Failed to delete player', error: error.message });
    }
});

// POST /api/matches - Add match
app.post('/api/matches', async (req, res) => {
    try {
        const { date, team1, team2, sets, winner, tournamentId, roundNumber } = req.body;
        if (!date || !team1 || !team2 || !sets) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const result = await sql`
            INSERT INTO matches (date, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, sets, winner, tournament_id, workspace_id, round_number)
            VALUES (${date}, ${team1[0]}, ${team1[1]}, ${team2[0]}, ${team2[1]}, ${JSON.stringify(sets)}, ${winner}, ${tournamentId || null}, ${req.workspaceId}, ${roundNumber || null})
            RETURNING id
        `;
        const matchId = result[0].id;

        // Skip ELO calculation if this match is part of a tournament
        // (ELO will be calculated by /api/tournaments/complete)
        if (tournamentId) {
            logger.match('create', matchId, { tournamentId, status: 'ELO pending' });
            return res.json({ matchId, message: 'Match added to tournament (ELO pending)' });
        }

        // Simple ELO calculation (you can implement the full logic here)
        const allPlayerIds = [...team1, ...team2];
        const playersResult = await sql`SELECT id, current_elo FROM players WHERE id = ANY(${allPlayerIds}::uuid[]) AND workspace_id = ${req.workspaceId}`;
        const playersData = playersResult.reduce((acc, row) => ({ ...acc, [row.id]: row.current_elo }), {});

        const team1EloAvg = (playersData[team1[0]] + playersData[team1[1]]) / 2;
        const team2EloAvg = (playersData[team2[0]] + playersData[team2[1]]) / 2;
        const score1 = winner === 'team1' ? 1 : 0;
        
        // ELO calculation using configured K-factors for Friendly Match
        const { delta1, delta2 } = calculateEloChange(team1EloAvg, team2EloAvg, score1, 'Friendly Match');
        
        logger.match('create', matchId, { 
            type: 'Friendly Match',
            team1Delta: delta1.toFixed(2), 
            team2Delta: delta2.toFixed(2),
            kFactor: 20
        });
        
        // Update player ELOs
        for (const playerId of team1) {
            const playerResult = await sql`SELECT current_elo FROM players WHERE id = ${playerId} AND workspace_id = ${req.workspaceId}`;
            const oldElo = playerResult[0].current_elo;
            const newElo = oldElo + delta1;

            logger.eloChange(playerId, oldElo, newElo, delta1, 'friendly match - team1');
            await sql`UPDATE players SET current_elo = ${newElo} WHERE id = ${playerId} AND workspace_id = ${req.workspaceId}`;
            await sql`
                INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id)
                VALUES (${matchId}, ${playerId}, ${oldElo}, ${newElo}, ${delta1}, ${date}, 'match', ${req.workspaceId})
            `;
        }

        for (const playerId of team2) {
            const playerResult = await sql`SELECT current_elo FROM players WHERE id = ${playerId} AND workspace_id = ${req.workspaceId}`;
            const oldElo = playerResult[0].current_elo;
            const newElo = oldElo + delta2;

            logger.eloChange(playerId, oldElo, newElo, delta2, 'friendly match - team2');
            await sql`UPDATE players SET current_elo = ${newElo} WHERE id = ${playerId} AND workspace_id = ${req.workspaceId}`;
            await sql`
                INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id)
                VALUES (${matchId}, ${playerId}, ${oldElo}, ${newElo}, ${delta2}, ${date}, 'match', ${req.workspaceId})
            `;
        }

        res.json({ message: 'Match added and ELO updated successfully', matchId });
    } catch (error) {
        logger.error('Failed to add match', error);
        res.status(500).json({ message: 'Failed to add match', error: error.message });
    }
});

// DELETE /api/matches - Delete match
// PUT /api/matches - Update match scores
app.put('/api/matches', async (req, res) => {
    try {
        const { matchUpdates } = req.body;
        if (!matchUpdates || !Array.isArray(matchUpdates)) {
            return res.status(400).json({ message: 'Match updates array is required' });
        }
        
        logger.info('Updating match scores', { count: matchUpdates.length });
        
        for (const update of matchUpdates) {
            const { matchId, sets, winner: providedWinner } = update;
            if (!matchId || !sets || !Array.isArray(sets)) {
                logger.warn('Invalid match update data', { matchId });
                continue;
            }
            
            // Calculate team games for logging/stats
            const team1Games = sets.reduce((sum, set) => sum + set.team1, 0);
            const team2Games = sets.reduce((sum, set) => sum + set.team2, 0);
            
            // Use provided winner if available, otherwise fallback to games (legacy behavior)
            let winner = providedWinner;
            if (!winner) {
                if (team1Games === team2Games) {
                    winner = 'draw';
                } else {
                    winner = team1Games > team2Games ? 'team1' : 'team2';
                }
            }
            
            // Update match with sets and winner
            await sql`
                UPDATE matches
                SET sets = ${JSON.stringify(sets)}, winner = ${winner}
                WHERE id = ${matchId} AND workspace_id = ${req.workspaceId}
            `;
            
            logger.match('update', matchId, { winner, team1Games, team2Games });
        }
        
        logger.info('Partite aggiornate con successo', { count: matchUpdates.length });
        res.json({ message: 'Partite aggiornate con successo' });
    } catch (error) {
        logger.error('Failed to update matches', error);
        res.status(500).json({ message: 'Failed to update matches', error: error.message });
    }
});

app.delete('/api/matches', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ message: 'Match ID is required' });
        }
        
        logger.match('delete', id, { action: 'reverting ELO changes' });
        
        // First, get the ELO history for this match to revert the changes
        const eloHistoryResult = await sql`
            SELECT player_id, elo_before, elo_after, delta
            FROM elo_history
            WHERE event_id = ${id} AND type = 'match' AND workspace_id = ${req.workspaceId}
        `;
        
        logger.debug('ELO history records found', { matchId: id, count: eloHistoryResult.length });
        
        // Revert ELO changes for each player
        for (const history of eloHistoryResult) {
            // Get current ELO of the player
            const currentPlayerResult = await sql`
                SELECT current_elo FROM players WHERE id = ${history.player_id}
            `;
            const currentElo = currentPlayerResult[0].current_elo;
            
            // Calculate new ELO by subtracting the delta from this match
            const newElo = currentElo - history.delta;
            
            logger.eloChange(history.player_id, currentElo, newElo, -history.delta, 'match deletion (revert)');
            
            await sql`
                UPDATE players
                SET current_elo = ${newElo}
                WHERE id = ${history.player_id} AND workspace_id = ${req.workspaceId}
            `;
        }

        // Delete ELO history associated with this match
        await sql`DELETE FROM elo_history WHERE event_id = ${id} AND workspace_id = ${req.workspaceId}`;

        // Delete the match itself
        await sql`DELETE FROM matches WHERE id = ${id} AND workspace_id = ${req.workspaceId}`;

        logger.match('delete', id, { revertedPlayers: eloHistoryResult.length, status: 'completed' });
        res.json({ 
            message: 'Match deleted and ELO ratings reverted successfully.',
            revertedPlayers: eloHistoryResult.length
        });
    } catch (error) {
        logger.error('Failed to delete match', error);
        res.status(500).json({ message: 'Failed to delete match', error: error.message });
    }
});

// PUT /api/tournaments - Update tournament
app.put('/api/tournaments', async (req, res) => {
    try {
        const { id, name, club, date } = req.body;
        if (!id || !name || !club || !date) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // If this is a team tournament root, renaming it must also rename the linked "giornate"
        // (child tournaments grouped by giornata_name) otherwise the UI will show two "tournaments".
        const existing = await sql`
            SELECT id, type, giornata_name, team_tournament_root_id
            FROM tournaments
            WHERE id = ${id}
            AND workspace_id = ${req.workspaceId}
            LIMIT 1
        `;
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Torneo non trovato' });
        }
        const rootId = existing[0].team_tournament_root_id || existing[0].id;
        const isTeamTournamentRoot =
            existing[0].type === 'Torneo a Squadre' &&
            (existing[0].giornata_name === null || existing[0].giornata_name === undefined) &&
            String(rootId) === String(existing[0].id);
        
        await sql`
            UPDATE tournaments SET name = ${name}, club = ${club}, date = ${date}
            WHERE id = ${id} AND workspace_id = ${req.workspaceId};
        `;

        if (isTeamTournamentRoot) {
            await sql`
                UPDATE tournaments
                SET name = ${name},
                    club = ${club},
                    giornata_name = ${name}
                WHERE team_tournament_root_id = ${rootId}
                AND id <> ${rootId}
                AND workspace_id = ${req.workspaceId}
            `;
        }

        logger.tournament('update', id, { name, club });
        res.json({ message: 'Torneo aggiornato con successo' });
    } catch (error) {
        logger.error('Failed to update tournament', error);
        res.status(500).json({ message: 'Failed to update tournament', error: error.message });
    }
});

app.put('/api/tournaments/series/name', async (req, res) => {
    try {
        const { oldName, newName } = req.body;
        if (!oldName || !newName) return res.status(400).json({ message: 'Missing required fields' });

        await sql`
            UPDATE tournaments 
            SET giornata_name = ${newName}
            WHERE (giornata_name = ${oldName} OR name = ${oldName})
            AND workspace_id = ${req.workspaceId}
        `;

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to rename series', error);
        res.status(500).json({ message: 'Errore nell\'aggiornamento del nome serie', error: error.message });
    }
});

// DELETE /api/tournaments - Delete tournament
app.delete('/api/tournaments', async (req, res) => {
    try {
        const { id, deleteIsolatedPlayers } = req.body;
        if (!id) {
            return res.status(400).json({ message: 'Tournament ID is required' });
        }

        const existingTournament = await sql`
            SELECT id, type, giornata_name, team_tournament_root_id
            FROM tournaments
            WHERE id = ${id}
              AND workspace_id = ${req.workspaceId}
            LIMIT 1
        `;
        if (existingTournament.length === 0) {
            return res.status(404).json({ message: 'Torneo non trovato' });
        }

        const currentTournament = existingTournament[0];

        if (currentTournament.type === 'Torneo a Squadre') {
            const rootId = currentTournament.team_tournament_root_id || currentTournament.id;
            const isRoot = String(rootId) === String(currentTournament.id) && !currentTournament.giornata_name;

            // Root delete: remove the whole team tournament series.
            if (isRoot) {
                await sql`
                    DELETE FROM tournaments
                    WHERE id = ${currentTournament.id}
                      AND workspace_id = ${req.workspaceId}
                `;
                return res.json({ message: 'Team tournament deleted successfully' });
            }

            const matchdayRows = await sql`
                SELECT id, phase
                FROM team_tournament_matchdays
                WHERE tournament_day_id = ${id}
                LIMIT 1
            `;

            if (matchdayRows.length === 0) {
                await sql`
                    DELETE FROM tournaments
                    WHERE id = ${id}
                      AND workspace_id = ${req.workspaceId}
                `;
                return res.json({ message: 'Team tournament day deleted successfully' });
            }

            const matchday = matchdayRows[0];

            // We intentionally do NOT return here, so that the code below
            // will find the matches of THIS matchday (id) and delete them + revert ELO!
            let customMessage = '';
            
            if ((matchday.phase || 'round_robin') === 'round_robin') {
                await deleteTeamTournamentPlayoffState(rootId, req.workspaceId);
                customMessage = 'Giornata Round Robin eliminata e fase finale ripristinata con successo';
            } else {
                const fixtureRows = await sql`
                    SELECT id
                    FROM team_tournament_fixtures
                    WHERE matchday_id = ${matchday.id}
                    LIMIT 1
                `;
                if (fixtureRows.length > 0) {
                    await resetTeamTournamentFixtureBranch(rootId, req.workspaceId, fixtureRows[0].id);
                }
                customMessage = 'Playoff matchday deleted and bracket reset successfully';
            }
            
            // Now we set a flag so the rest of the endpoint knows to return customMessage
            req.customTeamTournamentMessage = customMessage;
        }
        
        logger.tournament("delete", id, { action: "deleting" });
        
        // First, get all matches in this tournament to revert their ELO changes
        const matchesResult = await sql`
            SELECT id FROM matches WHERE tournament_id = ${id} AND workspace_id = ${req.workspaceId}
        `;

        logger.debug("Tournament matches found", { tournamentId: id, count: matchesResult.length });

        let totalReverted = 0;

        // Revert ELO changes for tournament (all matches use tournamentId as event_id)
        const eloHistoryResult = await sql`
            SELECT player_id, elo_before, elo_after, delta
            FROM elo_history
            WHERE event_id = ${id} AND type = 'tournament' AND workspace_id = ${req.workspaceId}
        `;
        
        logger.debug("ELO history records found for tournament", { tournamentId: id, count: eloHistoryResult.length });
        
        // Revert ELO changes for each player in the tournament
        for (const history of eloHistoryResult) {
            // Get current ELO of the player
            const currentPlayerResult = await sql`
                SELECT current_elo FROM players WHERE id = ${history.player_id}
            `;
            const currentElo = currentPlayerResult[0].current_elo;
            
            // Calculate new ELO by subtracting the delta from this tournament
            const newElo = currentElo - history.delta;
            
            logger.eloChange(history.player_id, currentElo, newElo, -history.delta, "tournament deletion (revert)");
            
            await sql`
                UPDATE players
                SET current_elo = ${newElo}
                WHERE id = ${history.player_id} AND workspace_id = ${req.workspaceId}
            `;
            totalReverted++;
        }

        // Delete ELO history for the tournament
        await sql`DELETE FROM elo_history WHERE event_id = ${id} AND type = 'tournament' AND workspace_id = ${req.workspaceId}`;

        // Using ON DELETE CASCADE on the matches table will automatically delete them
        await sql`DELETE FROM tournaments WHERE id = ${id} AND workspace_id = ${req.workspaceId};`;

        let deletedIsolatedPlayersCount = 0;
        const playerIdsToCheck = new Set(eloHistoryResult.map(h => h.player_id));
        
        // Also collect players from matches inside the tournament in case they haven't received a final tournament ELO yet
        const matchPlayers = await sql`
            SELECT DISTINCT p_id FROM (
                SELECT team1_p1_id as p_id FROM matches WHERE tournament_id = ${id} AND workspace_id = ${req.workspaceId}
                UNION SELECT team1_p2_id FROM matches WHERE tournament_id = ${id} AND workspace_id = ${req.workspaceId}
                UNION SELECT team2_p1_id FROM matches WHERE tournament_id = ${id} AND workspace_id = ${req.workspaceId}
                UNION SELECT team2_p2_id FROM matches WHERE tournament_id = ${id} AND workspace_id = ${req.workspaceId}
            ) as players WHERE p_id IS NOT NULL
        `;
        matchPlayers.forEach(p => playerIdsToCheck.add(p.p_id));

        if (deleteIsolatedPlayers && playerIdsToCheck.size > 0) {
            const playerIdsArray = Array.from(playerIdsToCheck);
            const deletedPlayers = await sql`
                DELETE FROM players
                WHERE workspace_id = ${req.workspaceId}
                AND id = ANY(${playerIdsArray}::uuid[])
                AND id NOT IN (
                    SELECT DISTINCT player_id FROM elo_history WHERE workspace_id = ${req.workspaceId}
                )
                AND id NOT IN (
                    SELECT team1_p1_id FROM matches WHERE team1_p1_id IS NOT NULL AND workspace_id = ${req.workspaceId}
                    UNION SELECT team1_p2_id FROM matches WHERE team1_p2_id IS NOT NULL AND workspace_id = ${req.workspaceId}
                    UNION SELECT team2_p1_id FROM matches WHERE team2_p1_id IS NOT NULL AND workspace_id = ${req.workspaceId}
                    UNION SELECT team2_p2_id FROM matches WHERE team2_p2_id IS NOT NULL AND workspace_id = ${req.workspaceId}
                )
                AND id NOT IN (
                    SELECT (elem)::uuid FROM team_tournament_teams, jsonb_array_elements_text(players) elem WHERE elem ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                )
                RETURNING id
            `;
            deletedIsolatedPlayersCount = deletedPlayers.length;
            logger.info("Deleted isolated players", { count: deletedIsolatedPlayersCount });
        }

        logger.tournament("delete", id, { revertedPlayers: totalReverted, deletedIsolatedPlayers: deletedIsolatedPlayersCount, status: "completed" });
        res.json({ 
            message: req.customTeamTournamentMessage || 'Tournament deleted and all ELO ratings reverted successfully',
            revertedPlayers: totalReverted,
            deletedIsolatedPlayers: deletedIsolatedPlayersCount
        });
    } catch (error) {
        logger.error("Failed to delete tournament", error);
        res.status(500).json({ message: 'Failed to delete tournament', error: error.message });
    }
});

// DELETE /api/tournaments/series - Delete a series of tournaments by giornata_name
app.delete('/api/tournaments/series', async (req, res) => {
    try {
        const { giornataName, deleteIsolatedPlayers } = req.body;
        if (!giornataName) {
            return res.status(400).json({ message: 'Giornata Name is required' });
        }

        const existingTournaments = await sql`
            SELECT id
            FROM tournaments
            WHERE (giornata_name = ${giornataName} OR name = ${giornataName})
              AND workspace_id = ${req.workspaceId}
        `;
        if (existingTournaments.length === 0) {
            return res.status(404).json({ message: 'Nessun torneo trovato per questa serie' });
        }

        let totalReverted = 0;
        let deletedIsolatedPlayersCount = 0;
        let allPlayerIdsToCheck = new Set();

        for (const t of existingTournaments) {
            const id = t.id;
            
            const eloHistoryResult = await sql`
                SELECT player_id, elo_before, elo_after, delta
                FROM elo_history
                WHERE event_id = ${id} AND type = 'tournament' AND workspace_id = ${req.workspaceId}
            `;
            
            for (const history of eloHistoryResult) {
                allPlayerIdsToCheck.add(history.player_id);
                const currentPlayerResult = await sql`
                    SELECT current_elo FROM players WHERE id = ${history.player_id}
                `;
                const currentElo = currentPlayerResult[0].current_elo;
                const newElo = currentElo - history.delta;
                
                await sql`
                    UPDATE players
                    SET current_elo = ${newElo}
                    WHERE id = ${history.player_id} AND workspace_id = ${req.workspaceId}
                `;
                totalReverted++;
            }

            await sql`DELETE FROM elo_history WHERE event_id = ${id} AND type = 'tournament' AND workspace_id = ${req.workspaceId}`;
            
            // Collect players from matches before CASCADE deletes them
            const matchPlayers = await sql`
                SELECT DISTINCT p_id FROM (
                    SELECT team1_p1_id as p_id FROM matches WHERE tournament_id = ${id} AND workspace_id = ${req.workspaceId}
                    UNION SELECT team1_p2_id FROM matches WHERE tournament_id = ${id} AND workspace_id = ${req.workspaceId}
                    UNION SELECT team2_p1_id FROM matches WHERE tournament_id = ${id} AND workspace_id = ${req.workspaceId}
                    UNION SELECT team2_p2_id FROM matches WHERE tournament_id = ${id} AND workspace_id = ${req.workspaceId}
                ) as players WHERE p_id IS NOT NULL
            `;
            matchPlayers.forEach(p => allPlayerIdsToCheck.add(p.p_id));

            await sql`DELETE FROM tournaments WHERE id = ${id} AND workspace_id = ${req.workspaceId};`;
        }

        if (deleteIsolatedPlayers && allPlayerIdsToCheck.size > 0) {
            const playerIdsArray = Array.from(allPlayerIdsToCheck);
            const deletedPlayers = await sql`
                DELETE FROM players
                WHERE workspace_id = ${req.workspaceId}
                AND id = ANY(${playerIdsArray}::uuid[])
                AND id NOT IN (
                    SELECT DISTINCT player_id FROM elo_history WHERE workspace_id = ${req.workspaceId}
                )
                AND id NOT IN (
                    SELECT team1_p1_id FROM matches WHERE team1_p1_id IS NOT NULL AND workspace_id = ${req.workspaceId}
                    UNION SELECT team1_p2_id FROM matches WHERE team1_p2_id IS NOT NULL AND workspace_id = ${req.workspaceId}
                    UNION SELECT team2_p1_id FROM matches WHERE team2_p1_id IS NOT NULL AND workspace_id = ${req.workspaceId}
                    UNION SELECT team2_p2_id FROM matches WHERE team2_p2_id IS NOT NULL AND workspace_id = ${req.workspaceId}
                )
                AND id NOT IN (
                    SELECT (elem)::uuid FROM team_tournament_teams, jsonb_array_elements_text(players) elem WHERE elem ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                )
                RETURNING id
            `;
            deletedIsolatedPlayersCount = deletedPlayers.length;
        }

        res.json({ 
            message: 'Serie eliminata con successo',
            revertedPlayers: totalReverted,
            deletedIsolatedPlayers: deletedIsolatedPlayersCount
        });
    } catch (error) {
        logger.error("Failed to delete tournament series", error);
        res.status(500).json({ message: 'Failed to delete tournament series', error: error.message });
    }
});

// POST /api/team-tournaments - Create a new team tournament shell
app.post('/api/team-tournaments', async (req, res) => {
    try {
        const { name, club, initialTeamCount, defaultPlayersPerTeam, date, format, matchesPerDay, roundRobinFinalPhase, scoringType } = req.body;

        if (!name || !club || !initialTeamCount || !defaultPlayersPerTeam) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const teamCount = parseInt(initialTeamCount, 10);
        const playersPerTeam = parseInt(defaultPlayersPerTeam, 10);

        if (Number.isNaN(teamCount) || teamCount < 2) {
            return res.status(400).json({ message: 'Numero squadre non valido' });
        }

        if (Number.isNaN(playersPerTeam) || playersPerTeam < 1) {
            return res.status(400).json({ message: 'Giocatori per squadra non valido' });
        }
        const normalizedMatchesPerDay = [3, 5].includes(Number(matchesPerDay)) ? Number(matchesPerDay) : 3;
        if (normalizedMatchesPerDay === 5 && playersPerTeam < 8) {
            return res.status(400).json({ message: '5 partite per giornata richiedono almeno 8 giocatori per squadra' });
        }

        const allowedFormats = ['ROUND ROBIN', 'ANDATA E RITORNO', 'ELIMINAZIONE DIRETTA'];
        const teamTournamentFormat = allowedFormats.includes(format) ? format : 'ROUND ROBIN';
        const allowedRoundRobinFinalPhases = ['FINALI', 'SEMIFINALI E FINALI', 'QUARTI, SEMIFINALI E FINALI'];
        const normalizedRoundRobinFinalPhase = teamTournamentFormat === 'ELIMINAZIONE DIRETTA'
            ? null
            : (allowedRoundRobinFinalPhases.includes(roundRobinFinalPhase) ? roundRobinFinalPhase : 'FINALI');

        if (normalizedRoundRobinFinalPhase === 'QUARTI, SEMIFINALI E FINALI' && teamCount < 8) {
            return res.status(400).json({ message: 'Per i quarti di finale servono almeno 8 squadre' });
        }
        const allowedScoringTypes = ['Punti', 'Differenza Games', 'Punti + Resilienza'];
        const normalizedScoringType = allowedScoringTypes.includes(scoringType) ? scoringType : 'Punti';

        const tournamentDate = date ? new Date(date).toISOString() : new Date().toISOString();

        const tournamentResult = await sql`
            INSERT INTO tournaments (name, type, date, club, status, workspace_id)
            VALUES (${name}, ${'Torneo a Squadre'}, ${tournamentDate}, ${club}, ${'scheduled'}, ${req.workspaceId})
            RETURNING id, name, type, date, club, status
        `;

        const tournament = tournamentResult[0];

        // Mark this tournament row as the root for its future "giornate"
        try {
            await sql`
                UPDATE tournaments
                SET team_tournament_root_id = ${tournament.id}
                WHERE id = ${tournament.id}
                AND workspace_id = ${req.workspaceId}
            `;
        } catch (error) {
            logger.debug('Failed to set team_tournament_root_id for new team tournament', { message: error.message });
        }

        await sql`
            INSERT INTO team_tournament_configs (tournament_id, initial_team_count, default_players_per_team, format, matches_per_day, round_robin_final_phase, scoring_type, schedule_json)
            VALUES (${tournament.id}, ${teamCount}, ${playersPerTeam}, ${teamTournamentFormat}, ${normalizedMatchesPerDay}, ${normalizedRoundRobinFinalPhase}, ${normalizedScoringType}, ${null})
        `;

        for (let teamNumber = 1; teamNumber <= teamCount; teamNumber++) {
            await sql`
                INSERT INTO team_tournament_teams (tournament_id, team_number, name, target_player_count)
                VALUES (${tournament.id}, ${teamNumber}, ${`Squadra ${teamNumber}`}, ${playersPerTeam})
            `;
        }

        logger.info('Team tournament created', {
            tournamentId: tournament.id,
            name,
            teamCount,
            playersPerTeam,
            workspaceId: req.workspaceId
        });

        res.json({
            tournament: {
                id: tournament.id,
                name: tournament.name,
                type: tournament.type,
                date: tournament.date,
                club: tournament.club,
                matchIds: [],
                status: tournament.status
            },
            config: {
                tournamentId: tournament.id,
                initialTeamCount: teamCount,
                defaultPlayersPerTeam: playersPerTeam,
                format: teamTournamentFormat,
                matchesPerDay: normalizedMatchesPerDay,
                roundRobinFinalPhase: normalizedRoundRobinFinalPhase,
                scoringType: normalizedScoringType,
                schedule: null
            }
        });
    } catch (error) {
        logger.error('Failed to create team tournament', error);
        res.status(500).json({ message: 'Errore nella creazione del torneo a squadre', error: error.message });
    }
});

app.get('/api/team-tournaments/:id/config', async (req, res) => {
    try {
        const { id } = req.params;

        const configResult = await sql`
            SELECT c.tournament_id, c.initial_team_count, c.default_players_per_team, c.format, c.matches_per_day, c.round_robin_final_phase, c.scoring_type, c.config_completed, c.schedule_json
            FROM team_tournament_configs c
            JOIN tournaments t ON t.id = c.tournament_id
            WHERE c.tournament_id = ${id}
            AND t.workspace_id = ${req.workspaceId}
            AND t.type = ${'Torneo a Squadre'}
            LIMIT 1
        `;

        if (configResult.length === 0) {
            return res.status(404).json({ message: 'Configurazione torneo a squadre non trovata' });
        }

        const normalizedMatchesPerDay = (configResult[0].default_players_per_team < 8) ? 3 : (configResult[0].matches_per_day || 3);
        const hasResults = await hasAnyTeamTournamentResults(id, req.workspaceId);
        let scheduleJson = configResult[0].schedule_json || null;

        // If the stored schedule is invalid (duplicates/missing pairs),
        // regenerate it to enforce "all vs all once" and re-map round_number for existing matchdays.
        try {
            const format = configResult[0].format || 'ROUND ROBIN';
            if (format === 'ROUND ROBIN') {
                const validation = validateRoundRobinSchedule(scheduleJson, Number(configResult[0].initial_team_count));
                if (!validation.valid) {
                    scheduleJson = generateRoundRobinSchedule(Number(configResult[0].initial_team_count));
                    await sql`
                        UPDATE team_tournament_configs
                        SET schedule_json = ${JSON.stringify(scheduleJson)}::jsonb,
                            updated_at = NOW()
                        WHERE tournament_id = ${id}
                    `;

                    // Recompute round_number for existing round robin matchdays based on the new schedule.
                    const mds = await sql`
                        SELECT d.id, d.team1_number, d.team2_number
                        FROM team_tournament_matchdays d
                        JOIN tournaments t ON t.id = d.tournament_day_id
                        WHERE d.root_tournament_id = ${id}
                          AND t.workspace_id = ${req.workspaceId}
                          AND d.phase = 'round_robin'
                    `;
                    for (const md of mds) {
                        const rn = findRoundNumberForTeams(scheduleJson, Number(md.team1_number), Number(md.team2_number));
                        await sql`UPDATE team_tournament_matchdays SET round_number=${rn}, updated_at=NOW() WHERE id=${md.id}`;
                    }

                    logger.warn('Regenerated invalid round robin schedule', {
                        tournamentId: id,
                        reason: validation.reason,
                        remappedMatchdays: mds.length
                    });
                }
            }
        } catch (e) {
            logger.warn('Round robin schedule validation/regeneration failed', { message: e?.message || String(e), tournamentId: id });
        }

        res.json({
            config: {
                tournamentId: configResult[0].tournament_id,
                initialTeamCount: configResult[0].initial_team_count,
                defaultPlayersPerTeam: configResult[0].default_players_per_team,
                format: configResult[0].format || 'ROUND ROBIN',
                matchesPerDay: normalizedMatchesPerDay,
                roundRobinFinalPhase: configResult[0].round_robin_final_phase || null,
                scoringType: configResult[0].scoring_type || 'Punti',
                configCompleted: !!configResult[0].config_completed,
                schedule: scheduleJson,
                hasResults
            }
        });
    } catch (error) {
        logger.error('Failed to fetch team tournament config', error);
        res.status(500).json({ message: 'Errore nel recupero configurazione torneo a squadre', error: error.message });
    }
});

app.put('/api/team-tournaments/:id/config', async (req, res) => {
    try {
        console.log("PUT CONFIG RECEIVED BODY:", req.body);
        const { id } = req.params;
        const { initialTeamCount, defaultPlayersPerTeam, format, matchesPerDay, roundRobinFinalPhase, scoringType } = req.body;

        const teamCount = parseInt(initialTeamCount, 10);
        const playersPerTeam = parseInt(defaultPlayersPerTeam, 10);

        if (Number.isNaN(teamCount) || teamCount < 2) {
            return res.status(400).json({ message: 'Numero squadre non valido' });
        }

        if (Number.isNaN(playersPerTeam) || playersPerTeam < 1) {
            return res.status(400).json({ message: 'Giocatori per squadra non valido' });
        }
        const normalizedMatchesPerDay = [3, 5].includes(Number(matchesPerDay)) ? Number(matchesPerDay) : 3;
        if (normalizedMatchesPerDay === 5 && playersPerTeam < 8) {
            return res.status(400).json({ message: '5 partite per giornata richiedono almeno 8 giocatori per squadra' });
        }

        const allowedFormats = ['ROUND ROBIN', 'ANDATA E RITORNO', 'ELIMINAZIONE DIRETTA'];
        const teamTournamentFormat = allowedFormats.includes(format) ? format : 'ROUND ROBIN';
        const allowedRoundRobinFinalPhases = ['FINALI', 'SEMIFINALI E FINALI', 'QUARTI, SEMIFINALI E FINALI'];
        const normalizedRoundRobinFinalPhase = teamTournamentFormat === 'ELIMINAZIONE DIRETTA'
            ? null
            : (allowedRoundRobinFinalPhases.includes(roundRobinFinalPhase) ? roundRobinFinalPhase : 'FINALI');

        if (normalizedRoundRobinFinalPhase === 'QUARTI, SEMIFINALI E FINALI' && teamCount < 8) {
            return res.status(400).json({ message: 'Per i quarti di finale servono almeno 8 squadre' });
        }
        const allowedScoringTypes = ['Punti', 'Differenza Games', 'Punti + Resilienza'];
        const normalizedScoringType = allowedScoringTypes.includes(scoringType) ? scoringType : 'Punti';

        const tournamentResult = await sql`
            SELECT id
            FROM tournaments
            WHERE id = ${id}
            AND workspace_id = ${req.workspaceId}
            AND type = ${'Torneo a Squadre'}
            LIMIT 1
        `;

        if (tournamentResult.length === 0) {
            return res.status(404).json({ message: 'Torneo a squadre non trovato' });
        }

        const existingConfigResult = await sql`
            SELECT initial_team_count, default_players_per_team, format, scoring_type
            FROM team_tournament_configs
            WHERE tournament_id = ${id}
            LIMIT 1
        `;

        if (existingConfigResult.length === 0) {
            return res.status(404).json({ message: 'Configurazione torneo a squadre non trovata' });
        }

        const previousTeamCount = existingConfigResult[0].initial_team_count;
        const previousPlayersPerTeam = existingConfigResult[0].default_players_per_team;
        const previousFormat = existingConfigResult[0].format || 'ROUND ROBIN';
        const previousScoringType = existingConfigResult[0].scoring_type || 'Punti';

        const hasResults = await hasAnyTeamTournamentResults(id, req.workspaceId);
        if (hasResults) {
            if (teamTournamentFormat !== previousFormat) {
                return res.status(400).json({ message: 'Non puoi modificare il tipo torneo dopo aver inserito almeno un risultato.' });
            }
            if (playersPerTeam !== previousPlayersPerTeam) {
                return res.status(400).json({ message: 'Non puoi modificare i giocatori per squadra dopo aver inserito almeno un risultato.' });
            }
        }

        // If playoffs already started, lock scoring changes (otherwise standings/fixtures would shift underfoot).
        if (normalizedScoringType !== previousScoringType) {
            const startedFx = await sql`
                SELECT 1
                FROM team_tournament_fixtures f
                JOIN tournaments t ON t.id = f.root_tournament_id
                WHERE f.root_tournament_id = ${id}
                  AND t.workspace_id = ${req.workspaceId}
                  AND f.status <> 'planned'
                LIMIT 1
            `;
            if (startedFx.length > 0) {
                return res.status(400).json({ message: 'Non puoi modificare il tipo punteggio dopo aver avviato la fase finale.' });
            }
        }

        await sql`
            UPDATE team_tournament_configs
            SET initial_team_count = ${teamCount},
                default_players_per_team = ${playersPerTeam},
                format = ${teamTournamentFormat},
                matches_per_day = ${normalizedMatchesPerDay},
                round_robin_final_phase = ${normalizedRoundRobinFinalPhase},
                scoring_type = ${normalizedScoringType},
                schedule_json = ${teamTournamentFormat === 'ROUND ROBIN' ? JSON.stringify(generateRoundRobinSchedule(teamCount)) : null}::jsonb,
                updated_at = NOW()
            WHERE tournament_id = ${id}
        `;

        // If scoring type changed, recalculate all matchday summaries to reflect new scoring rules, and regenerate planned fixtures.
        if (normalizedScoringType !== previousScoringType) {
            const matchdaysToRecalculate = await sql`
                SELECT id, matches_per_day
                FROM team_tournament_matchdays
                WHERE root_tournament_id = ${id}
            `;
            for (const md of matchdaysToRecalculate) {
                const subMatches = await sql`
                    SELECT match_index, sets, winner, cancelled
                    FROM team_tournament_matchday_matches
                    WHERE matchday_id = ${md.id}
                    ORDER BY match_index ASC
                `;
                if (subMatches.length > 0) {
                    const winners = [];
                    const allSets = [];
                    for (const sm of subMatches) {
                        if (sm.cancelled) {
                            winners.push(null);
                            allSets.push(null);
                            continue;
                        }
                        const sets = Array.isArray(sm.sets) ? sm.sets : null;
                        const winner = calcMatchWinnerFromSets(sets, normalizedScoringType);
                        winners.push(winner);
                        allSets.push(sets);

                        await sql`
                            UPDATE team_tournament_matchday_matches
                            SET winner = ${winner},
                                updated_at = NOW()
                            WHERE matchday_id = ${md.id}
                              AND match_index = ${sm.match_index}
                        `;
                    }
                    const summary = calcTeamMatchdaySummary({
                        matchesPerDay: Number(md.matches_per_day),
                        subMatchWinners: winners,
                        subMatchSets: allSets,
                        scoringType: normalizedScoringType
                    });
                    await sql`
                        UPDATE team_tournament_matchdays
                        SET summary_json = ${JSON.stringify({ ...summary, scoringType: normalizedScoringType })}::jsonb,
                            updated_at = NOW()
                        WHERE id = ${md.id}
                    `;
                }
            }

            await sql`
                DELETE FROM team_tournament_fixtures
                WHERE root_tournament_id = ${id}
                  AND status = 'planned'
            `;
            await tryGenerateTeamTournamentPlayoffs(id, req.workspaceId);
            await resolveFixtureTeamNumbers(id, req.workspaceId);
        }

        await sql`
            UPDATE team_tournament_teams
            SET target_player_count = ${playersPerTeam},
                updated_at = NOW()
            WHERE tournament_id = ${id}
        `;

        if (teamCount > previousTeamCount) {
            for (let teamNumber = previousTeamCount + 1; teamNumber <= teamCount; teamNumber++) {
                await sql`
                    INSERT INTO team_tournament_teams (tournament_id, team_number, name, target_player_count)
                    VALUES (${id}, ${teamNumber}, ${`Squadra ${teamNumber}`}, ${playersPerTeam})
                `;
            }
        } else if (teamCount < previousTeamCount) {
            await sql`
                DELETE FROM team_tournament_teams
                WHERE tournament_id = ${id}
                AND team_number > ${teamCount}
            `;
        }

        if (teamTournamentFormat === 'ELIMINAZIONE DIRETTA') {
            const maxSeededTeams = Math.floor(teamCount / 2);
            const seededRows = await sql`
                SELECT id
                FROM team_tournament_teams
                WHERE tournament_id = ${id}
                  AND is_seeded = TRUE
                ORDER BY team_number ASC
            `;
            if (seededRows.length > maxSeededTeams) {
                const idsToClear = seededRows.slice(maxSeededTeams).map(row => row.id);
                if (idsToClear.length > 0) {
                    await sql`
                        UPDATE team_tournament_teams
                        SET is_seeded = FALSE,
                            updated_at = NOW()
                        WHERE id = ANY(${idsToClear}::uuid[])
                    `;
                }
            }
        }

        if (teamTournamentFormat === 'ELIMINAZIONE DIRETTA' && !hasResults) {
            const configStatusRows = await sql`
                SELECT config_completed
                FROM team_tournament_configs
                WHERE tournament_id = ${id}
                LIMIT 1
            `;
            await sql`
                DELETE FROM team_tournament_fixtures
                WHERE root_tournament_id = ${id}
                  AND status = 'planned'
            `;
            if (configStatusRows[0]?.config_completed) {
                const allTeams = await sql`
                    SELECT team_number, name, is_seeded
                    FROM team_tournament_teams
                    WHERE tournament_id = ${id}
                    ORDER BY team_number ASC
                `;
                const fixtures = buildTeamTournamentEliminationFixtures(
                    allTeams.map(team => ({
                        teamNumber: Number(team.team_number),
                        name: team.name,
                        isSeeded: !!team.is_seeded,
                    }))
                );
                await upsertFixtures(id, req.workspaceId, fixtures);
                await resolveFixtureTeamNumbers(id, req.workspaceId);
            }
        }

        logger.info('Team tournament config updated', {
            tournamentId: id,
            previousTeamCount,
            teamCount,
            playersPerTeam,
            workspaceId: req.workspaceId
        });

        res.json({
            config: {
                tournamentId: id,
                initialTeamCount: teamCount,
                defaultPlayersPerTeam: playersPerTeam,
                format: teamTournamentFormat,
                matchesPerDay: normalizedMatchesPerDay,
                roundRobinFinalPhase: normalizedRoundRobinFinalPhase,
                scoringType: normalizedScoringType,
                schedule: teamTournamentFormat === 'ROUND ROBIN' ? generateRoundRobinSchedule(teamCount) : null,
                hasResults
            }
        });
    } catch (error) {
        logger.error('Failed to update team tournament config', error);
        res.status(500).json({ message: 'Errore nell\'aggiornamento configurazione torneo a squadre', error: error.message });
    }
});

app.post('/api/team-tournaments/:id/complete-configuration', async (req, res) => {
    try {
        const { id } = req.params;

        const tournamentResult = await sql`
            SELECT t.id
            FROM tournaments t
            JOIN team_tournament_configs c ON c.tournament_id = t.id
            WHERE t.id = ${id}
            AND t.workspace_id = ${req.workspaceId}
            AND t.type = ${'Torneo a Squadre'}
            LIMIT 1
        `;

        if (tournamentResult.length === 0) {
            return res.status(404).json({ message: 'Torneo a squadre non trovato' });
        }

        const configResult = await sql`
            SELECT initial_team_count, format, matches_per_day, round_robin_final_phase, scoring_type
            FROM team_tournament_configs
            WHERE tournament_id = ${id}
            LIMIT 1
        `;

        if (configResult.length === 0) {
            return res.status(404).json({ message: 'Configurazione torneo a squadre non trovata' });
        }

        const teamCount = configResult[0].initial_team_count;
        const format = configResult[0].format;
        const matchesPerDay = Number(configResult[0].matches_per_day) === 5 ? 5 : 3;
        const roundRobinFinalPhase = configResult[0].round_robin_final_phase || null;
        const scoringType = configResult[0].scoring_type || null;

        if (!format) {
            return res.status(400).json({ message: 'Tipo torneo non valido' });
        }
        if (!scoringType) {
            return res.status(400).json({ message: 'Tipo punteggio non valido' });
        }
        if (format !== 'ELIMINAZIONE DIRETTA' && !roundRobinFinalPhase) {
            return res.status(400).json({ message: 'Fase finale non valida' });
        }

        // Validate team naming + roster size vs matches_per_day
        const teamsResult = await sql`
            SELECT team_number, name, players, is_seeded
            FROM team_tournament_teams
            WHERE tournament_id = ${id}
            ORDER BY team_number ASC
        `;
        const missingNames = teamsResult.filter(t => !String(t.name || '').trim() || String(t.name).trim() === `Squadra ${t.team_number}`);
        if (missingNames.length > 0) {
            return res.status(400).json({ message: 'Inserisci il nome di tutte le squadre prima di completare la configurazione.' });
        }

        const minPlayersPerTeam = matchesPerDay * 2;
        const insufficientTeams = teamsResult.filter(t => {
            const players = Array.isArray(t.players) ? t.players : [];
            const configured = players.filter(p => String(p?.name || '').trim() && String(p?.surname || '').trim()).length;
            return configured < minPlayersPerTeam;
        });
        if (insufficientTeams.length > 0) {
            return res.status(400).json({
                message: `Per ${matchesPerDay} partite servono almeno ${minPlayersPerTeam} giocatori per squadra (tutti con nome e cognome).`,
            });
        }

        if (format === 'ELIMINAZIONE DIRETTA') {
            const maxSeededTeams = Math.floor(Number(teamCount) / 2);
            const seededCount = teamsResult.filter(t => !!t.is_seeded).length;
            if (seededCount > maxSeededTeams) {
                return res.status(400).json({
                    message: `Puoi selezionare al massimo ${maxSeededTeams} teste di serie per ${teamCount} squadre.`,
                });
            }
        }

        const scheduleJson = format === 'ROUND ROBIN' ? generateRoundRobinSchedule(teamCount) : null;

        await sql`
            UPDATE team_tournament_configs
            SET config_completed = TRUE,
                schedule_json = ${scheduleJson ? JSON.stringify(scheduleJson) : null}::jsonb,
                updated_at = NOW()
            WHERE tournament_id = ${id}
        `;

        if (format === 'ELIMINAZIONE DIRETTA') {
            const teams = teamsResult.map(team => ({
                teamNumber: Number(team.team_number),
                name: team.name,
                isSeeded: !!team.is_seeded,
            }));
            await sql`DELETE FROM team_tournament_fixtures WHERE root_tournament_id = ${id}`;
            const fixtures = buildTeamTournamentEliminationFixtures(teams);
            await upsertFixtures(id, req.workspaceId, fixtures);
            await resolveFixtureTeamNumbers(id, req.workspaceId);
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to complete team tournament configuration', error);
        res.status(500).json({ message: 'Errore nel completamento della configurazione', error: error.message });
    }
});

app.get('/api/team-tournaments/:id/teams', async (req, res) => {
    try {
        const { id } = req.params;

        const teamsResult = await sql`
            SELECT tt.id, tt.tournament_id, tt.team_number, tt.name, tt.target_player_count, tt.players, tt.is_seeded
            FROM team_tournament_teams tt
            JOIN tournaments t ON t.id = tt.tournament_id
            WHERE tt.tournament_id = ${id}
            AND t.workspace_id = ${req.workspaceId}
            AND t.type = ${'Torneo a Squadre'}
            ORDER BY tt.team_number ASC
        `;

        res.json({
            teams: teamsResult.map(team => ({
                id: team.id,
                tournamentId: team.tournament_id,
                teamNumber: team.team_number,
                name: team.name,
                targetPlayerCount: team.target_player_count,
                players: Array.isArray(team.players) ? team.players : [],
                isSeeded: !!team.is_seeded,
            }))
        });
    } catch (error) {
        logger.error('Failed to fetch team tournament teams', error);
        res.status(500).json({ message: 'Errore nel recupero delle squadre', error: error.message });
    }
});

// GET /api/team-tournaments/:id/matchdays - Fetch all matchdays for a team tournament root
app.get('/api/team-tournaments/:id/matchdays', async (req, res) => {
    try {
        const { id } = req.params; // root tournament id

        const rootTournamentResult = await sql`
            SELECT id
            FROM tournaments
            WHERE id = ${id}
            AND workspace_id = ${req.workspaceId}
            AND type = ${'Torneo a Squadre'}
            LIMIT 1
        `;
        if (rootTournamentResult.length === 0) {
            return res.status(404).json({ message: 'Torneo a squadre non trovato' });
        }

        const matchdaysResult = await sql`
            SELECT d.id, d.root_tournament_id, d.tournament_day_id, d.date, d.team1_number, d.team2_number, d.round_number, d.matches_per_day,
                   d.phase, d.status, d.summary_json, d.created_at,
                   t.name, t.club, t.type, t.giornata_name, t.team_tournament_root_id
            FROM team_tournament_matchdays d
            JOIN tournaments t ON t.id = d.tournament_day_id
            WHERE d.root_tournament_id = ${id}
            AND t.workspace_id = ${req.workspaceId}
            ORDER BY d.date ASC, d.created_at ASC
        `;

        const matchdayIds = matchdaysResult.map(r => r.id);
        const subMatchesResult = matchdayIds.length > 0 ? await sql`
            SELECT matchday_id, match_index, team1_players, team2_players, sets, winner, cancelled
            FROM team_tournament_matchday_matches
            WHERE matchday_id = ANY(${matchdayIds}::uuid[])
            ORDER BY matchday_id ASC, match_index ASC
        ` : [];

        const subMatchesByMatchday = new Map();
        subMatchesResult.forEach(r => {
            if (!subMatchesByMatchday.has(r.matchday_id)) subMatchesByMatchday.set(r.matchday_id, []);
            subMatchesByMatchday.get(r.matchday_id).push({
                matchIndex: r.match_index,
                team1Players: Array.isArray(r.team1_players) ? r.team1_players : [],
                team2Players: Array.isArray(r.team2_players) ? r.team2_players : [],
                sets: r.sets || null,
                winner: r.winner || null,
                cancelled: !!r.cancelled,
            });
        });

        res.json({
            matchdays: matchdaysResult.map(md => ({
                id: md.id,
                rootTournamentId: md.root_tournament_id,
                tournamentDayId: md.tournament_day_id,
                date: md.date,
                team1Number: md.team1_number,
                team2Number: md.team2_number,
                roundNumber: md.round_number || null,
                matchesPerDay: md.matches_per_day,
                phase: md.phase || 'round_robin',
                status: md.status,
                summary: md.summary_json || null,
                createdAt: md.created_at,
                tournament: {
                    id: md.tournament_day_id,
                    name: md.name,
                    club: md.club,
                    type: md.type,
                    giornataName: md.giornata_name || null,
                    teamTournamentRootId: md.team_tournament_root_id || null,
                },
                subMatches: subMatchesByMatchday.get(md.id) || []
            }))
        });
    } catch (error) {
        logger.error('Failed to fetch team tournament matchdays', error);
        res.status(500).json({ message: 'Errore nel recupero delle giornate', error: error.message });
    }
});

app.put('/api/team-tournaments/:tournamentId/teams/:teamId', async (req, res) => {
    try {
        const { tournamentId, teamId } = req.params;
        const { name, players, isSeeded } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Nome squadra non valido' });
        }

        if (!Array.isArray(players)) {
            return res.status(400).json({ message: 'Lista giocatori non valida' });
        }

        const normalizedPlayers = players.map(player => ({
            name: String(player?.name || '').trim(),
            surname: String(player?.surname || '').trim(),
            id: player?.id || undefined,
            currentElo: player?.currentElo !== undefined ? Number(player.currentElo) : undefined
        }));

        const teamResult = await sql`
            SELECT tt.id, tt.tournament_id, tt.team_number, tt.target_player_count,
                   c.format, c.config_completed
            FROM team_tournament_teams tt
            JOIN tournaments t ON t.id = tt.tournament_id
            JOIN team_tournament_configs c ON c.tournament_id = tt.tournament_id
            WHERE tt.id = ${teamId}
            AND tt.tournament_id = ${tournamentId}
            AND t.workspace_id = ${req.workspaceId}
            AND t.type = ${'Torneo a Squadre'}
            LIMIT 1
        `;

        if (teamResult.length === 0) {
            return res.status(404).json({ message: 'Squadra non trovata' });
        }

        const normalizedIsSeeded = !!isSeeded;
        const configRow = teamResult[0];

        if (configRow.format === 'ELIMINAZIONE DIRETTA' && normalizedIsSeeded) {
            const seedRows = await sql`
                SELECT COUNT(*)::int AS count
                FROM team_tournament_teams
                WHERE tournament_id = ${tournamentId}
                  AND is_seeded = TRUE
                  AND id <> ${teamId}
            `;
            const countRows = await sql`
                SELECT initial_team_count
                FROM team_tournament_configs
                WHERE tournament_id = ${tournamentId}
                LIMIT 1
            `;
            const maxSeededTeams = Math.floor(Number(countRows[0]?.initial_team_count || 0) / 2);
            const nextSeededCount = Number(seedRows[0]?.count || 0) + 1;
            if (nextSeededCount > maxSeededTeams) {
                return res.status(400).json({ message: `Puoi selezionare al massimo ${maxSeededTeams} teste di serie.` });
            }
        }

        if (configRow.format === 'ELIMINAZIONE DIRETTA' && configRow.config_completed) {
            const startedFixtures = await sql`
                SELECT 1
                FROM team_tournament_fixtures
                WHERE root_tournament_id = ${tournamentId}
                  AND status <> 'planned'
                LIMIT 1
            `;
            if (startedFixtures.length > 0) {
                const currentRows = await sql`
                    SELECT is_seeded
                    FROM team_tournament_teams
                    WHERE id = ${teamId}
                    LIMIT 1
                `;
                const currentSeeded = !!currentRows[0]?.is_seeded;
                if (currentSeeded !== normalizedIsSeeded) {
                    return res.status(400).json({ message: 'Non puoi modificare le teste di serie dopo aver avviato il tabellone.' });
                }
            }
        }

        const currentPlayersRows = await sql`
            SELECT players, team_number
            FROM team_tournament_teams
            WHERE id = ${teamId}
            LIMIT 1
        `;
        const currentPlayers = Array.isArray(currentPlayersRows[0]?.players) ? currentPlayersRows[0]?.players : [];
        const teamNumber = currentPlayersRows[0]?.team_number;

        // Verify that played players are not modified
        const matchdays = await sql`
            SELECT sm.team1_players, sm.team2_players, m.team1_number, m.team2_number
            FROM team_tournament_matchday_matches sm
            JOIN team_tournament_matchdays m ON m.id = sm.matchday_id
            WHERE m.root_tournament_id = ${tournamentId}
              AND (m.team1_number = ${teamNumber} OR m.team2_number = ${teamNumber})
        `;

        const playedPlayers = new Set();
        for (const row of matchdays) {
            const playersList = row.team1_number === teamNumber ? row.team1_players : row.team2_players;
            if (Array.isArray(playersList)) {
                for (const p of playersList) {
                    if (p) {
                        const pn = (p.name || '').trim().toLowerCase();
                        const ps = (p.surname || '').trim().toLowerCase();
                        if (pn || ps) {
                            playedPlayers.add(`${pn}|${ps}`);
                        }
                    }
                }
            }
        }

        for (let i = 0; i < currentPlayers.length; i++) {
            const orig = currentPlayers[i];
            if (!orig) continue;
            const origName = (orig.name || '').trim().toLowerCase();
            const origSurname = (orig.surname || '').trim().toLowerCase();
            if (!origName && !origSurname) continue;
            
            const origKey = `${origName}|${origSurname}`;
            
            if (playedPlayers.has(origKey)) {
                const updated = normalizedPlayers[i];
                if (!updated) continue;

                const oldSurnameT = origSurname; // already defined above and safe
                const newSurnameT = (updated.surname || '').trim().toLowerCase();

                // Nome: sempre modificabile liberamente
                // Cognome: Levenshtein 20% con salvacondotto <= 2 caratteri
                if (newSurnameT !== oldSurnameT) {
                    const dist = levenshtein(oldSurnameT, newSurnameT);
                    const origSurnameLen = (orig.surname || '').trim().length;
                    const maxLen = Math.max(origSurnameLen, updated.surname.trim().length);
                    const changeRatio = maxLen > 0 ? dist / maxLen : 0;
                    if (dist > 2 && changeRatio > 0.20) {
                        return res.status(400).json({
                            message: `Il cognome di ${orig.name} ${orig.surname} non può essere modificato radicalmente (variazione: ${Math.round(changeRatio * 100)}%, distanza: ${dist} caratteri). Solo correzioni ortografiche minori sono consentite.`,
                            levenshteinDistance: dist,
                            changeRatio: Math.round(changeRatio * 100)
                        });
                    }
                }
            }
        }

        const linkedPlayers = [];
        for (const p of normalizedPlayers) {
            if (!p.name && !p.surname) {
                linkedPlayers.push(null);
                continue;
            }
            if (p.id) {
                const existing = await sql`SELECT id FROM players WHERE id = ${p.id} AND workspace_id = ${req.workspaceId} LIMIT 1`;
                if (existing.length > 0) {
                    linkedPlayers.push({ id: p.id, name: p.name, surname: p.surname });
                } else {
                    linkedPlayers.push({ id: null, name: p.name, surname: p.surname });
                }
            } else {
                const initialEloToSet = p.currentElo !== undefined && !isNaN(p.currentElo) ? p.currentElo : 1500;
                const insertRes = await sql`
                    INSERT INTO players (workspace_id, name, surname, position, current_elo, initial_elo)
                    VALUES (${req.workspaceId}, ${p.name}, ${p.surname}, 'Indifferente', ${initialEloToSet}, ${initialEloToSet})
                    RETURNING id
                `;
                linkedPlayers.push({ id: insertRes[0].id, name: p.name, surname: p.surname });
            }
        }

        await sql`
            UPDATE team_tournament_teams
            SET name = ${name.trim()},
                players = ${JSON.stringify(linkedPlayers)}::jsonb,
                players_linked = ${JSON.stringify(linkedPlayers)}::jsonb,
                is_seeded = ${normalizedIsSeeded},
                updated_at = NOW()
            WHERE id = ${teamId}
        `;

        if (configRow.format === 'ELIMINAZIONE DIRETTA' && configRow.config_completed) {
            const startedFixtures = await sql`
                SELECT 1
                FROM team_tournament_fixtures
                WHERE root_tournament_id = ${tournamentId}
                  AND status <> 'planned'
                LIMIT 1
            `;
            if (startedFixtures.length === 0) {
                const allTeams = await sql`
                    SELECT team_number, name, is_seeded
                    FROM team_tournament_teams
                    WHERE tournament_id = ${tournamentId}
                    ORDER BY team_number ASC
                `;
                await sql`DELETE FROM team_tournament_fixtures WHERE root_tournament_id = ${tournamentId}`;
                const fixtures = buildTeamTournamentEliminationFixtures(
                    allTeams.map(team => ({
                        teamNumber: Number(team.team_number),
                        name: team.name,
                        isSeeded: !!team.is_seeded,
                    }))
                );
                await upsertFixtures(tournamentId, req.workspaceId, fixtures);
                await resolveFixtureTeamNumbers(tournamentId, req.workspaceId);
            }
        }

        const updatedTeamResult = await sql`
            SELECT id, tournament_id, team_number, name, target_player_count, players, is_seeded
            FROM team_tournament_teams
            WHERE id = ${teamId}
            LIMIT 1
        `;

        const updatedTeam = updatedTeamResult[0];

        res.json({
            team: {
                id: updatedTeam.id,
                tournamentId: updatedTeam.tournament_id,
                teamNumber: updatedTeam.team_number,
                name: updatedTeam.name,
                targetPlayerCount: updatedTeam.target_player_count,
                players: Array.isArray(updatedTeam.players) ? updatedTeam.players : [],
                isSeeded: !!updatedTeam.is_seeded,
            }
        });
    } catch (error) {
        logger.error('Failed to update team tournament team', error);
        res.status(500).json({ message: 'Errore nell\'aggiornamento della squadra', error: error.message });
    }
});

const normalizeTeamTournamentPlayerEntry = (player) => ({
    name: String(player?.name || '').trim(),
    surname: String(player?.surname || '').trim(),
});

const areSameTeamPairing = (a1, a2, b1, b2) => {
    const x1 = Number(a1);
    const x2 = Number(a2);
    const y1 = Number(b1);
    const y2 = Number(b2);
    return (x1 === y1 && x2 === y2) || (x1 === y2 && x2 === y1);
};

const findRoundNumberForTeams = (scheduleJson, team1Number, team2Number) => {
    if (!scheduleJson || scheduleJson.kind !== 'round_robin' || !Array.isArray(scheduleJson.days)) return null;
    for (const day of scheduleJson.days) {
        const matches = Array.isArray(day.matches) ? day.matches : [];
        for (const m of matches) {
            if (areSameTeamPairing(m.team1Number, m.team2Number, team1Number, team2Number)) {
                return Number(day.dayNumber) || null;
            }
        }
    }
    return null;
};

const calcMatchWinnerFromSets = (sets, scoringType = 'Punti') => {
    if (!Array.isArray(sets) || sets.length === 0) return null;
    const normalizedSets = sets.map(s => ({
        team1: Number(s?.team1 || 0),
        team2: Number(s?.team2 || 0),
    }));
    const allZero = normalizedSets.every(s => s.team1 === 0 && s.team2 === 0);
    if (allZero) return null;

    // Count sets won
    let t1Sets = 0;
    let t2Sets = 0;
    for (const s of normalizedSets) {
        if (s.team1 > s.team2) t1Sets++;
        else if (s.team2 > s.team1) t2Sets++;
    }

    if (scoringType === 'Punti + Resilienza') {
        if (t1Sets === 1 && t2Sets === 1) {
            return 'draw';
        }
    }

    if (t1Sets > t2Sets) return 'team1';
    if (t2Sets > t1Sets) return 'team2';

    const t1 = normalizedSets.reduce((sum, s) => sum + s.team1, 0);
    const t2 = normalizedSets.reduce((sum, s) => sum + s.team2, 0);
    // Draws are not supported for team tournaments. If it's not an unplayed match, reject.
    if (t1 === t2) return 'draw';
    return t1 > t2 ? 'team1' : 'team2';
};

const calcTeamMatchdaySummary = ({ matchesPerDay, subMatchWinners, subMatchSets, scoringType = 'Punti' }) => {
    const neededWins = matchesPerDay === 5 ? 3 : 2;
    const playedWinners = subMatchWinners.filter(w => w === 'team1' || w === 'team2');
    const team1Wins = playedWinners.filter(w => w === 'team1').length;
    const team2Wins = playedWinners.filter(w => w === 'team2').length;
    const playedCount = playedWinners.length;

    let team1Games = 0;
    let team2Games = 0;
    for (const sets of subMatchSets) {
        if (!Array.isArray(sets)) continue;
        for (const s of sets) {
            team1Games += Number(s?.team1 || 0);
            team2Games += Number(s?.team2 || 0);
        }
    }

    const gamesDiff = team1Games - team2Games;

    let team1Points = 0;
    let team2Points = 0;
    let decidedWinner = null;
    if (team1Wins >= neededWins && team1Wins > team2Wins) decidedWinner = 'team1';
    if (team2Wins >= neededWins && team2Wins > team1Wins) decidedWinner = 'team2';

    if (scoringType === 'Punti + Resilienza') {
        for (let i = 0; i < subMatchSets.length; i++) {
            const winner = subMatchWinners[i];
            if (!winner) continue; // Cancelled, draw or not played

            const sets = subMatchSets[i];
            if (!Array.isArray(sets) || sets.length === 0) continue;

            const playedSets = sets.filter(s => s && (Number(s.team1 || 0) > 0 || Number(s.team2 || 0) > 0));
            if (playedSets.length === 0) continue;

            let team1SetsWon = 0;
            let team2SetsWon = 0;
            playedSets.forEach(s => {
                const t1 = Number(s.team1 || 0);
                const t2 = Number(s.team2 || 0);
                if (t1 > t2) team1SetsWon++;
                else if (t2 > t1) team2SetsWon++;
            });

            if (team1SetsWon === 1 && team2SetsWon === 1) {
                team1Points += 1;
                team2Points += 1;
            } else if (winner === 'team1') {
                team1Points += 2;
                if (team2SetsWon > 0) team2Points += 1;
            } else if (winner === 'team2') {
                team2Points += 2;
                if (team1SetsWon > 0) team1Points += 1;
            } else if (winner === 'draw') {
                team1Points += 1;
                team2Points += 1;
            }
        }
    } else {
        if (decidedWinner) {
            const winnerWins = decidedWinner === 'team1' ? team1Wins : team2Wins;
            const loserWins = decidedWinner === 'team1' ? team2Wins : team1Wins;
            const isAllPlayed = playedCount === matchesPerDay;
            const isCleanWin = isAllPlayed && loserWins === 0;
            const isEarlyClinch = !isAllPlayed && winnerWins === neededWins;
            const isNarrowWin = isAllPlayed && (winnerWins - loserWins) === 1;

            const winnerPoints = (isCleanWin || isEarlyClinch) ? 3 : (isNarrowWin ? 2 : 3);
            const loserPoints = isNarrowWin ? 1 : 0;

            if (decidedWinner === 'team1') {
                team1Points = winnerPoints;
                team2Points = loserPoints;
            }
            if (decidedWinner === 'team2') {
                team2Points = winnerPoints;
                team1Points = loserPoints;
            }
        }
    }

    return {
        neededWins,
        playedCount,
        team1Wins,
        team2Wins,
        team1Points,
        team2Points,
        team1Games,
        team2Games,
        gamesDiff,
        winner: decidedWinner,
    };
};

const safeNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const calculateTeamTournamentStandingsServer = (teams, matchdays, scoringType) => {
    const teamNameByNumber = new Map();
    (teams || []).forEach(t => teamNameByNumber.set(Number(t.teamNumber), String(t.name || '').trim() || `Squadra ${t.teamNumber}`));

    const rows = new Map();
    const ensure = (teamNumber) => {
        const n = Number(teamNumber);
        if (!rows.has(n)) {
            rows.set(n, {
                teamNumber: n,
                teamName: teamNameByNumber.get(n) || `Squadra ${n}`,
                played: 0,
                won: 0,
                lost: 0,
                points: 0,
                gamesFor: 0,
                gamesAgainst: 0,
                gamesDiff: 0,
            });
        }
        return rows.get(n);
    };

    (matchdays || [])
        // Standings are based on Round Robin only.
        .filter(md => (md.phase || 'round_robin') === 'round_robin')
        .filter(md => md.status === 'completed' && md.summary_json)
        .forEach(md => {
            const t1 = ensure(md.team1_number);
            const t2 = ensure(md.team2_number);
            t1.played += 1;
            t2.played += 1;

            const s = md.summary_json || {};
            const t1Points = safeNum(s.team1Points);
            const t2Points = safeNum(s.team2Points);
            const t1Games = safeNum(s.team1Games);
            const t2Games = safeNum(s.team2Games);

            t1.points += t1Points;
            t2.points += t2Points;

            t1.gamesFor += t1Games;
            t1.gamesAgainst += t2Games;
            t2.gamesFor += t2Games;
            t2.gamesAgainst += t1Games;

            const winner = s.winner || null;
            if (winner === 'team1') { t1.won += 1; t2.lost += 1; }
            if (winner === 'team2') { t2.won += 1; t1.lost += 1; }
        });

    (teams || []).forEach(t => ensure(t.teamNumber));
    rows.forEach(r => { r.gamesDiff = r.gamesFor - r.gamesAgainst; });

    const primaryKey = (r) => scoringType === 'Differenza Games' ? r.gamesDiff : r.points;
    return Array.from(rows.values()).sort((a, b) => {
        const pA = primaryKey(a);
        const pB = primaryKey(b);
        if (pB !== pA) return pB - pA;
        if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
        if (b.gamesFor !== a.gamesFor) return b.gamesFor - a.gamesFor;
        return String(a.teamName).localeCompare(String(b.teamName));
    });
};

const expectedRoundRobinPairingsCount = (scheduleJson, teamCount) => {
    if (scheduleJson && scheduleJson.kind === 'round_robin' && Array.isArray(scheduleJson.days)) {
        return scheduleJson.days.reduce((sum, d) => sum + (Array.isArray(d.matches) ? d.matches.length : 0), 0);
    }
    const n = Number(teamCount) || 0;
    if (n < 2) return 0;
    return Math.floor((n * (n - 1)) / 2);
};

const phaseLabel = (phase) => {
    switch (phase) {
        case 'round_of_32': return 'Trentaduesimi di finale';
        case 'round_of_16': return 'Ottavo di finale';
        case 'quarterfinal': return 'Quarto di finale';
        case 'semifinal': return 'Semifinale';
        case 'final_3_4': return 'Finale 3°-4°';
        case 'final_1_2': return 'Finale 1°-2°';
        default: return phase;
    }
};

const nextPowerOfTwo = (value) => {
    let n = 1;
    while (n < value) n *= 2;
    return n;
};

const shuffleArray = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

const buildSeedLineOrder = (size) => {
    if (size <= 2) return [1, 2];
    const prev = buildSeedLineOrder(size / 2);
    const out = [];
    for (const seed of prev) {
        out.push(seed);
        out.push(size + 1 - seed);
    }
    return out;
};

const singleEliminationPhasesForSize = (size) => {
    if (size <= 2) return ['final_1_2'];
    if (size === 4) return ['semifinal', 'final_1_2'];
    if (size === 8) return ['quarterfinal', 'semifinal', 'final_1_2'];
    if (size === 16) return ['round_of_16', 'quarterfinal', 'semifinal', 'final_1_2'];
    return ['round_of_32', 'round_of_16', 'quarterfinal', 'semifinal', 'final_1_2'];
};

const buildTeamTournamentEliminationFixtures = (teams) => {
    const orderedTeams = [...teams].sort((a, b) => Number(a.teamNumber) - Number(b.teamNumber));
    const bracketSize = nextPowerOfTwo(Math.max(2, orderedTeams.length));
    const phases = singleEliminationPhasesForSize(bracketSize);
    const firstPhase = phases[0];
    const slots = Array.from({ length: bracketSize }, () => null);
    const seedLineOrder = buildSeedLineOrder(bracketSize);
    const seededTeams = orderedTeams.filter(t => !!t.isSeeded);
    const unseededTeams = shuffleArray(orderedTeams.filter(t => !t.isSeeded));

    seededTeams.forEach((team, index) => {
        const seedRank = index + 1;
        const lineIndex = seedLineOrder.findIndex(seed => seed === seedRank);
        if (lineIndex >= 0) {
            slots[lineIndex] = Number(team.teamNumber);
        }
    });

    let unseededIndex = 0;
    for (let i = 0; i < slots.length; i++) {
        if (slots[i] !== null) continue;
        const nextTeam = unseededTeams[unseededIndex++];
        if (!nextTeam) continue;
        slots[i] = Number(nextTeam.teamNumber);
    }

    const fixtures = [];
    const slotsByPhase = new Map();
    let previousRoundSlotCount = 0;

    phases.forEach((phase, phaseIndex) => {
        const roundSlotCount = bracketSize / Math.pow(2, phaseIndex + 1);
        slotsByPhase.set(phase, roundSlotCount);
        for (let slot = 1; slot <= roundSlotCount; slot++) {
            if (phaseIndex === 0) {
                const team1Number = slots[(slot - 1) * 2] ?? null;
                const team2Number = slots[(slot - 1) * 2 + 1] ?? null;
                if (team1Number && team2Number) {
                    fixtures.push({
                        phase,
                        slot,
                        team1Number,
                        team2Number,
                        winnerTeamNumber: null,
                        loserTeamNumber: null,
                        isBye: false,
                        status: 'planned',
                        dependsOn: null,
                    });
                } else {
                    const winnerTeamNumber = team1Number || team2Number || null;
                    fixtures.push({
                        phase,
                        slot,
                        team1Number,
                        team2Number,
                        winnerTeamNumber,
                        loserTeamNumber: null,
                        isBye: true,
                        status: 'completed',
                        dependsOn: null,
                    });
                }
            } else {
                const prevPhase = phases[phaseIndex - 1];
                const sourceSlot1 = (slot - 1) * 2 + 1;
                const sourceSlot2 = (slot - 1) * 2 + 2;
                fixtures.push({
                    phase,
                    slot,
                    team1Number: null,
                    team2Number: null,
                    winnerTeamNumber: null,
                    loserTeamNumber: null,
                    isBye: false,
                    status: 'planned',
                    dependsOn: { type: 'winners', from: prevPhase, slots: [sourceSlot1, sourceSlot2] },
                });
            }
        }
        previousRoundSlotCount = roundSlotCount;
    });

    return fixtures;
};

// POST /api/team-tournaments/:id/matchdays - Create a new team tournament matchday (calendar)
app.post('/api/team-tournaments/:id/matchdays', async (req, res) => {
    try {
        const { id } = req.params; // root tournament id
        const { date, team1Number, team2Number, subMatches, fixtureId } = req.body;

        if (!date || !team1Number || !team2Number || !Array.isArray(subMatches)) {
            return res.status(400).json({ message: 'Dati giornata non validi' });
        }

        const rootTournamentResult = await sql`
            SELECT id, name, club, type, workspace_id
            FROM tournaments
            WHERE id = ${id}
            AND workspace_id = ${req.workspaceId}
            AND type = ${'Torneo a Squadre'}
            LIMIT 1
        `;
        if (rootTournamentResult.length === 0) {
            return res.status(404).json({ message: 'Torneo a squadre non trovato' });
        }

        const configResult = await sql`
            SELECT matches_per_day, scoring_type, schedule_json, config_completed
            FROM team_tournament_configs
            WHERE tournament_id = ${id}
            LIMIT 1
        `;
        if (configResult.length === 0) {
            return res.status(404).json({ message: 'Configurazione torneo a squadre non trovata' });
        }
        if (!configResult[0].config_completed) {
            return res.status(400).json({ message: 'Completa prima la configurazione del torneo.' });
        }

        const normalizedDate = new Date(date).toISOString();
        const t1 = Number(team1Number);
        const t2 = Number(team2Number);
        if (!Number.isInteger(t1) || !Number.isInteger(t2) || t1 < 1 || t2 < 1 || t1 === t2) {
            return res.status(400).json({ message: 'Squadre non valide' });
        }

        const matchesPerDay = Number(configResult[0].matches_per_day) === 5 ? 5 : 3;
        if (subMatches.length !== matchesPerDay) {
            return res.status(400).json({ message: `Devi inserire ${matchesPerDay} partite` });
        }

        let phase = 'round_robin';
        let fixture = null;
        if (fixtureId) {
            let fx = await sql`
                SELECT id, root_tournament_id, phase, slot, team1_number, team2_number, status, tournament_day_id, matchday_id
                FROM team_tournament_fixtures
                WHERE id = ${fixtureId}
                AND root_tournament_id = ${id}
                LIMIT 1
            `;
            if (fx.length === 0) {
                return res.status(404).json({ message: 'Partita di fase finale non trovata' });
            }
            fixture = fx[0];
            if (!fixture.team1_number || !fixture.team2_number) {
                await resolveFixtureTeamNumbers(id, req.workspaceId);
                fx = await sql`
                    SELECT id, root_tournament_id, phase, slot, team1_number, team2_number, status, tournament_day_id, matchday_id
                    FROM team_tournament_fixtures
                    WHERE id = ${fixtureId}
                    AND root_tournament_id = ${id}
                    LIMIT 1
                `;
                fixture = fx[0] || fixture;
            }
            if (fixture.status !== 'planned') {
                return res.status(400).json({ message: 'Questa partita di fase finale e\' gia\' stata avviata.' });
            }
            if (!fixture.team1_number || !fixture.team2_number) {
                return res.status(400).json({ message: 'Le squadre per questa partita non sono ancora determinate.' });
            }
            if (t1 !== fixture.team1_number || t2 !== fixture.team2_number) {
                return res.status(400).json({ message: 'Le squadre selezionate non corrispondono alla partita di fase finale.' });
            }
            phase = fixture.phase;
        }

        // Enforce one appearance per player per night, per team (string-based)
        const usedTeam1 = new Set();
        const usedTeam2 = new Set();
        for (const sm of subMatches) {
            const team1Players = Array.isArray(sm?.team1Players) ? sm.team1Players.map(normalizeTeamTournamentPlayerEntry) : [];
            const team2Players = Array.isArray(sm?.team2Players) ? sm.team2Players.map(normalizeTeamTournamentPlayerEntry) : [];
            const isUnplayed = team1Players.length === 0 && team2Players.length === 0;
            if (isUnplayed) continue;
            if (team1Players.length !== 2 || team2Players.length !== 2) {
                return res.status(400).json({ message: 'Ogni partita deve avere 2 giocatori per squadra (oppure lascia vuoto se non si gioca).' });
            }
            const t1Keys = team1Players.map(p => `${p.name}|${p.surname}`.toLowerCase());
            const t2Keys = team2Players.map(p => `${p.name}|${p.surname}`.toLowerCase());
            if (new Set(t1Keys).size !== 2 || new Set(t2Keys).size !== 2) {
                return res.status(400).json({ message: 'Giocatori duplicati nella stessa partita' });
            }
            for (const k of t1Keys) {
                if (!k.replace('|', '').trim()) return res.status(400).json({ message: 'Giocatori non validi' });
                if (usedTeam1.has(k)) return res.status(400).json({ message: 'Un giocatore non puo\' giocare due volte nella stessa serata (squadra 1)' });
                usedTeam1.add(k);
            }
            for (const k of t2Keys) {
                if (!k.replace('|', '').trim()) return res.status(400).json({ message: 'Giocatori non validi' });
                if (usedTeam2.has(k)) return res.status(400).json({ message: 'Un giocatore non puo\' giocare due volte nella stessa serata (squadra 2)' });
                usedTeam2.add(k);
            }
        }

        const rootTournament = rootTournamentResult[0];

        // Determine which round this team pairing belongs to (Round Robin only for now)
        const scheduleJson = configResult[0].schedule_json;
        const roundNumber = findRoundNumberForTeams(scheduleJson, t1, t2);

        // Create a child tournament row so it shows up under "Tornei" like other giornate
        const childTournamentResult = await sql`
            INSERT INTO tournaments (name, type, date, club, status, giornata_name, team_tournament_root_id, workspace_id)
            VALUES (${rootTournament.name}, ${'Torneo a Squadre'}, ${normalizedDate}, ${rootTournament.club}, ${'scheduled'}, ${rootTournament.name}, ${rootTournament.id}, ${req.workspaceId})
            RETURNING id, name, type, date, club, status, giornata_name, team_tournament_root_id
        `;
        const childTournament = childTournamentResult[0];

        // Prevent duplicate pairing only for Round Robin.
        if (phase === 'round_robin') {
            const existing = await sql`
                SELECT id
                FROM team_tournament_matchdays
                WHERE root_tournament_id = ${rootTournament.id}
                  AND phase = 'round_robin'
                  AND ((team1_number = ${t1} AND team2_number = ${t2}) OR (team1_number = ${t2} AND team2_number = ${t1}))
                LIMIT 1
            `;
            if (existing.length > 0) {
                await sql`DELETE FROM tournaments WHERE id = ${childTournament.id} AND workspace_id = ${req.workspaceId}`;
                return res.status(400).json({ message: 'Questa sfida tra squadre e\' gia\' stata inserita.' });
            }
        }

        const matchdayResult = await sql`
            INSERT INTO team_tournament_matchdays (root_tournament_id, tournament_day_id, date, team1_number, team2_number, round_number, phase, matches_per_day, status)
            VALUES (${rootTournament.id}, ${childTournament.id}, ${normalizedDate}, ${t1}, ${t2}, ${roundNumber}, ${phase}, ${matchesPerDay}, ${'scheduled'})
            RETURNING id
        `;
        const matchdayId = matchdayResult[0].id;

        for (let i = 0; i < subMatches.length; i++) {
            const sm = subMatches[i];
            const team1Players = Array.isArray(sm?.team1Players) ? sm.team1Players.map(normalizeTeamTournamentPlayerEntry) : [];
            const team2Players = Array.isArray(sm?.team2Players) ? sm.team2Players.map(normalizeTeamTournamentPlayerEntry) : [];
            await sql`
                INSERT INTO team_tournament_matchday_matches (matchday_id, match_index, team1_players, team2_players, sets, winner, cancelled)
                VALUES (${matchdayId}, ${i + 1}, ${JSON.stringify(team1Players)}::jsonb, ${JSON.stringify(team2Players)}::jsonb, ${null}, ${null}, ${false})
            `;
        }

        if (fixture) {
            await sql`
                UPDATE team_tournament_fixtures
                SET status = 'scheduled',
                    tournament_day_id = ${childTournament.id},
                    matchday_id = ${matchdayId},
                    updated_at = NOW()
                WHERE id = ${fixture.id}
            `;
        }

        res.json({
            success: true,
            tournamentDay: {
                id: childTournament.id,
                name: childTournament.name,
                type: childTournament.type,
                date: childTournament.date,
                club: childTournament.club,
                status: childTournament.status,
                giornataName: childTournament.giornata_name || null,
                teamTournamentRootId: childTournament.team_tournament_root_id || null,
            }
        });
    } catch (error) {
        logger.error('Failed to create team tournament matchday', error);
        res.status(500).json({ message: 'Errore nella creazione della giornata', error: error.message });
    }
});

// GET /api/team-tournament-matchdays/by-tournament/:tournamentDayId - Fetch matchday details by child tournament id
app.get('/api/team-tournament-matchdays/by-tournament/:tournamentDayId', async (req, res) => {
    try {
        const { tournamentDayId } = req.params;

        const matchdayResult = await sql`
            SELECT m.id, m.root_tournament_id, m.tournament_day_id, m.date, m.team1_number, m.team2_number, m.round_number, m.phase, m.matches_per_day, m.status, m.summary_json,
                   t.name, t.club, t.type, t.giornata_name, t.team_tournament_root_id
            FROM team_tournament_matchdays m
            JOIN tournaments t ON t.id = m.tournament_day_id
            WHERE m.tournament_day_id = ${tournamentDayId}
            AND t.workspace_id = ${req.workspaceId}
            AND t.type = ${'Torneo a Squadre'}
            LIMIT 1
        `;
        if (matchdayResult.length === 0) {
            return res.status(404).json({ message: 'Giornata non trovata' });
        }

        const matchday = matchdayResult[0];

        const subMatchesResult = await sql`
            SELECT match_index, team1_players, team2_players, sets, winner, cancelled
            FROM team_tournament_matchday_matches
            WHERE matchday_id = ${matchday.id}
            ORDER BY match_index ASC
        `;

        res.json({
            matchday: {
                id: matchday.id,
                rootTournamentId: matchday.root_tournament_id,
                tournamentDayId: matchday.tournament_day_id,
                date: matchday.date,
                team1Number: matchday.team1_number,
                team2Number: matchday.team2_number,
                roundNumber: matchday.round_number,
                phase: matchday.phase || 'round_robin',
                matchesPerDay: matchday.matches_per_day,
                status: matchday.status,
                summary: matchday.summary_json || null,
                tournament: {
                    id: matchday.tournament_day_id,
                    name: matchday.name,
                    club: matchday.club,
                    type: matchday.type,
                    giornataName: matchday.giornata_name || null,
                    teamTournamentRootId: matchday.team_tournament_root_id || null,
                },
                subMatches: subMatchesResult.map(r => ({
                    matchIndex: r.match_index,
                    team1Players: Array.isArray(r.team1_players) ? r.team1_players : [],
                    team2Players: Array.isArray(r.team2_players) ? r.team2_players : [],
                    sets: r.sets || null,
                    winner: r.winner || null,
                    cancelled: !!r.cancelled,
                }))
            }
        });
    } catch (error) {
        logger.error('Failed to fetch team tournament matchday', error);
        res.status(500).json({ message: 'Errore nel recupero della giornata', error: error.message });
    }
});

// Funzione per applicare l'ELO per una giornata team tournament
async function applyTeamMatchdayElo(matchdayId, workspaceId) {
    const matchdayResult = await sql`
        SELECT m.id, m.tournament_day_id, m.phase, t.name AS day_name, t.date, r.name AS root_name
        FROM team_tournament_matchdays m
        JOIN tournaments t ON t.id = m.tournament_day_id
        LEFT JOIN tournaments r ON r.id = m.root_tournament_id
        WHERE m.id = ${matchdayId} AND t.workspace_id = ${workspaceId}
        LIMIT 1
    `;
    if (matchdayResult.length === 0) return;
    const matchday = matchdayResult[0];
    const dateFormatted = new Date(matchday.date).toLocaleDateString('it-IT');
    const rootName = matchday.root_name || matchday.day_name;
    const sourceLabel = `Giornata (${rootName}), ${dateFormatted}`;

    // Revert existing ELO changes for this matchday
    const oldHistory = await sql`
        SELECT player_id, delta
        FROM elo_history
        WHERE event_id = ${matchdayId} AND type = 'team_tournament_matchday' AND workspace_id = ${workspaceId}
    `;
    for (const row of oldHistory) {
        await sql`UPDATE players SET current_elo = current_elo - ${row.delta} WHERE id = ${row.player_id} AND workspace_id = ${workspaceId}`;
    }
    await sql`DELETE FROM elo_history WHERE event_id = ${matchdayId} AND type = 'team_tournament_matchday' AND workspace_id = ${workspaceId}`;

    // Process all sub-matches
    const matches = await sql`
        SELECT sets, winner, cancelled, team1_players, team2_players
        FROM team_tournament_matchday_matches
        WHERE matchday_id = ${matchdayId}
        ORDER BY match_index ASC
    `;

    const playerDeltas = new Map();
    const currentElos = new Map();

    const getPlayerId = async (p) => {
        if (!p || (!p.name && !p.surname)) return null;
        if (p.id) return p.id;
        const rows = await sql`
            SELECT id FROM players
            WHERE name = ${p.name || ''} AND surname = ${p.surname || ''} AND workspace_id = ${workspaceId}
            LIMIT 1
        `;
        return rows.length > 0 ? rows[0].id : null;
    };

    const getElo = async (id) => {
        if (!id) return 1500;
        if (currentElos.has(id)) return currentElos.get(id);
        const rows = await sql`SELECT current_elo FROM players WHERE id = ${id} AND workspace_id = ${workspaceId}`;
        const elo = rows.length > 0 ? Number(rows[0].current_elo) : 1500;
        currentElos.set(id, elo);
        return elo;
    };

    for (const m of matches) {
        if (m.cancelled || !m.winner || m.winner === 'draw') continue;

        const team1P1Id = await getPlayerId(m.team1_players?.[0]);
        const team1P2Id = await getPlayerId(m.team1_players?.[1]);
        const team2P1Id = await getPlayerId(m.team2_players?.[0]);
        const team2P2Id = await getPlayerId(m.team2_players?.[1]);

        if (!team1P1Id || !team2P1Id) continue; // skip if any team is missing players completely

        const t1p1Elo = await getElo(team1P1Id);
        const t1p2Elo = team1P2Id ? await getElo(team1P2Id) : t1p1Elo;
        const t2p1Elo = await getElo(team2P1Id);
        const t2p2Elo = team2P2Id ? await getElo(team2P2Id) : t2p1Elo;

        const avg1 = (t1p1Elo + t1p2Elo) / 2;
        const avg2 = (t2p1Elo + t2p2Elo) / 2;

        const score = m.winner === 'team1' ? 1 : 0;
        const { delta1, delta2 } = calculateEloChange(avg1, avg2, score, 'team_tournament', matchday.phase);

        if (team1P1Id) {
            playerDeltas.set(team1P1Id, (playerDeltas.get(team1P1Id) || 0) + delta1);
            currentElos.set(team1P1Id, currentElos.get(team1P1Id) + delta1);
        }
        if (team1P2Id) {
            playerDeltas.set(team1P2Id, (playerDeltas.get(team1P2Id) || 0) + delta1);
            currentElos.set(team1P2Id, currentElos.get(team1P2Id) + delta1);
        }
        if (team2P1Id) {
            playerDeltas.set(team2P1Id, (playerDeltas.get(team2P1Id) || 0) + delta2);
            currentElos.set(team2P1Id, currentElos.get(team2P1Id) + delta2);
        }
        if (team2P2Id) {
            playerDeltas.set(team2P2Id, (playerDeltas.get(team2P2Id) || 0) + delta2);
            currentElos.set(team2P2Id, currentElos.get(team2P2Id) + delta2);
        }
    }

    // Apply cumulative deltas
    for (const [playerId, totalDelta] of playerDeltas.entries()) {
        if (Math.abs(totalDelta) < 0.01) continue;
        
        const row = await sql`SELECT current_elo FROM players WHERE id = ${playerId} AND workspace_id = ${workspaceId}`;
        if (row.length === 0) continue;
        
        const eloBefore = Number(row[0].current_elo);
        const eloAfter = eloBefore + totalDelta;

        await sql`UPDATE players SET current_elo = ${eloAfter} WHERE id = ${playerId} AND workspace_id = ${workspaceId}`;
        
        await sql`
            INSERT INTO elo_history (
                player_id, event_id, type, source_label, elo_before, elo_after, delta, workspace_id, date
            ) VALUES (
                ${playerId}, ${matchdayId}, 'team_tournament_matchday', ${sourceLabel}, ${eloBefore}, ${eloAfter}, ${totalDelta}, ${workspaceId}, ${matchday.date}
            )
        `;
    }
}

// PUT /api/team-tournament-matchdays/:matchdayId/results - Save results and compute summary
app.put('/api/team-tournament-matchdays/:matchdayId/results', async (req, res) => {
    try {
        const { matchdayId } = req.params;
        const { subMatches, status } = req.body;

        if (!Array.isArray(subMatches)) {
            return res.status(400).json({ message: 'Lista partite non valida' });
        }

        const matchdayResult = await sql`
            SELECT m.id, m.root_tournament_id, m.tournament_day_id, m.phase, m.status AS previous_status, m.matches_per_day,
                   m.team1_number, m.team2_number,
                   c.scoring_type
            FROM team_tournament_matchdays m
            JOIN tournaments t ON t.id = m.tournament_day_id
            JOIN team_tournament_configs c ON c.tournament_id = m.root_tournament_id
            WHERE m.id = ${matchdayId}
            AND t.workspace_id = ${req.workspaceId}
            LIMIT 1
        `;
        if (matchdayResult.length === 0) {
            return res.status(404).json({ message: 'Giornata non trovata' });
        }

        const matchesPerDay = Number(matchdayResult[0].matches_per_day) === 5 ? 5 : 3;
        const scoringType = matchdayResult[0].scoring_type || 'Punti';
        const phase = matchdayResult[0].phase || 'round_robin';
        const previousStatus = matchdayResult[0].previous_status || 'scheduled';

        if (subMatches.length !== matchesPerDay) {
            return res.status(400).json({ message: `Devi inserire ${matchesPerDay} partite` });
        }

        const winners = [];
        const allSets = [];
        for (const sm of subMatches) {
            if (sm?.cancelled) {
                winners.push(null);
                allSets.push(null);
                continue;
            }
            const sets = Array.isArray(sm?.sets) ? sm.sets : null;
            const winner = calcMatchWinnerFromSets(sets, scoringType);
            if (winner === 'draw' && scoringType !== 'Punti + Resilienza') {
                return res.status(400).json({ message: 'Il pareggio non e\' previsto. Inserisci un vincitore (o lascia 0-0 per partita non giocata).' });
            }
            winners.push(winner);
            allSets.push(Array.isArray(sets) ? sets : null);
        }

        const summary = calcTeamMatchdaySummary({ matchesPerDay, subMatchWinners: winners, subMatchSets: allSets, scoringType });

        // Persist each sub-match result
        for (let i = 0; i < subMatches.length; i++) {
            const sm = subMatches[i];
            const cancelled = !!sm?.cancelled;
            const sets = cancelled
                ? null
                : (Array.isArray(sm?.sets) ? sm.sets.map(s => ({ team1: Number(s?.team1 || 0), team2: Number(s?.team2 || 0) })) : null);
            const winner = cancelled ? null : calcMatchWinnerFromSets(sets, scoringType);
            
            let updateQuery;
            if (Array.isArray(sm?.team1Players) && Array.isArray(sm?.team2Players)) {
                const team1Players = sm.team1Players.map(normalizeTeamTournamentPlayerEntry);
                const team2Players = sm.team2Players.map(normalizeTeamTournamentPlayerEntry);
                updateQuery = sql`
                    UPDATE team_tournament_matchday_matches
                    SET sets = ${sets ? JSON.stringify(sets) : null}::jsonb,
                        winner = ${winner},
                        cancelled = ${cancelled},
                        team1_players = ${JSON.stringify(team1Players)}::jsonb,
                        team2_players = ${JSON.stringify(team2Players)}::jsonb,
                        updated_at = NOW()
                    WHERE matchday_id = ${matchdayId}
                    AND match_index = ${i + 1}
                `;
            } else {
                updateQuery = sql`
                    UPDATE team_tournament_matchday_matches
                    SET sets = ${sets ? JSON.stringify(sets) : null}::jsonb,
                        winner = ${winner},
                        cancelled = ${cancelled},
                        updated_at = NOW()
                    WHERE matchday_id = ${matchdayId}
                    AND match_index = ${i + 1}
                `;
            }
            await updateQuery;
        }

        const normalizedStatus = status === 'completed' ? 'completed' : 'scheduled';
        if (normalizedStatus === 'completed' && !summary.winner) {
            return res.status(400).json({ message: 'Non puoi chiudere la giornata senza un vincitore deciso.' });
        }
        await sql`
            UPDATE team_tournament_matchdays
            SET status = ${normalizedStatus},
                summary_json = ${JSON.stringify({ ...summary, scoringType })}::jsonb,
                updated_at = NOW()
            WHERE id = ${matchdayId}
        `;

        if (normalizedStatus === 'completed') {
            const summaryWinner = summary?.winner || null;
            const winnerTeamNumber = summaryWinner === 'team1'
                ? matchdayResult[0].team1_number
                : (summaryWinner === 'team2' ? matchdayResult[0].team2_number : null);
            const loserTeamNumber = summaryWinner === 'team1'
                ? matchdayResult[0].team2_number
                : (summaryWinner === 'team2' ? matchdayResult[0].team1_number : null);
            await sql`
                UPDATE team_tournament_fixtures
                SET status = 'completed',
                    winner_team_number = ${winnerTeamNumber},
                    loser_team_number = ${loserTeamNumber},
                    updated_at = NOW()
                WHERE matchday_id = ${matchdayId}
            `;
        } else {
            await sql`
                UPDATE team_tournament_fixtures
                SET status = 'scheduled',
                    winner_team_number = NULL,
                    loser_team_number = NULL,
                    updated_at = NOW()
                WHERE matchday_id = ${matchdayId}
            `;
        }

        // Also update the child tournament status (so Tornei UI reflects completion)
        await sql`
            UPDATE tournaments
            SET status = ${normalizedStatus === 'completed' ? 'completed' : 'scheduled'}
            WHERE id = ${matchdayResult[0].tournament_day_id}
              AND workspace_id = ${req.workspaceId}
        `;

        if (normalizedStatus === 'completed') {
            await applyTeamMatchdayElo(matchdayId, req.workspaceId);
        }

        // Auto-generate/resolve playoff fixtures when a matchday completes.
        try {
            if (normalizedStatus === 'completed') {
                const rootId = matchdayResult[0].root_tournament_id;
                await tryGenerateTeamTournamentPlayoffs(rootId, req.workspaceId);
                await resolveFixtureTeamNumbers(rootId, req.workspaceId);
            } else if (previousStatus === 'completed') {
                const rootId = matchdayResult[0].root_tournament_id;
                if (phase === 'round_robin') {
                    await deleteTeamTournamentPlayoffState(rootId, req.workspaceId);
                } else {
                    const fixtureRows = await sql`
                        SELECT id
                        FROM team_tournament_fixtures
                        WHERE matchday_id = ${matchdayId}
                        LIMIT 1
                    `;
                    if (fixtureRows.length > 0) {
                        await resetTeamTournamentFixtureBranch(rootId, req.workspaceId, fixtureRows[0].id);
                    }
                }
            }
        } catch (e) {
            logger.warn('Playoff generation/resolve failed', { message: e?.message || String(e) });
        }

        res.json({ success: true, summary: { ...summary, scoringType } });
    } catch (error) {
        logger.error('Failed to save team tournament matchday results', error);
        res.status(500).json({ message: 'Errore nel salvataggio dei risultati', error: error.message });
    }
});

const upsertFixtures = async (rootId, wsId, fixtures) => {
    for (const f of fixtures) {
        await sql`
            INSERT INTO team_tournament_fixtures (root_tournament_id, phase, slot, team1_number, team2_number, winner_team_number, loser_team_number, is_bye, depends_on, status)
            VALUES (
                ${rootId},
                ${f.phase},
                ${f.slot},
                ${f.team1Number || null},
                ${f.team2Number || null},
                ${f.winnerTeamNumber || null},
                ${f.loserTeamNumber || null},
                ${!!f.isBye},
                ${f.dependsOn ? JSON.stringify(f.dependsOn) : null}::jsonb,
                ${f.status || 'planned'}
            )
            ON CONFLICT (root_tournament_id, phase, slot)
            DO UPDATE SET team1_number = EXCLUDED.team1_number,
                          team2_number = EXCLUDED.team2_number,
                          winner_team_number = EXCLUDED.winner_team_number,
                          loser_team_number = EXCLUDED.loser_team_number,
                          is_bye = EXCLUDED.is_bye,
                          depends_on = EXCLUDED.depends_on,
                          status = EXCLUDED.status,
                          updated_at = NOW()
        `;
    }
};

const buildTeamTournamentPlayoffFixtures = (finalPhase, standings) => {
    const top = (n) => standings.slice(0, n).map(r => r.teamNumber);
    const fixtures = [];

    if (finalPhase === 'FINALI') {
        const [a, b] = top(2);
        if (a && b) fixtures.push({ phase: 'final_1_2', slot: 1, team1Number: a, team2Number: b, status: 'planned', dependsOn: null });
    } else if (finalPhase === 'SEMIFINALI E FINALI') {
        const [a, b, c, d] = top(4);
        if (a && d) fixtures.push({ phase: 'semifinal', slot: 1, team1Number: a, team2Number: d, status: 'planned', dependsOn: null });
        if (b && c) fixtures.push({ phase: 'semifinal', slot: 2, team1Number: b, team2Number: c, status: 'planned', dependsOn: null });
        fixtures.push({ phase: 'final_1_2', slot: 1, team1Number: null, team2Number: null, status: 'planned', dependsOn: { type: 'winners', from: 'semifinal' } });
        fixtures.push({ phase: 'final_3_4', slot: 1, team1Number: null, team2Number: null, status: 'planned', dependsOn: { type: 'losers', from: 'semifinal' } });
    } else if (finalPhase === 'QUARTI, SEMIFINALI E FINALI') {
        const top8 = top(8);
        if (top8.length === 8) {
            fixtures.push({ phase: 'quarterfinal', slot: 1, team1Number: top8[0], team2Number: top8[7], status: 'planned', dependsOn: null });
            fixtures.push({ phase: 'quarterfinal', slot: 2, team1Number: top8[1], team2Number: top8[6], status: 'planned', dependsOn: null });
            fixtures.push({ phase: 'quarterfinal', slot: 3, team1Number: top8[2], team2Number: top8[5], status: 'planned', dependsOn: null });
            fixtures.push({ phase: 'quarterfinal', slot: 4, team1Number: top8[3], team2Number: top8[4], status: 'planned', dependsOn: null });
            fixtures.push({ phase: 'semifinal', slot: 1, team1Number: null, team2Number: null, status: 'planned', dependsOn: { type: 'winners', from: 'quarterfinal', slots: [1, 4] } });
            fixtures.push({ phase: 'semifinal', slot: 2, team1Number: null, team2Number: null, status: 'planned', dependsOn: { type: 'winners', from: 'quarterfinal', slots: [2, 3] } });
            fixtures.push({ phase: 'final_1_2', slot: 1, team1Number: null, team2Number: null, status: 'planned', dependsOn: { type: 'winners', from: 'semifinal' } });
            fixtures.push({ phase: 'final_3_4', slot: 1, team1Number: null, team2Number: null, status: 'planned', dependsOn: { type: 'losers', from: 'semifinal' } });
        }
    }

    return fixtures;
};

const tryGenerateTeamTournamentPlayoffs = async (rootId, wsId) => {
    // Load config and RR schedule
    const cfgRows = await sql`
        SELECT initial_team_count, matches_per_day, format, round_robin_final_phase, scoring_type, schedule_json, config_completed
        FROM team_tournament_configs
        WHERE tournament_id = ${rootId}
        LIMIT 1
    `;
    if (cfgRows.length === 0) return;
    const cfg = cfgRows[0];
    if (!cfg.config_completed) return;
    if (String(cfg.format || 'ROUND ROBIN') !== 'ROUND ROBIN') return;

    const expected = expectedRoundRobinPairingsCount(cfg.schedule_json, cfg.initial_team_count);
    if (expected <= 0) return;

    const rrCompletedRows = await sql`
        SELECT COUNT(*)::int AS count
        FROM team_tournament_matchdays d
        JOIN tournaments t ON t.id = d.tournament_day_id
        WHERE d.root_tournament_id = ${rootId}
          AND t.workspace_id = ${wsId}
          AND d.phase = 'round_robin'
          AND d.status = 'completed'
    `;
    const rrCompleted = Number(rrCompletedRows[0]?.count || 0);
    if (rrCompleted < expected) return;

    const finalPhase = cfg.round_robin_final_phase || 'FINALI';

    const existingFixtures = await sql`
        SELECT f.id, f.phase, f.slot, f.status
        FROM team_tournament_fixtures f
        JOIN tournaments t ON t.id = f.root_tournament_id
        WHERE f.root_tournament_id = ${rootId}
          AND t.workspace_id = ${wsId}
    `;
    const teams = await sql`
        SELECT team_number as "teamNumber", name
        FROM team_tournament_teams
        WHERE tournament_id = ${rootId}
        ORDER BY team_number ASC
    `;
    const matchdays = await sql`
        SELECT d.team1_number, d.team2_number, d.status, d.summary_json, d.phase
        FROM team_tournament_matchdays d
        JOIN tournaments t ON t.id = d.tournament_day_id
        WHERE d.root_tournament_id = ${rootId}
          AND t.workspace_id = ${wsId}
    `;
    const standings = calculateTeamTournamentStandingsServer(teams, matchdays, cfg.scoring_type || 'Punti');

    const fixtures = buildTeamTournamentPlayoffFixtures(finalPhase, standings);

    if (fixtures.length > 0) {
        const desiredKeys = new Set(fixtures.map(f => `${f.phase}:${f.slot}`));
        const existingKeys = new Set(existingFixtures.map(f => `${f.phase}:${f.slot}`));
        const hasStartedFixtures = existingFixtures.some(f => f.status !== 'planned');
        const structureMismatch =
            existingFixtures.length !== fixtures.length ||
            existingFixtures.some(f => !desiredKeys.has(`${f.phase}:${f.slot}`)) ||
            fixtures.some(f => !existingKeys.has(`${f.phase}:${f.slot}`));

        if (structureMismatch && !hasStartedFixtures && existingFixtures.length > 0) {
            await sql`DELETE FROM team_tournament_fixtures WHERE root_tournament_id = ${rootId}`;
        } else if (existingFixtures.length > 0 && !structureMismatch) {
            // Keep existing records when the bracket already matches the desired structure.
            return;
        } else if (hasStartedFixtures) {
            return;
        }

        await upsertFixtures(rootId, wsId, fixtures);
        logger.info('Generated team tournament playoff fixtures', { rootId, finalPhase, fixtures: fixtures.length, workspaceId: wsId });
    }
};

const resolveFixtureTeamNumbers = async (rootId, wsId) => {
    const fixtures = await sql`
        SELECT id, phase, slot, team1_number, team2_number, winner_team_number, loser_team_number, is_bye, depends_on, status, tournament_day_id, matchday_id
        FROM team_tournament_fixtures
        WHERE root_tournament_id = ${rootId}
        ORDER BY phase ASC, slot ASC
    `;
    if (fixtures.length === 0) return;

    const matchdays = await sql`
        SELECT d.id, d.tournament_day_id, d.team1_number, d.team2_number, d.status, d.summary_json, d.phase
        FROM team_tournament_matchdays d
        WHERE d.root_tournament_id = ${rootId}
    `;
    const matchdayByTournamentDayId = new Map(matchdays.map(md => [md.tournament_day_id, md]));
    const matchdayById = new Map(matchdays.map(md => [md.id, md]));

    const fixtureByPhaseSlot = new Map();
    fixtures.forEach(f => fixtureByPhaseSlot.set(`${f.phase}:${f.slot}`, f));

    const getWinnerLoser = (md) => {
        const s = md.summary_json || null;
        if (!s || md.status !== 'completed' || !s.winner) return null;
        const winner = s.winner === 'team1' ? md.team1_number : md.team2_number;
        const loser = s.winner === 'team1' ? md.team2_number : md.team1_number;
        return { winner, loser };
    };

    const keyFor = (f) => `${f.phase}:${f.slot}`;
    const stateByKey = new Map();
    fixtures.forEach(f => {
        stateByKey.set(keyFor(f), {
            id: f.id,
            phase: f.phase,
            slot: f.slot,
            team1: f.team1_number ?? null,
            team2: f.team2_number ?? null,
            winner: f.winner_team_number ?? null,
            loser: f.loser_team_number ?? null,
            isBye: !!f.is_bye,
            status: f.status,
            dependsOn: f.depends_on ?? null,
            tournamentDayId: f.tournament_day_id ?? null,
            matchdayId: f.matchday_id ?? null,
        });
    });

    const resultForFixture = (fixtureRow) => {
        if (!fixtureRow) return null;
        if (fixtureRow.winner_team_number) {
            return { winner: fixtureRow.winner_team_number, loser: fixtureRow.loser_team_number ?? null };
        }
        const md = fixtureRow.tournament_day_id
            ? matchdayByTournamentDayId.get(fixtureRow.tournament_day_id)
            : (fixtureRow.matchday_id ? matchdayById.get(fixtureRow.matchday_id) : null);
        return md ? getWinnerLoser(md) : null;
    };

    const normalizeDepSlots = (dep) => {
        const sourceSlots = Array.isArray(dep.slots) ? dep.slots : null;
        if (dep.type === 'winners' && dep.from === 'semifinal' && !sourceSlots) return [1, 2];
        if (dep.type === 'losers' && dep.from === 'semifinal' && !sourceSlots) return [1, 2];
        return Array.isArray(dep.slots) ? dep.slots : null;
    };

    // Seed initial results for sources from DB/matchdays.
    fixtures.forEach(f => {
        const k = keyFor(f);
        const s = stateByKey.get(k);
        if (!s) return;
        const r = resultForFixture(f);
        if (r?.winner) {
            s.winner = r.winner;
            s.loser = r.loser ?? null;
        } else if (s.isBye && (s.team1 || s.team2)) {
            s.winner = s.team1 || s.team2;
            s.loser = null;
        }
    });

    // Resolve dependents + auto-bye propagation until stable.
    // Important: Only auto-complete as bye when the missing side is definitively empty
    // (i.e. the source fixture is already completed and still yields no winner/loser).
    const maxPasses = 12;
    for (let pass = 0; pass < maxPasses; pass++) {
        let changed = false;

        for (const f of fixtures) {
            const dep = f.depends_on || null;
            if (!dep) continue;

            const targetKey = keyFor(f);
            const target = stateByKey.get(targetKey);
            if (!target) continue;
            // Don't auto-mutate fixtures that already have a matchday/tournamentDay bound.
            if (target.tournamentDayId || target.matchdayId) continue;

            const slots = normalizeDepSlots(dep);
            if (!Array.isArray(slots) || slots.length < 2) continue;

            const src1Key = `${dep.from}:${slots[0]}`;
            const src2Key = `${dep.from}:${slots[1]}`;
            const src1 = stateByKey.get(src1Key) || null;
            const src2 = stateByKey.get(src2Key) || null;

            const leftTeam = dep.type === 'losers' ? (src1?.loser ?? null) : (src1?.winner ?? null);
            const rightTeam = dep.type === 'losers' ? (src2?.loser ?? null) : (src2?.winner ?? null);

            const src1Settled = src1?.status === 'completed';
            const src2Settled = src2?.status === 'completed';
            const src1Value = dep.type === 'losers' ? (src1?.loser ?? null) : (src1?.winner ?? null);
            const src2Value = dep.type === 'losers' ? (src2?.loser ?? null) : (src2?.winner ?? null);
            const src1DefinitivelyNull = !!src1Settled && src1Value == null;
            const src2DefinitivelyNull = !!src2Settled && src2Value == null;

            const nextTeam1 = leftTeam;
            const nextTeam2 = rightTeam;

            const hadTeam1 = target.team1;
            const hadTeam2 = target.team2;
            if (hadTeam1 !== nextTeam1 || hadTeam2 !== nextTeam2) {
                target.team1 = nextTeam1;
                target.team2 = nextTeam2;
                changed = true;
            }

            const hasTwoTeams = !!target.team1 && !!target.team2;
            const hasOneTeam = (!!target.team1 && !target.team2) || (!target.team1 && !!target.team2);
            const hasNoTeams = !target.team1 && !target.team2;

            if (hasTwoTeams) {
                if (target.isBye || target.status !== 'planned' || target.winner || target.loser) {
                    target.isBye = false;
                    target.status = 'planned';
                    target.winner = null;
                    target.loser = null;
                    changed = true;
                }
            } else if (hasOneTeam) {
                const w = target.team1 || target.team2;
                const missingFromSrc1 = !target.team1; // left side missing
                const missingIsDefinitive = missingFromSrc1 ? src1DefinitivelyNull : src2DefinitivelyNull;
                // Only auto-complete this fixture when the missing side is definitively empty.
                if (missingIsDefinitive) {
                    if (!target.isBye || target.status !== 'completed' || target.winner !== w || target.loser) {
                        target.isBye = true;
                        target.status = 'completed';
                        target.winner = w;
                        target.loser = null;
                        changed = true;
                    }
                } else {
                    // Keep it pending until the other side is resolved.
                    if (target.isBye || target.status !== 'planned' || target.winner || target.loser) {
                        target.isBye = false;
                        target.status = 'planned';
                        target.winner = null;
                        target.loser = null;
                        changed = true;
                    }
                }
            } else if (hasNoTeams) {
                // Only auto-complete empty fixtures when both sources are definitively empty.
                if (src1DefinitivelyNull && src2DefinitivelyNull) {
                    if (!target.isBye || target.status !== 'completed' || target.winner || target.loser) {
                        target.isBye = true;
                        target.status = 'completed';
                        target.winner = null;
                        target.loser = null;
                        changed = true;
                    }
                } else {
                    if (target.isBye || target.status !== 'planned' || target.winner || target.loser) {
                        target.isBye = false;
                        target.status = 'planned';
                        target.winner = null;
                        target.loser = null;
                        changed = true;
                    }
                }
            }
        }

        if (!changed) break;
    }

    // Persist derived state (teams + auto-bye status) back to DB.
    for (const s of stateByKey.values()) {
        if (s.tournamentDayId || s.matchdayId) continue;
        await sql`
            UPDATE team_tournament_fixtures
            SET team1_number = ${s.team1},
                team2_number = ${s.team2},
                is_bye = ${!!s.isBye},
                status = ${s.status},
                winner_team_number = ${s.isBye ? (s.winner ?? null) : null},
                loser_team_number = ${s.isBye ? null : null},
                updated_at = NOW()
            WHERE id = ${s.id}
        `;
    }
};

const deleteTeamTournamentPlayoffState = async (rootId, wsId) => {
    const playoffMatchdays = await sql`
        SELECT d.id, d.tournament_day_id
        FROM team_tournament_matchdays d
        JOIN tournaments root ON root.id = d.root_tournament_id
        WHERE d.root_tournament_id = ${rootId}
          AND root.workspace_id = ${wsId}
          AND d.phase <> 'round_robin'
    `;

    const playoffMatchdayIds = playoffMatchdays.map(r => r.id).filter(Boolean);
    const tournamentDayIds = playoffMatchdays.map(r => r.tournament_day_id).filter(Boolean);

    if (playoffMatchdayIds.length > 0) {
        await sql`
            DELETE FROM team_tournament_matchdays
            WHERE id = ANY(${playoffMatchdayIds}::uuid[])
        `;
    }

    if (tournamentDayIds.length > 0) {
        // Find all matches for these playoff matchdays to delete them and revert ELO
        const matchesResult = await sql`
            SELECT id FROM matches 
            WHERE tournament_id = ANY(${tournamentDayIds}::uuid[]) 
              AND workspace_id = ${wsId}
        `;
        const matchIds = matchesResult.map(m => m.id);
        
        if (matchIds.length > 0) {
            await sql`DELETE FROM matches WHERE id = ANY(${matchIds}::uuid[])`;
        }
        
        await sql`
            DELETE FROM tournaments
            WHERE id = ANY(${tournamentDayIds}::uuid[])
              AND workspace_id = ${wsId}
        `;
    }

    // UPDATE fixtures to reset them, rather than deleting them
    await sql`
        UPDATE team_tournament_fixtures
        SET team1_number = NULL,
            team2_number = NULL,
            winner_team_number = NULL,
            loser_team_number = NULL,
            status = 'planned',
            tournament_day_id = NULL,
            matchday_id = NULL
        WHERE root_tournament_id = ${rootId}
    `;
    
    // Also revert ELO for the ROOT tournament since it's no longer completed
    const rootTournamentStatus = await sql`
        SELECT status FROM tournaments WHERE id = ${rootId} AND workspace_id = ${wsId}
    `;
    
    if (rootTournamentStatus.length > 0 && rootTournamentStatus[0].status === 'completed') {
        const eloHistoryResult = await sql`
            SELECT player_id, delta FROM elo_history
            WHERE event_id = ${rootId} AND type = 'tournament' AND workspace_id = ${wsId}
        `;

        for (const record of eloHistoryResult) {
            await sql`
                UPDATE players SET current_elo = current_elo - ${record.delta}
                WHERE id = ${record.player_id} AND workspace_id = ${wsId}
            `;
        }

        await sql`DELETE FROM elo_history WHERE event_id = ${rootId} AND type = 'tournament' AND workspace_id = ${wsId}`;
        await sql`UPDATE tournaments SET status = 'scheduled' WHERE id = ${rootId} AND workspace_id = ${wsId}`;
    }
    
    return tournamentDayIds; // Return them in case the caller needs them
};

const resetTeamTournamentFixtureBranch = async (rootId, wsId, sourceFixtureId) => {
    const fixtures = await sql`
        SELECT f.id, f.phase, f.slot, f.team1_number, f.team2_number, f.winner_team_number, f.loser_team_number, f.is_bye, f.depends_on, f.status, f.tournament_day_id, f.matchday_id
        FROM team_tournament_fixtures f
        JOIN tournaments t ON t.id = f.root_tournament_id
        WHERE f.root_tournament_id = ${rootId}
          AND t.workspace_id = ${wsId}
    `;
    if (fixtures.length === 0) return;

    const byId = new Map(fixtures.map(f => [f.id, f]));
    const source = byId.get(sourceFixtureId);
    if (!source) return;

    const keyFor = (f) => `${f.phase}:${f.slot}`;
    const sourceKey = keyFor(source);
    const dependentsByKey = new Map();

    const addDependent = (upstreamKey, dependentId) => {
        if (!dependentsByKey.has(upstreamKey)) dependentsByKey.set(upstreamKey, []);
        dependentsByKey.get(upstreamKey).push(dependentId);
    };

    fixtures.forEach(f => {
        const dep = f.depends_on || null;
        if (!dep) return;
        if (dep.from === 'semifinal' && !Array.isArray(dep.slots)) {
            addDependent('semifinal:1', f.id);
            addDependent('semifinal:2', f.id);
            return;
        }
        if (Array.isArray(dep.slots)) {
            dep.slots.forEach(slot => addDependent(`${dep.from}:${slot}`, f.id));
        }
    });

    const affectedIds = new Set([sourceFixtureId]);
    const queue = [sourceKey];
    while (queue.length > 0) {
        const currentKey = queue.shift();
        const dependentIds = dependentsByKey.get(currentKey) || [];
        dependentIds.forEach(id => {
            if (affectedIds.has(id)) return;
            affectedIds.add(id);
            const fixture = byId.get(id);
            if (fixture) queue.push(keyFor(fixture));
        });
    }

    const affectedFixtures = fixtures.filter(f => affectedIds.has(f.id));
    const tournamentDayIdsToDelete = affectedFixtures
        .map(f => f.tournament_day_id)
        .filter(Boolean);

    if (tournamentDayIdsToDelete.length > 0) {
        await sql`
            DELETE FROM tournaments
            WHERE id = ANY(${tournamentDayIdsToDelete}::uuid[])
              AND workspace_id = ${wsId}
        `;
    }

    for (const fixture of affectedFixtures) {
        const isSource = fixture.id === sourceFixtureId;
        const hasDependency = !!fixture.depends_on;
        await sql`
            UPDATE team_tournament_fixtures
            SET status = 'planned',
                tournament_day_id = NULL,
                matchday_id = NULL,
                winner_team_number = ${fixture.is_bye ? fixture.winner_team_number : null},
                loser_team_number = NULL,
                team1_number = ${isSource || !hasDependency ? fixture.team1_number : null},
                team2_number = ${isSource || !hasDependency ? fixture.team2_number : null},
                updated_at = NOW()
            WHERE id = ${fixture.id}
        `;
    }

    await resolveFixtureTeamNumbers(rootId, wsId);
};

// POST /api/team-tournaments/:id/elimination/reset - Hard reset + rebuild elimination bracket (admin only)
app.post('/api/team-tournaments/:id/elimination/reset', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const force = !!req.body?.force;

        const tournamentRows = await sql`
            SELECT id, type, giornata_name, team_tournament_root_id
            FROM tournaments
            WHERE id = ${id}
              AND workspace_id = ${req.workspaceId}
            LIMIT 1
        `;
        if (tournamentRows.length === 0) {
            return res.status(404).json({ message: 'Torneo non trovato' });
        }

        const tournament = tournamentRows[0];
        if (tournament.type !== 'Torneo a Squadre') {
            return res.status(400).json({ message: 'Endpoint valido solo per Torneo a Squadre' });
        }

        const rootId = tournament.team_tournament_root_id || tournament.id;

        const cfgRows = await sql`
            SELECT format, config_completed
            FROM team_tournament_configs
            WHERE tournament_id = ${rootId}
            LIMIT 1
        `;
        if (cfgRows.length === 0) {
            return res.status(400).json({ message: 'Configurazione torneo non trovata' });
        }
        const cfg = cfgRows[0];
        if (String(cfg.format || 'ROUND ROBIN') !== 'ELIMINAZIONE DIRETTA') {
            return res.status(400).json({ message: 'Il torneo non è ELIMINAZIONE DIRETTA' });
        }
        if (!cfg.config_completed) {
            return res.status(400).json({ message: 'Config non completata: completa la configurazione prima del reset' });
        }

        const startedRows = await sql`
            SELECT COUNT(*)::int AS count
            FROM team_tournament_fixtures f
            JOIN tournaments t ON t.id = f.root_tournament_id
            WHERE f.root_tournament_id = ${rootId}
              AND t.workspace_id = ${req.workspaceId}
              AND f.is_bye = FALSE
              AND (
                f.tournament_day_id IS NOT NULL OR
                f.matchday_id IS NOT NULL OR
                f.status <> 'planned'
              )
        `;
        const hasStarted = Number(startedRows[0]?.count || 0) > 0;
        if (hasStarted && !force) {
            return res.status(409).json({
                message: 'Esistono partite/risultati già inseriti. Ripeti con { "force": true } per resettare comunque.',
            });
        }

        const teams = await sql`
            SELECT team_number as "teamNumber", name, is_seeded as "isSeeded"
            FROM team_tournament_teams
            WHERE tournament_id = ${rootId}
            ORDER BY team_number ASC
        `;
        if (teams.length < 2) {
            return res.status(400).json({ message: 'Servono almeno 2 squadre per generare il tabellone' });
        }

        await deleteTeamTournamentPlayoffState(rootId, req.workspaceId);

        const fixtures = buildTeamTournamentEliminationFixtures(teams);
        await upsertFixtures(rootId, req.workspaceId, fixtures);
        await resolveFixtureTeamNumbers(rootId, req.workspaceId);

        const out = await sql`
            SELECT id, phase, slot, team1_number, team2_number, winner_team_number, loser_team_number, is_bye, depends_on, status, tournament_day_id, matchday_id
            FROM team_tournament_fixtures
            WHERE root_tournament_id = ${rootId}
            ORDER BY
                CASE phase
                    WHEN 'round_of_32' THEN 1
                    WHEN 'round_of_16' THEN 2
                    WHEN 'quarterfinal' THEN 3
                    WHEN 'semifinal' THEN 4
                    WHEN 'final_3_4' THEN 5
                    WHEN 'final_1_2' THEN 6
                    ELSE 99
                END,
                slot ASC
        `;

        logger.info('Elimination bracket reset', { rootId, fixtures: out.length, forced: force });
        return res.json({ message: 'Bracket eliminazione diretta rigenerato', rootId, fixtures: out });
    } catch (error) {
        logger.error('Failed to reset elimination bracket', error);
        return res.status(500).json({ message: 'Failed to reset elimination bracket', error: error.message });
    }
});

// GET /api/team-tournaments/:id/player-stats - Aggregate per-player stats for team tournament (silent leaderboard)
app.get('/api/team-tournaments/:id/player-stats', async (req, res) => {
    try {
        const { id } = req.params; // root tournament id

        const rootTournamentResult = await sql`
            SELECT id
            FROM tournaments
            WHERE id = ${id}
            AND workspace_id = ${req.workspaceId}
            AND type = ${'Torneo a Squadre'}
            LIMIT 1
        `;
        if (rootTournamentResult.length === 0) {
            return res.status(404).json({ message: 'Torneo a squadre non trovato' });
        }

        const configResult = await sql`
            SELECT scoring_type
            FROM team_tournament_configs
            WHERE tournament_id = ${id}
            LIMIT 1
        `;
        const scoringType = configResult.length > 0 ? (configResult[0].scoring_type || 'Punti') : 'Punti';

        const matchdaysResult = await sql`
            SELECT d.id, d.matches_per_day
            FROM team_tournament_matchdays d
            JOIN tournaments t ON t.id = d.tournament_day_id
            WHERE d.root_tournament_id = ${id}
            AND t.workspace_id = ${req.workspaceId}
            ORDER BY d.date ASC, d.created_at ASC
        `;
        const matchdayIds = matchdaysResult.map(r => r.id);
        const subMatchesResult = matchdayIds.length > 0 ? await sql`
            SELECT matchday_id, match_index, team1_players, team2_players, sets, winner, cancelled
            FROM team_tournament_matchday_matches
            WHERE matchday_id = ANY(${matchdayIds}::uuid[])
            ORDER BY matchday_id ASC, match_index ASC
        ` : [];

        const statsByKey = new Map(); // key = "name|surname"
        const getOrInit = (p) => {
            const key = `${String(p?.name || '').trim()}|${String(p?.surname || '').trim()}`.toLowerCase();
            if (!statsByKey.has(key)) {
                statsByKey.set(key, {
                    name: String(p?.name || '').trim(),
                    surname: String(p?.surname || '').trim(),
                    matchesPlayed: 0,
                    matchesWon: 0,
                    matchesLost: 0,
                    gamesWon: 0,
                    gamesLost: 0,
                });
            }
            return statsByKey.get(key);
        };

        const isBlankSets = (sets) => {
            if (!Array.isArray(sets) || sets.length === 0) return true;
            return sets.every(s => Number(s?.team1 || 0) === 0 && Number(s?.team2 || 0) === 0);
        };

        for (const sm of subMatchesResult) {
            if (sm.cancelled) continue;
            const t1Players = Array.isArray(sm.team1_players) ? sm.team1_players : [];
            const t2Players = Array.isArray(sm.team2_players) ? sm.team2_players : [];
            if (t1Players.length !== 2 || t2Players.length !== 2) continue;
            const sets = sm.sets || null;
            if (isBlankSets(sets)) continue; // unplayed
            const winner = sm.winner || calcMatchWinnerFromSets(sets, scoringType);
            if (winner !== 'team1' && winner !== 'team2') continue;

            let t1Games = 0;
            let t2Games = 0;
            for (const s of (Array.isArray(sets) ? sets : [])) {
                t1Games += Number(s?.team1 || 0);
                t2Games += Number(s?.team2 || 0);
            }

            for (const p of t1Players) {
                const st = getOrInit(p);
                st.matchesPlayed += 1;
                st.gamesWon += t1Games;
                st.gamesLost += t2Games;
                if (winner === 'team1') st.matchesWon += 1;
                if (winner === 'team2') st.matchesLost += 1;
            }
            for (const p of t2Players) {
                const st = getOrInit(p);
                st.matchesPlayed += 1;
                st.gamesWon += t2Games;
                st.gamesLost += t1Games;
                if (winner === 'team2') st.matchesWon += 1;
                if (winner === 'team1') st.matchesLost += 1;
            }
        }

        const stats = Array.from(statsByKey.values())
            .filter(r => r.name && r.surname)
            .map(r => ({
                ...r,
                gamesDiff: r.gamesWon - r.gamesLost,
                winPercentage: r.matchesPlayed > 0 ? Math.round((r.matchesWon / r.matchesPlayed) * 100) : 0,
            }))
            .sort((a, b) => {
                if (b.winPercentage !== a.winPercentage) return b.winPercentage - a.winPercentage;
                if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
                return (a.surname + a.name).localeCompare(b.surname + b.name);
            });

        res.json({ stats });
    } catch (error) {
        logger.error('Failed to compute team tournament player stats', error);
        res.status(500).json({ message: 'Errore nel calcolo delle statistiche giocatori', error: error.message });
    }
});

// GET /api/team-tournaments/:id/fixtures - List playoff fixtures for team tournament root
app.get('/api/team-tournaments/:id/fixtures', async (req, res) => {
    try {
        const { id } = req.params;
        const rootTournamentResult = await sql`
            SELECT id
            FROM tournaments
            WHERE id = ${id}
            AND workspace_id = ${req.workspaceId}
            AND type = ${'Torneo a Squadre'}
            LIMIT 1
        `;
        if (rootTournamentResult.length === 0) {
            return res.status(404).json({ message: 'Torneo a squadre non trovato' });
        }

        // Ensure fixtures are generated if Round Robin is complete
        try {
            await tryGenerateTeamTournamentPlayoffs(id, req.workspaceId);
            await resolveFixtureTeamNumbers(id, req.workspaceId);
        } catch (e) {
            logger.warn('Fixtures auto-generate/resolve failed', { message: e?.message || String(e) });
        }

        let fixtures = await sql`
            SELECT id, root_tournament_id, phase, slot, team1_number, team2_number, winner_team_number, loser_team_number, is_bye, depends_on, status, tournament_day_id, matchday_id, created_at, updated_at
            FROM team_tournament_fixtures
            WHERE root_tournament_id = ${id}
            ORDER BY 
                CASE phase
                    WHEN 'round_of_32' THEN 1
                    WHEN 'round_of_16' THEN 2
                    WHEN 'quarterfinal' THEN 3
                    WHEN 'semifinal' THEN 4
                    WHEN 'final_3_4' THEN 5
                    WHEN 'final_1_2' THEN 6
                    ELSE 9
                END ASC,
                slot ASC
        `;

        const cfgRows = await sql`
            SELECT initial_team_count, format, round_robin_final_phase, scoring_type, schedule_json, config_completed
            FROM team_tournament_configs
            WHERE tournament_id = ${id}
            LIMIT 1
        `;
        const cfg = cfgRows[0] || null;

        // Self-heal elimination-direct brackets if legacy "empty vs empty" slots were skipped.
        if (cfg?.config_completed && String(cfg.format || 'ROUND ROBIN') === 'ELIMINAZIONE DIRETTA') {
            // Consider the bracket "started" only when we have created real playoff matchdays.
            // Legacy/broken fixtures may have status flips, but without matchdays they are safe to rebuild.
            const playoffMatchdays = await sql`
                SELECT COUNT(*)::int AS count
                FROM team_tournament_matchdays d
                JOIN tournaments t ON t.id = d.tournament_day_id
                WHERE d.root_tournament_id = ${id}
                  AND t.workspace_id = ${req.workspaceId}
                  AND d.phase <> 'round_robin'
            `;
            const hasPlayoffMatchdays = Number(playoffMatchdays[0]?.count || 0) > 0;

            const teams = await sql`
                SELECT team_number, name, is_seeded
                FROM team_tournament_teams
                WHERE tournament_id = ${id}
                ORDER BY team_number ASC
            `;

            const generated = buildTeamTournamentEliminationFixtures(
                teams.map(team => ({
                    teamNumber: Number(team.team_number),
                    name: team.name,
                    isSeeded: !!team.is_seeded,
                }))
            );

            if (generated.length > 0) {
                const desiredKeys = new Set(generated.map(f => `${f.phase}:${f.slot}`));
                const existingKeys = new Set(fixtures.map(f => `${f.phase}:${f.slot}`));
                const structureMismatch =
                    fixtures.length !== generated.length ||
                    fixtures.some(f => !desiredKeys.has(`${f.phase}:${f.slot}`)) ||
                    generated.some(f => !existingKeys.has(`${f.phase}:${f.slot}`));

                if (structureMismatch && !hasPlayoffMatchdays) {
                    // Full reset (from zero) of playoff state: delete any existing bracket rows and rebuild coherently.
                    await sql`DELETE FROM team_tournament_fixtures WHERE root_tournament_id = ${id}`;
                    await upsertFixtures(id, req.workspaceId, generated);
                    await resolveFixtureTeamNumbers(id, req.workspaceId);
                    fixtures = await sql`
                        SELECT id, root_tournament_id, phase, slot, team1_number, team2_number, winner_team_number, loser_team_number, is_bye, depends_on, status, tournament_day_id, matchday_id, created_at, updated_at
                        FROM team_tournament_fixtures
                        WHERE root_tournament_id = ${id}
                        ORDER BY 
                            CASE phase
                                WHEN 'round_of_32' THEN 1
                                WHEN 'round_of_16' THEN 2
                                WHEN 'quarterfinal' THEN 3
                                WHEN 'semifinal' THEN 4
                                WHEN 'final_3_4' THEN 5
                                WHEN 'final_1_2' THEN 6
                                ELSE 9
                            END ASC,
                            slot ASC
                    `;
                }
            }
        }

        // Self-heal legacy tournaments completed before playoff generation was introduced.
        if (fixtures.length === 0) {
            if (cfgRows.length > 0) {
                const expected = expectedRoundRobinPairingsCount(cfg.schedule_json, cfg.initial_team_count);
                const rrCompletedRows = await sql`
                    SELECT COUNT(*)::int AS count
                    FROM team_tournament_matchdays d
                    JOIN tournaments t ON t.id = d.tournament_day_id
                    WHERE d.root_tournament_id = ${id}
                      AND t.workspace_id = ${req.workspaceId}
                      AND d.phase = 'round_robin'
                      AND d.status = 'completed'
                `;
                const rrCompleted = Number(rrCompletedRows[0]?.count || 0);
                if (
                    cfg.config_completed &&
                    String(cfg.format || 'ROUND ROBIN') === 'ROUND ROBIN' &&
                    cfg.round_robin_final_phase &&
                    expected > 0 &&
                    rrCompleted >= expected
                ) {
                    const teams = await sql`
                        SELECT team_number as "teamNumber", name
                        FROM team_tournament_teams
                        WHERE tournament_id = ${id}
                        ORDER BY team_number ASC
                    `;
                    const matchdays = await sql`
                        SELECT d.team1_number, d.team2_number, d.status, d.summary_json, d.phase
                        FROM team_tournament_matchdays d
                        JOIN tournaments t ON t.id = d.tournament_day_id
                        WHERE d.root_tournament_id = ${id}
                          AND t.workspace_id = ${req.workspaceId}
                    `;
                    const standings = calculateTeamTournamentStandingsServer(teams, matchdays, cfg.scoring_type || 'Punti');
                    const generated = buildTeamTournamentPlayoffFixtures(cfg.round_robin_final_phase, standings);
                    if (generated.length > 0) {
                        await upsertFixtures(id, req.workspaceId, generated);
                        await resolveFixtureTeamNumbers(id, req.workspaceId);
                        fixtures = await sql`
                            SELECT id, root_tournament_id, phase, slot, team1_number, team2_number, winner_team_number, loser_team_number, is_bye, depends_on, status, tournament_day_id, matchday_id, created_at, updated_at
                            FROM team_tournament_fixtures
                            WHERE root_tournament_id = ${id}
                            ORDER BY 
                                CASE phase
                                    WHEN 'round_of_32' THEN 1
                                    WHEN 'round_of_16' THEN 2
                                    WHEN 'quarterfinal' THEN 3
                                    WHEN 'semifinal' THEN 4
                                    WHEN 'final_3_4' THEN 5
                                    WHEN 'final_1_2' THEN 6
                                    ELSE 9
                                END ASC,
                                slot ASC
                        `;
                    }
                }
                if (
                    cfg.config_completed &&
                    String(cfg.format || 'ROUND ROBIN') === 'ELIMINAZIONE DIRETTA'
                ) {
                    const teams = await sql`
                        SELECT team_number, name, is_seeded
                        FROM team_tournament_teams
                        WHERE tournament_id = ${id}
                        ORDER BY team_number ASC
                    `;
                    const generated = buildTeamTournamentEliminationFixtures(
                        teams.map(team => ({
                            teamNumber: Number(team.team_number),
                            name: team.name,
                            isSeeded: !!team.is_seeded,
                        }))
                    );
                    if (generated.length > 0) {
                        await upsertFixtures(id, req.workspaceId, generated);
                        await resolveFixtureTeamNumbers(id, req.workspaceId);
                        fixtures = await sql`
                            SELECT id, root_tournament_id, phase, slot, team1_number, team2_number, winner_team_number, loser_team_number, is_bye, depends_on, status, tournament_day_id, matchday_id, created_at, updated_at
                            FROM team_tournament_fixtures
                            WHERE root_tournament_id = ${id}
                            ORDER BY 
                                CASE phase
                                    WHEN 'round_of_32' THEN 1
                                    WHEN 'round_of_16' THEN 2
                                    WHEN 'quarterfinal' THEN 3
                                    WHEN 'semifinal' THEN 4
                                    WHEN 'final_3_4' THEN 5
                                    WHEN 'final_1_2' THEN 6
                                    ELSE 9
                                END ASC,
                                slot ASC
                        `;
                    }
                }
            }
        }

        res.json({
            fixtures: fixtures.map(f => ({
                id: f.id,
                rootTournamentId: f.root_tournament_id,
                phase: f.phase,
                slot: f.slot,
                team1Number: f.team1_number ?? null,
                team2Number: f.team2_number ?? null,
                winnerTeamNumber: f.winner_team_number ?? null,
                loserTeamNumber: f.loser_team_number ?? null,
                isBye: !!f.is_bye,
                dependsOn: f.depends_on || null,
                status: f.status,
                tournamentDayId: f.tournament_day_id || null,
                matchdayId: f.matchday_id || null,
                createdAt: f.created_at,
                updatedAt: f.updated_at,
            })),
        });
    } catch (error) {
        logger.error('Failed to fetch team tournament fixtures', error);
        res.status(500).json({ message: 'Errore nel recupero della fase finale', error: error.message });
    }
});

// POST /api/tournaments/bulk-matches - Add tournament with multiple matches
app.post('/api/tournaments/bulk-matches', async (req, res) => {
    try {
        const { tournament, matches } = req.body;
        if (!tournament || !matches || !Array.isArray(matches)) {
            return res.status(400).json({ message: 'Missing or invalid tournament/matches data' });
        }

        let tournamentId;
        const parentTournamentName = tournament.parentTournamentName || tournament.giornataName || null;
        const dayLabel = tournament.dayLabel || tournament.name;
        
        // ALWAYS create a new tournament entry for each giornata
        // giornataName is used to link multiple giornate to the same tournament series
        const tournamentResult = await sql`
            INSERT INTO tournaments (name, type, date, club, status, giornata_name, parent_tournament_name, day_label, final_standings, americano_fields, americano_scoring_type, num_gironi, playoff_type, workspace_id)
            VALUES (${tournament.name}, ${tournament.type}, ${tournament.date}, ${tournament.club}, ${tournament.status || 'scheduled'}, ${tournament.giornataName || null}, ${parentTournamentName}, ${dayLabel}, ${tournament.finalStandings ? JSON.stringify(tournament.finalStandings) : null}, ${tournament.americanoFields || null}, ${tournament.americanoScoringType || null}, ${tournament.numGironi || null}, ${tournament.playoffType || null}, ${req.workspaceId})
            RETURNING id
        `;
        tournamentId = tournamentResult[0].id;
        
        if (tournament.giornataName) {
            logger.info("Created new giornata linked to tournament series", { 
                tournamentId, 
                giornataName: tournament.giornataName,
                date: tournament.date,
                name: tournament.name
            });
        } else {
            logger.info("Created new standalone tournament", { 
                tournamentId, 
                name: tournament.name,
                date: tournament.date
            });
        }

        const allPlayerIds = new Set();
        matches.forEach((match) => {
            match.team1.forEach(id => allPlayerIds.add(id));
            match.team2.forEach(id => allPlayerIds.add(id));
        });

        // Get their starting ELOs for this tournament (use current global ELO)
        const playerIdsArray = Array.from(allPlayerIds);

        // USE GLOBAL ELO: Always use current_elo from players table
        // This ensures tournaments always use the latest ELO rating
        const playersData = {};
        for (const playerId of playerIdsArray) {
            const playerResult = await sql`
                SELECT current_elo FROM players WHERE id = ${playerId} AND workspace_id = ${req.workspaceId}
            `;
            if (playerResult.length > 0) {
                playersData[playerId] = playerResult[0].current_elo;
                logger.debug("Player ELO starting point", { playerId: playerId.substring(0, 8), elo: playerResult[0].current_elo, source: "global current_elo" });
            } else {
                playersData[playerId] = 1500;
                logger.warn("Player not found, using default ELO", { playerId: playerId.substring(0, 8) });
            }
        }

        // Track ELO changes for each player across all matches
        const playerEloChanges = new Map();

        // Determine if this is Round Robin + Finali to use phase-specific K factors
        const isRoundRobinFinali = tournament.type === 'Round Robin + Finali';
        const totalMatches = matches.length;
        const roundRobinMatchCount = isRoundRobinFinali ? totalMatches - 2 : totalMatches;
        
        // Process matches sequentially
        for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
            const match = matches[matchIndex];
            const result = await sql`
                INSERT INTO matches (date, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, sets, winner, tournament_id, workspace_id, round_number)
                VALUES (${match.date}, ${match.team1[0]}, ${match.team1[1]}, ${match.team2[0]}, ${match.team2[1]}, ${JSON.stringify(match.sets)}, ${match.winner || null}, ${tournamentId}, ${req.workspaceId}, ${match.roundNumber || null})
                RETURNING id
            `;
            const matchId = result[0].id;

            // Only calculate ELO if tournament is completed and match has a winner
            if (tournament.status === 'completed' && match.winner) {
                // Use tournament-specific ELOs (updated as we process matches)
                const team1P1Elo = playersData[match.team1[0]];
                const team1P2Elo = playersData[match.team1[1]];
                const team2P1Elo = playersData[match.team2[0]];
                const team2P2Elo = playersData[match.team2[1]];

                const team1EloAvg = (team1P1Elo + team1P2Elo) / 2;
                const team2EloAvg = (team2P1Elo + team2P2Elo) / 2;
                let score1;
                if (match.winner === 'team1') {
                    score1 = 1;
                } else if (match.winner === 'team2') {
                    score1 = 0;
                } else { // draw
                    score1 = 0.5;
                }
                
                // Determine phase for Round Robin + Finali
                let phase;
                if (isRoundRobinFinali) {
                    if (matchIndex < roundRobinMatchCount) {
                        phase = 'roundRobin';
                    } else if (matchIndex === roundRobinMatchCount) {
                        phase = 'finals1st2nd'; // First final is for 1st-2nd place
                    } else {
                        phase = 'finals3rd4th'; // Second final is for 3rd-4th place
                    }
                }
                
                // Determine phase for Gironi + Fase Finale
                if (tournament.type === 'Gironi + Fase Finale') {
                    const finalsCount = 4;
                    const gironiMatchCount = totalMatches - finalsCount;
                    
                    if (matchIndex < gironiMatchCount) {
                        phase = 'gironi';
                    } else if (matchIndex < gironiMatchCount + 2) {
                        phase = 'semifinals';
                    } else if (matchIndex === gironiMatchCount + 2) {
                        phase = 'finals3rd4th';
                    } else {
                        phase = 'finals1st2nd';
                    }
                }
                
                const { delta1, delta2 } = calculateEloChange(team1EloAvg, team2EloAvg, score1, tournament.type, phase);
                
                logger.debug("Match ELO calculation", { match: matchIndex + 1, team1Avg: team1EloAvg.toFixed(2), team2Avg: team2EloAvg.toFixed(2), delta1: delta1.toFixed(2), delta2: delta2.toFixed(2) });
                
                // Update tournament-specific ELO (in memory, not in DB current_elo)
                for (const playerId of match.team1) {
                    const oldElo = playersData[playerId];
                    const newElo = oldElo + delta1;
                    playersData[playerId] = newElo; // Update for next match in this tournament
                    
                    // Track total change for this player
                    if (!playerEloChanges.has(playerId)) {
                        playerEloChanges.set(playerId, { oldElo, totalDelta: 0 });
                    }
                    playerEloChanges.get(playerId).totalDelta += delta1;
                }
                
                for (const playerId of match.team2) {
                    const oldElo = playersData[playerId];
                    const newElo = oldElo + delta2;
                    playersData[playerId] = newElo; // Update for next match in this tournament
                    
                    // Track total change for this player
                    if (!playerEloChanges.has(playerId)) {
                        playerEloChanges.set(playerId, { oldElo, totalDelta: 0 });
                    }
                    playerEloChanges.get(playerId).totalDelta += delta2;
                }
            }
        }
        
        // Create SINGLE ELO history record per player for the entire tournament (only if completed)
        if (tournament.status === 'completed') {
            for (const [playerId, { oldElo, totalDelta }] of playerEloChanges) {
                const newElo = oldElo + totalDelta;
                await sql`
                    INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id, source_label)
                    VALUES (${tournamentId}, ${playerId}, ${oldElo}, ${newElo}, ${totalDelta}, ${tournament.date}, 'tournament', ${req.workspaceId}, ${tournament.name})
                `;

                const currentGlobalElo = (await sql`SELECT current_elo FROM players WHERE id = ${playerId} AND workspace_id = ${req.workspaceId}`)[0].current_elo;
                const newGlobalElo = currentGlobalElo + totalDelta;
                await sql`UPDATE players SET current_elo = ${newGlobalElo} WHERE id = ${playerId} AND workspace_id = ${req.workspaceId}`;
                logger.eloChange(playerId, currentGlobalElo, newGlobalElo, totalDelta, 'tournament (global update)');
            }
        }

        res.json({ message: 'Torneo e partite aggiunti con successo', tournamentId });
    } catch (error) {
        logger.error("Failed to bulk add matches", error);
        res.status(500).json({ message: 'Failed to bulk add matches', error: error.message });
    }
});

// PUT /api/tournaments/complete - Complete a tournament (update status and calculate ELO)
app.put('/api/tournaments/complete', async (req, res) => {
    try {
        const { tournamentId } = req.body;
        if (!tournamentId) {
            return res.status(400).json({ message: 'Tournament ID is required' });
        }
        
        logger.tournament("complete", tournamentId, { action: "starting completion" });
        
        // Update tournament status to completed
        logger.debug("Updating tournament status", { tournamentId, newStatus: "completed" });
        const updateResult = await sql`
            UPDATE tournaments SET status = 'completed' WHERE id = ${tournamentId} AND workspace_id = ${req.workspaceId}
        `;
        logger.debug("Tournament status updated", { rows: updateResult.length });

        // Verify the update
        const verifyResult = await sql`
            SELECT status FROM tournaments WHERE id = ${tournamentId} AND workspace_id = ${req.workspaceId}
        `;
        logger.debug("Tournament status verified", { status: verifyResult[0]?.status });

        // Get all matches for this tournament
        const matchesResult = await sql`
            SELECT id, team1_p1_id, team1_p2_id, team2_p1_id, team2_p2_id, sets, winner
            FROM matches WHERE tournament_id = ${tournamentId} AND workspace_id = ${req.workspaceId}
            ORDER BY date ASC, id ASC
        `;

        logger.info("Processing tournament matches", { tournamentId, matchCount: matchesResult.length });

        // Idempotency: clean up any existing elo_history for this tournament BEFORE loading player ELOs
        const existingHistory = await sql`
            SELECT player_id, delta FROM elo_history
            WHERE event_id = ${tournamentId} AND type = 'tournament' AND workspace_id = ${req.workspaceId}
        `;
        if (existingHistory.length > 0) {
            logger.warn("Found existing elo_history for tournament, reverting before re-completion", {
                tournamentId, existingRecords: existingHistory.length
            });
            for (const record of existingHistory) {
                await sql`UPDATE players SET current_elo = current_elo - ${record.delta} WHERE id = ${record.player_id} AND workspace_id = ${req.workspaceId}`;
            }
            await sql`DELETE FROM elo_history WHERE event_id = ${tournamentId} AND type = 'tournament' AND workspace_id = ${req.workspaceId}`;
        }

        // Get tournament info
        const tournamentInfo = await sql`SELECT name, type, date FROM tournaments WHERE id = ${tournamentId} AND workspace_id = ${req.workspaceId}`;
        const tournamentName = tournamentInfo[0].name;
        const tournamentType = tournamentInfo[0].type;
        const tournamentDate = tournamentInfo[0].date;
        
        // Get all player IDs involved
        const allPlayerIds = new Set();
        matchesResult.forEach(m => {
            allPlayerIds.add(m.team1_p1_id);
            allPlayerIds.add(m.team1_p2_id);
            allPlayerIds.add(m.team2_p1_id);
            allPlayerIds.add(m.team2_p2_id);
        });
        
        // USE GLOBAL ELO: Always use current_elo from players table
        const playerIdsArray = Array.from(allPlayerIds);
        const playersData = {};

        for (const playerId of playerIdsArray) {
            const playerResult = await sql`
                SELECT current_elo FROM players WHERE id = ${playerId} AND workspace_id = ${req.workspaceId}
            `;
            if (playerResult.length > 0) {
                playersData[playerId] = playerResult[0].current_elo;
                logger.debug("Player ELO starting point", { playerId: playerId.substring(0, 8), elo: playerResult[0].current_elo, source: "global current_elo" });
            } else {
                playersData[playerId] = 1500;
                logger.warn("Player not found, using default ELO", { playerId: playerId.substring(0, 8) });
            }
        }

        const playerEloChanges = new Map();

        // Process each match using tournament-specific ELO
        for (let matchIndex = 0; matchIndex < matchesResult.length; matchIndex++) {
            const match = matchesResult[matchIndex];
            
            if (!match.winner) {
                logger.warn("Match has no winner, skipping ELO calculation", { matchId: match.id });
                continue;
            }
            
            // Use tournament-specific ELOs (updated as we process matches)
            const team1P1Elo = playersData[match.team1_p1_id];
            const team1P2Elo = playersData[match.team1_p2_id];
            const team2P1Elo = playersData[match.team2_p1_id];
            const team2P2Elo = playersData[match.team2_p2_id];

            const team1EloAvg = (team1P1Elo + team1P2Elo) / 2;
            const team2EloAvg = (team2P1Elo + team2P2Elo) / 2;
            const score1 = match.winner === 'team1' ? 1 : (match.winner === 'draw' ? 0.5 : 0);
            
            // Determine phase securely using distance from end of array
            let phase = null;
            const isRoundRobinFinali = tournamentType === 'Round Robin + Finali';
            if (isRoundRobinFinali) {
                if (matchIndex === matchesResult.length - 2) {
                    phase = 'finals1st2nd';
                } else if (matchIndex === matchesResult.length - 1) {
                    phase = 'finals3rd4th';
                } else {
                    phase = 'roundRobin';
                }
            } else if (tournamentType === 'Gironi + Fase Finale') {
                if (matchIndex === matchesResult.length - 1) {
                    phase = 'finals1st2nd';
                } else if (matchIndex === matchesResult.length - 2) {
                    phase = 'finals3rd4th';
                } else if (matchIndex === matchesResult.length - 3 || matchIndex === matchesResult.length - 4) {
                    phase = 'semifinals';
                } else {
                    phase = 'gironi';
                }
            }
            
            // ELO calculation using configured K-factors (with phase support)
            const { delta1, delta2 } = calculateEloChange(team1EloAvg, team2EloAvg, score1, tournamentType, phase);
            
            logger.debug('Match ELO calculation', { 
                match: matchIndex + 1, 
                team1Avg: team1EloAvg.toFixed(2), 
                team2Avg: team2EloAvg.toFixed(2), 
                delta1: delta1.toFixed(2), 
                delta2: delta2.toFixed(2), 
                phase: phase || null 
            });
            
            // Update tournament-specific ELO (in memory)
            for (const playerId of [match.team1_p1_id, match.team1_p2_id]) {
                const oldElo = playersData[playerId];
                const newElo = oldElo + delta1;
                playersData[playerId] = newElo;
                
                // Track total change for this player
                if (!playerEloChanges.has(playerId)) {
                    playerEloChanges.set(playerId, { oldElo, totalDelta: 0 });
                }
                playerEloChanges.get(playerId).totalDelta += delta1;
            }
            
            for (const playerId of [match.team2_p1_id, match.team2_p2_id]) {
                const oldElo = playersData[playerId];
                const newElo = oldElo + delta2;
                playersData[playerId] = newElo;
                
                // Track total change for this player
                if (!playerEloChanges.has(playerId)) {
                    playerEloChanges.set(playerId, { oldElo, totalDelta: 0 });
                }
                playerEloChanges.get(playerId).totalDelta += delta2;
            }
        }
        
        // Create SINGLE ELO history record per player for the entire tournament
        for (const [playerId, { totalDelta }] of playerEloChanges) {
            const updateResult = await sql`
                UPDATE players SET current_elo = current_elo + ${totalDelta} 
                WHERE id = ${playerId} AND workspace_id = ${req.workspaceId}
                RETURNING current_elo
            `;
            const newGlobalElo = updateResult[0].current_elo;
            const actualOldElo = newGlobalElo - totalDelta;

            await sql`
                INSERT INTO elo_history (event_id, player_id, elo_before, elo_after, delta, date, type, workspace_id, source_label)
                VALUES (${tournamentId}, ${playerId}, ${actualOldElo}, ${newGlobalElo}, ${totalDelta}, ${tournamentDate}, 'tournament', ${req.workspaceId}, ${tournamentName})
            `;

            logger.eloChange(playerId, actualOldElo, newGlobalElo, totalDelta, 'tournament (global update)');
        }
        
        logger.tournament("complete", tournamentId, { updatedPlayers: playerEloChanges.size, status: "success" });
        res.json({ 
            message: 'Torneo completato con successo',
            updatedPlayers: playerEloChanges.size
        });
    } catch (error) {
        logger.error("Failed to complete tournament", error);
        res.status(500).json({ message: 'Failed to complete tournament', error: error.message });
    }
});

// POST /api/tournaments/cascade-reset - Reset tournament phases (delete phase matches, revert ELO, reset status)
app.post('/api/tournaments/cascade-reset', async (req, res) => {
    try {
        const { tournamentId, phaseMatchIds } = req.body;
        if (!tournamentId || !phaseMatchIds || !Array.isArray(phaseMatchIds)) {
            return res.status(400).json({ message: 'Missing required fields: tournamentId, phaseMatchIds' });
        }

        logger.info('Cascade reset initiated', { tournamentId, phaseMatchCount: phaseMatchIds.length });

        // Get tournament status
        const tournamentResult = await sql`SELECT status FROM tournaments WHERE id = ${tournamentId} AND workspace_id = ${req.workspaceId}`;
        if (tournamentResult.length === 0) {
            return res.status(404).json({ message: 'Torneo non trovato' });
        }

        const wasCompleted = tournamentResult[0].status === 'completed';

        if (wasCompleted) {
            // Revert ELO changes for this tournament
            const eloHistoryResult = await sql`
                SELECT player_id, delta FROM elo_history
                WHERE event_id = ${tournamentId} AND type = 'tournament' AND workspace_id = ${req.workspaceId}
            `;

            for (const record of eloHistoryResult) {
                await sql`
                    UPDATE players SET current_elo = current_elo - ${record.delta}
                    WHERE id = ${record.player_id} AND workspace_id = ${req.workspaceId}
                `;
            }

            // Delete ELO history for this tournament
            await sql`DELETE FROM elo_history WHERE event_id = ${tournamentId} AND type = 'tournament' AND workspace_id = ${req.workspaceId}`;

            // Reset status to scheduled
            await sql`UPDATE tournaments SET status = 'scheduled' WHERE id = ${tournamentId} AND workspace_id = ${req.workspaceId}`;

            logger.info('Tournament ELO reverted and status reset to scheduled', {
                tournamentId, revertedPlayers: eloHistoryResult.length
            });
        }

        // Delete phase matches
        for (const matchId of phaseMatchIds) {
            await sql`DELETE FROM matches WHERE id = ${matchId} AND workspace_id = ${req.workspaceId}`;
        }

        logger.info('Cascade reset completed', {
            tournamentId, wasCompleted, deletedMatches: phaseMatchIds.length
        });

        res.json({
            success: true,
            wasCompleted,
            deletedMatches: phaseMatchIds.length
        });
    } catch (error) {
        logger.error('Failed cascade reset', error);
        res.status(500).json({ message: 'Failed cascade reset', error: error.message });
    }
});

// ATOMIC RESET: Reset all ELO to 1500 and clear all history
app.post('/api/reset-all-elo', async (req, res) => {
    try {
        logger.warn("ATOMIC RESET initiated: Setting all ELO to 1500 and clearing history", { workspace: req.workspaceId });

        // Reset all players to 1500 ELO (only in this workspace)
        await sql`UPDATE players SET current_elo = 1500 WHERE workspace_id = ${req.workspaceId}`;

        // Clear all ELO history
        await sql`DELETE FROM elo_history WHERE workspace_id = ${req.workspaceId}`;

        // Clear all matches
        await sql`DELETE FROM matches WHERE workspace_id = ${req.workspaceId}`;

        // Clear all tournaments
        await sql`DELETE FROM tournaments WHERE workspace_id = ${req.workspaceId}`;
        
        logger.warn('ATOMIC RESET: All ELO reset to 1500, all history cleared');
        res.json({ message: 'All ELO reset to 1500 and all history cleared successfully' });
    } catch (error) {
        logger.error('Failed atomic reset', error);
        res.status(500).json({ message: 'Failed atomic reset', error: error.message });
    }
});

// Serve static files from dist directory (Vite build output)
app.use(express.static(path.join(__dirname, 'dist')));

// Serve the React app for all non-API routes (SPA fallback)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        logger.banner();
        logger.info(`Server started successfully`, {
            port: PORT,
            url: `http://localhost:${PORT}`,
            database: 'Neon PostgreSQL',
            environment: process.env.NODE_ENV || 'development',
            mode: 'Full-stack (Frontend + API)'
        });
    });
}

export default app;
