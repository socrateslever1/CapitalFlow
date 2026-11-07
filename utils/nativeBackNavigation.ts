export type BackTarget = 'exit-dialog' | 'modal' | 'hub' | 'route' | 'tab';

/** Native back navigation order; the browser history alone doesn't track local tabs. */
export function resolveBackTarget(input: {
  hasModal: boolean;
  hubOpen: boolean;
  pathname: string;
  activeTab: string;
  canGoBackTab?: boolean;
}): BackTarget {
  if (input.hasModal) return 'modal';
  if (input.hubOpen) return 'hub';
  if (input.pathname !== '/') return 'route';
  if (input.activeTab !== 'DASHBOARD' || input.canGoBackTab) return 'tab';
  return 'exit-dialog';
}

/** A direct deep link must never back out of the Android process unintentionally. */
export function getRouteBackFallback(pathname: string): string {
  if (pathname.startsWith('/carteira/') && pathname !== '/carteira/visao-geral') {
    return '/carteira/visao-geral';
  }
  return '/';
}
