/**
 * Versioned consent documents.
 *
 * Consent is recorded against a version. When a document changes materially,
 * bump the version here — an old agreement is not consent to new terms, and
 * without the version the system silently pretends it is.
 */
export const CURRENT_DOCUMENT_VERSIONS = {
  terms_and_privacy: '2026-09-20',
  marketing_email: '2026-09-20',
} as const;

export type ConsentKind = keyof typeof CURRENT_DOCUMENT_VERSIONS;
