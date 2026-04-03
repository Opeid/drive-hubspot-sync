/**
 * Run this once to register the Google Drive push notification webhook.
 *
 *   npm run setup-watch
 *
 * Requires WEBHOOK_URL and GOOGLE_DRIVE_FOLDER_ID in your .env file.
 * The WEBHOOK_URL must be publicly accessible (use ngrok for local dev).
 */
import 'dotenv/config';
import { registerDriveWatch } from './drive';

const webhookUrl = process.env.WEBHOOK_URL;
if (!webhookUrl) {
  console.error('Missing WEBHOOK_URL in .env');
  process.exit(1);
}

console.log(`Registering Drive watch → ${webhookUrl}/webhook/drive`);

registerDriveWatch(`${webhookUrl}/webhook/drive`)
  .then(() => console.log('Done. Webhook is active (expires in 7 days — re-run to renew).'))
  .catch((err) => {
    console.error('Failed to register watch:', err.message);
    process.exit(1);
  });
