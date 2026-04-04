# Drive → HubSpot Sync

Automatically uploads files placed in a Google Drive folder to the matching HubSpot contact record, matched by first and last name parsed from the filename. The file appears as a note with attachment on the contact's activity timeline.

---

## How it works

1. You drop a file into a watched Google Drive folder.
2. The script (running on Google's servers) checks for new files every 5 minutes.
3. It parses the filename to extract first and last name.
4. It searches HubSpot for a contact with that name.
5. It uploads the file to HubSpot Files.
6. It creates a note on the contact's activity timeline with the file attached.

---

## Filename format

The filename must start with `FirstName LastName`. Examples:

```
John_Doe_Contract.pdf       → searches for John Doe
Jane Smith - Proposal.pdf   → searches for Jane Smith
Robert-Johnson.pdf          → searches for Robert Johnson
```

---

## Setup

### 1. Create a HubSpot Private App

1. In HubSpot go to **Settings → Integrations → Private Apps → Create legacy app**
2. Name it **Drive Sync**
3. Under **Scopes**, add:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `files`
4. Click **Create app** and copy the `pat-...` token

### 2. Open Google Apps Script

Go to [script.google.com](https://script.google.com) → **New project**

### 3. Paste the script

Delete any existing code and paste the contents of [`apps-script/Code.gs`](apps-script/Code.gs).

### 4. Add Script Properties

Click the **gear icon → Project Settings → Script Properties → Add property** and add:

| Property | Value |
|---|---|
| `HUBSPOT_TOKEN` | `pat-...` token from your private app |
| `FOLDER_ID` | Your Google Drive folder ID (from the folder URL: `/folders/THIS_PART`) |

### 5. Run once to approve permissions

Select **`checkNewFiles`** from the function dropdown and click **Run**. Google will ask you to approve permissions — click through.

### 6. Set up the auto-trigger

Select **`createTrigger`** and click **Run**. The script will now check for new files every 5 minutes automatically.

---

## That's it

Drop a file in the folder — within 5 minutes it will appear as a note with attachment on the matching HubSpot contact record.

To check logs: **View → Executions** in the Apps Script editor.
