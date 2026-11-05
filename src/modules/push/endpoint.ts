/**
 * Which addresses the server will send a push to.
 *
 * A subscription arrives from the browser, so its endpoint is whatever the
 * caller says it is. Posting to it blindly would let anyone make this server
 * send requests to an address of their choosing — an internal service, a
 * cloud metadata address. So an endpoint is accepted only on HTTPS, on the
 * default port, at a host belonging to one of the browsers' push services.
 */
const PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge on Android, Samsung Internet, Opera
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, // Safari, iPhone home-screen apps
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  return PUSH_HOSTS.some((host) => host.test(url.hostname));
}

/** "Chrome on Android", "Safari on iPhone": a name a person recognises in settings. */
export function deviceLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPod/i.test(ua)
      ? 'iPhone'
      : /iPad/i.test(ua)
        ? 'iPad'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/i.test(ua)
            ? 'Mac'
            : /Linux/i.test(ua)
              ? 'Linux'
              : null;
  const browser = /SamsungBrowser/i.test(ua)
    ? 'Samsung Internet'
    : /Edg\//i.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/i.test(ua)
        ? 'Opera'
        : /Firefox|FxiOS/i.test(ua)
          ? 'Firefox'
          : /Chrome|CriOS/i.test(ua)
            ? 'Chrome'
            : /Safari/i.test(ua)
              ? 'Safari'
              : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}
