// ============================================================
// Google Drive → HubSpot Sync
// Paste this entire file into script.google.com
//
// SETUP:
//   1. Fill in HUBSPOT_ACCESS_TOKEN and FOLDER_ID below
//   2. Click Run → checkNewFiles once (approve permissions)
//   3. Click Run → createTrigger to auto-run every 5 minutes
// ============================================================

var CONFIG = {
  HUBSPOT_ACCESS_TOKEN: 'your_hubspot_private_app_token_here',
  FOLDER_ID: 'your_google_drive_folder_id_here', // from the folder URL: /folders/<ID>
  POLL_INTERVAL_MINUTES: 5
};

// ─── Main entry point (called by trigger) ───────────────────

function checkNewFiles() {
  var folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
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

  var contact = findContactByName(parsed.firstName, parsed.lastName);
  if (!contact) {
    Logger.log('  Skipped: no HubSpot contact found for "' + parsed.firstName + ' ' + parsed.lastName + '"');
    return;
  }

  Logger.log('  Matched contact ID: ' + contact.id);

  var blob = getFileBlob(file);
  var hubspotFileId = uploadFileToHubSpot(blob, filename);
  Logger.log('  Uploaded to HubSpot files: ' + hubspotFileId);

  attachFileToContact(contact.id, hubspotFileId, filename);
  Logger.log('  Attached to contact. Done.');
}

// ─── Parse first/last name from filename ─────────────────────
// Supports: John_Doe_Contract.pdf / Jane Smith - Proposal.pdf / Robert-Jones.pdf

function parseNameFromFilename(filename) {
  var base = filename.replace(/\.[^/.]+$/, '').trim();
  var tokens = base.split(/[\s_\-]+/).filter(function(t) {
    return /^[a-zA-Z]{2,}$/.test(t);
  });

  if (tokens.length < 2) return null;

  return {
    firstName: capitalize(tokens[0]),
    lastName: capitalize(tokens[1])
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ─── Google Drive helpers ─────────────────────────────────────

function getFileBlob(file) {
  var mimeType = file.getMimeType();

  // Export native Google formats (Docs, Sheets, Slides) as PDF
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

function findContactByName(firstName, lastName) {
  var url = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
  var payload = {
    filterGroups: [{
      filters: [
        { propertyName: 'firstname', operator: 'EQ', value: firstName },
        { propertyName: 'lastname',  operator: 'EQ', value: lastName  }
      ]
    }],
    properties: ['firstname', 'lastname'],
    limit: 1
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { Authorization: 'Bearer ' + CONFIG.HUBSPOT_ACCESS_TOKEN },
    muteHttpExceptions: true
  });

  var data = JSON.parse(response.getContentText());

  if (data.results && data.results.length > 0) {
    return data.results[0];
  }

  return null;
}

// ─── HubSpot: upload file ─────────────────────────────────────

function uploadFileToHubSpot(blob, filename) {
  var url = 'https://api.hubapi.com/files/v3/files';

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: {
      file: blob,
      folderPath: '/drive-sync',
      options: JSON.stringify({ access: 'PRIVATE' })
    },
    headers: { Authorization: 'Bearer ' + CONFIG.HUBSPOT_ACCESS_TOKEN },
    muteHttpExceptions: true
  });

  var data = JSON.parse(response.getContentText());

  if (!data.id) {
    throw new Error('HubSpot file upload failed: ' + response.getContentText());
  }

  return data.id;
}

// ─── HubSpot: create note + associate with contact ────────────

function attachFileToContact(contactId, hubspotFileId, filename) {
  // 1. Create a note referencing the file
  var noteUrl = 'https://api.hubapi.com/crm/v3/objects/notes';
  var notePayload = {
    properties: {
      hs_note_body: 'Document synced from Google Drive: ' + filename + ' (File ID: ' + hubspotFileId + ')',
      hs_timestamp: new Date().toISOString()
    }
  };

  var noteResponse = UrlFetchApp.fetch(noteUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(notePayload),
    headers: { Authorization: 'Bearer ' + CONFIG.HUBSPOT_ACCESS_TOKEN },
    muteHttpExceptions: true
  });

  var note = JSON.parse(noteResponse.getContentText());

  if (!note.id) {
    throw new Error('Failed to create HubSpot note: ' + noteResponse.getContentText());
  }

  // 2. Associate the note with the contact
  var assocUrl = 'https://api.hubapi.com/crm/v4/objects/notes/' + note.id + '/associations/contacts/' + contactId;
  UrlFetchApp.fetch(assocUrl, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]),
    headers: { Authorization: 'Bearer ' + CONFIG.HUBSPOT_ACCESS_TOKEN },
    muteHttpExceptions: true
  });
}

// ─── Trigger setup ────────────────────────────────────────────
// Run this once from the editor to set up auto-polling

function createTrigger() {
  // Remove any existing triggers for this function
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkNewFiles') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('checkNewFiles')
    .timeBased()
    .everyMinutes(CONFIG.POLL_INTERVAL_MINUTES)
    .create();

  Logger.log('Trigger created: checkNewFiles runs every ' + CONFIG.POLL_INTERVAL_MINUTES + ' minutes.');
}
