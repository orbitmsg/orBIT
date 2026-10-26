import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Smile, MessageSquare, Phone, Sticker } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import { Block, M3Switch, MD3 } from './SettingsShared';

export const EnergySettingsScreen: React.FC = () => {
  const { t } = useTranslation();

  const stickersAutoplayPanel = useChatStore((s) => s.stickersAutoplayPanel);
  const stickersAutoplayChat = useChatStore((s) => s.stickersAutoplayChat);
  const setStickersAutoplayPanel = useChatStore((s) => s.setStickersAutoplayPanel);
  const setStickersAutoplayChat = useChatStore((s) => s.setStickersAutoplayChat);

  const chatAutoPlayVideos = useChatStore((s) => s.chatAutoPlayVideos);
  const setChatAutoPlayVideos = useChatStore((s) => s.setChatAutoPlayVideos);
  const chatElementAnimations = useChatStore((s) => s.chatElementAnimations);
  const setChatElementAnimations = useChatStore((s) => s.setChatElementAnimations);

  const callAnimationsEnabled = useChatStore((s) => s.callAnimationsEnabled);
  const setCallAnimationsEnabled = useChatStore((s) => s.setCallAnimationsEnabled);

  const [isStickersOpen, setIsStickersOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const stickersCount = (stickersAutoplayPanel ? 1 : 0) + (stickersAutoplayChat ? 1 : 0);
  const chatCount = (chatAutoPlayVideos ? 1 : 0) + (chatElementAnimations ? 1 : 0);

  const handleToggleStickers = () => {
    const next = stickersCount === 0;
    setStickersAutoplayPanel(next);
    setStickersAutoplayChat(next);
  };

  const handleToggleChat = () => {
    const next = chatCount === 0;
    setChatAutoPlayVideos(next);
    setChatElementAnimations(next);
  };

  const handleToggleCalls = () => {
    setCallAnimationsEnabled(!callAnimationsEnabled);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ padding: '0 0 32px' }}
    >
      <Block style={{ marginBottom: 12 }}>
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              minHeight: '48px',
              boxSizing: 'border-box',
            }}
          >
            <div
              onClick={() => setIsStickersOpen((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flex: 1,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <Sticker size={20} color={MD3.onSurface} style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '15px', fontWeight: 500, color: MD3.onSurface }}>
                  {t('energy.stickers_animations', 'Анимация стикеров')}
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: MD3.onSurfaceVar,
                  }}
                >
                  {stickersCount}/2
                </span>
                <motion.div
                  animate={{ rotate: isStickersOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChevronDown size={16} color={MD3.onSurfaceVar} />
                </motion.div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <M3Switch checked={stickersCount > 0} onChange={handleToggleStickers} />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {isStickersOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden', paddingBottom: '6px' }}
              >
                <div
                  onClick={() => setStickersAutoplayPanel(!stickersAutoplayPanel)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 16px 8px 48px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  className="hover:bg-white/[0.04]"
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: stickersAutoplayPanel ? 'var(--accent-color, #7C3AED)' : 'transparent',
                      border: stickersAutoplayPanel ? 'none' : '2px solid rgba(255, 255, 255, 0.35)',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    {stickersAutoplayPanel && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: '14px', color: stickersAutoplayPanel ? MD3.onSurface : MD3.onSurfaceVar }}>
                    {t('energy.stickers_autoplay_panel', 'Автозапуск в боковой панели')}
                  </span>
                </div>

                <div
                  onClick={() => setStickersAutoplayChat(!stickersAutoplayChat)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 16px 8px 48px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  className="hover:bg-white/[0.04]"
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: stickersAutoplayChat ? 'var(--accent-color, #7C3AED)' : 'transparent',
                      border: stickersAutoplayChat ? 'none' : '2px solid rgba(255, 255, 255, 0.35)',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    {stickersAutoplayChat && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: '14px', color: stickersAutoplayChat ? MD3.onSurface : MD3.onSurfaceVar }}>
                    {t('energy.stickers_autoplay_chat', 'Автозапуск в чате')}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            minHeight: '48px',
            boxSizing: 'border-box',
            opacity: 0.45,
            cursor: 'not-allowed',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Smile size={20} color={MD3.onSurface} style={{ flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: MD3.onSurface }}>
                {t('energy.emoji_animations', 'Анимация эмодзи')}
              </span>
              <span style={{ fontSize: '12px', color: MD3.onSurfaceVar }}>
                {t('energy.not_available', 'Пока недоступно')}
              </span>
            </div>
          </div>
          <M3Switch checked={false} onChange={() => {}} disabled={true} />
        </div>

        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              minHeight: '48px',
              boxSizing: 'border-box',
            }}
          >
            <div
              onClick={() => setIsChatOpen((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flex: 1,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <MessageSquare size={20} color={MD3.onSurface} style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '15px', fontWeight: 500, color: MD3.onSurface }}>
                  {t('energy.chat_animations', 'Анимации в чатах')}
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: MD3.onSurfaceVar,
                  }}
                >
                  {chatCount}/2
                </span>
                <motion.div
                  animate={{ rotate: isChatOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChevronDown size={16} color={MD3.onSurfaceVar} />
                </motion.div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <M3Switch checked={chatCount > 0} onChange={handleToggleChat} />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {isChatOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden', paddingBottom: '6px' }}
              >
                <div
                  onClick={() => setChatAutoPlayVideos(!chatAutoPlayVideos)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 16px 8px 48px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  className="hover:bg-white/[0.04]"
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: chatAutoPlayVideos ? 'var(--accent-color, #7C3AED)' : 'transparent',
                      border: chatAutoPlayVideos ? 'none' : '2px solid rgba(255, 255, 255, 0.35)',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    {chatAutoPlayVideos && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: '14px', color: chatAutoPlayVideos ? MD3.onSurface : MD3.onSurfaceVar }}>
                    {t('energy.autoplay_videos', 'Проигрывать видео')}
                  </span>
                </div>

                <div
                  onClick={() => setChatElementAnimations(!chatElementAnimations)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 16px 8px 48px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  className="hover:bg-white/[0.04]"
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: chatElementAnimations ? 'var(--accent-color, #7C3AED)' : 'transparent',
                      border: chatElementAnimations ? 'none' : '2px solid rgba(255, 255, 255, 0.35)',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    {chatElementAnimations && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: '14px', color: chatElementAnimations ? MD3.onSurface : MD3.onSurfaceVar }}>
                    {t('energy.element_animations', 'Анимации элементов')}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            minHeight: '48px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Phone size={20} color={MD3.onSurface} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '15px', fontWeight: 500, color: MD3.onSurface }}>
              {t('energy.call_animations', 'Анимации звонков')}
            </span>
          </div>
          <M3Switch checked={callAnimationsEnabled} onChange={handleToggleCalls} />
        </div>
      </Block>
    </motion.div>
  );
};
