import type { Transport } from './service';

/**
 * Delivery through Resend's HTTP API.
 *
 * No SDK: the whole contract is one authenticated POST, and a dependency for
 * that would be more surface than the call itself. `fetch` is injectable so
 * tests can assert on exactly what would be sent without a network.
 *
 * API: https://resend.com/docs/api-reference/emails/send-email
 */

const ENDPOINT = 'https://api.resend.com/emails';

export class EmailDeliveryError extends Error {
  constructor(readonly status: number) {
    // The status only. The response body can echo request fields, and the
    // request carries the recipient's address and a reset link.
    super(`Email provider rejected the message (HTTP ${status})`);
    this.name = 'EmailDeliveryError';
  }
}

export function createResendTransport(options: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): Transport {
  const post = options.fetch ?? fetch;

  return async (message, headers) => {
    const response = await post(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        // List-Unsubscribe and friends, when the category carries them.
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }),
      // A hung provider must not hold a request open until the platform kills
      // the function; failing fast lets the caller record the failure.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new EmailDeliveryError(response.status);
  };
}
