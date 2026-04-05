// ============================================================
// Google Drive → HubSpot Sync
// Paste this entire file into script.google.com
//
// SETUP:
//   1. Gear icon → Script Properties → add:
//      HUBSPOT_TOKEN  = pat-na2-...  (your private app token)
//      FOLDER_ID      = your Google Drive folder ID
//   2. Run → checkNewFiles once to approve Google permissions
//   3. Run → createTrigger to auto-run every 5 minutes
// ============================================================

var CONFIG = {
  POLL_INTERVAL_MINUTES: 5
};

function getToken() {
  var token = PropertiesService.getScriptProperties().getProperty('HUBSPOT_TOKEN');
  if (!token) throw new Error('HUBSPOT_TOKEN not set in Script Properties.');
  return token;
}

// ─── Main entry point (called by trigger) ───────────────────

function checkNewFiles() {
  var folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!folderId) {
    Logger.log('[ERROR] FOLDER_ID not set in Script Properties.');
    return;
  }

  var folder = DriveApp.getFolderById(folderId);
  var props = PropertiesService.getScriptProperties();
  var lastChecked = new Date(props.getProperty('lastChecked') || '1970-01-01T00:00:00Z');
  var now = new Date();

  Logger.log('Checking for files created after: ' + lastChecked.toISOString());

  var files = folder.getFiles();
  var processed = 0;

  while (files.hasNext()) {
    var file = files.next();
    if (file.getDateCreated() > lastChecked) {
      processFile(file);
      processed++;
    }
  }

  Logger.log('Done. Processed ' + processed + ' new file(s).');
  props.setProperty('lastChecked', now.toISOString());
}

// ─── Process a single file ───────────────────────────────────

function processFile(file) {
  var filename = file.getName();
  Logger.log('Processing: ' + filename);

  var parsed = parseNameFromFilename(filename);
  if (!parsed) {
    Logger.log('  Skipped: could not parse first/last name from "' + filename + '"');
    return;
  }

  Logger.log('  Parsed name: ' + parsed.firstName + ' ' + parsed.lastName);

  var token = getToken();
  var contact = findContactByName(parsed.firstName, parsed.lastName, token);
  if (!contact) {
    Logger.log('  Skipped: no HubSpot contact found for "' + parsed.firstName + ' ' + parsed.lastName + '"');
    return;
  }

  Logger.log('  Matched contact ID: ' + contact.id);

  var blob = getFileBlob(file);
  var hubspotFilename = parsed.hubspotFilename;
  Logger.log('  Uploading as: ' + hubspotFilename);
  var hubspotFileId = uploadFileToHubSpot(blob, hubspotFilename, token);
  Logger.log('  Uploaded to HubSpot files: ' + hubspotFileId);

  attachFileToContact(contact.id, hubspotFileId, hubspotFilename, token);
  Logger.log('  Attached to contact. Done.');
}

// ─── Parse first/last name from filename ─────────────────────

function parseNameFromFilename(filename) {
  var ext = (filename.match(/\.[^/.]+$/) || ['.pdf'])[0];
  var base = filename.replace(/\.[^/.]+$/, '').trim();
  var tokens = base.split(/[\s_\-]+/).filter(function(t) {
    return /^[a-zA-Z]{2,}$/.test(t);
  });
  if (tokens.length < 2) return null;

  var firstName = capitalize(tokens[0]);
  var lastName = capitalize(tokens[1]);

  // Everything after the first two words becomes the document type label
  // e.g. "Ronald Cichinelli Intent to Seize" → docType = "Intent to Seize"
  var docType = tokens.slice(2).join(' ');

  // Build the HubSpot filename: "Intent to Seize - Ronald Cichinelli.pdf"
  // If no doc type in filename, just use "Ronald Cichinelli.pdf"
  var hubspotFilename = docType
    ? docType + ' - ' + firstName + ' ' + lastName + ext
    : firstName + ' ' + lastName + ext;

  return { firstName: firstName, lastName: lastName, hubspotFilename: hubspotFilename };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ─── Google Drive helpers ─────────────────────────────────────

function getFileBlob(file) {
  var mimeType = file.getMimeType();
  if (mimeType.indexOf('application/vnd.google-apps') === 0) {
    var exportUrl = 'https://www.googleapis.com/drive/v3/files/' + file.getId() + '/export?mimeType=application/pdf';
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    return response.getBlob().setName(file.getName().replace(/\.[^.]+$/, '') + '.pdf');
  }
  return file.getBlob();
}

// ─── HubSpot: find contact ────────────────────────────────────

function findContactByName(firstName, lastName, token) {
  var searches = [
    // 1. Standard: separate firstname + lastname fields
    { filterGroups: [{ filters: [
      { propertyName: 'firstname', operator: 'EQ', value: firstName },
      { propertyName: 'lastname',  operator: 'EQ', value: lastName  }
    ]}]},
    // 2. Full name stored in firstname field (e.g. " Ronald Cichinelli")
    { filterGroups: [{ filters: [
      { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: firstName },
      { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: lastName  }
    ]}]},
    // 3. Last name contains token fallback
    { filterGroups: [{ filters: [
      { propertyName: 'lastname', operator: 'CONTAINS_TOKEN', value: lastName }
    ]}]}
  ];

  for (var i = 0; i < searches.length; i++) {
    var response = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(Object.assign(searches[i], { properties: ['firstname', 'lastname'], limit: 5 })),
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });

    var data = JSON.parse(response.getContentText());
    if (data.results && data.results.length > 0) {
      for (var j = 0; j < data.results.length; j++) {
        var p = data.results[j].properties;
        var storedName = ((p.firstname || '') + ' ' + (p.lastname || '')).toLowerCase().replace(/\s+/g, ' ').trim();
        if (storedName.indexOf(firstName.toLowerCase()) !== -1 && storedName.indexOf(lastName.toLowerCase()) !== -1) {
          Logger.log('  Found via strategy ' + (i + 1) + ': ' + p.firstname + ' ' + p.lastname);
          return data.results[j];
        }
      }
    }
  }

  return null;
}

// ─── HubSpot: upload file ─────────────────────────────────────

function uploadFileToHubSpot(blob, filename, token) {
  blob = blob.setName(filename);
  var response = UrlFetchApp.fetch('https://api.hubapi.com/files/v3/files', {
    method: 'post',
    payload: {
      file: blob,
      folderPath: '/drive-sync',
      options: JSON.stringify({ access: 'PRIVATE' })
    },
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  var data = JSON.parse(response.getContentText());
  if (!data.id) throw new Error('File upload failed: ' + response.getContentText());
  return data.id;
}

// ─── HubSpot: create note on contact timeline ────────────────

function attachFileToContact(contactId, hubspotFileId, filename, token) {
  // 1. Create a note
  var noteRes = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/objects/notes', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      properties: {
        hs_note_body: 'Document synced from Google Drive: ' + filename,
        hs_timestamp: new Date().toISOString(),
        hs_attachment_ids: hubspotFileId
      }
    }),
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  var note = JSON.parse(noteRes.getContentText());
  if (!note.id) throw new Error('Failed to create note: ' + noteRes.getContentText());

  // 2. Associate note with contact
  UrlFetchApp.fetch(
    'https://api.hubapi.com/crm/v4/objects/notes/' + note.id + '/associations/contacts/' + contactId,
    {
      method: 'put',
      contentType: 'application/json',
      payload: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]),
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    }
  );
}

// ─── Trigger setup ────────────────────────────────────────────

function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkNewFiles') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('checkNewFiles')
    .timeBased()
    .everyMinutes(CONFIG.POLL_INTERVAL_MINUTES)
    .create();

  Logger.log('Trigger created: runs every ' + CONFIG.POLL_INTERVAL_MINUTES + ' minutes.');
}
