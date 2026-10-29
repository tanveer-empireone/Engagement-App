import express, { type Response } from 'express';
import { clampRole, isAdminEmail, normalizeEmail } from '../utils/access';
import { SITES_METADATA, TOPICS_LIST, buildE1FileName, buildFolderPath, generateUploadId } from '../utils/idGenerator';
import { requireUser, type AuthedRequest, type TokenVerifier } from './auth';
import { applyPersonPatch, canPublishDirection, canReviewReport, canReviewUpload, isActiveAdmin, selfEditForbidden } from './authorize';
import type { DriveClient } from './driveUpload';
import { unconfiguredDrive } from './driveUpload';
import { ServiceUnavailableError } from './errors';
import { presentState, presentUpload } from './present';
import { stripSecrets } from './secrets';
import type { AppStore, PersonRecord, UploadRecord } from './store';

const MAX_BYTES = 35 * 1024 * 1024;
const CONFIG_KEYS = ['sheetId', 'driveRootId', 'clickUpTeamId', 'clickUpSpaceId', 'appsScriptUrl'] as const;

export interface CreateAppOptions {
  store: AppStore;
  verifyIdToken: TokenVerifier;
  clickUpToken?: string;
  clickUpFetch?: typeof fetch;
  drive?: DriveClient;
  allowReset?: boolean;
}

function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

async function readState(store: AppStore) {
  const [people, uploads, directions, shiftReports, config] = await Promise.all([
    store.listPeople(),
    store.listUploads(),
    store.listDirections(),
    store.listReports(),
    store.getConfig()
  ]);
  return presentState({
    people,
    uploads,
    directions,
    shiftReports,
    config: {
      sheetId: config.sheetId,
      driveRootId: config.driveRootId,
      clickUpTeamId: config.clickUpTeamId,
      clickUpSpaceId: config.clickUpSpaceId,
      appsScriptUrl: config.appsScriptUrl
    },
    showCaptureForAdmin: config.showCaptureForAdmin,
    syncHealth: config.syncHealth
  });
}

function extFrom(mimeType: string, requested?: string): string {
  const clean = (requested || '').replace(/^\./, '').toLowerCase();
  if (clean && /^[a-z0-9]{1,5}$/.test(clean)) return clean;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'video/quicktime') return 'mov';
  if (mimeType.startsWith('video/')) return 'mp4';
  return 'jpg';
}

export function createApp(options: CreateAppOptions) {
  const store = options.store;
  const drive = options.drive || unconfiguredDrive();
  const clickUpFetch = options.clickUpFetch || fetch;
  const app = express();

  app.use((req, res, next) => {
    if (!req.headers.upgrade) res.setHeader('Connection', 'close');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'engagement-capture' });
  });

  app.use(requireUser(store, options.verifyIdToken));

  app.get('/api/state', async (_req, res) => {
    res.json(await readState(store));
  });

  app.post('/api/session/ensure-user', async (req: AuthedRequest, res) => {
    const person = await store.findPerson(req.authEmail || '');
    if (!person) {
      res.status(403).json({
        ok: false,
        allowed: false,
        message: 'This email is not on the roster. An admin has to add it before sign-in.'
      });
      return;
    }
    const photo = typeof req.body?.photoURL === 'string' ? req.body.photoURL : undefined;
    if (photo && photo !== person.Avatar && !photo.includes('pk_')) {
      await store.updatePerson(person.Email, { Avatar: photo });
    }
    const people = await store.listPeople();
    res.json({ ok: true, people: stripSecrets(people) });
  });

  app.post('/api/admin/config', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const patch: Record<string, string> = {};
    for (const key of CONFIG_KEYS) {
      if (typeof req.body?.[key] === 'string') patch[key] = req.body[key];
    }
    const config = await store.updateConfig(patch);
    res.json({
      ok: true,
      config: stripSecrets({
        sheetId: config.sheetId,
        driveRootId: config.driveRootId,
        clickUpTeamId: config.clickUpTeamId,
        clickUpSpaceId: config.clickUpSpaceId,
        appsScriptUrl: config.appsScriptUrl
      }),
      message: 'Configuration saved to server.'
    });
  });

  app.post('/api/admin/users', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const email = normalizeEmail(req.body?.email);
    if (!email.includes('@')) {
      res.status(400).json({ ok: false, message: 'Enter a full email address.' });
      return;
    }
    if (await store.findPerson(email)) {
      res.status(400).json({ ok: false, message: 'That email is already on the roster. Edit the existing row.' });
      return;
    }
    const person: PersonRecord = {
      Email: email,
      Name: String(req.body?.name || email.split('@')[0]).trim() || email.split('@')[0],
      Role: clampRole(email, req.body?.role),
      Site: String(req.body?.site || 'Cebu City'),
      Shift: String(req.body?.shift || 'Peak'),
      Active: true
    };
    await store.insertPerson(person);
    res.json({ ok: true, people: await store.listPeople(), message: `${person.Email} is saved as ${person.Role} on the server.` });
  });

  app.put('/api/admin/users/:email', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const email = normalizeEmail(param(req.params.email));
    const existing = await store.findPerson(email);
    if (!existing) {
      res.status(404).json({ ok: false, message: 'That person is not on the roster.' });
      return;
    }
    const patch = (req.body || {}) as Partial<PersonRecord>;
    if (selfEditForbidden(actor, email, existing, patch)) {
      res.status(403).json({ ok: false, message: 'You cannot change your own role, site, shift, or access.' });
      return;
    }
    const next = applyPersonPatch(existing, patch);
    await store.updatePerson(email, next);
    res.json({
      ok: true,
      people: await store.listPeople(),
      message: isAdminEmail(email) ? 'The founding admin stays Admin.' : `Updated ${existing.Email} on the server.`
    });
  });

  app.delete('/api/admin/users/:email', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const email = normalizeEmail(param(req.params.email));
    if (isAdminEmail(email)) {
      res.status(400).json({ ok: false, message: 'You cannot remove the primary admin account.' });
      return;
    }
    if (email === normalizeEmail(actor.Email)) {
      res.status(400).json({ ok: false, message: 'You cannot remove the signed-in admin account.' });
      return;
    }
    const existing = await store.findPerson(email);
    if (!existing) {
      await store.insertPerson({
        Email: email,
        Name: email.split('@')[0],
        Role: 'Officer',
        Site: 'Cebu City',
        Shift: 'Peak',
        Active: false
      });
    } else {
      await store.updatePerson(email, { Active: false });
    }
    res.json({ ok: true, people: await store.listPeople(), message: `${email} access deactivated on server.` });
  });

  app.post('/api/admin/capture-toggle', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const showCaptureForAdmin = Boolean(req.body?.showCaptureForAdmin);
    await store.updateConfig({ showCaptureForAdmin });
    res.json({
      ok: true,
      showCaptureForAdmin,
      message: showCaptureForAdmin
        ? 'Capture media is visible on the admin view (saved to server).'
        : 'Capture media is hidden on the admin view (saved to server).'
    });
  });

  app.put('/api/admin/records/upload/:id', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const id = param(req.params.id);
    const existing = await store.findUpload(id);
    if (!existing) {
      res.status(404).json({ ok: false, message: 'Upload not found on server.' });
      return;
    }
    const patch = { ...(req.body || {}) } as Partial<UploadRecord>;
    delete patch.id;
    delete patch.officer;
    delete patch.driveFileId;
    delete patch.driveFolderId;
    delete patch.mediaUrl;
    delete patch.mediaStatus;
    const updated = await store.updateUpload(id, patch);
    res.json({ ok: true, uploads: (await store.listUploads()).map(presentUpload), message: `Updated upload ${id} on the server.` });
    void updated;
  });

  app.delete('/api/admin/records/upload/:id', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const id = param(req.params.id);
    const removed = await store.deleteUpload(id);
    if (!removed) {
      res.status(404).json({ ok: false, message: 'Upload not found on server.' });
      return;
    }
    res.json({ ok: true, uploads: (await store.listUploads()).map(presentUpload), message: `Deleted upload ${id} from server. Google Drive files were not deleted.` });
  });

  app.delete('/api/admin/records/uploads', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const count = await store.deleteAllUploads();
    res.json({ ok: true, uploads: [], message: `Deleted ${count} upload record(s) from server.` });
  });

  app.put('/api/admin/records/direction/:id', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const id = param(req.params.id);
    const existing = await store.findDirection(id);
    if (!existing) {
      res.status(404).json({ ok: false, message: 'Direction not found on server.' });
      return;
    }
    const patch = { ...(req.body || {}) };
    delete patch.feedbackId;
    await store.updateDirection(id, patch);
    res.json({ ok: true, directions: await store.listDirections(), message: `Updated direction ${id} on the server.` });
  });

  app.delete('/api/admin/records/direction/:id', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const id = param(req.params.id);
    if (!(await store.deleteDirection(id))) {
      res.status(404).json({ ok: false, message: 'Direction not found on server.' });
      return;
    }
    res.json({ ok: true, directions: await store.listDirections(), message: `Deleted direction ${id} from server.` });
  });

  app.delete('/api/admin/records/directions', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const count = await store.deleteAllDirections();
    res.json({ ok: true, directions: [], message: `Deleted ${count} direction(s) from server.` });
  });

  app.put('/api/admin/records/report/:id', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const id = param(req.params.id);
    if (!(await store.findReport(id))) {
      res.status(404).json({ ok: false, message: 'Shift report not found on server.' });
      return;
    }
    const patch = { ...(req.body || {}) };
    delete patch.reportId;
    delete patch.officer;
    await store.updateReport(id, patch);
    res.json({ ok: true, shiftReports: await store.listReports(), message: `Updated report ${id} on the server.` });
  });

  app.delete('/api/admin/records/report/:id', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const id = param(req.params.id);
    if (!(await store.deleteReport(id))) {
      res.status(404).json({ ok: false, message: 'Shift report not found on server.' });
      return;
    }
    res.json({ ok: true, shiftReports: await store.listReports(), message: `Deleted report ${id} from server.` });
  });

  app.delete('/api/admin/records/reports', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    const count = await store.deleteAllReports();
    res.json({ ok: true, shiftReports: [], message: `Deleted ${count} shift report(s) from server.` });
  });

  app.post('/api/uploads/batch', (_req, res) => {
    res.status(400).json({
      ok: false,
      message: 'Media is stored in Google Drive. Start an upload session instead of sending file bytes or blob URLs.'
    });
  });

  app.post('/api/uploads/session', async (req: AuthedRequest, res) => {
    const actor = await store.findPerson(req.authEmail || '');
    if (!actor) {
      res.status(403).json({ ok: false, message: 'This email is not on the roster.' });
      return;
    }
    if (!drive.configured) {
      res.status(503).json({
        ok: false,
        message: 'Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON to a service account that can edit the Drive root folder.'
      });
      return;
    }
    const mimeType = String(req.body?.mimeType || '');
    const size = Number(req.body?.size || 0);
    if (!mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
      res.status(400).json({ ok: false, message: 'Choose a photo or video.' });
      return;
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      res.status(400).json({ ok: false, message: 'File is larger than 35 MB.' });
      return;
    }
    const siteName = String(req.body?.site || actor.Site || 'Cebu City');
    const shift = String(req.body?.shift || actor.Shift || 'Peak');
    const topicName = String(req.body?.topic || 'General / Other');
    const mode = req.body?.mode === 'Event' ? 'Event' : 'Daily';
    const shiftDate = String(req.body?.shiftDate || new Date().toISOString().slice(0, 10));
    const siteMeta = SITES_METADATA.find((site) => site.SiteName === siteName) || SITES_METADATA[0];
    const topicMeta = TOPICS_LIST.find((topic) => topic.Topic === topicName) || TOPICS_LIST[TOPICS_LIST.length - 1];
    const prefix = `${siteMeta.Code}_${shiftDate.replace(/-/g, '')}_${topicMeta.Code}_`;
    const id = generateUploadId(prefix, await store.listUploadIds());
    const mediaType = mimeType.startsWith('video/') ? 'Video' : 'Photo';
    const fileName = buildE1FileName(id, mediaType, true, extFrom(mimeType, req.body?.ext));
    const folderPath = buildFolderPath(siteMeta.FolderName, shiftDate, shift, mode, String(req.body?.eventName || ''), fileName);
    const folderOnly = folderPath.split('/').slice(0, -1).join('/');
    try {
      const config = await store.getConfig();
      const folderId = await drive.ensureFolder(config.driveRootId, folderOnly);
      const uploadUrl = await drive.startResumable({ name: fileName, mimeType, size, parentId: folderId });
      await store.savePending({
        id,
        officerEmail: actor.Email,
        folderId,
        folderPath,
        fileName,
        payload: {
          site: siteName,
          shift,
          mode,
          eventName: String(req.body?.eventName || ''),
          shiftDate,
          topic: topicName,
          spot: String(req.body?.spot || 'Production floor'),
          mediaType,
          note: String(req.body?.note || ''),
          topPick: Boolean(req.body?.topPick),
          consentSigned: req.body?.consentSigned !== false,
          nothingConfidential: req.body?.nothingConfidential !== false,
          capturedAt: String(req.body?.capturedAt || new Date().toISOString()),
          location: String(req.body?.location || ''),
          peopleInShot: String(req.body?.peopleInShot || ''),
          fileSizeBytes: size,
          mimeType
        }
      });
      res.json({ ok: true, uploadUrl, uploadId: id });
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        res.status(503).json({ ok: false, message: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : 'Drive upload session failed.';
      res.status(502).json({ ok: false, message });
    }
  });

  app.post('/api/uploads/complete', async (req: AuthedRequest, res) => {
    const actor = await store.findPerson(req.authEmail || '');
    if (!actor) {
      res.status(403).json({ ok: false, message: 'This email is not on the roster.' });
      return;
    }
    const uploadId = String(req.body?.uploadId || '');
    const driveFileId = String(req.body?.driveFileId || '');
    const pending = await store.getPending(uploadId);
    if (!pending || pending.officerEmail !== actor.Email) {
      res.status(404).json({ ok: false, message: 'That upload session was not found.' });
      return;
    }
    if (!drive.configured) {
      res.status(503).json({ ok: false, message: 'Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON to a service account that can edit the Drive root folder.' });
      return;
    }
    const file = await drive.getFile(driveFileId);
    if (!file || !file.parents.includes(pending.folderId)) {
      res.status(400).json({ ok: false, message: 'That file is not in the upload folder for this session.' });
      return;
    }
    const meta = pending.payload;
    const upload: UploadRecord = {
      id: pending.id,
      fileName: pending.fileName,
      officer: actor.Email,
      officerName: actor.Name,
      site: String(meta.site || actor.Site),
      shift: String(meta.shift || actor.Shift),
      mode: meta.mode === 'Event' ? 'Event' : 'Daily',
      eventName: String(meta.eventName || ''),
      shiftDate: String(meta.shiftDate || ''),
      topic: String(meta.topic || ''),
      spot: String(meta.spot || 'Production floor'),
      mediaType: meta.mediaType === 'Video' ? 'Video' : 'Photo',
      mediaUrl: '',
      capturedAt: String(meta.capturedAt || new Date().toISOString()),
      uploadedAt: new Date().toISOString(),
      location: String(meta.location || ''),
      note: String(meta.note || ''),
      peopleInShot: String(meta.peopleInShot || ''),
      consentSigned: meta.consentSigned !== false,
      nothingConfidential: meta.nothingConfidential !== false,
      topPick: Boolean(meta.topPick),
      reviewStatus: 'Pending',
      folderPath: pending.folderPath,
      fileSizeBytes: Number(meta.fileSizeBytes || 0),
      driveFileId: file.id,
      driveFolderId: pending.folderId,
      mediaStatus: 'stored'
    };
    await store.insertUpload(upload);
    await store.deletePending(uploadId);
    res.json({ ok: true, upload: presentUpload(upload) });
  });

  app.get('/api/uploads/:id', async (req: AuthedRequest, res) => {
    const upload = await store.findUpload(param(req.params.id));
    if (!upload) {
      res.status(404).json({ ok: false, message: 'Upload not found on server.' });
      return;
    }
    res.json({ ok: true, upload: presentUpload(upload) });
  });

  app.post('/api/uploads/review', async (req: AuthedRequest, res) => {
    const actor = await store.findPerson(req.authEmail || '');
    if (!actor) {
      res.status(403).json({ ok: false, message: 'This email is not on the roster.' });
      return;
    }
    const id = String(req.body?.id || '');
    const upload = await store.findUpload(id);
    if (!upload) {
      res.status(404).json({ ok: false, message: 'Upload not found on server.' });
      return;
    }
    if (!canReviewUpload(actor, upload)) {
      res.status(403).json({ ok: false, message: 'You cannot review this upload.' });
      return;
    }
    const decision = req.body?.decision;
    const allowed = ['Pending', 'Accepted', 'Top pick', 'Reshoot'];
    if (!allowed.includes(decision)) {
      res.status(400).json({ ok: false, message: 'Choose a review decision.' });
      return;
    }
    await store.updateUpload(id, {
      reviewStatus: decision,
      reviewNote: typeof req.body?.note === 'string' ? req.body.note : upload.reviewNote,
      reviewedBy: actor.Email,
      reviewedAt: new Date().toISOString(),
      topPick: decision === 'Top pick' ? true : upload.topPick
    });
    res.json({ ok: true, uploads: (await store.listUploads()).map(presentUpload) });
  });

  app.post('/api/uploads/toggle-final', async (req: AuthedRequest, res) => {
    const actor = await store.findPerson(req.authEmail || '');
    const id = String(req.body?.id || '');
    const upload = await store.findUpload(id);
    if (!actor || !upload || !canReviewUpload(actor, upload)) {
      res.status(403).json({ ok: false, message: 'You cannot change this upload.' });
      return;
    }
    await store.updateUpload(id, { usedInFinal: !upload.usedInFinal });
    res.json({ ok: true, uploads: (await store.listUploads()).map(presentUpload) });
  });

  app.post('/api/reports', async (req: AuthedRequest, res) => {
    const actor = await store.findPerson(req.authEmail || '');
    if (!actor) {
      res.status(403).json({ ok: false, message: 'This email is not on the roster.' });
      return;
    }
    const report = req.body?.report;
    if (!report || typeof report.reportId !== 'string') {
      res.status(400).json({ ok: false, message: 'Valid report object required' });
      return;
    }
    await store.insertReport({
      ...report,
      officer: actor.Email,
      officerName: actor.Name,
      reportId: report.reportId
    });
    res.json({ ok: true, shiftReports: await store.listReports() });
  });

  app.post('/api/reports/sign-off', async (req: AuthedRequest, res) => {
    const actor = await store.findPerson(req.authEmail || '');
    const reportId = String(req.body?.reportId || '');
    const report = await store.findReport(reportId);
    if (!actor || !report || !canReviewReport(actor, report)) {
      res.status(403).json({ ok: false, message: 'You cannot sign off this report.' });
      return;
    }
    await store.updateReport(reportId, { signedOff: true, verified: true });
    res.json({ ok: true, shiftReports: await store.listReports() });
  });

  app.post('/api/directions/acknowledge', async (req: AuthedRequest, res) => {
    const actor = await store.findPerson(req.authEmail || '');
    if (!actor) {
      res.status(403).json({ ok: false, message: 'This email is not on the roster.' });
      return;
    }
    const feedbackId = String(req.body?.feedbackId || '');
    const direction = await store.findDirection(feedbackId);
    if (!direction) {
      res.status(404).json({ ok: false, message: 'Direction not found on server.' });
      return;
    }
    const acknowledgedBy = Array.from(new Set([...(direction.acknowledgedBy || []), actor.Email]));
    await store.updateDirection(feedbackId, {
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy,
      reply: typeof req.body?.reply === 'string' ? req.body.reply : direction.reply
    });
    res.json({ ok: true, directions: await store.listDirections() });
  });

  app.post('/api/directions/publish', async (req: AuthedRequest, res) => {
    const actor = await store.findPerson(req.authEmail || '');
    if (!actor || !canPublishDirection(actor)) {
      res.status(403).json({ ok: false, message: 'You cannot publish directions.' });
      return;
    }
    const feedbackId = String(req.body?.feedbackId || '');
    const direction = await store.findDirection(feedbackId);
    if (!direction) {
      res.status(404).json({ ok: false, message: 'Direction not found on server.' });
      return;
    }
    await store.updateDirection(feedbackId, { status: 'Published', sentAt: new Date().toISOString() });
    res.json({ ok: true, directions: await store.listDirections() });
  });

  app.all('/api/clickup/*', async (req: AuthedRequest, res) => {
    const actor = await store.findPerson(req.authEmail || '');
    if (!isActiveAdmin(actor)) {
      res.status(403).json({ ok: false, message: 'Only an admin can read ClickUp.' });
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, message: 'ClickUp writes are not available.' });
      return;
    }
    const config = await store.getConfig();
    const rawPath = (req.originalUrl || req.url).split('?')[0].replace(/^\/api\/clickup/, '') || '/';
    const query = (req.originalUrl || req.url).includes('?') ? `?${(req.originalUrl || req.url).split('?')[1]}` : '';
    const spaceId = config.clickUpSpaceId;
    const allowed =
      rawPath === `/space/${spaceId}` ||
      rawPath === `/space/${spaceId}/folder` ||
      rawPath === `/space/${spaceId}/list` ||
      /^\/list\/[^/]+\/task$/.test(rawPath);
    if (!allowed) {
      res.status(404).json({ ok: false, message: 'That ClickUp path is not available.' });
      return;
    }
    const token = options.clickUpToken || '';
    if (!token) {
      res.status(404).json({ ok: false, message: 'ClickUp is not configured.' });
      return;
    }
    if (/^\/list\/([^/]+)\/task$/.test(rawPath)) {
      const listId = rawPath.split('/')[2];
      const listResponse = await clickUpFetch(`https://api.clickup.com/api/v2/list/${listId}`, {
        method: 'GET',
        headers: { Authorization: token }
      });
      if (!listResponse.ok) {
        res.status(404).json({ ok: false, message: 'That ClickUp list is not in the configured space.' });
        return;
      }
      const list = (await listResponse.json()) as { space?: { id?: string } };
      if (String(list.space?.id || '') !== spaceId) {
        res.status(404).json({ ok: false, message: 'That ClickUp list is not in the configured space.' });
        return;
      }
    }
    const response = await clickUpFetch(`https://api.clickup.com/api/v2${rawPath}${query}`, {
      method: 'GET',
      headers: { Authorization: token }
    });
    let text = await response.text();
    if (token && text.includes(token)) text = text.split(token).join('[redacted]');
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    res.send(text);
  });

  app.post('/api/admin/reset-sample', async (req: AuthedRequest, res) => {
    const actor = await mustAdmin(store, req, res);
    if (!actor) return;
    if (!options.allowReset) {
      res.status(404).json({ ok: false, message: 'Reset is disabled on hosted deployments.' });
      return;
    }
    await store.resetSample();
    res.json({ ok: true, message: 'Server reset to the founding admin only. Drive files were not deleted.' });
  });

  return app;
}

async function mustAdmin(store: AppStore, req: AuthedRequest, res: Response): Promise<PersonRecord | null> {
  const actor = await store.findPerson(req.authEmail || '');
  if (!isActiveAdmin(actor)) {
    res.status(403).json({ ok: false, message: 'Only an admin can change these settings.' });
    return null;
  }
  return actor;
}

export function createUnavailableApp(message: string) {
  const app = express();
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'engagement-capture', ready: false });
  });
  app.use('/api', (_req, res) => {
    res.status(503).json({ ok: false, message });
  });
  return app;
}
