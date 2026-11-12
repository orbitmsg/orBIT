import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, MessageSquare, Check, X, UserPlus, ShieldOff } from 'lucide-react';
import { useChatStore, type IncomingFriendRequest } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { supabaseService, type UserDirectoryRecord } from '../../services/supabaseService';
import { extractCodeFromInput } from '../../utils/inviteLink';
import { Avatar } from '../common/Avatar';
import { OnlineIndicator } from '../common/OnlineIndicator';

export interface ChatPlaceholderProps {
  onConnectRequest?: (friendCode: string, callback: (success: boolean, error?: string) => void) => void;
  onAcceptFriendRequest?: (req: IncomingFriendRequest) => Promise<void>;
  onRejectFriendRequest?: (req: IncomingFriendRequest) => Promise<void>;
}

type FriendsTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

export const ChatPlaceholder: React.FC<ChatPlaceholderProps> = ({
  onConnectRequest,
  onAcceptFriendRequest,
  onRejectFriendRequest,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<FriendsTab>('online');
  const [hoveredFriendId, setHoveredFriendId] = useState<string | null>(null);
  const [hoveredActiveId, setHoveredActiveId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [liveResults, setLiveResults] = useState<UserDirectoryRecord[]>([]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  const chats = useChatStore((s) => s.chats);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const incomingFriendRequests = useChatStore((s) => s.incomingFriendRequests);
  const removeIncomingFriendRequest = useChatStore((s) => s.removeIncomingFriendRequest);
  const toggleChatBlocked = useChatStore((s) => s.toggleChatBlocked);
  const myCode = useChatStore((s) => s.myCode);
  const userId = useAuthStore((s) => s.userId);

  const privateChats = chats.filter((c) => c.type === 'private' && c.id !== 'notes' && !c.isBlocked);
  const onlineFriends = privateChats.filter((c) => c.online);
  const blockedUsers = chats.filter((c) => c.type === 'private' && c.id !== 'notes' && Boolean(c.isBlocked));

  useEffect(() => {
    if (activeTab !== 'add') {
      setLiveResults([]);
      setIsSearching(false);
      return;
    }

    const extracted = extractCodeFromInput(query);
    const clean = (extracted || query).replace(/^@+/, '').trim().toLowerCase();
    if (clean.length < 2) {
      setLiveResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(() => {
      supabaseService
        .searchPublicProfiles(clean, 6)
        .then((results) => {
          if (cancelled) return;
          const filtered = (results || []).filter(
            (u) => u.user_code && u.user_code !== myCode && u.user_code !== userId
          );
          setLiveResults(filtered);
          setIsSearching(false);
        })
        .catch(() => {
          if (!cancelled) {
            setLiveResults([]);
            setIsSearching(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, activeTab, myCode, userId]);

  const sendRequestToCode = (targetCode: string) => {
    if (!targetCode) {
      setFeedback({
        type: 'error',
        text: t('createModal.invalid_content', 'Неверное содержимое'),
      });
      return;
    }
    if (targetCode === myCode || targetCode === userId) {
      setFeedback({
        type: 'error',
        text: t('discord.cannotAddSelf', 'Нельзя добавить самого себя'),
      });
      return;
    }
    if (!onConnectRequest) {
      setFeedback({
        type: 'error',
        text: t('discord.requestUnavailable', 'Отправка заявки сейчас недоступна'),
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    onConnectRequest(targetCode, (ok, err) => {
      setIsSubmitting(false);
      if (ok) {
        setFeedback({
          type: 'success',
          text: t('friendRequests.request_sent', 'Заявка отправлена!'),
        });
        setQuery('');
        setLiveResults([]);
      } else {
        setFeedback({
          type: 'error',
          text: err || t('createModal.user_not_found', 'Пользователь не найден'),
        });
      }
    });
  };

  const handleSendFriendRequest = async () => {
    if (isSubmitting) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setFeedback({
        type: 'error',
        text: t('createModal.specify_friend_id', 'Укажите имя пользователя или ID друга'),
      });
      return;
    }

    const cleanInput = extractCodeFromInput(trimmed).trim();
    const rawClean = cleanInput.replace(/^@+/, '').trim();
    if (!rawClean) {
      setFeedback({
        type: 'error',
        text: t('createModal.invalid_content', 'Неверное содержимое'),
      });
      return;
    }
    if (rawClean === myCode || rawClean === userId) {
      setFeedback({
        type: 'error',
        text: t('discord.cannotAddSelf', 'Нельзя добавить самого себя'),
      });
      return;
    }
    if (!onConnectRequest) {
      setFeedback({
        type: 'error',
        text: t('discord.requestUnavailable', 'Отправка заявки сейчас недоступна'),
      });
      return;
    }

    if (/^[0-9a-zA-Z-]{36}$/.test(rawClean)) {
      sendRequestToCode(rawClean.toUpperCase());
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const found = await supabaseService.lookupProfileByUsername(rawClean);
      if (found && found.user_code) {
        sendRequestToCode(found.user_code);
        return;
      }

      const matches = await supabaseService.searchPublicProfiles(rawClean, 1);
      if (matches && matches.length > 0 && matches[0].user_code) {
        sendRequestToCode(matches[0].user_code);
        return;
      }

      sendRequestToCode(rawClean);
    } catch {
      setIsSubmitting(false);
      setFeedback({
        type: 'error',
        text: t('createModal.user_not_found', 'Пользователь не найден'),
      });
    }
  };

  const handleAccept = async (req: IncomingFriendRequest) => {
    if (!onAcceptFriendRequest || processingRequestId) return;
    setProcessingRequestId(req.id);
    try {
      await onAcceptFriendRequest(req);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleReject = async (req: IncomingFriendRequest) => {
    if (processingRequestId) return;
    setProcessingRequestId(req.id);
    try {
      if (onRejectFriendRequest) {
        await onRejectFriendRequest(req);
      } else {
        removeIncomingFriendRequest(req.id);
      }
    } finally {
      setProcessingRequestId(null);
    }
  };

  return (
    <div
      className="flex w-full h-full select-none overflow-hidden gap-2"
      style={{ backgroundColor: 'transparent' }}
    >
      <div
        className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden rounded-[18px]"
        style={{ backgroundColor: 'var(--bg-primary, #313338)' }}
      >
        <div className="h-14 px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center min-w-0 gap-2">
          <div className="flex items-center text-[var(--text-dim)] shrink-0">
            <Users size={20} />
          </div>
          <span className="font-bold text-[var(--text-heading,var(--text-main))] text-[15px] mr-2 whitespace-nowrap">
            {t('discord.friends', 'Друзья')}
          </span>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() => setActiveTab('online')}
              className={`px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer outline-none whitespace-nowrap ${
                activeTab === 'online'
                  ? 'text-[var(--text-heading,var(--text-main))] border border-[var(--border-color)]'
                  : 'text-[var(--text-dim)] border border-transparent hover:bg-[var(--surface-hover,var(--surface-container-soft))] hover:text-[var(--text-main)] bg-transparent'
              }`}
              style={activeTab === 'online' ? { backgroundColor: 'var(--surface-active, color-mix(in srgb, var(--accent-color, #5865F2) 18%, var(--surface-container-strong)))' } : undefined}
            >
              {t('discord.online', 'В сети')}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer outline-none whitespace-nowrap ${
                activeTab === 'all'
                  ? 'text-[var(--text-heading,var(--text-main))] border border-[var(--border-color)]'
                  : 'text-[var(--text-dim)] border border-transparent hover:bg-[var(--surface-hover,var(--surface-container-soft))] hover:text-[var(--text-main)] bg-transparent'
              }`}
              style={activeTab === 'all' ? { backgroundColor: 'var(--surface-active, color-mix(in srgb, var(--accent-color, #5865F2) 18%, var(--surface-container-strong)))' } : undefined}
            >
              {t('discord.all', 'Все')}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer outline-none whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'text-[var(--text-heading,var(--text-main))] border border-[var(--border-color)]'
                  : 'text-[var(--text-dim)] border border-transparent hover:bg-[var(--surface-hover,var(--surface-container-soft))] hover:text-[var(--text-main)] bg-transparent'
              }`}
              style={activeTab === 'pending' ? { backgroundColor: 'var(--surface-active, color-mix(in srgb, var(--accent-color, #5865F2) 18%, var(--surface-container-strong)))' } : undefined}
            >
              <span>{t('discord.pending', 'В ожидании')}</span>
              {incomingFriendRequests.length > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none"
                  style={{
                    backgroundColor: 'var(--accent-color, #5865F2)',
                    color: 'var(--accent-on-color, #ffffff)',
                  }}
                >
                  {incomingFriendRequests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('blocked')}
              className={`px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer outline-none whitespace-nowrap ${
                activeTab === 'blocked'
                  ? 'text-[var(--text-heading,var(--text-main))] border border-[var(--border-color)]'
                  : 'text-[var(--text-dim)] border border-transparent hover:bg-[var(--surface-hover,var(--surface-container-soft))] hover:text-[var(--text-main)] bg-transparent'
              }`}
              style={activeTab === 'blocked' ? { backgroundColor: 'var(--surface-active, color-mix(in srgb, var(--accent-color, #5865F2) 18%, var(--surface-container-strong)))' } : undefined}
            >
              {t('discord.blocked', 'Заблокированные')}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('add')}
              className="text-[13px] font-medium px-3.5 py-1.5 rounded-xl transition-opacity cursor-pointer border-none outline-none ml-1 whitespace-nowrap hover:opacity-90"
              style={{
                background: activeTab === 'add'
                  ? 'var(--accent-dark, var(--accent-color, #4752c4))'
                  : 'var(--accent-gradient, var(--accent-color, #5865F2))',
                color: activeTab === 'add' ? '#ffffff' : 'var(--accent-on-color, #ffffff)',
              }}
            >
              {t('discord.addFriend', 'Добавить в друзья')}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {activeTab === 'online' &&
            (onlineFriends.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div className="bg-[var(--bg-secondary)] rounded-2xl px-6 py-5 max-w-[380px]">
                  <span className="text-[var(--text-dim)] text-[14px]">
                    {t('discord.noFriendsOnline', 'Сейчас никого из ваших друзей нет в сети. Зайдите позже!')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-1.5">
                <div className="text-[12px] font-bold text-[var(--text-dim)] uppercase tracking-wider px-2.5 py-1">
                  {t('discord.online', 'В сети')} — {onlineFriends.length}
                </div>
                {onlineFriends.map((friend) => (
                  <div
                    key={friend.id}
                    onClick={() => setActiveChat(friend.id)}
                    onMouseEnter={() => setHoveredFriendId(friend.id)}
                    onMouseLeave={() => setHoveredFriendId(null)}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--surface-container-strong)] cursor-pointer group transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar src={friend.avatarUrl} alt={friend.name} className="w-10 h-10 rounded-full" />
                        <OnlineIndicator
                          online={friend.online}
                          showOffline={true}
                          size="sm"
                          ringColor={hoveredFriendId === friend.id ? 'var(--surface-container-strong)' : 'var(--bg-primary)'}
                          ariaLabel={t('discord.online', 'В сети')}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[var(--text-heading,var(--text-main))] text-[15px] truncate">{friend.name}</span>
                        <span className="text-xs text-[var(--text-dim)] truncate">
                          {friend.username ? `@${friend.username} · ` : ''}
                          {t('discord.online', 'В сети')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveChat(friend.id);
                        }}
                        aria-label={friend.name}
                        className="w-9 h-9 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--surface-container)] text-[var(--text-dim)] hover:text-[var(--text-heading,var(--text-main))] flex items-center justify-center transition-colors outline-none cursor-pointer"
                      >
                        <MessageSquare size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {activeTab === 'all' &&
            (privateChats.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div className="bg-[var(--bg-secondary)] rounded-2xl px-6 py-5 max-w-[380px]">
                  <span className="text-[var(--text-dim)] text-[14px]">
                    {t('discord.allFriendsEmpty', 'Список друзей пока пуст')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-1.5">
                <div className="text-[12px] font-bold text-[var(--text-dim)] uppercase tracking-wider px-2.5 py-1">
                  {t('discord.all', 'Все')} — {privateChats.length}
                </div>
                {privateChats.map((friend) => (
                  <div
                    key={friend.id}
                    onClick={() => setActiveChat(friend.id)}
                    onMouseEnter={() => setHoveredFriendId(friend.id)}
                    onMouseLeave={() => setHoveredFriendId(null)}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--surface-container-strong)] cursor-pointer group transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar src={friend.avatarUrl} alt={friend.name} className="w-10 h-10 rounded-full" />
                        <OnlineIndicator
                          online={friend.online}
                          showOffline={true}
                          size="sm"
                          ringColor={hoveredFriendId === friend.id ? 'var(--surface-container-strong)' : 'var(--bg-primary)'}
                          ariaLabel={friend.online ? t('discord.online', 'В сети') : t('common.offline', 'Не в сети')}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[var(--text-heading,var(--text-main))] text-[15px] truncate">{friend.name}</span>
                        <span className="text-xs text-[var(--text-dim)] truncate">
                          {friend.username ? `@${friend.username} · ` : ''}
                          {friend.online ? t('discord.online', 'В сети') : t('common.offline', 'Не в сети')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveChat(friend.id);
                        }}
                        aria-label={friend.name}
                        className="w-9 h-9 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--surface-container)] text-[var(--text-dim)] hover:text-[var(--text-heading,var(--text-main))] flex items-center justify-center transition-colors outline-none cursor-pointer"
                      >
                        <MessageSquare size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {activeTab === 'pending' &&
            (incomingFriendRequests.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div className="bg-[var(--bg-secondary)] rounded-2xl px-6 py-5 max-w-[380px]">
                  <span className="text-[var(--text-dim)] text-[14px]">
                    {t('friendRequests.empty', 'Нет новых запросов')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-1.5">
                <div className="text-[12px] font-bold text-[var(--text-dim)] uppercase tracking-wider px-2.5 py-1">
                  {t('discord.pending', 'В ожидании')} — {incomingFriendRequests.length}
                </div>
                {incomingFriendRequests.map((req) => {
                  const isBusy = processingRequestId === req.id;
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--surface-container-strong)] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          src={req.avatarUrl}
                          alt={req.senderNickname}
                          className="w-10 h-10 rounded-full shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-[var(--text-heading,var(--text-main))] text-[15px] truncate">
                            {req.senderNickname}
                          </span>
                          <span className="text-xs text-[var(--text-dim)] truncate">
                            {req.username ? `@${req.username}` : req.senderCode || req.chatId}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAccept(req)}
                          aria-label={t('common.accept', 'Принять')}
                          className="px-3.5 py-1.5 rounded-xl bg-[#23a55a] hover:bg-[#1f8f4e] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border-none outline-none cursor-pointer"
                        >
                          <Check size={15} />
                          <span>{t('common.accept', 'Принять')}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReject(req)}
                          aria-label={t('common.decline', 'Отклонить')}
                          className="px-3.5 py-1.5 rounded-xl bg-[var(--surface-container)] hover:bg-[var(--surface-container-strong)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-main)] text-xs font-semibold flex items-center gap-1.5 transition-colors outline-none cursor-pointer"
                        >
                          <X size={15} />
                          <span>{t('common.decline', 'Отклонить')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

          {activeTab === 'blocked' &&
            (blockedUsers.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div className="bg-[var(--bg-secondary)] rounded-2xl px-6 py-5 max-w-[380px]">
                  <span className="text-[var(--text-dim)] text-[14px]">
                    {t('discord.blockedEmpty', 'У вас нет заблокированных пользователей')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-1.5">
                <div className="text-[12px] font-bold text-[var(--text-dim)] uppercase tracking-wider px-2.5 py-1">
                  {t('discord.blocked', 'Заблокированные')} — {blockedUsers.length}
                </div>
                {blockedUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--surface-container-strong)] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[var(--text-heading,var(--text-main))] text-[15px] truncate">{user.name}</span>
                        <span className="text-xs text-[var(--text-dim)] truncate">
                          {user.username ? `@${user.username}` : t('discord.blocked', 'Заблокированные')}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleChatBlocked(user.id)}
                      aria-label={t('profile.unblock', 'Разблокировать')}
                      className="px-3.5 py-1.5 rounded-xl bg-[var(--surface-container)] hover:bg-[var(--surface-container-strong)] text-[var(--text-main)] text-xs font-semibold flex items-center gap-1.5 transition-colors outline-none cursor-pointer shrink-0"
                    >
                      <ShieldOff size={14} />
                      <span>{t('profile.unblock', 'Разблокировать')}</span>
                    </button>
                  </div>
                ))}
              </div>
            ))}

          {activeTab === 'add' && (
            <div className="p-6 flex flex-col max-w-[560px]">
              <h2 className="text-[var(--text-heading,var(--text-main))] text-base font-bold uppercase tracking-wide mb-1.5">
                {t('discord.addFriend', 'Добавить в друзья')}
              </h2>
              <p className="text-[var(--text-dim)] text-xs mb-4 leading-relaxed">
                {t(
                  'discord.addFriendDesc',
                  'Вы можете добавить друзей по имени пользователя, коду или ссылке-приглашению.'
                )}
              </p>

              <div className="flex items-center gap-2 bg-[var(--surface-container)] rounded-2xl p-2 pl-4 focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--accent-color)_45%,transparent)] transition-all">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (feedback) setFeedback(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendFriendRequest();
                    }
                  }}
                  placeholder={t(
                    'discord.addFriendPlaceholder',
                    'Имя пользователя, @username, UUID или ссылка'
                  )}
                  aria-label={t(
                    'discord.addFriendPlaceholder',
                    'Имя пользователя, @username, UUID или ссылка'
                  )}
                  className="bg-transparent border-none outline-none text-[var(--text-main)] text-sm flex-1 min-w-0 placeholder-[var(--text-dim)]"
                />
                <button
                  type="button"
                  onClick={handleSendFriendRequest}
                  disabled={isSubmitting || !query.trim()}
                  aria-label={t('discord.sendFriendRequest', 'Отправить запрос')}
                  className="hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold px-4 py-2.5 rounded-xl transition-opacity border-none outline-none cursor-pointer shrink-0"
                  style={{
                    background: 'var(--accent-gradient, var(--accent-color, #5865F2))',
                    color: 'var(--accent-on-color, #ffffff)',
                  }}
                >
                  {isSubmitting
                    ? t('discord.sendingRequest', 'Отправка...')
                    : t('discord.sendFriendRequest', 'Отправить запрос')}
                </button>
              </div>

              {feedback && (
                <div
                  className="mt-3 rounded-xl px-4 py-2.5 text-xs font-medium"
                  style={
                    feedback.type === 'success'
                      ? {
                          backgroundColor: 'color-mix(in srgb, #23a55a 14%, transparent)',
                          border: '1px solid color-mix(in srgb, #23a55a 32%, transparent)',
                          color: 'color-mix(in srgb, #23a55a 78%, var(--text-main))',
                        }
                      : {
                          backgroundColor: 'color-mix(in srgb, #da373c 14%, transparent)',
                          border: '1px solid color-mix(in srgb, #da373c 32%, transparent)',
                          color: 'color-mix(in srgb, #da373c 78%, var(--text-main))',
                        }
                  }
                >
                  {feedback.text}
                </div>
              )}

              {(isSearching || liveResults.length > 0) && (
                <div className="mt-4 bg-[var(--bg-secondary)] rounded-2xl p-2 flex flex-col gap-1">
                  {isSearching && liveResults.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-[var(--text-dim)]">
                      {t('discord.searching', 'Поиск пользователей...')}
                    </div>
                  ) : (
                    liveResults.map((user) => (
                      <div
                        key={user.user_code}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-[var(--surface-container-strong)] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            src={user.avatar_url}
                            alt={user.nickname}
                            className="w-9 h-9 rounded-full shrink-0"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-[var(--text-heading,var(--text-main))] truncate">
                              {user.nickname}
                            </span>
                            <span className="text-xs text-[var(--text-dim)] truncate">
                              {user.username ? `@${user.username}` : user.user_code}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => sendRequestToCode(user.user_code)}
                          aria-label={t('discord.addShort', 'Добавить')}
                          className="hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-opacity border-none outline-none cursor-pointer shrink-0"
                          style={{
                            background: 'var(--accent-gradient, var(--accent-color, #5865F2))',
                            color: 'var(--accent-on-color, #ffffff)',
                          }}
                        >
                          <UserPlus size={14} />
                          <span>{t('discord.addShort', 'Добавить')}</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className="w-[340px] p-4 flex flex-col shrink-0 select-none hidden lg:flex rounded-[18px] overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary, #313338)' }}
      >
        <h2 className="text-[18px] font-bold text-[var(--text-heading,var(--text-main))] mb-4 px-1">
            {t('discord.activeContacts', 'Активные контакты')}
          </h2>
          {onlineFriends.length === 0 ? (
            <div className="bg-[var(--bg-secondary)] rounded-2xl p-5 text-center">
              <h3 className="font-bold text-[var(--text-heading,var(--text-main))] text-[15px] mb-2">
                {t('discord.quietForNow', 'Пока что тут тихо...')}
              </h3>
              <p className="text-xs text-[var(--text-dim)] leading-relaxed m-0">
                {t(
                  'discord.quietForNowDesc',
                  'Если ваш друг начнет чем-то заниматься — например, запустит игру или войдет в голосовой чат, — вы увидите это здесь!'
                )}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto">
              {onlineFriends.map((friend) => (
                <div
                  key={friend.id}
                  onClick={() => setActiveChat(friend.id)}
                  onMouseEnter={() => setHoveredActiveId(friend.id)}
                  onMouseLeave={() => setHoveredActiveId(null)}
                  className="bg-[var(--bg-secondary)] hover:bg-[var(--surface-container-strong)] rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer transition-colors"
                >
                  <div className="relative shrink-0">
                    <Avatar src={friend.avatarUrl} alt={friend.name} className="w-10 h-10 rounded-full" />
                    <OnlineIndicator
                      online={true}
                      size="sm"
                      ringColor={hoveredActiveId === friend.id ? 'var(--surface-container-strong)' : 'var(--bg-secondary)'}
                      ariaLabel={t('discord.online', 'В сети')}
                    />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-semibold text-[var(--text-heading,var(--text-main))] text-[14px] truncate">{friend.name}</span>
                    <span className="text-xs text-[var(--text-dim)] truncate">
                      {t('discord.online', 'В сети')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
};
