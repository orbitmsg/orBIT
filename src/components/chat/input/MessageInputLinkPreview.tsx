import React from 'react';
import { X } from 'lucide-react';
import type { LinkPreviewData } from '../../../store/useChatStore';

interface MessageInputLinkPreviewProps {
  preview: LinkPreviewData;
  onDismiss: (url: string) => void;
}

export const MessageInputLinkPreview: React.FC<MessageInputLinkPreviewProps> = ({
  preview,
  onDismiss,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        width: '100%',
        backgroundColor: 'color-mix(in srgb, var(--surface-container) 70%, transparent)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid color-mix(in srgb, var(--text-main) 12%, transparent)',
        borderRadius: '18px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
        padding: '8px 14px',
        marginBottom: '8px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div style={{ width: '3px', height: '32px', borderRadius: '2px', backgroundColor: 'var(--accent-color)', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <div style={{ color: 'var(--accent-color)', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {preview.siteName || 'Предпросмотр ссылки'}
          </div>
          <div style={{ color: 'var(--text-main)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preview.title || preview.url}
          </div>
        </div>
      </div>
      <button
        onClick={() => onDismiss(preview.url)}
        aria-label="Закрыть предпросмотр"
        style={{
          color: 'var(--text-dim)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          flexShrink: 0,
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
};
