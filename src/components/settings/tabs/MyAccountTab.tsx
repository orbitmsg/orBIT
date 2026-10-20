import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Trash2, Image as ImageIcon } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { OptimizedBanner } from '../../common/OptimizedBanner';
import { DeveloperBadge } from '../../ui/DeveloperBadge';
import { formatBirthday } from '../../../utils/birthday';
import { MD3, Block } from '../SettingsShared';

export interface MyAccountTabProps {
  bannerUrl: string | null;
  avatarUrl: string | null;
  nickname: string;
  username: string | null;
  birthday: string | null;
  userId: string | null;
  myCode: string;
  localBio: string;
  avatarMenuOpen: boolean;
  cameraBtnRef: React.RefObject<HTMLButtonElement | null>;
  menuPos: { top: number; left: number };
  setNameEditOpen: (val: boolean) => void;
  setUsernameEditOpen: (val: boolean) => void;
  setBirthdayEditOpen: (val: boolean) => void;
  handleBioChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleBioBlur: () => void;
  handleToggleAvatarMenu: (e: React.MouseEvent) => void;
  handlePickFile: () => void;
  handlePasteClipboard: () => void;
  handlePickBanner: () => void;
  handleDeleteBanner: () => void;
  handleOpenEmojiAvatar: () => void;
  handleDeleteAvatar: () => void;
  triggerDevToast: () => void;
  handleCopyCode: () => void;
  handleCopyUsername: () => void;
}

export const MyAccountTab = ({
  bannerUrl,
  avatarUrl,
  nickname,
  username,
  birthday,
  userId,
  myCode,
  localBio,
  avatarMenuOpen,
  cameraBtnRef,
  menuPos,
  setNameEditOpen,
  setUsernameEditOpen,
  setBirthdayEditOpen,
  handleBioChange,
  handleBioBlur,
  handleToggleAvatarMenu,
  handlePickFile,
  handlePasteClipboard,
  handlePickBanner,
  handleDeleteBanner,
  handleOpenEmojiAvatar,
  handleDeleteAvatar,
  triggerDevToast,
  handleCopyCode,
  handleCopyUsername,
}: MyAccountTabProps) => {
  const { t, i18n } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}
    >
      <Block>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            {bannerUrl ? (
              <div
                style={{
                  width: '56px',
                  height: '36px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                }}
              >
                <OptimizedBanner src={bannerUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : (
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  color: MD3.onSurfaceVar,
                  flexShrink: 0,
                }}
              >
                <ImageIcon size={20} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: '14.5px', fontWeight: 600, color: MD3.onSurface }}>
                {t('settings.banner', 'Баннер')}
              </span>
              <span style={{ fontSize: '12px', color: MD3.onSurfaceVar, marginTop: '2px' }}>
                {bannerUrl
                  ? t('settings.banner_active', 'Установлен')
                  : t('settings.banner_description', 'Статичное изображение в шапке профиля')}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={handlePickBanner}
              aria-label={bannerUrl ? t('common.edit', 'Изменить') : t('settings.set_banner', 'Поставить')}
              style={{
                background: 'var(--accent-color, #7C3AED)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {bannerUrl ? t('common.edit', 'Изменить') : t('settings.set_banner', 'Поставить')}
            </button>
            {bannerUrl && (
              <button
                type="button"
                onClick={handleDeleteBanner}
                aria-label={t('settings.delete_banner', 'Удалить баннер')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--md-error, #ff595a)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,89,90,0.12)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </Block>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 20px 8px',
          userSelect: 'none',
        }}
      >
        <div style={{ position: 'relative', width: '84px', height: '84px', marginBottom: 12 }}>
          <Avatar
            src={avatarUrl}
            alt={nickname || '?'}
            className="w-[84px] h-[84px] rounded-full object-cover"
            style={{ width: '84px', height: '84px', borderRadius: '50%' }}
          />
          <button
            ref={cameraBtnRef}
            type="button"
            onClick={handleToggleAvatarMenu}
            aria-label={t('common.edit', 'Изменить')}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-color, #7C3AED)',
              color: '#ffffff',
              border: '2px solid var(--bg-secondary, #211d2f)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>

          <AnimatePresence>
            {avatarMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: menuPos.top,
                  left: menuPos.left,
                  backgroundColor: 'var(--bg-secondary, #2a253b)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                  padding: '6px',
                  minWidth: '200px',
                  zIndex: 350,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                }}
              >
                <button
                  type="button"
                  onClick={handlePickFile}
                  aria-label={t('profile.choose_file', 'Выбрать файл')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--text-main, #ffffff)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  {t('profile.choose_file', 'Выбрать файл')}
                </button>

                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  aria-label={t('profile.paste_clipboard', 'Вставить из буфера')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--text-main, #ffffff)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                  {t('profile.paste_clipboard', 'Вставить из буфера')}
                </button>

                <button
                  type="button"
                  onClick={handleOpenEmojiAvatar}
                  aria-label={t('profile.choose_emoji', 'Выбрать эмодзи-аватар')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--text-main, #ffffff)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                  {t('profile.choose_emoji', 'Выбрать эмодзи-аватар')}
                </button>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleDeleteAvatar}
                    aria-label={t('profile.delete_photo', 'Удалить фото')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: 'var(--md-error, #ff595a)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,89,90,0.12)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <Trash2 size={16} />
                    {t('profile.delete_photo', 'Удалить фото')}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: '18px', fontWeight: 700, color: MD3.onSurface }}>
            {nickname || 'User'}
          </span>
          <div
            style={{
              position: 'absolute',
              left: 'calc(100% + 5px)',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <DeveloperBadge userId={myCode} size={34} onClick={triggerDevToast} />
          </div>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--accent-color, #9b7dd4)' }}>
          {t('status.online', 'в сети')}
        </div>
      </div>

      <div
        style={{
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <textarea
          value={localBio}
          onChange={handleBioChange}
          onBlur={handleBioBlur}
          maxLength={70}
          rows={localBio ? 2 : 1}
          placeholder={t('profile.bio_placeholder', 'О себе')}
          aria-label={t('profile.bio_placeholder', 'О себе')}
          className="placeholder:text-[var(--md-on-surface-var,#9f96b3)] placeholder:opacity-60"
          style={{
            flex: 1,
            minWidth: 0,
            backgroundColor: 'transparent',
            border: 'none',
            color: MD3.onSurface,
            fontSize: '14.5px',
            lineHeight: '1.4',
            resize: 'none',
            outline: 'none',
            padding: 0,
            margin: 0,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <span style={{ fontSize: '13px', color: MD3.onSurfaceVar, flexShrink: 0, userSelect: 'none', paddingTop: 1 }}>
          {70 - localBio.length}
        </span>
      </div>

      <div
        style={{
          backgroundColor: MD3.surface,
          padding: '12px 16px',
          margin: '0 10px',
          borderRadius: '16px',
          fontSize: '13px',
          color: MD3.onSurfaceVar,
          lineHeight: '1.45',
          userSelect: 'none',
          width: 'calc(100% - 20px)',
          boxSizing: 'border-box',
          whiteSpace: 'pre-line',
        }}
      >
        {t('profile.bio_hint_full', 'Расскажите о себе любые факты. Например: то, чем вы занимаетесь и что вас интересует.\nПример: Занимаюсь разработкой приложений, интересуюсь миром кода.')}
      </div>

      <Block>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'transparent',
            width: '100%',
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: '14.5px', fontWeight: 500, color: MD3.onSurface }}>
            {t('profile.name', 'Имя')}
          </span>
          <span
            onClick={() => setNameEditOpen(true)}
            style={{
              fontSize: '14.5px',
              fontWeight: 500,
              color: MD3.onSurface,
              maxWidth: '55%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              borderRadius: '6px',
              padding: '2px 6px',
              margin: '-2px -6px',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {nickname || 'User'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'transparent',
            width: '100%',
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: '14.5px', fontWeight: 500, color: MD3.onSurface }}>
            {t('profile.account_id', 'ID аккаунта')}
          </span>
          <span
            onClick={handleCopyCode}
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--accent-color, #9b7dd4)',
              fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
              maxWidth: '55%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              borderRadius: '6px',
              padding: '2px 6px',
              margin: '-2px -6px',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {myCode || userId || '------'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'transparent',
            width: '100%',
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: '14.5px', fontWeight: 500, color: MD3.onSurface }}>
            {t('profile.username_label', 'Имя пользователя')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '55%' }}>
            <span
              onClick={username ? handleCopyUsername : () => setUsernameEditOpen(true)}
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: username ? 'var(--accent-color, #9b7dd4)' : MD3.onSurfaceVar,
                fontFamily: username ? '"JetBrains Mono", Consolas, Menlo, monospace' : 'inherit',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                borderRadius: '6px',
                padding: '2px 6px',
                margin: '-2px -6px',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {username ? `@${username}` : t('profile.username_not_set', 'Не установлено')}
            </span>
            {username && (
              <button
                type="button"
                onClick={() => setUsernameEditOpen(true)}
                aria-label={t('common.edit', 'Изменить')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: MD3.onSurfaceVar,
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'transparent',
            width: '100%',
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        >
          <span style={{ fontSize: '14.5px', fontWeight: 500, color: MD3.onSurface }}>
            {t('profile.birthday_label', 'День рождения')}
          </span>
          <span
            onClick={() => setBirthdayEditOpen(true)}
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: birthday ? 'var(--text-main, #ffffff)' : MD3.onSurfaceVar,
              cursor: 'pointer',
              borderRadius: '6px',
              padding: '2px 6px',
              margin: '-2px -6px',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {birthday ? formatBirthday(birthday, i18n.language) : t('profile.birthday_not_set', 'Не указан')}
          </span>
        </div>
      </Block>

      <div
        style={{
          padding: '0 24px',
          fontSize: '12.5px',
          color: MD3.onSurfaceVar,
          lineHeight: '1.4',
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
      >
        {t('profile.username_hint', 'С помощью имени пользователя другие люди смогут связаться с вами, не зная вашего ID аккаунта.')}
      </div>
    </motion.div>
  );
};
