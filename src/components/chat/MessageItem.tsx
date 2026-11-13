import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DeveloperBadge } from '../ui/DeveloperBadge';
import { Pin } from 'lucide-react';
import { Message, Chat, useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { parseReplyChain, countEmojis, formatTimeOfDay, markdownToHtml, formatPreviewText } from '../../utils/messageUtils';
import { isEmojiOnly } from '../../lib/emoji-data';
import { MessageStatus } from '../MessageStatus';
import { MessageReactions } from './ReactionBadge';
import { ChannelMegaphoneIcon } from '../common/ChannelMegaphoneIcon';
import { ForwardedMessageBlock } from './ForwardedMessageBlock';
import { isValidLinkPreview } from '../../utils/linkPreviewUtils';

interface MessageItemProps {
  msg: Message;
  isOwn: boolean;
  isPinned: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  themeColor: string;
  bubbleRadius: number | string;
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  onQuoteClick?: (q: { id?: string; sender: string; text: string; time: string }) => void;
  isGroup?: boolean;
  isPrevSameSender?: boolean;
  onLinkClick?: (url: string) => void;
  onButtonClick?: (button: { text: string; action: string; channelId?: string; url?: string; data?: string; icon?: 'channel' | 'backup' | 'help' | 'link' }) => void;
  onSenderClick?: (senderId?: string, senderName?: string) => void;
  activeChat?: Chat;
  onRetry?: (messageId: string) => void;
  isSelected?: boolean;
}

const MessageText = ({
  text,
  timeNode,
  themeColor,
  isOwn = true,
  isEmojiOnly = false,
  onLinkClick,
}: {
  text: string;
  timeNode?: React.ReactNode;
  themeColor: string;
  isOwn?: boolean;
  isEmojiOnly?: boolean;
  onLinkClick?: (url: string) => void;
}) => {
  const handleHtmlClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      const url = target.getAttribute('href');
      if (url && onLinkClick) {
        onLinkClick(url);
      }
    } else if (target.classList.contains('spoiler') || target.getAttribute('data-spoiler') === 'true') {
      target.style.filter = target.style.filter === 'none' ? 'blur(3px)' : 'none';
    }
  };

  return (
    <div
      className={`${isOwn ? 'select-text-own' : 'select-text-incoming'}`}
      style={{
        fontSize: 'inherit',
        lineHeight: 1.3,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        width: '100%',
        position: 'relative',
      }}
    >
      <span className="selectable-message-text" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
        <span 
          style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}
          dangerouslySetInnerHTML={{ __html: markdownToHtml(text, themeColor || (isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))')) }} 
          onClick={handleHtmlClick}
        />
      </span>
      {timeNode && (
        <span
          aria-hidden
          className="flex-shrink-0 select-none message-time-badge"
          style={{
            float: 'right',
            marginLeft: '10px',
            marginRight: isOwn ? '-9px' : '-7px',
            marginBottom: '-4.5px',
            marginTop: isEmojiOnly ? '16px' : '6px',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {timeNode}
        </span>
      )}
      <div style={{ clear: 'both' }} />
    </div>
  );
};

export const MessageItem: React.FC<MessageItemProps> = React.memo(
  ({ msg, isOwn, isPinned, onContextMenu, themeColor, bubbleRadius, currentUserId, onToggleReaction, onQuoteClick, isGroup = false, isPrevSameSender = false, onLinkClick, onButtonClick, onSenderClick, activeChat: activeChatProp, onRetry, isSelected }) => {
    const { t } = useTranslation();
    const myCode = useChatStore((s) => s.myCode);
    const myNickname = useAuthStore((s) => s.nickname);
    const storeActiveChat = useChatStore((s) => s.chats.find(c => c.id === s.activeChatId));
    const activeChat = activeChatProp || storeActiveChat;
    const parsed = useMemo(() => parseReplyChain(msg.text), [msg.text]);
    const isEmoji = useMemo(() => isEmojiOnly(parsed.body) && parsed.body.trim().length > 0, [parsed.body]);
    const emojiCount = useMemo(() => (isEmoji ? countEmojis(parsed.body) : 0), [parsed.body, isEmoji]);

    const timeStr = useMemo(() => formatTimeOfDay(msg.time), [msg.time]);

    const isEmojiNoBubble = isEmoji && emojiCount >= 1 && emojiCount < 4;

    const emojiNoBubbleStyle = useMemo(() => {
      if (emojiCount === 1) {
        return { fontSize: '90px', lineHeight: 1.1 };
      }
      if (emojiCount === 2 || emojiCount === 3) {
        return { fontSize: '40px', lineHeight: 1.2 };
      }
      return { fontSize: 'inherit' };
    }, [emojiCount]);

    const bubbleFontSize = useMemo(() => {
      if (isEmoji && emojiCount >= 4) {
        return '22px';
      }
      return 'inherit';
    }, [isEmoji, emojiCount]);

    const isChannel = activeChat?.type === 'channel';
    const isJustSent = isOwn && (Date.now() - msg.time < 1500);

    const timeBadge = (
      <span
        className="tabular-nums select-none message-time-badge"
        style={{
          color: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 88%, transparent)' : 'var(--text-dim)',
          fontSize: '11px',
          display: 'inline-flex',
          alignItems: 'center',
          lineHeight: 1,
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {msg.isEdited && (
          <span style={{ marginRight: '4px', opacity: 0.75, fontSize: '10px', fontStyle: 'italic', userSelect: 'none', WebkitUserSelect: 'none' }}>
            {t('chatWindow.edited')}
          </span>
        )}
        <span style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>{timeStr}</span>
        {isOwn && (
          <span style={{ display: 'inline-flex', width: (msg.status === 'failed' || msg.status === 'error') ? '20px' : '26px', minWidth: (msg.status === 'failed' || msg.status === 'error') ? '20px' : '26px', flexShrink: 0, justifyContent: 'flex-end', userSelect: 'none', WebkitUserSelect: 'none' }}>
            <MessageStatus
              status={
                (msg.status === 'failed' || msg.status === 'error')
                  ? 'failed'
                  : msg.status === 'read' || (!msg.uploading && msg.read)
                  ? 'read'
                  : msg.status === 'delivered'
                  ? 'delivered'
                  : msg.status === 'sent'
                  ? 'sent'
                  : msg.uploading || msg.status === 'sending' || msg.status === 'pending'
                  ? 'sending'
                  : 'sent'
              }
              isOwn={isOwn}
              color={isOwn ? 'var(--bubble-own-text, #ffffff)' : undefined}
              onRetry={(msg.status === 'failed' || msg.status === 'error') && onRetry ? () => onRetry(msg.id || '') : undefined}
            />
          </span>
        )}
      </span>
    );

    const msgReactions = msg.reactions;
    const hasReactions = Boolean(msgReactions && Object.keys(msgReactions).some((k) => !k.startsWith('_') && Array.isArray(msgReactions[k]) && msgReactions[k]!.length > 0));
    const hasLinkPreview = Boolean(
      msg.linkPreview &&
      isValidLinkPreview(msg.linkPreview)
    );

    const isShortMessage = (parsed.body.length < 35 && !parsed.quotes.length && !msg.linkPreview);

    return (
      <div
        onContextMenu={onContextMenu}
        data-message="true"
        data-message-id={msg.id}
        className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
        style={{ transformOrigin: isOwn ? 'top right' : 'top left' }}
      >
        {isEmojiNoBubble ? (
          <div
            data-bubble="true"
            className={`max-w-[min(440px,75%)] min-w-[50px] w-fit relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
            style={{ padding: '0px' }}
          >
            <span
              className="select-none"
              style={{
                ...emojiNoBubbleStyle,
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              {parsed.body}
            </span>
            <div
              className="select-none tabular-nums opacity-0 group-hover:opacity-100 transition-opacity duration-150 mt-1 message-time-badge"
              style={{
                backgroundColor: '#18191d',
                borderRadius: '5px',
                padding: '3px 8px',
                color: 'rgba(255, 255, 255, 0.95)',
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 1,
                zIndex: 1,
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              {msg.isEdited && (
          <span style={{ marginRight: '4px', opacity: 0.75, fontSize: '10px', fontStyle: 'italic', userSelect: 'none', WebkitUserSelect: 'none' }}>
            {t('chatWindow.edited')}
          </span>
        )}
        <span style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>{timeStr}</span>
              {isOwn && (
                <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '5px', flexShrink: 0, userSelect: 'none', WebkitUserSelect: 'none' }}>
                  <MessageStatus
                    status={
                      (msg.status === 'failed' || msg.status === 'error')
                        ? 'failed'
                        : msg.status === 'read' || (!msg.uploading && msg.read)
                        ? 'read'
                        : msg.status === 'delivered'
                        ? 'delivered'
                        : msg.status === 'sent'
                        ? 'sent'
                        : msg.uploading || msg.status === 'sending' || msg.status === 'pending'
                        ? 'sending'
                        : 'sent'
                    }
                    isOwn={isOwn}
                    onRetry={(msg.status === 'failed' || msg.status === 'error') && onRetry ? () => onRetry(msg.id || '') : undefined}
                  />
                </span>
              )}
            </div>
            <MessageReactions
              reactions={msg.reactions}
              onToggleReaction={(emoji) => onToggleReaction?.(emoji)}
              isOwn={isOwn}
              activeChatId={activeChat?.id}
              isChannel={isChannel}
              isSmallMessage={true}
            />
          </div>
        ) : (
          <div
            className="flex flex-col"
            style={{
              width: 'fit-content',
              minWidth: hasReactions ? (isOwn ? 140 : 120) : 50,
              maxWidth: hasLinkPreview ? 'min(480px, 85vw)' : 'min(440px, 75vw)',
            }}
          >
            <div
              data-bubble="true"
              className={`w-full relative flex flex-col ${isJustSent ? 'telegram-send-anim' : ''}`}
              style={{
                padding: '6.5px 12px 6.5px 11px',
                borderRadius: bubbleRadius,
                boxSizing: 'border-box',
                background: isSelected
                  ? (isOwn
                      ? 'color-mix(in srgb, var(--accent-color, #2c6bed) 76%, #000)'
                      : 'color-mix(in srgb, var(--chat-bubble-incoming-bg, var(--surface-container)) 78%, var(--accent-color, #7C3AED))')
                  : (isOwn
                      ? 'var(--chat-bubble-own-bg, #2c6bed)'
                      : 'var(--chat-bubble-incoming-bg, var(--surface-container))'),
                filter: isSelected ? 'brightness(0.9) contrast(1.05)' : 'none',
                transition: 'background 0.15s ease, filter 0.15s ease',
                color: isOwn
                  ? 'var(--bubble-own-text, #ffffff)'
                  : 'var(--chat-bubble-incoming-text, var(--text-main))',
                fontSize: bubbleFontSize,
              }}
            >
            {!isOwn && isGroup && msg.sender && !isPrevSameSender && (() => {
              const sMember = activeChat?.members?.find(
                (m) =>
                  (m.userId && m.userId === msg.senderId) ||
                  ((m as any).userCode && (m as any).userCode === msg.senderId) ||
                  ((m as any).user_code && (m as any).user_code === msg.senderId) ||
                  ((m as any).user_id && (m as any).user_id === msg.senderId) ||
                  (m.nickname && msg.sender && m.nickname === msg.sender)
              );
              const sDisplayName = sMember?.nickname || msg.sender;
              const isSenderOwner = Boolean(
                sMember?.role === 'owner' ||
                (activeChat?.creatorCode && (activeChat.creatorCode === msg.senderId || activeChat.creatorCode === (msg as any).senderUserId || activeChat.creatorCode === (msg as any).senderCode)) ||
                (activeChat?.creatorId && (activeChat.creatorId === msg.senderId || activeChat.creatorId === (msg as any).senderUserId)) ||
                activeChat?.members?.some((m) => {
                  const mId = m.userId || (m as any).userCode || (m as any).user_code;
                  const sId = msg.senderId || (msg as any).senderUserId || (msg as any).senderCode;
                  return Boolean(mId && sId && mId === sId && m.role === 'owner');
                })
              );
              const isSenderAdmin = !isSenderOwner && Boolean(
                sMember?.role === 'admin' ||
                activeChat?.members?.some((m) => {
                  const mId = m.userId || (m as any).userCode || (m as any).user_code;
                  const sId = msg.senderId || (msg as any).senderUserId || (msg as any).senderCode;
                  return Boolean(mId && sId && mId === sId && m.role === 'admin');
                })
              );

              return (
                <div
                  className="flex items-center mb-1 select-none message-sender-name"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    width: 'fit-content',
                    maxWidth: '100%',
                  }}
                >
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onSenderClick?.(msg.senderId, sDisplayName);
                    }}
                    className="font-semibold select-none message-sender-name hover:underline cursor-pointer"
                    style={{
                      color: 'var(--accent-text, var(--accent-color, #7C3AED))',
                      fontSize: '12.5px',
                      lineHeight: '1.2',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 380,
                    }}
                  >
                    {sDisplayName}
                  </span>
                  {isSenderOwner && (
                    <span
                      className="ml-1.5 px-2 py-0.5 rounded-[5px] text-[11px] font-medium flex-shrink-0 select-none inline-flex items-center"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 16%, transparent)',
                        color: 'var(--accent-text, var(--accent-color, #9b7dd4))',
                        lineHeight: 1.2,
                        borderRadius: '5px',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                      }}
                    >
                      {(sMember as any)?.customTitle || (sMember as any)?.roleTitle || t('groupSettings.owner', 'владелец').toLowerCase()}
                    </span>
                  )}
                  {isSenderAdmin && (
                    <span
                      className="ml-1.5 px-2 py-0.5 rounded-[5px] text-[11px] font-medium flex-shrink-0 select-none inline-flex items-center"
                      style={{
                        backgroundColor: 'rgba(22, 163, 74, 0.16)',
                        color: '#16a34a',
                        lineHeight: 1.2,
                        borderRadius: '5px',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                      }}
                    >
                      {(sMember as any)?.customTitle || (sMember as any)?.roleTitle || t('groupSettings.admin_badge', 'администратор').toLowerCase()}
                    </span>
                  )}
                </div>
              );
            })()}

            {msg.forwardedFrom && (
              <div className="mb-1 select-none">
                <ForwardedMessageBlock forwarded={msg.forwardedFrom} isOwn={isOwn} themeColor={themeColor} />
              </div>
            )}

            {parsed.quotes.length > 0 && (
              <div className="flex flex-col min-w-0 mb-1 select-none" style={{ gap: '4px', userSelect: 'none', WebkitUserSelect: 'none' }}>
                {parsed.quotes.map((q, depth) => (
                  <div
                    key={`${depth}-${q.time}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuoteClick?.(q);
                    }}
                    className="flex w-full items-start gap-2 cursor-pointer hover:opacity-85 transition-opacity"
                    style={{
                      padding: '5px 10px',
                      backgroundColor: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 15%, transparent)' : 'color-mix(in srgb, var(--accent-color) 12%, transparent)',
                      borderRadius: '0 5px 5px 0',
                      borderLeft: isOwn ? '3px solid var(--bubble-own-text, #ffffff)' : '3px solid var(--accent-text, var(--accent-color))',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {isChannel && <ChannelMegaphoneIcon size={12} className="flex-shrink-0" />}
                        <p
                          className="truncate font-semibold"
                          style={{
                            color: isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))',
                            fontSize: '12.5px',
                            lineHeight: '1.2',
                          }}
                        >
                          {q.sender}
                        </p>
                        <DeveloperBadge
                          userId={
                            (q as any).senderId ||
                            (q.sender && q.sender.length === 36 ? q.sender : undefined) ||
                            (q.sender === activeChat?.name ? (activeChat?.peerCode || activeChat?.id) : undefined) ||
                            (q.sender === myNickname || q.sender === currentUserId ? myCode : (activeChat?.peerCode || myCode))
                          }
                          size={18}
                        />
                      </div>
                      <p
                        className="truncate"
                        style={{
                          color: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 90%, transparent)' : 'var(--chat-bubble-incoming-text, var(--text-main))',
                          fontSize: '13px',
                          lineHeight: '1.35',
                          marginTop: '2px',
                        }}
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(formatPreviewText(q.text, t), isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))').replace(/<br\s*\/?>/gi, ' ') }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <MessageText
              text={parsed.body}
              timeNode={(!hasLinkPreview && !hasReactions) ? timeBadge : undefined}
              themeColor={isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))'}
              isOwn={isOwn}
              isEmojiOnly={isEmoji && emojiCount >= 4}
              onLinkClick={onLinkClick}
            />

              {hasLinkPreview && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onLinkClick && msg.linkPreview?.url) {
                      onLinkClick(msg.linkPreview.url);
                    }
                  }}
                  className="flex flex-col w-full min-w-0 mt-2 cursor-pointer hover:opacity-90 transition-opacity select-none"
                  style={{
                    padding: '8px 12px',
                    backgroundColor: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 12%, transparent)' : 'color-mix(in srgb, var(--accent-color) 10%, var(--surface-container-soft, transparent))',
                    borderRadius: '0 5px 5px 0',
                    borderLeft: isOwn ? '3px solid color-mix(in srgb, var(--bubble-own-text, #ffffff) 75%, transparent)' : '3px solid var(--accent-text, var(--accent-color))',
                  }}
                >
                  {msg.linkPreview!.siteName && (
                    <span
                      className="font-bold text-[12.5px] mb-0.5 truncate"
                      style={{ color: isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))' }}
                    >
                      {msg.linkPreview!.siteName}
                    </span>
                  )}
                  {msg.linkPreview!.title &&
                    (!msg.linkPreview!.siteName ||
                      msg.linkPreview!.title.trim().toLowerCase() !== msg.linkPreview!.siteName.trim().toLowerCase()) && (
                    <span
                      className="font-bold text-[13.5px] leading-snug mb-1 line-clamp-2"
                      style={{ color: isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--chat-bubble-incoming-text, var(--text-main))' }}
                    >
                      {msg.linkPreview!.title}
                    </span>
                  )}
                  {msg.linkPreview!.description && (
                    <span
                      className="text-[12.5px] leading-normal mb-1.5 opacity-90 line-clamp-4"
                      style={{ color: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 85%, transparent)' : 'var(--text-dim)' }}
                    >
                      {msg.linkPreview!.description}
                    </span>
                  )}
                  {msg.linkPreview!.image && (
                    <img
                      src={msg.linkPreview!.image}
                      alt=""
                      decoding="async"
                      loading="lazy"
                      className="w-full max-h-72 object-cover rounded-[5px] mt-1"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                </div>
              )}

              {hasLinkPreview && !hasReactions && (
                <div
                  className="flex justify-end items-center select-none message-time-badge"
                  style={{
                    marginRight: isOwn ? '-9px' : '-7px',
                    marginBottom: '-4.5px',
                    marginTop: '4px',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                  }}
                >
                  {timeBadge}
                </div>
              )}

              {hasReactions && (
                <div
                  className="flex items-end justify-between mt-1 w-full select-none"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    gap: '10px',
                    flexWrap: 'nowrap',
                  }}
                >
                  <MessageReactions
                    reactions={msg.reactions}
                    onToggleReaction={(emoji) => onToggleReaction?.(emoji)}
                    isOwn={isOwn}
                    activeChatId={activeChat?.id}
                    isChannel={isChannel}
                    isSmallMessage={isShortMessage}
                  />
                  <div
                    className="flex-shrink-0 select-none message-time-badge ml-auto"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      lineHeight: 1,
                      alignSelf: 'flex-end',
                      marginRight: isOwn ? '-9px' : '0px',
                      marginBottom: isOwn ? '-4.5px' : '0px',
                    }}
                  >
                    {timeBadge}
                  </div>
                </div>
              )}
            </div>

            {msg.buttons && msg.buttons.length > 0 && (
              <div className="flex flex-col w-full select-none" style={{ marginTop: '5px', gap: '5px' }}>
                {msg.buttons.map((btn, bIdx) => (
                  <button
                    key={bIdx}
                    onClick={(e) => {
                      e.stopPropagation();
                      onButtonClick?.(btn);
                    }}
                    aria-label={btn.text}
                    className="w-full flex items-center justify-center px-3.5 py-2 rounded-[5px] text-[13px] font-semibold transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--surface-container) 82%, var(--accent-color) 18%)',
                      color: 'var(--text-main)',
                      borderRadius: '5px',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      backdropFilter: 'blur(8px)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--surface-container) 70%, var(--accent-color) 30%)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--surface-container) 82%, var(--accent-color) 18%)';
                    }}
                  >
                    <span className="truncate">{btn.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {isPinned && (
          <Pin
            size={10}
            style={{ color: 'var(--accent-text, var(--accent-color, #7C3AED))' }}
            className="mt-1 select-none"
          />
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.status === next.msg.status &&
    prev.msg.text === next.msg.text &&
    prev.msg.reactions === next.msg.reactions &&
    prev.msg.time === next.msg.time &&
    prev.isOwn === next.isOwn &&
    prev.isPinned === next.isPinned &&
    prev.isPrevSameSender === next.isPrevSameSender &&
    prev.bubbleRadius === next.bubbleRadius &&
    prev.currentUserId === next.currentUserId &&
    prev.onButtonClick === next.onButtonClick &&
    prev.isSelected === next.isSelected
);