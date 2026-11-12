import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { DeveloperBadge } from '../../ui/DeveloperBadge';
import { formatBirthday } from '../../../utils/birthday';
import { MD3, Block } from '../SettingsShared';

export interface MyAccountTabProps {
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
  handleOpenEmojiAvatar: () => void;
  handleDeleteAvatar: () => void;
  triggerDevToast: () => void;
  handleCopyCode: () => void;
  handleCopyUsername: () => void;
}

export const MyAccountTab = ({
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
        <div style={{ position: 'relative', width: '96px', height: '96px', marginBottom: 12 }}>
          <div
            style={{
              position: 'relative',
              width: '96px',
              height: '96px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Avatar
              src={avatarUrl}
              alt={nickname || 'User'}
              className="w-24 h-24 rounded-full"
              style={{ width: '96px', height: '96px', backgroundColor: 'var(--settings-bg, var(--bg-secondary))' }}
            />
          </div>
          <button
            ref={cameraBtnRef}
            onClick={handleToggleAvatarMenu}
            aria-label={t('settings.change_avatar', 'Изменить аватар')}
            style={{
              position: 'absolute',
              bottom: '-2px',
              right: '-2px',
              width: '35px',
              height: '35px',
              boxSizing: 'border-box',
              borderRadius: '50%',
              background: 'var(--accent-color)',
              color: 'var(--accent-on-color, #ffffff)',
              border: '3.5px solid var(--settings-bg, var(--bg-secondary))',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              transition: 'opacity 0.15s ease',
              zIndex: 10,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="17" height="17">
              <path fill="currentColor" d="M12 17.5q1.875 0 3.188-1.312T16.5 13t-1.312-3.187T12 8.5T8.813 9.813T7.5 13t1.313 3.188T12 17.5m0-2q-1.05 0-1.775-.725T9.5 13t.725-1.775T12 10.5t1.775.725T14.5 13t-.725 1.775T12 15.5M4 21q-.825 0-1.412-.587T2 19V7q0-.825.588-1.412T4 5h3.15L9 3h6l1.85 2H20q.825 0 1.413.588T22 7v12q0 .825-.587 1.413T20 21z" />
            </svg>
          </button>

          {avatarMenuOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 999998 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleAvatarMenu(e);
                }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: menuPos.top + 'px',
                  left: menuPos.left + 'px',
                  backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
                  borderRadius: '9px',
                  border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
                  padding: '0',
                  overflow: 'hidden',
                  minWidth: '145px',
                  width: 'max-content',
                  zIndex: 999999,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0px',
                  animation: 'fadeIn 0.12s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePickFile();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 11px',
                    borderRadius: '0px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main, #fff)',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    boxSizing: 'border-box',
                    transition: 'background-color 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, var(--surface-container-strong))')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" style={{ color: 'var(--text-main)' }}>
                      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                        <path d="M15 8h.01M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" />
                        <path d="m3 16l5-5c.928-.893 2.072-.893 3 0l5 5" />
                        <path d="m14 14l1-1c.928-.893 2.072-.893 3 0l3 3" />
                      </g>
                    </svg>
                  </div>
                  <span style={{ whiteSpace: 'nowrap' }}>{t('common.file', 'Файл')}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePasteClipboard();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 11px',
                    borderRadius: '0px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main, #fff)',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    boxSizing: 'border-box',
                    transition: 'background-color 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, var(--surface-container-strong))')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" style={{ color: 'var(--text-main)' }}>
                      <path fill="currentColor" d="M5 5h2v1c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V5h2v6h2V5c0-1.1-.9-2-2-2h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h5v-2H5zm7-2c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1" />
                      <path fill="currentColor" d="m21.29 16.29l-2.58-2.58a.996.996 0 1 0-1.41 1.41l.87.88H13c-.55 0-1 .45-1 1s.45 1 1 1h5.17l-.87.88a.996.996 0 1 0 1.41 1.41l2.58-2.58c.39-.4.39-1.03 0-1.42" />
                    </svg>
                  </div>
                  <span style={{ whiteSpace: 'nowrap' }}>{t('common.from_clipboard', 'Из буфера обмена')}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenEmojiAvatar();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 11px',
                    borderRadius: '0px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main, #fff)',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    boxSizing: 'border-box',
                    transition: 'background-color 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, var(--surface-container-strong))')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span className="emoji-font" style={{ fontSize: '15px', lineHeight: 1 }}>
                      🙈
                    </span>
                  </div>
                  <span style={{ whiteSpace: 'nowrap' }}>{t('avatar.choose_emoji', 'Выбрать эмодзи')}</span>
                </button>

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAvatar();
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 11px',
                      borderRadius: '0px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--md-error, #ff595a)',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      boxSizing: 'border-box',
                      transition: 'background-color 0.12s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, var(--surface-container-strong))')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Trash2 size={16} />
                    </div>
                    <span style={{ whiteSpace: 'nowrap' }}>{t('profile.delete_photo', 'Удалить фото')}</span>
                  </button>
                )}
              </div>
            </>
          )}
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

        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--accent-text, var(--accent-color, #9b7dd4))' }}>
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
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, var(--surface-container-strong))')}
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
              color: 'var(--accent-text, var(--accent-color, #9b7dd4))',
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
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, var(--surface-container-strong))')}
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
                color: username ? 'var(--accent-text, var(--accent-color, #9b7dd4))' : MD3.onSurfaceVar,
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
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, var(--surface-container-strong))')}
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
              color: birthday ? MD3.onSurface : MD3.onSurfaceVar,
              cursor: 'pointer',
              borderRadius: '6px',
              padding: '2px 6px',
              margin: '-2px -6px',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-hover, var(--surface-container-strong))')}
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
