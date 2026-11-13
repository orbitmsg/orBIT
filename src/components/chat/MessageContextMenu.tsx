import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { sqliteStorage } from '../../services/sqliteStorage';
import {
  Copy, Image as ImageIcon, Download as DownloadIcon,
  CheckCircle, Trash, Search, Forward
} from 'lucide-react';

const ChevronIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 16,
  className,
  style,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={style}
  >
    <path
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      d="m6 9l6 6l6-6"
    />
  </svg>
);
import {
  EMOJI_CATEGORIES,
  getEmojisByCategory,
  searchEmojis,
  getEmojiByChar,
  Emoji,
} from '../../lib/emoji-data';
import {
  CustomPinIcon,
  CustomUnpinIcon,
  CustomEditIcon,
  CustomReplyIcon
} from './ChatIcons';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  messageIndex: number;
  messageId?: string;
  isOwn: boolean;
  type: 'text' | 'singleImage' | 'multipleImages' | 'file' | 'sticker';
  hasMultipleImages: boolean;
  isFailed?: boolean;
}

const FREQUENT_REACTIONS_KEY = 'orbita-frequent-reactions';
const RECENT_REACTIONS_KEY = 'orbita-recent-reactions';
export const DEFAULT_QUICK_REACTIONS = ['❤️‍🔥', '👍', '❤️', '👎', '🔥', '😂'];
export const QUICK_REACTIONS = DEFAULT_QUICK_REACTIONS;

export const clampMenuPosition = (
  x: number,
  y: number,
  menuWidth = 256,
  menuHeight = 320
) => {
  const { innerWidth, innerHeight } = window;
  let adjustedX = x;
  let adjustedY = y;

  const OFFSET_FROM_SIDE = 24;

  if (x + menuWidth > innerWidth - OFFSET_FROM_SIDE) adjustedX = innerWidth - menuWidth - OFFSET_FROM_SIDE;
  if (y + menuHeight > innerHeight - 16) adjustedY = innerHeight - menuHeight - 16;
  if (adjustedX < OFFSET_FROM_SIDE) adjustedX = OFFSET_FROM_SIDE;
  if (adjustedY < 16) adjustedY = 16;

  return { x: adjustedX, y: adjustedY };
};

interface QuickReactionHeaderProps {
  onSelectReaction?: (emoji: string) => void;
  onCloseMenu: () => void;
  isExpanded: boolean;
  setIsExpanded: (val: boolean) => void;
  expandedHeight?: number;
}

export const QuickReactionHeader: React.FC<QuickReactionHeaderProps> = ({
  onSelectReaction,
  onCloseMenu,
  isExpanded,
  setIsExpanded,
  expandedHeight = 280,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(96);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [recentEmojis, setRecentEmojis] = useState<string[]>([...DEFAULT_QUICK_REACTIONS]);

  useEffect(() => {
    sqliteStorage.getJson<string[]>(FREQUENT_REACTIONS_KEY, []).then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        const merged = [...list, ...DEFAULT_QUICK_REACTIONS];
        const unique = Array.from(new Set(merged)).slice(0, 36);
        setRecentEmojis(unique);
      }
    }).catch(() => {});
  }, []);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelectReaction?.(emoji);
      setRecentEmojis((prev) => {
        const updated = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 36);
        sqliteStorage.setJson(FREQUENT_REACTIONS_KEY, updated).catch(() => {});
        sqliteStorage.setJson(RECENT_REACTIONS_KEY, updated).catch(() => {});
        return updated;
      });
      onCloseMenu();
    },
    [onSelectReaction, onCloseMenu]
  );

  useEffect(() => {
    if (!isExpanded) {
      setDisplayLimit(96);
      setSearchQuery('');
    } else if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isExpanded]);

  const allEmojisList = useMemo(() => {
    if (!isExpanded) return [];
    if (searchQuery.trim()) {
      return searchEmojis(searchQuery);
    }
    const list: Emoji[] = [];
    const seen = new Set<string>();
    for (const char of recentEmojis) {
      const em = getEmojiByChar(char);
      if (em && !seen.has(em.id)) {
        seen.add(em.id);
        list.push(em);
      }
    }
    for (const catId of EMOJI_CATEGORIES) {
      const emojis = getEmojisByCategory(catId);
      for (const em of emojis) {
        if (!seen.has(em.id)) {
          seen.add(em.id);
          list.push(em);
        }
      }
    }
    return list;
  }, [isExpanded, searchQuery, recentEmojis]);

  const displayedEmojis = useMemo(() => {
    if (searchQuery.trim()) return allEmojisList;
    return allEmojisList.slice(0, displayLimit);
  }, [allEmojisList, searchQuery, displayLimit]);

  const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 120) {
      const targetLimit = Math.ceil((scrollTop + clientHeight + 180) / 40) * 6;
      setDisplayLimit((prev) => Math.min(allEmojisList.length, Math.max(prev + 60, targetLimit)));
    }
  }, [allEmojisList.length]);

  return (
    <motion.div
      initial={false}
      animate={{
        height: isExpanded ? expandedHeight : 40,
        borderRadius: '5px',
      }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative backdrop-blur-xl select-none overflow-hidden flex flex-col"
      style={{
        width: '256px',
        backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
        border: 'none',
        borderRadius: '5px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.38)',
        marginBottom: isExpanded ? '0px' : '8px',
        willChange: 'height',
      }}
    >
      <div className="flex items-center justify-between px-2 w-full h-[40px] flex-shrink-0 relative">
        <div
          className="flex-1 min-w-0 h-full flex items-center mr-1"
          style={{ overflow: isExpanded ? 'hidden' : 'visible' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {!isExpanded ? (
              <motion.div
                key="collapsed-reactions"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.24 }}
                className="flex items-center gap-[3px] h-full"
                style={{ marginLeft: '-4px' }}
              >
                {recentEmojis.slice(0, 6).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSelect(emoji)}
                    className="emoji-font flex items-center justify-center active:scale-95 flex-shrink-0 cursor-pointer transition-colors"
                    style={{
                      lineHeight: 1,
                      width: '32px',
                      height: '32px',
                      fontSize: '21px',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      userSelect: 'none',
                      borderRadius: '5px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--surface-container-strong, rgba(255, 255, 255, 0.1))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="expanded-search"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.24 }}
                className="relative flex-1 flex items-center rounded-[5px] px-2.5 py-1"
                style={{
                  backgroundColor: 'var(--surface-container, rgba(128,128,128,0.15))',
                  border: 'none',
                  borderRadius: '5px',
                  height: '28px',
                }}
              >
                <Search size={14} style={{ color: 'var(--text-dim, #8e8e93)' }} className="mr-1.5 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full bg-transparent border-none outline-none text-xs"
                  style={{
                    color: 'var(--text-main)',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          aria-label={isExpanded ? t('common.collapse', 'Свернуть') : t('common.expand', 'Развернуть')}
          className="w-7 h-7 rounded-[5px] active:scale-95 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer ml-auto"
          style={{
            backgroundColor: 'var(--surface-container, rgba(128,128,128,0.15))',
            color: 'var(--text-main, #ffffff)',
            border: 'none',
            borderRadius: '5px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--surface-container-strong, rgba(255, 255, 255, 0.18))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--surface-container, rgba(128, 128, 128, 0.15))';
          }}
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronIcon size={16} />
          </motion.div>
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 custom-chat-scrollbar"
            onScroll={handleGridScroll}
          >
            <div className="grid grid-cols-6 gap-1 justify-items-center pt-1">
              {displayedEmojis.map((emoji) => (
                <button
                  key={emoji.id}
                  type="button"
                  onClick={() => handleSelect(emoji.char)}
                  className="emoji-font flex items-center justify-center active:scale-95 cursor-pointer rounded-[5px] transition-colors"
                  style={{
                    width: 36,
                    height: 36,
                    fontSize: '23px',
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    borderRadius: '5px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-container-strong, rgba(255, 255, 255, 0.1))';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {emoji.char}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface MessageContextMenuProps {
  menu: ContextMenuState;
  setMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
  isPinned: boolean;
  onCopy?: () => void;
  onCopyImage?: () => void;
  onSaveAs?: () => void;
  onForward?: () => void;
  onSelect: () => void;
  onSelectReaction?: (emoji: string) => void;
  canManageMessages?: boolean;
  onRetry?: () => void;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  menu,
  setMenu,
  onReply,
  onEdit,
  onPin,
  onDelete,
  isPinned,
  onCopy,
  onCopyImage,
  onSaveAs,
  onForward,
  onSelect,
  onSelectReaction,
  canManageMessages,
  onRetry,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuCardRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuCardHeight, setMenuCardHeight] = useState(240);

  useEffect(() => {
    if (menuCardRef.current) {
      const h = menuCardRef.current.offsetHeight;
      if (h > 0) {
        setMenuCardHeight(h);
      }
    }
  }, [menu.visible, menu.type, menu.isOwn, isPinned, canManageMessages]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    if (menu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menu.visible, setMenu]);

  if (!menu.visible) return null;

  const close = () => setMenu((prev) => ({ ...prev, visible: false }));

  const iconColor = 'var(--text-main)';
  const baseBtnClass =
    'w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-normal normal-case transition-colors cursor-pointer select-none rounded-[5px]';
  const baseBtnStyle: React.CSSProperties = {
    color: 'var(--text-main)',
    borderRadius: '5px',
    border: 'none',
    backgroundColor: 'transparent',
  };

  const items: { label: string; onClick: () => void; icon: React.ReactNode }[] = [];

  if (menu.isFailed && onRetry) {
    items.push({
      label: t('common.retry', 'Повторить'),
      onClick: onRetry,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={16}
          height={16}
          fill="none"
          stroke="#ff4d4f"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      ),
    });
  }

  if (canManageMessages !== false) {
    items.push({
      label: t('common.reply'),
      onClick: onReply,
      icon: <CustomReplyIcon size={16} style={{ color: iconColor }} />,
    });
  }

  if (canManageMessages !== false && menu.isOwn && menu.type === 'text') {
    items.push({
      label: t('common.edit'),
      onClick: onEdit,
      icon: <CustomEditIcon size={16} style={{ color: iconColor }} />,
    });
  }

  if (canManageMessages !== false) {
    items.push({
      label: isPinned ? t('common.unpin') : t('common.pin'),
      onClick: onPin,
      icon: isPinned ? (
        <CustomUnpinIcon size={16} style={{ color: iconColor }} />
      ) : (
        <CustomPinIcon size={16} style={{ color: iconColor }} />
      ),
    });
  }

  if (menu.type === 'text') {
    items.push({
      label: t('common.copy'),
      onClick: onCopy || close,
      icon: <Copy size={16} style={{ color: iconColor }} />,
    });
  } else if (menu.type === 'singleImage') {
    items.push({
      label: t('chatWindow.save_image_as'),
      onClick: onSaveAs || close,
      icon: <DownloadIcon size={16} style={{ color: iconColor }} />,
    });
    items.push({
      label: t('chatWindow.copy_image'),
      onClick: onCopyImage || close,
      icon: <ImageIcon size={16} style={{ color: iconColor }} />,
    });
  } else if (menu.type === 'multipleImages' || menu.type === 'file') {
    items.push({
      label: t('chatWindow.save_image_as'),
      onClick: onSaveAs || close,
      icon: <DownloadIcon size={16} style={{ color: iconColor }} />,
    });
  }

  if (canManageMessages !== false) {
    items.push({
      label: t('common.delete'),
      onClick: onDelete,
      icon: <Trash size={16} style={{ color: iconColor }} />,
    });
  }

  if (onForward) {
    items.push({
      label: t('common.forward'),
      onClick: onForward,
      icon: <Forward size={16} style={{ color: iconColor }} />,
    });
  }

  items.push({
    label: t('common.select'),
    onClick: onSelect,
    icon: <CheckCircle size={16} style={{ color: iconColor }} />,
  });

  const expandedHeight = Math.max(280, menuCardHeight + 48);

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[300] select-none"
      style={{
        left: menu.x,
        top: menu.y,
        transformOrigin: 'top left',
        width: '256px',
      }}
    >
      <motion.div
        ref={menuCardRef}
        animate={{
          opacity: isExpanded ? 0 : 1,
          scale: isExpanded ? 0.95 : 1,
          y: isExpanded ? -6 : 0,
          pointerEvents: isExpanded ? 'none' : 'auto',
        }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="backdrop-blur-xl select-none overflow-hidden absolute top-[48px] left-0 z-[1] rounded-[5px]"
        style={{
          width: '256px',
          backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
          borderRadius: '5px',
          border: 'none',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.38)',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {items.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              item.onClick();
              close();
            }}
            className={baseBtnClass}
            style={baseBtnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-container-strong, rgba(255, 255, 255, 0.08))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
              {item.icon}
            </span>
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        ))}
      </motion.div>

      <div className="relative z-[2]">
        <QuickReactionHeader
          onSelectReaction={onSelectReaction}
          onCloseMenu={close}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
          expandedHeight={expandedHeight}
        />
      </div>
    </motion.div>
  );
};
