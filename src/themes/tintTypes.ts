export interface ThemeTintModeTokens {
  bgPrimary: string;
  bgSecondary: string;
  surfaceContainer: string;
  surfaceContainerStrong: string;
  borderColor: string;
  titleBarBg: string;
  chatListBg: string;
  accent: string;
  accentLight: string;
  accentDark: string;
  bubbleOwnBg: string;
  bubbleIncomingBg: string;
}

export interface ThemeTintPreset {
  id: string;
  nameRu: string;
  nameEn: string;
  swatch: string;
  dark: ThemeTintModeTokens;
  light: ThemeTintModeTokens;
}
