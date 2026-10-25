import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { ChevronRight } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import { securityService } from '../../services/securityService';
import { orbitaKeyService } from '../../services/orbitaKeyService';
import { MD3, Block, M3Switch } from './SettingsShared';
export const PrivacySettingsScreen = ({ onOpenPassword, onOpenBackup, onOpenOrbitaKey }: { onOpenPassword: () => void; onOpenBackup?: () => void; onOpenOrbitaKey?: () => void }) => {
  const { t } = useTranslation();
  const {
    voiceCallsEnabled,
    setVoiceCallsEnabled,
    readReceiptsEnabled,
    setReadReceiptsEnabled,
    typingIndicatorsEnabled,
    setTypingIndicatorsEnabled,
    linkPreviewsEnabled,
    setLinkPreviewsEnabled,
    anonymousForwardingEnabled,
    setAnonymousForwardingEnabled,
    screenProtectionEnabled,
    setScreenProtectionEnabled,
  } = useChatStore(useShallow((s) => ({
    voiceCallsEnabled: s.voiceCallsEnabled,
    setVoiceCallsEnabled: s.setVoiceCallsEnabled,
    readReceiptsEnabled: s.readReceiptsEnabled,
    setReadReceiptsEnabled: s.setReadReceiptsEnabled,
    typingIndicatorsEnabled: s.typingIndicatorsEnabled,
    setTypingIndicatorsEnabled: s.setTypingIndicatorsEnabled,
    linkPreviewsEnabled: s.linkPreviewsEnabled,
    setLinkPreviewsEnabled: s.setLinkPreviewsEnabled,
    anonymousForwardingEnabled: s.anonymousForwardingEnabled,
    setAnonymousForwardingEnabled: s.setAnonymousForwardingEnabled,
    screenProtectionEnabled: s.screenProtectionEnabled,
    setScreenProtectionEnabled: s.setScreenProtectionEnabled,
  })));

  const [isPasswordSet, setIsPasswordSet] = useState(() => securityService.isPasswordSet());
  const [isKeyConfigured, setIsKeyConfigured] = useState(() => orbitaKeyService.isKeyConfigured());

  useEffect(() => {
    setIsPasswordSet(securityService.isPasswordSet());
    setIsKeyConfigured(orbitaKeyService.isKeyConfigured());
  }, []);

  const handleToggleScreenProtection = async () => {
    const nextVal = !screenProtectionEnabled;
    setScreenProtectionEnabled(nextVal);
    if (typeof window !== 'undefined' && window.orbita?.setScreenProtection) {
      await window.orbita.setScreenProtection(nextVal);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ padding: '0 0 32px' }}
    >
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('settings.voice_calls_group', 'Звонки')}
        </div>
        <Block>
          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.voice_calls')}</div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.voice_calls_desc')}</div>
            </div>
            <M3Switch checked={voiceCallsEnabled} onChange={() => setVoiceCallsEnabled(!voiceCallsEnabled)} />
          </div>
        </Block>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('settings.communication_group', 'Общение')}
        </div>
        <Block>
          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.read_receipts_title')}</div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.read_receipts_desc')}</div>
            </div>
            <M3Switch checked={readReceiptsEnabled} onChange={() => setReadReceiptsEnabled(!readReceiptsEnabled)} />
          </div>

          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.typing_indicators_title')}</div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.typing_indicators_desc')}</div>
            </div>
            <M3Switch checked={typingIndicatorsEnabled} onChange={() => setTypingIndicatorsEnabled(!typingIndicatorsEnabled)} />
          </div>

          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.link_previews_title', 'Предпросмотр ссылок')}</div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.link_previews_desc', 'Генерировать предпросмотр для отправляемых ссылок (анонимно на стороне отправителя)')}</div>
            </div>
            <M3Switch checked={linkPreviewsEnabled} onChange={() => setLinkPreviewsEnabled(!linkPreviewsEnabled)} />
          </div>

          <div style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.anonymous_forwarding_title', 'Анонимная пересылка')}</div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.anonymous_forwarding_desc', 'Скрывать имя и ссылку на профиль автора при пересылке сообщений')}</div>
            </div>
            <M3Switch checked={anonymousForwardingEnabled} onChange={() => setAnonymousForwardingEnabled(!anonymousForwardingEnabled)} />
          </div>
        </Block>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('security.group_title', 'Безопасность')}
        </div>
        <Block>
          <div
            onClick={onOpenPassword}
            style={{
              padding: '14px 14px',
              borderRadius: '12px',
              margin: '2px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'background 150ms',
              backgroundColor: 'transparent',
              boxSizing: 'border-box',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(202,196,208,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>
                {isPasswordSet ? t('security.change_password', 'Изменить пароль') : t('security.set_password', 'Поставить пароль')}
              </div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
                {t('security.password_subtitle', 'Поставить пароль для разблокировки Orbita.')}
              </div>
            </div>
            <ChevronRight size={20} style={{ color: MD3.onSurfaceVar }} />
          </div>
          <div
            onClick={onOpenOrbitaKey}
            style={{
              padding: '14px 14px',
              borderRadius: '12px',
              margin: '2px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'background 150ms',
              backgroundColor: 'transparent',
              boxSizing: 'border-box',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(202,196,208,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{t('security.orbita_key_title', 'Orbita Key (USB-флешка)')}</span>
                {isKeyConfigured && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600 }}>
                    {t('security.orbita_key_active', 'Активен')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
                {isKeyConfigured
                  ? t('security.orbita_key_subtitle_configured', 'Ключ привязан. Разблокировка по флешке настроена.')
                  : t('security.orbita_key_subtitle_not_configured', 'Настроить разблокировку с помощью USB-накопителя.')}
              </div>
            </div>
            <ChevronRight size={20} style={{ color: MD3.onSurfaceVar }} />
          </div>
          <div style={{
            padding: '14px 14px',
            margin: '2px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>
                {t('settings.screen_protection')}
              </div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
                {t('settings.screen_protection_desc')}
              </div>
            </div>
            <M3Switch checked={screenProtectionEnabled} onChange={handleToggleScreenProtection} />
          </div>
        </Block>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('backup.main_group_title', 'Резервное копирование')}
        </div>
        <Block>
          <div
            onClick={onOpenBackup}
            style={{
              padding: '14px 14px',
              borderRadius: '12px',
              margin: '2px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'background 150ms',
              backgroundColor: 'transparent',
              boxSizing: 'border-box',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(202,196,208,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>
                {t('backup.create_title', 'Создать резервную копию')}
              </div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
                {t('backup.create_desc', 'Зашифровать аккаунт, настройки и список чатов секретной фразой из 12 слов.')}
              </div>
            </div>
            <ChevronRight size={20} style={{ color: MD3.onSurfaceVar }} />
          </div>
        </Block>
      </div>
    </motion.div>
  );
};
