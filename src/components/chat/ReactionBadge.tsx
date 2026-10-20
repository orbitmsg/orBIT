import React, { useMemo, useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';
import { supabaseService } from '../../services/supabaseService';

const POPULAR_REACTIONS: Record<string, number> = {
  '👍': 1,
  '❤️': 2,
  '🔥': 3,
  '🎉': 4,
  '😂': 5,
  '😮': 6,
  '😢': 7,
  '👏': 8,
  '🙏': 9,
  '👎': 10,
};

const profileAvatarCache = new Map<string, string>();

interface ReactionBadgeProps {
  emoji: string;
  users: string[];
  onToggle: (emoji: string) => void;
  activeChatId?: string;
  isChannel?: boolean;
  isOwn?: boolean;
}

export const ReactionBadge: React.FC<ReactionBadgeProps> = React.memo(({
  emoji,
  users,
  onToggle,
  activeChatId,
  isChannel: isChannelProp,
  isOwn = false,
}) => {
  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myUserId = useAuthStore((s) => s.userId);
  const myAvatarUrl = useAuthStore((s) => s.avatarUrl);
  const myCode = useChatStore((s) => s.myCode);
  const activeChat = useChatStore((s) => {
    const cid = activeChatId || s.activeChatId;
    return s.chats.find((c) => c.id === cid);
  });
  const chats = useChatStore((s) => s.chats);
  const usersById = useChatStore((s) => s.usersById);

  const isChannel = isChannelProp !== undefined ? isChannelProp : (activeChat?.type === 'channel');
  const [, setCacheTick] = useState(0);

  const { uniqueUsers, uniqueCount, hasReacted } = useMemo(() => {
    const lowerUserId = myUserId ? myUserId.toLowerCase() : null;
    const lowerCode = myCode ? myCode.toLowerCase() : null;
    const lowerNick = myNickname ? myNickname.toLowerCase() : null;
    const seen = new Set<string>();
    const list: string[] = [];
    let reacted = false;

    for (const u of users) {
      const lowerU = u.toLowerCase();
      const isMe =
        (myUserId && u === myUserId) ||
        (lowerUserId && lowerU === lowerUserId) ||
        (myCode && u === myCode) ||
        (lowerCode && lowerU === lowerCode) ||
        (myNickname && u === myNickname) ||
        (lowerNick && lowerU === lowerNick) ||
        u === 'YOU' ||
        lowerU === 'you';

      const key = isMe ? '__ME__' : lowerU;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(u);
      }
      if (isMe) reacted = true;
    }

    return {
      uniqueUsers: list,
      uniqueCount: Math.max(1, list.length),
      hasReacted: reacted,
    };
  }, [users, myUserId, myCode, myNickname]);

  useEffect(() => {
    if (isChannel) return;
    const topThree = uniqueUsers.slice(0, 3);
    topThree.forEach((u) => {
      const lowerU = u.toLowerCase();
      const isMe =
        (myUserId && u === myUserId) ||
        (myUserId && lowerU === myUserId.toLowerCase()) ||
        (myCode && u === myCode) ||
        (myNickname && u === myNickname) ||
        u === 'YOU' ||
        lowerU === 'you';
      if (isMe || profileAvatarCache.has(u)) return;

      if (u.length >= 6) {
        supabaseService
          .lookupPublicProfile(u)
          .then((p) => {
            if (p?.avatar_url) {
              profileAvatarCache.set(u, p.avatar_url);
              setCacheTick((prev) => prev + 1);
            }
          })
          .catch(() => {});
      }
    });
  }, [uniqueUsers, isChannel, myUserId, myCode, myNickname]);

  const visibleUsersData = useMemo(() => {
    if (isChannel) return [];
    const topThree = uniqueUsers.slice(0, 3);
    const lowerUserId = myUserId ? myUserId.toLowerCase() : null;
    const lowerCode = myCode ? myCode.toLowerCase() : null;
    const lowerNick = myNickname ? myNickname.toLowerCase() : null;

    return topThree.map((u) => {
      const lowerU = u.toLowerCase();
      const isMe =
        (myUserId && u === myUserId) ||
        (lowerUserId && lowerU === lowerUserId) ||
        (myCode && u === myCode) ||
        (lowerCode && lowerU === lowerCode) ||
        (myNickname && u === myNickname) ||
        (lowerNick && lowerU === lowerNick) ||
        u === 'YOU' ||
        lowerU === 'you';

      if (isMe) {
        return {
          id: u,
          name: myNickname,
          avatarUrl: myAvatarUrl || null,
        };
      }

      if (activeChat?.type === 'private') {
        return {
          id: u,
          name: activeChat.name || u,
          avatarUrl: activeChat.avatarUrl || null,
        };
      }

      if (activeChat?.type === 'group' && activeChat.members) {
        const member = activeChat.members.find(
          (m: any) =>
            m.userId === u ||
            m.userCode === u ||
            m.nickname === u ||
            m.user_code === u ||
            m.user_id === u ||
            (m.nickname && m.nickname.toLowerCase() === lowerU)
        );
        if (member) {
          return {
            id: u,
            name: member.nickname || (member as any).name || u,
            avatarUrl: member.avatarUrl || (member as any).avatar_url || null,
          };
        }
      }

      if (usersById[u]) {
        return {
          id: u,
          name: usersById[u].nickname || (usersById[u] as any).name || u,
          avatarUrl: usersById[u].avatarUrl || null,
        };
      }

      const directChat = chats.find(
        (c) =>
          c.type === 'private' &&
          (c.peerCode === u || c.id === u || c.name === u || (c.name && c.name.toLowerCase() === lowerU))
      );
      if (directChat) {
        return {
          id: u,
          name: directChat.name || u,
          avatarUrl: directChat.avatarUrl || null,
        };
      }

      return {
        id: u,
        name: u,
        avatarUrl: profileAvatarCache.get(u) || null,
      };
    });
  }, [uniqueUsers, isChannel, myUserId, myCode, myNickname, myAvatarUrl, activeChat, chats, usersById]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(emoji);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${emoji} ${uniqueCount}`}
      className={`reaction-badge-btn select-none active:scale-95 ${isOwn ? 'is-own' : 'is-incoming'} ${hasReacted ? 'is-active' : 'is-inactive'}`}
    >
      <span
        className="emoji-font"
        style={{
          fontSize: '15px',
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {emoji}
      </span>

      {!isChannel ? (
        <>
          {visibleUsersData.map((user, idx) => (
            <Avatar
              key={user.id + idx}
              src={user.avatarUrl}
              alt={user.name}
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                flexShrink: 0,
                marginLeft: idx > 0 ? -8 : 0,
                boxShadow: '0 0 0 2px var(--reaction-badge-bg, #383a42)',
                position: 'relative',
                zIndex: idx + 1,
                pointerEvents: 'none',
                transition: 'box-shadow 0.15s ease',
              }}
            />
          ))}
          {uniqueCount >= 4 && (
            <span
              className="tabular-nums"
              style={{
                fontSize: '12.5px',
                fontWeight: 600,
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
                color: 'inherit',
                transition: 'color 0.15s ease',
              }}
            >
              {uniqueCount}
            </span>
          )}
        </>
      ) : (
        <span
          className="tabular-nums"
          style={{
            fontSize: '12.5px',
            fontWeight: 600,
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            color: 'inherit',
            transition: 'color 0.15s ease',
          }}
        >
          {uniqueCount}
        </span>
      )}
    </button>
  );
});

ReactionBadge.displayName = 'ReactionBadge';

interface MessageReactionsProps {
  reactions?: Record<string, string[]>;
  onToggleReaction: (emoji: string) => void;
  isOwn?: boolean;
  activeChatId?: string;
  isChannel?: boolean;
  isSmallMessage?: boolean;
}

export const MessageReactions: React.FC<MessageReactionsProps> = React.memo(({
  reactions,
  onToggleReaction,
  isOwn = false,
  activeChatId,
  isChannel,
  isSmallMessage = false,
}) => {
  const entries = useMemo(() => {
    if (!reactions) return [];
    return Object.entries(reactions)
      .filter(([emoji, users]) => !emoji.startsWith('_') && Array.isArray(users) && users.length > 0)
      .sort(([a], [b]) => {
        const orderA = POPULAR_REACTIONS[a] ?? 100;
        const orderB = POPULAR_REACTIONS[b] ?? 100;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
  }, [reactions]);

  if (entries.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1 z-10 select-none items-center"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        maxWidth: isSmallMessage ? '170px' : '230px',
        width: 'fit-content',
        justifyContent: 'flex-start',
      }}
    >
      {entries.map(([emoji, users]) => (
        <ReactionBadge
          key={emoji}
          emoji={emoji}
          users={users}
          onToggle={onToggleReaction}
          activeChatId={activeChatId}
          isChannel={isChannel}
          isOwn={isOwn}
        />
      ))}
    </div>
  );
});

MessageReactions.displayName = 'MessageReactions';
