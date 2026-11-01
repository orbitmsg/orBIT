import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        width: '100%',
        paddingBottom: '8px',
        marginBottom: '6px',
        borderBottom: '1px solid var(--border-color)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div style={{ width: '3px', height: '32px', borderRadius: '2px', backgroundColor: 'var(--accent-color)', flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <div style={{ color: 'var(--accent-color)', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {preview.siteName || t('chatWindow.link_preview', 'Предпросмотр ссылки')}
          </div>
          <div style={{ color: 'var(--text-main)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preview.title || preview.url}
          </div>
        </div>
      </div>
      <button
        onClick={() => onDismiss(preview.url)}
        aria-label={t('common.close', 'Закрыть')}
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
