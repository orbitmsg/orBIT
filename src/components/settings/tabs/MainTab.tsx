import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronRight, User, Database, RotateCcw, Trash2 } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { DeveloperBadge } from '../../ui/DeveloperBadge';
import { SettingsFolderIcon } from '../ChatFoldersSettings';
import { MD3, Block, MenuItem, QrCodeMiniIcon, type TabId } from '../SettingsShared';
import { type ChatFolder } from '../../../store/useChatStore';

export interface MainTabProps {
  avatarUrl: string | null;
  nickname: string;
  userId: string | null;
  myCode: string;
  appVersion: string;
  proxyEnabled: boolean;
  activeProxy: any;
  folders: ChatFolder[];
  language: string | null;
  languageDisplayOptions: { value: string; label: string }[];
  pushTab: (tab: TabId) => void;
  triggerDevToast: () => void;
  handleCopyCode: () => void;
  setDeleteModalOpen: (val: boolean) => void;
}

export const MainTab = ({
  avatarUrl,
  nickname,
  userId,
  myCode,
  appVersion,
  proxyEnabled,
  activeProxy,
  folders,
  language,
  languageDisplayOptions,
  pushTab,
  triggerDevToast,
  handleCopyCode,
  setDeleteModalOpen,
}: MainTabProps) => {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div
        onClick={() => pushTab('myAccount')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '12px 14px 16px',
          margin: '2px 10px',
          width: 'calc(100% - 20px)',
          userSelect: 'none',
          cursor: 'pointer',
          borderRadius: '16px',
          boxSizing: 'border-box',
          transition: 'background 150ms',
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(202,196,208,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <div style={{ position: 'relative', width: '66px', height: '66px', flexShrink: 0 }}>
          <Avatar
            src={avatarUrl}
            alt={nickname || '?'}
            className="w-[66px] h-[66px] rounded-full"
            style={{ width: '66px', height: '66px' }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                fontSize: '16.5px',
                fontWeight: 700,
                color: MD3.onSurface,
                lineHeight: 1.2,
              }}
              className="truncate"
            >
              {nickname || 'User'}
            </span>
            <DeveloperBadge userId={userId || myCode} size={28} onClick={(e) => { e?.stopPropagation(); triggerDevToast(); }} />
          </div>

          <div
            onClick={(e) => { e.stopPropagation(); handleCopyCode(); }}
            style={{
              fontSize: '13.5px',
              fontWeight: 500,
              color: 'var(--accent-color, #9b7dd4)',
              wordBreak: 'break-all',
              cursor: 'pointer',
              lineHeight: 1.25,
              fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
            }}
          >
            {myCode || '------'}
          </div>
        </div>

        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); pushTab('qrCode'); }}
            aria-label={t('qrModal.title', 'Получить QR-код')}
            style={{
              background: 'transparent',
              border: 'none',
              color: MD3.onSurfaceVar,
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <QrCodeMiniIcon size={20} color={MD3.onSurfaceVar} />
          </button>
        </div>
      </div>

      <Block>
        <MenuItem
          icon={<User size={20} color={MD3.onSurface} />}
          label={t('settings.my_account', 'Мой аккаунт')}
          onClick={() => pushTab('myAccount')}
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }
          label={t('settings.privacy')}
          onClick={() => pushTab('security')}
        />


        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          }
          label={t('settings.connection') || 'Подключение'}
          onClick={() => pushTab('connection')}
          rightElement={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: proxyEnabled ? 'var(--accent-color, #9b7dd4)' : MD3.onSurfaceVar }}>
                {proxyEnabled ? (activeProxy ? activeProxy.name : 'Включено') : 'Прямое'}
              </span>
              <ChevronRight size={16} color={MD3.onSurfaceVar} />
            </div>
          }
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M14 6.5A1.5 1.5 0 0 0 12.5 5h-2.3l.249-.374c.358-.537.549-1.17.549-1.81v-.314a2.5 2.5 0 0 0-5 0v.314c0 .645.191 1.28.549 1.81L6.796 5h-2.3a1.5 1.5 0 0 0-1.5 1.5v4.43c0 1.06-.421 2.08-1.17 2.83l-.536.536a1 1 0 0 0 .707 1.707h9c.265 0 .52-.105.707-.293l.536-.536a6 6 0 0 0 1.76-4.24v-4.43zM4 8h9V6.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 1-.5-.5v-.197a1 1 0 0 1 .168-.555l.451-.677A2.27 2.27 0 0 0 10 2.811v-.314a1.5 1.5 0 0 0-3 0v.314c0 .448.132.885.381 1.26l.451.677c.11.164.168.357.168.555V5.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 0-.5.5zm7 7H8.99A3.5 3.5 0 0 0 10 12.54v-.04a.5.5 0 0 0-1 0v.04c0 1.19-.841 2.22-2.01 2.45l-.04.008H2l.536-.536a4.98 4.98 0 0 0 1.46-3.534v-1.93h9v1.93c0 1.33-.527 2.6-1.46 3.54l-.536.536z" clipRule="evenodd" />
            </svg>
          }
          label={t('settings.appearance')}
          onClick={() => pushTab('chats')}
        />

        <MenuItem
          icon={<SettingsFolderIcon size={20} style={{ color: MD3.onSurface }} />}
          label={t('settings.chat_folders', 'Папки с чатами')}
          onClick={() => pushTab('folders')}
          rightElement={
            folders.length > 0 ? (
              <span style={{ fontSize: 13, color: MD3.onSurfaceVar }}>
                {folders.length}
              </span>
            ) : undefined
          }
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          }
          label={t('settings.calls')}
          onClick={() => pushTab('calls')}
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.026 18.64h.011zm-.197-.124l.003-17.038l-.07.07L4.94 6.316a.7.7 0 0 1-.49.2H1.968a.65.65 0 0 0-.365.242c-.13.156-.207.388-.22.69l-.001 5.411c.01.19.074.334.203.463c.123.122.343.209.622.238h2.304c.183 0 .359.071.488.199zM10.207.019c.583.097.953.522 1.005 1.165V18.84l-.005.085c-.078.603-.462 1.032-1.067 1.074c-.451.03-.871-.137-1.252-.484L4.224 14.92l-2.082-.002c-.644-.06-1.166-.267-1.54-.64A2.04 2.04 0 0 0 0 12.896V7.42c.027-.606.2-1.12.532-1.522a2 2 0 0 1 1.27-.736l.105-.008h2.258L8.77.6c.428-.444.913-.668 1.437-.58m6.21 2.227C18.602 3.618 20 6.576 20 9.862s-1.398 6.243-3.582 7.615a.7.7 0 0 1-.955-.208a.675.675 0 0 1 .211-.94c1.754-1.102 2.943-3.618 2.943-6.467c0-2.85-1.189-5.366-2.943-6.468a.675.675 0 0 1-.211-.94a.7.7 0 0 1 .954-.208m-2.301 2.686c1.36 1.007 2.197 2.88 2.197 4.93 0 2.165-.935 4.128-2.42 5.084a.7.7 0 0 1-.957-.198a.675.675 0 0 1 .2-.943c1.068-.686 1.794-2.212 1.794-3.943 0-1.644-.654-3.108-1.645-3.841a.674.674 0 0 1-.137-.954a.7.7 0 0 1 .968-.135" />
            </svg>
          }
          label={t('common.notifications')}
          onClick={() => pushTab('notifications')}
        />

        <MenuItem
          icon={<Database size={20} color={MD3.onSurface} />}
          label={t('settings.data_memory')}
          onClick={() => pushTab('dataMemory')}
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 512 512" fill="currentColor">
              <path d="m478.33 433.6l-90-218a22 22 0 0 0-40.67 0l-90 218a22 22 0 1 0 40.67 16.79L316.66 406h102.67l18.33 44.39A22 22 0 0 0 458 464a22 22 0 0 0 20.32-30.4ZM334.83 362L368 281.65L401.17 362Zm-66.99-19.08a22 22 0 0 0-4.89-30.7c-.2-.15-15-11.13-36.49-34.73c39.65-53.68 62.11-114.75 71.27-143.49H330a22 22 0 0 0 0-44H214V70a22 22 0 0 0-44 0v20H54a22 22 0 0 0 0 44h197.25c-9.52 26.95-27.05 69.5-53.79 108.36c-31.41-41.68-43.08-68.65-43.17-68.87a22 22 0 0 0-40.58 17c.58 1.38 14.55 34.23 52.86 83.93c.92 1.19 1.83 2.35 2.74 3.51c-39.24 44.35-77.74 71.86-93.85 80.74a22 22 0 1 0 21.07 38.63c2.16-1.18 48.6-26.89 101.63-85.59c22.52 24.08 38 35.44 38.93 36.1a22 22 0 0 0 30.75-4.9Z" />
            </svg>
          }
          label={t('settings.language')}
          onClick={() => pushTab('language')}
          rightElement={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: MD3.onSurfaceVar }}>
                {languageDisplayOptions.find(o => o.value === language)?.label || language || '...'}
              </span>
              <ChevronRight size={16} color={MD3.onSurfaceVar} />
            </div>
          }
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          }
          label={t('settings.preferences')}
          onClick={() => pushTab('preferences')}
        />

        <MenuItem
          icon={<RotateCcw size={20} color={MD3.onSurface} />}
          label={t('backup.title')}
          onClick={() => pushTab('backup')}
        />
      </Block>

      <Block>
        <MenuItem
          icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>}
          label={t('common.help')}
          onClick={() => {
            if ((window as any).orbita?.openExternal) {
              (window as any).orbita.openExternal('https://github.com/saizzi/orbita-messenger');
            }
          }}
        />
        <MenuItem
          icon={<Trash2 size={20} style={{ color: MD3.error }} />}
          label={t('common.clear_identity')}
          onClick={() => setDeleteModalOpen(true)}
        />
      </Block>

      <div style={{ padding: '0px 20px 16px', textAlign: 'center', color: MD3.onSurfaceVar, fontSize: 12, userSelect: 'none', backgroundColor: 'transparent', marginTop: '8px' }}>
        <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '0.1em', color: MD3.onSurface, marginBottom: 4 }}>
          ORBITA MESSENGER
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {t('common.version', { version: appVersion || '0.1.996' })}
        </div>
      </div>
    </motion.div>
  );
};
