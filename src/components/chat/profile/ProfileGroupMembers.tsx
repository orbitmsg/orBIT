import React from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, ShieldCheck, Trash2 } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { DeveloperBadge } from '../../ui/DeveloperBadge';
import { formatLastSeen } from '../../../utils/messageUtils';
import { groupService } from '../../../services/groupService';
import { generateKeyPair, generateChatId, getDirectChatId } from '../../../lib/crypto';
import { useChatStore, type Chat } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';

interface ProfileGroupMembersProps {
  chat: Chat;
  myUserId?: string;
  myNickname?: string;
  memberAvatars: Record<string, string>;
  isGroupOwner: boolean;
  isGroupAdmin: boolean;
  onOpenAddMember: () => void;
  onOpenDeleteGroup: () => void;
  onClose: () => void;
  setActiveChat: (chatId: string) => void;
}

export const ProfileGroupMembers: React.FC<ProfileGroupMembersProps> = ({
  chat,
  myUserId,
  myNickname,
  memberAvatars,
  isGroupOwner,
  isGroupAdmin,
  onOpenAddMember,
  onOpenDeleteGroup,
  onClose,
  setActiveChat,
}) => {
  const { t } = useTranslation();
  const updateChat = useChatStore((s) => s.updateChat);

  return (
    <>
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
        <div
          style={{
            padding: '12px 20px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
              {t('groupSettings.participants', 'Участники')}
            </span>
          </div>
          {isGroupAdmin && (chat.members?.length || 1) < 10 && (
            <button
              type="button"
              onClick={onOpenAddMember}
              aria-label={t('groupSettings.add_member', 'Добавить участника')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-color, #9b7dd4)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                borderRadius: '6px',
              }}
            >
              <UserPlus size={15} />
              <span>{t('common.add', 'Добавить')}</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {(chat.members || []).map((member, index) => {
            const isMemberOwner = member.role === 'owner';
            const isMemberAdmin = member.role === 'admin';
            const memberCandidateCodes = [
              (member as any).userCode,
              (member as any).user_code,
              member.userId,
              (member as any).user_id,
            ].filter((x): x is string => typeof x === 'string' && x.length > 0);
            const member36Code = memberCandidateCodes.find((c) => c.length === 36);
            const memberCode = member36Code || memberCandidateCodes[0];
            const currentCode = useChatStore.getState().myCode;
            const myAuthUserId = useAuthStore.getState().userId;
            const myAvatarUrl = useAuthStore.getState().avatarUrl;
            const myIds = [currentCode, myUserId, myAuthUserId].filter((x): x is string => typeof x === 'string' && x.length > 0);
            const isSelf = Boolean(
              memberCandidateCodes.some((code) => myIds.includes(code))
            );
            const allChats = useChatStore.getState().chats || [];
            const directChat = allChats.find(
              (c: any) =>
                c.type === 'private' &&
                c.id !== 'notes' &&
                ((c.peerCode && memberCandidateCodes.includes(c.peerCode)) ||
                  (c.originalPeerCode && memberCandidateCodes.includes(c.originalPeerCode)) ||
                  (c.userId && memberCandidateCodes.includes(c.userId)))
            );
            const userObj = Object.values(useChatStore.getState().usersById || {}).find(
              (u: any) =>
                memberCandidateCodes.some((c) => u.id === c || (u as any).userId === c || (u as any).user_code === c || (u as any).userCode === c)
            );
            const effectiveAvatar = (isSelf && myAvatarUrl)
              ? myAvatarUrl
              : (
                  member.avatarUrl ||
                  (member as any).avatar_url ||
                  (memberCode ? memberAvatars[memberCode] : null) ||
                  directChat?.avatarUrl ||
                  (userObj as any)?.avatarUrl ||
                  null
                );
            const isMemberOnline = isSelf ||
              Boolean(chat.onlineCount && chat.members && chat.onlineCount >= chat.members.length) ||
              Boolean(chat.onlineMemberIds && (
                memberCandidateCodes.some((code) => chat.onlineMemberIds?.includes(code))
              ));

            const handleMemberClick = () => {
              if (isSelf) return;
              const currentChats = useChatStore.getState().chats;
              const candidateCodes = new Set<string>();
              memberCandidateCodes.forEach((code) => candidateCodes.add(code));
              for (const c of currentChats) {
                if (c.members) {
                  const mb = c.members.find((m: any) => memberCandidateCodes.some((mc) => m.userId === mc || m.userCode === mc || (m as any).user_code === mc || (m as any).user_id === mc));
                  if (mb?.userCode) candidateCodes.add(mb.userCode);
                  if ((mb as any)?.user_code) candidateCodes.add((mb as any).user_code);
                  if (mb?.userId) candidateCodes.add(mb.userId);
                }
                if (c.type === 'private' && c.id !== 'notes') {
                  if (
                    (c.peerCode && candidateCodes.has(c.peerCode)) ||
                    (c.originalPeerCode && candidateCodes.has(c.originalPeerCode)) ||
                    ((c as any).userId && candidateCodes.has((c as any).userId)) ||
                    (effectiveAvatar && c.avatarUrl && c.avatarUrl === effectiveAvatar)
                  ) {
                    if (c.peerCode) candidateCodes.add(c.peerCode);
                    if (c.originalPeerCode) candidateCodes.add(c.originalPeerCode);
                    if ((c as any).userId) candidateCodes.add((c as any).userId);
                  }
                }
              }
              for (const u of Object.values(useChatStore.getState().usersById || {})) {
                if (memberCandidateCodes.some((mc) => u.id === mc || (u as any).userId === mc || (u as any).userCode === mc || (u as any).user_code === mc)) {
                  if (u.id) candidateCodes.add(u.id);
                  if ((u as any).userCode) candidateCodes.add((u as any).userCode);
                  if ((u as any).userId) candidateCodes.add((u as any).userId);
                }
              }
              myIds.forEach((id) => candidateCodes.delete(id));
              if (candidateCodes.size === 0) return;

              const candidateArray = Array.from(candidateCodes);
              const target36 = candidateArray.find((c) => c.length === 36);
              const targetCode = target36 || candidateArray.find((c) => c.length !== 64) || candidateArray[0];
              if (!targetCode) return;

              const directChatIds = new Set<string>();
              for (const mId of myIds) {
                for (const cCode of candidateArray) {
                  directChatIds.add(getDirectChatId(mId, cCode));
                }
              }

              const matchingChats = currentChats.filter(
                (c) =>
                  c.type === 'private' &&
                  c.id !== 'notes' &&
                  (directChatIds.has(c.id) ||
                    (c.peerCode && candidateCodes.has(c.peerCode)) ||
                    (c.originalPeerCode && candidateCodes.has(c.originalPeerCode)) ||
                    ((c as any).userId && candidateCodes.has((c as any).userId)) ||
                    (effectiveAvatar && c.avatarUrl && c.avatarUrl === effectiveAvatar))
              );
              const existing = matchingChats.find((c) => c.peerCode && c.peerCode.length === 36) || matchingChats[0];
              if (existing) {
                matchingChats.forEach((c) => {
                  if (c.id !== existing.id && c.peerCode && c.peerCode.length === 64) {
                    useChatStore.getState().deleteChat(c.id);
                  }
                });
                setActiveChat(existing.id);
                onClose();
              } else {
                const myKeys = generateKeyPair();
                const preferredMyId = myIds.find((id) => id.length === 36) || myIds[0];
                const newChatId = (preferredMyId && targetCode) ? getDirectChatId(preferredMyId, targetCode) : generateChatId();
                useChatStore.getState().addChat({
                  id: newChatId,
                  type: 'private',
                  name: member.nickname || targetCode,
                  lastMsg: '',
                  online: isMemberOnline,
                  isChatInitiator: true,
                  sharedSecret: myKeys.privateKey,
                  avatarUrl: effectiveAvatar || undefined,
                  peerCode: targetCode,
                  originalPeerCode: targetCode,
                });
                setActiveChat(newChatId);
                onClose();
              }
            };

            return (
              <div
                key={memberCode || `${member.nickname}_${index}`}
                onClick={handleMemberClick}
                className={`flex items-center justify-between transition-colors ${
                  isSelf ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.06))]'
                }`}
                style={{
                  gap: '12px',
                  borderRadius: '12px',
                  margin: '2px 8px',
                  width: 'calc(100% - 16px)',
                  padding: '8px 12px',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                  <Avatar
                    src={effectiveAvatar}
                    alt={member.nickname}
                    className="w-9 h-9 rounded-full flex-shrink-0"
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`truncate ${isSelf ? '' : 'hover:underline'}`} style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-main)' }}>
                        {member.nickname}
                      </span>
                      <DeveloperBadge userId={memberCode || member.userId || member.nickname} nickname={member.nickname} size={24} />
                    </div>
                    <span style={{ fontSize: '11px', color: isMemberOnline ? 'var(--accent-color, #9b7dd4)' : 'var(--text-dim)' }}>
                      {isMemberOnline ? t('userStatus.online', 'в сети') : (member.lastSeen ? formatLastSeen(member.lastSeen, t) : t('userStatus.offline', 'был(а) недавно'))}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>
                  {isMemberOwner ? (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        backgroundColor: 'rgba(155, 125, 212, 0.18)',
                        color: 'var(--accent-color, #9b7dd4)',
                        userSelect: 'none',
                      }}
                    >
                      {t('groupSettings.owner', 'владелец').toLowerCase()}
                    </span>
                  ) : isMemberAdmin ? (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        backgroundColor: 'rgba(59, 130, 246, 0.18)',
                        color: '#60a5fa',
                        userSelect: 'none',
                      }}
                    >
                      {t('groupSettings.admin', 'админ').toLowerCase()}
                    </span>
                  ) : null}

                  {isGroupAdmin && !isMemberOwner && !isSelf && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isGroupOwner && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const newRole = isMemberAdmin ? 'member' : 'admin';
                            await groupService.updateMemberRole(chat.id, member.nickname, newRole, memberCode, myNickname);
                            const updatedMembers = (chat.members || []).map((m: any) => {
                              const mCandidates = [(m as any).userCode, (m as any).user_code, m.userId, (m as any).user_id].filter(Boolean);
                              const isTarget = memberCandidateCodes.some((c) => mCandidates.includes(c));
                              return isTarget ? { ...m, role: newRole as any } : m;
                            });
                            updateChat(chat.id, { members: updatedMembers });
                          }}
                          aria-label={isMemberAdmin ? t('groupSettings.demote', 'Снять права') : t('groupSettings.promote', 'Назначить админом')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: isMemberAdmin ? 'var(--text-dim)' : 'var(--accent-color, #9b7dd4)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          className="hover:bg-white/10 transition-colors"
                        >
                          <ShieldCheck size={16} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`${t('groupSettings.kick', 'Исключить')} ${member.nickname}?`)) {
                            await groupService.kickMember(chat.id, chat.sharedSecret!, member.nickname, myNickname || '', memberCode, member.userId);
                            const updatedMembers = (chat.members || []).filter((m: any) => {
                              const mCandidates = [(m as any).userCode, (m as any).user_code, m.userId, (m as any).user_id].filter(Boolean);
                              const isTarget = memberCandidateCodes.some((c) => mCandidates.includes(c));
                              return !isTarget;
                            });
                            updateChat(chat.id, {
                              members: updatedMembers,
                              membersCount: Math.max(1, (chat.membersCount || updatedMembers.length + 1) - 1),
                            });
                          }
                        }}
                        aria-label={t('groupSettings.kick', 'Исключить')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        className="hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isGroupOwner && (
        <div
          style={{
            width: '100%',
            padding: '0 16px',
            marginBottom: '16px',
            boxSizing: 'border-box',
          }}
        >
          <button
            type="button"
            onClick={onOpenDeleteGroup}
            aria-label={t('groupSettings.delete_group', 'Удалить группу')}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background 0.15s',
            }}
            className="hover:bg-red-500/20"
          >
            <Trash2 size={16} />
            <span>{t('groupSettings.delete_group', 'Удалить группу')}</span>
          </button>
        </div>
      )}
    </>
  );
};
