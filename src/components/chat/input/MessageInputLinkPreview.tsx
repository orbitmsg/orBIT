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
        backgroundColor: 'var(--surface-container, #33363f)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.28)',
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
