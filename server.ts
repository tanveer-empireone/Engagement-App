import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'server-state.json');

const ADMIN_EMAIL = 'tanveer@empireonecx.com';

export interface PersonRecord {
  Email: string;
  Name: string;
  Role: 'Admin' | 'Engagement Lead' | 'Site Manager' | 'Creative Designer' | 'Officer';
  Site: string;
  Shift: string;
  Active: boolean;
  Avatar?: string;
}

export interface AppIntegrationConfig {
  sheetId: string;
  driveRootId: string;
  clickUpTeamId: string;
  clickUpSpaceId: string;
  appsScriptUrl: string;
}

export interface ServerStore {
  people: PersonRecord[];
  config: AppIntegrationConfig;
  uploads: any[];
  directions: any[];
  shiftReports: any[];
  showCaptureForAdmin: boolean;
  syncHealth: any;
  clickUpToken: string;
}

const INITIAL_STORE: ServerStore = {
  people: [
    {
      Email: ADMIN_EMAIL,
      Name: 'Tanveer',
      Role: 'Admin',
      Site: 'Cebu City',
      Shift: 'Peak',
      Active: true
    }
  ],
  config: {
    sheetId: '1Ts2VFZawgF2SmU4VSQf0ld6p7cEHkmE2GLzc-dKfk5E',
    driveRootId: '1U-cZodmbBU6R7cFwp0p4Ily2_KPhPiSN',
    clickUpTeamId: '90161592694',
    clickUpSpaceId: '1300380000003391',
    appsScriptUrl: ''
  },
  uploads: [],
  directions: [],
  shiftReports: [],
  showCaptureForAdmin: false,
  syncHealth: {
    version: '2.0.0',
    workspace: '90161592694',
    space: '1300380000003391',
    spaceName: 'Engagement',
    runner: 'engagement@empireonecx.com',
    paused: false,
    lastSync: '',
    syncState: 'OK',
    stages: []
  },
  clickUpToken: ''
};

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

function readStore(): ServerStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const peopleList: PersonRecord[] = Array.isArray(parsed.people) ? parsed.people : INITIAL_STORE.people;
      // Guarantee tanveer is present and admin
      const hasAdmin = peopleList.some((p) => normalizeEmail(p.Email) === ADMIN_EMAIL);
      if (!hasAdmin) {
        peopleList.unshift(INITIAL_STORE.people[0]);
      } else {
        for (const p of peopleList) {
          if (normalizeEmail(p.Email) === ADMIN_EMAIL) {
            p.Role = 'Admin';
            p.Active = true;
          }
        }
      }

      return {
        people: peopleList,
        config: parsed.config && typeof parsed.config === 'object' ? { ...INITIAL_STORE.config, ...parsed.config } : INITIAL_STORE.config,
        uploads: Array.isArray(parsed.uploads) ? parsed.uploads : INITIAL_STORE.uploads,
        directions: Array.isArray(parsed.directions) ? parsed.directions : INITIAL_STORE.directions,
        shiftReports: Array.isArray(parsed.shiftReports) ? parsed.shiftReports : INITIAL_STORE.shiftReports,
        showCaptureForAdmin: Boolean(parsed.showCaptureForAdmin),
        syncHealth: parsed.syncHealth && typeof parsed.syncHealth === 'object' ? parsed.syncHealth : INITIAL_STORE.syncHealth,
        clickUpToken: typeof parsed.clickUpToken === 'string' ? parsed.clickUpToken : ''
      };
    }
  } catch (err) {
    console.warn('Failed reading server store, initializing fresh store:', err);
  }

  // File doesn't exist yet, create it
  writeStore(INITIAL_STORE);
  return INITIAL_STORE;
}

function writeStore(store: ServerStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tempPath = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tempPath, DATA_FILE);
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  // Close each document response. A localhost tunnel that reuses a socket
  // Node already finished reports ERR_EMPTY_RESPONSE (-324) in Chrome.
  app.use((req, res, next) => {
    if (!req.headers.upgrade) res.setHeader('Connection', 'close');
    next();
  });

  // Proxy ClickUp API requests to avoid CORS in browser and proxy through backend
  app.all('/api/clickup/*', async (req, res) => {
    const subPath = req.url.replace(/^\/api\/clickup/, '');
    const targetUrl = `https://api.clickup.com/api/v2${subPath}`;
    try {
      const headers: Record<string, string> = {};
      if (req.headers.authorization) headers.Authorization = req.headers.authorization as string;
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'] as string;
      const fetchOptions: RequestInit = {
        method: req.method,
        headers
      };
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }
      const response = await fetch(targetUrl, fetchOptions);
      const data = await response.text();
      res.status(response.status);
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('content-type', contentType);
      res.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // REST API: Get full server state
  app.get('/api/state', (_req, res) => {
    const store = readStore();
    res.json(store);
  });

  // REST API: Ensure session user is recorded on the server
  app.post('/api/session/ensure-user', (req, res) => {
    const { email, name, photoURL } = req.body || {};
    if (!email || typeof email !== 'string') {
      res.status(400).json({ ok: false, message: 'Valid email required' });
      return;
    }
    const store = readStore();
    const key = normalizeEmail(email);
    const existingIndex = store.people.findIndex((p) => normalizeEmail(p.Email) === key);

    if (existingIndex === -1) {
      const newPerson: PersonRecord = {
        Email: email.trim(),
        Name: (name && String(name).trim()) || email.split('@')[0],
        Role: key === ADMIN_EMAIL ? 'Admin' : 'Officer',
        Site: 'Cebu City',
        Shift: 'Peak',
        Active: true,
        Avatar: photoURL || undefined
      };
      store.people.unshift(newPerson);
      writeStore(store);
    } else {
      let changed = false;
      if (key === ADMIN_EMAIL && store.people[existingIndex].Role !== 'Admin') {
        store.people[existingIndex].Role = 'Admin';
        store.people[existingIndex].Active = true;
        changed = true;
      }
      if (photoURL && store.people[existingIndex].Avatar !== photoURL) {
        store.people[existingIndex].Avatar = photoURL;
        changed = true;
      }
      if (changed) writeStore(store);
    }

    res.json({ ok: true, people: store.people });
  });

  // REST API: Update app configuration
  app.post('/api/admin/config', (req, res) => {
    const store = readStore();
    store.config = {
      ...store.config,
      ...(req.body || {})
    };
    writeStore(store);
    res.json({ ok: true, config: store.config, message: 'Configuration saved to server.' });
  });

  // REST API: Add user
  app.post('/api/admin/users', (req, res) => {
    const { email, name, role, site, shift } = req.body || {};
    if (!email || !String(email).includes('@')) {
      res.status(400).json({ ok: false, message: 'Enter a full email address.' });
      return;
    }
    const store = readStore();
    const key = normalizeEmail(email);
    if (store.people.some((p) => normalizeEmail(p.Email) === key)) {
      res.status(400).json({ ok: false, message: 'That email is already on the roster. Edit the existing row.' });
      return;
    }

    const newPerson: PersonRecord = {
      Email: String(email).trim(),
      Name: (name && String(name).trim()) || String(email).split('@')[0],
      Role: key === ADMIN_EMAIL ? 'Admin' : (role || 'Officer'),
      Site: site || 'Cebu City',
      Shift: shift || 'Peak',
      Active: true
    };
    store.people.push(newPerson);
    writeStore(store);

    res.json({
      ok: true,
      people: store.people,
      message: `${newPerson.Email} is saved as ${newPerson.Role} on the server.`
    });
  });

  // REST API: Update user
  app.put('/api/admin/users/:email', (req, res) => {
    const email = req.params.email;
    const patch = req.body || {};
    const store = readStore();
    const key = normalizeEmail(email);
    const index = store.people.findIndex((p) => normalizeEmail(p.Email) === key);

    if (index === -1) {
      res.status(404).json({ ok: false, message: 'That person is not on the roster.' });
      return;
    }

    const existing = store.people[index];
    const isAdminAccount = key === ADMIN_EMAIL;
    store.people[index] = {
      ...existing,
      ...patch,
      Email: existing.Email,
      Role: isAdminAccount ? 'Admin' : (patch.Role || existing.Role),
      Active: isAdminAccount ? true : (patch.Active !== undefined ? Boolean(patch.Active) : existing.Active)
    };
    writeStore(store);

    res.json({ ok: true, people: store.people, message: `Updated ${existing.Email} on the server.` });
  });

  // REST API: Remove / Deactivate user
  app.delete('/api/admin/users/:email', (req, res) => {
    const email = req.params.email;
    const key = normalizeEmail(email);
    if (key === ADMIN_EMAIL) {
      res.status(400).json({ ok: false, message: 'You cannot remove the primary admin account.' });
      return;
    }

    const store = readStore();
    const index = store.people.findIndex((p) => normalizeEmail(p.Email) === key);
    if (index === -1) {
      store.people.push({
        Email: email,
        Name: email.split('@')[0],
        Role: 'Officer',
        Site: 'Cebu City',
        Shift: 'Peak',
        Active: false
      });
    } else {
      store.people[index].Active = false;
    }
    writeStore(store);

    res.json({
      ok: true,
      people: store.people,
      message: `${email} access deactivated on server. Restoring access puts them back on the roster.`
    });
  });

  // REST API: Capture toggle for admin
  app.post('/api/admin/capture-toggle', (req, res) => {
    const store = readStore();
    store.showCaptureForAdmin = Boolean(req.body?.showCaptureForAdmin);
    writeStore(store);
    res.json({
      ok: true,
      showCaptureForAdmin: store.showCaptureForAdmin,
      message: store.showCaptureForAdmin
        ? 'Capture media is visible on the admin view (saved to server).'
        : 'Capture media is hidden on the admin view (saved to server).'
    });
  });

  // REST API: Update Upload Record
  app.put('/api/admin/records/upload/:id', (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};
    const store = readStore();
    const index = store.uploads.findIndex((u) => u.id === id);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Upload not found on server.' });
      return;
    }
    store.uploads[index] = { ...store.uploads[index], ...patch };
    writeStore(store);
    res.json({ ok: true, uploads: store.uploads, message: `Updated upload ${id} on the server.` });
  });

  // REST API: Delete Single Upload Record
  app.delete('/api/admin/records/upload/:id', (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const initialLen = store.uploads.length;
    store.uploads = store.uploads.filter((u) => u.id !== id);
    if (store.uploads.length === initialLen) {
      res.status(404).json({ ok: false, message: 'Upload not found on server.' });
      return;
    }
    writeStore(store);
    res.json({ ok: true, uploads: store.uploads, message: `Deleted upload ${id} from server. Google Drive files were not deleted.` });
  });

  // REST API: Delete All Upload Records
  app.delete('/api/admin/records/uploads', (_req, res) => {
    const store = readStore();
    const count = store.uploads.length;
    store.uploads = [];
    writeStore(store);
    res.json({ ok: true, uploads: [], message: `Deleted ${count} upload record(s) from server.` });
  });

  // REST API: Update Direction
  app.put('/api/admin/records/direction/:id', (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};
    const store = readStore();
    const index = store.directions.findIndex((d) => d.feedbackId === id);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Direction not found on server.' });
      return;
    }
    store.directions[index] = { ...store.directions[index], ...patch };
    writeStore(store);
    res.json({ ok: true, directions: store.directions, message: `Updated direction ${id} on the server.` });
  });

  // REST API: Delete Single Direction
  app.delete('/api/admin/records/direction/:id', (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const initialLen = store.directions.length;
    store.directions = store.directions.filter((d) => d.feedbackId !== id);
    if (store.directions.length === initialLen) {
      res.status(404).json({ ok: false, message: 'Direction not found on server.' });
      return;
    }
    writeStore(store);
    res.json({ ok: true, directions: store.directions, message: `Deleted direction ${id} from server.` });
  });

  // REST API: Delete All Directions
  app.delete('/api/admin/records/directions', (_req, res) => {
    const store = readStore();
    const count = store.directions.length;
    store.directions = [];
    writeStore(store);
    res.json({ ok: true, directions: [], message: `Deleted ${count} direction(s) from server.` });
  });

  // REST API: Update Shift Report
  app.put('/api/admin/records/report/:id', (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};
    const store = readStore();
    const index = store.shiftReports.findIndex((r) => r.reportId === id);
    if (index === -1) {
      res.status(404).json({ ok: false, message: 'Shift report not found on server.' });
      return;
    }
    store.shiftReports[index] = { ...store.shiftReports[index], ...patch };
    writeStore(store);
    res.json({ ok: true, shiftReports: store.shiftReports, message: `Updated report ${id} on the server.` });
  });

  // REST API: Delete Single Shift Report
  app.delete('/api/admin/records/report/:id', (req, res) => {
    const { id } = req.params;
    const store = readStore();
    const initialLen = store.shiftReports.length;
    store.shiftReports = store.shiftReports.filter((r) => r.reportId !== id);
    if (store.shiftReports.length === initialLen) {
      res.status(404).json({ ok: false, message: 'Shift report not found on server.' });
      return;
    }
    writeStore(store);
    res.json({ ok: true, shiftReports: store.shiftReports, message: `Deleted report ${id} from server.` });
  });

  // REST API: Delete All Shift Reports
  app.delete('/api/admin/records/reports', (_req, res) => {
    const store = readStore();
    const count = store.shiftReports.length;
    store.shiftReports = [];
    writeStore(store);
    res.json({ ok: true, shiftReports: [], message: `Deleted ${count} shift report(s) from server.` });
  });

  // REST API: Batch Upload Save
  app.post('/api/uploads/batch', (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ ok: false, message: 'Items array required' });
      return;
    }
    const store = readStore();
    store.uploads = [...items, ...store.uploads];
    writeStore(store);
    res.json({ ok: true, uploads: store.uploads });
  });

  // REST API: Review Upload
  app.post('/api/uploads/review', (req, res) => {
    const { id, decision, note, reviewedBy } = req.body || {};
    const store = readStore();
    const index = store.uploads.findIndex((u) => u.id === id);
    if (index !== -1) {
      store.uploads[index] = {
        ...store.uploads[index],
        reviewStatus: decision,
        reviewNote: note || store.uploads[index].reviewNote,
        reviewedBy: reviewedBy || store.uploads[index].reviewedBy,
        reviewedAt: new Date().toISOString(),
        topPick: decision === 'Top pick' ? true : store.uploads[index].topPick
      };
      writeStore(store);
    }
    res.json({ ok: true, uploads: store.uploads });
  });

  // REST API: Toggle Used In Final
  app.post('/api/uploads/toggle-final', (req, res) => {
    const { id } = req.body || {};
    const store = readStore();
    const index = store.uploads.findIndex((u) => u.id === id);
    if (index !== -1) {
      store.uploads[index] = {
        ...store.uploads[index],
        usedInFinal: !store.uploads[index].usedInFinal
      };
      writeStore(store);
    }
    res.json({ ok: true, uploads: store.uploads });
  });

  // REST API: Create Shift Report
  app.post('/api/reports', (req, res) => {
    const { report } = req.body || {};
    if (!report || !report.reportId) {
      res.status(400).json({ ok: false, message: 'Valid report object required' });
      return;
    }
    const store = readStore();
    store.shiftReports = [report, ...store.shiftReports];
    writeStore(store);
    res.json({ ok: true, shiftReports: store.shiftReports });
  });

  // REST API: Sign off report
  app.post('/api/reports/sign-off', (req, res) => {
    const { reportId } = req.body || {};
    const store = readStore();
    const index = store.shiftReports.findIndex((r) => r.reportId === reportId);
    if (index !== -1) {
      store.shiftReports[index] = {
        ...store.shiftReports[index],
        signedOff: true,
        verified: true
      };
      writeStore(store);
    }
    res.json({ ok: true, shiftReports: store.shiftReports });
  });

  // REST API: Acknowledge Direction
  app.post('/api/directions/acknowledge', (req, res) => {
    const { feedbackId, email, reply } = req.body || {};
    const store = readStore();
    const index = store.directions.findIndex((d) => d.feedbackId === feedbackId);
    if (index !== -1) {
      const prevAck = store.directions[index].acknowledgedBy || [];
      store.directions[index] = {
        ...store.directions[index],
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: Array.from(new Set([...prevAck, email])),
        reply: reply || store.directions[index].reply
      };
      writeStore(store);
    }
    res.json({ ok: true, directions: store.directions });
  });

  // REST API: Publish Direction
  app.post('/api/directions/publish', (req, res) => {
    const { feedbackId } = req.body || {};
    const store = readStore();
    const index = store.directions.findIndex((d) => d.feedbackId === feedbackId);
    if (index !== -1) {
      store.directions[index] = {
        ...store.directions[index],
        status: 'Published',
        sentAt: new Date().toISOString()
      };
      writeStore(store);
    }
    res.json({ ok: true, directions: store.directions });
  });

  // REST API: ClickUp token storage on server
  app.post('/api/config/clickup-token', (req, res) => {
    const { token } = req.body || {};
    const store = readStore();
    store.clickUpToken = (token && String(token).trim()) || '';
    writeStore(store);
    res.json({ ok: true, clickUpToken: store.clickUpToken, message: 'ClickUp token saved to server.' });
  });

  // REST API: Reset to initial sample / clean data
  app.post('/api/admin/reset-sample', (_req, res) => {
    writeStore(INITIAL_STORE);
    res.json({ ok: true, store: INITIAL_STORE, message: 'Server reset to initial state.' });
  });

  const server = http.createServer(app);

  // Mount Vite or serve static files
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: { server } },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  // Default keep-alive is 5s. The browser tunnel can write the next request
  // onto a socket this process already closed, and Chrome shows an empty response.
  server.keepAliveTimeout = 0;
  server.headersTimeout = 65_000;
  server.on('clientError', (err, socket) => {
    console.error('HTTP client error:', err.message);
    if (socket.writable) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    }
  });

  server.listen(PORT, '::', () => {
    console.log(`E1 Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
