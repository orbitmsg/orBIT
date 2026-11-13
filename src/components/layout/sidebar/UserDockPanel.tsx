import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../../store/useAuthStore';
import { useConnectionStore } from '../../../store/useConnectionStore';
import { useChatStore } from '../../../store/useChatStore';
import { callSoundService } from '../../../services/callSoundService';
import { Avatar } from '../../common/Avatar';
import { OnlineIndicator } from '../../common/OnlineIndicator';
import { GearIcon, MicToggleIcon, HeadphonesToggleIcon } from './ProfileDockIcons';

export interface UserDockPanelProps {
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
}

export const UserDockPanel: React.FC<UserDockPanelProps> = ({
  onOpenProfile,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const nickname = useAuthStore((s) => s.nickname);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isProfileHovered, setIsProfileHovered] = useState(false);
  const dockRingColor = isProfileHovered
    ? 'color-mix(in srgb, var(--accent-on-color, #ffffff) 14%, #28282c)'
    : '#28282c';

  return (
    <div className="shrink-0 w-full z-20 select-none pointer-events-auto rounded-[5px]">
      <style>{`
        .orbita-dock-panel .dock-profile-btn:hover,
        .orbita-dock-panel .dock-btn:hover {
          background-color: color-mix(in srgb, var(--accent-on-color, #ffffff) 14%, transparent);
        }
        .orbita-dock-panel .dock-profile-btn:active,
        .orbita-dock-panel .dock-btn:active {
          background-color: color-mix(in srgb, var(--accent-on-color, #ffffff) 22%, transparent);
        }
        .orbita-dock-panel .pdi-gear-wrap,
        .orbita-dock-panel .pdi-mic-unmuted,
        .orbita-dock-panel .pdi-hp-unmuted {
          color: color-mix(in srgb, var(--accent-on-color, #ffffff) 82%, transparent);
        }
        .orbita-dock-panel .dock-btn:hover .pdi-gear-wrap,
        .orbita-dock-panel .dock-btn:hover .pdi-mic-unmuted,
        .orbita-dock-panel .dock-btn:hover .pdi-hp-unmuted {
          color: var(--accent-on-color, #ffffff);
        }
      `}</style>
      <div
        className="orbita-dock-panel flex items-center justify-between px-2.5 py-1.5"
        style={{
          minHeight: '60px',
          height: '60px',
          background: 'var(--accent-gradient, linear-gradient(135deg, var(--accent-color, #5865F2) 0%, var(--accent-dark, #4752c4) 100%))',
          borderRadius: '5px',
          border: 'none',
          outline: 'none',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
          color: 'var(--accent-on-color, #ffffff)',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (onOpenProfile) {
              onOpenProfile();
            } else {
              useChatStore.getState().openSettings('profile');
            }
          }}
          onMouseEnter={() => setIsProfileHovered(true)}
          onMouseLeave={() => setIsProfileHovered(false)}
          aria-label={t('mainMenu.my_profile', 'Мой профиль')}
          className="dock-profile-btn flex items-center gap-2.5 min-w-0 flex-1 rounded-[5px] transition-colors bg-transparent border-none outline-none cursor-pointer text-left p-1"
          style={{
            WebkitTapHighlightColor: 'transparent',
            borderRadius: '5px',
            outline: 'none',
            boxShadow: 'none',
            border: 'none',
            color: 'var(--accent-on-color, #ffffff)',
          }}
        >
          <div className="relative shrink-0">
            <Avatar
              src={avatarUrl}
              alt={nickname || 'Saizzi'}
              className="w-10 h-10 rounded-full"
            />
            <OnlineIndicator
              online={isServerConnected}
              showOffline={true}
              size="xs"
              ringColor={dockRingColor}
              ariaLabel={isServerConnected ? t('discord.online', 'В сети') : t('common.network_connecting_title', 'Соединение...')}
            />
          </div>
          <div className="flex flex-col min-w-0 flex-1 leading-none">
            <span
              className="text-[14px] font-bold truncate leading-tight"
              style={{ color: 'var(--accent-on-color, #ffffff)' }}
            >
              {nickname || 'Saizzi'}
            </span>
            <span
              className="text-[12px] truncate mt-0.5"
              style={{ color: 'color-mix(in srgb, var(--accent-on-color, #ffffff) 80%, transparent)' }}
            >
              {isServerConnected ? t('discord.online', 'В сети') : t('common.network_connecting_title', 'Соединение...')}
            </span>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              const next = !isMicMuted;
              setIsMicMuted(next);
              if (!next && isDeafened) {
                setIsDeafened(false);
              }
              callSoundService.play(next ? 'mute' : 'unmute');
            }}
            aria-label={isMicMuted ? t('discord.unmuteMicrophone', 'Включить микрофон') : t('discord.muteMicrophone', 'Отключить микрофон')}
            className="dock-btn flex items-center justify-center m-0 bg-transparent transition-colors duration-150 border-none outline-none select-none cursor-pointer"
            style={{
              WebkitTapHighlightColor: 'transparent',
              width: '32px',
              height: '32px',
              borderRadius: '5px',
              outline: 'none',
              boxShadow: 'none',
              border: 'none',
              color: 'var(--accent-on-color, #ffffff)',
            }}
          >
            <MicToggleIcon muted={isMicMuted} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              const next = !isDeafened;
              setIsDeafened(next);
              if (next) {
                setIsMicMuted(true);
              } else {
                setIsMicMuted(false);
              }
              callSoundService.play(next ? 'mute' : 'unmute');
            }}
            aria-label={isDeafened ? t('discord.undeafenAudio', 'Включить звук') : t('discord.deafenAudio', 'Заглушить звук')}
            className="dock-btn flex items-center justify-center m-0 bg-transparent transition-colors duration-150 border-none outline-none select-none cursor-pointer"
            style={{
              WebkitTapHighlightColor: 'transparent',
              width: '32px',
              height: '32px',
              borderRadius: '5px',
              outline: 'none',
              boxShadow: 'none',
              border: 'none',
              color: 'var(--accent-on-color, #ffffff)',
            }}
          >
            <HeadphonesToggleIcon muted={isDeafened} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              if (onOpenSettings) {
                onOpenSettings();
              } else {
                useChatStore.getState().openSettings('main');
              }
            }}
            aria-label={t('discord.userSettings', 'Настройки пользователя')}
            className="dock-btn flex items-center justify-center m-0 bg-transparent transition-colors duration-150 border-none outline-none select-none cursor-pointer"
            style={{
              WebkitTapHighlightColor: 'transparent',
              width: '32px',
              height: '32px',
              borderRadius: '5px',
              outline: 'none',
              boxShadow: 'none',
              border: 'none',
              color: 'var(--accent-on-color, #ffffff)',
            }}
          >
            <GearIcon />
          </button>
        </div>
      </div>
    </div>
  );
};
