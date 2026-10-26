import React from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../../store/useChatStore';
import { SendIcon, MicIcon } from './MessageInputIcons';

interface MessageInputVoiceRecorderProps {
  recordingTime: number;
  recordingAmplitude?: number;
  isLocked: boolean;
  lockProgress: number;
  onCancel?: () => void;
  onStop: () => void;
}

const formatDurationWithTenths = (totalSeconds: number) => {
  const totalTenths = Math.floor(Math.max(0, totalSeconds) * 10);
  const m = Math.floor(totalTenths / 600);
  const s = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${tenths}`;
};

export const MessageInputVoiceRecorder: React.FC<MessageInputVoiceRecorderProps> = ({
  recordingTime,
  recordingAmplitude = 0,
  isLocked,
  lockProgress,
  onCancel,
  onStop,
}) => {
  const { t } = useTranslation();
  const chatElementAnimations = useChatStore((state) => state.chatElementAnimations);
  const voiceScale = 1 + (recordingAmplitude / 100) * 0.45;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minHeight: '42px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            display: 'inline-block',
            animation: 'pulse 1s infinite',
          }}
        />
        <span
          style={{
            color: 'var(--text-main)',
            fontSize: '15px',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatDurationWithTenths(recordingTime)}
        </span>
      </div>

      {!isLocked ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'var(--text-dim, #8e9aa8)',
            fontSize: '13.5px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {t('chatWindow.release_outside_to_cancel', 'Для отмены отпустите курсор вне поля')}
        </div>
      ) : (
        <button
          type="button"
          tabIndex={-1}
          onClick={onCancel}
          aria-label={t('chatWindow.cancel_recording', 'Отмена')}
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'none',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
            color: 'var(--accent-color, #7C3AED)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 12px',
            borderRadius: '6px',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {t('chatWindow.cancel_recording', 'Отмена')}
        </button>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!isLocked && (
          <div
            style={{
              position: 'absolute',
              bottom: '50px',
              right: '1px',
              width: '40px',
              height: '80px',
              borderRadius: '9999px',
              backgroundColor: 'var(--surface-container-high, #2b333e)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0 10px 0',
              boxSizing: 'border-box',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          >
            <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
              <rect x="1" y="8" width="16" height="11" rx="3" fill="#8e9aa8" />
              <path
                d={`M4.5 8V4.5a4.5 4.5 0 0 1 9 0V${Math.max(3.5, 8 - lockProgress * 4.5)}`}
                stroke="#8e9aa8"
                strokeWidth="2.2"
                strokeLinecap="round"
                style={{
                  transform: `translateY(-${lockProgress * 3.5}px)`,
                  transition: 'all 0.05s ease-out',
                }}
              />
            </svg>
            <svg
              width="14"
              height="8"
              viewBox="0 0 14 8"
              fill="none"
              style={{ animation: 'orbitaChevronFloat 1.2s infinite ease-in-out' }}
            >
              <path
                d="M1.5 6.5L7 1.5L12.5 6.5"
                stroke="#8e9aa8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        <div
          className="orbita-voice-btn-wrap"
          style={{
            '--voice-scale': voiceScale,
            transform: `translateY(${!isLocked ? -Math.min(lockProgress * 14, 10) : 0}px)`,
            transition: 'transform 0.05s ease-out',
          } as React.CSSProperties}
        >
          {chatElementAnimations !== false && (
            <>
              <div className="orbita-voice-wave-layer orbita-voice-wave-layer-1" />
              <div className="orbita-voice-wave-layer orbita-voice-wave-layer-2" />
              <div className="orbita-voice-wave-layer orbita-voice-wave-layer-3" />
            </>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={isLocked ? onStop : undefined}
            aria-label={
              isLocked
                ? t('chatWindow.send_voice_message', 'Отправить голосовое сообщение')
                : t('chatWindow.voice_message', 'Голосовое сообщение')
            }
            style={{
              position: 'relative',
              zIndex: 2,
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-color, #7C3AED)',
              color: '#ffffff',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isLocked ? 'pointer' : 'default',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {isLocked ? (
              <span style={{ display: 'inline-flex', transform: 'translate(1px, 1px)' }}>
                <SendIcon />
              </span>
            ) : (
              <MicIcon />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
