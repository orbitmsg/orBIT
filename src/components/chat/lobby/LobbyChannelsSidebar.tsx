import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Hash,
  Volume2,
  Plus,
  Trash2,
  PhoneOff,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { lobbyService, type LobbyChannel } from '../../../services/lobbyService';
import { useCallStore } from '../../../store/useCallStore';
import { useAuthStore } from '../../../store/useAuthStore';
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
  onOpenVoiceCall,
  isVoiceActive = false,
  onDisconnectVoice,
  onProfileClick,
  onOpenProfile,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const myNickname = useAuthStore((s) => s.nickname) || 'User';
  const myAvatar = useAuthStore((s) => s.avatarUrl);
  const callDuration = useCallStore((s) => s.duration);
  const [channels, setChannels] = useState<LobbyChannel[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'text' | 'voice'>('text');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const list = await lobbyService.getLobbyChannels(lobbyId);
      setChannels(list);
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

  const handleOpenCreateModal = (type: 'text' | 'voice') => {
    setModalType(type);
    setIsModalOpen(true);
  };

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
  const voiceChannels = channels.filter((c) => c.type === 'voice');

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
        className="w-full px-4 h-12 flex items-center justify-between border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer border-none outline-none text-left shrink-0"
        style={{
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          backgroundColor: 'var(--title-bar-bg, #121212)',
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-[15px] text-white truncate">
            {lobbyName}
          </span>
          <ShieldCheck size={14} className="text-[#949ba4] shrink-0" />
        </div>
        <ChevronDown size={18} className="text-[#949ba4] shrink-0 ml-1" />
      </button>

      <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-3 flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <div className="px-2 py-1 flex items-center justify-between group">
            <span className="text-[11.5px] font-bold text-[#949ba4] uppercase tracking-wider">
              {t('lobby.text_channels_title', 'Текстовые каналы')}
            </span>
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={() => handleOpenCreateModal('text')}
                aria-label={t('lobby.add_channel', 'Добавить канал')}
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

        <div className="flex flex-col gap-0.5">
          <div className="px-2 py-1 flex items-center justify-between group">
            <span className="text-[11.5px] font-bold text-[#949ba4] uppercase tracking-wider">
              {t('lobby.voice_channels_title', 'Голосовые каналы')}
            </span>
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={() => handleOpenCreateModal('voice')}
                aria-label={t('lobby.add_voice_channel', 'Добавить голосовой канал')}
                className="w-5 h-5 flex items-center justify-center text-[#949ba4] hover:text-white transition-colors cursor-pointer border-none bg-transparent outline-none"
              >
                <Plus size={15} />
              </button>
            )}
          </div>

          {voiceChannels.map((ch) => {
            return (
              <div key={ch.id} className="flex flex-col">
                <div
                  onClick={() => onOpenVoiceCall(ch)}
                  className="group relative flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
                  style={{
                    backgroundColor: isVoiceActive ? 'rgba(35, 165, 90, 0.12)' : 'transparent',
                    color: isVoiceActive ? '#23a55a' : '#949ba4',
                  }}
                  onMouseEnter={(e) => {
                    if (!isVoiceActive) {
                      e.currentTarget.style.backgroundColor = '#35373c';
                      e.currentTarget.style.color = '#dbdee1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isVoiceActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#949ba4';
                    }
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Volume2 size={18} className="shrink-0" />
                    <span className="text-[13.5px] font-medium truncate">
                      {ch.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isVoiceActive ? (
                      <span className="text-[11px] font-bold text-emerald-400 font-mono">
                        {formatDuration(callDuration)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#80848e] opacity-0 group-hover:opacity-100 transition-opacity">
                        {t('lobby.voice_join', 'Войти')}
                      </span>
                    )}

                    {isOwnerOrAdmin && voiceChannels.length > 1 && (
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
                </div>

                {isVoiceActive && (
                  <div className="pl-6 pr-2 py-1 flex flex-col gap-1">
                    <div className="flex items-center gap-2 py-1 px-2 rounded-md bg-white/[0.04]">
                      <div className="relative shrink-0">
                        <Avatar src={myAvatar} alt={myNickname} className="w-[22px] h-[22px] rounded-full" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#2b2d31]" />
                      </div>
                      <span className="text-[12.5px] font-medium text-white truncate flex-1">
                        {myNickname}
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                        {formatDuration(callDuration)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
                {formatDuration(callDuration)} • {voiceChannels[0]?.name || 'Голосовой'}
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
        initialType={modalType}
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
