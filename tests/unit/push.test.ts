import { describe, expect, it } from 'vitest';
import { deviceLabel, isAllowedPushEndpoint } from '@/modules/push/endpoint';

describe('push endpoints', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc123:APA91b',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://web.push.apple.com/QGsI7rk2',
    'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
  ])('accepts the browsers’ push services: %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    // Anything that would let a caller aim this server's requests elsewhere.
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.example/fcm/send/abc',
    'https://evil.example/?fcm.googleapis.com',
    'https://169.254.169.254/latest/meta-data/',
    'https://localhost/api',
    'https://127.0.0.1/',
    'javascript:alert(1)',
    'not a url',
    `https://fcm.googleapis.com/${'a'.repeat(1100)}`,
  ])('refuses everything else: %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

describe('device names', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
      'Samsung Internet on Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
      'Edge on Windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0', 'Firefox on Linux'],
  ])('%s → %s', (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });

  it('names nothing it cannot recognise', () => {
    expect(deviceLabel(null)).toBeNull();
    expect(deviceLabel('curl/8.0')).toBeNull();
  });
});
