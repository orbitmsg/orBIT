import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Hash,
  Plus,
  Trash2,
  PhoneOff,
  ChevronDown,
  ShieldCheck,
  Users,
  Search,
} from 'lucide-react';
import { lobbyService, type LobbyChannel, type LobbyMember } from '../../../services/lobbyService';
import { useCallStore } from '../../../store/useCallStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useChatStore } from '../../../store/useChatStore';
import { generateKeyPair, generateChatId, getDirectChatId } from '../../../lib/crypto';
import { Avatar } from '../../common/Avatar';
import { UserDockPanel } from '../../layout/sidebar/UserDockPanel';
import { CreateLobbyChannelModal } from './CreateLobbyChannelModal';

export type { LobbyChannel };

export interface LobbyChannelsSidebarProps {
  lobbyId: string;
  lobbyName: string;
  isOwnerOrAdmin: boolean;
  activeChannelId: string | null;
  onSelectChannel: (channel: LobbyChannel) => void;
  onOpenVoiceCall: (channel: LobbyChannel) => void;
  isVoiceActive?: boolean;
  onDisconnectVoice?: () => void;
  onProfileClick?: () => void;
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
}

const formatDuration = (totalSeconds: number) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const LobbyChannelsSidebar: React.FC<LobbyChannelsSidebarProps> = ({
  lobbyId,
  lobbyName,
  isOwnerOrAdmin,
  activeChannelId,
  onSelectChannel,
  isVoiceActive = false,
  onDisconnectVoice,
  onProfileClick,
  onOpenProfile,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const storeMyCode = useChatStore((s) => s.myCode);
  const callDuration = useCallStore((s) => s.duration);
  const activeChatObj = useChatStore((s) => s.chats.find((c) => c.id === lobbyId));
  const [channels, setChannels] = useState<LobbyChannel[]>([]);
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  const loadMembers = useCallback(async () => {
    try {
      const list = await lobbyService.getLobbyMembers(lobbyId);
      setMembers(list);
      const validMembers = list.map((m) => ({
        userId: m.userCode || m.id,
        userCode: m.userCode,
        nickname: m.nickname,
        role: m.role,
        lastSeen: m.lastSeen || Date.now(),
        avatarUrl: m.avatarUrl || null,
      }));
      useChatStore.getState().updateChat(lobbyId, {
        members: validMembers,
        membersCount: validMembers.length,
      });
    } catch (e) {
      console.error('Failed to load lobby members:', e);
    }
  }, [lobbyId]);

  const handleMemberClick = useCallback((m: LobbyMember) => {
    const currentMyCode = useChatStore.getState().myCode;
    const currentMyUid = useAuthStore.getState().userId;
    const myIds = [currentMyCode, currentMyUid].filter(Boolean);
    if (myIds.includes(m.userCode) || (m.id && myIds.includes(m.id))) {
      return;
    }
    const chatStore = useChatStore.getState();
    const currentChats = chatStore.chats;
    const targetCode = m.userCode || m.id;
    if (!targetCode) return;

    const directChatId = currentMyCode ? getDirectChatId(currentMyCode, targetCode) : null;
    const existing = currentChats.find((c) =>
      c.type === 'private' &&
      c.id !== 'notes' &&
      (c.id === directChatId || c.peerCode === targetCode || c.originalPeerCode === targetCode || (c as any).userId === targetCode)
    );

    if (existing) {
      chatStore.setActiveChat(existing.id);
    } else {
      const myKeys = generateKeyPair();
      const newChatId = directChatId || generateChatId();
      chatStore.addChat({
        id: newChatId,
        type: 'private',
        name: m.nickname || targetCode,
        lastMsg: '',
        online: true,
        isChatInitiator: true,
        sharedSecret: myKeys.privateKey,
        avatarUrl: m.avatarUrl || undefined,
        peerCode: targetCode,
        unreadCount: 0,
      });
      chatStore.setActiveChat(newChatId);
    }
  }, []);

  const handleKickMember = useCallback(async (e: React.MouseEvent, m: LobbyMember) => {
    e.stopPropagation();
    if (window.confirm(`${t('groupSettings.kick', 'Исключить')} ${m.nickname}?`)) {
      try {
        await lobbyService.leaveLobby(lobbyId, m.userCode || m.id);
        const remaining = members.filter((mem) => mem.userCode !== m.userCode && mem.id !== m.id);
        setMembers(remaining);
        useChatStore.getState().updateChat(lobbyId, {
          members: remaining.map((rem) => ({
            userId: rem.userCode || rem.id,
            userCode: rem.userCode,
            nickname: rem.nickname,
            role: rem.role,
            lastSeen: rem.lastSeen || Date.now(),
            avatarUrl: rem.avatarUrl || null,
          })),
          membersCount: remaining.length,
        });
      } catch (err) {
        console.error('Failed to kick lobby member:', err);
      }
    }
  }, [lobbyId, members, t]);

  useEffect(() => {
    loadMembers();
    const unsub = lobbyService.subscribeToLobby(
      lobbyId,
      () => {},
      () => {
        loadMembers();
      }
    );
    return () => {
      unsub();
    };
  }, [loadMembers, lobbyId]);

  const loadChannels = useCallback(async () => {
    try {
      const list = await lobbyService.getLobbyChannels(lobbyId);
      const textOnly = list.filter((c) => c.type === 'text');
      setChannels(textOnly.length > 0 ? textOnly : list);
      if (!activeChannelId && list.length > 0) {
        const firstText = list.find((c) => c.type === 'text') || list[0];
        onSelectChannel(firstText);
      }
    } catch (e) {
      console.error('Failed to load lobby channels:', e);
    }
  }, [lobbyId, activeChannelId, onSelectChannel]);

  useEffect(() => {
    loadChannels();
    const unsub = lobbyService.subscribeToLobbyChannels(lobbyId, () => {
      loadChannels();
    });
    return () => {
      unsub();
    };
  }, [loadChannels, lobbyId]);

  const handleDeleteChannel = async (e: React.MouseEvent, channelId: string) => {
    e.stopPropagation();
    if (channels.length <= 1) return;
    setDeletingId(channelId);
    try {
      await lobbyService.deleteLobbyChannel(channelId);
      const remaining = channels.filter((c) => c.id !== channelId);
      setChannels(remaining);
      if (activeChannelId === channelId && remaining.length > 0) {
        onSelectChannel(remaining[0]);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const textChannels = channels.filter((c) => c.type === 'text');

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.nickname.toLowerCase().includes(q));
  }, [members, memberSearch]);

  const totalMembersCount = members.length || activeChatObj?.membersCount || 1;
  const onlineMembersCount = Math.max(1, Math.min(totalMembersCount, (activeChatObj as any)?.onlineCount || totalMembersCount));

  return (
    <aside
      aria-label={t('lobby.channels_sidebar', 'Каналы лобби')}
      className="w-full flex-1 min-w-0 h-full flex flex-col select-none"
      style={{
        backgroundColor: 'var(--title-bar-bg, #121212)',
      }}
    >
      <button
        type="button"
        onClick={onProfileClick}
        aria-label={lobbyName}
        className="w-full px-4 py-2.5 min-h-[52px] flex items-center justify-between border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer border-none outline-none text-left shrink-0"
        style={{
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          backgroundColor: 'var(--title-bar-bg, #121212)',
        }}
      >
        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-[15px] text-white truncate">
              {lobbyName}
            </span>
            <ShieldCheck size={14} className="text-[#949ba4] shrink-0" />
          </div>
          <span className="text-[11.5px] text-[#949ba4] font-medium truncate mt-0.5">
            {onlineMembersCount} {t('lobby.online_count', 'в сети')}, {totalMembersCount} {t('lobby.members_count', 'участников')}
          </span>
        </div>
        <ChevronDown size={18} className="text-[#949ba4] shrink-0" />
      </button>

      <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-3 flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="px-2 py-1 flex items-center justify-between group">
            <span className="text-[11.5px] font-bold text-[#949ba4] uppercase tracking-wider">
              {t('lobby.sections_title', 'Разделы')}
            </span>
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                aria-label={t('lobby.add_channel', 'Добавить раздел')}
                className="w-5 h-5 flex items-center justify-center text-[#949ba4] hover:text-white transition-colors cursor-pointer border-none bg-transparent outline-none"
              >
                <Plus size={15} />
              </button>
            )}
          </div>

          {textChannels.map((ch) => {
            const isActive = activeChannelId === ch.id;
            return (
              <div
                key={ch.id}
                onClick={() => onSelectChannel(ch)}
                className="group relative flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
                style={{
                  backgroundColor: isActive ? '#404249' : 'transparent',
                  color: isActive ? '#ffffff' : '#949ba4',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#35373c';
                    e.currentTarget.style.color = '#dbdee1';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#949ba4';
                  }
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Hash size={18} className="shrink-0 text-[#80848e]" />
                  <span className="text-[13.5px] font-medium truncate">
                    {ch.name}
                  </span>
                </div>

                {isOwnerOrAdmin && textChannels.length > 1 && (
                  <button
                    type="button"
                    disabled={deletingId === ch.id}
                    onClick={(e) => handleDeleteChannel(e, ch.id)}
                    aria-label={t('common.delete', 'Удалить')}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity text-[#949ba4] cursor-pointer border-none bg-transparent outline-none p-1"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-1 mt-1 pt-2 border-t border-white/5">
          <div className="px-2 py-1 flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-[#949ba4] uppercase tracking-wider flex items-center gap-1.5">
              <Users size={13} className="text-[#949ba4]" />
              {t('lobby.members_section', 'Участники')} ({members.length})
            </span>
          </div>

          <div className="relative w-full px-1 my-1">
            <div className="relative w-full">
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={t('lobby.search_members', 'Поиск участников...')}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[12.5px] font-medium border-none outline-none"
                style={{
                  backgroundColor: 'var(--surface-container, #111214)',
                  color: 'var(--text-main, #ffffff)',
                }}
              />
              <Search size={14} className="absolute left-2.5 top-2.5 text-[#949ba4] pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            {filteredMembers.map((m) => {
              const isOwner = m.role === 'owner';
              const isAdmin = m.role === 'admin';
              const isSelf = m.userCode === storeMyCode || (m.id && m.id === storeMyCode);
              const canKick = isOwnerOrAdmin && !isOwner && !isSelf;

              return (
                <div
                  key={m.id || m.userCode}
                  onClick={() => handleMemberClick(m)}
                  className="group relative flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/10 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <div className="relative shrink-0">
                    <Avatar
                      src={m.avatarUrl || undefined}
                      alt={m.nickname}
                      className="w-[24px] h-[24px] rounded-full"
                    />
                  </div>
                  <span className="text-[13px] font-medium text-white/90 truncate flex-1">
                    {m.nickname}
                  </span>
                  {isOwner && (
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0">
                      {t('lobby.role_owner', 'Создатель')}
                    </span>
                  )}
                  {isAdmin && (
                    <span className="text-[10px] font-semibold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded shrink-0">
                      {t('lobby.role_admin', 'Модератор')}
                    </span>
                  )}
                  {canKick && (
                    <button
                      type="button"
                      onClick={(e) => handleKickMember(e, m)}
                      aria-label={t('groupSettings.kick', 'Исключить')}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity text-[#949ba4] cursor-pointer border-none bg-transparent outline-none p-1 shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isVoiceActive && (
        <div
          className="px-3 py-2 flex items-center justify-between shrink-0 border-t border-white/5"
          style={{ backgroundColor: 'var(--title-bar-bg, #121212)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[12px] font-bold text-emerald-400 leading-tight">
                {t('lobby.voice_connected', 'Голос подключен')}
              </span>
              <span className="text-[11px] text-[#949ba4] font-mono leading-tight">
                {formatDuration(callDuration)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onDisconnectVoice}
            aria-label={t('lobby.disconnect_voice', 'Отключиться')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500/20 transition-colors border-none outline-none cursor-pointer"
          >
            <PhoneOff size={16} />
          </button>
        </div>
      )}

      <div className="shrink-0 p-1.5">
        <UserDockPanel onOpenProfile={onOpenProfile} onOpenSettings={onOpenSettings} />
      </div>

      <CreateLobbyChannelModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        lobbyId={lobbyId}
        lobbyName={lobbyName}
        initialType="text"
        onChannelCreated={(newCh) => {
          setChannels((prev) => [...prev, newCh]);
          if (newCh.type === 'text') {
            onSelectChannel(newCh);
          }
        }}
      />
    </aside>
  );
};
