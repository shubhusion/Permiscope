import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import bodyParser from 'body-parser';
import { ApprovalCache } from '../gateway/ApprovalCache';

const app = express();
const port = 3000;

// Security: API token from environment variable
const API_TOKEN = process.env.PERMISCOPE_DASHBOARD_TOKEN;

if (!API_TOKEN) {
  console.warn(
    '⚠️  PERMISCOPE_DASHBOARD_TOKEN not set. Dashboard API is unauthenticated! ' +
    'Set this environment variable in production for security.'
  );
}

// Security: Restrict CORS to localhost only
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST'],
  credentials: true,
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const approvalCache = new ApprovalCache();
const logPath = './logs/audit.log';

// Authentication middleware for API routes
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
        } catch (e) {
          return null;
        }
      })
      .filter((l) => l !== null)
      .reverse(); // Newest first
    res.json(logs);
  } catch (e) {
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
  const exists = all.some(item => item.id === id);
  if (!exists) {
    return res.status(404).json({ error: 'Approval request not found' });
  }

  await approvalCache.updateStatus(id, status as 'APPROVED' | 'REJECTED');
  res.json({ success: true });
});


app.listen(port, () => {
  console.log(`Permiscope Dashboard running at http://localhost:${port}`);
});
