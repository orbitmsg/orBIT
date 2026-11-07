import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  User,
  ShieldCheck,
  Palette,
  FolderTree,
  Bell,
  Database,
  Wifi,
  Phone,
  Zap,
  Languages,
  Sliders,
  HelpCircle,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { DeveloperBadge } from '../../ui/DeveloperBadge';
import { MD3, Block, MenuItem, QrCodeMiniIcon, type TabId } from '../SettingsShared';
import { type ChatFolder } from '../../../store/useChatStore';

export interface MainTabProps {
  avatarUrl: string | null;
  nickname: string;
  userId: string | null;
  myCode: string;
  username?: string | null;
  appVersion: string;
  proxyEnabled: boolean;
  activeProxy: any;
  folders: ChatFolder[];
  language: string | null;
  languageDisplayOptions: { value: string; label: string }[];
  pushTab: (tab: TabId) => void;
  triggerDevToast: () => void;
  handleCopyCode: () => void;
  handleCopyUsername?: () => void;
  setDeleteModalOpen: (val: boolean) => void;
}

export const MainTab = ({
  avatarUrl,
  nickname,
  userId,
  myCode,
  username,
  appVersion,
  proxyEnabled,
  activeProxy,
  folders,
  language,
  languageDisplayOptions,
  pushTab,
  triggerDevToast,
  handleCopyCode,
  handleCopyUsername,
  setDeleteModalOpen,
}: MainTabProps) => {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingBottom: 12 }}
    >
      <div
        onClick={() => pushTab('myAccount')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '9px 12px',
          margin: '0 8px 1px',
          width: 'calc(100% - 16px)',
          userSelect: 'none',
          cursor: 'pointer',
          borderRadius: '12px',
          backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.04))',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxSizing: 'border-box',
          transition: 'background-color 150ms ease, border-color 150ms ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.07)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'var(--surface-container, rgba(255, 255, 255, 0.04))';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
        }}
      >
        <div style={{ position: 'relative', width: '42px', height: '42px', flexShrink: 0 }}>
          <Avatar
            src={avatarUrl}
            alt={nickname || '?'}
            className="w-[42px] h-[42px] rounded-full object-cover ring-1 ring-white/10"
            style={{ width: '42px', height: '42px' }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
            <span
              style={{
                fontSize: '13.5px',
                fontWeight: 600,
                color: 'var(--text-main, #ffffff)',
                lineHeight: 1.25,
              }}
              className="truncate"
            >
              {nickname || 'User'}
            </span>
            <DeveloperBadge
              userId={userId || myCode}
              nickname={nickname}
              size={15}
              onClick={(e) => { e?.stopPropagation(); triggerDevToast(); }}
            />
          </div>

          <div
            onClick={(e) => { e.stopPropagation(); handleCopyCode(); }}
            style={{
              fontSize: '11.5px',
              fontWeight: 500,
              color: 'var(--accent-color, #a78bfa)',
              cursor: 'pointer',
              lineHeight: 1.2,
              fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
            }}
            className="truncate hover:underline opacity-95"
            aria-label={t('profile.account_id', 'ID аккаунта')}
          >
            {myCode || userId || '------'}
          </div>

          {username && username.trim() && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (handleCopyUsername) {
                  handleCopyUsername();
                }
              }}
              style={{
                fontSize: '11.5px',
                fontWeight: 400,
                color: 'var(--text-dim, #9ca3af)',
                cursor: 'pointer',
                lineHeight: 1.2,
              }}
              className="truncate hover:text-white"
            >
              {username.startsWith('@') ? username : `@${username}`}
            </div>
          )}
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
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 150ms ease, color 150ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = MD3.onSurfaceVar;
            }}
          >
            <QrCodeMiniIcon size={17} color="currentColor" />
          </button>
        </div>
      </div>

      <Block>
        <MenuItem
          icon={<User size={17} />}
          label={t('settings.my_account', 'Мой аккаунт')}
          onClick={() => pushTab('myAccount')}
        />
        <MenuItem
          icon={<ShieldCheck size={17} />}
          label={t('settings.privacy', 'Приватность')}
          onClick={() => pushTab('security')}
        />
      </Block>

      <Block>
        <MenuItem
          icon={<Palette size={17} />}
          label={t('settings.appearance', 'Внешний вид')}
          onClick={() => pushTab('chats')}
        />
        <MenuItem
          icon={<FolderTree size={17} />}
          label={t('settings.chat_folders', 'Папки с чатами')}
          onClick={() => pushTab('folders')}
          rightElement={
            folders.length > 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-dim, #9ca3af)', fontWeight: 500 }}>
                {folders.length}
              </span>
            ) : undefined
          }
        />
        <MenuItem
          icon={<Bell size={17} />}
          label={t('settings.notifications_and_sounds', 'Уведомления и звуки')}
          onClick={() => pushTab('notifications')}
        />
        <MenuItem
          icon={<Database size={17} />}
          label={t('settings.data_memory', 'Данные и память')}
          onClick={() => pushTab('dataMemory')}
        />
      </Block>

      <Block>
        <MenuItem
          icon={<Wifi size={17} />}
          label={t('settings.connection', 'Подключение')}
          onClick={() => pushTab('connection')}
          rightElement={
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <span style={{ fontSize: 12, color: proxyEnabled ? 'var(--accent-color, #a78bfa)' : 'var(--text-dim, #9ca3af)' }}>
                {proxyEnabled ? (activeProxy ? activeProxy.name : 'Включено') : 'Прямое'}
              </span>
              <ChevronRight size={14} style={{ color: 'var(--text-dim, #9ca3af)', opacity: 0.6 }} />
            </div>
          }
        />
        <MenuItem
          icon={<Phone size={17} />}
          label={t('settings.calls', 'Звонки')}
          onClick={() => pushTab('calls')}
        />
        <MenuItem
          icon={<Zap size={17} />}
          label={t('settings.energy_and_animations', 'Заряд батареи и анимации')}
          onClick={() => pushTab('energy')}
        />
        <MenuItem
          icon={<Languages size={17} />}
          label={t('settings.language', 'Язык')}
          onClick={() => pushTab('language')}
          rightElement={
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim, #9ca3af)' }}>
                {languageDisplayOptions.find(o => o.value === language)?.label || language || '...'}
              </span>
              <ChevronRight size={14} style={{ color: 'var(--text-dim, #9ca3af)', opacity: 0.6 }} />
            </div>
          }
        />
        <MenuItem
          icon={<Sliders size={17} />}
          label={t('settings.preferences', 'Предпочтения')}
          onClick={() => pushTab('preferences')}
        />
      </Block>

      <Block>
        <MenuItem
          icon={<HelpCircle size={17} />}
          label={t('common.help', 'Помощь')}
          onClick={() => {
            if ((window as any).orbita?.openExternal) {
              (window as any).orbita.openExternal('https://github.com/saizzi/orbita-messenger');
            }
          }}
        />
        <MenuItem
          icon={<Trash2 size={17} style={{ color: MD3.error }} />}
          label={t('common.clear_identity', 'Удалить аккаунт')}
          onClick={() => setDeleteModalOpen(true)}
        />
      </Block>

      <div style={{ padding: '6px 20px 8px', textAlign: 'center', userSelect: 'none', backgroundColor: 'transparent' }}>
        <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-dim, #9ca3af)', opacity: 0.8, textTransform: 'uppercase' }}>
          ORBITA MESSENGER
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-dim, #6b7280)', marginTop: 2 }}>
          {t('common.version', { version: appVersion || '2.0.2' })}
        </div>
      </div>
    </motion.div>
  );
};
