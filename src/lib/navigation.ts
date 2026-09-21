import type { useRouter } from 'next/navigation';

/**
 * Navigate to the current path with a modified query string.
 *
 * `typedRoutes` checks route literals against the known route tree, which it
 * cannot do for a query string assembled at runtime. The cast is confined to
 * this one helper — the path always comes from `usePathname()`, so it is a
 * route that already exists, and only the query varies.
 */
type Router = ReturnType<typeof useRouter>;

export function pushWithParams(router: Router, pathname: string, params: URLSearchParams): void {
  const query = params.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  // Safe: `pathname` is the route we are already on.
  router.push(href as Parameters<Router['push']>[0]);
}

/**
 * Set or clear one parameter, always resetting pagination.
 *
 * Changing a filter without resetting the page lands the user on an empty
 * page 4 of a two-page result, which reads as "no results" and is wrong.
 */
export function setParam(
  router: Router,
  pathname: string,
  current: URLSearchParams,
  key: string,
  value: string,
): void {
  const params = new URLSearchParams(current.toString());

  if (value) params.set(key, value);
  else params.delete(key);

  params.delete('page');
  pushWithParams(router, pathname, params);
}
