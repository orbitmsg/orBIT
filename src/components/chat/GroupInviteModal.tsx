import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { groupService, type GroupInfo } from '../../services/groupService';
import { extractGroupCode } from '../../lib/groupCrypto';
import { getGroupPusher } from '../../utils/pusher';
import { ablyService } from '../../services/ablyService';
import { useToastStore } from '../../store/useToastStore';
import { Avatar } from '../common/Avatar';

interface GroupInviteModalProps {
  inviteUrl: string | null;
  onClose: () => void;
}

const ActiveLinkIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    className="flex-shrink-0"
  >
    <path
      fill="none"
      stroke="#ffffff"
      strokeDasharray="28"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M13 6l2 -2c1 -1 3 -1 4 0l1 1c1 1 1 3 0 4l-5 5c-1 1 -3 1 -4 0M11 18l-2 2c-1 1 -3 1 -4 0l-1 -1c-1 -1 -1 -3 0 -4l5 -5c1 -1 3 -1 4 0"
    >
      <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="28;0" />
    </path>
  </svg>
);

const InactiveLinkIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    className="flex-shrink-0"
  >
    <defs>
      <style>{`
        .orb-link-part {
          fill: none;
          stroke: #ffffff;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .orb-link-slash {
          fill: none;
          stroke: #ff4d4f;
          stroke-width: 2;
          stroke-linecap: round;
        }
      `}</style>
    </defs>
    <path
      className="orb-link-part"
      strokeDasharray="28"
      d="M13 6l2 -2c1 -1 3 -1 4 0l1 1c1 1 1 3 0 4l-5 5c-1 1 -3 1 -4 0"
    >
      <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.4s" values="28;0" />
      <animateTransform
        attributeName="transform"
        type="translate"
        begin="0.45s"
        dur="0.3s"
        values="0 0; 1.5 -1.5"
        fill="freeze"
        calcMode="spline"
        keySplines="0.25 0.1 0.25 1"
      />
      <animate attributeName="stroke" begin="0.45s" dur="0.3s" values="#ffffff;#8c8c8c" fill="freeze" />
    </path>
    <path
      className="orb-link-part"
      strokeDasharray="28"
      d="M11 18l-2 2c-1 1 -3 1 -4 0l-1 -1c-1 -1 -1 -3 0 -4l5 -5c1 -1 3 -1 4 0"
    >
      <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.4s" values="28;0" />
      <animateTransform
        attributeName="transform"
        type="translate"
        begin="0.45s"
        dur="0.3s"
        values="0 0; -1.5 1.5"
        fill="freeze"
        calcMode="spline"
        keySplines="0.25 0.1 0.25 1"
      />
      <animate attributeName="stroke" begin="0.45s" dur="0.3s" values="#ffffff;#8c8c8c" fill="freeze" />
    </path>
    <line className="orb-link-slash" x1="4" y1="4" x2="20" y2="20" strokeDasharray="24" strokeDashoffset="24">
      <animate
        fill="freeze"
        attributeName="stroke-dashoffset"
        begin="0.55s"
        dur="0.25s"
        values="24;0"
        calcMode="spline"
        keySplines="0.2 0.8 0.2 1"
      />
    </line>
  </svg>
);

export const GroupInviteModal: React.FC<GroupInviteModalProps> = ({
  inviteUrl,
  onClose,
}) => {
  const { t } = useTranslation();
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isResolved, setIsResolved] = useState(false);

  const myNickname = useAuthStore((s) => s.nickname);
  const myUserId = useAuthStore((s) => s.userId);
  const myCode = useChatStore((s) => s.myCode);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!inviteUrl) {
      setGroupInfo(null);
      setIsResolved(false);
      return;
    }

    const cleanCode = extractGroupCode(inviteUrl) || inviteUrl.trim().replace(/^#/, '');
    const allChats = useChatStore.getState().chats;
    const existing = allChats.find(
      (c) =>
        c.type === 'group' &&
        (c.id === cleanCode ||
          c.id === cleanCode.toUpperCase() ||
          c.code === cleanCode ||
          c.inviteCode === cleanCode ||
          (c.inviteCode && extractGroupCode(c.inviteCode) === cleanCode) ||
          (cleanCode.length > 8 && (cleanCode.includes(c.id) || (c.inviteCode && cleanCode.includes(c.inviteCode)))))
    );

    if (existing) {
      setGroupInfo({
        id: existing.id,
        code: existing.inviteCode || existing.code || '',
        name: existing.name,
        description: existing.description || '',
        avatarUrl: existing.avatarUrl || null,
        creatorNickname: existing.creatorNickname || '',
        membersCount: existing.membersCount || (existing.members || []).length || 1,
        maxMembers: 10,
        members: (existing.members || []).map((m: any) => ({
          nickname: m.nickname,
          userCode: m.userCode || m.user_code,
          userId: m.userId || m.user_id,
          role: m.role || 'member',
          joinedAt: m.joinedAt || Date.now(),
          lastSeen: m.lastSeen,
          avatarUrl: m.avatarUrl || null,
        })),
        createdAt: existing.createdAt || Date.now(),
        inviteActive: existing.inviteActive !== false,
        inviteExpiresAt: existing.inviteExpiresAt || null,
      });
    }

    setIsLoading(true);
    setIsResolved(false);
    groupService.getGroup(cleanCode).then((info) => {
      setIsLoading(false);
      setIsResolved(true);
      if (info) {
        setGroupInfo((prev) => ({
          ...info,
          name: info.name || prev?.name || existing?.name || '',
          avatarUrl: info.avatarUrl || prev?.avatarUrl || existing?.avatarUrl || null,
          inviteActive: info.inviteActive !== undefined ? info.inviteActive : (prev?.inviteActive !== undefined ? prev.inviteActive : (existing?.inviteActive !== undefined ? existing.inviteActive : true)),
          inviteExpiresAt: info.inviteExpiresAt !== undefined ? info.inviteExpiresAt : (prev?.inviteExpiresAt || existing?.inviteExpiresAt || null),
        }));
      }
    }).catch(() => {
      setIsLoading(false);
      setIsResolved(true);
    });
  }, [inviteUrl]);

  const cleanCode = inviteUrl ? (extractGroupCode(inviteUrl) || inviteUrl.trim().replace(/^#/, '')) : '';
  const existingChat = useChatStore((s) =>
    s.chats.find(
      (c) =>
        c.type === 'group' &&
        (c.id === groupInfo?.id ||
          (cleanCode && (c.id === cleanCode || c.id === cleanCode.toUpperCase() || c.code === cleanCode || c.inviteCode === cleanCode)))
    )
  );

  const isAlreadyMember = Boolean(
    existingChat ||
    (groupInfo?.members &&
      groupInfo.members.some((m) => {
        const uid = m.userId || m.userCode;
        if (myUserId && (uid === myUserId || m.nickname === myNickname)) return true;
        if (myCode && (uid === myCode || m.nickname === myNickname)) return true;
        if (myNickname && m.nickname && m.nickname.toLowerCase() === myNickname.toLowerCase()) return true;
        return false;
      }))
  );

  const isExpiredOrRevoked = Boolean(
    !isAlreadyMember &&
      isResolved &&
      (!groupInfo ||
        groupInfo.inviteActive === false ||
        Boolean(groupInfo.inviteExpiresAt && Date.now() > groupInfo.inviteExpiresAt))
  );

  const handleOpenExisting = useCallback(() => {
    const targetId = existingChat?.id || groupInfo?.id;
    if (targetId) {
      useChatStore.getState().setActiveChat(targetId);
      onClose();
    }
  }, [existingChat, groupInfo, onClose]);

  const handleJoin = useCallback(async () => {
    if (!inviteUrl || isJoining || isExpiredOrRevoked) return;
    if (isAlreadyMember) {
      handleOpenExisting();
      return;
    }
    setIsJoining(true);

    const authData = useAuthStore.getState();
    const myNick = authData.nickname || '';
    const myCd = useChatStore.getState().myCode;
    const uCode = myCd || (authData.userId?.length === 36 ? authData.userId : undefined);
    const uAvatar = authData.avatarUrl;
    const uId = authData.userId;

    try {
      const result = await groupService.joinGroup(inviteUrl, myNick, uCode, {
        avatarUrl: uAvatar || undefined,
        userId: uId || undefined,
      });

      if (result?.group) {
        const joinText = `${myNick} вступил(а) в группу по ссылке-приглашению`;
        const sysMsg: any = result.systemMessage || {
          id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          sender: 'system',
          text: joinText,
          time: Date.now(),
          status: 'sent',
          mediaType: 'system',
          systemType: 'join_link',
          actorNickname: myNick,
        };

        const existing = useChatStore.getState().chats.find((c) => c.id === result.group.id);
        if (!existing) {
          useChatStore.getState().addChat({
            id: result.group.id,
            type: 'group',
            name: result.group.name,
            description: result.group.description || '',
            lastMsg: joinText,
            online: false,
            sharedSecret: result.sharedSecret,
            role: 'member',
            inviteCode: result.group.code,
            creatorNickname: result.group.creatorNickname,
            creatorCode: result.group.creatorCode || undefined,
            avatarUrl: result.group.avatarUrl || undefined,
            members: (result.group.members || []) as any[],
            membersCount: result.group.membersCount || 2,
            createdAt: result.group.createdAt || Date.now(),
            unreadCount: 0,
            lastReadTimestamp: Date.now(),
            muted: false,
            notificationsEnabled: true,
            isExplicitJoin: true,
          } as any);
        } else {
          const shouldUpdateName =
            existing.name === 'Группа' ||
            existing.name === 'Group' ||
            (result.group.name && result.group.name !== 'Группа' && result.group.name !== 'Group');
          useChatStore.getState().updateChat(existing.id, {
            ...(shouldUpdateName ? { name: result.group.name } : {}),
            ...(result.group.avatarUrl ? { avatarUrl: result.group.avatarUrl } : {}),
            ...(result.group.creatorNickname ? { creatorNickname: result.group.creatorNickname } : {}),
            sharedSecret: result.sharedSecret || existing.sharedSecret,
            lastMsg: joinText,
            members:
              result.group.members && result.group.members.length > (existing.members?.length || 0)
                ? (result.group.members as any[])
                : existing.members,
            membersCount: Math.max(
              result.group.membersCount || 1,
              existing.membersCount || 1,
              result.group.members?.length || 1
            ),
          });
        }

        if (!result.systemMessage) {
          useChatStore.getState().addMessage(result.group.id, sysMsg);
          try {
            (window as any).orbita?.storageAddMessage?.(result.group.id, sysMsg.id, sysMsg);
          } catch {}
        }

        useChatStore.getState().setActiveChat(result.group.id);

        try {
          const grpChannel = getGroupPusher().subscribe(`presence-group-${result.group.id}`);
          const rosterPayload = {
            type: 'member-joined',
            id: sysMsg.id,
            nickname: myNick,
            userCode: uCode,
            chatId: result.group.id,
            members: result.group.members,
            membersCount: result.group.membersCount,
          };
          const sendJoinEvent = () => {
            try { grpChannel.trigger('client-member-joined', rosterPayload); } catch {}
            try { grpChannel.trigger('client-message', { ...sysMsg, type: 'message', chatId: result.group.id }); } catch {}
          };
          if (grpChannel.subscribed) sendJoinEvent();
          else grpChannel.bind('pusher:subscription_succeeded', sendJoinEvent);
        } catch {}
        try {
          ablyService.sendMessage(result.group.id, { ...sysMsg, type: 'message', chatId: result.group.id }).catch(() => {});
        } catch {}

        onClose();
      } else {
        useToastStore.getState().showToast(t('common.error', 'Ошибка'), 'text');
        setIsJoining(false);
      }
    } catch (err: any) {
      setIsJoining(false);
      const msg = err?.message === 'INVITE_EXPIRED'
        ? t('group.link_expired', t('groupSettings.link_expired', 'Срок истек'))
        : err?.message === 'INVITE_REVOKED'
        ? t('group.link_revoked', t('groupSettings.link_revoked', 'Доступ закрыт'))
        : err?.message === 'GROUP_FULL'
        ? t('group.max_members_reached', t('groupSettings.max_members_reached', 'Лобби заполнено'))
        : t('common.error', 'Ошибка');
      useToastStore.getState().showToast(msg, 'text');
    }
  }, [inviteUrl, isJoining, isExpiredOrRevoked, isAlreadyMember, handleOpenExisting, onClose, t]);

  if (!inviteUrl) return null;

  const groupAvatarUrl = groupInfo?.avatarUrl || existingChat?.avatarUrl || null;
  const displayName = groupInfo?.name || existingChat?.name || (isLoading ? '...' : t('chatWindow.group', 'Лобби'));
  const invitationText = t('group.group_invitation', t('groupSettings.group_invitation', 'Приглашение в лобби'));
  const linkExpiredText = t('group.link_expired_or_revoked', t('groupSettings.link_expired_or_revoked', 'Ссылка устарела или закрыта'));
  const alreadyMemberText = t('group.already_member', t('groupSettings.already_member', 'Вы уже состоите в этом лобби'));
  const openChatText = t('group.open_chat', 'Перейти к чату');
  const joinText = t('group.join', t('groupSettings.join', 'Присоединиться'));
  const cancelText = t('group.cancel', t('common.cancel', 'Отменить'));

  let subtitleText = invitationText;
  if (isAlreadyMember) {
    subtitleText = alreadyMemberText;
  } else if (isExpiredOrRevoked) {
    if (groupInfo?.inviteActive === false) {
      subtitleText = t('groupSettings.link_revoked', 'Доступ закрыт');
    } else if (groupInfo?.inviteExpiresAt && Date.now() > groupInfo.inviteExpiresAt) {
      subtitleText = t('groupSettings.link_expired', 'Срок истек');
    } else {
      subtitleText = linkExpiredText;
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="group-invite-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          border: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full relative overflow-hidden flex flex-col items-center text-center"
          style={{
            maxWidth: '400px',
            backgroundColor: 'var(--settings-bg, var(--bg-primary, #0f0f13))',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            border: 'none',
            padding: isExpiredOrRevoked ? '36px 24px 36px' : '32px 24px 24px',
            color: 'var(--text-main)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-[92px] h-[92px] rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{
              borderRadius: '9999px',
              backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.08))',
            }}
          >
            {groupAvatarUrl ? (
              <Avatar
                src={groupAvatarUrl}
                alt={displayName}
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: 'var(--accent-gradient, linear-gradient(135deg, var(--accent-color, #5865F2), var(--accent-dark, #4752c4)))' }}
              >
                <Users size={40} className="text-white" />
              </div>
            )}
          </div>

          <div
            className="truncate max-w-full text-center"
            style={{
              marginTop: '16px',
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--text-main)',
              lineHeight: '1.3',
            }}
          >
            {displayName}
          </div>

          <div
            className="flex items-center justify-center gap-2"
            style={{
              marginTop: '8px',
              color: isExpiredOrRevoked ? '#ff4d4f' : 'var(--text-dim, #9ca3af)',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {isExpiredOrRevoked ? <InactiveLinkIcon /> : <ActiveLinkIcon />}
            <span>{subtitleText}</span>
          </div>

          {!isExpiredOrRevoked && (
            <div className="w-full flex flex-col gap-2.5" style={{ marginTop: '28px' }}>
              {isAlreadyMember ? (
                <button
                  type="button"
                  onClick={handleOpenExisting}
                  aria-label={openChatText}
                  style={{
                    width: '100%',
                    height: '44px',
                    borderRadius: '9999px',
                    backgroundColor: 'var(--accent-color, #7C3AED)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '15px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  {openChatText}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={isJoining || isLoading}
                  aria-label={joinText}
                  style={{
                    width: '100%',
                    height: '44px',
                    borderRadius: '9999px',
                    backgroundColor: 'var(--accent-color, #7C3AED)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '15px',
                    cursor: isJoining || isLoading ? 'default' : 'pointer',
                    opacity: isJoining || isLoading ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  {isJoining ? '...' : joinText}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={isJoining}
                aria-label={cancelText}
                style={{
                  width: '100%',
                  height: '44px',
                  borderRadius: '9999px',
                  backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.08))',
                  color: 'var(--text-main, #ffffff)',
                  border: 'none',
                  fontWeight: 500,
                  fontSize: '15px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {cancelText}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
