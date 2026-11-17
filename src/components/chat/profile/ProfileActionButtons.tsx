import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Trash2, LogOut, Copy, Check } from 'lucide-react';
import type { Chat } from '../../../store/useChatStore';

interface ProfileActionButtonsProps {
  chat: Chat;
  chatId: string;
  isGroup: boolean;
  isGroupAdmin: boolean;
  isGroupOwner: boolean;
  isChannel: boolean;
  soundAnimTrigger: number;
  voiceCallsEnabled: boolean;
  copiedKey: boolean;
  onChatClick: () => void;
  onSoundClick: () => void;
  onCallClick: () => void;
  onCopyKey: () => void;
  onOpenDeleteGroup: (mode: 'delete' | 'leave') => void;
}

export const ProfileActionButtons: React.FC<ProfileActionButtonsProps> = ({
  chat,
  chatId,
  isGroup,
  isGroupAdmin,
  isGroupOwner,
  isChannel,
  soundAnimTrigger,
  voiceCallsEnabled,
  copiedKey,
  onChatClick,
  onSoundClick,
  onCallClick,
  onCopyKey,
  onOpenDeleteGroup,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px', padding: '0 12px', width: '100%', boxSizing: 'border-box', flexWrap: 'wrap' }}>
      <button
        onClick={onChatClick}
        aria-label={t('profile.chat')}
        style={{
          flex: '1 1 0',
          minWidth: '64px',
          maxWidth: '92px',
          height: '56px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          background: 'var(--surface-container, #282828)',
          border: 'none',
          borderRadius: '10px',
          padding: '0',
          color: 'var(--text-main)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
          <path fill="var(--text-dim, #8e8e93)" stroke="var(--text-dim, #8e8e93)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 21a9 9 0 1 0-7.605-4.185L3 21l4.185-1.395A8.96 8.96 0 0 0 12 21"/>
        </svg>
        <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('profile.chat')}</span>
      </button>

      <button
        onClick={onSoundClick}
        aria-label={t('profile.sound')}
        style={{
          flex: '1 1 0',
          minWidth: '60px',
          maxWidth: '80px',
          height: '56px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          background: 'var(--surface-container, #282828)',
          border: 'none',
          borderRadius: '10px',
          padding: '0',
          color: 'var(--text-main)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <motion.div
          key={soundAnimTrigger}
          animate={
            soundAnimTrigger > 0
              ? {
                  scale: [0.85, 1.15, 1],
                  rotate: chat?.muted ? [-14, 14, 0] : [14, -14, 0],
                }
              : { scale: 1, rotate: 0 }
          }
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {chat?.muted ? (
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="none">
              <path
                fill="var(--text-dim, #8e8e93)"
                stroke="var(--text-dim, #8e8e93)"
                strokeWidth="1.5"
                d="M12 3.398a5 5 0 00-5 5v2c0 .758-.442 1.505-1.005 2.012A3 3 0 008 17.642h8a3 3 0 002.005-5.232C17.442 11.903 17 11.156 17 10.398v-2a5 5 0 00-5-5z"
              />
              <path
                stroke="var(--text-dim, #8e8e93)"
                strokeLinecap="round"
                strokeWidth="1.8"
                d="M14.39 20.312l-.043.01a9.714 9.714 0 01-4.67-.01"
              />
              <path
                stroke="var(--surface-container, #282828)"
                strokeLinecap="round"
                strokeWidth="3.5"
                d="M19 5L5 19"
              />
              <path
                stroke="var(--text-dim, #8e8e93)"
                strokeLinecap="round"
                strokeWidth="2"
                d="M19 5L5 19"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="none">
              <path
                fill="var(--text-dim, #8e8e93)"
                stroke="var(--text-dim, #8e8e93)"
                strokeWidth="1.5"
                d="M12 3.398a5 5 0 00-5 5v2c0 .758-.442 1.505-1.005 2.012A3 3 0 008 17.642h8a3 3 0 002.005-5.232C17.442 11.903 17 11.156 17 10.398v-2a5 5 0 00-5-5z"
              />
              <path
                stroke="var(--text-dim, #8e8e93)"
                strokeLinecap="round"
                strokeWidth="1.8"
                d="M14.39 20.312l-.043.01a9.714 9.714 0 01-4.67-.01"
              />
            </svg>
          )}
        </motion.div>
        <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('profile.sound')}</span>
      </button>

      {isGroup ? (
        isGroupAdmin ? (
          <>
            <button
              onClick={() => onOpenDeleteGroup(isGroupOwner ? 'delete' : 'leave')}
              aria-label={t('common.delete', 'Удалить')}
              style={{
                flex: '1 1 0',
                minWidth: '60px',
                maxWidth: '80px',
                height: '56px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                background: 'var(--surface-container, #282828)',
                border: 'none',
                borderRadius: '10px',
                padding: '0',
                color: 'var(--text-main)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <Trash2 size={20} style={{ color: 'var(--text-dim, #8e8e93)' }} />
              <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('common.delete', 'Удалить')}</span>
            </button>

            <button
              onClick={onCallClick}
              disabled={!voiceCallsEnabled}
              aria-label={t('profile.call')}
              style={{
                flex: '1 1 0',
                minWidth: '60px',
                maxWidth: '80px',
                height: '56px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                background: 'var(--surface-container, #282828)',
                border: 'none',
                borderRadius: '10px',
                padding: '0',
                color: 'var(--text-main)',
                cursor: !voiceCallsEnabled ? 'not-allowed' : 'pointer',
                opacity: !voiceCallsEnabled ? 0.4 : 1,
                outline: 'none',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 42 42" fill="var(--text-dim, #8e8e93)">
                <path d="M15.562 20.766c-1.328-1.922-2.118-4.241-2.281-4.438c1.945-1.356 5.749-3.06 5.962-5.505c.271-3.159-5.081-9.763-6.107-9.823c-2.808.03-7.947 4.782-8.556 6.218c-1.132 2.969-.571 5.732 1.375 9.732c2.478 5.95 11.682 17.237 16.947 20.78c3.484 2.674 6.029 3.724 9.068 3.09c1.413-.268 6.516-4.455 7.027-7.286c.125-1.05-5.807-8.011-8.875-8.287c-2.382-.22-4.666 3.346-6.303 5.089c-.163-.208-1.559-1.297-3.057-3.021c-1.95-2.049-3.762-4.456-5.2-6.549" />
              </svg>
              <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('profile.call')}</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => onOpenDeleteGroup('leave')}
            aria-label={t('groupSettings.leave', 'Покинуть')}
            style={{
              flex: '1 1 0',
              minWidth: '60px',
              maxWidth: '80px',
              height: '56px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'var(--surface-container, #282828)',
              border: 'none',
              borderRadius: '10px',
              padding: '0',
              color: 'var(--text-main)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <LogOut size={20} style={{ color: 'var(--text-dim, #8e8e93)' }} />
            <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('groupSettings.leave', 'Покинуть')}</span>
          </button>
        )
      ) : isChannel ? (
        <button
          onClick={onCopyKey}
          aria-label={copiedKey ? 'Скопирован' : 'Ключ'}
          style={{
            flex: '1 1 0',
            minWidth: '64px',
            maxWidth: '92px',
            height: '56px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            background: 'var(--surface-container, #282828)',
            border: 'none',
            borderRadius: '10px',
            padding: '0',
            color: 'var(--text-main)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {copiedKey ? (
            <Check size={20} style={{ color: 'var(--accent-color, #9b7dd4)' }} />
          ) : (
            <Copy size={20} style={{ color: 'var(--text-dim, #8e8e93)' }} />
          )}
          <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{copiedKey ? t('profile.copied', 'Скопирован') : 'ID'}</span>
        </button>
      ) : (
        <button
          onClick={onCallClick}
          disabled={!voiceCallsEnabled || chatId === 'notes'}
          aria-label={t('profile.call')}
          style={{
            flex: '1 1 0',
            minWidth: '64px',
            maxWidth: '92px',
            height: '56px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            background: 'var(--surface-container, #282828)',
            border: 'none',
            borderRadius: '10px',
            padding: '0',
            color: 'var(--text-main)',
            cursor: (!voiceCallsEnabled || chatId === 'notes') ? 'not-allowed' : 'pointer',
            opacity: (!voiceCallsEnabled || chatId === 'notes') ? 0.4 : 1,
            outline: 'none',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 42 42" fill="var(--text-dim, #8e8e93)">
            <path d="M15.562 20.766c-1.328-1.922-2.118-4.241-2.281-4.438c1.945-1.356 5.749-3.06 5.962-5.505c.271-3.159-5.081-9.763-6.107-9.823c-2.808.03-7.947 4.782-8.556 6.218c-1.132 2.969-.571 5.732 1.375 9.732c2.478 5.95 11.682 17.237 16.947 20.78c3.484 2.674 6.029 3.724 9.068 3.09c1.413-.268 6.516-4.455 7.027-7.286c.125-1.05-5.807-8.011-8.875-8.287c-2.382-.22-4.666 3.346-6.303 5.089c-.163-.208-1.559-1.297-3.057-3.021c-1.95-2.049-3.762-4.456-5.2-6.549" />
          </svg>
          <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('profile.call')}</span>
        </button>
      )}
    </div>
  );
};
