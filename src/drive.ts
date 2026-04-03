import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(process.cwd(), 'state.json');

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH!;
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));

  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
  });
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

// ---------- State helpers ----------

interface State {
  lastCheckedAt: string; // ISO timestamp
  channelId?: string;
  resourceId?: string;
}

function loadState(): State {
  if (!fs.existsSync(STATE_FILE)) {
    return { lastCheckedAt: new Date(0).toISOString() };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as State;
}

function saveState(state: State) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------- Webhook registration ----------

export async function registerDriveWatch(webhookUrl: string): Promise<void> {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
  const channelId = `drive-hubspot-sync-${Date.now()}`;

  const res = await drive.files.watch({
    fileId: folderId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
    },
  });

  console.log('Drive watch registered:', res.data);

  const state = loadState();
  state.channelId = channelId;
  state.resourceId = res.data.resourceId ?? undefined;
  state.lastCheckedAt = new Date().toISOString();
  saveState(state);
}

// ---------- List new files ----------

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export async function getNewFilesInFolder(): Promise<DriveFile[]> {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
  const state = loadState();
  const since = state.lastCheckedAt;

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and createdTime > '${since}'`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'createdTime',
  });

  // Update last checked timestamp
  state.lastCheckedAt = new Date().toISOString();
  saveState(state);

  return (res.data.files ?? []) as DriveFile[];
}

// ---------- Download file ----------

export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();

  // Check if it's a Google Doc (needs export) or binary file (needs download)
  const meta = await drive.files.get({ fileId, fields: 'mimeType' });
  const mimeType = meta.data.mimeType ?? '';

  if (mimeType.startsWith('application/vnd.google-apps')) {
    // Export Google Docs as PDF
    const res = await drive.files.export(
      { fileId, mimeType: 'application/pdf' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  // Binary file — direct download
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer);
}
