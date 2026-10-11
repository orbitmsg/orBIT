import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Pencil, Check, Search } from 'lucide-react';
import { useChatStore, ChatFolder } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';
import { Block } from '../chat/SettingsScreen';

export const SettingsFolderIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 20,
  className,
  style,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    width={size}
    height={size}
    className={className}
    style={style}
  >
    <path
      fill="currentColor"
      d="M0 96c0-35.3 28.7-64 64-64h132.1c19.1 0 37.4 7.6 50.9 21.1L289.9 96H448c35.3 0 64 28.7 64 64v256c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64zm64-16c-8.8 0-16 7.2-16 16v320c0 8.8 7.2 16 16 16h384c8.8 0 16-7.2 16-16V160c0-8.8-7.2-16-16-16H286.6c-10.6 0-20.8-4.2-28.3-11.7L213.1 87c-4.5-4.5-10.6-7-17-7z"
    />
  </svg>
);

const MD3 = {
  onSurface: '#e6e1e5',
  onSurfaceVar: '#cac4d0',
  primary: '#c5b4e3',
  error: '#ff898a',
};

const SectionHeader = ({ title, style }: { title: string; style?: React.CSSProperties }) => (
  <div
    style={{
      fontSize: 12,
      fontWeight: 600,
      color: MD3.onSurfaceVar,
      padding: '0 20px',
      marginBottom: 8,
      userSelect: 'none',
      letterSpacing: '0.01em',
      ...style,
    }}
  >
    {title}
  </div>
);

interface ChatFoldersSettingsProps {
  onBack?: () => void;
}

export const ChatFoldersSettings: React.FC<ChatFoldersSettingsProps> = () => {
  const { t } = useTranslation();
  const folders = useChatStore((s) => s.folders || []);
  const chats = useChatStore((s) => s.chats || []);
  const createFolder = useChatStore((s) => s.createFolder);
  const updateFolder = useChatStore((s) => s.updateFolder);
  const deleteFolder = useChatStore((s) => s.deleteFolder);

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null);
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);

  const handleStartCreate = () => {
    setFolderName('');
    setSelectedChatIds(new Set());
    setChatSearchQuery('');
    setEditingFolderId(null);
    setMode('create');
  };

  const handleStartEdit = (folder: ChatFolder) => {
    setFolderName(folder.name);
    setSelectedChatIds(new Set(folder.chatIds || []));
    setChatSearchQuery('');
    setEditingFolderId(folder.id);
    setMode('edit');
  };

  const handleSave = () => {
    const trimmed = folderName.trim();
    if (!trimmed) return;
    const chatIdsArr = Array.from(selectedChatIds);
    if (mode === 'create') {
      createFolder(trimmed, chatIdsArr);
    } else if (mode === 'edit' && editingFolderId) {
      updateFolder(editingFolderId, trimmed, chatIdsArr);
    }
    setMode('list');
    setEditingFolderId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFolder(id);
  };

  const toggleChatSelection = (chatId: string) => {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  };

  const filteredChats = useMemo(() => {
    if (!chatSearchQuery.trim()) return chats;
    const q = chatSearchQuery.toLowerCase().trim();
    return chats.filter((c) => (c.name || '').toLowerCase().includes(q));
  }, [chats, chatSearchQuery]);

  const getChatCountLabel = (count: number) => {
    if (count === 1) return t('folderManager.chatCount', { count: 1 });
    if (count >= 2 && count <= 4) return t('folderManager.chatCount_plural', { count });
    return t('folderManager.chatCount_2', { count });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {mode === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.04))',
              borderRadius: '16px',
              padding: '20px 18px',
              margin: '0 10px 4px 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 10,
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '16px',
                backgroundColor: 'rgba(155, 125, 212, 0.15)',
                color: 'var(--accent-color, #9b7dd4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SettingsFolderIcon size={26} />
            </div>
            <div style={{ fontSize: 13.5, color: MD3.onSurfaceVar, lineHeight: 1.45, maxWidth: 360 }}>
              {t('folderManager.desc', 'Вы можете создать папки с нужными чатами и переключаться между ними.')}
            </div>
          </div>

          <div>
            <SectionHeader title={t('folderManager.my_folders', 'Мои папки')} />
            <Block>
              {folders.length === 0 ? (
                <div
                  style={{
                    padding: '22px 16px',
                    textAlign: 'center',
                    color: MD3.onSurfaceVar,
                    fontSize: 13.5,
                  }}
                >
                  {t('folderManager.noFolders', 'У вас пока нет папок')}
                </div>
              ) : (
                folders.map((folder) => {
                  const isHovered = hoveredFolderId === folder.id;
                  const count = (folder.chatIds || []).length;
                  return (
                    <div
                      key={folder.id}
                      onClick={() => handleStartEdit(folder)}
                      onMouseEnter={() => setHoveredFolderId(folder.id)}
                      onMouseLeave={() => setHoveredFolderId(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        margin: '2px 6px',
                        cursor: 'pointer',
                        backgroundColor: isHovered ? 'rgba(202,196,208,0.08)' : 'transparent',
                        transition: 'background-color 150ms ease',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            color: 'var(--accent-color, #9b7dd4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <SettingsFolderIcon size={20} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: 14.5,
                              fontWeight: 600,
                              color: MD3.onSurface,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {folder.name}
                          </div>
                          <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
                            {getChatCountLabel(count)}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(folder);
                          }}
                          aria-label={t('common.edit', 'Редактировать')}
                          style={{
                            padding: 6,
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: MD3.onSurfaceVar,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(folder.id, e)}
                          aria-label={t('folderManager.delete', 'Удалить')}
                          style={{
                            padding: 6,
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: MD3.onSurfaceVar,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'color 150ms ease, background-color 150ms ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = MD3.error;
                            e.currentTarget.style.backgroundColor = 'rgba(255, 89, 90, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = MD3.onSurfaceVar;
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              <button
                type="button"
                onClick={handleStartCreate}
                aria-label={t('folderManager.createNew', 'Создать новую папку')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: '12px',
                  margin: '2px 6px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--accent-color, #9b7dd4)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  width: 'calc(100% - 12px)',
                  transition: 'background-color 150ms ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(202,196,208,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Plus size={18} />
                <span>{t('folderManager.createNew', 'Создать новую папку')}</span>
              </button>
            </Block>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 10px' }}>
            <button
              type="button"
              onClick={() => setMode('list')}
              aria-label={t('common.back', 'Назад')}
              style={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                border: 'none',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: MD3.onSurface,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ fontSize: 16, fontWeight: 700, color: MD3.onSurface }}>
              {mode === 'edit'
                ? t('folderManager.editFolder', 'Редактировать папку')
                : t('folderManager.newFolder', 'Новая папка')}
            </div>
          </div>

          <div>
            <SectionHeader title={t('folderManager.folderName', 'Название')} />
            <Block>
              <div style={{ padding: '4px 6px' }}>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder={t('folderManager.folderNamePlaceholder', 'Например: Работа')}
                  aria-label={t('folderManager.folderName', 'Название')}
                  style={{
                    width: '100%',
                    padding: '10px 10px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 14,
                    color: '#ffffff',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </Block>
          </div>

          <div>
            <SectionHeader
              title={`${t('folderManager.chats_in_folder', 'Чаты в папке')} (${selectedChatIds.size})`}
            />

            {chats.length > 5 && (
              <div style={{ margin: '0 10px 8px 10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                >
                  <Search size={16} style={{ color: MD3.onSurfaceVar }} />
                  <input
                    type="text"
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    placeholder={t('search.search_chats', 'Поиск чатов')}
                    aria-label={t('search.search_chats', 'Поиск чатов')}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#ffffff',
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>
            )}

            <Block style={{ maxHeight: 320, overflowY: 'auto' }}>
              {filteredChats.length === 0 ? (
                <div
                  style={{
                    padding: '20px 16px',
                    textAlign: 'center',
                    color: MD3.onSurfaceVar,
                    fontSize: 13,
                  }}
                >
                  {t('search.no_results', 'Ничего не найдено')}
                </div>
              ) : (
                filteredChats.map((chat) => {
                  const isSelected = selectedChatIds.has(chat.id);
                  const isHovered = hoveredChatId === chat.id;
                  return (
                    <div
                      key={chat.id}
                      onClick={() => toggleChatSelection(chat.id)}
                      onMouseEnter={() => setHoveredChatId(chat.id)}
                      onMouseLeave={() => setHoveredChatId(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '12px',
                        margin: '2px 6px',
                        cursor: 'pointer',
                        backgroundColor: isHovered ? 'rgba(202,196,208,0.08)' : 'transparent',
                        transition: 'background-color 150ms ease',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                        <Avatar
                          src={chat.avatarUrl}
                          alt={chat.name}
                          style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              color: MD3.onSurface,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {chat.name}
                          </div>
                          <div style={{ fontSize: 11.5, color: MD3.onSurfaceVar, marginTop: 1 }}>
                            {chat.type === 'channel'
                              ? t('chat.type_channel', 'Канал')
                              : chat.type === 'group'
                              ? t('chat.type_group', 'Группа')
                              : t('chat.type_personal', 'Личный чат')}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          border: `2px solid ${isSelected ? 'var(--accent-color, #9b7dd4)' : MD3.onSurfaceVar}`,
                          backgroundColor: isSelected ? 'var(--accent-color, #9b7dd4)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 150ms ease',
                        }}
                      >
                        {isSelected && <Check size={14} color="#ffffff" strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })
              )}
            </Block>
          </div>

          <div style={{ display: 'flex', gap: 12, margin: '8px 10px 16px 10px' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!folderName.trim()}
              aria-label={mode === 'create' ? t('folderManager.create', 'Создать') : t('folderManager.save', 'Сохранить')}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: folderName.trim() ? 'var(--accent-color, #9b7dd4)' : 'rgba(255, 255, 255, 0.08)',
                color: folderName.trim() ? '#ffffff' : MD3.onSurfaceVar,
                fontWeight: 600,
                fontSize: 14,
                cursor: folderName.trim() ? 'pointer' : 'default',
                transition: 'background-color 150ms ease, opacity 150ms ease',
              }}
            >
              {mode === 'create' ? t('folderManager.create', 'Создать') : t('folderManager.save', 'Сохранить')}
            </button>
            <button
              type="button"
              onClick={() => setMode('list')}
              aria-label={t('common.cancel', 'Отмена')}
              style={{
                padding: '12px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: MD3.onSurface,
                fontWeight: 500,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {t('common.cancel', 'Отмена')}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};
