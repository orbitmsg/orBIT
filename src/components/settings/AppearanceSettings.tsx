import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  useChatStore,
  FONT_MAP,
  TEXT_SCALE_MIN,
  TEXT_SCALE_MAX,
  type FontFamily,
} from '../../store/useChatStore';
import {
  CHAT_COLOR_PRESETS,
  DEFAULT_CHAT_COLOR,
  resolveThemeMode,
  type ThemeId,
} from '../../theme';
import { THEME_TINT_PRESETS, getThemeTintById } from '../../themes';
import { MD3, Block, SectionHeader } from './SettingsShared';
import { MessageStatus } from '../MessageStatus';
import { ChatBubblePreview, FontTab } from './tabs/LanguageFontTabs';

export const SignalThemePicker: React.FC<{
  activeTheme?: ThemeId;
  onThemeChange?: (id: ThemeId) => void;
}> = ({ activeTheme = 'system', onThemeChange }) => {
  const { t } = useTranslation();

  const themeOptions: { id: ThemeId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'dark',
      label: t('settings.theme_night', 'Ночная'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ),
    },
    {
      id: 'light',
      label: t('settings.theme_day', 'Дневная'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ),
    },
    {
      id: 'system',
      label: t('settings.theme_system', 'Системная'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
      ),
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        padding: '4px 20px 14px',
        userSelect: 'none',
      }}
    >
      {themeOptions.map((opt) => {
        const isActive = activeTheme === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onThemeChange?.(opt.id)}
            aria-label={opt.label}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 8px',
              borderRadius: 14,
              backgroundColor: isActive
                ? 'color-mix(in srgb, var(--accent-color, #2c6bed) 14%, var(--surface-container, #262626))'
                : 'var(--surface-container, #262626)',
              border: isActive
                ? '2px solid var(--accent-color, #2c6bed)'
                : '2px solid var(--border-color, transparent)',
              color: isActive ? 'var(--accent-text, var(--accent-color, #2c6bed))' : 'var(--text-main)',
              transition: 'all 0.18s ease',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ opacity: isActive ? 1 : 0.8 }}>{opt.icon}</div>
            <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 500 }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export const SignalChatColorPicker: React.FC = () => {
  const { t } = useTranslation();
  const chatColor = useChatStore((s) => s.chatColor);
  const bubbleRadius = useChatStore((s) => s.bubbleRadius);
  const setChatColor = useChatStore((s) => s.setChatColor);
  const resetChatColor = useChatStore((s) => s.resetChatColor);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const handleCustomColorClick = () => {
    colorInputRef.current?.click();
  };

  const handleColorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      setChatColor(val);
    }
  };

  const isCustomActive = !CHAT_COLOR_PRESETS.some((p) => p.value === chatColor);

  return (
    <div
      style={{
        margin: '0 10px 16px',
        width: 'calc(100% - 20px)',
        backgroundColor: 'var(--surface-container, #262626)',
        borderRadius: 16,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '14px 12px',
          backgroundColor: 'var(--bg-primary, #121212)',
          borderRadius: 12,
          border: '1px solid var(--border-color)',
        }}
      >
        <div
          className="relative flex flex-col"
          style={{
            alignSelf: 'flex-start',
            maxWidth: 'min(460px, 88%)',
            width: 'fit-content',
            minWidth: '50px',
            padding: '6.5px 12px 6.5px 11px',
            borderRadius: `var(--bubble-radius, ${bubbleRadius}px)`,
            background: 'var(--chat-bubble-incoming-bg, var(--surface-container, #282828))',
            color: 'var(--chat-bubble-incoming-text, var(--text-main))',
            fontSize: 'calc(12px * var(--text-scale, 1))',
          }}
        >
          <div
            className="select-text select-text-incoming"
            style={{
              fontSize: 'inherit',
              lineHeight: 1.3,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              width: '100%',
              position: 'relative',
            }}
          >
            <span>
              {t('settings.chat_color_preview_incoming')}{' '}
              <span className="emoji-font" style={{ fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', sans-serif" }}>
                👋
              </span>
            </span>
            <span
              aria-hidden
              className="flex-shrink-0"
              style={{
                float: 'right',
                marginLeft: '10px',
                marginRight: '-6px',
                marginBottom: '-4.5px',
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
                  fontSize: 'calc(11px * var(--text-scale, 1))',
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
            padding: '6.5px 12px 6.5px 11px',
            borderRadius: `var(--bubble-radius, ${bubbleRadius}px)`,
            background: chatColor || DEFAULT_CHAT_COLOR,
            color: 'var(--bubble-own-text, #ffffff)',
            fontSize: 'calc(12px * var(--text-scale, 1))',
          }}
        >
          <div
            className="select-text select-text-own"
            style={{
              fontSize: 'inherit',
              lineHeight: 1.3,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              width: '100%',
              position: 'relative',
            }}
          >
            <span>
              {t('settings.chat_color_preview_outgoing')}{' '}
              <span className="emoji-font" style={{ fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', sans-serif" }}>
                ✨
              </span>
            </span>
            <span
              aria-hidden
              className="flex-shrink-0"
              style={{
                float: 'right',
                marginLeft: '10px',
                marginRight: '-9px',
                marginBottom: '-4.5px',
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
                  fontSize: 'calc(11px * var(--text-scale, 1))',
                  display: 'inline-flex',
                  alignItems: 'center',
                  lineHeight: 1,
                }}
              >
                20:20
                <span style={{ display: 'inline-flex', width: '26px', minWidth: '26px', flexShrink: 0, justifyContent: 'flex-end' }}>
                  <MessageStatus status="read" isOwn={true} color="var(--bubble-own-text, #ffffff)" />
                </span>
              </span>
            </span>
            <div style={{ clear: 'both' }} />
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(38px, 1fr))',
          gap: 10,
          justifyItems: 'center',
          alignItems: 'center',
        }}
      >
        {CHAT_COLOR_PRESETS.map((preset) => {
          const isSelected = chatColor === preset.value;
          return (
            <button
              key={preset.id}
              onClick={() => setChatColor(preset.value)}
              aria-label={preset.name}
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: preset.value,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxSizing: 'border-box',
                outline: isSelected ? '2.5px solid var(--accent-color, #2c6bed)' : 'none',
                outlineOffset: 3,
                transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.15s ease, outline 0.15s ease',
              }}
            >
              {isSelected && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}

        <button
          onClick={handleCustomColorClick}
          aria-label={t('settings.custom_color')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: isCustomActive ? chatColor : 'var(--surface-container-strong)',
            color: isCustomActive ? 'var(--bubble-own-text, #ffffff)' : 'var(--text-main)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: isCustomActive ? '2.5px solid var(--accent-color, #2c6bed)' : 'none',
            outlineOffset: 3,
            transform: isCustomActive ? 'scale(1.08)' : 'scale(1)',
            transition: 'transform 0.15s ease, outline 0.15s ease',
            boxSizing: 'border-box',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          }}
        >
          {isCustomActive ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bubble-own-text, #ffffff)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
          <input
            ref={colorInputRef}
            type="color"
            value={chatColor.startsWith('#') ? chatColor : '#2c6bed'}
            onChange={handleColorInputChange}
            style={{ display: 'none' }}
          />
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
        <button
          onClick={resetChatColor}
          aria-label={t('settings.reset_all_chat_colors')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--accent-text, var(--accent-color, #2c6bed))',
            padding: '6px 12px',
            borderRadius: 8,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          {t('settings.reset_all_chat_colors')}
        </button>
      </div>
    </div>
  );
};


export const BubbleSlider = ({
  value,
  onChange,
  onChangeCommitted,
  min,
  max,
  step,
  label,
  labelColor,
  valueDisplay,
  formatValue,
  valuePlacement = 'top-right',
  cssVar,
  containerStyle,
  ariaLabel,
}: {
  value: number;
  onChange?: (v: number) => void;
  onChangeCommitted?: (v: number) => void;
  min: number;
  max: number;
  step: number;
  label?: string;
  labelColor?: string;
  valueDisplay?: string;
  formatValue?: (v: number) => string;
  valuePlacement?: 'top-right' | 'right';
  cssVar?: string;
  containerStyle?: React.CSSProperties;
  ariaLabel?: string;
}) => {
  const [localVal, setLocalVal] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const localValRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalVal(value);
      localValRef.current = value;
      if (cssVar) {
        document.documentElement.style.setProperty(cssVar, `${value}px`);
      }
    }
  }, [value, cssVar]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
    };
  }, []);

  const commit = useCallback((finalVal: number) => {
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = null;
    }
    const snappedVal = step && step > 0 ? Math.round((finalVal - min) / step) * step + min : finalVal;
    const clampedVal = Math.max(min, Math.min(max, snappedVal));
    setLocalVal(clampedVal);
    localValRef.current = clampedVal;
    if (onChangeCommitted) {
      onChangeCommitted(clampedVal);
    } else if (onChange) {
      onChange(clampedVal);
    }
  }, [min, max, step, onChange, onChangeCommitted]);

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        commit(localValRef.current);
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [commit]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = Number(e.target.value);
    setLocalVal(nextVal);
    localValRef.current = nextVal;
    if (cssVar) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rounded = step && step >= 1 ? Math.round(nextVal) : nextVal;
        document.documentElement.style.setProperty(cssVar, `${rounded}px`);
      });
    }
    if (onChange && onChangeCommitted) {
      onChange(nextVal);
    } else if (onChange) {
      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = setTimeout(() => {
        onChange(nextVal);
      }, 150);
    }
  };

  const handlePointerDown = () => {
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handlePointerUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      commit(localValRef.current);
    }
  };

  const fillPercent = Math.max(0, Math.min(100, ((localVal - min) / (max - min)) * 100));
  const activeVal = step && step > 0 ? Math.round((localVal - min) / step) * step + min : localVal;
  const displayedText = formatValue ? formatValue(activeVal) : (valueDisplay !== undefined ? valueDisplay : `${activeVal}`);

  const trackContent = (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 28,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 4,
          borderRadius: 2,
          backgroundColor: MD3.outline,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${fillPercent}%`,
            borderRadius: 2,
            backgroundColor: 'var(--accent-color, #7c54cc)',
            transition: isDragging ? 'none' : 'width 0.18s cubic-bezier(0.2, 0, 0, 1)',
            willChange: 'width',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${fillPercent}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            backgroundColor: 'var(--accent-color, #7c54cc)',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.35)',
            transition: isDragging ? 'none' : 'left 0.18s cubic-bezier(0.2, 0, 0, 1)',
            willChange: 'left',
            pointerEvents: 'none',
          }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={localVal}
        onChange={handleInput}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyUp={handlePointerUp}
        onBlur={handlePointerUp}
        aria-label={ariaLabel || label || 'slider'}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          margin: 0,
          padding: 0,
          cursor: isDragging ? 'grabbing' : 'pointer',
          zIndex: 2,
        }}
      />
    </div>
  );

  if (valuePlacement === 'right') {
    return (
      <div style={{ padding: '0 20px 14px 20px', userSelect: 'none', ...containerStyle }}>
        {label && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: labelColor || 'var(--accent-text, var(--accent-color, #9b7dd4))',
              marginBottom: 10,
            }}
          >
            {label}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>{trackContent}</div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: labelColor || 'var(--accent-text, var(--accent-color, #9b7dd4))',
              minWidth: 40,
              textAlign: 'right',
            }}
          >
            {displayedText}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 20px', marginTop: 8, userSelect: 'none', ...containerStyle }}>
      {(label || (displayedText && valueDisplay !== undefined) || (displayedText && formatValue)) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          {label && <span style={{ fontSize: 12, color: labelColor || MD3.onSurfaceVar }}>{label}</span>}
          {displayedText && (
            <span style={{ fontSize: 12, fontWeight: 600, color: MD3.onSurface }}>{displayedText}</span>
          )}
        </div>
      )}
      {trackContent}
    </div>
  );
};

export const BubbleRadiusControl = () => {
  const bubbleRadius = useChatStore((s) => s.bubbleRadius);
  const setBubbleRadius = useChatStore((s) => s.setBubbleRadius);
  return (
    <BubbleSlider
      value={bubbleRadius}
      onChangeCommitted={setBubbleRadius}
      min={4}
      max={16}
      step={1}
      cssVar="--bubble-radius"
    />
  );
};

export interface ChatSettingsTabProps {
  fontOptions?: { value: string; label: string }[];
}

export const ChatSettingsTab: React.FC<ChatSettingsTabProps> = ({ fontOptions }) => {
  const { t, i18n } = useTranslation();
  const {
    currentTheme,
    setTheme,
    themeTintId,
    setThemeTint,
    chatColor,
    setChatColor,
    resetChatColor,
    fontFamily,
    setFontFamily,
    textScale,
    setTextScale,
    bubbleRadius,
    setBubbleRadius,
  } = useChatStore(
    useShallow((s) => ({
      currentTheme: s.currentTheme,
      setTheme: s.setTheme,
      themeTintId: s.themeTintId,
      setThemeTint: s.setThemeTint,
      chatColor: s.chatColor,
      setChatColor: s.setChatColor,
      resetChatColor: s.resetChatColor,
      fontFamily: s.fontFamily,
      setFontFamily: s.setFontFamily,
      textScale: s.textScale,
      setTextScale: s.setTextScale,
      bubbleRadius: s.bubbleRadius,
      setBubbleRadius: s.setBubbleRadius,
    }))
  );

  const colorInputRef = useRef<HTMLInputElement>(null);
  const isRu = (i18n.language || '').toLowerCase().startsWith('ru');
  const resolvedMode = resolveThemeMode(currentTheme);
  const activeTint = getThemeTintById(themeTintId);
  const activeTintTokens = activeTint[resolvedMode];
  const isCustomColor =
    Boolean(chatColor) &&
    chatColor !== activeTint.dark.bubbleOwnBg &&
    chatColor !== activeTint.light.bubbleOwnBg;

  const resolvedFontOptions = useMemo(() => {
    if (fontOptions && fontOptions.length > 0) {
      return fontOptions;
    }
    return (Object.keys(FONT_MAP) as FontFamily[]).map((key) => ({
      value: key,
      label: key === 'system' ? t('settings.default', 'По умолчанию') : key,
    }));
  }, [fontOptions, t]);

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      setChatColor(val);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: '0 0 32px',
      }}
    >
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

      <div>
        <SectionHeader title={t('settings.theme_mode_title', 'Тема')} />
        <Block style={{ padding: '10px 0 0' }}>
          <SignalThemePicker activeTheme={currentTheme} onThemeChange={setTheme} />
        </Block>
      </div>

      <div>
        <SectionHeader title={t('settings.theme_tint_title', 'Цветовой оттенок')} />
        <Block style={{ padding: '14px 14px 12px', gap: 12 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))',
              gap: 8,
            }}
          >
            {THEME_TINT_PRESETS.map((preset) => {
              const isActive = themeTintId === preset.id;
              const modeTokens = preset[resolvedMode];
              const tintName = isRu ? preset.nameRu : preset.nameEn;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setThemeTint(preset.id)}
                  aria-label={tintName}
                  aria-pressed={isActive}
                  style={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '10px 8px',
                    borderRadius: 12,
                    userSelect: 'none',
                    backgroundColor: isActive
                      ? 'var(--surface-active, color-mix(in srgb, var(--accent-color, #5865F2) 15%, var(--surface-container-strong)))'
                      : 'var(--surface-container-soft)',
                    border: isActive
                      ? '2px solid var(--accent-color, #5865F2)'
                      : '2px solid var(--border-color)',
                    color: isActive ? 'var(--text-heading, var(--text-main))' : MD3.onSurface,
                    transition: 'background-color 150ms ease, border-color 150ms ease, transform 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--surface-container-soft)';
                    }
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      backgroundColor: modeTokens.bgPrimary,
                      border: `1.5px solid ${isActive ? modeTokens.accent : 'var(--border-color)'}`,
                      boxShadow: isActive ? `0 0 0 2px color-mix(in srgb, ${modeTokens.accent} 35%, transparent)` : 'none',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: preset.swatch,
                        clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
                      }}
                    />
                    {isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(0, 0, 0, 0.28)',
                        }}
                      >
                        <Check size={15} strokeWidth={3} color="#ffffff" />
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 500,
                      lineHeight: 1.2,
                      textAlign: 'center',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: isActive ? 'var(--accent-text, var(--accent-color, #5865F2))' : MD3.onSurface,
                    }}
                  >
                    {tintName}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingTop: 10,
              borderTop: '1px solid var(--border-color)',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => colorInputRef.current?.click()}
              aria-label={t('settings.custom_color', 'Свой цвет')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px 4px 4px',
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 500,
                color: MD3.onSurface,
                backgroundColor: isCustomColor
                  ? 'color-mix(in srgb, var(--accent-color, #5865F2) 14%, transparent)'
                  : 'transparent',
                transition: 'background-color 150ms ease',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: isCustomColor ? chatColor : activeTintTokens.bubbleOwnBg,
                  border: '1.5px solid var(--border-color)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isCustomColor && <Check size={12} strokeWidth={3} color="var(--bubble-own-text, #ffffff)" />}
              </span>
              <span>{t('settings.custom_color', 'Свой цвет')}</span>
              <input
                ref={colorInputRef}
                type="color"
                value={chatColor && chatColor.startsWith('#') ? chatColor : activeTintTokens.accent}
                onChange={handleCustomColorChange}
                aria-label={t('settings.custom_color', 'Свой цвет')}
                style={{ display: 'none' }}
              />
            </button>

            <button
              type="button"
              onClick={resetChatColor}
              aria-label={t('settings.reset_all_chat_colors', 'Сбросить цвета всех чатов')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: 500,
                color: 'var(--accent-text, var(--accent-color, #5865F2))',
                padding: '4px 8px',
                borderRadius: 8,
                transition: 'opacity 150ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {t('settings.reset_all_chat_colors', 'Сбросить цвета всех чатов')}
            </button>
          </div>
        </Block>
      </div>

      <div>
        <Block style={{ padding: '14px 0 4px', gap: 4 }}>
          <BubbleSlider
            label={t('settings.bubble_radius', 'Скругление сообщений')}
            value={bubbleRadius}
            onChange={setBubbleRadius}
            onChangeCommitted={setBubbleRadius}
            min={4}
            max={16}
            step={1}
            valuePlacement="right"
            formatValue={(v) => `${v}px`}
            cssVar="--bubble-radius"
            ariaLabel={t('settings.bubble_radius', 'Скругление сообщений')}
          />
          <BubbleSlider
            label={t('settings.text_size', 'Размер текста')}
            value={textScale}
            onChange={setTextScale}
            onChangeCommitted={setTextScale}
            min={TEXT_SCALE_MIN}
            max={TEXT_SCALE_MAX}
            step={5}
            valuePlacement="right"
            formatValue={(v) => `${v}%`}
            ariaLabel={t('settings.text_size', 'Размер текста')}
          />
        </Block>
      </div>

      <div>
        <SectionHeader title={t('settings.fonts_title', 'Шрифт сообщений')} />
        <FontTab
          fontFamily={fontFamily}
          setFontFamily={setFontFamily}
          fontOptions={resolvedFontOptions}
          hidePreview={true}
          embedded={true}
        />
      </div>
    </motion.div>
  );
};
