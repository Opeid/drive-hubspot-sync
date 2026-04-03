import { getNewFilesInFolder, downloadFile, DriveFile } from './drive';
import { findContactByName, uploadFileToHubSpot, attachFileToContact } from './hubspot';
import { parseNameFromFilename } from './parseFilename';

export interface SyncResult {
  file: string;
  status: 'success' | 'skipped' | 'error';
  reason?: string;
  contactId?: string;
}

export async function syncNewFiles(): Promise<SyncResult[]> {
  const files = await getNewFilesInFolder();

  if (files.length === 0) {
    console.log('[sync] No new files found.');
    return [];
  }

  console.log(`[sync] Processing ${files.length} file(s)...`);

  const results: SyncResult[] = [];

  for (const file of files) {
    results.push(await processFile(file));
  }

  return results;
}

async function processFile(file: DriveFile): Promise<SyncResult> {
  console.log(`[sync] Processing: ${file.name}`);

  const parsed = parseNameFromFilename(file.name);
  if (!parsed) {
    return {
      file: file.name,
      status: 'skipped',
      reason: 'Could not extract first/last name from filename',
    };
  }

  const { firstName, lastName } = parsed;
  console.log(`[sync]   Parsed name: ${firstName} ${lastName}`);

  const contact = await findContactByName(firstName, lastName);
  if (!contact) {
    return {
      file: file.name,
      status: 'skipped',
      reason: `No HubSpot contact found for "${firstName} ${lastName}"`,
    };
  }

  console.log(`[sync]   Matched contact: ${contact.id} (${contact.firstName} ${contact.lastName})`);

  const fileBuffer = await downloadFile(file.id);
  const mimeType = guessMimeType(file.name, file.mimeType);

  const hubspotFileId = await uploadFileToHubSpot(fileBuffer, file.name, mimeType);
  console.log(`[sync]   Uploaded to HubSpot files: ${hubspotFileId}`);

  await attachFileToContact(contact.id, hubspotFileId, file.name);
  console.log(`[sync]   Attached to contact ${contact.id}`);

  return {
    file: file.name,
    status: 'success',
    contactId: contact.id,
  };
}

function guessMimeType(filename: string, driveMimeType: string): string {
  // If Drive already gives a binary mime type, use it
  if (!driveMimeType.startsWith('application/vnd.google-apps')) {
    return driveMimeType;
  }
  // Google Docs are exported as PDF
  return 'application/pdf';
}
