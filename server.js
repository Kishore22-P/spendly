// Spendly — Express API Server (Firebase Auth Verification + PostgreSQL Database)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import pg from 'pg';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'spendy-6a620';
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const { Pool, Client } = pg;

function buildPgConfig(databaseOverride) {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;

  if (connectionString) {
    const isLocalUrl = /localhost|127\.0\.0\.1/i.test(connectionString);
    const useSsl = process.env.PGSSL === 'true' || (process.env.PGSSL !== 'false' && !isLocalUrl);
    return {
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : false
    };
  }
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: databaseOverride || process.env.PGDATABASE || 'spendly',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
  };
}

const pool = new Pool(buildPgConfig());
let dbReady = false;
let dbError = null;
let initPromise = null;

async function initDatabase() {
  const hasRemoteEnv = Boolean(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.PGHOST
  );
  if (process.env.VERCEL && !hasRemoteEnv) {
    throw new Error(
      'Missing PostgreSQL configuration on Vercel. Add DATABASE_URL (or connect Neon/Postgres Storage) in Vercel Project Settings -> Environment Variables and redeploy.'
    );
  }

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    // Auto-create database if it does not exist yet (PostgreSQL code 3D000)
    if (
      err.code === '3D000' &&
      !process.env.DATABASE_URL &&
      !process.env.POSTGRES_URL &&
      !process.env.POSTGRES_URL_NON_POOLING
    ) {
      const targetDb = process.env.PGDATABASE || 'spendly';
      if (/^[a-zA-Z0-9_]+$/.test(targetDb)) {
        const adminClient = new Client(buildPgConfig('postgres'));
        await adminClient.connect();
        await adminClient.query(`CREATE DATABASE "${targetDb}"`);
        await adminClient.end();
      }
    } else {
      throw err;
    }
  }

  const schemaSql = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schemaSql);
  dbReady = true;
  dbError = null;
  console.log('PostgreSQL connected and Spendly schema verified.');
}

async function ensureDatabase() {
  if (dbReady) return true;
  if (!initPromise) {
    initPromise = initDatabase().catch((err) => {
      dbReady = false;
      dbError = err.message;
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  return true;
}

// ==========================================================================
// Cryptographic Firebase ID Token Verification (no private key file needed)
// ==========================================================================

let cachedJwks = null;
let jwksExpiresAt = 0;

async function getFirebaseJwks() {
  const now = Date.now();
  if (cachedJwks && now < jwksExpiresAt) {
    return cachedJwks;
  }
  const res = await fetch(JWK_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public keys (${res.status})`);
  }
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const data = await res.json();
  cachedJwks = data.keys || [];
  jwksExpiresAt = now + maxAgeSec * 1000;
  return cachedJwks;
}

function decodeBase64UrlJson(segment) {
  const json = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(json);
}

const verifiedTokenCache = new Map();

async function verifyFirebaseIdToken(token) {
  const nowSec = Math.floor(Date.now() / 1000);
  const cached = verifiedTokenCache.get(token);
  if (cached && cached.exp > nowSec + 30) {
    return cached.user;
  }

  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson(headerB64);
  const payload = decodeBase64UrlJson(payloadB64);

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Invalid token algorithm or key ID');
  }

  const jwks = await getFirebaseJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error('Unknown signing key');
  }

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = Buffer.from(signatureB64, 'base64url');
  const validSig = crypto.verify('RSA-SHA256', signingInput, publicKey, signature);
  if (!validSig) {
    throw new Error('Invalid token signature');
  }

  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error('Invalid token audience');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Invalid token issuer');
  }
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('Missing subject');
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) throw new Error('Token expired');
  if (typeof payload.auth_time === 'number' && payload.auth_time > nowSec + 300) {
    throw new Error('Invalid auth_time');
  }

  const user = {
    uid: payload.sub,
    email: payload.email || '',
    name: payload.name || ''
  };

  verifiedTokenCache.set(token, { user, exp: payload.exp });
  if (verifiedTokenCache.size > 2000) {
    verifiedTokenCache.clear();
  }

  return user;
}

async function requireFirebaseAuth(req, res, next) {
  try {
    await ensureDatabase();
  } catch (err) {
    return res.status(503).json({
      error: err.message || dbError || 'PostgreSQL database is not connected. Check your environment settings.'
    });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required.' });
  }

  const token = authHeader.slice(7).trim();
  try {
    req.user = await verifyFirebaseIdToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: `Invalid authentication token: ${err.message}` });
  }
}

function mapExpenseRow(row) {
  return {
    id: String(row.id),
    title: row.title,
    amount: Number(row.amount),
    category: row.category,
    date: row.date,
    paymentMethod: row.payment_method,
    notes: row.notes || '',
    createdAt: new Date(row.created_at).getTime()
  };
}

function validateExpenseBody(body) {
  const title = String(body?.title || '').trim();
  const amount = Number(body?.amount);
  const category = String(body?.category || '').trim();
  const date = String(body?.date || '').trim();
  const paymentMethod = String(body?.paymentMethod || '').trim();
  const notes = String(body?.notes || '').trim();

  if (!title || title.length > 120) return { error: 'Title is required (max 120 characters).' };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    return { error: 'Amount must be greater than zero.' };
  }
  if (!category || category.length > 60) return { error: 'Category is required.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date must be YYYY-MM-DD.' };
  if (!paymentMethod || paymentMethod.length > 40) return { error: 'Payment method is required.' };
  if (notes.length > 500) return { error: 'Notes cannot exceed 500 characters.' };

  return {
    data: {
      title,
      amount: Math.round(amount * 100) / 100,
      category,
      date,
      paymentMethod,
      notes
    }
  };
}

// ==========================================================================
// Express App & Routes
// ==========================================================================

const app = express();
app.use(express.json({ limit: '1mb' }));

// Block access to server internals & environment files
app.use((req, res, next) => {
  const blocked = ['/server.js', '/package.json', '/package-lock.json', '/vercel.json', '/.env', '/.env.example', '/.gitignore', '/firestore.rules'];
  if (blocked.includes(req.path) || req.path.startsWith('/db/') || req.path.startsWith('/node_modules/') || req.path === '/api/index.js') {
    return res.status(404).end();
  }
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await ensureDatabase();
    await pool.query('SELECT 1');
    return res.json({ ok: true, database: 'postgresql' });
  } catch (err) {
    return res.status(503).json({ ok: false, database: 'disconnected', error: err.message });
  }
});

// Sync / bootstrap user profile + budgets row
app.post('/api/users/sync', requireFirebaseAuth, async (req, res) => {
  const { uid, email } = req.user;
  const fallbackName = String(req.body?.name || req.user.name || email.split('@')[0] || 'Spendly User').trim();
  try {
    await pool.query(
      `INSERT INTO users (uid, name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (uid) DO UPDATE SET email = COALESCE(NULLIF(EXCLUDED.email, ''), users.email)`,
      [uid, fallbackName, email]
    );
    await pool.query(
      `INSERT INTO budgets (uid, daily, weekly, monthly)
       VALUES ($1, 0, 0, 0)
       ON CONFLICT (uid) DO NOTHING`,
      [uid]
    );

    const profileRes = await pool.query(
      `SELECT u.uid, u.name, u.email, u.created_at, b.daily, b.weekly, b.monthly
       FROM users u
       LEFT JOIN budgets b ON b.uid = u.uid
       WHERE u.uid = $1`,
      [uid]
    );
    const row = profileRes.rows[0];
    return res.json({
      uid: row.uid,
      name: row.name,
      email: row.email,
      createdAt: row.created_at,
      budgets: {
        daily: Number(row.daily) || 0,
        weekly: Number(row.weekly) || 0,
        monthly: Number(row.monthly) || 0
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/profile', requireFirebaseAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.uid, u.name, u.email, u.created_at, b.daily, b.weekly, b.monthly
       FROM users u
       LEFT JOIN budgets b ON b.uid = u.uid
       WHERE u.uid = $1`,
      [req.user.uid]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found.' });
    }
    const row = result.rows[0];
    return res.json({
      uid: row.uid,
      name: row.name,
      email: row.email,
      createdAt: row.created_at,
      budgets: {
        daily: Number(row.daily) || 0,
        weekly: Number(row.weekly) || 0,
        monthly: Number(row.monthly) || 0
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch('/api/profile', requireFirebaseAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 100) {
    return res.status(400).json({ error: 'Display name is required (max 100 characters).' });
  }
  try {
    await pool.query(
      `INSERT INTO users (uid, name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (uid) DO UPDATE SET name = EXCLUDED.name`,
      [req.user.uid, name, req.user.email]
    );
    return res.json({ name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/budgets', requireFirebaseAuth, async (req, res) => {
  const daily = Math.max(0, Math.round((Number(req.body?.daily) || 0) * 100) / 100);
  const weekly = Math.max(0, Math.round((Number(req.body?.weekly) || 0) * 100) / 100);
  const monthly = Math.max(0, Math.round((Number(req.body?.monthly) || 0) * 100) / 100);

  try {
    await pool.query(
      `INSERT INTO budgets (uid, daily, weekly, monthly, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (uid) DO UPDATE
       SET daily = EXCLUDED.daily,
           weekly = EXCLUDED.weekly,
           monthly = EXCLUDED.monthly,
           updated_at = NOW()`,
      [req.user.uid, daily, weekly, monthly]
    );
    return res.json({ daily, weekly, monthly });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/expenses', requireFirebaseAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, amount, category, TO_CHAR(date, 'YYYY-MM-DD') AS date, payment_method, notes, created_at
       FROM expenses
       WHERE uid = $1
       ORDER BY date DESC, id DESC`,
      [req.user.uid]
    );
    return res.json(result.rows.map(mapExpenseRow));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/expenses/:id', requireFirebaseAuth, async (req, res) => {
  const expenseId = Number(req.params.id);
  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    return res.status(400).json({ error: 'Invalid expense ID.' });
  }
  try {
    const result = await pool.query(
      `SELECT id, title, amount, category, TO_CHAR(date, 'YYYY-MM-DD') AS date, payment_method, notes, created_at
       FROM expenses
       WHERE id = $1 AND uid = $2`,
      [expenseId, req.user.uid]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    return res.json(mapExpenseRow(result.rows[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', requireFirebaseAuth, async (req, res) => {
  const { error, data } = validateExpenseBody(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const result = await pool.query(
      `INSERT INTO expenses (uid, title, amount, category, date, payment_method, notes)
       VALUES ($1, $2, $3, $4, $5::date, $6, $7)
       RETURNING id, title, amount, category, TO_CHAR(date, 'YYYY-MM-DD') AS date, payment_method, notes, created_at`,
      [req.user.uid, data.title, data.amount, data.category, data.date, data.paymentMethod, data.notes]
    );
    return res.status(201).json(mapExpenseRow(result.rows[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/expenses/:id', requireFirebaseAuth, async (req, res) => {
  const expenseId = Number(req.params.id);
  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    return res.status(400).json({ error: 'Invalid expense ID.' });
  }
  const { error, data } = validateExpenseBody(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const result = await pool.query(
      `UPDATE expenses
       SET title = $1, amount = $2, category = $3, date = $4::date, payment_method = $5, notes = $6
       WHERE id = $7 AND uid = $8
       RETURNING id, title, amount, category, TO_CHAR(date, 'YYYY-MM-DD') AS date, payment_method, notes, created_at`,
      [data.title, data.amount, data.category, data.date, data.paymentMethod, data.notes, expenseId, req.user.uid]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    return res.json(mapExpenseRow(result.rows[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', requireFirebaseAuth, async (req, res) => {
  const expenseId = Number(req.params.id);
  if (!Number.isInteger(expenseId) || expenseId <= 0) {
    return res.status(400).json({ error: 'Invalid expense ID.' });
  }
  try {
    const result = await pool.query(
      'DELETE FROM expenses WHERE id = $1 AND uid = $2 RETURNING id',
      [expenseId, req.user.uid]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found.' });
    }
    return res.json({ deleted: true, id: String(expenseId) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Serve frontend static assets
app.use(
  express.static(__dirname, {
    setHeaders(res, filePath) {
      if (/\.(html|css|js|json)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    }
  })
);

if (!process.env.VERCEL) {
  ensureDatabase()
    .catch((err) => {
      console.error('PostgreSQL initialization failed:', err.message);
      console.error('Update PGPASSWORD / DATABASE_URL in .env and ensure PostgreSQL is running.');
    })
    .finally(() => {
      const server = app.listen(PORT, () => {
        console.log(`Spendly running at http://localhost:${PORT}`);
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${PORT} is already in use. Close the other window using port ${PORT} and try again.`);
        } else {
          console.error('Server error:', err.message);
        }
        process.exit(1);
      });
    });
}

export default app;
