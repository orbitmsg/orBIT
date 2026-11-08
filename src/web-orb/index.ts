import { browserOrbitaAdapter } from './browserAdapter';

export const initWebOrb = () => {
  if (typeof window === 'undefined') return;
  if ((window as any).orbita) return;
  browserOrbitaAdapter.init();
};
