import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import bodyParser from 'body-parser';
import { ApprovalCache } from '../gateway/ApprovalCache';

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const approvalCache = new ApprovalCache();
const logPath = './logs/audit.log';

// API: Get Logs
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

// API: Get Approvals
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

// API: Update Approval
app.post('/api/approvals/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // APPROVED or REJECTED

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  await approvalCache.updateStatus(id, status as 'APPROVED' | 'REJECTED');
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Permiscope Dashboard running at http://localhost:${port}`);
});
