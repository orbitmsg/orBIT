import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Compass,
  Sparkles,
  Gamepad2,
  Music,
  Film,
  Cpu,
  GraduationCap,
  Globe2,
} from 'lucide-react';
import { lobbyService, type Lobby } from '../../services/lobbyService';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';

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
  }, [loadLobbies]);

  const handleJoinLobby = async (lobby: Lobby) => {
    setJoiningId(lobby.id);
    try {
      await lobbyService.joinLobby(lobby.id, {
        userCode: myCode,
        nickname: nickname,
        avatarUrl: myAvatar || null,
      });

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
    { id: 'all', label: t('lobby.cat_featured'), icon: Sparkles },
    { id: 'gaming', label: t('lobby.cat_gaming'), icon: Gamepad2 },
    { id: 'music', label: t('lobby.cat_music'), icon: Music },
    { id: 'entertainment', label: t('lobby.cat_entertainment'), icon: Film },
    { id: 'tech', label: t('lobby.cat_tech'), icon: Cpu },
    { id: 'education', label: t('lobby.cat_education'), icon: GraduationCap },
    { id: 'student', label: t('lobby.cat_student'), icon: Globe2 },
  ];

  return (
    <div className="flex-1 w-full h-full flex flex-col overflow-y-auto chat-list-scrollbar select-none" style={{ backgroundColor: 'var(--chat-bg, #1e1f22)' }}>
      {/* Верхняя навигация и поиск */}
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
            placeholder={t('lobby.search_placeholder')}
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
        {/* Большой приветственный баннер */}
        <div
          className="relative w-full rounded-2xl overflow-hidden p-10 flex flex-col justify-center min-h-[200px]"
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #312e81 40%, #4c1d95 100%)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div className="absolute -right-8 -bottom-12 opacity-15 pointer-events-none text-white">
            <Compass size={280} strokeWidth={1} />
          </div>

          <div className="relative z-10 max-w-[620px] flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
              {t('lobby.explore_title')}
            </h1>
            <p className="text-[14px] text-blue-100/80 leading-relaxed font-normal">
              {t('lobby.explore_subtitle')}
            </p>
          </div>
        </div>

        {/* Сетка лобби */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white tracking-tight">
              {t('lobby.recommended')}
            </h2>
            <span className="text-[12px] text-[var(--text-dim)]">
              {lobbies.length} {t('lobby.members_count')}
            </span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-64 rounded-2xl animate-pulse"
                  style={{ backgroundColor: 'var(--surface-container, rgba(255,255,255,0.04))' }}
                />
              ))}
            </div>
          ) : lobbies.length === 0 ? (
            <div className="w-full py-16 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-16 h-16 rounded-full flex items-center justify-center bg-white/5 text-[var(--text-dim)]">
                <Globe2 size={32} />
              </div>
              <div className="text-[15px] font-medium text-[var(--text-dim)]">
                {t('lobby.no_lobbies_found')}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {lobbies.map((lobby) => {
                const isMember = chats.some((c) => c.id === lobby.id);
                return (
                  <div
                    key={lobby.id}
                    className="group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer hover:-translate-y-1"
                    style={{
                      backgroundColor: 'var(--surface-container, #2b2d31)',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                    }}
                    onClick={() => handleJoinLobby(lobby)}
                  >
                    {/* Баннер карточки */}
                    <div
                      className="w-full h-28 relative overflow-hidden"
                      style={{
                        background: lobby.bannerUrl
                          ? `url(${lobby.bannerUrl}) center/cover no-repeat`
                          : 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
                      }}
                    />

                    {/* Тело карточки */}
                    <div className="p-4 pt-0 flex flex-col flex-1 relative">
                      {/* Аватарка лобби */}
                      <div className="-mt-8 mb-2 relative self-start">
                        <div
                          className="w-12 h-12 rounded-2xl border-4 overflow-hidden flex items-center justify-center text-white font-bold text-lg"
                          style={{
                            borderColor: 'var(--surface-container, #2b2d31)',
                            backgroundColor: '#5865F2',
                          }}
                        >
                          {lobby.avatarUrl ? (
                            <img src={lobby.avatarUrl} alt={lobby.name} className="w-full h-full object-cover" />
                          ) : (
                            <span>{lobby.name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mb-1">
                        <h3 className="font-bold text-[15px] text-white truncate">
                          {lobby.name}
                        </h3>
                      </div>

                      <p className="text-[12.5px] text-[var(--text-dim, #949ba4)] line-clamp-2 leading-relaxed mb-4 flex-1">
                        {lobby.description || 'Приватное лобби со сквозным шифрованием.'}
                      </p>

                      <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11.5px] text-[var(--text-dim, #949ba4)] font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                          <span>1 {t('lobby.online_count')}</span>
                          <span className="mx-1">•</span>
                          <span>{lobby.membersCount} {t('lobby.members_count')}</span>
                        </div>

                        <button
                          type="button"
                          disabled={joiningId === lobby.id}
                          aria-label={t('lobby.enter_lobby')}
                          className="px-3 py-1 rounded-lg text-[12px] font-semibold text-white transition-opacity cursor-pointer border-none outline-none"
                          style={{
                            backgroundColor: isMember ? 'rgba(255,255,255,0.1)' : '#5865F2',
                          }}
                        >
                          {isMember ? 'Открыть' : t('lobby.enter_lobby')}
                        </button>
                      </div>
                    </div>
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
