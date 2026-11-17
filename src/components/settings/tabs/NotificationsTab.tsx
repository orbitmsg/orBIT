import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Volume2, Bell } from 'lucide-react';
import { NotificationMonitor, NotificationCountSelector } from '../NotificationPreview';
import {
  Block,
  SettingsRow,
  SectionHeader,
  M3Switch,
  TaskbarIcon,
  NotificationSenderAvatar,
  OrbitaLogoAvatar,
  TogglePill,
} from '../SettingsShared';
import { BubbleSlider } from '../AppearanceSettings';
import type { NotificationPosition } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';

export interface NotificationsTabProps {
  notificationsEnabled: boolean;
  setNotificationsEnabled: (val: boolean) => void;
  notificationFlashTaskbar: boolean;
  setNotificationFlashTaskbar: (val: boolean) => void;
  notificationSoundEnabled: boolean;
  setNotificationSoundEnabled: (val: boolean) => void;
  notificationVolume: number;
  setNotificationVolume: (val: number) => void;
  notificationShowName: boolean;
  setNotificationShowName: (val: boolean) => void;
  notificationShowText: boolean;
  setNotificationShowText: (val: boolean) => void;
  notificationNativeWindows: boolean;
  setNotificationNativeWindows: (val: boolean) => void;
  notificationRespectFocus: boolean;
  setNotificationRespectFocus: (val: boolean) => void;
  notificationCount: number;
  setNotificationCount: (val: number) => void;
  notificationPosition: NotificationPosition;
  setNotificationPosition: (val: NotificationPosition) => void;
}

export const NotificationsTab = ({
  notificationsEnabled,
  setNotificationsEnabled,
  notificationFlashTaskbar,
  setNotificationFlashTaskbar,
  notificationSoundEnabled,
  setNotificationSoundEnabled,
  notificationVolume,
  setNotificationVolume,
  notificationShowName,
  setNotificationShowName,
  notificationShowText,
  setNotificationShowText,
  notificationNativeWindows,
  setNotificationNativeWindows,
  notificationRespectFocus,
  setNotificationRespectFocus,
  notificationCount,
  setNotificationCount,
  notificationPosition,
  setNotificationPosition,
}: NotificationsTabProps) => {
  const { t } = useTranslation();
  const userNickname = useAuthStore((s) => s.nickname);
  return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            <SectionHeader title={t('settings.general_settings') || 'Общие настройки'} />
            <Block style={{ marginBottom: 4 }}>
              <SettingsRow
                label={t('settings.desktop_notifications') || 'Уведомления на рабочем столе'}
                icon={<Bell size={18} />}
                right={
                  <M3Switch
                    checked={notificationsEnabled}
                    onChange={() => setNotificationsEnabled(!notificationsEnabled)}
                  />
                }
              />
              <SettingsRow
                label={t('settings.flash_taskbar') || 'Анимация иконки на панели задач'}
                icon={<TaskbarIcon />}
                right={
                  <M3Switch
                    checked={notificationFlashTaskbar}
                    onChange={() => setNotificationFlashTaskbar(!notificationFlashTaskbar)}
                  />
                }
              />
              <SettingsRow
                label={t('settings.sound') || 'Звук'}
                icon={<Volume2 size={18} />}
                right={
                  <M3Switch
                    checked={notificationSoundEnabled}
                    onChange={() => setNotificationSoundEnabled(!notificationSoundEnabled)}
                  />
                }
              />
            </Block>

            <BubbleSlider
              value={notificationVolume}
              onChangeCommitted={setNotificationVolume}
              min={0}
              max={100}
              step={1}
              label={t('settings.volume') || 'Громкость'}
              formatValue={(v) => `${Math.round(v)}%`}
              valuePlacement="right"
              containerStyle={{ marginTop: 22 }}
              ariaLabel={t('settings.volume') || 'Громкость'}
            />

            <div
              style={{
                backgroundColor: 'var(--surface-container, var(--bg-secondary, #1c182a))',
                borderRadius: '10px',
                padding: '12px 16px',
                margin: '4px 10px 18px 10px',
                width: 'calc(100% - 20px)',
                minHeight: '82px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                border: 'none',
                boxShadow: 'none',
                boxSizing: 'border-box',
                fontFamily: 'var(--main-font), "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
              }}
            >
              {notificationShowName ? <NotificationSenderAvatar /> : <OrbitaLogoAvatar />}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px' }}>
                <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-main, #ffffff)', lineHeight: 1.25 }}>
                  {notificationShowName ? (userNickname || t('settings.preview_sender_name') || 'Saizzi') : (t('settings.hidden_name') || 'orBIT')}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-dim, #a89ec4)', marginTop: '2px', lineHeight: 1.35 }}>
                  {notificationShowText ? (t('settings.preview_message_text') || 'А ты любишь пингвинов?') : (t('settings.new_message') || 'Новое сообщение')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', margin: '0 20px 24px 20px' }}>
              <TogglePill
                active={notificationShowName}
                label={t('settings.name') || 'Имя'}
                onClick={() => setNotificationShowName(!notificationShowName)}
              />
              <TogglePill
                active={notificationShowText}
                label={t('settings.text') || 'Текст'}
                onClick={() => setNotificationShowText(!notificationShowText)}
              />
            </div>

            <SectionHeader title={t('settings.system_integration') || 'Взаимодействие с системой'} style={{ marginTop: 8 }} />
            <Block style={{ marginBottom: 8 }}>
              <SettingsRow
                label={t('settings.use_windows_notifications') || 'Использовать уведомления Windows'}
                right={
                  <M3Switch
                    checked={notificationNativeWindows}
                    onChange={() => setNotificationNativeWindows(!notificationNativeWindows)}
                  />
                }
              />
              <SettingsRow
                label={t('settings.respect_focus_assist') || 'Соблюдать режим фокусирования'}
                right={
                  <M3Switch
                    checked={notificationRespectFocus}
                    onChange={() => setNotificationRespectFocus(!notificationRespectFocus)}
                  />
                }
              />
            </Block>

            <SectionHeader title={t('settings.screen_position') || 'Расположение на экране'} style={{ marginTop: 16 }} />
            <div style={{ margin: '8px 0 16px 0' }}>
              <NotificationMonitor
                count={notificationCount}
                position={notificationPosition}
                onPositionChange={setNotificationPosition}
              />
            </div>

            <SectionHeader title={t('settings.notification_count') || 'Количество уведомлений'} />
            <div style={{ margin: '4px 0 24px 0' }}>
              <NotificationCountSelector
                count={notificationCount}
                onChange={setNotificationCount}
              />
            </div>
          </motion.div>
  );
};
