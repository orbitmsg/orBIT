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
}

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
}) => {
  const { t } = useTranslation();
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
      className="w-60 shrink-0 h-full flex flex-col select-none border-r border-white/5"
      style={{
        backgroundColor: '#2b2d31',
      }}
    >
      <button
        type="button"
        onClick={onProfileClick}
        aria-label={lobbyName}
        className="w-full px-4 h-12 flex items-center justify-between border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer border-none outline-none text-left"
        style={{
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
      >
        <span className="font-bold text-[15px] text-white truncate">
          {lobbyName}
        </span>
        <ChevronDown size={18} className="text-[#949ba4] shrink-0 ml-1" />
      </button>

      <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
        <ShieldCheck size={14} />
        <span>{t('lobby.e2ee_protected', 'E2EE Защищено')}</span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-2 flex flex-col gap-4">
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
                className="group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
                style={{
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: isActive ? '#ffffff' : '#949ba4',
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
              <div
                key={ch.id}
                onClick={() => onOpenVoiceCall(ch)}
                className="group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
                style={{
                  color: isVoiceActive ? '#23a55a' : '#949ba4',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Volume2 size={18} className="shrink-0" />
                  <span className="text-[13.5px] font-medium truncate">
                    {ch.name}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {isVoiceActive ? (
                    <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      {t('lobby.voice_connected', 'В эфире')}
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
            );
          })}
        </div>
      </div>

      {isVoiceActive && (
        <div
          className="p-3 border-t border-white/5 flex items-center justify-between shrink-0"
          style={{ backgroundColor: 'rgba(35, 165, 90, 0.1)' }}
        >
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-emerald-400">
              {t('lobby.voice_connected_title', 'Голос подключен')}
            </span>
            <span className="text-[11px] text-[#949ba4]">
              {lobbyName}
            </span>
          </div>

          <button
            type="button"
            onClick={onDisconnectVoice}
            aria-label={t('lobby.disconnect_voice', 'Отключиться')}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors border-none outline-none cursor-pointer"
          >
            <PhoneOff size={16} />
          </button>
        </div>
      )}

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
