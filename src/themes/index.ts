import type { ThemeTintModeTokens, ThemeTintPreset } from './tintTypes';
import { themeTint as discordIndigo } from './tints/01-discord-indigo';
import { themeTint as amethystDusk } from './tints/02-amethyst-dusk';
import { themeTint as sapphireAbyss } from './tints/03-sapphire-abyss';
import { themeTint as emeraldGrove } from './tints/04-emerald-grove';
import { themeTint as crimsonVelvet } from './tints/05-crimson-velvet';
import { themeTint as sunsetAmber } from './tints/06-sunset-amber';
import { themeTint as sakuraBloom } from './tints/07-sakura-bloom';
import { themeTint as arcticTeal } from './tints/08-arctic-teal';
import { themeTint as cosmicNeon } from './tints/09-cosmic-neon';
import { themeTint as monochromeGraphite } from './tints/10-monochrome-graphite';

export type { ThemeTintModeTokens, ThemeTintPreset };

export const DEFAULT_THEME_TINT_ID = 'discord-indigo';

export const THEME_TINT_PRESETS: ThemeTintPreset[] = [
  discordIndigo,
  amethystDusk,
  sapphireAbyss,
  emeraldGrove,
  crimsonVelvet,
  sunsetAmber,
  sakuraBloom,
  arcticTeal,
  cosmicNeon,
  monochromeGraphite,
];

export function getThemeTintById(id?: string | null): ThemeTintPreset {
  if (id) {
    const found = THEME_TINT_PRESETS.find((preset) => preset.id === id);
    if (found) return found;
  }
  return THEME_TINT_PRESETS[0];
}
