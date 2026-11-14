import React, { useCallback } from 'react';
import { File, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Message, type MediaItem, isMessageOutgoing } from '../../../store/useChatStore';
import { mediaManager } from '../../../services/mediaManager';
import { getOrbitaMediaUrl, calculateMediaDisplaySize } from '../../../lib/media-utils';
import { GroupedAudioBubble } from '../GroupedAudioBubble';
import { TelegramAlbumGrid } from '../TelegramAlbumGrid';
import { EncryptedMedia } from '../EncryptedMedia';
import { CallMessage } from '../CallMessage';
import { MessageText } from '../MessageText';
import { FileMessage } from '../FileMessage';
import { VoiceMessagePlayer } from '../VoiceMessagePlayer';
import { TgsPlayer } from '../TgsPlayer';
import { MessageReactions } from '../ReactionBadge';
import { MessageStatus } from '../../MessageStatus';
import { MessageItem } from '../MessageItem';
import { ForwardedMessageBlock } from '../ForwardedMessageBlock';
import { Avatar } from '../../common/Avatar';
import { CustomPinIcon } from '../ChatIcons';
import { ChannelMegaphoneIcon } from '../../common/ChannelMegaphoneIcon';
import { AudioMessageBubble } from '../AudioMessageBubble';
import { orbitFs } from '../chatUtils';
import { parseReplyChain, countEmojis, formatTimeOfDay, arrayBufferToBase64 } from '../../../utils/messageUtils';
import { isEmojiOnly } from '../../../lib/emoji-data';
import { parseMedia, formatTime, isSameDay } from './chatWindowHelpers';
import { type MediaViewerItem } from '../TelegramMediaViewer';
import { cancelActiveMediaUpload } from './useChatAudioAndFiles';

export interface ChatMessageItemProps {
  index: number;
  msg: Message;
  prevMsg: Message | null;
  nextMsg: Message | null;
  myCode: string;
  myNickname: string;
  myUserId?: string;
  activeChat: any;
  activeChatId: string | null;
  sharedSecret?: string | null;
  bubbleRadius: string | number;
  themeColor: string;
  highlightedIndex: number | null;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  selection?: {
    isSelectionMode: boolean;
    selectedIds: Set<string>;
  };
  editingIndex: number | null;
  editText: string;
  setEditText: (v: string) => void;
  setEditingIndex: (v: number | null) => void;
  memberAvatars: Record<string, string>;
  isMessagePinned: (msgOrId: any) => boolean;
  getDateLabel: (time: number) => string;
  openMediaViewer: (url: string, msgId?: string, items?: MediaViewerItem[], index?: number) => void;
  triggerReactionMessage: (id: any, emoji: string) => void;
  triggerEditMessage: (index: number, newText: string) => void | Promise<void>;
  handleMessageClick: (e: React.MouseEvent, id: string) => void;
  handleContextMenu: (e: React.MouseEvent, target: Message | number, isOwn: boolean) => void;
  handleCallPress: () => void;
  handleQuoteClick: (quote: any, index: number) => void;
  handleLinkClick: (url: string) => void;
  handleMessageButtonClick: (btn: any) => void;
  handleOpenDirectChat: (senderId?: string, senderName?: string, memberObj?: any) => void;
  handleRetryMessage?: (indexOrId: number | string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  index,
  msg,
  prevMsg,
  nextMsg,
  myCode,
  myNickname,
  myUserId,
  activeChat,
  activeChatId,
  sharedSecret,
  bubbleRadius,
  themeColor,
  highlightedIndex,
  isSelected: isSelectedProp,
  isSelectionMode: isSelectionModeProp,
  selection,
  editingIndex,
  editText,
  setEditText,
  setEditingIndex,
  memberAvatars,
  isMessagePinned,
  getDateLabel,
  openMediaViewer,
  triggerReactionMessage,
  triggerEditMessage,
  handleMessageClick,
  handleContextMenu,
  handleCallPress,
  handleQuoteClick,
  handleLinkClick,
  handleMessageButtonClick,
  handleOpenDirectChat,
  handleRetryMessage,
}) => {
  const { t } = useTranslation();
  const stickersAutoplayChat = useChatStore((s) => s.stickersAutoplayChat);

  const isOwn = isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId);
  const media = parseMedia(msg);
  const isSelectionMode = typeof isSelectionModeProp === 'boolean'
    ? isSelectionModeProp
    : Boolean(selection?.isSelectionMode);
  const isSelected = typeof isSelectedProp === 'boolean'
    ? isSelectedProp
    : Boolean(isSelectionMode && msg.id && selection?.selectedIds?.has(msg.id));
  const isHighlighted = index === highlightedIndex;

  const isGif = Boolean(
    (media.url && /\.gif(\?.*)?$/i.test(media.url)) ||
    (msg.mediaUrl && (
      /\.gif(\?.*)?$/i.test(msg.mediaUrl) ||
      msg.mediaUrl.includes('tenor.com') ||
      msg.mediaUrl.includes('giphy.com') ||
      msg.mediaUrl.includes('.giphy.') ||
      msg.mediaUrl.includes('c.tenor.com')
    )) ||
    (msg.text && /^\[GIF\]/i.test(msg.text.trim())) ||
    (msg.mediaName && /\.gif$/i.test(msg.mediaName)) ||
    (msg.mediaName && /^animation\./i.test(msg.mediaName)) ||
    msg.mediaType === 'gif' ||
    (msg.mime === 'image/gif')
  );

  const isSameSender = (m1: Message | null, m2: Message | null) => {
    if (!m1 || !m2) return false;
    if (m1.senderId && m2.senderId) return m1.senderId === m2.senderId;
    if (m1.sender && m2.sender) return m1.sender === m2.sender;
    return false;
  };

  const prevIsOwn = prevMsg ? isMessageOutgoing(prevMsg, myCode, myNickname, activeChat, myUserId) : false;
  const isPrevSameSenderGroup = !!(
    prevMsg &&
    prevMsg.mediaType !== 'system' &&
    prevIsOwn === isOwn &&
    isSameSender(prevMsg, msg) &&
    Math.abs(msg.time - prevMsg.time) <= 15 * 60 * 1000 &&
    isSameDay(prevMsg.time, msg.time)
  );
  const nextIsOwn = nextMsg ? isMessageOutgoing(nextMsg, myCode, myNickname, activeChat, myUserId) : false;
  const isNextSameSenderGroup = !!(
    nextMsg &&
    nextMsg.mediaType !== 'system' &&
    nextIsOwn === isOwn &&
    isSameSender(nextMsg, msg) &&
    Math.abs(nextMsg.time - msg.time) <= 15 * 60 * 1000 &&
    isSameDay(nextMsg.time, msg.time)
  );

  const topGap = (index === 0 || !prevMsg) ? '4px' : (isPrevSameSenderGroup ? '2px' : '6px');

  const baseRadius = typeof bubbleRadius === 'number' ? `${bubbleRadius}px` : bubbleRadius;
  const smallRadius = '8px';

  let customRadius: string;
  if (isOwn) {
    const rTopLeft = baseRadius;
    const rBottomLeft = baseRadius;
    const rTopRight = isPrevSameSenderGroup ? smallRadius : baseRadius;
    const rBottomRight = isNextSameSenderGroup ? smallRadius : baseRadius;
    customRadius = `${rTopLeft} ${rTopRight} ${rBottomRight} ${rBottomLeft}`;
  } else {
    const rTopRight = baseRadius;
    const rBottomRight = baseRadius;
    const rTopLeft = isPrevSameSenderGroup ? smallRadius : baseRadius;
    const rBottomLeft = isNextSameSenderGroup ? smallRadius : baseRadius;
    customRadius = `${rTopLeft} ${rTopRight} ${rBottomRight} ${rBottomLeft}`;
  }

  const isGroup = activeChat?.type === 'group';
  const showGroupAvatar = isGroup && !isOwn && msg.mediaType !== 'system';

  const senderMember = activeChat?.members?.find(
    (m: any) =>
      (m.userId && m.userId === msg.senderId) ||
      (m.userCode && m.userCode === msg.senderId) ||
      ((m as any).user_code && (m as any).user_code === msg.senderId) ||
      ((m as any).user_id && (m as any).user_id === msg.senderId) ||
      (m.userCode && (msg as any).senderCode && m.userCode === (msg as any).senderCode) ||
      (m.nickname && msg.sender && m.nickname === msg.sender)
  ) || null;
  const senderNickname = senderMember?.nickname || msg.sender || '';
  const senderAvatar = (() => {
    if (senderMember?.avatarUrl) return senderMember.avatarUrl;
    if ((senderMember as any)?.avatar_url) return (senderMember as any).avatar_url;
    if ((msg as any).senderAvatar) return (msg as any).senderAvatar;
    if ((msg as any).avatarUrl) return (msg as any).avatarUrl;
    if ((msg as any).senderAvatarUrl) return (msg as any).senderAvatarUrl;
    if (msg.senderId && memberAvatars[msg.senderId]) return memberAvatars[msg.senderId];
    if ((msg as any).senderCode && memberAvatars[(msg as any).senderCode]) return memberAvatars[(msg as any).senderCode];
    if (senderMember?.userId && memberAvatars[senderMember.userId]) return memberAvatars[senderMember.userId];
    if ((senderMember as any)?.userCode && memberAvatars[(senderMember as any).userCode]) return memberAvatars[(senderMember as any).userCode];
    return null;
  })();

  const timeBadge = useCallback((m: Message, isPinned?: boolean) => {
    const mIsOwn = isMessageOutgoing(m, myCode, myNickname, activeChat, myUserId);
    const isFailed = m.status === 'failed' || m.status === 'error';
    return (
      <span className="tabular-nums select-none message-time-badge" style={{ color: mIsOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 88%, transparent)' : 'var(--text-dim)', fontSize: orbitFs(11), display: 'inline-flex', alignItems: 'center', lineHeight: 1, userSelect: 'none', WebkitUserSelect: 'none' }}>
        {isPinned && (
          <CustomPinIcon size={12} style={{ color: mIsOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color, #7C3AED))', userSelect: 'none' }} className="flex-shrink-0 select-none" />
        )}
        {m.isEdited && (
          <span style={{ marginRight: '4px', opacity: 0.75, fontSize: orbitFs(10), fontStyle: 'italic', userSelect: 'none', WebkitUserSelect: 'none' }}>
            {t('chatWindow.edited')}
          </span>
        )}
        <span style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>{formatTime(m.time)}</span>
        {mIsOwn && (
          <span style={{ display: 'inline-flex', width: isFailed ? '20px' : '26px', minWidth: isFailed ? '20px' : '26px', flexShrink: 0, justifyContent: 'flex-end', userSelect: 'none', WebkitUserSelect: 'none' }}>
            <MessageStatus
              status={
                isFailed
                  ? 'failed'
                  : m.status === 'read' || (!m.uploading && m.read)
                  ? 'read'
                  : m.status === 'delivered'
                  ? 'delivered'
                  : m.status === 'sent'
                  ? 'sent'
                  : m.uploading || m.status === 'sending' || m.status === 'pending'
                  ? 'sending'
                  : 'sent'
              }
              isOwn={mIsOwn}
              color={mIsOwn ? 'var(--bubble-own-text, #ffffff)' : undefined}
              onRetry={isFailed && handleRetryMessage ? () => handleRetryMessage(m.id || index) : undefined}
            />
          </span>
        )}
      </span>
    );
  }, [myCode, myNickname, activeChat, myUserId, handleRetryMessage, index]);

  const bubbleStyle = useCallback((bIsOwn: boolean, extra?: React.CSSProperties): React.CSSProperties => {
    const baseBg = bIsOwn ? 'var(--chat-bubble-own-bg, #2c6bed)' : 'var(--chat-bubble-incoming-bg, var(--surface-container))';
    const selectedBg = bIsOwn
      ? 'color-mix(in srgb, var(--accent-color, #2c6bed) 76%, #000)'
      : 'color-mix(in srgb, var(--chat-bubble-incoming-bg, var(--surface-container)) 78%, var(--accent-color, #7C3AED))';
    return {
      padding: '6.5px 12px 6.5px 11px',
      borderRadius: bubbleRadius,
      background: isSelected ? selectedBg : baseBg,
      filter: isSelected ? 'brightness(0.9) contrast(1.05)' : 'none',
      border: 'none',
      color: bIsOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--chat-bubble-incoming-text, var(--text-main))',
      fontSize: orbitFs(12),
      maxWidth: 'min(440px, 75%)',
      transition: 'background 0.15s ease, filter 0.15s ease',
      ...extra,
    };
  }, [bubbleRadius, isSelected]);

  const renderMediaGroup = useCallback((m: Message, _idx: number, cRadius?: string, overrideItems?: MediaItem[]) => {
    const mediaItems = overrideItems || m.mediaItems;
    if (!mediaItems || mediaItems.length === 0) return null;

    const isAudioItem = (item: MediaItem) =>
      item.type === 'audio' ||
      item.mime?.startsWith('audio/') ||
      /\.(mp3|wav|flac|aac|ogg|m4a|opus|wma|ape|alac)$/i.test(item.name || '');

    const isVisualItem = (item: MediaItem) =>
      item.type === 'photo' ||
      item.type === 'video' ||
      item.mime?.startsWith('image/') ||
      item.mime?.startsWith('video/') ||
      /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm|mkv|m4v)$/i.test(item.name || '');

    const hasAudio = mediaItems.some(isAudioItem);
    const hasPhotoOrVideo = mediaItems.some(isVisualItem);

    const mIsOwn = isMessageOutgoing(m, myCode, myNickname, activeChat, myUserId);

    if (hasAudio && !hasPhotoOrVideo) {
      return (
        <GroupedAudioBubble
          items={mediaItems}
          sharedSecret={sharedSecret || undefined}
          msg={m}
          timeNode={timeBadge(m, isMessagePinned(m))}
          isOwn={mIsOwn}
          onCancelUpload={m.uploading ? () => {
            if (activeChatId && m.id) {
              useChatStore.getState().deleteMessage(activeChatId, m.id);
            }
          } : undefined}
        />
      );
    }

    if (hasPhotoOrVideo) {
      const itemsToRender = mediaItems.slice(0, 10).map((it) => ({
        ...it,
        preview: (it as any).preview || (it.url?.startsWith('data:') || it.url?.startsWith('blob:') ? it.url : undefined),
      }));
      const viewerItems: MediaViewerItem[] = itemsToRender.map((item, vIdx) => {
        const isVGif = Boolean(
          item.type === 'gif' ||
          m.mediaType === 'gif' ||
          item.mime === 'image/gif' ||
          /\.gif(\?.*)?$/i.test(item.name || item.url || '') ||
          Boolean(item.url && (item.url.includes('tenor.com') || item.url.includes('giphy.com'))) ||
          (m.text && /^\[GIF\]/i.test(m.text.trim()))
        );
        const effectiveSecret = item.key || (item as any).mediaKey || m.mediaKey || (m as any).key || sharedSecret || undefined;
        const directUrl = getOrbitaMediaUrl(item.url, effectiveSecret, activeChatId || undefined, m.id, item.name, item.mime) || undefined;
        const senderId = m.senderId || (mIsOwn ? myUserId : undefined);
        const actualSender = (senderId ? (senderId === myUserId ? myNickname : useChatStore.getState().usersById[senderId]?.nickname) : undefined) || m.sender;
        return {
          id: `${m.id || 'msg'}_${vIdx}_${item.url}`,
          url: item.url,
          directUrl,
          type: isVGif ? 'gif' : ((item.type === 'video' || item.mime?.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(item.name || '')) ? 'video' : 'photo'),
          name: item.name,
          mime: item.mime,
          key: item.key || (item as any).mediaKey || m.mediaKey || (m as any).key,
          sharedSecret: effectiveSecret,
          duration: item.duration,
          width: item.width || m.width,
          height: item.height || m.height,
          sender: actualSender,
          senderId,
          isOwn: mIsOwn,
          time: m.time,
          messageId: m.id,
          thumbnail: (item as any).preview || item.thumbnail || (m as any).preview || item.blurPreview || m.blurPreview,
          blurPreview: item.blurPreview || m.blurPreview,
        };
      });

      return (
        <TelegramAlbumGrid
          chatId={activeChatId || undefined}
          items={itemsToRender}
          sharedSecret={sharedSecret || undefined}
          msg={m}
          timeNode={timeBadge(m, isMessagePinned(m))}
          customRadius={cRadius}
          isOwn={mIsOwn}
          onMediaClick={(tileIdx) => {
            const clicked = viewerItems[tileIdx];
            if (clicked) {
              openMediaViewer(clicked.url, m.id, viewerItems, tileIdx);
            }
          }}
          maxWidth={440}
        />
      );
    }

    return (
      <div
        className="grouped-files-bubble flex flex-col gap-1 p-2 select-none"
        style={{
          width: '260px',
          boxSizing: 'border-box',
          position: 'relative',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <style>{`
          .grouped-files-bubble,
          .grouped-files-bubble * {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-user-drag: none !important;
          }
        `}</style>
        {mediaItems.map((file, fIdx) => (
          <div
            key={fIdx}
            className="flex items-center gap-2.5 p-1.5 rounded-lg transition-colors cursor-pointer select-none"
            onClick={async () => {
              try {
                let arrayBuffer: ArrayBuffer | null = null;
                if (file.url.startsWith('data:') || file.url.startsWith('blob:')) {
                  const res = await fetch(file.url);
                  const b = await res.blob();
                  arrayBuffer = await b.arrayBuffer();
                } else if (sharedSecret || file.key || m.mediaKey) {
                  const item = await mediaManager.getMedia(file.url, file.key || m.mediaKey || sharedSecret || '', file.name, activeChatId || undefined, m.id);
                  if (item?.blobUrl) {
                    const res = await fetch(item.blobUrl);
                    const b = await res.blob();
                    arrayBuffer = await b.arrayBuffer();
                  }
                } else {
                  const item = await mediaManager.getMedia(file.url, '', file.name, activeChatId || undefined, m.id);
                  if (item?.blobUrl) {
                    const res = await fetch(item.blobUrl);
                    const b = await res.blob();
                    arrayBuffer = await b.arrayBuffer();
                  } else {
                    const res = await fetch(file.url);
                    const b = await res.blob();
                    arrayBuffer = await b.arrayBuffer();
                  }
                }
                if (arrayBuffer) {
                  const base64 = arrayBufferToBase64(arrayBuffer);
                  if (window.orbita && window.orbita.openFile) {
                    await window.orbita.openFile(base64, file.name || 'file');
                  }
                }
              } catch (err) {
                console.error('Failed to open grouped file:', err);
              }
            }}
          >
            <File size={22} className="flex-shrink-0" style={{ color: mIsOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))' }} />
            <div className="flex-1 min-w-0 select-none">
              <div className="text-xs font-medium truncate select-none" style={{ color: mIsOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--chat-bubble-incoming-text, var(--text-main))' }}>{file.name}</div>
              {file.size ? (
                <div className="text-[10.5px] select-none" style={{ color: mIsOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 78%, transparent)' : 'var(--text-dim)' }}>
                  {file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {m.text ? (
          <div className="flex items-end justify-between gap-3 px-1 pt-1 select-none">
            <div className="text-[13.5px] leading-snug break-words flex-1 select-none" style={{ color: mIsOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--chat-bubble-incoming-text, var(--text-main))' }}>
              {m.text}
            </div>
            <div className="flex items-center justify-end gap-1 flex-shrink-0 select-none">
              {timeBadge(m, isMessagePinned(m))}
            </div>
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              bottom: mIsOwn ? '2px' : '5px',
              right: mIsOwn ? '3px' : '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              pointerEvents: 'none',
              userSelect: 'none',
              lineHeight: 1,
            }}
          >
            {timeBadge(m, isMessagePinned(m))}
          </div>
        )}
      </div>
    );
  }, [sharedSecret, isMessagePinned, timeBadge, myCode, myNickname, activeChat, activeChatId]);

  const renderReactionBadges = useCallback((m: Message, idx: number, topOffset = 0) => {
    const isShort = !m.text || m.text.length < 35;
    const mIsOwn = isMessageOutgoing(m, myCode, myNickname, activeChat, myUserId);
    const isChannel = activeChat?.type === 'channel';
    return (
      <div style={{ display: 'flex', width: '100%', justifyContent: mIsOwn ? 'flex-end' : 'flex-start', marginTop: topOffset ? `${topOffset}px` : undefined }}>
        <MessageReactions
          reactions={m.reactions}
          onToggleReaction={(emoji) => triggerReactionMessage(m.id || idx, emoji)}
          isOwn={mIsOwn}
          activeChatId={activeChatId || undefined}
          isChannel={isChannel}
          isSmallMessage={isShort}
        />
      </div>
    );
  }, [myCode, myNickname, activeChat, activeChatId, myUserId, triggerReactionMessage]);

  const wrapWithGroupAvatar = (content: React.ReactNode) => {
    if (!showGroupAvatar) {
      return content;
    }
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
        <div
          style={{
            width: 34,
            height: 34,
            flexShrink: 0,
            marginRight: 10,
            marginBottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!isNextSameSenderGroup ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDirectChat(msg.senderId || (msg as any).senderCode, senderNickname, senderMember);
              }}
              className="cursor-pointer flex-shrink-0"
            >
              <Avatar
                src={senderAvatar}
                alt={senderNickname}
                className="w-[34px] h-[34px]"
                style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }}
              />
            </div>
          ) : (
            <div style={{ width: 34, height: 34 }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          {content}
        </div>
      </div>
    );
  };

  const highlightWrapperStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: isHighlighted
      ? 'color-mix(in srgb, var(--accent-color) 22%, transparent)'
      : 'transparent',
    transition: 'background-color 0.2s ease, padding-right 0.2s ease',
    paddingTop: topGap,
    paddingBottom: '0px',
    paddingRight: isSelectionMode ? '48px' : '10px',
    paddingLeft: '10px',
    boxSizing: 'border-box',
    position: 'relative',
    cursor: isSelectionMode ? 'pointer' : 'default',
  };

  const renderSelectionCircle = () => {
    if (!isSelectionMode) return null;
    return (
      <div
        style={{
          position: 'absolute',
          right: '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isSelected ? 'var(--accent-color, #7C3AED)' : 'var(--surface-container-soft)',
          border: isSelected ? 'none' : '1.5px solid var(--border-color)',
          transition: 'background-color 0.1s ease, border-color 0.1s ease, transform 0.1s ease',
          pointerEvents: 'none',
          zIndex: 10,
          boxSizing: 'border-box',
        }}
      >
        {isSelected && (
          <Check size={14} strokeWidth={3.2} color="var(--accent-on-color, #ffffff)" />
        )}
      </div>
    );
  };

  const isFirstOfDay = !prevMsg || !isSameDay(prevMsg.time, msg.time);
  const dateLabel = getDateLabel(msg.time);
  const dateDividerNode = isFirstOfDay ? (
    <div
      data-date-divider={dateLabel}
      className="flex justify-center items-center w-full my-2.5 select-none pointer-events-none date-badge"
      style={{ userSelect: 'none', WebkitUserSelect: 'none', transition: 'opacity 0.15s ease' }}
    >
      <div
        className="date-badge-pill select-none"
        style={{
          backgroundColor: 'var(--surface-container)',
          color: 'var(--text-main)',
          fontSize: '12px',
          fontWeight: 500,
          padding: '3px 12px',
          borderRadius: '9999px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'none',
          border: 'none',
          outline: 'none',
          filter: 'none',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {dateLabel}
      </div>
    </div>
  ) : null;

  const renderContent = () => {
    if (msg.mediaType === 'system') {
      const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      let displayedText = msg.text;
      if (typeof displayedText === 'string' && displayedText.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(displayedText);
          if (parsed.text) displayedText = parsed.text;
        } catch {}
      }
      if (msg.systemType === 'call' || msg.systemType === 'call_ended') {
        return null;
      }
      if (msg.systemType) {
        const act = msg.actorNickname || '';
        const trg = msg.targetNickname || '';
        if (msg.systemType === 'create') {
          displayedText = act ? t('system.group_created', { actor: act, defaultValue: `${act} создал(а) лобби` }) : t('system.group_created_generic', { defaultValue: 'Лобби создано' });
        } else if (msg.systemType === 'invite' && act) {
          displayedText = t('system.member_invited', { actor: act, target: trg, defaultValue: `${act} пригласил(а) ${trg} в лобби` });
        } else if (msg.systemType === 'join') {
          displayedText = act ? t('system.member_joined', { actor: act, defaultValue: `${act} вступил(а) в лобби` }) : t('system.member_joined_generic', { defaultValue: 'Участник вступил в лобби' });
        } else if (msg.systemType === 'join_link') {
          displayedText = act ? t('system.member_joined_link', { actor: act, defaultValue: `${act} вступил(а) в лобби по ссылке-приглашению` }) : t('system.member_joined_link_generic', { defaultValue: 'Участник вступил в лобби по ссылке-приглашению' });
        } else if (msg.systemType === 'pin') {
          displayedText = act ? t('system.message_pinned', { actor: act, defaultValue: `${act} закрепил(а) сообщение` }) : t('system.message_pinned_generic', { defaultValue: 'Сообщение закреплено' });
        } else if (msg.systemType === 'title' && act) {
          displayedText = t('system.title_changed', { actor: act, defaultValue: `${act} изменил(а) имя лобби` });
        } else if (msg.systemType === 'avatar' && act) {
          displayedText = t('system.avatar_changed', { actor: act, defaultValue: `${act} изменил(а) аватарку лобби` });
        } else if (msg.systemType === 'admin' && act) {
          displayedText = t('system.promoted_admin', { actor: act, target: trg, defaultValue: `${act} назначил(а) ${trg} администратором` });
        } else if (msg.systemType === 'unadmin' && act) {
          displayedText = t('system.demoted_admin', { actor: act, target: trg, defaultValue: `${act} снял(а) ${trg} с администратора` });
        } else if (msg.systemType === 'kick' && act) {
          displayedText = t('system.member_removed', { actor: act, target: trg, defaultValue: `${act} удалил(а) ${trg} из лобби` });
        }
      }
      if (!displayedText || displayedText === '[ENCRYPTED MESSAGE]') {
        displayedText = t('system.system_event', { defaultValue: 'Системное сообщение' });
      }

      const targetPin = msg.systemType === 'pin' ? activeChat?.pinnedMessage : null;
      const canScrollToPin = Boolean(targetPin && (targetPin.id || targetPin.messageId));
      const handleSystemClick = () => {
        if (!canScrollToPin || !targetPin) return;
        handleQuoteClick({
          id: targetPin.messageId || targetPin.id,
          sender: targetPin.sender || '',
          text: targetPin.text || '',
          time: String(targetPin.time || 0),
        }, index);
      };

      return (
        <div
          data-message="true"
          data-message-id={msg.id}
          className={`flex justify-center items-center w-full my-1.5 select-none ${canScrollToPin ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'}`}
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          onClick={canScrollToPin ? handleSystemClick : undefined}
        >
          <div
            style={{
              backgroundColor: 'var(--surface-container)',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontWeight: 500,
              padding: '3px 6px 3px 12px',
              borderRadius: '9999px',
              display: 'inline-flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'none',
              border: 'none',
              outline: 'none',
              filter: 'none',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              maxWidth: '92%',
              gap: '6px',
              whiteSpace: 'nowrap',
              cursor: canScrollToPin ? 'pointer' : 'default',
            }}
          >
            <span className="truncate">{displayedText}</span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-dim)',
                backgroundColor: 'var(--surface-container-soft)',
                padding: '1px 7px',
                borderRadius: '9999px',
                lineHeight: 1.35,
                flexShrink: 0,
                boxShadow: 'none',
                filter: 'none',
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
              }}
            >
              {timeStr}
            </span>
          </div>
        </div>
      );
    }

    const mediaItems = msg.mediaItems;
    const isSingleImageOrVideo = (media.type === 'image' || media.type === 'video' || media.type === 'gif') && Boolean(media.url || msg.mediaUrl || msg.uploading);
    const effectiveMediaItems = (mediaItems && mediaItems.length > 0)
      ? mediaItems
      : (isSingleImageOrVideo ? [{
          type: media.type === 'gif' ? ('gif' as const) : ((media.type === 'video' || msg.mime?.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(media.fileName || msg.mediaName || '')) ? ('video' as const) : ('photo' as const)),
          url: media.url || msg.mediaUrl || '',
          name: media.fileName || msg.mediaName || '',
          mime: msg.mime,
          key: msg.mediaKey || (msg as any).key || (msg as any).media_key,
          duration: msg.duration,
          width: msg.width,
          height: msg.height,
          preview: msg.preview || msg.thumbnail || null,
          blurPreview: msg.blurPreview,
          thumbnail: msg.thumbnail || msg.preview || msg.blurPreview,
          uploading: msg.uploading,
          uploadedMb: msg.uploadedMb,
          size: msg.fileSize,
        }] : null);

    if (effectiveMediaItems && effectiveMediaItems.length > 0) {
      const isPhotoGroup = effectiveMediaItems.some((it) => it.type === 'photo' || it.type === 'video' || it.type === 'gif');
      const isAudioGroup = effectiveMediaItems.every((it) => it.type === 'audio' || it.mime?.startsWith('audio/'));
      const cleanCaption = msg.text ? msg.text.replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*(https?:\/\/[^\s]+)?/i, '').trim() : '';
      const hasCaption = Boolean(cleanCaption);

      let groupBubbleWidth = 'min(440px, 85vw)';
      if (isPhotoGroup && effectiveMediaItems.length === 1) {
        const it = effectiveMediaItems[0];
        const w = it.width || msg.width;
        const h = it.height || msg.height;
        if (w && h && h > 0) {
          const singleSize = calculateMediaDisplaySize(w, h, 440, 400);
          const targetW = hasCaption ? Math.max(singleSize.width, 260) : singleSize.width;
          groupBubbleWidth = `min(${targetW}px, 100%)`;
        }
      }

      let photoRadius = customRadius;
      if (isPhotoGroup) {
        const pR = Math.max(parseFloat(baseRadius) || 16, 20);
        if (isOwn) {
          const rTopRight = isPrevSameSenderGroup ? 8 : pR;
          const rBottomRight = isNextSameSenderGroup ? 8 : pR;
          photoRadius = `${pR}px ${rTopRight}px ${rBottomRight}px ${pR}px`;
        } else {
          const rTopLeft = isPrevSameSenderGroup ? 8 : pR;
          const rBottomLeft = isNextSameSenderGroup ? 8 : pR;
          photoRadius = `${rTopLeft}px ${pR}px ${pR}px ${rBottomLeft}px`;
        }
      }

      return (
        <div
          data-message-row="true"
          data-message-id={msg.id}
          style={{ ...highlightWrapperStyle }}
          data-datelabel={getDateLabel(msg.time)}
          onClick={(e) => {
            if (isSelectionMode && msg.id) {
              handleMessageClick(e, msg.id);
            }
          }}
        >
          {renderSelectionCircle()}
          {wrapWithGroupAvatar(
            <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
              <div
                data-message="true"
                data-message-id={msg.id}
                data-sender={msg.sender}
                data-read={String(msg.read)}
                data-datelabel={getDateLabel(msg.time)}
                className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                style={{
                  transformOrigin: isOwn ? 'top right' : 'top left',
                  flex: 1,

                }}
                onClick={(e) => handleMessageClick(e, msg.id!)}
                onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
              >
                <div
                  data-bubble="true"
                  className="relative"
                  style={bubbleStyle(isOwn, {
                    borderRadius: isPhotoGroup ? photoRadius : customRadius,
                    padding: isPhotoGroup ? (hasCaption ? '2px 2px 4px 2px' : '0px') : (isAudioGroup ? '0px' : '1px 1px 4px 1px'),
                    background: (isPhotoGroup && !hasCaption) ? 'transparent' : undefined,
                    border: (isPhotoGroup && !hasCaption) ? 'none' : undefined,
                    overflow: (isPhotoGroup && !hasCaption) ? 'visible' : 'hidden',
                    width: isPhotoGroup ? groupBubbleWidth : 'fit-content',
                    maxWidth: 'min(440px, 75%)',
                    boxSizing: 'border-box',
                  })}
                >
                  {msg.forwardedFrom && (
                    <div className="p-2 pb-1 select-none">
                      <ForwardedMessageBlock forwarded={msg.forwardedFrom} isOwn={isOwn} themeColor={themeColor} />
                    </div>
                  )}
                  {renderMediaGroup(msg, index, isPhotoGroup ? photoRadius : customRadius, effectiveMediaItems)}
                </div>
                {renderReactionBadges(msg, index, 5)}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (!media.type) {
      const isPinned = isMessagePinned(msg);
      return (
        <div
          data-message-row="true"
          data-message-id={msg.id}
          style={{ ...highlightWrapperStyle }}
          data-datelabel={getDateLabel(msg.time)}
          onClick={(e) => {
            if (isSelectionMode && msg.id) {
              handleMessageClick(e, msg.id);
            }
          }}
        >
          {renderSelectionCircle()}
          {wrapWithGroupAvatar(
            <MessageItem
              msg={msg}
              isOwn={isOwn}
              isPinned={isPinned}
              isSelected={Boolean(isSelected)}
              onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
              themeColor={themeColor}
              bubbleRadius={customRadius}
              currentUserId={myUserId || myNickname}
              onToggleReaction={(emoji) => triggerReactionMessage(msg.id || index, emoji)}
              onQuoteClick={(q) => handleQuoteClick(q, index)}
              isGroup={isGroup}
              isPrevSameSender={isPrevSameSenderGroup}
              onLinkClick={handleLinkClick}
              onButtonClick={handleMessageButtonClick}
              onSenderClick={(sId, sName) => handleOpenDirectChat(sId || msg.senderId || (msg as any).senderCode, sName || senderNickname, senderMember)}
              activeChat={activeChat}
              onRetry={handleRetryMessage ? () => handleRetryMessage(msg.id || index) : undefined}
            />
          )}
        </div>
      );
    }

    const { quotes, body: mainText } = parseReplyChain(msg.text);
    const isEmojiOnlyMessage =
      !media.type &&
      quotes.length === 0 &&
      editingIndex !== index &&
      !!mainText.trim() &&
      isEmojiOnly(mainText);

    if (isEmojiOnlyMessage) {
      const emojiCount = countEmojis(mainText);
      let fontSize = '24px';
      if (emojiCount === 1) fontSize = '48px';
      else if (emojiCount <= 3) fontSize = '32px';

      const spacerWidth = isOwn ? (isMessagePinned(msg) ? '72px' : '60px') : (isMessagePinned(msg) ? '52px' : '40px');

      return (
        <div
          data-message-row="true"
          data-message-id={msg.id}
          style={{ ...highlightWrapperStyle }}
          data-datelabel={getDateLabel(msg.time)}
          onClick={(e) => {
            if (isSelectionMode && msg.id) {
              handleMessageClick(e, msg.id);
            }
          }}
        >
          {renderSelectionCircle()}
          {wrapWithGroupAvatar(
            <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
              <div
                data-message="true"
                data-message-id={msg.id}
                data-sender={msg.sender}
                data-read={String(msg.read)}
                data-datelabel={getDateLabel(msg.time)}
                className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                style={{
                  transformOrigin: isOwn ? 'top right' : 'top left',
                  flex: 1,

                }}
                onClick={(e) => handleMessageClick(e, msg.id!)}
                onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
              >
                <div
                  data-bubble="true"
                  className="max-w-[min(440px, 75%)] min-w-[60px] w-fit relative"
                  style={bubbleStyle(isOwn, isMessagePinned(msg) ? { outline: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent)' } : {})}
                >
                  <div
                    className="select-text"
                    style={{
                      fontSize: fontSize,
                      lineHeight: 1.2,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    <span className="selectable-message-text" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
                      {mainText}
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-block',
                          width: spacerWidth,
                          height: 1,
                          pointerEvents: 'none',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                        }}
                      />
                    </span>
                    <span
                      aria-hidden
                      className="flex-shrink-0 select-none message-time-badge"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        pointerEvents: 'none',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        lineHeight: 1,
                        position: 'absolute',
                        bottom: '0px',
                        right: '0px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {timeBadge(msg, isMessagePinned(msg))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div
          data-message-row="true"
          data-message-id={msg.id}
          style={{ ...highlightWrapperStyle }}
          data-datelabel={getDateLabel(msg.time)}
          onClick={(e) => {
            if (isSelectionMode && msg.id) {
              handleMessageClick(e, msg.id);
            }
          }}
        >
          {renderSelectionCircle()}
        {wrapWithGroupAvatar(
          <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
          <div
            data-message="true"
            data-message-id={msg.id}
            data-sender={msg.sender}
            data-read={String(msg.read)}
            data-datelabel={getDateLabel(msg.time)}
            className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
            style={{
              transformOrigin: isOwn ? 'top right' : 'top left',
              flex: 1,

            }}
            onClick={(e) => handleMessageClick(e, msg.id!)}
            onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
          >
            {msg.forwardedFrom && (
              <div className="mb-1 select-none" style={{ maxWidth: 'min(440px, 75%)' }}>
                <ForwardedMessageBlock forwarded={msg.forwardedFrom} isOwn={isOwn} themeColor={themeColor} />
              </div>
            )}
            {media.type === 'sticker' && (
              <div
                data-bubble="true"
                className={`relative w-fit flex flex-col ${isOwn ? 'items-end' : 'items-start'} group select-none`}
                style={{ padding: '0px', overflowAnchor: 'none' }}
                onClick={(e) => handleMessageClick(e, msg.id!)}
                onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
              >
                <div className="relative w-[180px] h-[180px] max-w-[min(180px,70vw)] max-h-[min(180px,70vw)] flex items-center justify-center">
                  {media.url && media.url.toLowerCase().endsWith('.tgs') ? (
                    <TgsPlayer
                      src={media.url}
                      loop={true}
                      autoplay={stickersAutoplayChat}
                      className="w-full h-full select-none cursor-pointer active:scale-[0.98] transition-transform"
                    />
                  ) : (
                    <img
                      src={media.url!}
                      alt=""
                      className="w-full h-full object-contain select-none cursor-pointer"
                      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                      loading="lazy"
                    />
                  )}
                  <div
                    className="absolute select-none tabular-nums opacity-0 group-hover:opacity-100 transition-opacity duration-150 message-time-badge"
                    style={{
                      position: 'absolute',
                      bottom: '15px',
                      left: isOwn ? '15px' : undefined,
                      right: !isOwn ? '15px' : undefined,
                      backgroundColor: '#18191d',
                      borderRadius: '9999px',
                      padding: '3px 8px',
                      color: 'rgba(255, 255, 255, 0.95)',
                      fontSize: '11px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      lineHeight: 1,
                      zIndex: 2,
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                  >
                    {msg.isEdited && (
                      <span style={{ marginRight: '4px', opacity: 0.75, fontSize: '10px', fontStyle: 'italic', userSelect: 'none', WebkitUserSelect: 'none' }}>
                        {t('chatWindow.edited')}
                      </span>
                    )}
                    <span style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>{formatTimeOfDay(msg.time)}</span>
                    {isOwn && (msg.status || msg.read) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '5px', flexShrink: 0, userSelect: 'none', WebkitUserSelect: 'none' }}>
                        <MessageStatus
                          status={
                            (msg.status === 'failed' || msg.status === 'error')
                              ? 'failed'
                              : (msg.status === 'read' || msg.read)
                              ? 'read'
                              : (msg.status || 'sent')
                          }
                          isOwn={isOwn}
                          onRetry={(msg.status === 'failed' || msg.status === 'error') && handleRetryMessage ? () => handleRetryMessage(msg.id || index) : undefined}
                        />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {media.type === 'image' && (
              <div
                className="max-w-[min(440px, 75%)] relative overflow-hidden shadow-lg cursor-pointer"
                style={{
                  border: 'none',
                  maxWidth: 'min(440px, 75%)',
                  width: msg.width && msg.height && msg.height > 0
                    ? `${Math.min(440, (msg.width / msg.height) < 1 ? Math.round(380 * Math.max(0.6, msg.width / msg.height)) : msg.width)}px`
                    : 'min(440px, 75vw)',
                  borderRadius: customRadius || bubbleRadius,
                  overflow: 'hidden',
                  WebkitMaskImage: '-webkit-radial-gradient(white, black)',
                }}
              >
                <EncryptedMedia
                  url={media.url!}
                  type="image"
                  sharedSecret={msg.mediaKey || sharedSecret || undefined}
                  chatId={activeChatId || undefined}
                  messageId={msg.id}
                  bubbleRadius={customRadius || bubbleRadius}
                  width={msg.width}
                  height={msg.height}
                  duration={msg.duration || (msg as any).audioMetadata?.duration}
                  isGif={isGif}
                  isOwn={isOwn}
                  fileSize={msg.fileSize || (msg as any).size}
                  preview={(msg.preview || (msg as any).thumbnail || (media.url?.startsWith('data:') || media.url?.startsWith('blob:') ? media.url : undefined)) || undefined}
                  thumbnail={(msg.thumbnail || msg.preview) || undefined}
                  blurPreview={(msg.blurPreview || msg.thumbnail) || undefined}
                  isUploading={Boolean(msg.uploading)}
                  onCancelUpload={() => {
                    cancelActiveMediaUpload((msg as any).chatId || (msg as any).chat_id || activeChatId, msg.id);
                  }}
                  timeNode={!(msg.text?.trim() && msg.text.trim().replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*https?:\/\/[^\s]+$/i, '').trim()) ? timeBadge(msg, isMessagePinned(msg)) : undefined}
                  onClick={() => openMediaViewer(media.url!, msg.id)}
                  onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, msg, isOwn)}
                />
              </div>
            )}

            {media.type === 'video' && (
              <div
                className="max-w-[min(440px, 75%)] relative overflow-hidden shadow-lg cursor-pointer"
                style={{
                  border: 'none',
                  maxWidth: 'min(440px, 75%)',
                  width: msg.width && msg.height && msg.height > 0
                    ? `${Math.min(440, (msg.width / msg.height) < 1 ? Math.round(380 * Math.max(0.6, msg.width / msg.height)) : msg.width)}px`
                    : 'min(440px, 75vw)',
                  borderRadius: customRadius || bubbleRadius,
                  overflow: 'hidden',
                  WebkitMaskImage: '-webkit-radial-gradient(white, black)',
                }}
              >
                <EncryptedMedia
                  url={media.url!}
                  type="video"
                  sharedSecret={msg.mediaKey || sharedSecret || undefined}
                  chatId={activeChatId || undefined}
                  messageId={msg.id}
                  bubbleRadius={customRadius || bubbleRadius}
                  width={msg.width}
                  height={msg.height}
                  duration={msg.duration || (msg as any).audioMetadata?.duration}
                  isGif={isGif}
                  isOwn={isOwn}
                  fileSize={msg.fileSize || (msg as any).size}
                  preview={(msg.preview || (msg as any).thumbnail || (media.url?.startsWith('data:') && !media.url.startsWith('data:video') ? media.url : undefined)) || undefined}
                  thumbnail={(msg.thumbnail || msg.preview) || undefined}
                  blurPreview={(msg.blurPreview || msg.thumbnail) || undefined}
                  isUploading={Boolean(msg.uploading)}
                  onCancelUpload={() => {
                    cancelActiveMediaUpload((msg as any).chatId || (msg as any).chat_id || activeChatId, msg.id);
                  }}
                  timeNode={!(msg.text?.trim() && msg.text.trim().replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*https?:\/\/[^\s]+$/i, '').trim()) ? timeBadge(msg, isMessagePinned(msg)) : undefined}
                  onClick={() => openMediaViewer(media.url!, msg.id)}
                  onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, msg, isOwn)}
                />
              </div>
            )}

            {(media.type === 'image' || media.type === 'video') && msg.text?.trim() && msg.text.trim().replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*https?:\/\/[^\s]+$/i, '').trim() && (
              <div
                onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
                className="max-w-[min(440px, 75%)] min-w-[60px] w-fit mt-1"
                style={bubbleStyle(isOwn, isMessagePinned(msg) ? { outline: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent)' } : {})}
              >
                <MessageText text={msg.text.replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*https?:\/\/[^\s]+/i, '').trim() || msg.text} timeNode={timeBadge(msg, isMessagePinned(msg))} themeColor={isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))'} isOwn={isOwn} isPinned={isMessagePinned(msg)} onLinkClick={handleLinkClick} />
              </div>
            )}

            {!media.type && !isEmojiOnlyMessage && (
              <div
                data-bubble="true"
                onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
                className="max-w-[min(440px, 75%)] min-w-[60px] w-fit relative"
                style={bubbleStyle(isOwn, {
                  borderRadius: customRadius,
                  ...(editingIndex === index ? { outline: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 50%, transparent)' } : {}),
                  ...(isMessagePinned(msg) ? { outline: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent)' } : {}),
                })}
              >
                {editingIndex === index ? (
                  <div className="flex flex-col gap-2" style={{ minWidth: '160px' }}>
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { triggerEditMessage(index, editText); setEditingIndex(null); setEditText(''); } if (e.key === 'Escape') { setEditingIndex(null); setEditText(''); } }}
                      className="bg-transparent border-b outline-none py-1 select-text w-full"
                      style={{ borderColor: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 35%, transparent)' : 'var(--border-color)', color: isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--chat-bubble-incoming-text, var(--text-main))', fontSize: orbitFs(11) }}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end select-none">
                      <button type="button" onClick={() => { setEditingIndex(null); setEditText(''); }} className="uppercase" style={{ color: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 75%, transparent)' : 'var(--text-dim)', fontSize: orbitFs(8) }}>{t('common.cancel')}</button>
                      <button type="button" onClick={() => { triggerEditMessage(index, editText); setEditingIndex(null); setEditText(''); }} className="uppercase font-bold" style={{ color: isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color, #7C3AED))', fontSize: orbitFs(8) }}>{t('common.save')}</button>
                    </div>
                  </div>
                ) : quotes.length > 0 ? (
                  <div className="flex flex-col min-w-0" style={{ gap: '4px' }}>
                    {quotes.map((q, depth) => (
                      <div
                        key={`${index}-${depth}-${q.time}`}
                        className="flex w-full items-start gap-2 mb-0.5"
                        style={{
                          padding: '5px 10px',
                          backgroundColor: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 15%, transparent)' : 'color-mix(in srgb, var(--accent-color) 12%, transparent)',
                          borderRadius: '0 6px 6px 0',
                          borderLeft: isOwn ? '3px solid var(--bubble-own-text, #ffffff)' : '3px solid var(--accent-text, var(--accent-color))',
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-semibold flex items-center gap-1" style={{ color: isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))', fontSize: '12.5px', lineHeight: '1.2' }}>
                            {activeChat?.type === 'channel' && <ChannelMegaphoneIcon size={12} className="flex-shrink-0" />}
                            <span>{q.sender}</span>
                          </p>
                          <p className="truncate" style={{ color: isOwn ? 'color-mix(in srgb, var(--bubble-own-text, #ffffff) 90%, transparent)' : 'var(--chat-bubble-incoming-text, var(--text-main))', fontSize: '13px', lineHeight: '1.35', marginTop: '2px' }}>{q.text}</p>
                        </div>
                      </div>
                    ))}
                    <MessageText text={mainText} timeNode={timeBadge(msg, isMessagePinned(msg))} themeColor={isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))'} isOwn={isOwn} onLinkClick={handleLinkClick} />
                  </div>
                ) : (
                  <MessageText text={mainText} timeNode={timeBadge(msg, isMessagePinned(msg))} themeColor={isOwn ? 'var(--bubble-own-text, #ffffff)' : 'var(--accent-text, var(--accent-color))'} isOwn={isOwn} onLinkClick={handleLinkClick} />
                )}
              </div>
            )}

            {media.type === 'music' && (
              <div data-bubble="true">
              <AudioMessageBubble
                msg={msg}
                chatId={activeChatId || undefined}
                sharedSecret={msg.mediaKey || sharedSecret || undefined}
                bubbleRadius={customRadius}
                onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}
                timeNode={timeBadge(msg, isMessagePinned(msg))}
                isOwn={isOwn}
                reactions={msg.reactions}
                onToggleReaction={(emoji) => triggerReactionMessage(msg.id || index, emoji)}
                onCancelUpload={msg.uploading ? () => {
                  cancelActiveMediaUpload(activeChatId, msg.id);
                } : undefined}
              />
              </div>
            )}

            {media.type === 'voice' && (
              <div data-bubble="true" onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}>
                <VoiceMessagePlayer
                  url={media.url!}
                  fileName={media.fileName}
                  sharedSecret={msg.mediaKey || sharedSecret || undefined}
                  mime={media.mime}
                  chatId={activeChatId || undefined}
                  messageId={msg.id}
                  msg={msg}
                  timeNode={timeBadge(msg, isMessagePinned(msg))}
                  isOwn={isOwn}
                  customRadius={customRadius}
                  reactions={msg.reactions}
                  onToggleReaction={(emoji) => triggerReactionMessage(msg.id || index, emoji)}
                  onCancelUpload={msg.uploading ? () => {
                    cancelActiveMediaUpload(activeChatId, msg.id);
                  } : undefined}
                />
              </div>
            )}

            {media.type === 'file' && (
              <div data-bubble="true" onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}>
                <FileMessage
                  url={media.url!}
                  fileName={media.fileName}
                  sharedSecret={msg.mediaKey || sharedSecret || undefined}
                  chatId={activeChatId || undefined}
                  messageId={msg.id}
                  size={media.size || msg.fileSize || (msg as any).size}
                  timeNode={timeBadge(msg, isMessagePinned(msg))}
                  isOwn={isOwn}
                  customRadius={customRadius}
                  isUploading={msg.uploading || msg.status === 'sending'}
                />
              </div>
            )}

            {media.type === 'call' && (
              <div data-bubble="true" onContextMenu={(e) => handleContextMenu(e, msg, isOwn)}>
                <CallMessage msg={msg} chatId={activeChatId!} onCall={handleCallPress} isOwn={isOwn} customRadius={customRadius} />
              </div>
            )}
            {media.type !== 'voice' && media.type !== 'music' && renderReactionBadges(msg, index)}
          </div>
        </div>
        )}
      </div>
    );
  };

  return (
    <>
      {dateDividerNode}
      {renderContent()}
    </>
  );
};
