import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hash, Volume2, X } from 'lucide-react';
import { lobbyService, type LobbyChannel } from '../../../services/lobbyService';

interface CreateLobbyChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  lobbyId: string;
  lobbyName: string;
  initialType?: 'text' | 'voice';
  onChannelCreated?: (channel: LobbyChannel) => void;
}

export const CreateLobbyChannelModal: React.FC<CreateLobbyChannelModalProps> = ({
  isOpen,
  onClose,
  lobbyId,
  lobbyName,
  initialType = 'text',
  onChannelCreated,
}) => {
  const { t } = useTranslation();
  const [channelType, setChannelType] = useState<'text' | 'voice'>(initialType);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanName) return;

    setIsLoading(true);
    setError(null);
    try {
      const channel = await lobbyService.createLobbyChannel(lobbyId, cleanName, channelType);
      onChannelCreated?.(channel);
      setName('');
      onClose();
    } catch (err: any) {
      setError(err?.message || t('common.error', 'Ошибка создания канала'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center p-4 select-none"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-[10px] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
          borderRadius: '10px',
          border: 'none',
          outline: 'none',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {t('lobby.create_channel_title', 'Создать канал')}
            </h2>
            <span className="text-[12px] text-[#949ba4]">
              {lobbyName}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Закрыть')}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#949ba4] hover:text-white hover:bg-white/5 transition-colors border-none outline-none cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="px-6 py-4 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-bold text-[#b5bac1] uppercase tracking-wider">
              {t('lobby.channel_type_label', 'Тип канала')}
            </span>

            <button
              type="button"
              onClick={() => setChannelType('text')}
              aria-label={t('lobby.channel_text', 'Текстовый канал')}
              className="flex items-center gap-3.5 p-3 rounded-[10px] transition-colors cursor-pointer border-none text-left outline-none"
              style={{
                backgroundColor: channelType === 'text' ? 'rgba(255, 255, 255, 0.08)' : '#2b2d31',
              }}
            >
              <div
                className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: channelType === 'text' ? '#5865F2' : 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                }}
              >
                <Hash size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-semibold text-white">
                  {t('lobby.channel_text', 'Текстовый')}
                </span>
                <span className="text-[12px] text-[#949ba4] leading-snug">
                  {t('lobby.channel_text_desc', 'Отправляйте сообщения, картинки, эмодзи и файлы')}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setChannelType('voice')}
              aria-label={t('lobby.channel_voice', 'Голосовой канал')}
              className="flex items-center gap-3.5 p-3 rounded-[10px] transition-colors cursor-pointer border-none text-left outline-none"
              style={{
                backgroundColor: channelType === 'voice' ? 'rgba(255, 255, 255, 0.08)' : '#2b2d31',
              }}
            >
              <div
                className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: channelType === 'voice' ? '#23a55a' : 'rgba(255, 255, 255, 0.05)',
                  color: '#ffffff',
                }}
              >
                <Volume2 size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-semibold text-white">
                  {t('lobby.channel_voice', 'Голосовой')}
                </span>
                <span className="text-[12px] text-[#949ba4] leading-snug">
                  {t('lobby.channel_voice_desc', 'Говорите голосом и общайтесь с друзьями в реалтайме')}
                </span>
              </div>
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="lobby-channel-name-input" className="text-[12px] font-bold text-[#b5bac1] uppercase tracking-wider">
              {t('lobby.channel_name_label', 'Название канала')}
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-[#949ba4]">
                {channelType === 'text' ? <Hash size={16} /> : <Volume2 size={16} />}
              </span>
              <input
                id="lobby-channel-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={channelType === 'text' ? 'новый-топик' : 'Голосовой'}
                autoFocus
                className="w-full pl-9 pr-3 py-2.5 rounded-[10px] text-[14px] font-medium text-white border-none outline-none"
                style={{
                  backgroundColor: '#1e1f22',
                }}
              />
            </div>
            {error && (
              <span className="text-[12px] text-red-400 font-medium">
                {error}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              aria-label={t('common.cancel', 'Отмена')}
              className="px-4 py-2 rounded-[10px] text-[13.5px] font-medium text-white hover:underline bg-transparent border-none outline-none cursor-pointer"
            >
              {t('common.cancel', 'Отмена')}
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              aria-label={t('lobby.create_channel_btn', 'Создать канал')}
              className="px-5 py-2.5 rounded-[10px] text-[13.5px] font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed border-none outline-none cursor-pointer"
              style={{
                backgroundColor: '#5865F2',
              }}
            >
              {isLoading ? '...' : t('lobby.create_channel_btn', 'Создать канал')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
