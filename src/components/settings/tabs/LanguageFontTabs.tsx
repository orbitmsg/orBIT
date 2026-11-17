import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
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

interface SettingsRestartModalProps {
  isOpen: boolean;
  mode: 'language' | 'font';
  currentLang?: string;
  targetLang?: string;
  onClose: () => void;
  onConfirm: () => void;
}

const SettingsRestartModal: React.FC<SettingsRestartModalProps> = ({
  isOpen,
  mode,
  currentLang = 'ru',
  targetLang = 'ru',
  onClose,
  onConfirm,
}) => {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen) return null;

  const topText = mode === 'language'
    ? (i18n.t('settings.restart_for_language', { lng: currentLang }) || 'Orbita will restart in order to change the language')
    : t('settings.restart_for_settings', 'Для применения некоторых настроек требуется перезапуск. Перезапустить сейчас?');

  const bottomText = mode === 'language'
    ? (i18n.t('settings.restart_for_language', { lng: targetLang }) || 'Для смены языка приложение перезапустится')
    : null;

  const confirmText = mode === 'language'
    ? t('settings.ok', 'OK')
    : t('settings.restart_button', 'Перезапустить');

  const modalContent = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[360px] rounded-[10px] p-5 shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
            borderRadius: '10px',
            border: 'none',
            outline: 'none',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            color: 'var(--text-main, #ffffff)',
          }}
        >
          <div className="text-left select-none">
            <h3
              className="text-[14px] font-medium leading-snug"
              style={{ color: 'var(--text-main, #ffffff)', margin: 0 }}
            >
              {topText}
            </h3>
            {bottomText && (
              <p
                className="text-[13px] mt-3 font-normal leading-snug"
                style={{ color: 'var(--text-dim, #9ca3af)', margin: '12px 0 0' }}
              >
                {bottomText}
              </p>
            )}
          </div>

          <div className="flex justify-end items-center gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.cancel', 'Отмена')}
              className="px-4 py-2 rounded-[10px] text-[14px] font-medium transition-colors cursor-pointer"
              style={{
                borderRadius: '10px',
                backgroundColor: 'transparent',
                color: 'var(--accent-text, var(--accent-color, #7C3AED))',
                border: 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {t('common.cancel', 'Отмена')}
            </button>

            <button
              type="button"
              onClick={onConfirm}
              aria-label={confirmText}
              className="px-4 py-2 rounded-[10px] text-[14px] font-medium transition-colors cursor-pointer"
              style={{
                borderRadius: '10px',
                backgroundColor: 'transparent',
                color: 'var(--accent-text, var(--accent-color, #7C3AED))',
                border: 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {confirmText}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

interface LanguageTabProps {
  language: Language | null;
  setLanguage: (lang: Language) => void;
  languageDisplayOptions: { value: string; label: string; native?: string }[];
}

export const LanguageTab = ({ language, setLanguage, languageDisplayOptions }: LanguageTabProps) => {
  const { i18n } = useTranslation();
  const [pendingLanguage, setPendingLanguage] = useState<Language | null>(null);

  const handleConfirmLanguage = async () => {
    const target = pendingLanguage;
    setPendingLanguage(null);
    if (!target) return;
    setLanguage(target);
    try {
      await i18n.changeLanguage(target);
    } catch {}
    if (typeof window !== 'undefined' && window.orbita?.relaunchApp) {
      try {
        await window.orbita.relaunchApp();
        return;
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

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
              onClick={() => {
                if (opt.value !== language) {
                  setPendingLanguage(opt.value as Language);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '12px 16px',
                borderRadius: '10px',
                margin: '2px 6px',
                cursor: 'pointer',
                transition: 'background 150ms',
                backgroundColor: isSelected ? 'var(--surface-active, rgba(197,180,227,0.12))' : 'transparent',
                userSelect: 'none',
                contentVisibility: 'auto',
                containIntrinsicSize: '48px',
                boxSizing: 'border-box',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-hover)';
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
      <SettingsRestartModal
        isOpen={Boolean(pendingLanguage)}
        mode="language"
        currentLang={language || i18n.language || 'ru'}
        targetLang={pendingLanguage || 'ru'}
        onClose={() => setPendingLanguage(null)}
        onConfirm={handleConfirmLanguage}
      />
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
  const ownBubbleBg = chatColor || tintTokens.bubbleOwnBg || DEFAULT_CHAT_COLOR;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 14px',
        backgroundColor: tintTokens.bgPrimary,
        borderRadius: 10,
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
          color: 'var(--chat-bubble-incoming-text, var(--text-main))',
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
                color: 'var(--text-dim)',
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
          color: 'var(--bubble-own-text, #ffffff)',
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
                color: 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 82%, transparent)',
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
                <MessageStatus status="read" isOwn={true} color="var(--bubble-own-text, #ffffff)" />
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
  const [pendingFont, setPendingFont] = useState<FontFamily | null>(null);

  const handleConfirmFont = async () => {
    const target = pendingFont;
    setPendingFont(null);
    if (!target) return;
    setFontFamily(target);
    if (typeof window !== 'undefined' && window.orbita?.relaunchApp) {
      try {
        await window.orbita.relaunchApp();
        return;
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

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
              onClick={() => {
                if (opt.value !== fontFamily) {
                  setPendingFont(opt.value as FontFamily);
                }
              }}
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
                  ? 'var(--surface-active, color-mix(in srgb, var(--accent-color, #5865F2) 16%, var(--surface-container-strong)))'
                  : 'var(--surface-container-soft)',
                border: isSelected
                  ? '1.5px solid var(--accent-color, #5865F2)'
                  : '1.5px solid var(--border-color)',
                color: isSelected ? 'var(--text-heading, var(--text-main))' : MD3.onSurface,
                transition: 'background-color 140ms ease, border-color 140ms ease, color 140ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--surface-container-soft)';
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
                    color: 'var(--accent-text, var(--accent-color, #5865F2))',
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
        <SettingsRestartModal
          isOpen={Boolean(pendingFont)}
          mode="font"
          onClose={() => setPendingFont(null)}
          onConfirm={handleConfirmFont}
        />
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
      <SettingsRestartModal
        isOpen={Boolean(pendingFont)}
        mode="font"
        onClose={() => setPendingFont(null)}
        onConfirm={handleConfirmFont}
      />
    </motion.div>
  );
};
