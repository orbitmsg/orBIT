let authStoreGetter: (() => any) | null = null;

export function setAuthStoreGetter(fn: () => any): void {
  authStoreGetter = fn;
}

export function getAuthStoreState(): any {
  return authStoreGetter ? authStoreGetter() : null;
}
