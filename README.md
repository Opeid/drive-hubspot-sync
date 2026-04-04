# Drive → HubSpot Sync

Automatically syncs files from a Google Drive folder to the matching HubSpot contact record. Drop a file in the folder and within 5 minutes it appears as a note with attachment on the contact's activity timeline — no manual uploads, no copy-pasting.

---

## How it works

### 1. File detection
A Google Apps Script time-based trigger runs `checkNewFiles()` every 5 minutes. It opens the watched Drive folder, compares each file's creation date against the last run timestamp (stored in Script Properties), and queues any new files for processing.

### 2. Name matching
The contact is identified by parsing the filename. The script extracts the first two alphabetic words and treats them as first name and last name:

```
Ronald Cichinelli.pdf         → Ronald Cichinelli
John_Doe_Contract.pdf         → John Doe
Jane Smith - Proposal.pdf     → Jane Smith
Robert-Johnson-2026.pdf       → Robert Johnson
```

Numbers, dates, and extra words after the name are ignored. The search uses three fallback strategies to handle different ways names are stored in HubSpot:

1. **Exact match** — `firstname = "John"` AND `lastname = "Doe"`
2. **Full name in firstname field** — catches contacts where the full name is stored in a single field (e.g. `" Ronald Cichinelli"`)
3. **Last name contains token** — broader fallback search by last name only

If no contact is found, the file is skipped and logged.

### 3. File upload
The file is uploaded to HubSpot's File Manager under the `/drive-sync` folder. Native Google formats (Docs, Sheets, Slides) are automatically exported as PDF before uploading.

### 4. Contact attachment
A note is created on the contact's activity timeline with the file attached via `hs_attachment_ids`. The file appears both in the **Notes** tab and the **Attachments** panel on the contact record.

---

## Making changes

### Change the watched Drive folder

1. Open [script.google.com](https://script.google.com) and open the **Drive Sync** project
2. Click the **gear icon → Project Settings → Script Properties**
3. Find the `FOLDER_ID` property and click **Edit**
4. Replace the value with the new folder ID

**How to find a folder ID:** Open the folder in Google Drive. The ID is the last part of the URL:
```
https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I
                                        ^^^^^^^^^^^^^^^^^^^
                                        this is the Folder ID
```

### Change the HubSpot account

1. Go to **Script Properties** (as above)
2. Update `HUBSPOT_TOKEN` with a `pat-...` token from the new HubSpot account's private app

### Change the polling interval

1. Open `Code.gs` in the Apps Script editor
2. At the top, change `POLL_INTERVAL_MINUTES` to any value supported by Apps Script triggers (`1`, `5`, `10`, `15`, `30`)
3. Run `createTrigger()` again to apply the new interval (it deletes the old trigger and creates a new one)

### Reset the sync (reprocess all files)

The script tracks the last run time in Script Properties under the key `lastChecked`. To force it to reprocess all files:

1. Go to **Script Properties**
2. Delete the `lastChecked` property (or set it to `1970-01-01T00:00:00Z`)
3. Run `checkNewFiles()` — it will pick up all files in the folder

---

## Filename convention

The filename must start with `FirstName LastName`. Everything after the second word is ignored, so you can include document type, date, or any other info after the name:

| Filename | Matched contact |
|---|---|
| `John Doe.pdf` | John Doe |
| `John_Doe_Contract_2026.pdf` | John Doe |
| `Jane-Smith-Tax-Return.pdf` | Jane Smith |
| `Ronald Cichinelli.pdf` | Ronald Cichinelli |

Names with numbers or single-word filenames will be skipped.

---

## Stack

- **Google Apps Script** — runs inside Google's infrastructure, no server or hosting needed
- **Google Drive API** — accessed via the script's built-in OAuth (no credentials to configure)
- **HubSpot CRM API** — authenticated via a private app token (`pat-...`) stored in Script Properties

---

## Credentials & configuration (Script Properties)

All configuration is stored in **Project Settings → Script Properties** in the Apps Script editor:

| Property | Description |
|---|---|
| `HUBSPOT_TOKEN` | HubSpot private app access token (`pat-...`) |
| `FOLDER_ID` | Google Drive folder ID to watch |
| `lastChecked` | ISO timestamp of last successful run (auto-managed) |

---

## Logs & debugging

**View → Executions** in the Apps Script editor shows every run with full logs:

- Which files were found
- Which contact was matched (and via which search strategy)
- HubSpot File ID of the uploaded file
- Any files skipped and the reason (name not parseable, no contact found, etc.)

---

## Limitations

- Files are matched by name only — if two contacts share the same first and last name, the first result returned by HubSpot is used
- The trigger polls every 5 minutes — it is not real-time
- Google Apps Script triggers expire after a period of inactivity; if the sync stops working, re-run `createTrigger()` to reset it
- Native Google formats (Docs, Sheets, Slides) are converted to PDF before upload; the original format is not preserved in HubSpot
