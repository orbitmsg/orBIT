import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useChatStore } from '../../store/useChatStore';
import { M3Switch } from './SettingsScreen';

interface SoundSettingsModalProps {
  chatId: string;
  onClose: () => void;
  position: { top: number; left: number };
  isMobileView?: boolean;
}

export const SoundSettingsModal = ({ chatId, onClose, position, isMobileView = false }: SoundSettingsModalProps) => {
  const { t } = useTranslation();
  const chat = useChatStore((state) => state.chats.find(c => c.id === chatId));
  const toggleChatMuted = useChatStore((state) => state.toggleChatMuted);
  const toggleChatNotifications = useChatStore((state) => state.toggleChatNotifications);

  if (!chat) return null;

  const isMuted = chat.muted ?? false;
  const notificationsEnabled = chat.notificationsEnabled ?? true;

  const contentStyle: React.CSSProperties = isMobileView
    ? {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    : {
        position: 'fixed',
        top: position.top + 4,
        left: position.left,
        transform: 'none',
      };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        backgroundColor: 'transparent',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{
          ...contentStyle,
          backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
          borderRadius: '10px',
          border: 'none',
          padding: '16px 20px',
          color: 'var(--text-main, #fff)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          width: '280px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 0',
              cursor: 'pointer',
            }}
            onClick={() => toggleChatMuted(chatId)}
          >
            <span style={{ fontSize: '13.5px', fontWeight: 500 }}>
              {isMuted ? (t('sound_settings.enable_sound') || 'Включить звук') : (t('sound_settings.disable_sound') || 'Выключить звук')}
            </span>
            <M3Switch checked={!isMuted} onChange={() => toggleChatMuted(chatId)} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 0',
              cursor: 'pointer',
            }}
            onClick={() => toggleChatNotifications(chatId)}
          >
            <span style={{ fontSize: '13.5px', fontWeight: 500 }}>
              {notificationsEnabled ? (t('sound_settings.disable_notifications') || 'Выключить уведомления') : (t('sound_settings.enable_notifications') || 'Включить уведомления')}
            </span>
            <M3Switch checked={notificationsEnabled} onChange={() => toggleChatNotifications(chatId)} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};