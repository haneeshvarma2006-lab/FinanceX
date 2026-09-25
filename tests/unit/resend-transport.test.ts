import { describe, expect, it, vi } from 'vitest';
import { createResendTransport, EmailDeliveryError } from '@/modules/email/resend';

const message = {
  to: 'person@example.com',
  subject: 'Reset your password',
  text: 'The link: https://example.test/reset-password?token=abc',
  category: 'essential' as const,
};

function fakeFetch(status: number, body: unknown = { id: 'email_123' }) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

describe('Resend transport', () => {
  it('sends one authenticated POST in the documented shape', async () => {
    const fetch = fakeFetch(200);
    const send = createResendTransport({ apiKey: 're_test_key', from: 'App <a@b.example>', fetch });

    await send(message, {});

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'App <a@b.example>',
      to: ['person@example.com'],
      subject: 'Reset your password',
      text: message.text,
    });
  });

  it('passes list headers through when a message carries them', async () => {
    const fetch = fakeFetch(200);
    const send = createResendTransport({ apiKey: 'k', from: 'a@b.example', fetch });

    await send(message, { 'List-Unsubscribe': '<https://x.example/u>' });

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).headers).toEqual({
      'List-Unsubscribe': '<https://x.example/u>',
    });
  });

  it('throws on a rejected message, so the failure is recorded rather than lost', async () => {
    const send = createResendTransport({ apiKey: 'k', from: 'a@b.example', fetch: fakeFetch(403) });
    await expect(send(message, {})).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it('never puts the key, the recipient or the link into the error', async () => {
    const send = createResendTransport({
      apiKey: 're_secret_key_value',
      from: 'a@b.example',
      // A provider body that echoes the request back, as error bodies sometimes do.
      fetch: fakeFetch(422, { message: `bad request for ${message.to} ${message.text}` }),
    });

    const error = await send(message, {}).then(
      () => new Error('expected a rejection'),
      (e: unknown) => e as Error,
    );
    expect(error.message).toBe('Email provider rejected the message (HTTP 422)');
    expect(error.message).not.toContain('re_secret_key_value');
    expect(error.message).not.toContain('person@example.com');
    expect(error.message).not.toContain('token=');
  });
});
