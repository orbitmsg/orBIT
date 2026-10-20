import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
  Copy,
  Share2,
  Download,
  Grid,
  Trash2,
} from 'lucide-react';
import { MediaViewerItem } from './types';

interface MediaViewerOptionsMenuProps {
  currentItem: MediaViewerItem;
  isPhoto: boolean;
  onGoToMessage?: (messageId: string) => void;
  onForwardMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onOpenAllMedia?: () => void;
  onClose: () => void;
  onCopyImage: () => void;
  onDownload: () => void;
}

export const MediaViewerOptionsMenu = forwardRef<HTMLDivElement, MediaViewerOptionsMenuProps>(({
  currentItem,
  isPhoto,
  onGoToMessage,
  onForwardMessage,
  onDeleteMessage,
  onOpenAllMedia,
  onClose,
  onCopyImage,
  onDownload,
}, ref) => {
  const { t } = useTranslation();

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 40,
        right: 0,
        backgroundColor: 'rgba(24, 26, 32, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: 8,
        padding: '4px 0',
        minWidth: 210,
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {currentItem.messageId && onGoToMessage && (
        <button
          onClick={() => {
            onClose();
            onGoToMessage(currentItem.messageId!);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            color: '#ffffff',
            fontSize: '13px',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
          }}
          className="hover:bg-white/10 transition-colors"
        >
          <ExternalLink size={16} />
          <span>{t('mediaViewer.goToMessage', 'Перейти к сообщению')}</span>
        </button>
      )}

      {isPhoto && (
        <button
          onClick={() => {
            onCopyImage();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            color: '#ffffff',
            fontSize: '13px',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
          }}
          className="hover:bg-white/10 transition-colors"
        >
          <Copy size={16} />
          <span>{t('common.copy')}</span>
        </button>
      )}

      {currentItem.messageId && onForwardMessage && (
        <button
          onClick={() => {
            onForwardMessage(currentItem.messageId!);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            color: '#ffffff',
            fontSize: '13px',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
          }}
          className="hover:bg-white/10 transition-colors"
        >
          <Share2 size={16} />
          <span>{t('mediaViewer.forward', 'Переслать')}</span>
        </button>
      )}

      <button
        onClick={() => {
          onDownload();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          color: '#ffffff',
          fontSize: '13px',
          borderRadius: 6,
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
        }}
        className="hover:bg-white/10 transition-colors"
      >
        <Download size={16} />
        <span>{t('mediaViewer.saveAs', 'Сохранить как...')}</span>
      </button>

      {onOpenAllMedia && (
        <button
          onClick={() => {
            onClose();
            onOpenAllMedia();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            color: '#ffffff',
            fontSize: '13px',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
          }}
          className="hover:bg-white/10 transition-colors"
        >
          <Grid size={16} />
          <span>{t('mediaViewer.allPhotos', 'Все фотографии')}</span>
        </button>
      )}

      {currentItem.messageId && onDeleteMessage && (
        <button
          onClick={() => {
            onClose();
            onDeleteMessage(currentItem.messageId!);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            color: '#ef4444',
            fontSize: '13px',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
          }}
          className="hover:bg-red-500/20 transition-colors"
        >
          <Trash2 size={16} />
          <span>{t('mediaViewer.delete', 'Удалить')}</span>
        </button>
      )}
    </div>
  );
});
