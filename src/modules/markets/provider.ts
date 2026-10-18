import type { StoredQuote } from './schema';

/** What a keyed provider answers for one instrument. */
export type ProviderQuote =
  | ({ ok: true } & StoredQuote)
  | {
      ok: false;
      error: string;
      /** The provider refused for quota: worth waiting, not worth retrying now. */
      limited?: boolean;
    };
