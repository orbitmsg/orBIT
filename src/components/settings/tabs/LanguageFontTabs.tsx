import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { MD3, Block } from '../SettingsShared';
import { MessageStatus } from '../../MessageStatus';
import {
  useChatStore,
  FONT_MAP,
  type FontFamily,
  type Language,
} from '../../../store/useChatStore';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_CHAT_COLOR, resolveThemeMode, type ThemeId } from '../../../theme';
import { getThemeTintById } from '../../../themes';

interface LanguageTabProps {
  language: Language | null;
  setLanguage: (lang: Language) => void;
  languageDisplayOptions: { value: string; label: string; native?: string }[];
}

export const LanguageTab = ({ language, setLanguage, languageDisplayOptions }: LanguageTabProps) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ padding: '0 0 32px' }}
    >
      <Block>
        {languageDisplayOptions.map((opt) => {
          const isSelected = opt.value === language;
          return (
            <div
              key={opt.value}
              onClick={() => setLanguage(opt.value as Language)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 16px',
                borderRadius: '12px',
                margin: '2px 6px',
                cursor: 'pointer',
                transition: 'background 150ms',
                backgroundColor: isSelected ? 'rgba(197,180,227,0.12)' : 'transparent',
                userSelect: 'none',
                contentVisibility: 'auto',
                containIntrinsicSize: '48px',
                boxSizing: 'border-box',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(202,196,208,0.08)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: `2px solid ${isSelected ? MD3.primary : MD3.outlineMed}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'border-color 150ms',
                }}
              >
                {isSelected && (
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: MD3.primary }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: isSelected ? 600 : 400,
                    color: MD3.onSurface,
                  }}
                >
                  {opt.label}
                </div>
                {opt.native && opt.native !== opt.label && (
                  <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{opt.native}</div>
                )}
              </div>
            </div>
          );
        })}
      </Block>
    </motion.div>
  );
};

export interface ChatBubblePreviewProps {
  fontFamily: FontFamily;
  textScale: number;
  bubbleRadius: number;
  chatColor: string;
  currentTheme: ThemeId;
  themeTintId: string;
}

export const ChatBubblePreview: React.FC<ChatBubblePreviewProps> = ({
  fontFamily,
  textScale,
  bubbleRadius,
  chatColor,
  currentTheme,
  themeTintId,
}) => {
  const { t } = useTranslation();
  const resolvedMode = resolveThemeMode(currentTheme);
  const tint = getThemeTintById(themeTintId);
  const tintTokens = tint[resolvedMode];
  const activeFont = FONT_MAP[fontFamily] || FONT_MAP.system;
  const scaleFactor = (Number.isFinite(textScale) && textScale > 0 ? textScale : 100) / 100;
  const incomingTextColor = resolvedMode === 'light' ? '#1b1b1b' : '#f6f6f6';
  const incomingDimColor = resolvedMode === 'light' ? 'rgba(27,27,27,0.55)' : 'rgba(255,255,255,0.55)';
  const ownBubbleBg = chatColor || tintTokens.bubbleOwnBg || DEFAULT_CHAT_COLOR;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 14px',
        backgroundColor: tintTokens.bgPrimary,
        borderRadius: 12,
        border: `1px solid ${tintTokens.borderColor}`,
        transition: 'background-color 180ms ease, border-color 180ms ease',
      }}
    >
      <div
        className="relative flex flex-col"
        style={{
          alignSelf: 'flex-start',
          maxWidth: 'min(460px, 88%)',
          width: 'fit-content',
          minWidth: '50px',
          padding: '7px 12px 7px 11px',
          borderRadius: `${bubbleRadius}px`,
          background: tintTokens.bubbleIncomingBg,
          color: incomingTextColor,
          fontSize: `calc(13px * ${scaleFactor})`,
          transition: 'background 180ms ease, border-radius 120ms ease, color 180ms ease',
        }}
      >
        <div
          style={{
            fontSize: 'inherit',
            lineHeight: 1.35,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            width: '100%',
            position: 'relative',
          }}
        >
          <span
            className="font-picker-item"
            style={{ '--item-font': activeFont } as React.CSSProperties}
          >
            {t('settings.font_preview_incoming', 'Привет! Какой стиль тебе ближе?')}
          </span>
          <span
            aria-hidden="true"
            className="flex-shrink-0"
            style={{
              float: 'right',
              marginLeft: '10px',
              marginRight: '-5px',
              marginBottom: '-4px',
              marginTop: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              className="tabular-nums select-none"
              style={{
                color: incomingDimColor,
                fontSize: `calc(11px * ${scaleFactor})`,
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 1,
              }}
            >
              20:19
            </span>
          </span>
          <div style={{ clear: 'both' }} />
        </div>
      </div>

      <div
        className="relative flex flex-col"
        style={{
          alignSelf: 'flex-end',
          maxWidth: 'min(460px, 88%)',
          width: 'fit-content',
          minWidth: '50px',
          padding: '7px 12px 7px 11px',
          borderRadius: `${bubbleRadius}px`,
          background: ownBubbleBg,
          color: '#ffffff',
          fontSize: `calc(13px * ${scaleFactor})`,
          transition: 'background 180ms ease, border-radius 120ms ease',
        }}
      >
        <div
          style={{
            fontSize: 'inherit',
            lineHeight: 1.35,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            width: '100%',
            position: 'relative',
          }}
        >
          <span
            className="font-picker-item"
            style={{ '--item-font': activeFont } as React.CSSProperties}
          >
            {t('settings.font_preview_roses', 'Вы любите розы? 🌹')}
          </span>
          <span
            aria-hidden="true"
            className="flex-shrink-0"
            style={{
              float: 'right',
              marginLeft: '10px',
              marginRight: '-8px',
              marginBottom: '-4px',
              marginTop: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              className="tabular-nums select-none"
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: `calc(11px * ${scaleFactor})`,
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 1,
              }}
            >
              20:20
              <span
                style={{
                  display: 'inline-flex',
                  width: '24px',
                  minWidth: '24px',
                  flexShrink: 0,
                  justifyContent: 'flex-end',
                }}
              >
                <MessageStatus status="read" isOwn={true} />
              </span>
            </span>
          </span>
          <div style={{ clear: 'both' }} />
        </div>
      </div>
    </div>
  );
};

interface FontTabProps {
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => void;
  fontOptions: { value: string; label: string; native?: string }[];
  hidePreview?: boolean;
  embedded?: boolean;
}

export const FontTab = ({
  fontFamily,
  setFontFamily,
  fontOptions,
  hidePreview = false,
  embedded = false,
}: FontTabProps) => {
  const { textScale, bubbleRadius, chatColor, currentTheme, themeTintId } = useChatStore(
    useShallow((s) => ({
      textScale: s.textScale,
      bubbleRadius: s.bubbleRadius,
      chatColor: s.chatColor,
      currentTheme: s.currentTheme,
      themeTintId: s.themeTintId,
    }))
  );

  const gridBlock = (
    <Block style={{ padding: '12px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))',
          gap: 8,
        }}
      >
        {fontOptions.map((opt) => {
          const isSelected = opt.value === fontFamily;
          const itemFont = FONT_MAP[opt.value as FontFamily] || 'inherit';
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFontFamily(opt.value as FontFamily)}
              aria-label={opt.label}
              aria-pressed={isSelected}
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
                padding: '9px 12px',
                borderRadius: 10,
                cursor: 'pointer',
                userSelect: 'none',
                minWidth: 0,
                backgroundColor: isSelected
                  ? 'color-mix(in srgb, var(--accent-color, #5865F2) 16%, var(--surface-container-strong, #232428))'
                  : 'var(--surface-container-soft, rgba(255,255,255,0.04))',
                border: isSelected
                  ? '1.5px solid var(--accent-color, #5865F2)'
                  : '1.5px solid var(--border-color, rgba(255,255,255,0.08))',
                color: isSelected ? 'var(--text-heading, #ffffff)' : MD3.onSurface,
                transition: 'background-color 140ms ease, border-color 140ms ease, color 140ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--surface-muted, rgba(255,255,255,0.08))';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--surface-container-soft, rgba(255,255,255,0.04))';
                }
              }}
            >
              <span
                className="font-picker-item"
                style={{
                  '--item-font': itemFont,
                  fontSize: 13.5,
                  fontWeight: isSelected ? 600 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                } as React.CSSProperties}
              >
                {opt.label}
              </span>
              {isSelected && (
                <Check
                  size={14}
                  style={{
                    color: 'var(--accent-color, #5865F2)',
                    flexShrink: 0,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </Block>
  );

  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!hidePreview && (
          <Block style={{ padding: '12px' }}>
            <ChatBubblePreview
              fontFamily={fontFamily}
              textScale={textScale}
              bubbleRadius={bubbleRadius}
              chatColor={chatColor}
              currentTheme={currentTheme}
              themeTintId={themeTintId}
            />
          </Block>
        )}
        {gridBlock}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 0 32px' }}
    >
      {!hidePreview && (
        <Block style={{ padding: '12px' }}>
          <ChatBubblePreview
            fontFamily={fontFamily}
            textScale={textScale}
            bubbleRadius={bubbleRadius}
            chatColor={chatColor}
            currentTheme={currentTheme}
            themeTintId={themeTintId}
          />
        </Block>
      )}
      {gridBlock}
    </motion.div>
  );
};
