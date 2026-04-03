import { Client } from '@hubspot/api-client';
import { FilterOperatorEnum } from '@hubspot/api-client/lib/codegen/crm/contacts';
import FormData from 'form-data';
import axios from 'axios';

function getClient() {
  return new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN! });
}

// ---------- Search contact ----------

export interface HubSpotContact {
  id: string;
  firstName: string;
  lastName: string;
}

export async function findContactByName(
  firstName: string,
  lastName: string
): Promise<HubSpotContact | null> {
  const client = getClient();

  const res = await client.crm.contacts.searchApi.doSearch({
    filterGroups: [
      {
        filters: [
          { propertyName: 'firstname', operator: FilterOperatorEnum.Eq, value: firstName },
          { propertyName: 'lastname', operator: FilterOperatorEnum.Eq, value: lastName },
        ],
      },
    ],
    properties: ['firstname', 'lastname'],
    limit: 1,
    after: '0',
    sorts: [],
  });

  if (!res.results || res.results.length === 0) return null;

  const contact = res.results[0];
  return {
    id: contact.id,
    firstName: contact.properties['firstname'] ?? firstName,
    lastName: contact.properties['lastname'] ?? lastName,
  };
}

// ---------- Upload file to HubSpot Files ----------

export async function uploadFileToHubSpot(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const form = new FormData();
  form.append('file', fileBuffer, { filename: fileName, contentType: mimeType });
  form.append('folderPath', '/drive-sync');
  form.append('options', JSON.stringify({ access: 'PRIVATE' }));

  const res = await axios.post<{ id: string }>(
    'https://api.hubapi.com/files/v3/files',
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      },
    }
  );

  return res.data.id;
}

// ---------- Attach file to contact via Note ----------

export async function attachFileToContact(
  contactId: string,
  hubspotFileId: string,
  fileName: string
): Promise<void> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN!;

  // 1. Create a note via the CRM objects API
  const noteRes = await axios.post<{ id: string }>(
    'https://api.hubapi.com/crm/v3/objects/notes',
    {
      properties: {
        hs_note_body: `Document synced from Google Drive: <a href="https://app.hubspot.com/files/${hubspotFileId}">${fileName}</a>`,
        hs_timestamp: new Date().toISOString(),
      },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  const noteId = noteRes.data.id;

  // 2. Associate the note with the contact (association type 202 = note→contact)
  await axios.put(
    `https://api.hubapi.com/crm/v4/objects/notes/${noteId}/associations/contacts/${contactId}`,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}
