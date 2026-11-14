import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Sparkles,
  Gamepad2,
  Music,
  GraduationCap,
  Newspaper,
  Globe2,
} from 'lucide-react';
import { lobbyService, type Lobby } from '../../services/lobbyService';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { OrbitIcon } from '../common/OrbitBrand';

export const ExploreLobbiesView: React.FC = () => {
  const { t } = useTranslation();
  const nickname = useAuthStore((s) => s.nickname) || 'User';
  const myCode = useChatStore((s) => s.myCode) || '';
  const myAvatar = useAuthStore((s) => s.avatarUrl);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const addChat = useChatStore((s) => s.addChat);
  const chats = useChatStore((s) => s.chats);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const loadLobbies = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await lobbyService.getPublicLobbies(
        activeCategory === 'all' ? undefined : activeCategory,
        searchQuery
      );
      setLobbies(list);
    } catch {
      setLobbies([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeCategory, searchQuery]);

  useEffect(() => {
    loadLobbies();
    const unsubscribe = lobbyService.subscribeToPublicLobbies(() => {
      loadLobbies();
    });
    const handleFocus = () => loadLobbies();
    window.addEventListener('focus', handleFocus);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadLobbies]);

  const handleJoinLobby = async (lobby: Lobby) => {
    setJoiningId(lobby.id);
    try {
      await lobbyService.joinLobby(lobby.id, {
        userCode: myCode,
        nickname: nickname,
        avatarUrl: myAvatar || null,
      });

      const members = await lobbyService.getLobbyMembers(lobby.id);
      const chatMembers = members.map((m) => ({
        userId: m.userCode,
        userCode: m.userCode,
        nickname: m.nickname,
        avatarUrl: m.avatarUrl || null,
        role: m.role || 'member',
        joinedAt: m.joinedAt,
        lastSeen: m.lastSeen || Date.now(),
      }));

      const existingChat = chats.find((c) => c.id === lobby.id);
      if (!existingChat) {
        addChat({
          id: lobby.id,
          type: 'group',
          name: lobby.name,
          description: lobby.description || '',
          avatarUrl: lobby.avatarUrl || undefined,
          sharedSecret: lobby.sharedSecret || undefined,
          inviteCode: lobby.code,
          creatorCode: lobby.creatorCode,
          isOwner: lobby.creatorCode === myCode,
          role: lobby.creatorCode === myCode ? 'owner' : 'member',
          lastMsg: 'Вы присоединились к лобби',
          unreadCount: 0,
          membersCount: Math.max(lobby.membersCount, chatMembers.length),
          members: chatMembers,
        });
      } else {
        useChatStore.getState().updateChat(lobby.id, {
          members: chatMembers,
          membersCount: Math.max(lobby.membersCount, chatMembers.length),
        });
      }

      setActiveChat(lobby.id);
    } catch (e) {
      console.error('Failed to join lobby:', e);
    } finally {
      setJoiningId(null);
    }
  };

  const categories = [
    { id: 'all', label: t('lobby.cat_featured', 'Главная'), icon: Sparkles },
    { id: 'gaming', label: t('lobby.cat_gaming', 'Игровое'), icon: Gamepad2 },
    { id: 'education', label: t('lobby.cat_education', 'Учебное'), icon: GraduationCap },
    { id: 'music', label: t('lobby.cat_music', 'Музыкальное'), icon: Music },
    { id: 'news', label: t('lobby.cat_news', 'Новостное'), icon: Newspaper },
  ];

  return (
    <div className="flex-1 w-full h-full flex flex-col overflow-y-auto chat-list-scrollbar select-none" style={{ backgroundColor: 'var(--chat-bg, #1e1f22)' }}>
      <div
        className="sticky top-0 z-20 w-full px-6 py-3 flex items-center justify-between gap-4 border-b border-white/5 backdrop-blur-md"
        style={{ backgroundColor: 'rgba(30, 31, 34, 0.85)' }}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                aria-label={cat.label}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer border-none outline-none shrink-0"
                style={{
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-dim, #949ba4)',
                }}
              >
                <Icon size={16} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-64 shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('lobby.search_placeholder', 'Поиск сообществ...')}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg text-[13px] font-medium border-none outline-none"
            style={{
              backgroundColor: 'var(--surface-container, #111214)',
              color: 'var(--text-main, #ffffff)',
            }}
          />
          <Search size={15} className="absolute left-3 top-2.5 text-[var(--text-dim)] pointer-events-none" />
        </div>
      </div>

      <div className="p-8 flex flex-col gap-8 max-w-[1280px] w-full mx-auto">
        <div
          className="relative w-full rounded-2xl overflow-hidden p-8 flex flex-col justify-center min-h-[160px]"
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #312e81 40%, #4c1d95 100%)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div className="absolute -right-8 -bottom-10 opacity-20 pointer-events-none">
            <OrbitIcon size={260} />
          </div>

          <div className="relative z-10 max-w-[720px] flex flex-col gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
              {t('lobby.explore_title', 'Найдите себе уютное место под ваши интересы')}
            </h1>
            <p className="text-[14px] text-blue-100/80 leading-relaxed font-normal">
              {t('lobby.explore_subtitle', 'Этот раздел создан для того, чтобы оживить мессенджер и я думаю, он вам понравится!')}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">
              {t('lobby.recommended', 'Рекомендуемые лобби')}
            </h2>
            {lobbies.length > 0 && (
              <span className="text-[12px] text-[var(--text-dim)]">
                {lobbies.length} {t('lobby.lobbies_count', 'лобби')}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-48 rounded-2xl animate-pulse"
                  style={{ backgroundColor: 'var(--surface-container, rgba(255,255,255,0.04))' }}
                />
              ))}
            </div>
          ) : lobbies.length === 0 ? (
            <div className="w-full py-20 flex flex-col items-center justify-center text-center gap-2">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/5 text-[var(--text-dim)] mb-2">
                <Globe2 size={32} />
              </div>
              <div className="text-[16px] font-semibold text-white">
                {t('lobby.no_lobbies_title', 'Пока нет открытых лобби')}
              </div>
              <div className="text-[13px] text-[var(--text-dim)] max-w-sm">
                {t('lobby.no_lobbies_desc', 'Создайте первое открытое лобби, и оно появится на этой витрине!')}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {lobbies.map((lobby) => {
                const isMember = chats.some((c) => c.id === lobby.id);
                return (
                  <div
                    key={lobby.id}
                    className="group relative flex flex-col rounded-2xl p-5 transition-colors cursor-pointer border border-white/[0.06] hover:border-white/20"
                    style={{
                      backgroundColor: 'var(--surface-container, #2b2d31)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                    }}
                    onClick={() => (isMember ? setActiveChat(lobby.id) : handleJoinLobby(lobby))}
                  >
                    {lobby.avatarUrl ? (
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 mb-3 bg-white/5 border border-white/10">
                        <img src={lobby.avatarUrl} alt={lobby.name} className="w-full h-full object-cover" />
                      </div>
                    ) : null}

                    <h3 className="font-bold text-[16px] text-white truncate mb-1">
                      {lobby.name}
                    </h3>

                    {lobby.description && lobby.description.trim() ? (
                      <p className="text-[13px] text-[var(--text-dim, #949ba4)] line-clamp-2 leading-relaxed mb-3">
                        {lobby.description.trim()}
                      </p>
                    ) : null}

                    <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-dim, #949ba4)] font-medium mb-4 mt-auto pt-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>
                        {Math.max(1, Math.min(lobby.membersCount, (lobby as any).onlineCount || 1))} {t('lobby.online_count', 'в сети')}, {lobby.membersCount} {t('lobby.members_count', 'участников')}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={joiningId === lobby.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isMember) {
                          setActiveChat(lobby.id);
                        } else {
                          handleJoinLobby(lobby);
                        }
                      }}
                      aria-label={isMember ? t('lobby.goto_lobby', 'Перейти в лобби') : t('lobby.join_lobby', 'Присоединиться к лобби')}
                      className="w-full py-2 px-3 rounded-xl text-[13px] font-semibold text-white transition-colors cursor-pointer border-none outline-none flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: isMember ? 'rgba(255, 255, 255, 0.1)' : 'var(--accent-color, #7C3AED)',
                      }}
                    >
                      {joiningId === lobby.id ? (
                        <span>...</span>
                      ) : isMember ? (
                        t('lobby.goto_lobby', 'Перейти в лобби')
                      ) : (
                        t('lobby.join_lobby', 'Присоединиться к лобби')
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExploreLobbiesView;
