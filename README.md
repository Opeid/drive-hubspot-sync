# Drive → HubSpot Sync

Automatically uploads files placed in a Google Drive folder to the matching HubSpot contact record, matched by first and last name parsed from the filename.

**No server. No Google Cloud Console. No credentials to manage.**
Runs entirely inside Google Apps Script using your existing Google account.

---

## How it works

1. You drop a file into a watched Google Drive folder.
2. The script (running on Google's servers) checks for new files every 5 minutes.
3. It parses the filename to extract first and last name.
4. It searches HubSpot for a contact with that name.
5. It uploads the file to HubSpot and attaches it to the contact as a note.

---

## Filename format

The filename must start with `FirstName LastName` (or `FirstName_LastName`). Examples:

```
John_Doe_Contract.pdf       → searches for John Doe
Jane Smith - Proposal.pdf   → searches for Jane Smith
Robert-Johnson.pdf          → searches for Robert Johnson
```

---

## Setup (5 minutes)

### 1. Open Google Apps Script

Go to [script.google.com](https://script.google.com) → **New project**

### 2. Paste the script

Delete any existing code, then paste the contents of [`apps-script/Code.gs`](apps-script/Code.gs).

### 3. Set your credentials as Script Properties

In the Apps Script editor: **Project Settings (gear icon) → Script Properties → Add property**

Add these two properties:

| Property | Value |
|---|---|
| `HUBSPOT_PAK` | Your HubSpot Personal Access Key |
| `FOLDER_ID` | Your Google Drive folder ID (from the folder URL: `/folders/THIS_PART`) |

**Where to get your HubSpot Personal Access Key:**
Go to [app.hubspot.com/personal-access-key](https://app.hubspot.com/personal-access-key) → Generate personal access key → copy it.

The script uses this key to automatically generate and refresh API tokens — no private app needed.

### 4. Run once to grant permissions

Click **Run → checkNewFiles**. Google will ask you to approve permissions — click through. This is just your own Google account accessing your own Drive.

### 5. Set up the auto-trigger

Click **Run → createTrigger**. This makes the script check for new files every 5 minutes automatically.

That's it. Drop a file in the folder and it will appear on the HubSpot contact within 5 minutes.

---

## Logs

To see what the script is doing:
**View → Executions** in the Apps Script editor.

---

## Alternative: Node.js server (advanced)

If you need real-time webhooks instead of polling, the [`src/`](src/) folder contains a Node.js + TypeScript version that uses Google Drive push notifications. This version requires a Google Cloud service account and a hosted server.
