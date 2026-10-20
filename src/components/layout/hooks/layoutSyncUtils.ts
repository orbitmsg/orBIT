export const isAppInFocusAndVisible = (): boolean => {
  if (typeof document === 'undefined') return false;
  if (document.hidden || document.visibilityState === 'hidden') return false;
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
  return true;
};
