import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  Copy,
  Share2,
  Clock,
  Download,
  LayoutGrid,
  Trash2,
} from 'lucide-react';
import { MediaViewerItem, formatVideoTime } from './types';

interface MediaViewerOptionsMenuProps {
  currentItem: MediaViewerItem;
  isPhoto: boolean;
  isVideo?: boolean;
  currentTime?: number;
  onGoToMessage?: (messageId: string) => void;
  onForwardMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onOpenAllMedia?: () => void;
  onClose: () => void;
  onCopyImage: () => void;
  onCopyFrame?: () => void;
  onSendFromTime?: (timeSec: number) => void;
  onDownload: () => void;
}

export const MediaViewerOptionsMenu = forwardRef<HTMLDivElement, MediaViewerOptionsMenuProps>(({
  currentItem,
  isPhoto,
  isVideo,
  currentTime = 0,
  onGoToMessage,
  onForwardMessage,
  onDeleteMessage,
  onOpenAllMedia,
  onClose,
  onCopyImage,
  onCopyFrame,
  onSendFromTime,
  onDownload,
}, ref) => {
  const { t } = useTranslation();

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 10px)',
        right: 0,
        backgroundColor: 'rgba(28, 30, 36, 0.96)',
        backdropFilter: 'blur(16px)',
        borderRadius: 12,
        padding: '6px 0',
        minWidth: 220,
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
        border: 'none',
        outline: 'none',
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
            padding: '9px 16px',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            transition: 'background-color 0.15s',
          }}
          className="hover:bg-white/10"
        >
          <Eye size={16} />
          <span>{t('mediaViewer.goToMessage', 'Перейти к сообщению')}</span>
        </button>
      )}

      {isVideo && onCopyFrame ? (
        <button
          onClick={() => {
            onClose();
            onCopyFrame();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 16px',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            transition: 'background-color 0.15s',
          }}
          className="hover:bg-white/10"
        >
          <Copy size={16} />
          <span>{t('mediaViewer.copyFrame', 'Копировать кадр')}</span>
        </button>
      ) : isPhoto ? (
        <button
          onClick={() => {
            onClose();
            onCopyImage();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 16px',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            transition: 'background-color 0.15s',
          }}
          className="hover:bg-white/10"
        >
          <Copy size={16} />
          <span>{t('common.copy')}</span>
        </button>
      ) : null}

      {currentItem.messageId && onForwardMessage && (
        <button
          onClick={() => {
            onClose();
            onForwardMessage(currentItem.messageId!);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 16px',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            transition: 'background-color 0.15s',
          }}
          className="hover:bg-white/10"
        >
          <Share2 size={16} />
          <span>{t('mediaViewer.forward', 'Переслать')}</span>
        </button>
      )}

      {isVideo && currentTime > 0 && onSendFromTime && (
        <button
          onClick={() => {
            onClose();
            onSendFromTime(currentTime);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 16px',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            transition: 'background-color 0.15s',
          }}
          className="hover:bg-white/10"
        >
          <Clock size={16} />
          <span>{t('mediaViewer.sendFromTime', { time: formatVideoTime(currentTime) })}</span>
        </button>
      )}

      {currentItem.messageId && onDeleteMessage && currentItem.isOwn && (
        <button
          onClick={() => {
            onClose();
            onDeleteMessage(currentItem.messageId!);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 16px',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#ef4444',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            transition: 'background-color 0.15s',
          }}
          className="hover:bg-red-500/20"
        >
          <Trash2 size={16} />
          <span>{t('mediaViewer.delete', 'Удалить')}</span>
        </button>
      )}

      <button
        onClick={() => {
          onClose();
          onDownload();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '9px 16px',
          background: 'none',
          border: 'none',
          outline: 'none',
          color: '#ffffff',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          transition: 'background-color 0.15s',
        }}
        className="hover:bg-white/10"
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
            padding: '9px 16px',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            transition: 'background-color 0.15s',
          }}
          className="hover:bg-white/10"
        >
          <LayoutGrid size={16} />
          <span>{t('mediaViewer.showAllFiles', 'Показать все файлы')}</span>
        </button>
      )}
    </div>
  );
});
