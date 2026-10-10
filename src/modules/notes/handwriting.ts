import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '@/lib/env';
import { consume, RULES } from '@/lib/security/rate-limit';

/**
 * Reading a handwritten page with Claude.
 *
 * The browser renders the page (black ink on white, in vertical slices so
 * the writing stays large) and sends the PNGs; this asks Claude to transcribe
 * them and returns plain text for the user to check and correct. Nothing is
 * sent unless the user taps "Read my handwriting", and only that page.
 *
 * Off unless ANTHROPIC_API_KEY is set. Every call is rate-limited per user,
 * because each one costs the operator money.
 */

const MODEL = 'claude-opus-5-5';
const MAX_SLICES = 6;
/** Base64 of a PNG well under the API's 5 MB per-image limit. */
const MAX_SLICE_BASE64 = 3_500_000;
const PNG_MAGIC = 'iVBORw0KGgo';

const SYSTEM = [
  'You transcribe handwritten diary pages.',
  'The images are consecutive vertical slices of one lined page, top to bottom; a line of writing can be cut where one slice meets the next, so join it.',
  'Write out exactly what the person wrote, in their words and language, keeping their line breaks and paragraphs.',
  'Do not correct spelling or grammar, summarise, translate, or add anything. Read crossed-out words as removed.',
  'Where a word cannot be read with confidence, write your best reading followed by [?].',
  'If there is no legible writing at all, reply with exactly: [nothing legible]',
  'Reply with the transcription only — no preamble, no quotes, no notes.',
].join('\n');

export type ReadResult =
  | { ok: true; text: string }
  | {
      ok: false;
      reason: 'not-configured' | 'rate-limited' | 'invalid' | 'refused' | 'unavailable';
      message: string;
    };

export function handwritingEnabled(): boolean {
  return Boolean(getEnv().ANTHROPIC_API_KEY);
}

export async function readHandwriting(
  userId: string,
  slices: readonly string[],
): Promise<ReadResult> {
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'not-configured',
      message:
        'Handwriting recognition is not switched on yet. Your page is saved as you wrote it.',
    };
  }

  if (
    slices.length === 0 ||
    slices.length > MAX_SLICES ||
    slices.some((s) => s.length > MAX_SLICE_BASE64 || !s.startsWith(PNG_MAGIC))
  ) {
    return { ok: false, reason: 'invalid', message: 'That page could not be read. Try again.' };
  }

  const [hour, day] = await Promise.all([
    consume(`handwriting:hour:${userId}`, RULES.handwritingPerHour),
    consume(`handwriting:day:${userId}`, RULES.handwritingPerDay),
  ]);
  if (!hour.allowed || !day.allowed) {
    return {
      ok: false,
      reason: 'rate-limited',
      message: 'That is a lot of reading for now. Your page is safe — try again a little later.',
    };
  }

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // A refused request is retried on the model Anthropic recommends for
      // that refusal category, inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Transcription is reading, not reasoning; low effort keeps it fast.
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            ...slices.map((data) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/png' as const, data },
            })),
            { type: 'text', text: 'Transcribe this page.' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return {
        ok: false,
        reason: 'refused',
        message: 'This page could not be read. You can type the words in yourself.',
      };
    }

    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();

    return { ok: true, text: text === '[nothing legible]' ? '' : text };
  } catch (error) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      // An operator problem, not the user's. The key itself is never logged.
      console.error('Handwriting recognition: the Anthropic API key was rejected');
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Handwriting recognition failed: API error ${error.status ?? 'unknown'}`);
    } else {
      console.error('Handwriting recognition failed: no response from the API');
    }
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Reading is unavailable right now. Your page is safe — try again in a minute.',
    };
  }
}
