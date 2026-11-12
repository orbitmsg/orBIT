import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Pencil, Check, Search } from 'lucide-react';
import { useChatStore, ChatFolder, Chat } from '../../store/useChatStore';
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
  onSurface: 'var(--md-on-surface, var(--text-main, #e6e1e5))',
  onSurfaceVar: 'var(--md-on-surface-var, var(--text-dim, #cac4d0))',
  primary: 'var(--accent-text, var(--accent-color, #c5b4e3))',
  accent: 'var(--accent-color, #c5b4e3)',
  onPrimary: 'var(--accent-on-color, #ffffff)',
  error: 'var(--md-error, #ff898a)',
  errorCont: 'var(--md-error-cont, rgba(255, 89, 90, 0.1))',
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
  const { t, i18n } = useTranslation();
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

  const getPluralForm = (count: number, oneKey: string, fewKey: string, manyKey: string) => {
    if (i18n.language?.startsWith('ru')) {
      const mod10 = count % 10;
      const mod100 = count % 100;
      if (mod10 === 1 && mod100 !== 11) {
        return t(oneKey, { count });
      }
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
        return t(fewKey, { count });
      }
      return t(manyKey, { count });
    }
    return count === 1 ? t(oneKey, { count }) : t(manyKey, { count });
  };

  const getFolderChatsSummary = (folder: ChatFolder) => {
    const chatIds = folder.chatIds || [];
    if (chatIds.length === 0) {
      return getPluralForm(0, 'folderManager.chatCount_one', 'folderManager.chatCount_few', 'folderManager.chatCount_many');
    }

    const folderChats = chatIds.map((id) => chats.find((c) => c.id === id)).filter(Boolean) as Chat[];
    if (folderChats.length === 0) {
      return getPluralForm(chatIds.length, 'folderManager.chatCount_one', 'folderManager.chatCount_few', 'folderManager.chatCount_many');
    }

    let personalCount = 0;
    let groupCount = 0;
    let channelCount = 0;

    for (const c of folderChats) {
      if (c.type === 'channel') {
        channelCount++;
      } else if (c.type === 'group') {
        groupCount++;
      } else {
        personalCount++;
      }
    }

    if (folderChats.length < chatIds.length) {
      personalCount += (chatIds.length - folderChats.length);
    }

    const parts: string[] = [];
    if (personalCount > 0) {
      parts.push(getPluralForm(personalCount, 'folderManager.personalCount_one', 'folderManager.personalCount_few', 'folderManager.personalCount_many'));
    }
    if (groupCount > 0) {
      parts.push(getPluralForm(groupCount, 'folderManager.groupCount_one', 'folderManager.groupCount_few', 'folderManager.groupCount_many'));
    }
    if (channelCount > 0) {
      parts.push(getPluralForm(channelCount, 'folderManager.channelCount_one', 'folderManager.channelCount_few', 'folderManager.channelCount_many'));
    }

    if (parts.length === 0) {
      return getPluralForm(chatIds.length, 'folderManager.chatCount_one', 'folderManager.chatCount_few', 'folderManager.chatCount_many');
    }
    if (parts.length === 1) {
      return parts[0];
    }
    if (parts.length === 2) {
      return `${parts[0]} ${t('folderManager.and', 'и')} ${parts[1]}`;
    }
    return `${parts.slice(0, -1).join(', ')} ${t('folderManager.and', 'и')} ${parts[parts.length - 1]}`;
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
              padding: '16px 18px',
              margin: '0 10px 4px 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
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
                        backgroundColor: isHovered ? 'var(--surface-hover, rgba(202,196,208,0.08))' : 'transparent',
                        transition: 'background-color 150ms ease',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            color: MD3.primary,
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
                            {getFolderChatsSummary(folder)}
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
                            e.currentTarget.style.backgroundColor = MD3.errorCont;
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
                  color: MD3.primary,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  textAlign: 'left',
                  width: 'calc(100% - 12px)',
                  transition: 'background-color 150ms ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, rgba(202,196,208,0.08))')}
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
                backgroundColor: 'var(--surface-container-strong, rgba(255, 255, 255, 0.05))',
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
                    color: MD3.onSurface,
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
                    backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.04))',
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
                      color: MD3.onSurface,
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
                        backgroundColor: isHovered ? 'var(--surface-hover, rgba(202,196,208,0.08))' : 'transparent',
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
                          border: `2px solid ${isSelected ? MD3.accent : MD3.onSurfaceVar}`,
                          backgroundColor: isSelected ? MD3.accent : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 150ms ease',
                        }}
                      >
                        {isSelected && <Check size={14} color="var(--accent-on-color, #ffffff)" strokeWidth={3} />}
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
                backgroundColor: folderName.trim() ? MD3.accent : 'var(--surface-muted, rgba(255, 255, 255, 0.08))',
                color: folderName.trim() ? MD3.onPrimary : MD3.onSurfaceVar,
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
                backgroundColor: 'var(--surface-container-strong, rgba(255, 255, 255, 0.06))',
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
