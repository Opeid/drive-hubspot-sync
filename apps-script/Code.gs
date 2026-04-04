// ============================================================
// Google Drive → HubSpot Sync
// Paste this entire file into script.google.com
//
// SETUP:
//   1. Gear icon → Script Properties → add HUBSPOT_PAK and FOLDER_ID
//   2. Run → checkNewFiles once to approve Google permissions
//   3. Run → createTrigger to auto-run every 5 minutes
// ============================================================

var CONFIG = {
  HUBSPOT_PORTAL_ID: '244621034',
  POLL_INTERVAL_MINUTES: 5
};

// ─── Debug: run this to test contact search ──────────────────

function testSearch() {
  var token = getHubSpotToken();

  // Search by partial name to see what's actually stored
  var response = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      filterGroups: [{
        filters: [{ propertyName: 'lastname', operator: 'CONTAINS_TOKEN', value: 'cichinelli' }]
      }],
      properties: ['firstname', 'lastname'],
      limit: 5
    }),
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  Logger.log('Search result: ' + response.getContentText());
}

// ─── Main entry point (called by trigger) ───────────────────

function checkNewFiles() {
  var folderId = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!folderId) {
    Logger.log('[ERROR] FOLDER_ID not set. Run setupConfig() first.');
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

  var token = getHubSpotToken();
  var contact = findContactByName(parsed.firstName, parsed.lastName, token);
  if (!contact) {
    Logger.log('  Skipped: no HubSpot contact found for "' + parsed.firstName + ' ' + parsed.lastName + '"');
    return;
  }

  Logger.log('  Matched contact ID: ' + contact.id);

  var blob = getFileBlob(file);
  var hubspotFileId = uploadFileToHubSpot(blob, filename, token);
  Logger.log('  Uploaded to HubSpot files: ' + hubspotFileId);

  attachFileToContact(contact.id, hubspotFileId, filename, token);
  Logger.log('  Attached to contact. Done.');
}

// ─── HubSpot token management (auto-refresh via PAK) ─────────

function getHubSpotToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('HUBSPOT_ACCESS_TOKEN');
  var expiresAt = parseInt(props.getProperty('HUBSPOT_TOKEN_EXPIRES_AT') || '0', 10);
  var now = Date.now();

  // Refresh if expired or expiring within 2 minutes
  if (!token || now >= expiresAt - 120000) {
    Logger.log('Refreshing HubSpot access token...');
    token = refreshHubSpotToken();
  }

  return token;
}

function refreshHubSpotToken() {
  var pak = PropertiesService.getScriptProperties().getProperty('HUBSPOT_PAK');
  if (!pak) throw new Error('HUBSPOT_PAK not set. Run setupConfig() first.');

  var response = UrlFetchApp.fetch(
    'https://api.hubapi.com/localdevauth/v1/auth/refresh?portalId=' + CONFIG.HUBSPOT_PORTAL_ID,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ encodedOAuthRefreshToken: pak }),
      muteHttpExceptions: true
    }
  );

  var data = JSON.parse(response.getContentText());

  if (!data.oauthAccessToken) {
    throw new Error('Token refresh failed: ' + response.getContentText());
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty('HUBSPOT_ACCESS_TOKEN', data.oauthAccessToken);
  props.setProperty('HUBSPOT_TOKEN_EXPIRES_AT', String(data.expiresAtMillis));

  Logger.log('Token refreshed. Expires: ' + new Date(data.expiresAtMillis).toISOString());
  return data.oauthAccessToken;
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

function findContactByName(firstName, lastName, token) {
  var fullName = firstName + ' ' + lastName;

  // Try 3 strategies to handle different ways names are stored in HubSpot:
  var searches = [
    // 1. Standard: separate firstname + lastname fields
    { filterGroups: [{ filters: [
      { propertyName: 'firstname', operator: 'EQ', value: firstName },
      { propertyName: 'lastname',  operator: 'EQ', value: lastName  }
    ]}]},
    // 2. Full name crammed into firstname (e.g. " Ronald Cichinelli")
    { filterGroups: [{ filters: [
      { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: firstName },
      { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: lastName  }
    ]}]},
    // 3. Last name only search as fallback
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
      // For multi-result fallback searches, verify the name matches
      for (var j = 0; j < data.results.length; j++) {
        var p = data.results[j].properties;
        var storedName = ((p.firstname || '') + ' ' + (p.lastname || '')).toLowerCase().replace(/\s+/g, ' ').trim();
        var searchName = fullName.toLowerCase();
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
  if (!data.id) throw new Error('HubSpot file upload failed: ' + response.getContentText());
  return data.id;
}

// ─── HubSpot: create note + associate with contact ────────────

function attachFileToContact(contactId, hubspotFileId, filename, token) {
  // Use the v1 engagements API (works with PAK tokens)
  var response = UrlFetchApp.fetch('https://api.hubapi.com/engagements/v1/engagements', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      engagement: {
        active: true,
        type: 'NOTE',
        timestamp: new Date().getTime()
      },
      associations: {
        contactIds: [parseInt(contactId, 10)]
      },
      metadata: {
        body: 'Document synced from Google Drive: ' + filename + ' (HubSpot File ID: ' + hubspotFileId + ')'
      }
    }),
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  var data = JSON.parse(response.getContentText());
  if (!data.engagement || !data.engagement.id) {
    throw new Error('Failed to create engagement: ' + response.getContentText());
  }
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

  Logger.log('Trigger created: checkNewFiles runs every ' + CONFIG.POLL_INTERVAL_MINUTES + ' minutes.');
}
