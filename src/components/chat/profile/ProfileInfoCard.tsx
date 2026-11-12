import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, RefreshCw, Unlock, Lock, Clock } from 'lucide-react';
import { buildGroupInviteLink } from '../../../lib/groupCrypto';
import { buildChannelInviteLink } from '../../../utils/inviteLink';
import { groupService } from '../../../services/groupService';
import { useChatStore, type Chat } from '../../../store/useChatStore';
import { formatBirthday } from '../../../utils/birthday';

interface ProfileInfoCardProps {
  chat: Chat;
  isGroup: boolean;
  isGroupAdmin: boolean;
  isChannel: boolean;
  isChannelOwner: boolean;
  profileId?: string;
  formattedProfileId?: string;
  isResettingLink: boolean;
  setIsResettingLink: (val: boolean) => void;
  onCopyKey: (text?: string) => void;
  onEditClick: () => void;
  i18nLang: string;
}

export const ProfileInfoCard: React.FC<ProfileInfoCardProps> = ({
  chat,
  isGroup,
  isGroupAdmin,
  isChannel,
  isChannelOwner,
  profileId,
  formattedProfileId,
  isResettingLink,
  setIsResettingLink,
  onCopyKey,
  onEditClick,
  i18nLang,
}) => {
  const { t } = useTranslation();

  const shouldShow = isChannel || isGroup || Boolean(profileId) || Boolean(chat.description) || Boolean(chat.username) || Boolean(chat.birthday);
  if (!shouldShow) return null;

  return (
    <div
      style={{
        backgroundColor: 'var(--md-surface, #211c2e)',
        width: 'calc(100% - 20px)',
        margin: '0 10px 16px 10px',
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {isGroup ? (
        <>
          {chat.description ? (
            <div
              onClick={isGroupAdmin ? onEditClick : undefined}
              style={{
                padding: '12px 20px',
                borderBottom: 'none',
                cursor: isGroupAdmin ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '14px', color: 'var(--text-main, #ffffff)', lineHeight: '1.35', wordBreak: 'break-word', userSelect: 'text' }}>
                {chat.description}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                {t('channel.description', 'Описание')}
              </div>
            </div>
          ) : isGroupAdmin ? (
            <div
              onClick={onEditClick}
              style={{
                padding: '12px 20px',
                borderBottom: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--accent-color, #9b7dd4)' }}>
                + {t('groupSettings.add_description', 'Добавить описание')}
              </span>
              <Pencil size={14} style={{ color: 'var(--accent-color, #9b7dd4)' }} />
            </div>
          ) : null}

          <div
            style={{
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              borderBottom: 'none',
            }}
          >
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span
                onClick={() => onCopyKey(chat.id)}
                style={{
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: 'var(--accent-color, #9b7dd4)',
                  wordBreak: 'break-all',
                  lineHeight: 1.3,
                  fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                  cursor: 'pointer',
                  width: 'fit-content',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  margin: '-2px -6px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {chat.id}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                {t('groupSettings.group_id', 'ID')}
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '12px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              borderBottom: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span
                  onClick={() => {
                    const link = buildGroupInviteLink(chat.inviteCode || chat.id, chat.name, chat.creatorNickname);
                    onCopyKey(link);
                  }}
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 500,
                    color: chat.inviteActive === false ? 'var(--text-dim, #8e8e93)' : 'var(--accent-color, #9b7dd4)',
                    textDecoration: chat.inviteActive === false ? 'line-through' : 'none',
                    wordBreak: 'break-all',
                    lineHeight: 1.3,
                    fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                    cursor: 'pointer',
                    width: 'fit-content',
                    borderRadius: '6px',
                    padding: '2px 6px',
                    margin: '-2px -6px',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {buildGroupInviteLink(chat.inviteCode || chat.id, chat.name, chat.creatorNickname)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)' }}>
                    {t('groupSettings.invite_link', 'Ссылка-приглашение')}
                  </span>
                  {chat.inviteActive === false && (
                    <span style={{ fontSize: '10px', color: '#ff4d4f', fontWeight: 600 }}>
                      {t('groupSettings.link_revoked', 'Доступ закрыт')}
                    </span>
                  )}
                  {chat.inviteExpiresAt && chat.inviteExpiresAt < Date.now() && (
                    <span style={{ fontSize: '10px', color: '#ff4d4f', fontWeight: 600 }}>
                      {t('groupSettings.link_expired', 'Срок истек')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {isGroupAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  aria-label={t('groupSettings.reset_link', 'Обновить ссылку')}
                  disabled={isResettingLink}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (isResettingLink) return;
                    setIsResettingLink(true);
                    try {
                      const newCode = await groupService.resetInviteLink(chat.id);
                      if (newCode) {
                        useChatStore.getState().updateChat(chat.id, { inviteCode: newCode, inviteActive: true });
                      }
                    } finally {
                      setTimeout(() => setIsResettingLink(false), 300);
                    }
                  }}
                  style={{
                    padding: '6px 10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: isResettingLink ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    opacity: isResettingLink ? 0.7 : 1,
                  }}
                >
                  <RefreshCw size={13} style={{ transform: isResettingLink ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }} />
                  <span>{t('groupSettings.reset_link', 'Обновить ссылку')}</span>
                </button>

                <button
                  type="button"
                  aria-label={chat.inviteActive === false ? t('groupSettings.open_link', 'Открыть доступ') : t('groupSettings.close_link', 'Закрыть доступ')}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const newActive = chat.inviteActive === false;
                    if (newActive) {
                      await groupService.enableInviteLink(chat.id);
                    } else {
                      await groupService.revokeInviteLink(chat.id);
                    }
                    useChatStore.getState().updateChat(chat.id, { inviteActive: newActive });
                  }}
                  style={{
                    padding: '6px 10px',
                    background: chat.inviteActive === false ? 'var(--accent-glow-light, rgba(88, 101, 242, 0.15))' : 'rgba(255, 77, 79, 0.1)',
                    border: 'none',
                    borderRadius: '8px',
                    color: chat.inviteActive === false ? 'var(--accent-color, #9b7dd4)' : '#ff4d4f',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  {chat.inviteActive === false ? <Unlock size={13} /> : <Lock size={13} />}
                  <span>{chat.inviteActive === false ? t('groupSettings.open_link', 'Открыть доступ') : t('groupSettings.close_link', 'Закрыть доступ')}</span>
                </button>

                <button
                  type="button"
                  aria-label={t('groupSettings.expire_action', 'Срок действия')}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const nextDur = !chat.inviteExpiresAt ? 86400000 : (chat.inviteExpiresAt - Date.now() > 3600000 * 20 ? 3600000 : null);
                    const exp = nextDur ? Date.now() + nextDur : null;
                    await groupService.setInviteExpiration(chat.id, exp);
                    useChatStore.getState().updateChat(chat.id, { inviteExpiresAt: exp });
                  }}
                  style={{
                    padding: '6px 10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Clock size={13} />
                  <span>
                    {!chat.inviteExpiresAt
                      ? t('groupSettings.expire_never', 'Бессрочно')
                      : chat.inviteExpiresAt - Date.now() > 3600000 * 2
                        ? t('groupSettings.expire_24h', '24 часа')
                        : t('groupSettings.expire_1h', '1 час')}
                  </span>
                </button>
              </div>
            )}
          </div>
        </>
      ) : isChannel ? (
        <>
          {chat.description ? (
            <div
              onClick={isChannelOwner ? onEditClick : undefined}
              style={{
                padding: '12px 20px',
                borderBottom: 'none',
                cursor: isChannelOwner ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '14px', color: 'var(--text-main, #ffffff)', lineHeight: '1.35', wordBreak: 'break-word', userSelect: 'text' }}>
                {chat.description}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                {t('channel.description', 'Описание')}
              </div>
            </div>
          ) : isChannelOwner ? (
            <div
              onClick={onEditClick}
              style={{
                padding: '12px 20px',
                borderBottom: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '14px', color: 'var(--accent-color, #9b7dd4)' }}>
                + {t('channel.add_description', 'Добавить описание')}
              </span>
              <Pencil size={14} style={{ color: 'var(--accent-color, #9b7dd4)' }} />
            </div>
          ) : null}

          {chat.username && (
            <div
              style={{
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                borderBottom: 'none',
              }}
            >
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span
                  onClick={() => onCopyKey(`@${chat.username}`)}
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--accent-color, #9b7dd4)',
                    wordBreak: 'break-all',
                    lineHeight: 1.3,
                    fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                    cursor: 'pointer',
                    width: 'fit-content',
                    borderRadius: '6px',
                    padding: '2px 6px',
                    margin: '-2px -6px',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  @{chat.username}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                  {t('profile.username', 'Имя пользователя')}
                </span>
              </div>
            </div>
          )}

          <div
            style={{
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              borderBottom: 'none',
            }}
          >
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span
                onClick={() => {
                  const link = buildChannelInviteLink({ id: chat.id, username: chat.username });
                  onCopyKey(link);
                }}
                style={{
                  fontSize: '13.5px',
                  fontWeight: 500,
                  color: 'var(--accent-color, #9b7dd4)',
                  wordBreak: 'break-all',
                  lineHeight: 1.3,
                  fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                  cursor: 'pointer',
                  width: 'fit-content',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  margin: '-2px -6px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {buildChannelInviteLink({ id: chat.id, username: chat.username })}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                {t('channelSettings.invite_link', 'Ссылка на канал')}
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              borderBottom: 'none',
            }}
          >
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span
                onClick={() => onCopyKey(chat.id)}
                style={{
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: 'var(--accent-color, #9b7dd4)',
                  wordBreak: 'break-all',
                  lineHeight: 1.3,
                  fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                  cursor: 'pointer',
                  width: 'fit-content',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  margin: '-2px -6px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {chat.id}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                {t('channelSettings.channel_id', 'ID')}
              </span>
            </div>
          </div>
        </>
      ) : (
        <>
          {chat.username && (
            <div
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span
                  onClick={() => onCopyKey(`@${chat.username}`)}
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--accent-color, #9b7dd4)',
                    wordBreak: 'break-all',
                    lineHeight: 1.3,
                    fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                    cursor: 'pointer',
                    width: 'fit-content',
                    borderRadius: '6px',
                    padding: '2px 6px',
                    margin: '-2px -6px',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  @{chat.username}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                  {t('profile.username', 'Имя пользователя')}
                </span>
              </div>
            </div>
          )}

          {chat.description && (
            <div
              style={{
                padding: '12px 16px',
                borderBottom: 'none',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '14px', color: 'var(--text-main, #ffffff)', lineHeight: '1.35', wordBreak: 'break-word', userSelect: 'text' }}>
                {chat.description}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                {t('profile.bio', 'О себе')}
              </div>
            </div>
          )}

          {!isGroup && profileId ? (
            <div
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span
                  onClick={() => onCopyKey(profileId)}
                  style={{
                    fontSize: '13.5px',
                    fontWeight: 500,
                    color: 'var(--accent-color, #9b7dd4)',
                    wordBreak: 'break-all',
                    lineHeight: 1.3,
                    fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                    cursor: 'pointer',
                    width: 'fit-content',
                    borderRadius: '6px',
                    padding: '2px 6px',
                    margin: '-2px -6px',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  {formattedProfileId}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                  {t('profile.account_id', 'ID аккаунта')}
                </span>
              </div>
            </div>
          ) : null}

          {chat.birthday && formatBirthday(chat.birthday, i18nLang) && (
            <div
              style={{
                padding: '12px 16px',
                borderBottom: 'none',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '14px', color: 'var(--text-main, #ffffff)', lineHeight: '1.35', wordBreak: 'break-word', userSelect: 'text' }}>
                {formatBirthday(chat.birthday, i18nLang)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                {t('profile.birthday', 'День рождения')}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
