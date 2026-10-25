import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Search, Bookmark, ShieldCheck } from 'lucide-react';
import { useChatStore, Message, Chat } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';
import { M3Switch } from '../settings/SettingsShared';

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  messagesToForward: Message[];
  onForward: (targetChatId: string, hideAuthor: boolean) => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen,
  onClose,
  messagesToForward,
  onForward,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [hideAuthor, setHideAuthor] = useState(false);
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list: Array<Chat | { id: 'notes'; name: string; type: 'notes' }> = [
      { id: 'notes', name: t('forward.notes', 'Избранное'), type: 'notes' },
      ...chats.filter((c) => !c.isBlocked && c.id !== 'notes'),
    ];

    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [chats, searchQuery, t]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            border: 'none',
            padding: '16px',
            boxSizing: 'border-box',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              width: '100%',
              maxWidth: '440px',
              maxHeight: '85vh',
              backgroundColor: 'var(--bg-secondary, #1c1c1e)',
              borderRadius: '16px',
              border: 'none',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '18px 24px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: 'none',
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--text-main, #ffffff)',
                  }}
                >
                  {t('forward.forward_messages', 'Переслать сообщения')}
                </h3>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-dim, #8e8e93)',
                  }}
                >
                  {t('forward.messages_count', { count: messagesToForward.length })}
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label={t('common.cancel', 'Отмена')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim, #8e8e93)',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '9999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.color = 'var(--text-main, #ffffff)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--text-dim, #8e8e93)';
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                padding: '12px 24px',
                backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.03))',
                border: 'none',
              }}
            >
              <div
                onClick={() => setHideAuthor(!hideAuthor)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--text-main, #ffffff)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <ShieldCheck size={16} style={{ color: hideAuthor ? 'var(--accent-color, #9b7dd4)' : 'var(--text-dim, #8e8e93)' }} />
                    {t('forward.hide_author', 'Скрыть имя автора')}
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-dim, #8e8e93)' }}>
                    {t('forward.hide_author_desc', 'Анонимизировать метаданные перед отправкой')}
                  </span>
                </div>
                <M3Switch checked={hideAuthor} onChange={() => setHideAuthor(!hideAuthor)} />
              </div>
            </div>

            <div style={{ padding: '14px 20px 8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'var(--surface-container-high, rgba(255, 255, 255, 0.06))',
                  borderRadius: '9999px',
                  padding: '9px 16px',
                  border: 'none',
                }}
              >
                <Search size={16} style={{ color: 'var(--text-dim, #8e8e93)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('forward.search_placeholder', 'Поиск чата...')}
                  style={{
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '13.5px',
                    width: '100%',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '6px 12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {filteredChats.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px 16px',
                    color: 'var(--text-dim, #8e8e93)',
                    fontSize: '13px',
                  }}
                >
                  {t('forward.no_chats', 'Чаты не найдены')}
                </div>
              ) : (
                filteredChats.map((chat) => {
                  const isNotes = chat.id === 'notes';
                  const isCurrent = chat.id === activeChatId;

                  return (
                    <button
                      key={chat.id}
                      onClick={() => onForward(chat.id, hideAuthor)}
                      aria-label={chat.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px 14px',
                        borderRadius: '9999px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        width: '100%',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                        textAlign: 'left',
                        boxSizing: 'border-box',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ flexShrink: 0, position: 'relative' }}>
                        {isNotes ? (
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '9999px',
                              backgroundColor: 'var(--accent-color, #9b7dd4)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#ffffff',
                            }}
                          >
                            <Bookmark size={20} />
                          </div>
                        ) : (
                          <Avatar
                            src={(chat as Chat).avatarUrl}
                            alt={chat.name}
                            className="w-10 h-10 rounded-full"
                          />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '14.5px',
                              fontWeight: 500,
                              color: 'var(--text-main, #ffffff)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {chat.name}
                          </span>
                          {isCurrent && (
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--accent-color, #9b7dd4)',
                                fontWeight: 500,
                              }}
                            >
                              ({t('forward.current', 'текущий')})
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-dim, #8e8e93)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginTop: '1px',
                          }}
                        >
                          {isNotes
                            ? t('forward.notes', 'Избранное')
                            : (chat as Chat).type === 'channel'
                            ? t('forward.channel', 'Канал')
                            : (chat as Chat).type === 'group'
                            ? t('forward.group', 'Группа')
                            : ((chat as Chat).lastMsg || t('forward.dialog', 'Диалог'))}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
