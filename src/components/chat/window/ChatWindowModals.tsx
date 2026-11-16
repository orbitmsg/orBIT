import React, { Suspense } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Message } from '../../../store/useChatStore';
import { mediaManager } from '../../../services/mediaManager';
import { ActionConfirmModal, type ConfirmActionType } from '../../common/ActionConfirmModal';
import { type MediaViewerItem } from '../TelegramMediaViewer';
import { type AttachedFile } from '../FileAttachmentModal';
import { MessageContextMenu, type ContextMenuState } from '../MessageContextMenu';
import { AddGroupMemberModal } from '../AddGroupMemberModal';
import { parseMedia, decryptedUrlCache } from './chatWindowHelpers';

const EmojiPicker = React.lazy(() => import('../EmojiPicker').then((m) => ({ default: m.EmojiPicker })));
const DiscordFileLimitModal = React.lazy(() => import('../DiscordFileLimitModal').then((m) => ({ default: m.DiscordFileLimitModal })));
const SendAsTxtModal = React.lazy(() => import('../SendAsTxtModal').then((m) => ({ default: m.SendAsTxtModal })));
const FileAttachmentModal = React.lazy(() => import('../FileAttachmentModal').then((m) => ({ default: m.FileAttachmentModal })));
const TelegramMediaViewer = React.lazy(() => import('../TelegramMediaViewer').then((m) => ({ default: m.TelegramMediaViewer })));
const UnsafeLinkModal = React.lazy(() => import('../UnsafeLinkModal').then((m) => ({ default: m.UnsafeLinkModal })));
const ForwardModal = React.lazy(() => import('../ForwardModal').then((m) => ({ default: m.ForwardModal })));

export interface ChatWindowModalsProps {
  isDiscordFileLimitModalOpen: boolean;
  setIsDiscordFileLimitModalOpen: (v: boolean) => void;
  maxFileMb: number;
  isSendAsTxtModalOpen: boolean;
  setIsSendAsTxtModalOpen: (v: boolean) => void;
  handleSendAsTxt: (caption: string) => Promise<void>;
  inputTextLength: number;
  confirmModal: {
    isOpen: boolean;
    type: ConfirmActionType | null;
    selectedCount?: number;
  };
  setConfirmModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean; type: ConfirmActionType | null }>>;
  activeChatId: string | null;
  activeChat: any;
  handleConfirmAction: () => void;
  mediaViewerState: {
    isOpen: boolean;
    initialIndex: number;
    customItems?: MediaViewerItem[];
  };
  setMediaViewerState: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    initialIndex: number;
    customItems?: MediaViewerItem[];
  }>>;
  chatMediaViewerItems: MediaViewerItem[];
  sharedSecret?: string | null;
  handleMediaGoToMessage: (msgId: string) => void;
  handleMediaForwardMessage: (msgId: string) => void;
  handleMediaDeleteMessage: (msgId: string) => void;
  attachedFiles: AttachedFile[];
  isAttachmentModalOpen: boolean;
  setIsAttachmentModalOpen: (v: boolean) => void;
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  handleAddMoreFiles: () => void;
  handleSendFiles: (caption: string, group: boolean, asFile: boolean) => Promise<void>;
  isSendingFiles: boolean;
  isDragOver: boolean;
  contextMenu: ContextMenuState;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  handleReply: (indexOrId?: number | string) => void;
  handleEdit: (indexOrId?: number | string) => void;
  isMessagePinned: (indexOrId?: any) => boolean;
  requestUnpinMessage: () => void;
  requestPinMessage: (indexOrId?: any) => void;
  requestDeleteMessage: (indexOrId?: any) => void;
  handleCopy: (indexOrId?: any) => void;
  handleCopyImage: (url: string) => void;
  handleSaveAs: (indexOrId?: any) => void;
  handleSelectFromMenu: () => void;
  triggerReactionMessage: (indexOrId: any, emoji: string) => void;
  isChannelOwner: boolean;
  messages: Message[];
  handleRetryMessage?: (indexOrId: number | string) => void;
  isEmojiPanelOpen: boolean;
  emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
  headerRef: React.RefObject<HTMLDivElement | null>;
  handleEmojiSelect: (emoji: string) => void;
  handleSendGif: (gif: any) => void;
  handleSendSticker: (sticker: any) => void;
  handleEmojiPanelClose: () => void;
  recentEmojis: string[];
  addRecentEmoji: (emoji: string) => void;
  handleEmojiMouseEnter: () => void;
  handleEmojiMouseLeave: () => void;
  setActivePickerTab: (tab: any) => void;
  unsafeLinkData: { isOpen: boolean; url: string };
  setUnsafeLinkData: (v: { isOpen: boolean; url: string }) => void;
  isAddMemberModalOpen: boolean;
  setIsAddMemberModalOpen: (v: boolean) => void;
  isForwardModalOpen?: boolean;
  setIsForwardModalOpen?: (v: boolean) => void;
  messagesToForward?: Message[];
  handleExecuteForward?: (targetChatId: string) => void;
  onForwardMessage?: (messageIdOrIndex?: any) => void;
}

export const ChatWindowModals: React.FC<ChatWindowModalsProps> = ({
  isDiscordFileLimitModalOpen,
  setIsDiscordFileLimitModalOpen,
  maxFileMb,
  isSendAsTxtModalOpen,
  setIsSendAsTxtModalOpen,
  handleSendAsTxt,
  inputTextLength,
  confirmModal,
  setConfirmModal,
  activeChatId,
  activeChat,
  handleConfirmAction,
  mediaViewerState,
  setMediaViewerState,
  chatMediaViewerItems,
  sharedSecret,
  handleMediaGoToMessage,
  handleMediaForwardMessage,
  handleMediaDeleteMessage,
  isForwardModalOpen = false,
  setIsForwardModalOpen,
  messagesToForward = [],
  handleExecuteForward,
  onForwardMessage,
  attachedFiles,
  isAttachmentModalOpen,
  setIsAttachmentModalOpen,
  setAttachedFiles,
  handleAddMoreFiles,
  handleSendFiles,
  isSendingFiles,
  isDragOver,
  contextMenu,
  setContextMenu,
  handleReply,
  handleEdit,
  isMessagePinned,
  requestUnpinMessage,
  requestPinMessage,
  requestDeleteMessage,
  handleCopy,
  handleCopyImage,
  handleSaveAs,
  handleSelectFromMenu,
  triggerReactionMessage,
  isChannelOwner,
  messages,
  handleRetryMessage,
  isEmojiPanelOpen,
  emojiButtonRef,
  headerRef,
  handleEmojiSelect,
  handleSendGif,
  handleSendSticker,
  handleEmojiPanelClose,
  recentEmojis,
  addRecentEmoji,
  handleEmojiMouseEnter,
  handleEmojiMouseLeave,
  setActivePickerTab,
  unsafeLinkData,
  setUnsafeLinkData,
  isAddMemberModalOpen,
  setIsAddMemberModalOpen,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Suspense fallback={null}>
        {isDiscordFileLimitModalOpen && (
          <DiscordFileLimitModal
            isOpen={isDiscordFileLimitModalOpen}
            onClose={() => setIsDiscordFileLimitModalOpen(false)}
            maxMb={maxFileMb}
          />
        )}

        {isSendAsTxtModalOpen && (
          <SendAsTxtModal
            isOpen={isSendAsTxtModalOpen}
            onClose={() => setIsSendAsTxtModalOpen(false)}
            onSend={handleSendAsTxt}
            textLength={inputTextLength}
          />
        )}

        {confirmModal.isOpen && (
          <ActionConfirmModal
            isOpen={confirmModal.isOpen}
            type={confirmModal.type}
            chatName={activeChatId === 'notes' ? t('connectModal.notes') : activeChat?.name}
            avatarUrl={activeChat?.avatarUrl}
            isNotes={Boolean(activeChatId === 'notes')}
            selectedCount={confirmModal.selectedCount}
            onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false, type: null }))}
            onConfirm={handleConfirmAction}
          />
        )}

        {mediaViewerState.isOpen && (
          <TelegramMediaViewer
            key={`${mediaViewerState.customItems?.[0]?.url || chatMediaViewerItems[0]?.url || ''}_${mediaViewerState.initialIndex}`}
            isOpen={mediaViewerState.isOpen}
            items={mediaViewerState.customItems || chatMediaViewerItems}
            initialIndex={mediaViewerState.initialIndex}
            sharedSecret={sharedSecret ?? undefined}
            onClose={() => setMediaViewerState((prev) => ({ ...prev, isOpen: false, customItems: [] }))}
            onGoToMessage={handleMediaGoToMessage}
            onForwardMessage={handleMediaForwardMessage}
            onDeleteMessage={handleMediaDeleteMessage}
            onOpenAllMedia={() => {
              if (activeChatId) {
                useChatStore.getState().setActiveProfileChatId(activeChatId);
              }
            }}
          />
        )}

        {isAttachmentModalOpen && (
          <FileAttachmentModal
            files={attachedFiles}
            isOpen={isAttachmentModalOpen}
            onClose={() => {
              setAttachedFiles([]);
              setIsAttachmentModalOpen(false);
            }}
            onAddFiles={handleAddMoreFiles}
            onRemoveFile={(idx: number) => {
              setAttachedFiles((prev) => {
                const next = prev.filter((_, i) => i !== idx);
                if (next.length === 0) setIsAttachmentModalOpen(false);
                return next;
              });
            }}
            onSend={handleSendFiles}
            isSending={isSendingFiles}
          />
        )}
      </Suspense>

      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 50,
              backgroundColor: 'rgba(20, 16, 30, 0.88)',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              padding: '24px',
            }}
          >
            <div
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '28px',
                backgroundColor: 'var(--surface-container-strong, rgba(255,255,255,0.08))',
                border: '2px dashed var(--accent-color, #7C3AED)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                color: 'var(--accent-color, #7C3AED)',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>

            <div
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--text-main, #ffffff)',
                marginBottom: '6px',
                textAlign: 'center',
              }}
            >
              {t('chatWindow.drag_drop_title', 'Перетащите сюда файлы')}
            </div>

            <div
              style={{
                fontSize: '14px',
                color: 'var(--text-dim, rgba(255,255,255,0.6))',
                textAlign: 'center',
              }}
            >
              {t('chatWindow.drag_drop_subtitle', 'для их отправки без сжатия')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {contextMenu.visible &&
        createPortal(
          <AnimatePresence>
            <MessageContextMenu
              menu={contextMenu}
              setMenu={setContextMenu}
              onReply={() => handleReply(contextMenu.messageId || contextMenu.messageIndex)}
              onEdit={() => handleEdit(contextMenu.messageId || contextMenu.messageIndex)}
              onPin={() => isMessagePinned(contextMenu.messageId || contextMenu.messageIndex) ? requestUnpinMessage() : requestPinMessage(contextMenu.messageId || contextMenu.messageIndex)}
              onDelete={() => requestDeleteMessage(contextMenu.messageId || contextMenu.messageIndex)}
              isPinned={isMessagePinned(contextMenu.messageId || contextMenu.messageIndex)}
              onCopy={contextMenu.type === 'text' ? () => handleCopy(contextMenu.messageId || contextMenu.messageIndex) : undefined}
              onCopyImage={contextMenu.type === 'singleImage' ? async () => {
                const msg = (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null) || messages[contextMenu.messageIndex];
                if (!msg) return;
                const media = parseMedia(msg);
                const mediaUrl = media.url || msg.mediaUrl;
                if (!mediaUrl) return;
                const cacheKey = sharedSecret ? `${mediaUrl}::${sharedSecret}` : null;
                const cached = (cacheKey && sharedSecret) ? (decryptedUrlCache.get(cacheKey) || mediaManager.getCachedMedia(mediaUrl, sharedSecret)?.blobUrl) : null;
                if (cached) {
                  handleCopyImage(cached);
                } else if (sharedSecret) {
                  const item = await mediaManager.getMedia(mediaUrl, sharedSecret, media.fileName, activeChatId || undefined, msg.id);
                  if (item?.blobUrl) handleCopyImage(item.blobUrl);
                  else handleCopyImage(mediaUrl);
                } else {
                  handleCopyImage(mediaUrl);
                }
              } : undefined}
              onSaveAs={() => handleSaveAs(contextMenu.messageId || contextMenu.messageIndex)}
              onForward={onForwardMessage ? () => onForwardMessage(contextMenu.messageId || contextMenu.messageIndex) : undefined}
              onSelect={handleSelectFromMenu}
              onSelectReaction={(emoji) => triggerReactionMessage(contextMenu.messageId ?? contextMenu.messageIndex, emoji)}
              canManageMessages={activeChat?.type !== 'channel' || isChannelOwner}
              onRetry={handleRetryMessage ? () => handleRetryMessage(contextMenu.messageId || contextMenu.messageIndex) : undefined}
            />
          </AnimatePresence>,
          document.body
        )
      }

      {isForwardModalOpen && (
        <Suspense fallback={null}>
          <ForwardModal
            isOpen={isForwardModalOpen}
            onClose={() => setIsForwardModalOpen?.(false)}
            messagesToForward={messagesToForward}
            onForward={handleExecuteForward || (() => {})}
          />
        </Suspense>
      )}

      <style>{`
        :focus-within { outline: none; }
        .selectable-message-text::selection, .select-text::selection { background-color: var(--selection-bg, rgba(124,58,237,0.3)); color: var(--text-main, #ffffff); }
        .selectable-message-text::-moz-selection, .select-text::-moz-selection { background-color: var(--selection-bg, rgba(124,58,237,0.3)); color: var(--text-main, #ffffff); }
        .select-none::selection, .message-time-badge::selection, .date-badge::selection, .date-badge-pill::selection, [data-date-divider]::selection { background-color: transparent !important; color: inherit !important; }
        .select-none::-moz-selection, .message-time-badge::-moz-selection, .date-badge::-moz-selection, .date-badge-pill::-moz-selection, [data-date-divider]::-moz-selection { background-color: transparent !important; color: inherit !important; }
        .floating-photo-time-badge, .floating-photo-time-badge * { color: rgba(255, 255, 255, 0.95) !important; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
        .input-textarea::placeholder { color: var(--text-dim); }

        .scroll-btn {
          background-color: var(--surface-container, #33363f) !important;
          border: none !important;
          outline: none !important;
          opacity: 0;
          transform: translateY(20px);
          pointer-events: none;
          will-change: transform, opacity;
          transition: transform 0.16s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.14s ease-in, filter 0.15s ease, box-shadow 0.15s ease;
        }
        .scroll-btn.visible {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.16s ease-out, filter 0.15s ease, box-shadow 0.15s ease;
        }
        .scroll-btn.visible:hover {
          background-color: var(--surface-container, #33363f) !important;
          filter: brightness(1.08);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35) !important;
        }
        .scroll-btn.visible:active {
          transform: translateY(0) scale(0.96) !important;
          filter: brightness(0.96);
        }

        .input-container {
          position: relative;
          border-radius: 9999px;
        }
        .comet-canvas {
          position: absolute;
          pointer-events: none;
        }
        .input-box {
          position: relative;
          z-index: 1;
          border-radius: 9999px;
          padding: 8px 12px;
        }

        .glow-dot {
          position: absolute;
          width: 3px;
          height: 3px;
          background: #ffdd99;
          border-radius: 50%;
          opacity: 0;
          box-shadow: 0 0 4px #ffcc66;
          animation: twinkle 3s ease-in-out infinite;
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 0.7; transform: scale(1.2); }
        }

        textarea {
          display: block;
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          color: var(--text-main);
          font-size: 15px;
          line-height: 1.5;
          font-family: inherit;
          max-height: 120px;
          min-height: 20px;
          overflow-y: auto;
          scrollbar-width: none;
        }
        textarea::-webkit-scrollbar { display: none; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .message-unselected {
          filter: brightness(0.55);
          transition: filter 0.15s ease;
        }
        .message-unselected:hover {
          filter: brightness(0.7);
        }
      `}</style>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isEmojiPanelOpen && (
            <Suspense fallback={null}>
              <EmojiPicker
                key="chat-emoji-picker"
                anchorEl={emojiButtonRef.current}
                headerEl={headerRef.current}
                onSelect={handleEmojiSelect}
                onSelectGif={handleSendGif}
                onSelectSticker={handleSendSticker}
                onClose={handleEmojiPanelClose}
                recentEmojis={recentEmojis}
                onRecentUpdate={addRecentEmoji}
                onMouseEnter={handleEmojiMouseEnter}
                onMouseLeave={handleEmojiMouseLeave}
                onTabChange={setActivePickerTab}
              />
            </Suspense>
          )}
        </AnimatePresence>,
        document.body
      )}

      <Suspense fallback={null}>
        {unsafeLinkData.isOpen && (
          <UnsafeLinkModal
            isOpen={unsafeLinkData.isOpen}
            url={unsafeLinkData.url}
            onClose={() => setUnsafeLinkData({ isOpen: false, url: '' })}
          />
        )}

        {activeChat?.type === 'group' && isAddMemberModalOpen && (
          <AddGroupMemberModal
            isOpen={isAddMemberModalOpen}
            onClose={() => setIsAddMemberModalOpen(false)}
            group={activeChat}
          />
        )}
      </Suspense>
    </>
  );
};
