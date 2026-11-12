import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check, Download, RefreshCw, CheckCircle2 } from 'lucide-react';
import { MD3, PreferencesGroup, PreferenceSwitch, HotkeySwitch } from '../SettingsShared';

export interface PreferencesTabProps {
  autoLaunch: boolean;
  setAutoLaunch: (val: boolean) => void;
  hideMenuBar: boolean;
  setHideMenuBar: (val: boolean) => void;
  showInSystemTray: boolean;
  setShowInSystemTray: (val: boolean) => void;
  hasMicrophonePermission: boolean;
  setMicrophonePermission: (val: boolean) => void;
  hasCameraPermission: boolean;
  setCameraPermission: (val: boolean) => void;
  autoUpdate: boolean;
  handleToggleAutoUpdate: () => void;
  updateStatus: { status: string; version?: string; percent?: number; error?: string };
  handleRestartAndInstall: () => void;
  handleDownloadUpdate: () => void;
  handleCheckForUpdates: () => void;
  isCheckingUpdate: boolean;
  sendOnEnter: boolean;
  setSendOnEnter: (val: boolean) => void;
  appVersion: string;
}

export const PreferencesTab = ({
  autoLaunch,
  setAutoLaunch,
  hideMenuBar,
  setHideMenuBar,
  showInSystemTray,
  setShowInSystemTray,
  hasMicrophonePermission,
  setMicrophonePermission,
  hasCameraPermission,
  setCameraPermission,
  autoUpdate,
  handleToggleAutoUpdate,
  updateStatus,
  handleRestartAndInstall,
  handleDownloadUpdate,
  handleCheckForUpdates,
  isCheckingUpdate,
  sendOnEnter,
  setSendOnEnter,
  appVersion,
}: PreferencesTabProps) => {
  const { t } = useTranslation();
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            style={{ padding: '0 0 32px' }}
          >
            <PreferencesGroup title={t('settings.system_section')}>
              <PreferenceSwitch
                label={t('settings.open_at_login')}
                checked={autoLaunch}
                onChange={async () => {
                  const nextVal = !autoLaunch;
                  setAutoLaunch(nextVal);
                  if (typeof window !== 'undefined' && window.orbita?.setAutoLaunch) {
                    await window.orbita.setAutoLaunch(nextVal);
                  }
                }}
              />
              <PreferenceSwitch
                label={t('settings.hide_menu_bar')}
                checked={hideMenuBar}
                onChange={async () => {
                  const nextVal = !hideMenuBar;
                  setHideMenuBar(nextVal);
                  if (typeof window !== 'undefined' && window.orbita?.setHideMenuBar) {
                    await window.orbita.setHideMenuBar(nextVal);
                  }
                }}
              />
              <PreferenceSwitch
                label={t('settings.minimize_to_tray')}
                checked={showInSystemTray}
                onChange={async () => {
                  const nextVal = !showInSystemTray;
                  setShowInSystemTray(nextVal);
                  if (typeof window !== 'undefined' && window.orbita?.setShowInSystemTray) {
                    await window.orbita.setShowInSystemTray(nextVal);
                  }
                }}
              />
            </PreferencesGroup>

            <PreferencesGroup title={t('settings.permissions_section')}>
              <PreferenceSwitch
                label={t('settings.allow_microphone')}
                checked={hasMicrophonePermission}
                onChange={() => setMicrophonePermission(!hasMicrophonePermission)}
              />
              <PreferenceSwitch
                label={t('settings.allow_camera')}
                checked={hasCameraPermission}
                onChange={() => setCameraPermission(!hasCameraPermission)}
              />
            </PreferencesGroup>

            <PreferencesGroup title={t('settings.updates_section')}>
              <PreferenceSwitch
                label={t('settings.auto_download_updates')}
                checked={autoUpdate}
                onChange={handleToggleAutoUpdate}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 0',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: MD3.onSurfaceVar }}>
                    {t('settings.current_version')}: <span style={{ fontWeight: 600, color: MD3.onSurface }}>v{appVersion || '1.0.3'}</span>
                  </div>
                  {updateStatus.status === 'checking' && (
                    <div style={{ fontSize: 12, color: MD3.primary, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <RefreshCw size={13} style={{ animation: 'spin 1.5s linear infinite' }} />
                      {t('settings.checking_for_updates')}
                    </div>
                  )}
                  {updateStatus.status === 'not-available' && (
                    <div style={{ fontSize: 12, color: '#23a559', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={13} />
                      {t('settings.update_not_available')}
                    </div>
                  )}
                  {updateStatus.status === 'available' && (
                    <div style={{ fontSize: 12, color: MD3.primary, marginTop: 4 }}>
                      {t('settings.update_available')}{updateStatus.version ? ` v${updateStatus.version}` : ''}
                    </div>
                  )}
                  {updateStatus.status === 'downloading' && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('settings.update_downloading')}</span>
                        <span>{updateStatus.percent || 0}%</span>
                      </div>
                      <div style={{ width: '100%', height: 4, backgroundColor: 'var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${updateStatus.percent || 0}%`,
                            height: '100%',
                            backgroundColor: MD3.primary,
                            borderRadius: 2,
                            transition: 'width 0.2s ease',
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {updateStatus.status === 'downloaded' && (
                    <div style={{ fontSize: 12, color: '#23a559', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={14} />
                      {t('settings.update_downloaded')}
                    </div>
                  )}
                  {updateStatus.status === 'dev-mode' && (
                    <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 4 }}>
                      {t('settings.update_dev_mode')}
                    </div>
                  )}
                  {updateStatus.status === 'error' && (
                    <div style={{ fontSize: 12, color: '#e55353', marginTop: 4 }}>
                      {t('settings.update_error')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {updateStatus.status === 'downloaded' ? (
                    <button
                      type="button"
                      onClick={handleRestartAndInstall}
                      aria-label={t('settings.restart_and_install')}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        backgroundColor: MD3.primary,
                        color: 'var(--accent-on-color, #ffffff)',
                        fontSize: 12.5,
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        outline: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      <Check size={14} />
                      {t('settings.restart_and_install')}
                    </button>
                  ) : updateStatus.status === 'available' && !autoUpdate ? (
                    <button
                      type="button"
                      onClick={handleDownloadUpdate}
                      aria-label={t('settings.download_update')}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        backgroundColor: MD3.primary,
                        color: 'var(--accent-on-color, #ffffff)',
                        fontSize: 12.5,
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        outline: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      <Download size={14} />
                      {t('settings.download_update')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isCheckingUpdate || updateStatus.status === 'downloading'}
                      onClick={handleCheckForUpdates}
                      aria-label={t('settings.check_for_updates')}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        backgroundColor: MD3.surfaceVar,
                        color: MD3.onSurface,
                        fontSize: 12.5,
                        fontWeight: 600,
                        border: 'none',
                        cursor: isCheckingUpdate || updateStatus.status === 'downloading' ? 'default' : 'pointer',
                        outline: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity: isCheckingUpdate || updateStatus.status === 'downloading' ? 0.6 : 1,
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCheckingUpdate && updateStatus.status !== 'downloading') {
                          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = MD3.surfaceVar;
                      }}
                    >
                      <RefreshCw
                        size={13}
                        style={{
                          transform: isCheckingUpdate ? 'rotate(360deg)' : 'none',
                          transition: isCheckingUpdate ? 'transform 1s linear infinite' : 'none',
                        }}
                      />
                      {t('settings.check_for_updates')}
                    </button>
                  )}
                </div>
              </div>
            </PreferencesGroup>

            <PreferencesGroup title={t('settings.preferences_hotkeys')}>
              <HotkeySwitch
                enterLabel={t('settings.preferences_send_enter')}
                shiftEnterLabel={t('settings.preferences_send_shift_enter')}
                sendOnEnter={sendOnEnter}
                onChange={(value) => setSendOnEnter(value)}
              />
            </PreferencesGroup>
          </motion.div>
  );
};
