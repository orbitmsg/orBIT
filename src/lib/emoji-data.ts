import data from '@emoji-mart/data';

interface EmojiMartSkin {
  unified: string;
  native: string;
  x?: number;
  y?: number;
  shortcodes?: string;
}

interface EmojiMartEmoji {
  id: string;
  name: string;
  keywords: string[];
  skins: EmojiMartSkin[];
  emoticons?: string[];
  version?: number;
}

interface EmojiMartCategory {
  id: string;
  emojis: string[];
}

export interface Emoji {
  char: string;
  id: string;
  name: string;
  category: string;
  keywords: string[];
  codepoint?: string;
}

const UNSUPPORTED_EMOJIS = new Set([
  '🫥', '🫢', '🫣', '🫠', '🫡', '🥹', '🫤', '🫨', '🩷', '🩵', '🩶',
  '🫸', '🫷', '🪿', '🫎', '🪼', '🪭', '🪮', '🪈', '🪇', '🪻', '🫚',
  '🫛', '🪽', '🪾', '🫅', '🫄', '🫃', '🫦', '🫧', '🪹', '🪺', '🪪',
  '🫗', '🪣', '🪤', '🪘', '🩼', '🩻', '🪒', '🪄', '🪅', '🪆', '🪡',
  '🪢', '🩴', '🪖', '🪗', '🪕', '🪚', '🪛', '🪜', '🪝', '🪞', '🪟',
  '🪠', '🪡'
]);

let isInitialized = false;
const emojiById = new Map<string, Emoji>();
const emojiByChar = new Map<string, Emoji>();
const searchCache = new Map<string, Emoji[]>();

const rawAllEmojis: Emoji[] = [];
export const allEmojis: Emoji[] = new Proxy(rawAllEmojis, {
  get(target, prop, receiver) {
    ensureInitialized();
    return Reflect.get(target, prop, receiver);
  }
});

const rawEmojiCategories: string[] = [];
export const EMOJI_CATEGORIES: string[] = new Proxy(rawEmojiCategories, {
  get(target, prop, receiver) {
    ensureInitialized();
    return Reflect.get(target, prop, receiver);
  }
});

function ensureInitialized() {
  if (isInitialized) return;
  isInitialized = true;

  const typedData = data as {
    emojis: Record<string, EmojiMartEmoji>;
    categories: EmojiMartCategory[];
  };

  const emojiIdToCategory = new Map<string, string>();
  for (const cat of typedData.categories) {
    rawEmojiCategories.push(cat.id);
    for (const emojiId of cat.emojis) {
      emojiIdToCategory.set(emojiId, cat.id);
    }
  }

  const list = Object.values(typedData.emojis)
    .filter((raw) => {
      if (!raw.skins || raw.skins.length === 0) return false;
      if (raw.version && raw.version > 13) return false;
      if (UNSUPPORTED_EMOJIS.has(raw.skins[0].native)) return false;
      return true;
    })
    .map((raw) => ({
      char: raw.skins[0].native,
      id: raw.id,
      name: raw.name || raw.id,
      category: emojiIdToCategory.get(raw.id) || '',
      keywords: raw.keywords || [],
      codepoint: raw.skins[0].unified,
    }));

  for (const item of list) {
    rawAllEmojis.push(item);
    emojiById.set(item.id, item);
    if (!emojiByChar.has(item.char)) {
      emojiByChar.set(item.char, item);
    }
  }
}

export function getEmojisByCategory(categoryId: string): Emoji[] {
  ensureInitialized();
  const typedData = data as {
    emojis: Record<string, EmojiMartEmoji>;
    categories: EmojiMartCategory[];
  };
  const category = typedData.categories.find((cat) => cat.id === categoryId);
  if (!category) return [];
  return category.emojis
    .map((id) => emojiById.get(id))
    .filter((e): e is Emoji => e !== undefined);
}

export function searchEmojis(query: string): Emoji[] {
  if (!query.trim()) return [];
  ensureInitialized();
  const cacheKey = query.toLowerCase();
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }
  const lowerQuery = query.toLowerCase();
  const results = rawAllEmojis.filter((e) =>
    e.name.toLowerCase().includes(lowerQuery) ||
    e.keywords.some((k) => k.toLowerCase().includes(lowerQuery))
  );
  searchCache.set(cacheKey, results);
  return results;
}

export function getEmojiByChar(char: string): Emoji | null {
  ensureInitialized();
  return emojiByChar.get(char) || null;
}

export function isEmojiOnly(text: string): boolean {
  if (!text || !text.trim()) return false;
  const emojiRegex = /^\s*(?:[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F300}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]|\s)+$/u;
  return emojiRegex.test(text);
}

export function clearSearchCache(): void {
  searchCache.clear();
}

export const categoryLabels: Record<string, string> = {
  smileys: 'Смайлы',
  people: 'Люди',
  animals: 'Животные',
  food: 'Еда',
  activities: 'Активности',
  travel: 'Путешествия',
  objects: 'Предметы',
  symbols: 'Символы',
  flags: 'Флаги',
};
