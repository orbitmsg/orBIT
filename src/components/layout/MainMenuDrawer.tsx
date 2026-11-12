import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Users,
  Megaphone,
  UserPlus,
  Phone,
  Bookmark,
  Settings,
  Moon,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { useAccountStore } from '../../services/accountManager';
import { Avatar } from '../common/Avatar';
import { PillToggle } from '../common/PillToggle';
import { themePalettes } from '../../theme';
import { DeveloperBadge } from '../ui/DeveloperBadge';

interface MainMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenCreateGroup: () => void;
  onOpenCreateChannel: () => void;
  onOpenCreateChat: () => void;
  onOpenCalls: () => void;
  onOpenSavedMessages: () => void;
  onOpenSettings: () => void;
}

export const MainMenuDrawer: React.FC<MainMenuDrawerProps> = ({
  isOpen,
  onClose,
  onOpenProfile,
  onOpenCreateGroup,
  onOpenCreateChannel,
  onOpenCreateChat,
  onOpenCalls,
  onOpenSavedMessages,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const nickname = useAuthStore((s) => s.nickname);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const username = useAuthStore((s) => s.username);
  const userId = useAuthStore((s) => s.userId);
  const myCode = useChatStore((s) => s.myCode);

  const currentTheme = useChatStore((s) => s.currentTheme);
  const setTheme = useChatStore((s) => s.setTheme);

  const [isAccountsOpen, setIsAccountsOpen] = useState(false);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const switchAccount = useAccountStore((s) => s.switchAccount);
  const prepareAddSecondAccount = useAccountStore((s) => s.prepareAddSecondAccount);

  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAccountsOpen(false);
      setShouldRender(true);
      const raf = requestAnimationFrame(() => {
        setIsAnimating(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsAccountsOpen(false);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const otherAccount = accounts.find((a) => a.id !== activeAccountId && a.isRegistered);

  const isNightMode = !themePalettes[currentTheme]?.isLight;

  const toggleNightMode = useCallback(() => {
    if (isNightMode) {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  }, [isNightMode, setTheme]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!shouldRender && !isOpen) return null;

  const userSubtext = username ? `@${username}` : (myCode || '');

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--titlebar-height,0px)] z-[150] flex"
      style={{
        userSelect: 'none',
        pointerEvents: isOpen && isAnimating ? 'auto' : 'none',
      }}
    >
      <div
        onClick={onClose}
        className="fixed inset-x-0 bottom-0 top-[var(--titlebar-height,0px)]"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          opacity: isOpen && isAnimating ? 1 : 0,
          transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'opacity',
        }}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex flex-col h-full overflow-hidden shadow-2xl"
        style={{
          width: '260px',
          maxWidth: '85vw',
          backgroundColor: 'var(--bg-secondary)',
          border: 'none',
          transform: isOpen && isAnimating ? 'translate3d(0, 0, 0)' : 'translate3d(-100%, 0, 0)',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
          contain: 'layout style paint',
        }}
      >
        <div
          className="px-3.5 pt-3.5 pb-2.5 flex flex-col gap-2.5 transition-colors hover:bg-[var(--surface-container-soft)]"
          style={{
            backgroundColor: 'transparent',
          }}
        >
          <div
            onClick={onOpenProfile}
            className="cursor-pointer inline-block"
          >
            <Avatar
              src={avatarUrl}
              alt={nickname || '?'}
              className="w-10 h-10 rounded-full"
            />
          </div>
          <div className="flex items-center justify-between min-w-0">
            <div
              onClick={onOpenProfile}
              className="flex flex-col min-w-0 cursor-pointer flex-1"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-[13.5px] text-[var(--text-main)] truncate leading-tight">
                  {nickname || 'User'}
                </span>
                <DeveloperBadge
                  userId={myCode || userId || nickname}
                  nickname={nickname}
                  size={16}
                />
              </div>
              {userSubtext && (
                <span className="text-[11.5px] text-[var(--text-dim)] truncate leading-tight mt-0.5">
                  {userSubtext}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsAccountsOpen((prev) => !prev);
              }}
              aria-label={isAccountsOpen ? t('mainMenu.hide_accounts', 'Скрыть аккаунты') : t('mainMenu.show_accounts', 'Показать аккаунты')}
              className="p-1 rounded-full hover:bg-[var(--surface-container-strong)] transition-colors text-[var(--text-dim)] hover:text-[var(--text-main)] flex items-center justify-center shrink-0"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <ChevronDown
                size={16}
                style={{
                  transform: isAccountsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isAccountsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="overflow-hidden flex flex-col py-1"
              style={{
                backgroundColor: 'var(--surface-container)',
              }}
            >
              {otherAccount ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    switchAccount(otherAccount.id);
                  }}
                  aria-label={t('mainMenu.switch_account', 'Переключить аккаунт')}
                  className="flex items-center gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    borderRadius: '10px',
                    margin: '1px 8px',
                    width: 'calc(100% - 16px)',
                    padding: '7px 12px',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <Avatar
                    src={otherAccount.avatarUrl}
                    alt={otherAccount.nickname || '?'}
                    className="w-6 h-6 rounded-full shrink-0"
                  />
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-normal text-[13px] text-[var(--text-main)] truncate">
                      {otherAccount.nickname || 'User'}
                    </span>
                    <DeveloperBadge
                      userId={otherAccount.myCode || otherAccount.userId || otherAccount.nickname}
                      nickname={otherAccount.nickname}
                      size={16}
                    />
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    prepareAddSecondAccount();
                  }}
                  aria-label={t('mainMenu.add_account', 'Добавить аккаунт')}
                  className="flex items-center gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    borderRadius: '10px',
                    margin: '1px 8px',
                    width: 'calc(100% - 16px)',
                    padding: '7px 12px',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: 'var(--accent-color, #7c3aed)',
                      color: 'var(--accent-on-color, #ffffff)',
                    }}
                  >
                    <Plus size={13} strokeWidth={2.5} />
                  </div>
                  <span className="font-normal text-[13px] text-[var(--text-main)] truncate">
                    {t('mainMenu.add_account', 'Добавить аккаунт')}
                  </span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 px-0 flex flex-col custom-scrollbar">
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label={t('mainMenu.my_profile', 'Мой профиль')}
            className="flex items-center gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              borderRadius: '10px',
              margin: '1px 8px',
              width: 'calc(100% - 16px)',
              padding: '7px 12px',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <User size={18} className="text-[var(--text-dim)] shrink-0" />
            <span className="text-[13px] font-normal truncate">
              {t('mainMenu.my_profile', 'Мой профиль')}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCreateGroup}
            aria-label={t('mainMenu.create_group', 'Создать группу')}
            className="flex items-center gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              borderRadius: '10px',
              margin: '1px 8px',
              width: 'calc(100% - 16px)',
              padding: '7px 12px',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Users size={18} className="text-[var(--text-dim)] shrink-0" />
            <span className="text-[13px] font-normal truncate">
              {t('mainMenu.create_group', 'Создать группу')}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCreateChannel}
            aria-label={t('mainMenu.create_channel', 'Создать канал')}
            className="flex items-center gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              borderRadius: '10px',
              margin: '1px 8px',
              width: 'calc(100% - 16px)',
              padding: '7px 12px',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Megaphone size={18} className="text-[var(--text-dim)] shrink-0" />
            <span className="text-[13px] font-normal truncate">
              {t('mainMenu.create_channel', 'Создать канал')}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCreateChat}
            aria-label={t('mainMenu.add_friend', 'Добавить друга')}
            className="flex items-center gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              borderRadius: '10px',
              margin: '1px 8px',
              width: 'calc(100% - 16px)',
              padding: '7px 12px',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <UserPlus size={18} className="text-[var(--text-dim)] shrink-0" />
            <span className="text-[13px] font-normal truncate">
              {t('mainMenu.add_friend', 'Добавить друга')}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCalls}
            aria-label={t('mainMenu.calls', 'Звонки')}
            className="flex items-center gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              borderRadius: '10px',
              margin: '1px 8px',
              width: 'calc(100% - 16px)',
              padding: '7px 12px',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Phone size={18} className="text-[var(--text-dim)] shrink-0" />
            <span className="text-[13px] font-normal truncate">
              {t('mainMenu.calls', 'Звонки')}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSavedMessages}
            aria-label={t('mainMenu.saved_messages', 'Избранное')}
            className="flex items-center gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              borderRadius: '10px',
              margin: '1px 8px',
              width: 'calc(100% - 16px)',
              padding: '7px 12px',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Bookmark size={18} className="text-[var(--text-dim)] shrink-0" />
            <span className="text-[13px] font-normal truncate">
              {t('mainMenu.saved_messages', 'Избранное')}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t('mainMenu.settings', 'Настройки')}
            className="flex items-center gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              borderRadius: '10px',
              margin: '1px 8px',
              width: 'calc(100% - 16px)',
              padding: '7px 12px',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Settings size={18} className="text-[var(--text-dim)] shrink-0" />
            <span className="text-[13px] font-normal truncate">
              {t('mainMenu.settings', 'Настройки')}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleNightMode}
            aria-label={t('mainMenu.night_mode', 'Ночной режим')}
            className="flex items-center justify-between gap-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              borderRadius: '10px',
              margin: '1px 8px',
              width: 'calc(100% - 16px)',
              padding: '7px 12px',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Moon size={18} className="text-[var(--text-dim)] shrink-0" />
              <span className="text-[13px] font-normal truncate">
                {t('mainMenu.night_mode', 'Ночной режим')}
              </span>
            </div>
            <PillToggle checked={isNightMode} onChange={toggleNightMode} />
          </button>
        </div>

        <div className="px-4 py-2.5 mt-auto flex flex-col gap-0.5 select-none shrink-0">
          <span className="text-[12px] font-medium text-[var(--text-main)] opacity-80">
            Orbita Desktop
          </span>
          <span className="text-[11px] text-[var(--text-dim)] opacity-60">
            {t('mainMenu.version', 'Версия')} 2.0.2 x64
          </span>
        </div>
      </div>
    </div>
  );
};
