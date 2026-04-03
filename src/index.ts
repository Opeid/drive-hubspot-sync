import 'dotenv/config';
import express, { Request, Response } from 'express';
import { syncNewFiles } from './sync';

const app = express();
app.use(express.json());

/**
 * Google Drive push notification webhook.
 * Drive sends a POST with headers like X-Goog-Resource-State = "update"
 * whenever the watched folder changes.
 */
app.post('/webhook/drive', async (req: Request, res: Response) => {
  // Acknowledge immediately — Drive expects a 200 within 2s
  res.sendStatus(200);

  const resourceState = req.headers['x-goog-resource-state'];
  console.log(`[webhook] Received Drive notification: state=${resourceState}`);

  // "sync" is just the initial handshake — ignore it
  if (resourceState === 'sync') return;

  try {
    const results = await syncNewFiles();
    for (const r of results) {
      if (r.status === 'success') {
        console.log(`[webhook] ✓ ${r.file} → contact ${r.contactId}`);
      } else {
        console.log(`[webhook] ⚠ ${r.file} skipped: ${r.reason}`);
      }
    }
  } catch (err) {
    console.error('[webhook] Sync error:', err);
  }
});

/**
 * Manual trigger — POST /sync to run a sync immediately without a Drive event.
 */
app.post('/sync', async (_req: Request, res: Response) => {
  try {
    const results = await syncNewFiles();
    res.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: POST /webhook/drive`);
});
