import React, { useCallback } from 'react';
import { useChatStore, type Message, type MediaItem, type LinkPreviewData, type AudioMetadata } from '../../../store/useChatStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { getPusher, getGroupPusher } from '../../../utils/pusher';
import { ablyService } from '../../../services/ablyService';
import { supabaseService } from '../../../services/supabaseService';
import { channelService } from '../../../services/channelService';
import { groupService } from '../../../services/groupService';
import { lobbyService } from '../../../services/lobbyService';
import { supportService } from '../../../services/supportService';
import { networkManager } from '../../../services/networkManager';
import { deriveGroupKey, isValidGroupCode } from '../../../lib/groupCrypto';
import { encryptMessage, generateKeyPair, ensureValidUuid } from '../../../lib/crypto';
import { DoubleRatchet } from '../../../lib/double-ratchet';
import { truncateText, formatTime, generateEphemeralKey, encryptFile } from './chatWindowHelpers';
import { mediaManager } from '../../../services/mediaManager';
import { type AttachedFile } from '../FileAttachmentModal';

export interface UseChatMessageSendProps {
  activeChatId: string | null;
  activeChat: any;
  myCode: string;
  myNickname: string;
  myUserId?: string;
  myAvatarUrl?: string | null;
  isChannelOwner: boolean;
  updateChat: (chatId: string, partial: any) => void;
  addMessage: (chatId: string, message: Message) => void;
  replyingTo: any;
  setReplyingTo: React.Dispatch<React.SetStateAction<any>>;
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<any>;
  sendQueueRef: React.MutableRefObject<Promise<void>>;
  draftDebounceTimerRef: React.MutableRefObject<any>;
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  setIsAttachmentModalOpen: (v: boolean) => void;
  atBottomRef: React.MutableRefObject<boolean>;
  setShowScrollDown: (v: boolean) => void;
  scrollToBottom: (smooth?: boolean) => void;
  stopTyping: () => void;
  t: (key: string, defaultVal?: any) => string;
}

export interface UseChatMessageSendReturn {
  triggerMessage: (
    text: string,
    mediaPayload?: {
      type: string;
      url: string;
      key?: string;
      name?: string;
      mime?: string;
      audioMetadata?: AudioMetadata;
      duration?: number;
      waveform?: number[];
      size?: number;
      width?: number;
      height?: number;
      blurPreview?: string;
      thumbnail?: string;
      preview?: string;
      senderId?: string;
    },
    linkPreviewPayload?: LinkPreviewData,
    existingMessageId?: string,
    mediaItemsPayload?: MediaItem[],
    forwardedFromPayload?: Message['forwardedFrom'],
    targetChatIdParam?: string
  ) => Promise<void>;
  handleSendMessage: (overrideText?: string, linkPreview?: LinkPreviewData) => void;
  handleSendAsTxt: (caption: string) => Promise<void>;
  handleRetryMessage: (indexOrId: number | string) => Promise<void>;
}

export const useChatMessageSend = ({
  activeChatId,
  activeChat,
  myCode,
  myNickname,
  myUserId,
  myAvatarUrl,
  isChannelOwner,
  updateChat,
  addMessage,
  replyingTo,
  setReplyingTo,
  inputText,
  setInputText,
  inputRef,
  sendQueueRef,
  draftDebounceTimerRef,
  setAttachedFiles,
  setIsAttachmentModalOpen,
  atBottomRef,
  setShowScrollDown,
  scrollToBottom,
  stopTyping,
  t,
}: UseChatMessageSendProps): UseChatMessageSendReturn => {
  const triggerMessage = async (
    text: string,
    mediaPayload?: {
      type: string;
      url: string;
      key?: string;
      name?: string;
      mime?: string;
      audioMetadata?: AudioMetadata;
      duration?: number;
      waveform?: number[];
      size?: number;
      width?: number;
      height?: number;
      blurPreview?: string;
      thumbnail?: string;
      preview?: string;
      senderId?: string;
    },
    linkPreviewPayload?: LinkPreviewData,
    existingMessageId?: string,
    mediaItemsPayload?: MediaItem[],
    forwardedFromPayload?: Message['forwardedFrom'],
    targetChatIdParam?: string
  ) => {
    const targetChatId = targetChatIdParam || activeChatId;
    if (!targetChatId) return;
    const targetChat = useChatStore.getState().chats.find((c) => c.id === targetChatId) || activeChat;
    const effectiveSenderUuid = ensureValidUuid(myUserId || useAuthStore.getState().userId, myCode);
    if (mediaPayload) {
      mediaPayload.senderId = mediaPayload.senderId || effectiveSenderUuid;
    }
    const resolvedMediaItems = mediaItemsPayload ? mediaItemsPayload.map((item) => ({
      ...item,
      senderId: item.senderId || effectiveSenderUuid,
    })) : undefined;

    if (targetChatId === 'notes') {
      if (existingMessageId) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[targetChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [targetChatId]: currentMsgs.map((m) =>
                m.id === existingMessageId
                  ? {
                      ...m,
                      text,
                      status: 'sent' as const,
                      uploading: false,
                      mediaType: (mediaPayload?.type as any) || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.type as any) : m.mediaType),
                      mediaUrl: mediaPayload?.url || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.url : m.mediaUrl),
                      mediaKey: mediaPayload?.key || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.key : m.mediaKey),
                      mediaName: mediaPayload?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.name : m.mediaName),
                      mime: mediaPayload?.mime || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.mime : m.mime),
                      duration: mediaPayload?.duration || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.duration : m.duration),
                      waveform: mediaPayload?.waveform || m.waveform,
                      audioMetadata: mediaPayload?.audioMetadata || m.audioMetadata,
                      width: mediaPayload?.width || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.width : m.width),
                      height: mediaPayload?.height || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.height : m.height),
                      fileSize: mediaPayload?.size || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.size : m.fileSize),
                      blurPreview: mediaPayload?.blurPreview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.blurPreview : m.blurPreview),
                      thumbnail: ((mediaPayload?.thumbnail || mediaPayload?.preview || mediaPayload?.blurPreview || (mediaItemsPayload && (mediaItemsPayload[0]?.thumbnail || mediaItemsPayload[0]?.preview)) || m.thumbnail) || undefined) as string | undefined,
                      preview: mediaPayload?.preview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.preview as any) : m.preview),
                      mediaItems: resolvedMediaItems || m.mediaItems,
                      senderId: m.senderId || effectiveSenderUuid,
                    }
                  : m
              ),
            },
          };
        });
        const currentMsgs = useChatStore.getState().messagesByChatId[targetChatId] || [];
        const target = currentMsgs.find((m) => m.id === existingMessageId);
        if (target) {
          (window as any).orbita?.storageAddMessage?.(targetChatId, existingMessageId, target).catch(() => {});
        }
      } else {
        const localMessage: Message = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          senderId: effectiveSenderUuid,
          sender: myNickname,
          isOutgoing: true,
          text: text,
          time: Date.now(),
          read: true,
          status: 'sent',
          mediaType: (mediaPayload?.type as any) || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.type as any) : undefined),
          mediaUrl: mediaPayload?.url || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.url : undefined),
          mediaName: mediaPayload?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.name : undefined),
          mediaKey: mediaPayload?.key || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.key : undefined),
          mime: mediaPayload?.mime || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.mime : undefined),
          audioMetadata: mediaPayload?.audioMetadata,
          duration: mediaPayload?.duration || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.duration : undefined),
          waveform: mediaPayload?.waveform,
          width: mediaPayload?.width || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.width : undefined),
          height: mediaPayload?.height || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.height : undefined),
          fileSize: mediaPayload?.size || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.size : undefined),
          blurPreview: mediaPayload?.blurPreview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.blurPreview : undefined),
          thumbnail: ((mediaPayload?.thumbnail || mediaPayload?.preview || mediaPayload?.blurPreview || (mediaItemsPayload && (mediaItemsPayload[0]?.thumbnail || mediaItemsPayload[0]?.preview))) || undefined) as string | undefined,
          preview: mediaPayload?.preview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.preview as any) : undefined),
          mediaItems: mediaItemsPayload,
          linkPreview: linkPreviewPayload,
          forwardedFrom: forwardedFromPayload,
        };
        addMessage(targetChatId, localMessage);
      }
      setInputText('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom(false));
      return;
    }

    if (targetChatId === 'system_support') {
      if (existingMessageId) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[targetChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [targetChatId]: currentMsgs.map((m) =>
                m.id === existingMessageId
                  ? {
                      ...m,
                      text,
                      status: 'sent' as const,
                      uploading: false,
                      mediaType: (mediaPayload?.type as any) || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.type as any) : m.mediaType),
                      mediaUrl: mediaPayload?.url || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.url : m.mediaUrl),
                      mediaKey: mediaPayload?.key || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.key : m.mediaKey),
                      mediaName: mediaPayload?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.name : m.mediaName),
                      mime: mediaPayload?.mime || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.mime : m.mime),
                      duration: mediaPayload?.duration || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.duration : m.duration),
                      waveform: mediaPayload?.waveform || m.waveform,
                      audioMetadata: mediaPayload?.audioMetadata || m.audioMetadata,
                      width: mediaPayload?.width || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.width : m.width),
                      height: mediaPayload?.height || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.height : m.height),
                      fileSize: mediaPayload?.size || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.size : m.fileSize),
                      blurPreview: mediaPayload?.blurPreview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.blurPreview : m.blurPreview),
                      thumbnail: ((mediaPayload?.thumbnail || mediaPayload?.preview || mediaPayload?.blurPreview || (mediaItemsPayload && (mediaItemsPayload[0]?.thumbnail || mediaItemsPayload[0]?.preview)) || m.thumbnail) || undefined) as string | undefined,
                      preview: mediaPayload?.preview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.preview as any) : m.preview),
                      mediaItems: resolvedMediaItems || m.mediaItems,
                      senderId: m.senderId || effectiveSenderUuid,
                    }
                  : m
              ),
            },
          };
        });
        const currentMsgs = useChatStore.getState().messagesByChatId[targetChatId] || [];
        const target = currentMsgs.find((m) => m.id === existingMessageId);
        if (target) {
          (window as any).orbita?.storageAddMessage?.(targetChatId, existingMessageId, target).catch(() => {});
        }
      } else {
        const localMessage: Message = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          senderId: effectiveSenderUuid,
          sender: myNickname,
          isOutgoing: true,
          text: text,
          time: Date.now(),
          read: true,
          status: 'sent',
          mediaType: (mediaPayload?.type as any) || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.type as any) : undefined),
          mediaUrl: mediaPayload?.url || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.url : undefined),
          mediaName: mediaPayload?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.name : undefined),
          mediaKey: mediaPayload?.key || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.key : undefined),
          mime: mediaPayload?.mime || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.mime : undefined),
          audioMetadata: mediaPayload?.audioMetadata,
          duration: mediaPayload?.duration || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.duration : undefined),
          waveform: mediaPayload?.waveform,
          width: mediaPayload?.width || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.width : undefined),
          height: mediaPayload?.height || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.height : undefined),
          fileSize: mediaPayload?.size || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.size : undefined),
          blurPreview: mediaPayload?.blurPreview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.blurPreview : undefined),
          thumbnail: ((mediaPayload?.thumbnail || mediaPayload?.preview || mediaPayload?.blurPreview || (mediaItemsPayload && (mediaItemsPayload[0]?.thumbnail || mediaItemsPayload[0]?.preview))) || undefined) as string | undefined,
          preview: mediaPayload?.preview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.preview as any) : undefined),
          mediaItems: mediaItemsPayload,
          forwardedFrom: forwardedFromPayload,
        };
        addMessage(targetChatId, localMessage);
      }
      updateChat(targetChatId, { lastMsg: mediaPayload?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? '[MediaGroup]' : text) || '📎' });
      setInputText('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom(false));
      const mediaSummary = mediaItemsPayload && mediaItemsPayload.length > 0
        ? mediaItemsPayload.map((f) => `[${f.type}] ${f.name} (${f.url})`).join('\n')
        : mediaPayload ? `[${mediaPayload.type}] ${mediaPayload.name || ''} (${mediaPayload.url})` : '';
      const fullText = text ? (mediaSummary ? `${text}\n\n${mediaSummary}` : text) : mediaSummary;
      supportService.handleUserMessage(fullText, t, mediaPayload?.url || mediaItemsPayload?.[0]?.url, mediaPayload?.type || mediaItemsPayload?.[0]?.type);
      return;
    }

    const chat = useChatStore.getState().chats.find((c) => c.id === targetChatId);

    if (chat?.type === 'channel') {
      const canPostInChannel = isChannelOwner || Boolean(chat.isOwner) || chat.role === 'owner' || Boolean(myNickname && chat.creatorNickname && chat.creatorNickname.toLowerCase() === myNickname.toLowerCase());
      if (!canPostInChannel) return;

      const sentText = text;
      const sentMedia = mediaPayload;
      const sentPreview = linkPreviewPayload;

      setInputText('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom(false));

      const optimisticId = existingMessageId || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      if (existingMessageId) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[targetChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [targetChatId]: currentMsgs.map((m) =>
                m.id === existingMessageId
                  ? {
                      ...m,
                      text: sentText || '',
                      mediaType: (sentMedia?.type as any) || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.type as any) : m.mediaType),
                      mediaUrl: sentMedia?.url || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.url : m.mediaUrl),
                      mediaKey: sentMedia?.key || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.key : m.mediaKey),
                      mediaName: sentMedia?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.name : m.mediaName),
                      mime: sentMedia?.mime || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.mime : m.mime),
                      duration: sentMedia?.duration || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.duration : m.duration),
                      waveform: sentMedia?.waveform || m.waveform,
                      audioMetadata: sentMedia?.audioMetadata || m.audioMetadata,
                      width: sentMedia?.width || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.width : m.width),
                      height: sentMedia?.height || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.height : m.height),
                      fileSize: sentMedia?.size || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.size : m.fileSize),
                      blurPreview: sentMedia?.blurPreview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.blurPreview : m.blurPreview),
                      thumbnail: ((sentMedia?.thumbnail || sentMedia?.preview || sentMedia?.blurPreview || (mediaItemsPayload && (mediaItemsPayload[0]?.thumbnail || mediaItemsPayload[0]?.preview)) || m.thumbnail) || undefined) as string | undefined,
                      preview: sentMedia?.preview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.preview as any) : m.preview),
                      mediaItems: resolvedMediaItems || m.mediaItems,
                      senderId: m.senderId || effectiveSenderUuid,
                      uploading: false,
                    }
                  : m
              ),
            },
          };
        });
        const currentMsgs = useChatStore.getState().messagesByChatId[targetChatId] || [];
        const target = currentMsgs.find((m) => m.id === existingMessageId);
        if (target) {
          (window as any).orbita?.storageAddMessage?.(targetChatId, existingMessageId, target).catch(() => {});
        }
      } else {
        const optimisticMessage: Message = {
          id: optimisticId,
          sender: myNickname,
          senderId: effectiveSenderUuid,
          text: sentText || '',
          time: Date.now(),
          read: true,
          status: 'sending',
          isOutgoing: true,
          mediaType: (sentMedia?.type as Message['mediaType']) || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.type as any) : undefined),
          mediaUrl: sentMedia?.url || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.url : undefined),
          mediaName: sentMedia?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.name : undefined),
          mediaKey: sentMedia?.key || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.key : undefined),
          mime: sentMedia?.mime || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.mime : undefined),
          audioMetadata: sentMedia?.audioMetadata,
          duration: sentMedia?.duration || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.duration : undefined),
          waveform: sentMedia?.waveform,
          width: sentMedia?.width || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.width : undefined),
          height: sentMedia?.height || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.height : undefined),
          fileSize: sentMedia?.size || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.size : undefined),
          blurPreview: sentMedia?.blurPreview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.blurPreview : undefined),
          thumbnail: ((sentMedia?.thumbnail || sentMedia?.preview || sentMedia?.blurPreview || (mediaItemsPayload && (mediaItemsPayload[0]?.thumbnail || mediaItemsPayload[0]?.preview))) || undefined) as string | undefined,
          preview: sentMedia?.preview || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.preview as any) : undefined),
          mediaItems: mediaItemsPayload,
          linkPreview: sentPreview || undefined,
          forwardedFrom: forwardedFromPayload,
        };
        addMessage(targetChatId, optimisticMessage);
      }
      updateChat(targetChatId, { lastMsg: sentText || sentMedia?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? '[MediaGroup]' : 'Новый пост') });

      const targetChannelId = targetChatId;

      if (mediaItemsPayload && mediaItemsPayload.length > 0) {
        for (let fIdx = 0; fIdx < mediaItemsPayload.length; fIdx++) {
          const f = mediaItemsPayload[fIdx];
          channelService.publishPost(
            targetChannelId,
            myNickname,
            fIdx === 0 ? sentText : '',
            {
              type: f.type,
              url: f.url,
              name: f.name,
              mime: f.mime,
              duration: f.duration,
              width: f.width,
              height: f.height,
              audioMetadata: f.audioMetadata,
            },
            sentPreview,
            fIdx === 0 ? optimisticId : undefined,
            myUserId
          ).then((post) => {
            if (post) {
              const validPostTime = (typeof post.time === 'number' && post.time > 0) ? post.time : Date.now();
              try {
                (window as any).orbita?.storageDeleteMessage?.(optimisticId).catch(() => {});
              } catch {}
              useChatStore.setState((state) => {
                const currentMsgs = state.messagesByChatId[targetChannelId] || [];
                const updated = currentMsgs.map((m) =>
                  m.id === optimisticId || m.id === post.id
                    ? { ...m, id: post.id, time: validPostTime, status: 'read' as const, senderId: m.senderId || effectiveSenderUuid, isOutgoing: true }
                    : m
                );
                const saved = updated.find((m) => m.id === post.id);
                if (saved) {
                  try {
                    (window as any).orbita?.storageAddMessage?.(targetChannelId, post.id, saved).catch(() => {});
                  } catch {}
                }
                return {
                  messagesByChatId: {
                    ...state.messagesByChatId,
                    [targetChannelId]: updated,
                  },
                };
              });
            }
          });
        }
        return;
      }

      channelService.publishPost(
        targetChannelId,
        myNickname,
        sentText,
        sentMedia ? {
          type: sentMedia.type,
          url: sentMedia.url,
          name: sentMedia.name,
          mime: sentMedia.mime,
          duration: sentMedia.duration,
          waveform: sentMedia.waveform,
          audioMetadata: sentMedia.audioMetadata,
          width: sentMedia.width,
          height: sentMedia.height,
        } : undefined,
        sentPreview,
        optimisticId,
        myUserId
      ).then((post) => {
        if (post) {
          const validPostTime = (typeof post.time === 'number' && post.time > 0) ? post.time : Date.now();
          try {
            (window as any).orbita?.storageDeleteMessage?.(optimisticId).catch(() => {});
          } catch {}
          useChatStore.setState((state) => {
            const currentMsgs = state.messagesByChatId[targetChannelId] || [];
            const updated = currentMsgs.map((m) =>
              m.id === optimisticId || m.id === post.id
                ? { ...m, id: post.id, time: validPostTime, status: 'read' as const, senderId: m.senderId || effectiveSenderUuid, isOutgoing: true }
                : m
            );
            const saved = updated.find((m) => m.id === post.id);
            if (saved) {
              try {
                (window as any).orbita?.storageAddMessage?.(targetChannelId, post.id, saved).catch(() => {});
              } catch {}
            }
            return {
              messagesByChatId: {
                ...state.messagesByChatId,
                [targetChannelId]: updated,
              },
            };
          });
        }
      });
      return;
    }

    const pusher = getPusher();
    if (!chat) return;

    const messageId = existingMessageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const networkAudioMetadata = mediaPayload?.audioMetadata ? {
      title: mediaPayload.audioMetadata.title,
      artist: mediaPayload.audioMetadata.artist,
      duration: mediaPayload.audioMetadata.duration,
      size: mediaPayload.audioMetadata.size,
    } : null;

    const isVisualMedia = mediaPayload ? (mediaPayload.type === 'photo' || mediaPayload.type === 'video') : false;
    const localMessage: Message = {
      id: messageId,
      senderId: effectiveSenderUuid,
      sender: myNickname,
      isOutgoing: true,
      text: text,
      time: Date.now(),
      read: false,
      status: targetChatId === 'notes' ? 'sent' : 'sending',
      mediaType: (mediaPayload?.type as any) || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.type as any) : undefined),
      mediaUrl: mediaPayload?.url || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.url : undefined),
      mediaName: mediaPayload?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.name : undefined),
      mediaKey: mediaPayload?.key || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.key : undefined),
      mime: mediaPayload?.mime || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.mime : undefined),
      audioMetadata: mediaPayload?.audioMetadata,
      duration: mediaPayload?.duration || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.duration : undefined),
      waveform: mediaPayload?.waveform,
      width: mediaPayload?.width || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.width : undefined),
      height: mediaPayload?.height || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.height : undefined),
      fileSize: mediaPayload?.size || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.size : undefined),
      blurPreview: isVisualMedia ? (mediaPayload?.blurPreview || (mediaItemsPayload && mediaItemsPayload[0]?.blurPreview) || undefined) : undefined,
      thumbnail: isVisualMedia ? (((mediaPayload?.thumbnail || mediaPayload?.preview || mediaPayload?.blurPreview || (mediaItemsPayload && (mediaItemsPayload[0]?.thumbnail || mediaItemsPayload[0]?.preview))) || undefined) as string | undefined) : undefined,
      preview: isVisualMedia ? (mediaPayload?.preview || (mediaItemsPayload && mediaItemsPayload[0]?.preview) || undefined) : undefined,
      mediaItems: mediaItemsPayload,
      linkPreview: linkPreviewPayload,
      forwardedFrom: forwardedFromPayload,
    };

    const currentActiveChannelId = useChatStore.getState().activeChannelId;
    const effectiveChatKey = (targetChatId.startsWith('lobby_') && currentActiveChannelId) ? `${targetChatId}:${currentActiveChannelId}` : targetChatId;

    if (existingMessageId) {
      useChatStore.setState((state) => {
        const currentMsgs = state.messagesByChatId[effectiveChatKey] || [];
        const updated = currentMsgs.map((m) =>
          m.id === messageId
            ? {
                ...m,
                text,
                status: (targetChatId === 'notes' ? 'sent' : 'sending') as Message['status'],
                uploading: false,
                mediaType: (mediaPayload?.type as any) || (mediaItemsPayload && mediaItemsPayload.length > 0 ? (mediaItemsPayload[0]?.type as any) : m.mediaType),
                mediaUrl: mediaPayload?.url || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.url : m.mediaUrl),
                mediaKey: mediaPayload?.key || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.key : m.mediaKey),
                mediaName: mediaPayload?.name || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.name : m.mediaName),
                mime: mediaPayload?.mime || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.mime : m.mime),
                duration: mediaPayload?.duration || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.duration : m.duration),
                waveform: mediaPayload?.waveform || m.waveform,
                audioMetadata: mediaPayload?.audioMetadata || m.audioMetadata,
                width: mediaPayload?.width || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.width : m.width),
                height: mediaPayload?.height || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.height : m.height),
                fileSize: mediaPayload?.size || (mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload[0]?.size : m.fileSize),
                blurPreview: isVisualMedia ? (mediaPayload?.blurPreview || (mediaItemsPayload && mediaItemsPayload[0]?.blurPreview) || m.blurPreview) : m.blurPreview,
                thumbnail: isVisualMedia ? (((mediaPayload?.thumbnail || mediaPayload?.preview || mediaPayload?.blurPreview || (mediaItemsPayload && (mediaItemsPayload[0]?.thumbnail || mediaItemsPayload[0]?.preview)) || m.thumbnail) || undefined) as string | undefined) : m.thumbnail,
                preview: isVisualMedia ? (mediaPayload?.preview || (mediaItemsPayload && mediaItemsPayload[0]?.preview) || m.preview) : m.preview,
                mediaItems: resolvedMediaItems || m.mediaItems,
                senderId: m.senderId || effectiveSenderUuid,
              }
            : m
        );
        const target = updated.find((m) => m.id === messageId);
        if (target) {
          (window as any).orbita?.storageAddMessage?.(effectiveChatKey, messageId, target).catch(() => {});
        }
        return {
          messagesByChatId: {
            ...state.messagesByChatId,
            [effectiveChatKey]: updated,
          },
        };
      });
    } else {
      addMessage(effectiveChatKey, localMessage);
    }

    sendQueueRef.current = sendQueueRef.current.then(async () => {
      try {
        const isVisual = mediaPayload ? (mediaPayload.type === 'photo' || mediaPayload.type === 'video') : false;
        const sanitizePreview = (val?: string | null) => {
          if (!val) return null;
          if (val.startsWith('data:') && val.length > 4096) return null;
          return val;
        };

        const safeBlurPreview = isVisual ? sanitizePreview(mediaPayload?.blurPreview) : null;
        const safeThumbnail = isVisual ? (sanitizePreview(mediaPayload?.thumbnail) || safeBlurPreview) : null;

        const sanitizedMediaItems = mediaItemsPayload && mediaItemsPayload.length > 0 ? mediaItemsPayload.map((f) => {
          const isFVisual = f.type === 'photo' || f.type === 'video';
          const fBlur = isFVisual ? sanitizePreview(f.blurPreview) : undefined;
          const fThumb = isFVisual ? (sanitizePreview(f.thumbnail) || fBlur) : undefined;
          return {
            type: f.type,
            url: f.url,
            name: f.name,
            mime: f.mime,
            size: f.size,
            key: f.key,
            width: f.width,
            height: f.height,
            duration: f.duration,
            blurPreview: fBlur || undefined,
            thumbnail: fThumb || undefined,
            senderId: f.senderId || effectiveSenderUuid,
            audioMetadata: f.audioMetadata ? {
              title: f.audioMetadata.title,
              artist: f.audioMetadata.artist,
              duration: f.audioMetadata.duration,
              size: f.audioMetadata.size,
            } : undefined,
          };
        }) : null;

        const messageData = {
          id: messageId,
          senderId: effectiveSenderUuid,
          sender: myNickname,
          avatarUrl: myAvatarUrl || null,
          text,
          time: localMessage.time || Date.now(),
          mediaType: mediaPayload?.type || (sanitizedMediaItems && sanitizedMediaItems.length > 0 ? sanitizedMediaItems[0]?.type : null),
          mediaUrl: mediaPayload?.url || (sanitizedMediaItems && sanitizedMediaItems.length > 0 ? sanitizedMediaItems[0]?.url : null),
          mediaName: mediaPayload?.name || (sanitizedMediaItems && sanitizedMediaItems.length > 0 ? sanitizedMediaItems[0]?.name : null),
          mediaKey: mediaPayload?.key || (mediaPayload as any)?.mediaKey || (sanitizedMediaItems && sanitizedMediaItems.length > 0 ? (sanitizedMediaItems[0]?.key || (sanitizedMediaItems[0] as any)?.mediaKey) : null),
          mime: mediaPayload?.mime || (sanitizedMediaItems && sanitizedMediaItems.length > 0 ? sanitizedMediaItems[0]?.mime : null),
          audioMetadata: networkAudioMetadata,
          duration: mediaPayload?.duration || (sanitizedMediaItems && sanitizedMediaItems.length > 0 ? sanitizedMediaItems[0]?.duration : null),
          waveform: mediaPayload?.waveform || null,
          width: mediaPayload?.width || (sanitizedMediaItems && sanitizedMediaItems.length > 0 ? sanitizedMediaItems[0]?.width : null),
          height: mediaPayload?.height || (sanitizedMediaItems && sanitizedMediaItems.length > 0 ? sanitizedMediaItems[0]?.height : null),
          fileSize: mediaPayload?.size || (sanitizedMediaItems && sanitizedMediaItems.length > 0 ? sanitizedMediaItems[0]?.size : null),
          blurPreview: safeBlurPreview,
          thumbnail: safeThumbnail,
          mediaItems: sanitizedMediaItems,
          linkPreview: linkPreviewPayload || null,
          forwardedFrom: forwardedFromPayload || null,
        };

        let freshChat = useChatStore.getState().chats.find(c => c.id === targetChatId);
        const wasDraft = Boolean(freshChat?.isDraft || targetChat?.isDraft);

        if (freshChat?.type === 'group') {
          let groupSecret = freshChat.sharedSecret;
          if (!groupSecret && freshChat.id && freshChat.id.length === 36) {
            groupSecret = deriveGroupKey(freshChat.id);
          }
          if (!groupSecret && freshChat.inviteCode && isValidGroupCode(freshChat.inviteCode)) {
            groupSecret = deriveGroupKey(freshChat.inviteCode);
          }
          if (!groupSecret && freshChat.code && isValidGroupCode(freshChat.code)) {
            groupSecret = deriveGroupKey(freshChat.code);
          }
          if (!groupSecret) {
            const fetched = await groupService.getGroup(targetChatId);
            groupSecret = fetched?.sharedSecret || deriveGroupKey(targetChatId);
          }

          if (groupSecret) {
            if (targetChatId.startsWith('lobby_')) {
              const activeChannelId = useChatStore.getState().activeChannelId;
              const targetChatKey = activeChannelId ? `${targetChatId}:${activeChannelId}` : targetChatId;
              const currentAvatar = useAuthStore.getState().avatarUrl;
              lobbyService.sendLobbyMessage({
                lobbyId: targetChatId,
                channelId: activeChannelId,
                senderCode: myCode,
                senderNickname: myNickname,
                senderAvatarUrl: currentAvatar,
                text,
                sharedSecret: groupSecret,
                mediaType: mediaPayload?.type as any,
                mediaUrl: mediaPayload?.url,
                mediaName: mediaPayload?.name,
                mediaSize: mediaPayload?.size,
                replyToId: replyingTo?.id,
              }).then(() => {
                useChatStore.getState().updateMessageStatus(targetChatKey, messageId, 'sent');
                networkManager.removeOutboxItem(messageId).catch(() => {});
              }).catch(() => {
                useChatStore.getState().updateMessageStatus(targetChatKey, messageId, 'failed');
              });
            } else {
              const ciphertext = await encryptMessage(JSON.stringify(messageData), groupSecret);
              const groupPusher = getGroupPusher();
              const channel = groupPusher.subscribe(`presence-group-${targetChatId}`);
              const firstGroupItem = mediaItemsPayload?.[0];
              const payload = {
                mediaType: mediaPayload?.type || firstGroupItem?.type || null,
                mediaUrl: mediaPayload?.url || firstGroupItem?.url || null,
                mediaKey: mediaPayload?.key || firstGroupItem?.key || null,
                mediaName: mediaPayload?.name || firstGroupItem?.name || null,
                mime: mediaPayload?.mime || firstGroupItem?.mime || null,
                width: mediaPayload?.width || firstGroupItem?.width || null,
                height: mediaPayload?.height || firstGroupItem?.height || null,
                duration: mediaPayload?.duration || firstGroupItem?.duration || null,
                ...(sanitizedMediaItems && sanitizedMediaItems.length > 0 ? { mediaItems: sanitizedMediaItems } : {}),
                sender: myNickname,
                senderCode: myCode,
                senderId: effectiveSenderUuid,
                senderUserId: effectiveSenderUuid,
                ciphertext,
                type: 'message',
                messageId,
                chatId: targetChatId,
                time: Date.now(),
              };
              const doSendPusher = () => {
                try {
                  const jsonStr = JSON.stringify(payload);
                  if (jsonStr.length < 9800) {
                    channel.trigger('client-message', payload);
                  } else {
                    const { mediaItems: _, ...compactPayload } = payload;
                    channel.trigger('client-message', compactPayload);
                  }
                } catch {}
              };
              if (channel.subscribed) doSendPusher(); else channel.bind('pusher:subscription_succeeded', doSendPusher);

              groupService.sendGroupMessage({
                id: messageId,
                groupId: targetChatId,
                senderCode: myCode,
                senderId: effectiveSenderUuid,
                senderUserId: effectiveSenderUuid,
                senderNickname: myNickname,
                ciphertext,
                mediaType: mediaPayload?.type || (mediaItemsPayload?.[0]?.type) || null,
                mediaUrl: mediaPayload?.url || (mediaItemsPayload?.[0]?.url) || null,
                mediaName: mediaPayload?.name || (mediaItemsPayload?.[0]?.name) || null,
                mediaKey: mediaPayload?.key || (mediaItemsPayload?.[0]?.key) || null,
                mediaItems: sanitizedMediaItems || undefined,
                mime: mediaPayload?.mime || (mediaItemsPayload?.[0]?.mime) || null,
                duration: mediaPayload?.duration || (mediaItemsPayload?.[0]?.duration) || null,
                width: mediaPayload?.width || (mediaItemsPayload?.[0]?.width) || null,
                height: mediaPayload?.height || (mediaItemsPayload?.[0]?.height) || null,
                waveform: mediaPayload?.waveform || null,
                audioMetadata: networkAudioMetadata,
                linkPreview: linkPreviewPayload || null,
              }).then((res) => {
                if (res) {
                  useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'sent');
                  networkManager.removeOutboxItem(messageId).catch(() => {});
                } else {
                  if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    networkManager.enqueueOutbox({
                      id: messageId,
                      chatId: targetChatId,
                      text,
                      sender: myNickname,
                      time: localMessage.time || Date.now(),
                      recipientTargets: [],
                      chatType: 'group',
                      mediaPayload,
                      sanitizedMediaItems: sanitizedMediaItems || undefined,
                    }).catch(() => {});
                    useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'sending');
                  } else {
                    useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'failed');
                  }
                }
              }).catch(() => {
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                  networkManager.enqueueOutbox({
                    id: messageId,
                  chatId: targetChatId,
                  text,
                  sender: myNickname,
                  time: localMessage.time || Date.now(),
                  recipientTargets: [],
                  chatType: 'group',
                  mediaPayload,
                  sanitizedMediaItems: sanitizedMediaItems || undefined,
                }).catch(() => {});
                useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'sending');
              } else {
                useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'failed');
              }
            });
            }
          }
          return;
        }

        if (freshChat?.isDraft) {
          const friendCode = freshChat.peerCode || targetChat?.peerCode;
          let myKeys = generateKeyPair();
          let sharedSecret = myKeys.privateKey;
          let ratchetState = undefined;
          let x3dhData: any = undefined;

          if (friendCode) {
            const bundle = await supabaseService.fetchPreKeyBundle(friendCode);
            const myAuth = useAuthStore.getState();
            if (bundle && myAuth.identityKeyPair) {
              const { x3dhInitiator } = await import('../../../lib/x3dh');
              try {
                const sk = await x3dhInitiator(
                  myAuth.identityKeyPair,
                  myKeys,
                  bundle.identityKey,
                  bundle.signedPreKey,
                  bundle.identitySigningKey || '',
                  bundle.preKeySignature,
                  bundle.oneTimePreKey?.publicKey
                );
                const { deriveRootKey } = await import('../../../lib/crypto');
                const rootKey = deriveRootKey(sk);
                const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, bundle.signedPreKey);
                
                sharedSecret = sk;
                ratchetState = ratchet.getState();
                x3dhData = {
                  isX3DH: true,
                  identityKey: myAuth.identityKeyPair.publicKey,
                  usedPreKey: bundle.signedPreKey,
                  usedOneTimePreKey: bundle.oneTimePreKey?.publicKey,
                };
              } catch (err) {
                console.error('[X3DH] Fallback to legacy handshake:', err);
              }
            }
          }

          const myUsername = useAuthStore.getState().username;
          const myBio = useAuthStore.getState().bio;
          const myBirthday = useAuthStore.getState().birthday;
          const myBannerUrl = useAuthStore.getState().bannerUrl;
          const myNumericId = useAuthStore.getState().numericId;
          const reqPayload: any = {
            senderNickname: myNickname,
            senderCode: myCode,
            publicKey: myKeys.publicKey,
            avatarUrl: myAvatarUrl,
            bannerUrl: myBannerUrl,
            chatId: targetChatId,
            numericId: myNumericId,
            username: myUsername,
            bio: myBio,
            birthday: myBirthday,
            ...x3dhData,
          };

          updateChat(targetChatId, {
            isDraft: false,
            sharedSecret: sharedSecret,
            ratchetState: ratchetState,
            isChatInitiator: true,
            lastMsg: x3dhData ? 'E2EE_SECURE_CHANNEL_READY' : '',
          });
          freshChat = {
            ...freshChat,
            isDraft: false,
            sharedSecret: sharedSecret,
            ratchetState: ratchetState,
            isChatInitiator: true,
          };

          if (friendCode) {
            const allHandshakeTargets = new Set<string>([friendCode]);
            if (freshChat.numericId) allHandshakeTargets.add(freshChat.numericId);
            if (freshChat.username) allHandshakeTargets.add(freshChat.username);

            for (const target of allHandshakeTargets) {
              try {
                const chanName = `private-handshake-${target}`;
                const chan = pusher.channel(chanName) || pusher.subscribe(chanName);
                const doSend = () => {
                  try {
                    chan.trigger('client-request-identity', reqPayload);
                  } catch {}
                  chan.unbind('pusher:subscription_succeeded', doSend);
                  setTimeout(() => {
                    try { pusher.unsubscribe(chanName); } catch {}
                  }, 5000);
                };
                if (chan.subscribed) doSend();
                else chan.bind('pusher:subscription_succeeded', doSend);
              } catch {}
              ablyService.sendHandshakeRequest(target, reqPayload).catch(() => {});
              supabaseService.sendOfflineHandshake(
                targetChatId,
                target,
                myNickname,
                myKeys.publicKey,
                myAvatarUrl || null,
                myCode
              ).catch(() => {});
            }
          }
        }

        if (!freshChat?.ratchetState || wasDraft) {
          const recipientTargets = Array.from(new Set([
            targetChat?.peerCode,
            freshChat?.peerCode,
            targetChat?.originalPeerCode,
            freshChat?.originalPeerCode,
            targetChat?.numericId,
            freshChat?.numericId,
            targetChat?.username,
            freshChat?.username,
            targetChat?.name && targetChat.name !== 'Unknown' && targetChat.name !== myNickname ? targetChat.name : undefined,
            freshChat?.name && freshChat.name !== 'Unknown' && freshChat.name !== myNickname ? freshChat.name : undefined,
          ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));
          if (targetChat?.type === 'private' || freshChat?.type === 'private') {
            const currentMsgs = useChatStore.getState().messagesByChatId[targetChatId] || [];
            const targetIdx = currentMsgs.findIndex((m) => m.id === messageId);
            const preHandshakeIndex = targetIdx >= 0 ? targetIdx : currentMsgs.length;
            const plaintext = JSON.stringify(messageData);
            const offlinePromise = Promise.allSettled(
              recipientTargets.map((recipientId) =>
                supabaseService.sendOfflineMessage(
                  targetChatId,
                  myCode || myUserId || myNickname,
                  recipientId,
                  plaintext,
                  preHandshakeIndex,
                  'PRE_HANDSHAKE',
                  messageId,
                )
              )
            );

            const firstPreItem = sanitizedMediaItems?.[0];
            const preHandshakePayload = {
              mediaType: mediaPayload?.type || firstPreItem?.type || null,
              mediaUrl: mediaPayload?.url || firstPreItem?.url || null,
              mediaName: mediaPayload?.name || firstPreItem?.name || null,
              mediaKey: mediaPayload?.key || firstPreItem?.key || (mediaPayload as any)?.mediaKey || null,
              mime: mediaPayload?.mime || firstPreItem?.mime || null,
              width: mediaPayload?.width || firstPreItem?.width || null,
              height: mediaPayload?.height || firstPreItem?.height || null,
              duration: mediaPayload?.duration || firstPreItem?.duration || null,
              waveform: mediaPayload?.waveform || null,
              ...(sanitizedMediaItems && sanitizedMediaItems.length > 0 ? { mediaItems: sanitizedMediaItems } : {}),
              sender: myNickname,
              avatarUrl: myAvatarUrl || null,
              senderCode: myCode,
              senderId: effectiveSenderUuid,
              senderUserId: effectiveSenderUuid,
              ciphertext: plaintext,
              type: 'message',
              index: preHandshakeIndex,
              dhPublicKey: 'PRE_HANDSHAKE',
              messageId,
              chatId: targetChatId,
            };
            let ablyDirectSent = false;
            try {
              await ablyService.sendMessage(targetChatId, preHandshakePayload);
              ablyDirectSent = true;
            } catch {}
            try {
              const channel = pusher.subscribe(`private-chat-${targetChatId}`);
              const doSendPusher = () => {
                try {
                  const jsonStr = JSON.stringify(preHandshakePayload);
                  if (jsonStr.length < 9800) {
                    channel.trigger('client-message', preHandshakePayload);
                  } else {
                    const { mediaItems: _, ...compactPayload } = preHandshakePayload;
                    channel.trigger('client-message', compactPayload);
                  }
                } catch {}
              };
              if (channel.subscribed) doSendPusher(); else channel.bind('pusher:subscription_succeeded', doSendPusher);
            } catch {}

            for (const recipientId of recipientTargets) {
              try {
                const chanName = `private-handshake-${recipientId}`;
                const recipientHsChannel = pusher.channel(chanName) || pusher.subscribe(chanName);
                const doSendDirect = () => {
                  try {
                    const jsonStr = JSON.stringify(preHandshakePayload);
                    if (jsonStr.length < 9800) {
                      recipientHsChannel.trigger('client-message', preHandshakePayload);
                    } else {
                      const { mediaItems: _, ...compactPayload } = preHandshakePayload;
                      recipientHsChannel.trigger('client-message', compactPayload);
                    }
                  } catch {}
                  recipientHsChannel.unbind('pusher:subscription_succeeded', doSendDirect);
                  setTimeout(() => {
                    try { pusher.unsubscribe(chanName); } catch {}
                  }, 5000);
                };
                if (recipientHsChannel.subscribed) doSendDirect();
                else recipientHsChannel.bind('pusher:subscription_succeeded', doSendDirect);
              } catch {}
              try {
                ablyService.sendMessage(recipientId, preHandshakePayload).catch(() => {});
              } catch {}
            }

            const offlineResults = await offlinePromise;
            const hadOfflineSuccess = offlineResults.some((r) => r.status === 'fulfilled');
            if (ablyDirectSent || hadOfflineSuccess) {
              useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'sent');
              networkManager.removeOutboxItem(messageId).catch(() => {});
            } else {
              if (typeof navigator !== 'undefined' && !navigator.onLine) {
                networkManager.enqueueOutbox({
                  id: messageId,
                  chatId: targetChatId,
                  text,
                  sender: myNickname,
                  time: localMessage.time || Date.now(),
                  recipientTargets,
                  chatType: 'private',
                  mediaPayload,
                  sanitizedMediaItems: sanitizedMediaItems || undefined,
                }).catch(() => {});
                useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'sending');
              } else {
                useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'failed');
              }
            }
          }
          return;
        }

        const ratchet = DoubleRatchet.fromState(freshChat.ratchetState);

        if (!ratchet.canSend()) {
          return;
        }

        const plaintext = JSON.stringify(messageData);
        const { ciphertext, index, dhPublicKey, prevChainCount } = await ratchet.encrypt(plaintext);

        updateChat(targetChatId, { ratchetState: ratchet.getState() });

        const firstRatchetItem = sanitizedMediaItems?.[0];
        const payload = {
          mediaType: mediaPayload?.type || firstRatchetItem?.type || null,
          mediaUrl: mediaPayload?.url || firstRatchetItem?.url || null,
          mediaName: mediaPayload?.name || firstRatchetItem?.name || null,
          mediaKey: mediaPayload?.key || firstRatchetItem?.key || (mediaPayload as any)?.mediaKey || null,
          mime: mediaPayload?.mime || firstRatchetItem?.mime || null,
          width: mediaPayload?.width || firstRatchetItem?.width || null,
          height: mediaPayload?.height || firstRatchetItem?.height || null,
          duration: mediaPayload?.duration || firstRatchetItem?.duration || null,
          waveform: mediaPayload?.waveform || null,
          ...(sanitizedMediaItems && sanitizedMediaItems.length > 0 ? { mediaItems: sanitizedMediaItems } : {}),
          sender: myNickname,
          avatarUrl: myAvatarUrl || null,
          senderCode: myCode,
          senderId: effectiveSenderUuid,
          senderUserId: effectiveSenderUuid,
          ciphertext,
          type: 'message',
          index,
          dhPublicKey,
          prevChainCount,
          messageId,
          chatId: targetChatId,
        };

        const recipientTargets = Array.from(new Set([
          freshChat?.peerCode,
          targetChat?.peerCode,
          freshChat?.originalPeerCode,
          targetChat?.originalPeerCode,
          freshChat?.numericId,
          targetChat?.numericId,
          freshChat?.username,
          targetChat?.username,
          freshChat?.name && freshChat.name !== 'Unknown' && freshChat.name !== myNickname ? freshChat.name : undefined,
          targetChat?.name && targetChat.name !== 'Unknown' && targetChat.name !== myNickname ? targetChat.name : undefined,
        ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));

        await (async () => {
          let ablySuccess = false;
          try {
            await ablyService.sendMessage(targetChatId, payload);
            ablySuccess = true;
          } catch {}

          try {
            const channel = pusher.subscribe(`private-chat-${targetChatId}`);
            const doSendPusher = () => {
              try {
                const jsonStr = JSON.stringify(payload);
                if (jsonStr.length < 9800) {
                  channel.trigger('client-message', payload);
                } else {
                  const { mediaItems: _, ...compactPayload } = payload;
                  channel.trigger('client-message', compactPayload);
                }
              } catch {}
            };
            if (channel.subscribed) doSendPusher(); else channel.bind('pusher:subscription_succeeded', doSendPusher);
          } catch {}

          for (const recipientId of recipientTargets) {
            try {
              const chanName = `private-handshake-${recipientId}`;
              const recipientHsChannel = pusher.channel(chanName) || pusher.subscribe(chanName);
              const doSendDirect = () => {
                try {
                  const jsonStr = JSON.stringify(payload);
                  if (jsonStr.length < 9800) {
                    recipientHsChannel.trigger('client-message', payload);
                  } else {
                    const { mediaItems: _, ...compactPayload } = payload;
                    recipientHsChannel.trigger('client-message', compactPayload);
                  }
                } catch {}
                recipientHsChannel.unbind('pusher:subscription_succeeded', doSendDirect);
                setTimeout(() => {
                  try { pusher.unsubscribe(chanName); } catch {}
                }, 5000);
              };
              if (recipientHsChannel.subscribed) doSendDirect();
              else recipientHsChannel.bind('pusher:subscription_succeeded', doSendDirect);
            } catch {}
            try {
              ablyService.sendMessage(recipientId, payload).catch(() => {});
            } catch {}
          }

          let offlineSuccess = false;
          if (freshChat?.type === 'private' || targetChat?.type === 'private') {
            const offlineResults = await Promise.allSettled(
              recipientTargets.map((recipientId) =>
                supabaseService.sendOfflineMessage(
                  targetChatId,
                  myCode || myUserId || myNickname,
                  recipientId,
                  ciphertext,
                  index,
                  dhPublicKey,
                  messageId,
                  prevChainCount
                )
              )
            );
            offlineSuccess = offlineResults.some((r) => r.status === 'fulfilled');
          }

          if (ablySuccess || offlineSuccess) {
            useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'sent');
            networkManager.removeOutboxItem(messageId).catch(() => {});
          } else {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
              networkManager.enqueueOutbox({
                id: messageId,
                chatId: targetChatId,
                text,
                sender: myNickname,
                time: localMessage.time || Date.now(),
                recipientTargets,
                chatType: 'private',
                mediaPayload,
                sanitizedMediaItems: sanitizedMediaItems || undefined,
              }).catch(() => {});
              useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'sending');
            } else {
              useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'failed');
            }
          }
        })().catch(() => {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            networkManager.enqueueOutbox({
              id: messageId,
              chatId: targetChatId,
              text,
              sender: myNickname,
              time: localMessage.time || Date.now(),
              recipientTargets,
              chatType: 'private',
              mediaPayload,
              sanitizedMediaItems: sanitizedMediaItems || undefined,
            }).catch(() => {});
            useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'sending');
          } else {
            useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'failed');
          }
        });
      } catch (err) {
        useChatStore.getState().updateMessageStatus(targetChatId, messageId, 'failed');
      }
    }).catch(() => {});
  };

  const handleSendMessage = useCallback(async (overrideText?: string, linkPreview?: LinkPreviewData) => {
    const textToSend = (typeof overrideText === 'string' ? overrideText : inputText).trim();
    const pendingFwd = useChatStore.getState().pendingForwardMessages;
    if (!textToSend && (!pendingFwd || pendingFwd.length === 0)) return;

    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
    const currentId = activeChatId || useChatStore.getState().activeChatId;
    if (currentId) {
      useChatStore.getState().clearDraft(currentId);
    }
    setInputText('');
    stopTyping();

    if (pendingFwd && pendingFwd.length > 0) {
      const isAnon = useChatStore.getState().anonymousForwardingEnabled;
      useChatStore.getState().setPendingForwardMessages(null);

      for (const msg of pendingFwd) {
        const forwardedFrom = isAnon
          ? {
              isAnonymous: true,
              isIdHidden: true,
              time: msg.time,
            }
          : {
              isAnonymous: false,
              isIdHidden: false,
              sender: msg.sender,
              senderId: msg.senderId,
              senderAvatarUrl: msg.forwardedFrom?.senderAvatarUrl || null,
              chatId: msg.forwardedFrom?.chatId || activeChatId || undefined,
              time: msg.time,
            };

        const mediaPayload = msg.mediaUrl ? {
          type: msg.mediaType || 'photo',
          url: msg.mediaUrl,
          key: msg.mediaKey,
          name: msg.mediaName,
          mime: msg.mime,
          audioMetadata: msg.audioMetadata,
          duration: msg.duration,
          waveform: msg.waveform,
          size: msg.fileSize,
          width: msg.width,
          height: msg.height,
          thumbnail: msg.thumbnail,
          blurPreview: msg.blurPreview,
        } : undefined;

        await triggerMessage(
          msg.text || '',
          mediaPayload,
          msg.linkPreview,
          undefined,
          msg.mediaItems,
          forwardedFrom
        );
      }
    }

    if (textToSend) {
      if (replyingTo) {
        let cleanText = replyingTo.text.replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ').trim();
        if (/^\[Sticker\]/i.test(cleanText) || cleanText.includes('/stickers/') || cleanText.includes('\\stickers\\') || cleanText.includes('.stickers')) {
          cleanText = '[Sticker]';
        }
        const idTag = replyingTo.senderId ? `[id:${replyingTo.id || ''}:${replyingTo.senderId}] ` : (replyingTo.id ? `[id:${replyingTo.id}] ` : '');
        await triggerMessage(`↩ ${idTag}${replyingTo.sender}: ${truncateText(cleanText, 200)}, ${formatTime(replyingTo.time)}\n${textToSend}`, undefined, linkPreview);
      } else {
        await triggerMessage(textToSend, undefined, linkPreview);
      }
    }
    setReplyingTo(null);
    inputRef.current?.focus();

    atBottomRef.current = true;
    setShowScrollDown(false);

    scrollToBottom(false);
    requestAnimationFrame(() => {
      scrollToBottom(false);
    });
  }, [inputText, activeChatId, stopTyping, replyingTo, triggerMessage, scrollToBottom]);

  const handleSendAsTxt = async (_caption: string) => {
    if (!activeChatId || !inputText.trim()) return;
    const textContent = inputText.trim();

    try {
      const base64Content = btoa(unescape(encodeURIComponent(textContent)));
      const tempPath = await window.orbita?.writeTempFile(base64Content);
      if (!tempPath) return;

      const sizeMb = new Blob([textContent]).size / (1024 * 1024);

      const txtFile: AttachedFile = {
        filePath: tempPath,
        preview: null,
        name: 'message.txt',
        sizeMb,
        fileType: 'document',
        uploadedMb: 0,
        uploading: false,
        error: null,
        uploadedUrl: null,
      };

      if (draftDebounceTimerRef.current) {
        clearTimeout(draftDebounceTimerRef.current);
        draftDebounceTimerRef.current = null;
      }
      if (activeChatId) useChatStore.getState().clearDraft(activeChatId);
      setAttachedFiles([txtFile]);
      setIsAttachmentModalOpen(true);
      setInputText('');
    } catch (err) {
      console.error('Failed to create txt file:', err);
    }
  };

  const handleRetryMessage = useCallback(async (indexOrId: number | string) => {
    if (!activeChatId) return;
    const msgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
    const targetMsg = typeof indexOrId === 'string'
      ? msgs.find((m) => m.id === indexOrId)
      : (typeof indexOrId === 'number' && indexOrId >= 0 ? msgs[indexOrId] : null);

    if (!targetMsg || !targetMsg.id) return;

    useChatStore.getState().updateMessageStatus(activeChatId, targetMsg.id, 'sending');

    let finalMediaUrl = targetMsg.mediaUrl;
    let finalMediaKey = targetMsg.mediaKey;
    const isLocalMedia = Boolean(targetMsg.mediaUrl && !targetMsg.mediaUrl.startsWith('http://') && !targetMsg.mediaUrl.startsWith('https://'));
    const localPath = (targetMsg as any).localFilePath || (isLocalMedia ? targetMsg.mediaUrl : null);

    if (isLocalMedia && localPath && typeof window !== 'undefined' && window.orbita?.uploadToCloudinary) {
      try {
        let fileBytes: ArrayBuffer | null = null;
        if (window.orbita?.rustReadFileFast) {
          const bin = await window.orbita.rustReadFileFast(localPath);
          if (bin) fileBytes = (bin.buffer as ArrayBuffer).slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
        }
        if (!fileBytes && (window.orbita as any)?.readFileAsArrayBuffer) {
          fileBytes = await (window.orbita as any).readFileAsArrayBuffer(localPath);
        }
        if (fileBytes) {
          finalMediaKey = generateEphemeralKey();
          const encryptedBlob = await encryptFile(fileBytes, finalMediaKey || '');
          const encryptedAb = await encryptedBlob.arrayBuffer();
          const tempPath = await window.orbita?.writeTempFile(new Uint8Array(encryptedAb), undefined);
          if (tempPath) {
            const publicId = `orbita_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const result = await window.orbita?.uploadToCloudinary(tempPath, publicId);
            window.orbita?.deleteTempFile?.(tempPath);
            if (result && result.success && result.secure_url) {
              finalMediaUrl = result.secure_url;
              const localBlob = new Blob([fileBytes], { type: targetMsg.mime || 'application/octet-stream' });
              mediaManager.setDirectDecryptedMedia(result.secure_url, finalMediaKey, localBlob, targetMsg.mime || 'application/octet-stream', activeChatId);
            } else {
              useChatStore.getState().updateMessageStatus(activeChatId, targetMsg.id, 'error');
              return;
            }
          }
        }
      } catch {
        useChatStore.getState().updateMessageStatus(activeChatId, targetMsg.id, 'error');
        return;
      }
    }

    const mediaPayload = finalMediaUrl ? {
      type: targetMsg.mediaType || 'photo',
      url: finalMediaUrl,
      key: finalMediaKey,
      name: targetMsg.mediaName,
      mime: targetMsg.mime,
      audioMetadata: targetMsg.audioMetadata,
      duration: targetMsg.duration,
      waveform: targetMsg.waveform,
      size: targetMsg.fileSize,
      width: targetMsg.width,
      height: targetMsg.height,
      thumbnail: targetMsg.thumbnail,
      blurPreview: targetMsg.blurPreview,
    } : undefined;

    await triggerMessage(
      targetMsg.text || '',
      mediaPayload,
      targetMsg.linkPreview,
      targetMsg.id,
      targetMsg.mediaItems
    );
  }, [activeChatId, triggerMessage]);

  return {
    triggerMessage,
    handleSendMessage,
    handleSendAsTxt,
    handleRetryMessage,
  };
};
