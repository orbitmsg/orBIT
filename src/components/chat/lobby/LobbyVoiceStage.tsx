import React from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Monitor, PhoneOff, Volume2 } from 'lucide-react';
import { useCallStore } from '../../../store/useCallStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Avatar } from '../../common/Avatar';

export interface LobbyVoiceStageProps {
  channelName: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

const formatDuration = (totalSeconds: number) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const LobbyVoiceStage: React.FC<LobbyVoiceStageProps> = ({
  channelName,
  onConnect,
  onDisconnect,
}) => {
  const { t } = useTranslation();
  const nickname = useAuthStore((s) => s.nickname) || 'User';
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const callState = useCallStore((s) => s.callState);
  const duration = useCallStore((s) => s.duration);
  const isMicEnabled = useCallStore((s) => s.isMicEnabled);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);
  const toggleMic = useCallStore((s) => s.toggleMic);
  const toggleScreenShare = useCallStore((s) => s.toggleScreenShare);

  const isConnected = callState === 'connected';

  return (
    <div
      className="flex-1 flex flex-col h-full w-full select-none relative overflow-hidden"
      style={{ backgroundColor: 'transparent' }}
    >
      <div
        className="h-12 px-4 flex items-center justify-between shrink-0 border-b border-white/5"
        style={{ backgroundColor: 'transparent' }}
      >
        <div className="flex items-center gap-2">
          <Volume2 size={20} className="text-[#949ba4]" />
          <span className="font-bold text-[15px] text-white">
            {channelName}
          </span>
        </div>
        {isConnected && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/30 border border-white/5">
            <span className="w-2 h-2 rounded-full bg-[#23a55a] animate-pulse" />
            <span className="text-xs font-mono font-semibold text-white/90">
              {formatDuration(duration)}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {isConnected ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center p-1 transition-all duration-300"
                style={{
                  border: '3px solid #23a55a',
                  boxShadow: '0 0 20px rgba(35, 165, 90, 0.4)',
                }}
              >
                <Avatar
                  src={avatarUrl}
                  alt={nickname}
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              {!isMicEnabled && (
                <div
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center bg-[#f23f43] text-white shadow-md"
                >
                  <MicOff size={16} />
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-1">
              <span className="text-base font-bold text-white">
                {nickname}
              </span>
              <span className="text-xs font-mono text-[#23a55a] font-medium">
                {t('lobby.voice_duration', 'Время в сети')}: {formatDuration(duration)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center bg-white/5 text-[#949ba4]">
              <Volume2 size={40} />
            </div>
            <h3 className="text-lg font-bold text-white m-0">
              {channelName}
            </h3>
            <p className="text-xs text-[#949ba4] m-0 leading-relaxed">
              {t('lobby.voice_connect_hint', 'Нажмите кнопку ниже, чтобы войти в голосовой канал и начать общение.')}
            </p>
            <button
              type="button"
              onClick={onConnect}
              aria-label={t('lobby.connect_voice', 'Подключиться к голосовому каналу')}
              className="mt-2 px-6 py-2.5 rounded-lg bg-[#23a55a] hover:bg-[#1f9350] active:bg-[#1a7f45] text-white font-semibold text-sm transition-colors cursor-pointer border-none outline-none shadow-md"
            >
              {t('lobby.connect_voice', 'Подключиться')}
            </button>
          </div>
        )}
      </div>

      {isConnected && (
        <div
          className="h-16 px-6 flex items-center justify-center gap-3 shrink-0 border-t border-black/20"
          style={{ backgroundColor: 'var(--surface-container, #18181a)' }}
        >
          <button
            type="button"
            onClick={() => toggleMic()}
            aria-label={isMicEnabled ? t('discord.muteMicrophone', 'Отключить микрофон') : t('discord.unmuteMicrophone', 'Включить микрофон')}
            className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-colors border-none outline-none ${
              isMicEnabled ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-[#f23f43] text-white hover:bg-[#da373b]'
            }`}
          >
            {isMicEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          <button
            type="button"
            onClick={() => toggleScreenShare()}
            aria-label={t('call.screen_share', 'Демонстрация экрана')}
            className={`w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-colors border-none outline-none ${
              isScreenSharing ? 'bg-[#5865F2] text-white hover:bg-[#4752c4]' : 'bg-white/10 text-white hover:bg-white/15'
            }`}
          >
            <Monitor size={20} />
          </button>

          <button
            type="button"
            onClick={onDisconnect}
            aria-label={t('call.disconnect', 'Отключиться')}
            className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-colors border-none outline-none bg-[#f23f43] hover:bg-[#da373b] active:bg-[#a1282b] text-white"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      )}
    </div>
  );
};
