# Drive → HubSpot Sync

Automatically syncs files from a Google Drive folder to the matching HubSpot contact record. No manual uploads, no copy-pasting — drop a file in the folder and it appears on the contact within 5 minutes.

---

## What it does

### File detection
The script runs every 5 minutes via a Google Apps Script time-based trigger. It checks a designated Google Drive folder for any files added since the last run.

### Name matching
The contact is identified by parsing the filename. The first two words of the filename are treated as the first and last name:

```
Ronald Cichinelli.pdf       → looks up Ronald Cichinelli
John_Doe_Contract.pdf       → looks up John Doe
Jane Smith - Proposal.pdf   → looks up Jane Smith
```

The search handles several ways names can be stored in HubSpot:
- Standard `firstname` + `lastname` fields
- Full name stored in the `firstname` field (e.g. " Ronald Cichinelli")
- Partial last name match as a fallback

### File upload
Once the contact is found, the file is uploaded to HubSpot's File Manager under the `/drive-sync` folder.

### Contact attachment
A note is created on the contact's activity timeline with the file attached. The file also appears in the **Attachments** panel on the contact record.

### Google Doc export
If the file is a native Google format (Docs, Sheets, Slides), it is automatically exported as a PDF before uploading.

---

## Stack

- **Google Apps Script** — runs inside Google's infrastructure, no server needed
- **Google Drive API** — accessed via the script's built-in OAuth (no credentials to manage)
- **HubSpot CRM API** — authenticated via a private app token stored in Script Properties

---

## Logs

To see what the script is doing or debug any issues:

**View → Executions** in the [Apps Script editor](https://script.google.com)

Each run logs which files were processed, which contacts were matched, and any skipped files with the reason.
