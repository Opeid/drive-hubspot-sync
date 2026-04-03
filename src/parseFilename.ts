export interface ParsedName {
  firstName: string;
  lastName: string;
}

/**
 * Extracts first and last name from a filename.
 *
 * Supported patterns (case-insensitive):
 *   John_Doe_Contract.pdf
 *   John Doe - Proposal.pdf
 *   John-Doe.pdf
 *   Doe_John_Agreement.pdf  (last, first — detected by position heuristic)
 */
export function parseNameFromFilename(filename: string): ParsedName | null {
  // Strip extension
  const base = filename.replace(/\.[^/.]+$/, '').trim();

  // Split on whitespace, underscores, or hyphens
  const tokens = base.split(/[\s_\-]+/).filter(isNameToken);

  if (tokens.length < 2) return null;

  const firstName = capitalize(tokens[0]);
  const lastName = capitalize(tokens[1]);

  return { firstName, lastName };
}

/** Keeps only alphabetic tokens (skips numbers, dates, etc.) */
function isNameToken(token: string): boolean {
  return /^[a-zA-Z]{2,}$/.test(token);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
