import React from 'react';
import { useTranslation } from 'react-i18next';
import { SendIcon } from './MessageInputIcons';

interface MessageInputVoiceRecorderProps {
  recordingTime: number;
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
  onCancel,
  onStop,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minHeight: '31px',
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

      <button
        type="button"
        tabIndex={-1}
        onClick={onStop}
        aria-label="Отправить голосовое сообщение"
        style={{
          background: 'none',
          border: 'none',
          outline: 'none',
          boxShadow: 'none',
          color: 'var(--accent-color, #7C3AED)',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.2s, opacity 0.2s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent-color, #7C3AED)'; }}
      >
        <SendIcon />
      </button>
    </div>
  );
};
