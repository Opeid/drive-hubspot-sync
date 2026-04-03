# Drive → HubSpot Sync

Automatically uploads files placed in a Google Drive folder to the matching HubSpot contact record, matched by first and last name parsed from the filename.

## How it works

1. A file is added to a watched Google Drive folder.
2. Google Drive sends a push notification to this server's `/webhook/drive` endpoint.
3. The server lists files added since the last check.
4. For each file, the first and last name are extracted from the filename.
5. The matching HubSpot contact is found by name.
6. The file is uploaded to HubSpot Files and attached to the contact as a note.

## Filename format

The filename must start with `FirstName LastName` (or `FirstName_LastName`). Examples:

```
John_Doe_Contract.pdf       → John Doe
Jane Smith - Proposal.pdf   → Jane Smith
Robert-Johnson.pdf          → Robert Johnson
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in:
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` — path to your Google service account JSON key
- `GOOGLE_DRIVE_FOLDER_ID` — the ID from the Drive folder URL (`/folders/<ID>`)
- `HUBSPOT_ACCESS_TOKEN` — HubSpot Private App token (needs `crm.objects.contacts.read`, `crm.objects.notes.write`, `files`)
- `WEBHOOK_URL` — your public server URL (for local dev, use [ngrok](https://ngrok.com))

### 3. Share the Drive folder with the service account

In Google Drive, share the folder with the service account email (found in `service-account.json` → `client_email`) with **Viewer** access.

### 4. Register the Drive webhook

```bash
npm run setup-watch
```

This registers a watch on the folder. **Google Drive webhooks expire after 7 days** — re-run this command to renew.

### 5. Start the server

```bash
# Development (auto-reload)
npm run dev

# Production
npm run build && npm start
```

## Manual sync

To trigger a sync without waiting for a Drive event:

```bash
curl -X POST http://localhost:3000/sync
```

## Local development with ngrok

```bash
ngrok http 3000
# Copy the https URL into WEBHOOK_URL in .env, then run setup-watch
```
