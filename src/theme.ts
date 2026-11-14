import { createTheme } from '@mui/material/styles';
import { applyMd3DynamicTokens } from './md3Dynamic';
import { DEFAULT_THEME_TINT_ID, getThemeTintById } from './themes';

export type ThemeId = 'system' | 'light' | 'dark';

export interface ThemePreview {
  bg: string;
  surface: string;
  accent: string;
  accentSecondary?: string;
  text: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  preview: ThemePreview;
  vars: Record<string, string>;
  isLight: boolean;
}

export interface ChatColorPreset {
  id: string;
  name: string;
  type: 'solid' | 'gradient';
  value: string;
}

export const DEFAULT_CHAT_COLOR = '#5c54e5';

export const CHAT_COLOR_PRESETS: ChatColorPreset[] = [
  { id: 'iris', name: 'Iris', type: 'solid', value: '#5c54e5' },
  { id: 'ultramarine', name: 'Ultramarine', type: 'solid', value: '#2c6bed' },
  { id: 'crimson', name: 'Crimson', type: 'solid', value: '#c41b4b' },
  { id: 'vermilion', name: 'Vermilion', type: 'solid', value: '#cf3d24' },
  { id: 'burlap', name: 'Burlap', type: 'solid', value: '#69664f' },
  { id: 'forest', name: 'Forest', type: 'solid', value: '#3c6e47' },
  { id: 'wintergreen', name: 'Wintergreen', type: 'solid', value: '#167a5b' },
  { id: 'teal', name: 'Teal', type: 'solid', value: '#0c7285' },
  { id: 'blue', name: 'Blue', type: 'solid', value: '#3761a6' },
  { id: 'indigo', name: 'Indigo', type: 'solid', value: '#5951c8' },
  { id: 'violet', name: 'Violet', type: 'solid', value: '#8038b3' },
  { id: 'plum', name: 'Plum', type: 'solid', value: '#9d3483' },
  { id: 'taupe', name: 'Taupe', type: 'solid', value: '#82626e' },
  { id: 'steel', name: 'Steel', type: 'solid', value: '#596678' },
  { id: 'ember', name: 'Ember', type: 'gradient', value: 'linear-gradient(135deg, #d33c2a 0%, #d87a20 100%)' },
  { id: 'midnight', name: 'Midnight', type: 'gradient', value: 'linear-gradient(135deg, #2b395d 0%, #584f7b 100%)' },
  { id: 'infrared', name: 'Infrared', type: 'gradient', value: 'linear-gradient(135deg, #7c2271 0%, #a42c55 100%)' },
  { id: 'lagoon', name: 'Lagoon', type: 'gradient', value: 'linear-gradient(135deg, #09687e 0%, #158b76 100%)' },
  { id: 'fluorescent', name: 'Fluorescent', type: 'gradient', value: 'linear-gradient(135deg, #762299 0%, #c42978 100%)' },
  { id: 'basil', name: 'Basil', type: 'gradient', value: 'linear-gradient(135deg, #206d4e 0%, #177a33 100%)' },
  { id: 'sublime', name: 'Sublime', type: 'gradient', value: 'linear-gradient(135deg, #4456a2 0%, #90539b 100%)' },
  { id: 'sea', name: 'Sea', type: 'gradient', value: 'linear-gradient(135deg, #246497 0%, #19808a 100%)' },
  { id: 'tangerine', name: 'Tangerine', type: 'gradient', value: 'linear-gradient(135deg, #bd3450 0%, #d86824 100%)' },
];

export const AVAILABLE_FONTS = {
  telegram: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  segoeUi: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
};

export const DEFAULT_FONT = "var(--main-font), 'Apple Color Emoji', sans-serif";

const standardThemeVars: Record<string, string> = {
  '--bg-primary': '#070708',
  '--bg-secondary': '#121212',
  '--accent-color': '#5865F2',
  '--accent-light': '#7983f5',
  '--accent-dark': '#4752c4',
  '--accent-gradient': 'linear-gradient(135deg, #5865F2 0%, #4752c4 100%)',
  '--accent-glow': 'rgba(88, 101, 242, 0.25)',
  '--accent-glow-light': 'rgba(88, 101, 242, 0.12)',
  '--text-main': '#dbdee1',
  '--text-dim': '#949ba4',
  '--text-offline': '#80848e',
  '--text-heading': '#ffffff',
  '--surface-container': '#18181a',
  '--surface-container-strong': '#1e1e21',
  '--surface-container-soft': 'rgba(255,255,255,0.05)',
  '--surface-muted': 'rgba(255,255,255,0.06)',
  '--surface-muted-strong': 'rgba(255,255,255,0.12)',
  '--surface-subtle': 'rgba(255,255,255,0.03)',
  '--border-color': 'rgba(255,255,255,0.08)',
  '--chat-list-bg': '#121212',
  '--surface-border': 'rgba(255,255,255,0.08)',
  '--online-color': '#917bbd',
  '--offline-color': '#80848e',
  '--switch-bg': 'rgba(255,255,255,0.16)',
  '--switch-border': 'rgba(255,255,255,0.22)',
  '--selection-bg': 'rgba(88, 101, 242, 0.10)',
  '--logo-type': 'classic',
  '--title-bar-bg': '#121212',
  '--settings-bg': '#070708',
  '--settings-surface': '#121212',
  '--settings-surface-var': '#18181a',
  '--settings-outline': 'rgba(255,255,255,0.08)',
  '--settings-outline-med': 'rgba(255,255,255,0.14)',
  '--settings-on-surface': '#FFFFFF',
  '--settings-on-surface-var': '#8e8e93',
  '--settings-primary': '#AFAFAF',
  '--settings-on-primary': '#070708',
  '--settings-primary-cont': '#2a2a2e',
  '--settings-error': '#f23f43',
  '--settings-error-cont': 'rgba(242,63,67,0.12)',
};

const standardPreview: ThemePreview = {
  bg: '#070708',
  surface: '#121212',
  accent: '#AFAFAF',
  accentSecondary: '#D4D4D8',
  text: '#FFFFFF',
};

export const themePalettes: Record<ThemeId, ThemeDefinition> = {
  system: {
    id: 'system',
    name: 'Default Dark',
    isLight: false,
    preview: standardPreview,
    vars: standardThemeVars,
  },
  light: {
    id: 'light',
    name: 'Default Dark',
    isLight: false,
    preview: standardPreview,
    vars: standardThemeVars,
  },
  dark: {
    id: 'dark',
    name: 'Default Dark',
    isLight: false,
    preview: standardPreview,
    vars: standardThemeVars,
  },
};

export const availableThemes = Object.fromEntries(
  Object.values(themePalettes).map(({ id, name, preview }) => [id, { id, name, preview }])
) as Record<ThemeId, { id: ThemeId; name: string; preview: ThemePreview }>;

let systemThemeListenerAttached = false;
let activeThemeTintId = DEFAULT_THEME_TINT_ID;
let activeChatColor: string | undefined;

const parseFirstHexRgb = (color: string): [number, number, number] | null => {
  const match = color.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex.split('').map((ch) => ch + ch).join('');
  }
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const getHexBrightness = (color: string): number => {
  const rgb = parseFirstHexRgb(color);
  if (!rgb) return 0;
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
};

export const getContrastTextColor = (color: string): string => {
  const rgb = parseFirstHexRgb(color);
  if (!rgb) return '#ffffff';
  const brightness = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return brightness > 0.62 ? '#111318' : '#ffffff';
};

export const resolveThemeMode = (themeId: ThemeId): 'light' | 'dark' => {
  if (themeId === 'light' || themeId === 'dark') {
    return themeId;
  }
  const isDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isDark ? 'dark' : 'light';
};

export const resolveThemeVars = (_themeId: ThemeId, _chatColor?: string, _themeTintId?: string) => {
  const resolvedMode = 'dark';
  const theme = themePalettes.dark;
  const tint = getThemeTintById(DEFAULT_THEME_TINT_ID);

  const accentColor = '#5865F2';
  const effectiveChatColor = '#383a40';
  const accentOnColor = '#FFFFFF';
  const bubbleOwnText = '#FFFFFF';
  const accentText = '#FFFFFF';

  const textMain = '#dbdee1';
  const textDim = '#949ba4';

  const surfaceHover = 'rgba(255, 255, 255, 0.05)';
  const surfaceActive = 'rgba(255, 255, 255, 0.09)';
  const scrollThumbColor = 'rgba(255, 255, 255, 0.28)';
  const mdOutlineMed = 'rgba(255, 255, 255, 0.14)';

  const vars: Record<string, string> = {
    ...theme.vars,
    '--bg-primary': '#070708',
    '--bg-secondary': '#121212',
    '--chat-list-bg': '#121212',
    '--surface-container': '#18181a',
    '--surface-container-strong': '#1e1e21',
    '--surface-container-soft': 'rgba(255, 255, 255, 0.05)',
    '--surface-hover': surfaceHover,
    '--surface-active': surfaceActive,
    '--border-color': 'rgba(255, 255, 255, 0.08)',
    '--surface-border': 'rgba(255, 255, 255, 0.08)',
    '--online-color': '#917bbd',
    '--offline-color': '#80848e',
    '--title-bar-bg': '#121212',
    '--titlebar-fg': '#b0b0b0',
    '--titlebar-hover-fg': '#ffffff',
    '--titlebar-hover-bg': 'rgba(255, 255, 255, 0.09)',
    '--titlebar-active-bg': 'rgba(255, 255, 255, 0.16)',
    '--scroll-thumb-color': scrollThumbColor,
    '--text-main': '#dbdee1',
    '--text-heading': '#ffffff',
    '--text-dim': '#949ba4',
    '--settings-bg': '#070708',
    '--settings-surface': '#121212',
    '--settings-surface-var': '#18181a',
    '--settings-outline': 'rgba(255, 255, 255, 0.08)',
    '--settings-outline-med': mdOutlineMed,
    '--settings-on-surface': '#dbdee1',
    '--settings-on-surface-var': '#949ba4',
    '--chat-bubble-own-bg': '#222226',
    '--bubble-own-text': bubbleOwnText,
    '--chat-bubble-incoming-bg': '#141416',
    '--chat-bubble-incoming-text': '#FFFFFF',
    '--accent-color': '#5865F2',
    '--accent-light': '#7983f5',
    '--accent-dark': '#4752c4',
    '--accent-hover': '#4752c4',
    '--accent-gradient': 'linear-gradient(135deg, #5865F2 0%, #4752c4 100%)',
    '--accent-on-color': accentOnColor,
    '--accent-text': accentText,
    '--accent-glow': 'rgba(88, 101, 242, 0.25)',
    '--accent-glow-light': 'rgba(88, 101, 242, 0.12)',
    '--selection-bg': 'rgba(88, 101, 242, 0.15)',
    '--md-sys-color-primary': '#5865F2',
    '--settings-primary': '#5865F2',
    '--settings-on-primary': '#070708',
    '--settings-primary-cont': '#2a2a2e',
  };

  const mdVars: Record<string, string> = {
    '--md-bg': vars['--settings-bg'],
    '--md-surface': vars['--settings-surface'],
    '--md-surface-var': vars['--settings-surface-var'],
    '--md-outline': vars['--settings-outline'],
    '--md-outline-med': mdOutlineMed,
    '--md-on-surface': textMain,
    '--md-on-surface-var': textDim,
    '--md-primary': accentColor,
    '--md-on-primary': accentOnColor,
    '--md-primary-cont': accentColor,
    '--md-error': vars['--settings-error'] || '#f44336',
    '--md-error-cont': vars['--settings-error-cont'] || 'rgba(244,67,54,0.12)',
  };

  return {
    resolvedMode,
    isLight: false,
    tintId: tint.id,
    accentColor,
    effectiveChatColor,
    vars: { ...vars, ...mdVars },
  };
};

export const applyThemeToRoot = (themeId: ThemeId, chatColor?: string, themeTintId?: string) => {
  if (themeId === 'system' && !systemThemeListenerAttached && typeof window !== 'undefined' && window.matchMedia) {
    systemThemeListenerAttached = true;
    try {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', () => {
        const activeThemeSetting = document.documentElement.getAttribute('data-theme-setting');
        if (activeThemeSetting === 'system' || !activeThemeSetting) {
          const storedTintId = document.documentElement.getAttribute('data-theme-tint') || activeThemeTintId;
          applyThemeToRoot('system', activeChatColor, storedTintId);
        }
      });
    } catch (e) { }
  }

  const root = document.documentElement;
  const resolved = resolveThemeVars(themeId, chatColor, themeTintId);
  activeThemeTintId = resolved.tintId;
  activeChatColor = chatColor;

  root.setAttribute('data-theme-setting', themeId);
  root.setAttribute('data-theme', resolved.resolvedMode);
  root.setAttribute('data-theme-light', resolved.isLight ? 'true' : 'false');
  root.setAttribute('data-theme-tint', resolved.tintId);
  root.style.setProperty('--theme-id', themeId);
  root.style.setProperty('--theme-tint-id', resolved.tintId);

  Object.entries(resolved.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  try {
    applyMd3DynamicTokens(
      root,
      resolved.accentColor,
      resolved.vars['--bg-secondary'] || '#1b1b1b',
      resolved.isLight
    );
  } catch (e) { }

  try {
    if (typeof window !== 'undefined' && (window as any).orbita?.setThemeForElectron) {
      (window as any).orbita.setThemeForElectron(resolved.resolvedMode, resolved.vars);
    }
  } catch (e) { }
};

const defaultFontFamily = DEFAULT_FONT;

const md3Theme = createTheme({
  cssVariables: false,
  shape: { borderRadius: 12 },
  palette: {
    mode: 'dark',
    primary: {
      main: themePalettes.dark.vars['--accent-color'],
      light: themePalettes.dark.vars['--accent-light'],
      dark: themePalettes.dark.vars['--accent-dark'],
    },
    background: {
      default: themePalettes.dark.vars['--bg-primary'],
      paper: themePalettes.dark.vars['--bg-secondary'],
    },
    text: {
      primary: themePalettes.dark.vars['--text-main'],
      secondary: themePalettes.dark.vars['--text-dim'],
    },
  },
  typography: {
    fontFamily: defaultFontFamily,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { fontSize: '16px' },
        body: { fontFamily: defaultFontFamily, fontSize: 'calc(14px * var(--text-scale, 1))' },
        '*, *::before, *::after': { fontFamily: defaultFontFamily },
      },
    },
    MuiButtonBase: {
      styleOverrides: { root: { fontSize: '14px', lineHeight: '20px' } },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '20px',
          padding: '10px 24px',
          minHeight: '40px',
          maxHeight: '40px',
          boxSizing: 'border-box',
          fontSize: '14px',
          lineHeight: '20px',
          fontFamily: defaultFontFamily,
          textTransform: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        },
        sizeSmall: { padding: '8px 16px', minHeight: '32px', maxHeight: '32px', fontSize: '13px', lineHeight: '18px' },
        sizeLarge: { padding: '12px 28px', minHeight: '44px', maxHeight: '44px', fontSize: '15px', lineHeight: '22px' },
        text: { padding: '10px 16px', minHeight: '40px', maxHeight: 'none', whiteSpace: 'normal' },
        contained: {
          background: 'linear-gradient(135deg, var(--md-sys-color-primary, var(--accent-color)) 0%, var(--accent-dark) 100%)',
          boxShadow: 'var(--md-sys-elevation-2, 0 2px 6px rgba(0,0,0,0.22))',
          '&:hover': {
            background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--accent-dark) 100%)',
            boxShadow: 'var(--md-sys-elevation-3, 0 4px 8px rgba(0,0,0,0.28))',
          },
        },
        outlined: {
          border: 'none',
          backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 10%, transparent)',
          color: 'var(--text-main, #fff)',
          '&:hover': {
            border: 'none',
            backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 16%, transparent)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { padding: '8px', fontSize: '18px', width: '40px', height: '40px', minWidth: '40px', minHeight: '40px', maxWidth: '40px', maxHeight: '40px', boxSizing: 'border-box', overflow: 'hidden', borderRadius: '12px' },
        sizeSmall: { padding: '4px', fontSize: '16px', width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px' },
        sizeLarge: { padding: '10px', fontSize: '22px', width: '48px', height: '48px', minWidth: '48px', minHeight: '48px', maxWidth: '48px', maxHeight: '48px' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--surface-container, rgba(255,255,255,0.05))',
          borderRadius: 'var(--md-sys-shape-corner-medium, 12px)',
          '& .MuiOutlinedInput-root': {
            fontFamily: defaultFontFamily,
            '& fieldset': { borderColor: 'var(--surface-border, rgba(255,255,255,0.15))' },
            '&:hover fieldset': { borderColor: 'var(--accent-color)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--accent-color)' },
          },
          '& .MuiInputLabel-root': { fontFamily: defaultFontFamily },
          '& .MuiTypography-root': { fontFamily: defaultFontFamily },
        },
      },
    },
    MuiTypography: {
      styleOverrides: { root: { fontFamily: defaultFontFamily, fontWeight: 400 } },
    },
    MuiInputBase: {
      styleOverrides: { root: { fontFamily: defaultFontFamily } },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 52, height: 32, padding: 0,
          '& .MuiSwitch-switchBase': {
            padding: 4,
            '&.Mui-checked': {
              transform: 'translateX(20px)',
              color: '#fff',
              '& + .MuiSwitch-track': { backgroundColor: 'var(--accent-color)', opacity: 1 },
            },
          },
          '& .MuiSwitch-thumb': { width: 24, height: 24, boxShadow: 'var(--md-sys-elevation-1, 0 1px 3px rgba(0,0,0,0.35))' },
          '& .MuiSwitch-track': {
            borderRadius: 'var(--md-sys-shape-corner-full, 9999px)',
            backgroundColor: 'var(--switch-bg, rgba(255,255,255,0.14))',
            opacity: 1,
          },
        },
      },
    },
  },
});

export default md3Theme;