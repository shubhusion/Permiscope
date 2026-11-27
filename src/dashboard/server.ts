import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';

import { ApprovalCache } from '../gateway/ApprovalCache';
import { AuditLogger } from '../logging/AuditLogger';

const app = express();
const port = 3000;

// Security: API token from environment variable
const API_TOKEN = process.env.PERMISCOPE_DASHBOARD_TOKEN;

if (!API_TOKEN) {
  console.warn(
    '⚠️  PERMISCOPE_DASHBOARD_TOKEN not set. Dashboard API is unauthenticated! ' +
      'Set this environment variable in production for security.',
  );
}

// Security: Restrict CORS to localhost only
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  }),
);

app.use(express.json());

const webDist = path.resolve(__dirname, '../../dist/web');
const staticDir = fs.existsSync(webDist) ? webDist : path.join(__dirname, 'public');
app.use(express.static(staticDir));

const approvalCache = new ApprovalCache();
const auditLogger = new AuditLogger();
const logPath = './logs/audit.log';

// Authentication middleware for API routes
const authMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  // Skip auth in development if no token is set
  if (!API_TOKEN) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized. Provide valid Bearer token.' });
  }
  next();
};

// API: Audit chain status (read-only, no auth required)
app.get('/api/chain', (_req, res) => {
  const result = auditLogger.verifyChain();
  const entries = fs.existsSync(logPath)
    ? fs
        .readFileSync(logPath, 'utf-8')
        .split('\n')
        .filter((line) => line.trim() !== '').length
    : 0;
  res.json({
    valid: result.valid,
    errors: result.errors,
    entries,
    checks: ['sequence', 'hash links', 'head record', 'signatures', 'parse validity'],
  });
});

// API: Get Logs (read-only, no auth required)
app.get('/api/logs', (req, res) => {
  if (!fs.existsSync(logPath)) {
    return res.json([]);
  }

  try {
    const fileContent = fs.readFileSync(logPath, 'utf-8');
    const logs = fileContent
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((l) => l !== null)
      .reverse(); // Newest first
    res.json(logs);
  } catch {
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// API: Get Approvals (read-only, no auth required)
app.get('/api/approvals', async (req, res) => {
  const approvals = await approvalCache.getAll();
  // Filter for pending only? Or all? Let's return all but sort pending to top
  const sorted = approvals.sort((a, b) => {
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
    return 0;
  });
  res.json(sorted);
});

// API: Update Approval (PROTECTED - requires auth)
app.post('/api/approvals/:id', authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body; // APPROVED or REJECTED

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  // Validate that the ID exists before updating
  const all = await approvalCache.getAll();
  const exists = all.some((item) => item.id === id);
  if (!exists) {
    return res.status(404).json({ error: 'Approval request not found' });
  }

  await approvalCache.updateStatus(id, status as 'APPROVED' | 'REJECTED');
  res.json({ success: true });
});

// SPA fallback for the built console. Hash routing means this is a convenience,
// not a requirement, but it keeps deep links working on the local server.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  const index = path.join(staticDir, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  next();
});

app.listen(port, () => {
  console.log(`Permiscope Dashboard running at http://localhost:${port}`);
});
