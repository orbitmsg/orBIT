import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, MoreVertical } from 'lucide-react';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../../utils/scrollbarDrag';
import type { Message } from '../../../store/useChatStore';
import {
  type MediaGridItem,
  type MediaGroup,
  type MediaType,
  formatPeriodHeader,
} from './types';
import {
  ProfileMediaGridTile,
  ProfileFileListItem,
  ProfileAudioListItem,
  ProfileVoiceListItem,
  ProfileLinkListItem,
} from './ProfileMediaItems';

interface ProfileSubTabProps {
  subTab: MediaType;
  onBack: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  mediaGroups: Record<MediaType, MediaGroup>;
  chatSharedSecret: string;
  viewerOpen: boolean;
  onMediaClick: (item: MediaGridItem, displaySrc: string | null) => void;
  onLinkClick?: (url: string) => void;
  i18nLang: string;
}

export const ProfileSubTab: React.FC<ProfileSubTabProps> = ({
  subTab,
  onBack,
  searchQuery,
  setSearchQuery,
  mediaGroups,
  chatSharedSecret,
  viewerOpen,
  onMediaClick,
  onLinkClick,
  i18nLang,
}) => {
  const { t } = useTranslation();
  const subTabScrollRef = useRef<HTMLDivElement | null>(null);
  const [subTabThumb, setSubTabThumb] = useState<{ top: number; height: number } | null>(null);
  const [isSubTabActive, setIsSubTabActive] = useState(false);
  const subTabTimerRef = useRef<NodeJS.Timeout | null>(null);

  const updateSubTabScrollThumb = useCallback(() => {
    const el = subTabScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight || clientHeight === 0) {
      setSubTabThumb(null);
      return;
    }
    const thumbH = Math.max(20, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - thumbH;
    const top = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setSubTabThumb({ top, height: thumbH });
  }, []);

  const triggerSubTabActive = useCallback(() => {
    setIsSubTabActive(true);
    updateSubTabScrollThumb();
    if (subTabTimerRef.current) clearTimeout(subTabTimerRef.current);
    subTabTimerRef.current = setTimeout(() => {
      setIsSubTabActive(false);
    }, 1500);
  }, [updateSubTabScrollThumb]);

  const handleSubTabMouseLeave = useCallback(() => {
    if (subTabTimerRef.current) clearTimeout(subTabTimerRef.current);
    subTabTimerRef.current = setTimeout(() => {
      setIsSubTabActive(false);
    }, 500);
  }, []);

  useEffect(() => {
    updateSubTabScrollThumb();
  }, [subTab, mediaGroups, searchQuery, updateSubTabScrollThumb]);

  const filteredMessages = (messagesList: Message[]) => {
    if (!searchQuery.trim()) return messagesList;
    const q = searchQuery.toLowerCase();
    return messagesList.filter(msg =>
      (msg.mediaName && msg.mediaName.toLowerCase().includes(q)) ||
      (msg.text && msg.text.toLowerCase().includes(q)) ||
      (msg.sender && msg.sender.toLowerCase().includes(q))
    );
  };

  const filteredGridItems = (items: MediaGridItem[]) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item =>
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.text && item.text.toLowerCase().includes(q)) ||
      (item.sender && item.sender.toLowerCase().includes(q))
    );
  };

  const groupGridItemsByPeriod = (items: MediaGridItem[]) => {
    const sorted = [...items].sort((a, b) => b.time - a.time);
    const groupsMap = new Map<string, { key: string; title: string; orderScore: number; items: MediaGridItem[] }>();

    for (const item of sorted) {
      const period = formatPeriodHeader(item.time, i18nLang);
      if (!groupsMap.has(period.key)) {
        groupsMap.set(period.key, {
          key: period.key,
          title: period.title,
          orderScore: period.orderScore,
          items: [],
        });
      }
      groupsMap.get(period.key)!.items.push(item);
    }

    return Array.from(groupsMap.values()).sort((a, b) => b.orderScore - a.orderScore);
  };

  const groupMessagesByPeriod = (messagesList: Message[]) => {
    const sorted = [...messagesList].sort((a, b) => b.time - a.time);
    const groupsMap = new Map<string, { key: string; title: string; orderScore: number; messages: Message[] }>();

    for (const msg of sorted) {
      const period = formatPeriodHeader(msg.time, i18nLang);
      if (!groupsMap.has(period.key)) {
        groupsMap.set(period.key, {
          key: period.key,
          title: period.title,
          orderScore: period.orderScore,
          messages: [],
        });
      }
      groupsMap.get(period.key)!.messages.push(msg);
    }

    return Array.from(groupsMap.values()).sort((a, b) => b.orderScore - a.orderScore);
  };

  const renderSubContent = () => {
    const group = mediaGroups[subTab];
    if (!group || group.count === 0) {
      return (
        <div style={{ width: '100%', padding: '40px 16px', color: 'var(--text-dim)', fontSize: '14px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {t('profile.empty_section')}
        </div>
      );
    }

    if (subTab === 'photos' || subTab === 'videos' || subTab === 'gif') {
      const allGridItems = group.gridItems || [];
      const itemsList = filteredGridItems(allGridItems);

      if (itemsList.length === 0) {
        return (
          <div style={{ width: '100%', padding: '40px 16px', color: 'var(--text-dim)', fontSize: '14px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {t('common.no_results')}
          </div>
        );
      }

      const periodGroups = groupGridItemsByPeriod(itemsList);

      return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 16px 0', boxSizing: 'border-box' }}>
          {periodGroups.map((pGroup, idx) => (
            <div key={pGroup.key} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text-main, #ffffff)',
                  padding: idx === 0 ? '4px 0 8px' : '14px 0 8px',
                  letterSpacing: '0.1px',
                  userSelect: 'none',
                }}
              >
                {pGroup.title}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '3px',
                  width: '100%',
                }}
              >
                {pGroup.items.map((item) => (
                  <ProfileMediaGridTile
                    key={item.id}
                    item={item}
                    sharedSecret={chatSharedSecret}
                    type={subTab}
                    isViewerOpen={viewerOpen}
                    onMediaClick={onMediaClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    const messagesList = filteredMessages(group.messages);

    if (messagesList.length === 0) {
      return (
        <div style={{ width: '100%', padding: '40px 16px', color: 'var(--text-dim)', fontSize: '14px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {t('common.no_results')}
        </div>
      );
    }

    const periodGroups = groupMessagesByPeriod(messagesList);

    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        {periodGroups.map((pGroup, idx) => (
          <div key={pGroup.key} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--text-main, #ffffff)',
                padding: idx === 0 ? '6px 16px 4px 16px' : '14px 16px 4px 16px',
                letterSpacing: '0.1px',
                userSelect: 'none',
              }}
            >
              {pGroup.title}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {pGroup.messages.map((msg) => {
                if (subTab === 'files') {
                  return <ProfileFileListItem key={msg.id} msg={msg} sharedSecret={chatSharedSecret} i18nLang={i18nLang} />;
                }
                if (subTab === 'audio') {
                  return <ProfileAudioListItem key={msg.id} msg={msg} sharedSecret={chatSharedSecret} i18nLang={i18nLang} />;
                }
                if (subTab === 'voice') {
                  return <ProfileVoiceListItem key={msg.id} msg={msg} sharedSecret={chatSharedSecret} i18nLang={i18nLang} />;
                }
                if (subTab === 'links') {
                  return <ProfileLinkListItem key={msg.id} msg={msg} onLinkClick={onLinkClick} />;
                }
                return null;
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const getSectionTitle = () => {
    if (subTab === 'photos') return t('profile.photos');
    if (subTab === 'videos') return t('profile.videos');
    if (subTab === 'files') return t('profile.files');
    if (subTab === 'audio') return t('profile.audio_files');
    if (subTab === 'voice') return t('profile.voice_messages');
    if (subTab === 'links') return t('profile.links');
    if (subTab === 'gif') return t('profile.gif');
    return '';
  };

  const hasSearch = subTab === 'audio' || subTab === 'links' || subTab === 'files';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        minHeight: 0,
        flex: 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 10px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={onBack}
            aria-label={t('common.back', 'Назад')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '4px',
              margin: '-4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 22L6 12L16 2l1.775 1.775L9.55 12l8.225 8.225z" />
            </svg>
          </button>
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>{getSectionTitle()}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '36px' }}>
          {(subTab === 'photos' || subTab === 'videos') && (
            <button
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              className="hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Options"
            >
              <MoreVertical size={19} />
            </button>
          )}
        </div>
      </div>

      {hasSearch && (
        <div style={{ padding: '0 16px 10px', flexShrink: 0 }}>
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('profile.search_placeholder') || 'Поиск'}
              aria-label={t('profile.search_placeholder') || 'Поиск'}
              className="w-full pl-10 pr-4 text-[var(--text-main)] text-[13.5px] outline-none border-none focus:outline-none focus:ring-0 transition-colors placeholder:text-[var(--text-dim)]"
              style={{
                width: '100%',
                height: '36px',
                borderRadius: '999px',
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                backgroundColor: 'var(--md-surface, var(--surface-container, rgba(255,255,255,0.05)))',
                color: 'var(--text-main, #e0e0e0)',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}

      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onMouseMove={triggerSubTabActive}
        onMouseEnter={triggerSubTabActive}
        onMouseLeave={handleSubTabMouseLeave}
      >
        <div
          ref={subTabScrollRef}
          onScroll={triggerSubTabActive}
          className="chat-list-scrollbar"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: '24px',
          }}
        >
          {renderSubContent()}
        </div>

        {subTabThumb && (
          <>
            <div
              className="overlay-scroll-track"
              onMouseDown={(e) => handleScrollbarTrackMouseDown(e, subTabScrollRef.current)}
              style={{
                top: '2px',
                bottom: '6px',
                opacity: isSubTabActive ? 1 : 0,
              }}
            />
            <div
              className="overlay-scroll-thumb"
              onMouseDown={(e) => handleScrollbarThumbMouseDown(e, subTabScrollRef.current)}
              style={{
                top: subTabThumb.top + 2,
                height: subTabThumb.height,
                opacity: isSubTabActive ? 1 : 0,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};
