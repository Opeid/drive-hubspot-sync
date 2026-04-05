# Drive → HubSpot Sync

Automatically syncs files from a Google Drive folder to the matching HubSpot contact record. Drop a file in the right subfolder and within 5 minutes it appears as a note with attachment on the contact's activity timeline — named, labelled, and filed correctly with no manual work.

---

## How it works

### 1. Folder structure
The watched Drive folder uses subfolders to label document types. The subfolder name becomes part of the filename uploaded to HubSpot:

```
HubSpot Sync/                          ← FOLDER_ID points here
  ├── Intent to Seize/
  │     └── Ronald Cichinelli.pdf
  ├── Tax Return/
  │     └── John Doe.pdf
  ├── Power of Attorney/
  │     └── Jane Smith.pdf
  └── Ronald Cichinelli.pdf            ← no subfolder = no label
```

### 2. How staff use it

1. Name the document after the client (e.g. `Ronald Cichinelli.pdf`)
2. Drop it into the relevant subfolder in Google Drive (e.g. `Intent to Seize`, `Tax Return`, `Power of Attorney`)
3. Within 5 minutes the document is automatically filed under the client's record in HubSpot — no further action needed

**What appears in HubSpot:** The document shows up on the client's activity timeline as a note with the file attached, named by document type and client:

`Intent to Seize - Ronald Cichinelli.pdf`

### 3. File detection
A Google Apps Script time-based trigger runs every 5 minutes. It checks the parent folder and all subfolders for files added since the last run.

### 4. Name matching
The contact is identified by parsing the filename. The first two alphabetic words are treated as first name and last name — everything else in the filename is ignored:

```
Ronald Cichinelli.pdf     → first: Ronald, last: Cichinelli
John_Doe_2026.pdf         → first: John, last: Doe
Jane-Smith-copy.pdf       → first: Jane, last: Smith
```

The search handles several ways names can be stored in HubSpot:
1. Standard `firstname` + `lastname` fields
2. Full name stored in the `firstname` field (e.g. `" Ronald Cichinelli"`)
3. Last name partial match as a fallback

### 4. File renaming
Before uploading, the file is renamed using the subfolder name as a label:

| Subfolder | Filename | Uploaded to HubSpot as |
|---|---|---|
| Intent to Seize | Ronald Cichinelli.pdf | `Intent to Seize - Ronald Cichinelli.pdf` |
| Tax Return | John Doe.pdf | `Tax Return - John Doe.pdf` |
| *(none)* | Jane Smith.pdf | `Jane Smith.pdf` |

### 5. File upload
The renamed file is uploaded to HubSpot's File Manager under the `/drive-sync` folder. Native Google formats (Docs, Sheets, Slides) are automatically exported as PDF before uploading.

### 6. Contact attachment
A note is created on the contact's activity timeline with the file attached. The file appears in both the **Notes** tab and the **Attachments** panel on the contact record.

---

## Making changes

### Change the watched Drive folder
1. Open [script.google.com](https://script.google.com) → your Drive Sync project
2. **Gear icon → Project Settings → Script Properties**
3. Edit the `FOLDER_ID` value

**How to find a folder ID:** Open the folder in Google Drive. The ID is in the URL:
```
https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I
                                        ^^^^^^^^^^^^^^^^^^^
                                        this is the Folder ID
```

### Add a new document type
Just create a new subfolder inside the watched folder with the label you want. No code changes needed:
```
HubSpot Sync/
  └── IRS Notice/          ← create this
        └── John Doe.pdf   ← drop file here
```
Uploads as: `IRS Notice - John Doe.pdf`

### Change the HubSpot account
Update `HUBSPOT_TOKEN` in Script Properties with a `pat-...` token from the new account's private app.

### Change the polling interval
1. In `Code.gs`, change `POLL_INTERVAL_MINUTES` at the top
2. Run `createTrigger()` to apply the new interval

### Reset the sync (reprocess all files)
In Script Properties, delete or reset `lastChecked` to `1970-01-01T00:00:00Z`, then run `checkNewFiles()`.

---

## Credentials (Script Properties)

| Property | Description |
|---|---|
| `HUBSPOT_TOKEN` | HubSpot private app access token (`pat-...`) |
| `FOLDER_ID` | Google Drive parent folder ID |
| `lastChecked` | ISO timestamp of last run (auto-managed) |

---

## Logs & debugging

**View → Executions** in the Apps Script editor shows every run with full logs — which files were found, which contact was matched, what the file was renamed to, and any skipped files with the reason.

---

## Limitations

- Contacts are matched by first and last name only — if two contacts share the same name, the first HubSpot result is used
- The trigger polls every 5 minutes — it is not real-time
- Files must be named `FirstName LastName.ext` — the script cannot read document content to identify the person
- Native Google formats are converted to PDF on upload
- The script only checks one level of subfolders — nested subfolders are not scanned
