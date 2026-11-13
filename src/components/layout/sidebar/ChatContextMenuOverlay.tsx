import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, Trash, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Chat } from '../../../store/useChatStore';
import {
  CustomPinIcon,
  CustomUnpinIcon,
  CustomMuteIcon,
  CustomUnmuteIcon,
  CustomClearHistoryIcon,
} from '../../chat/ChatWindow';

export interface ChatContextMenuProps {
  chatContextMenu: { visible: boolean; x: number; y: number; chatId: string };
  chatMenuRef: React.RefObject<HTMLDivElement | null>;
  chats: Chat[];
  pinnedChatsSet: Set<string>;
  handlePinChat: (id: string) => void;
  handleToggleArchiveChat: (id: string) => void;
  handleMuteChat: (id: string) => void;
  requestClearHistory: (id: string) => void;
  requestDeleteChat: (id: string) => void;
}

export const ChatContextMenuOverlay = ({
  chatContextMenu,
  chatMenuRef,
  chats,
  pinnedChatsSet,
  handlePinChat,
  handleToggleArchiveChat,
  handleMuteChat,
  requestClearHistory,
  requestDeleteChat,
}: ChatContextMenuProps) => {
  const { t } = useTranslation();
  return (
      <AnimatePresence>
        {chatContextMenu.visible && (
          <motion.div
            ref={chatMenuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-[300] min-w-[190px] backdrop-blur-xl select-none overflow-hidden p-1.5"
            style={{
              left: Math.min(chatContextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 200),
              top: Math.min(chatContextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 170),
              transformOrigin: 'top left',
              backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
              borderRadius: '5px',
              border: 'none',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const iconColor = 'var(--text-main)';
              const baseBtnClass =
                "w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-normal normal-case transition-colors hover:bg-[var(--surface-container-strong)] rounded-[5px] text-left select-none";
              const isNotes = chatContextMenu.chatId === 'notes';
              const targetChat = chats.find(c => c.id === chatContextMenu.chatId);
              const isChannel = targetChat?.type === 'channel';
              const isPinned = pinnedChatsSet.has(chatContextMenu.chatId);
              const isMuted = targetChat?.muted;

              return (
                <div className="flex flex-col gap-0.5">
                  {!isNotes && (
                    <button
                      onClick={() => handlePinChat(chatContextMenu.chatId)}
                      className={baseBtnClass}
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                        {isPinned ? (
                          <CustomUnpinIcon size={16} style={{ color: iconColor }} />
                        ) : (
                          <CustomPinIcon size={16} style={{ color: iconColor }} />
                        )}
                      </span>
                      <span className="whitespace-nowrap">{isPinned ? t('common.unpin') : t('common.pin')}</span>
                    </button>
                  )}

                  {!isNotes && (
                    <button
                      onClick={() => handleToggleArchiveChat(chatContextMenu.chatId)}
                      className={baseBtnClass}
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                        <Archive size={16} style={{ color: iconColor }} />
                      </span>
                      <span className="whitespace-nowrap">
                        {targetChat?.isArchived ? t('common.from_archive') : t('common.to_archive')}
                      </span>
                    </button>
                  )}

                  {!isNotes && (
                    <button
                      onClick={() => handleMuteChat(chatContextMenu.chatId)}
                      className={baseBtnClass}
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                        {isMuted ? (
                          <CustomUnmuteIcon size={16} style={{ color: iconColor }} />
                        ) : (
                          <CustomMuteIcon size={16} style={{ color: iconColor }} />
                        )}
                      </span>
                      <span className="whitespace-nowrap">
                        {isMuted ? t('common.unmute_notifications') : t('common.mute_notifications')}
                      </span>
                    </button>
                  )}

                  {!isNotes && !isChannel && (
                    <button
                      onClick={() => requestClearHistory(chatContextMenu.chatId)}
                      className={baseBtnClass}
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                        <CustomClearHistoryIcon size={16} style={{ color: iconColor }} />
                      </span>
                      <span className="whitespace-nowrap">{t('common.clear_history')}</span>
                    </button>
                  )}

                  <button
                    onClick={() => requestDeleteChat(chatContextMenu.chatId)}
                    className={baseBtnClass}
                    style={{ color: '#ef4444' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                      {isChannel ? (
                        <LogOut size={16} style={{ color: '#ef4444' }} />
                      ) : (
                        <Trash size={16} style={{ color: '#ef4444' }} />
                      )}
                    </span>
                    <span className="whitespace-nowrap">
                      {isChannel ? t('channel.leave_channel', 'Покинуть канал') : t('common.delete_chat')}
                    </span>
                  </button>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
  );
};
