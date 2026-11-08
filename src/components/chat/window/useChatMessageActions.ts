import React, { useCallback } from 'react';
import { useChatStore, type Message } from '../../../store/useChatStore';
import { useToastStore } from '../../../store/useToastStore';
import { ablyService } from '../../../services/ablyService';
import { supabaseService } from '../../../services/supabaseService';
import { channelService } from '../../../services/channelService';
import { groupService } from '../../../services/groupService';
import { mediaManager } from '../../../services/mediaManager';
import { getPusher, getGroupPusher, CLIENT_SESSION_ID } from '../../../utils/pusher';
import { DoubleRatchet } from '../../../lib/double-ratchet';
import { clampMenuPosition, type ContextMenuState } from '../MessageContextMenu';
import { type ConfirmActionType } from '../../common/ActionConfirmModal';
import { parseMedia, decryptedUrlCache, encryptFile, generateEphemeralKey } from './chatWindowHelpers';
import { arrayBufferToBase64 } from '../../../utils/messageUtils';

export interface UseChatMessageActionsProps {
  activeChatId: string | null;
  activeChat: any;
  messages: Message[];
  myCode: string;
  myNickname: string;
  myUserId?: string;
  sharedSecret?: string | null;
  isChannelOwner: boolean;
  selection: any;
  pinnedMessage?: any;
  inputRef: React.RefObject<any>;
  setReplyingTo: React.Dispatch<React.SetStateAction<any>>;
  setEditingIndex: (index: number | null) => void;
  setEditText: (text: string) => void;
  confirmModal: {
    isOpen: boolean;
    type: ConfirmActionType | null;
    messageId?: string;
    messageIndex?: number;
    selectedIndices?: number[];
    selectedIds?: string[];
    selectedCount?: number;
  };
  setConfirmModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    type: ConfirmActionType | null;
    messageId?: string;
    messageIndex?: number;
    selectedIndices?: number[];
    selectedIds?: string[];
    selectedCount?: number;
  }>>;
  contextMenu: ContextMenuState;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  reactionDebounceTimers: React.MutableRefObject<Map<string, ReturnType<typeof setTimeout>>>;
  updateChat: (chatId: string, partial: any) => void;
  triggerMessage: (text: string, mediaPayload?: any, linkPreview?: any, existingMessageId?: string, mediaItemsPayload?: any) => Promise<void>;
  t: (key: string, defaultVal?: any) => string;
}

export interface UseChatMessageActionsReturn {
  triggerEditMessage: (index: number, newText: string) => Promise<void>;
  triggerDeleteMessage: (indexOrId?: number | string) => void;
  triggerPinMessage: (indexOrId?: number | string) => void;
  triggerUnpinMessage: () => void;
  requestDeleteMessage: (indexOrId?: number | string) => void;
  requestDeleteSelected: () => void;
  requestPinMessage: (indexOrId?: number | string) => void;
  requestUnpinMessage: () => void;
  handleConfirmAction: () => void;
  triggerReactionMessage: (indexOrId: number | string, emoji: string) => void;
  handleContextMenu: (e: React.MouseEvent, target: Message | number, isOwn: boolean) => void;
  handleReply: (indexOrId?: number | string) => void;
  handleEdit: (indexOrId?: number | string) => void;
  handleCopy: (indexOrId?: number | string) => void;
  handleCopyImage: (blobUrlOrUrl: string) => Promise<void>;
  handleSaveAs: (indexOrId?: number | string) => Promise<void>;
  handleSelectFromMenu: () => void;
  isMessagePinned: (indexOrMsgOrId?: number | Message | string) => boolean;
}

export const useChatMessageActions = ({
  activeChatId,
  activeChat,
  messages,
  myCode,
  myNickname,
  myUserId,
  sharedSecret,
  isChannelOwner,
  selection,
  pinnedMessage,
  inputRef,
  setReplyingTo,
  setEditingIndex,
  setEditText,
  confirmModal,
  setConfirmModal,
  contextMenu,
  setContextMenu,
  reactionDebounceTimers,
  updateChat,
  triggerMessage,
  t,
}: UseChatMessageActionsProps): UseChatMessageActionsReturn => {
  const triggerEditMessage = async (index: number, newText: string) => {
    if (!activeChatId || !sharedSecret) return;
    if (activeChat?.type === 'channel' && !isChannelOwner) return;

    setEditingIndex(null);
    setEditText('');

    const updatedMessages = [...messages];
    if (updatedMessages[index]) {
      const editedTarget = { ...updatedMessages[index], text: newText, isEdited: true, editedAt: Date.now() };
      updatedMessages[index] = editedTarget;
      useChatStore.setState((state) => ({
        messagesByChatId: {
          ...state.messagesByChatId,
          [activeChatId]: updatedMessages,
        },
        chats: state.chats.map((c) => c.id === activeChatId ? { ...c, lastMsg: newText } : c),
      }));
      if (editedTarget.id && typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
        (window as any).orbita.storageAddMessage(activeChatId, editedTarget.id, editedTarget).catch(() => {});
      }
    }

    setContextMenu((prev) => ({ ...prev, visible: false }));

    if (activeChatId === 'notes') return;

    try {
      const chat = useChatStore.getState().chats.find((c) => c.id === activeChatId);
      const targetId = updatedMessages[index]?.id;
      const recipientTargets = Array.from(new Set([
        activeChat?.peerCode,
        chat?.peerCode,
        activeChat?.originalPeerCode,
        chat?.originalPeerCode,
        activeChat?.numericId,
        chat?.numericId,
        activeChat?.username,
        chat?.username,
        (activeChat?.name && activeChat.name.length === 36) ? activeChat.name : undefined,
        (chat?.name && chat.name.length === 36) ? chat.name : undefined,
      ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));

      const editPlaintext = JSON.stringify({
        type: 'edit',
        targetMessageId: targetId,
        messageId: targetId,
        editIndex: index,
        text: newText,
        isEdited: true,
        editedAt: Date.now(),
        sender: myNickname,
        senderId: myUserId || myCode,
        senderUserId: myUserId,
      });

      if (chat && chat.ratchetState) {
        const ratchet = DoubleRatchet.fromState(chat.ratchetState);
        const { ciphertext, index: newIndex, dhPublicKey: editDhPublicKey, prevChainCount: editPrevChainCount } = await ratchet.encrypt(editPlaintext);
        const editPayload = {
          sender: myNickname,
          senderUserId: myUserId,
          senderId: myUserId || myCode,
          text: ciphertext,
          type: 'edit',
          editIndex: index,
          targetMessageId: targetId,
          messageId: targetId,
          isEdited: true,
          editedAt: Date.now(),
          index: newIndex,
          dhPublicKey: editDhPublicKey,
          prevChainCount: editPrevChainCount,
        };
        ablyService.sendMessage(activeChatId, editPayload).catch(() => {});
        const pusher = getPusher();
        const chanName = `private-chat-${activeChatId}`;
        const channel = pusher.channel(chanName) || pusher.subscribe(chanName);
        const send = () => {
          channel.trigger('client-message', editPayload);
          channel.unbind('pusher:subscription_succeeded', send);
          updateChat(activeChatId, { ratchetState: ratchet.getState() });
        };
        if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

        for (const rId of recipientTargets) {
          supabaseService.sendOfflineMessage(
            activeChatId,
            myUserId || myCode || myNickname,
            rId,
            ciphertext,
            newIndex,
            editDhPublicKey,
            `edit_${targetId || Date.now()}`,
            editPrevChainCount
          ).catch(() => {});
        }
      } else {
        const editPayload = {
          sender: myNickname,
          senderUserId: myUserId,
          senderId: myUserId || myCode,
          text: editPlaintext,
          type: 'edit',
          editIndex: index,
          targetMessageId: targetId,
          messageId: targetId,
          isEdited: true,
          editedAt: Date.now(),
          index: 0,
          dhPublicKey: 'PRE_HANDSHAKE',
        };
        ablyService.sendMessage(activeChatId, editPayload).catch(() => {});
        for (const rId of recipientTargets) {
          supabaseService.sendOfflineMessage(
            activeChatId,
            myUserId || myCode || myNickname,
            rId,
            editPlaintext,
            0,
            'PRE_HANDSHAKE',
            `edit_${targetId || Date.now()}`
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to broadcast message edit:', err);
    }
  };

  const triggerDeleteMessage = (indexOrId?: number | string) => {
    if (!activeChatId) return;
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const targetMsg = (typeof indexOrId === 'string' ? messages.find((m) => m.id === indexOrId) : null)
      || (typeof indexOrId === 'number' && indexOrId >= 0 ? messages[indexOrId] : null)
      || (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null);
    const targetMsgId = targetMsg?.id || (typeof indexOrId === 'string' ? indexOrId : undefined);
    const resolvedIndex = targetMsg ? messages.findIndex((m) => m.id === targetMsg.id) : (typeof indexOrId === 'number' ? indexOrId : -1);
    if (activeChatId === 'notes') {
      if (targetMsgId) {
        useChatStore.getState().deleteMessage(activeChatId, targetMsgId);
      } else {
        const updatedMessages = messages.filter((m, i) => targetMsgId ? m.id !== targetMsgId : i !== resolvedIndex);
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [activeChatId]: updatedMessages,
          },
        }));
      }
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    if (targetMsgId) {
      useChatStore.getState().deleteMessage(activeChatId, targetMsgId);
    } else {
      const updatedMessages = messages.filter((m, i) => targetMsgId ? m.id !== targetMsgId : i !== resolvedIndex);
      useChatStore.setState((state) => ({
        messagesByChatId: {
          ...state.messagesByChatId,
          [activeChatId]: updatedMessages,
        },
      }));
      updateChat(activeChatId, { lastMsg: updatedMessages.length > 0 ? updatedMessages[updatedMessages.length - 1].text : t('common.history_cleared') });
    }

    const payload = {
      sender: myNickname,
      senderUserId: myUserId,
      senderId: myUserId || myCode,
      text: '',
      type: 'delete-message',
      targetMessageId: targetMsgId,
      deleteIndex: resolvedIndex >= 0 ? resolvedIndex : 0,
    };

    ablyService.sendMessage(activeChatId, payload).catch(() => {});

    const isGroup = activeChat?.type === 'group';
    const pusher = isGroup ? getGroupPusher() : getPusher();
    const chanName = activeChat?.type === 'channel'
      ? `public-channel-${activeChatId}`
      : isGroup
      ? `presence-group-${activeChatId}`
      : `private-chat-${activeChatId}`;
    const channel = pusher.channel(chanName) || pusher.subscribe(chanName);
    const send = () => {
      channel.trigger('client-message', payload);
      channel.unbind('pusher:subscription_succeeded', send);
    };
    if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

    if (activeChat?.type === 'channel') {
      if (targetMsgId) {
        channelService.deletePost(activeChatId, targetMsgId, myUserId);
      }
    } else if (targetMsgId) {
      const recipientTargets = Array.from(new Set([
        activeChat?.peerCode,
        activeChat?.originalPeerCode,
        activeChat?.numericId,
        activeChat?.username,
        activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
      ].filter((rec): rec is string => Boolean(rec && rec !== myCode && rec !== myUserId))));
      for (const rId of recipientTargets) {
        supabaseService.deleteMessage(activeChatId, targetMsgId, rId, myCode).catch(() => {});
      }
    }

    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const triggerPinMessage = (indexOrId?: number | string) => {
    if (!activeChatId || !sharedSecret) return;
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const targetMsg = (typeof indexOrId === 'string' ? messages.find((m) => m.id === indexOrId) : null)
      || (typeof indexOrId === 'number' && indexOrId >= 0 ? messages[indexOrId] : null)
      || (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null);
    const resolvedIndex = targetMsg ? messages.findIndex((m) => m.id === targetMsg.id) : (typeof indexOrId === 'number' ? indexOrId : contextMenu.messageIndex);
    const pinnedMsg = targetMsg || (resolvedIndex >= 0 ? messages[resolvedIndex] : null);
    if (!pinnedMsg) return;

    const pinData = {
      messageId: pinnedMsg.id,
      text: pinnedMsg.text,
      sender: pinnedMsg.sender,
      time: pinnedMsg.time,
      pinnedAt: Date.now(),
      pinnedBy: myNickname,
    };

    updateChat(activeChatId, { pinnedMessage: pinData });

    const pinSystemMsg: Message = {
      id: `sys_pin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sender: 'system',
      text: `${myNickname} закрепил(а) сообщение`,
      time: Date.now(),
      status: 'sent',
      mediaType: 'system',
      systemType: 'pin',
      actorNickname: myNickname,
      targetNickname: pinnedMsg.sender || '',
    };
    useChatStore.getState().addMessage(activeChatId, pinSystemMsg);
    try {
      (window as any).orbita?.storageAddMessage?.(activeChatId, pinSystemMsg.id, pinSystemMsg);
    } catch {}

    if (activeChatId === 'notes') {
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    const pinPayload = {
      type: 'pin-message',
      pinData,
      sender: myNickname,
      actorNickname: myNickname,
      systemMessage: pinSystemMsg,
    };
    ablyService.sendMessage(activeChatId, pinPayload).catch(() => {});

    const isGroup = activeChat?.type === 'group';
    const pusher = isGroup ? getGroupPusher() : getPusher();
    const chanName = activeChat?.type === 'channel'
      ? `public-channel-${activeChatId}`
      : isGroup
      ? `presence-group-${activeChatId}`
      : `private-chat-${activeChatId}`;
    const channel = pusher.channel(chanName) || pusher.subscribe(chanName);
    const send = () => {
      channel.trigger('client-message', pinPayload);
      channel.unbind('pusher:subscription_succeeded', send);
    };
    if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

    if (isGroup) {
      groupService.sendGroupMessage({
        id: pinSystemMsg.id,
        groupId: activeChatId,
        senderNickname: myNickname || 'system',
        senderCode: 'system',
        ciphertext: JSON.stringify({
          text: pinSystemMsg.text,
          mediaType: 'system',
          systemType: 'pin',
          actorNickname: myNickname,
          targetNickname: pinnedMsg.sender || '',
        }),
        mediaType: 'system',
      }).catch(() => {});
    }

    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const triggerUnpinMessage = () => {
    if (!activeChatId) return;
    if (activeChat?.type === 'channel' && !isChannelOwner) return;

    updateChat(activeChatId, { pinnedMessage: null });

    if (activeChatId === 'notes') {
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    const unpinPayload = {
      type: 'unpin-message',
      sender: myNickname,
    };
    ablyService.sendMessage(activeChatId, unpinPayload).catch(() => {});

    const isGroup = activeChat?.type === 'group';
    const pusher = isGroup ? getGroupPusher() : getPusher();
    const chanName = activeChat?.type === 'channel'
      ? `public-channel-${activeChatId}`
      : isGroup
      ? `presence-group-${activeChatId}`
      : `private-chat-${activeChatId}`;
    const channel = pusher.channel(chanName) || pusher.subscribe(chanName);
    const send = () => {
      channel.trigger('client-message', unpinPayload);
      channel.unbind('pusher:subscription_succeeded', send);
    };
    if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const requestDeleteMessage = (indexOrId?: number | string) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    setContextMenu((prev) => ({ ...prev, visible: false }));
    const msg = typeof indexOrId === 'number'
      ? messages[indexOrId]
      : typeof indexOrId === 'string'
      ? messages.find((m) => m.id === indexOrId)
      : (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null)
        || (contextMenu.messageIndex >= 0 ? messages[contextMenu.messageIndex] : null);
    const realIndex = msg ? messages.findIndex((m) => m.id === msg.id) : (typeof indexOrId === 'number' ? indexOrId : contextMenu.messageIndex);
    setConfirmModal({
      isOpen: true,
      type: 'delete_message',
      messageIndex: realIndex,
      messageId: msg?.id || (typeof indexOrId === 'string' ? indexOrId : contextMenu.messageId),
    });
  };

  const requestDeleteSelected = () => {
    if (!selection.selectedIds || selection.selectedIds.size === 0) return;
    const ids = Array.from(selection.selectedIds as Set<string>).slice(0, 200);
    if (ids.length === 0) return;
    setConfirmModal({
      isOpen: true,
      type: 'delete_message',
      selectedIds: ids,
      selectedCount: ids.length,
    });
  };

  const requestPinMessage = (indexOrId?: number | string) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    setContextMenu((prev) => ({ ...prev, visible: false }));
    const msg = typeof indexOrId === 'number'
      ? messages[indexOrId]
      : typeof indexOrId === 'string'
      ? messages.find((m) => m.id === indexOrId)
      : (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null)
        || (contextMenu.messageIndex >= 0 ? messages[contextMenu.messageIndex] : null);
    const realIndex = msg ? messages.findIndex((m) => m.id === msg.id) : (typeof indexOrId === 'number' ? indexOrId : contextMenu.messageIndex);
    setConfirmModal({
      isOpen: true,
      type: 'pin_message',
      messageIndex: realIndex,
      messageId: msg?.id || (typeof indexOrId === 'string' ? indexOrId : contextMenu.messageId),
    });
  };

  const requestUnpinMessage = () => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    setContextMenu((prev) => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: 'unpin_message',
    });
  };

  const handleConfirmAction = () => {
    if (!confirmModal.type) return;
    if (confirmModal.type === 'delete_message') {
      if (confirmModal.selectedIds && confirmModal.selectedIds.length > 0) {
        const ids = confirmModal.selectedIds.slice(0, 200);
        if (activeChatId) {
          useChatStore.getState().deleteMessages(activeChatId, ids);
          const payload = {
            sender: myNickname,
            senderUserId: myUserId,
            senderId: myUserId || myCode,
            text: '',
            type: 'delete-messages',
            targetMessageIds: ids,
            targetMessageId: ids[0],
          };
          ablyService.sendMessage(activeChatId, payload).catch(() => {});
        }
        selection.exitSelectionMode();
      } else if (confirmModal.selectedIndices && confirmModal.selectedIndices.length > 0) {
        for (const idx of confirmModal.selectedIndices) {
          triggerDeleteMessage(idx);
        }
        selection.exitSelectionMode();
      } else if (confirmModal.messageId !== undefined) {
        triggerDeleteMessage(confirmModal.messageId);
      } else if (confirmModal.messageIndex !== undefined) {
        triggerDeleteMessage(confirmModal.messageIndex);
      }
    } else if (confirmModal.type === 'pin_message') {
      if (confirmModal.messageId !== undefined) {
        triggerPinMessage(confirmModal.messageId);
      } else if (confirmModal.messageIndex !== undefined) {
        triggerPinMessage(confirmModal.messageIndex);
      }
    } else if (confirmModal.type === 'unpin_message') {
      triggerUnpinMessage();
    }
    setConfirmModal({ isOpen: false, type: null });
  };

  const triggerReactionMessage = (targetMessageIndexOrId: number | string, emoji: string) => {
    if (!activeChatId) return;

    const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
    const setReaction = useChatStore.getState().setReaction;

    const targetMsg = typeof targetMessageIndexOrId === 'number'
      ? currentMsgs[targetMessageIndexOrId]
      : currentMsgs.find((m) => m.id === targetMessageIndexOrId);

    if (!targetMsg || !targetMsg.id) return;
    const msgId = targetMsg.id;

    const userAliases = [myUserId, myCode, myNickname, 'YOU'].filter(Boolean) as string[];
    const reactionUserId = myUserId || myCode || myNickname || 'YOU';
    const result = setReaction(activeChatId, msgId, emoji, reactionUserId, 'toggle', userAliases);
    if (result === 'limit_reached') {
      useToastStore.getState().showToast(t('common.max_reactions_limit'));
      return;
    }

    setContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));

    if (activeChatId === 'notes') return;

    const timerKey = `${activeChatId}:${msgId}:${emoji}`;
    const existingTimer = reactionDebounceTimers.current.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      reactionDebounceTimers.current.delete(timerKey);
      const latestMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
      const latestMsg = latestMsgs.find((m) => m.id === msgId);
      const currentUsers = latestMsg?.reactions?.[emoji] || [];
      const isPresent = currentUsers.includes(reactionUserId) || (myCode ? currentUsers.includes(myCode) : false) || (myUserId ? currentUsers.includes(myUserId) : false) || currentUsers.includes(myNickname);
      const finalAction: 'add' | 'remove' = isPresent ? 'add' : 'remove';

      if (activeChat?.type === 'channel') {
        channelService.toggleReaction(activeChatId, msgId, emoji, reactionUserId, finalAction, CLIENT_SESSION_ID);
        return;
      }

      const payload = {
        chatId: activeChatId,
        messageId: msgId,
        emoji,
        sender: myNickname,
        senderId: myUserId || myCode || myNickname,
        senderUserId: myUserId,
        action: finalAction,
        sessionId: CLIENT_SESSION_ID,
      };

      const recipientTargets = Array.from(new Set([
        activeChat?.peerCode,
        activeChat?.originalPeerCode,
        activeChat?.numericId,
        activeChat?.username,
        activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
      ].filter((rec): rec is string => Boolean(rec && rec !== myCode && rec !== myUserId))));

      for (const rId of recipientTargets) {
        supabaseService.saveReaction(activeChatId, rId, msgId, emoji, reactionUserId, finalAction, myNickname).catch(() => {});
      }

      ablyService.sendMessage(activeChatId, {
        ...payload,
        type: 'reaction',
      }).catch(() => {});

      try {
        const isGroup = activeChat?.type === 'group';
        const pusher = isGroup ? getGroupPusher() : getPusher();
        const channelName = isGroup ? `presence-group-${activeChatId}` : `private-chat-${activeChatId}`;
        const channel = pusher.channel(channelName) || pusher.subscribe(channelName);
        const send = () => {
          try {
            channel.trigger('client-message', payload);
          } catch {}
          channel.unbind('pusher:subscription_succeeded', send);
        };
        if (channel.subscribed) send();
        else channel.bind('pusher:subscription_succeeded', send);
      } catch (err) {
        console.error('Failed to broadcast reaction:', err);
      }
    }, 400);

    reactionDebounceTimers.current.set(timerKey, timer);
  };

  const getMessageMenuType = useCallback((msg: Message): 'text' | 'singleImage' | 'multipleImages' | 'file' | 'sticker' => {
    const media = parseMedia(msg);
    if (msg.mediaItems && msg.mediaItems.length > 1) {
      return 'multipleImages';
    }
    const isGif = Boolean(
      (media.url && /\.gif(\?.*)?$/i.test(media.url)) ||
      (msg.mediaUrl && (
        /\.gif(\?.*)?$/i.test(msg.mediaUrl) ||
        msg.mediaUrl.includes('tenor.com') ||
        msg.mediaUrl.includes('giphy.com') ||
        msg.mediaUrl.includes('.giphy.') ||
        msg.mediaUrl.includes('c.tenor.com')
      )) ||
      (msg.text && /^\[GIF\]/i.test(msg.text.trim()))
    );
    if (isGif) {
      return 'file';
    }
    if (media.type === 'sticker' || msg.mediaType === 'sticker' || (msg.text && /^\[Sticker\]/i.test(msg.text.trim()))) {
      return 'sticker';
    }
    if (media.type === 'image') {
      return 'singleImage';
    }
    if (media.type === 'file' || media.type === 'video' || media.type === 'music' || media.type === 'voice') {
      return 'file';
    }
    return 'text';
  }, []);

  const handleContextMenu = (e: React.MouseEvent, target: Message | number, isOwn: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 256, 320);
    const msg = typeof target === 'number' ? messages[target] : target;
    if (!msg) return;
    const realIndex = messages.findIndex((m) => m.id === msg.id);
    const index = realIndex >= 0 ? realIndex : (typeof target === 'number' ? target : -1);
    const type = getMessageMenuType(msg);
    const hasMultipleImages = msg.mediaItems ? msg.mediaItems.filter((item) => item.type === 'photo').length > 1 : false;
    const isFailed = msg.status === 'failed' || msg.status === 'error';
    setContextMenu({ visible: true, x, y, messageIndex: index, messageId: msg.id, isOwn, type, hasMultipleImages, isFailed });
  };

  const handleReply = (indexOrId?: number | string) => {
    const originalMessage = (typeof indexOrId === 'string' ? messages.find((m) => m.id === indexOrId) : null)
      || (typeof indexOrId === 'number' && indexOrId >= 0 ? messages[indexOrId] : null)
      || (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null)
      || (contextMenu.messageIndex >= 0 ? messages[contextMenu.messageIndex] : null);

    if (!originalMessage) {
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    const originalSenderId = originalMessage.senderId || (originalMessage as any).userCode || (originalMessage as any).senderCode;
    const realIndex = messages.findIndex((m) => m.id === originalMessage.id);
    setReplyingTo({
      id: originalMessage.id,
      index: realIndex >= 0 ? realIndex : contextMenu.messageIndex,
      sender: originalMessage.sender,
      senderId: originalSenderId,
      text: originalMessage.text,
      time: originalMessage.time,
    });
    setContextMenu((prev) => ({ ...prev, visible: false }));
    inputRef.current?.focus();
  };

  const handleEdit = (indexOrId?: number | string) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const msg = (typeof indexOrId === 'string' ? messages.find((m) => m.id === indexOrId) : null)
      || (typeof indexOrId === 'number' && indexOrId >= 0 ? messages[indexOrId] : null)
      || (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null)
      || (contextMenu.messageIndex >= 0 ? messages[contextMenu.messageIndex] : null);
    if (!msg) return;
    const realIndex = messages.findIndex((m) => m.id === msg.id);
    const index = realIndex >= 0 ? realIndex : (typeof indexOrId === 'number' ? indexOrId : 0);
    if (msg.mediaType) {
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'ape', 'alac', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp', 'csv', 'md', 'log', 'json', 'xml', 'yaml', 'yml', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'exe', 'dmg', 'apk', 'iso'];
      window.orbita?.pickFile(allowedExtensions).then(async (raw: any) => {
        if (!raw) return;
        const filePath = Array.isArray(raw) ? raw[0] : raw;
        if (!filePath) return;
        const fileName = filePath.split(/[\\/]/).pop() || 'file';
        const ext = (fileName.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
        let fileType: 'photo' | 'video' | 'audio' | 'document' = 'document';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'photo';
        else if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext)) fileType = 'video';
        else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'ape', 'alac'].includes(ext)) fileType = 'audio';
        try {
          const dataUrl = await window.orbita?.readFileAsDataURL(filePath);
          if (!dataUrl) return;
          const binary = atob(dataUrl.split(',')[1] || '');
          const fileArrayBuffer = new ArrayBuffer(binary.length);
          const view = new Uint8Array(fileArrayBuffer);
          for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
          const fileKey = generateEphemeralKey();
          const encryptedBlob = await encryptFile(fileArrayBuffer, fileKey);
          const encryptedBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(encryptedBlob);
          });
          const tempPath = await window.orbita?.writeTempFile(encryptedBase64);
          if (!tempPath) return;
          const publicId = `orbita_${Date.now()}`;
          const result = await window.orbita?.uploadToCloudinary(tempPath, publicId);
          window.orbita?.deleteTempFile(tempPath);
          if (result && result.success && result.secure_url) {
            triggerDeleteMessage(msg.id || index);
            const prefix = { photo: '[Photo]', video: '[Video]', audio: '[Audio]', document: '[File]' }[fileType];
            const text = `${prefix} ${fileName}`;
            triggerMessage(text, {
              type: fileType === 'photo' ? 'photo' : fileType === 'video' ? 'video' : fileType === 'audio' ? 'audio' : 'file',
              url: result.secure_url,
              key: fileKey,
              name: fileName,
            });
          }
        } catch (err) {
          console.error('Failed to replace file:', err);
        }
      });
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }
    setEditingIndex(index);
    setEditText(msg.text);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleCopy = (indexOrId?: number | string) => {
    const msg = (typeof indexOrId === 'string' ? messages.find((m) => m.id === indexOrId) : null)
      || (typeof indexOrId === 'number' && indexOrId >= 0 ? messages[indexOrId] : null)
      || (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null)
      || (contextMenu.messageIndex >= 0 ? messages[contextMenu.messageIndex] : null);

    if (msg) {
      const cleanText = msg.text.replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n/, '');
      navigator.clipboard.writeText(cleanText);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleCopyImage = async (blobUrlOrUrl: string) => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
    try {
      if (blobUrlOrUrl.startsWith('data:image/')) {
        const base64 = blobUrlOrUrl.replace(/^data:image\/\w+;base64,/, '');
        if (window.orbita?.copyImage) {
          await window.orbita.copyImage(base64);
          useToastStore.getState().showToast(t('chatWindow.image_copied', 'Изображение скопировано'));
          return;
        }
      }
      const response = await fetch(blobUrlOrUrl);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      if (window.orbita?.copyImage) {
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        await window.orbita.copyImage(base64);
        useToastStore.getState().showToast(t('chatWindow.image_copied', 'Изображение скопировано'));
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
      useToastStore.getState().showToast(t('chatWindow.image_copied', 'Изображение скопировано'));
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      useToastStore.getState().showToast(t('chatWindow.copy_image_failed', 'Не удалось скопировать изображение'));
    }
  };

  const handleSaveAs = async (indexOrId?: number | string) => {
    const msg = (typeof indexOrId === 'string' ? messages.find((m) => m.id === indexOrId) : null)
      || (typeof indexOrId === 'number' && indexOrId >= 0 ? messages[indexOrId] : null)
      || (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null)
      || (contextMenu.messageIndex >= 0 ? messages[contextMenu.messageIndex] : null);

    if (!msg) {
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    const media = parseMedia(msg);
    const mediaUrl = media.url || msg.mediaUrl;
    if (!mediaUrl) {
      setContextMenu((prev) => ({ ...prev, visible: false }));
      return;
    }

    const isGif = Boolean(
      (mediaUrl && /\.gif(\?.*)?$/i.test(mediaUrl)) ||
      (msg.mediaUrl && /\.gif(\?.*)?$/i.test(msg.mediaUrl)) ||
      (msg.text && /^\[GIF\]/i.test(msg.text.trim()))
    );

    let defaultName = media.fileName || msg.mediaName || (isGif ? 'animation.gif' : (media.type === 'video' ? 'video.mp4' : (media.type === 'voice' ? 'voice.ogg' : (media.type === 'music' ? 'audio.mp3' : 'image.jpg'))));

    if (media.type === 'music' && msg.text && msg.text.startsWith('[Audio]')) {
      const titleMatch = msg.text.match(/^\[Audio\]\s+(.*?)\s+(https?:\/\/\S+)\s*$/i);
      if (titleMatch && titleMatch[1]) {
        const rawName = titleMatch[1].trim();
        if (rawName && !rawName.match(/^voice_/i) && !rawName.endsWith('.ogg')) {
          let cleanTitle = rawName;
          let artist = '';
          if (cleanTitle.includes(' — ')) {
            const parts = cleanTitle.split(' — ');
            artist = parts[0].trim();
            cleanTitle = parts.slice(1).join(' — ').trim();
          } else if (cleanTitle.includes(' - ')) {
            const parts = cleanTitle.split(' - ');
            artist = parts[0].trim();
            cleanTitle = parts.slice(1).join(' - ').trim();
          }
          defaultName = artist ? `${artist} — ${cleanTitle}.mp3` : `${cleanTitle}.mp3`;
        }
      }
    }

    setContextMenu((prev) => ({ ...prev, visible: false }));

    const filters = isGif
      ? [{ name: 'video/mp4 (*.mp4 *.mp4v *.mpg4)', extensions: ['mp4', 'mp4v', 'mpg4'] }, { name: 'All Files', extensions: ['*'] }]
      : media.type === 'image' || media.type === 'sticker'
      ? [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }, { name: 'All Files', extensions: ['*'] }]
      : media.type === 'video'
      ? [{ name: 'video/mp4 (*.mp4 *.mp4v *.mpg4)', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'] }, { name: 'All Files', extensions: ['*'] }]
      : media.type === 'music' || media.type === 'audio'
      ? [{ name: 'Audio (*.mp3 *.wav *.flac *.aac *.ogg *.m4a)', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] }, { name: 'All Files', extensions: ['*'] }]
      : media.type === 'voice'
      ? [{ name: 'Voice (*.ogg)', extensions: ['ogg'] }]
      : [{ name: 'All Files', extensions: ['*'] }];

    try {
      let arrayBuffer: ArrayBuffer | null = null;
      const fileSecret = msg.mediaKey || sharedSecret;
      const cacheKey = fileSecret ? `${mediaUrl}::${fileSecret}` : null;
      const cached = (cacheKey && fileSecret) ? (decryptedUrlCache.get(cacheKey) || mediaManager.getCachedMedia(mediaUrl, fileSecret)?.blobUrl) : null;

      if (cached) {
        const response = await fetch(cached);
        const blob = await response.blob();
        arrayBuffer = await blob.arrayBuffer();
      } else if (mediaUrl.startsWith('blob:') || mediaUrl.startsWith('data:')) {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();
        arrayBuffer = await blob.arrayBuffer();
      } else if (fileSecret) {
        const item = await mediaManager.getMedia(mediaUrl, fileSecret, defaultName, activeChatId || undefined, msg.id);
        if (item?.blobUrl) {
          const response = await fetch(item.blobUrl);
          const blob = await response.blob();
          arrayBuffer = await blob.arrayBuffer();
        }
      } else {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();
        arrayBuffer = await blob.arrayBuffer();
      }

      if (arrayBuffer) {
        const uint8 = new Uint8Array(arrayBuffer);
        if (window.orbita && window.orbita.saveFileAs) {
          await window.orbita.saveFileAs(uint8, defaultName, filters);
        } else if (window.orbita && window.orbita.downloadsSave) {
          await window.orbita.downloadsSave(arrayBufferToBase64(arrayBuffer), defaultName);
        } else {
          const blob = new Blob([arrayBuffer]);
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = defaultName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }
      } else if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
        if (window.orbita && window.orbita.saveFileAs) {
          await window.orbita.saveFileAs(mediaUrl, defaultName, filters);
        }
      }
    } catch (err) {
      if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
        if (window.orbita && window.orbita.saveFileAs) {
          await window.orbita.saveFileAs(mediaUrl, defaultName, filters);
        }
      }
      console.error('Failed to save file:', err);
    }
  };

  const handleSelectFromMenu = () => {
    const msg = (contextMenu.messageId ? messages.find((m) => m.id === contextMenu.messageId) : null)
      || (contextMenu.messageIndex >= 0 ? messages[contextMenu.messageIndex] : null);
    if (!msg || !msg.id) return;
    selection.enterSelectionMode(msg.id);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const isMessagePinned = (indexOrMsgOrId?: number | Message | string): boolean => {
    if (!pinnedMessage) return false;
    let msg: Message | undefined;
    if (typeof indexOrMsgOrId === 'object' && indexOrMsgOrId !== null) {
      msg = indexOrMsgOrId;
    } else if (typeof indexOrMsgOrId === 'string') {
      msg = messages.find((m) => m.id === indexOrMsgOrId);
    } else if (typeof indexOrMsgOrId === 'number' && indexOrMsgOrId >= 0) {
      msg = messages[indexOrMsgOrId];
    }
    if (!msg && contextMenu.messageId) {
      msg = messages.find((m) => m.id === contextMenu.messageId);
    }
    if (!msg && contextMenu.messageIndex >= 0) {
      msg = messages[contextMenu.messageIndex];
    }
    if (!msg) return false;
    if (pinnedMessage.id && msg.id) return msg.id === pinnedMessage.id;
    if (pinnedMessage.messageId && msg.id) return msg.id === pinnedMessage.messageId;
    return msg.sender === pinnedMessage.sender && msg.text === pinnedMessage.text && msg.time === pinnedMessage.time;
  };

  return {
    triggerEditMessage,
    triggerDeleteMessage,
    triggerPinMessage,
    triggerUnpinMessage,
    requestDeleteMessage,
    requestDeleteSelected,
    requestPinMessage,
    requestUnpinMessage,
    handleConfirmAction,
    triggerReactionMessage,
    handleContextMenu,
    handleReply,
    handleEdit,
    handleCopy,
    handleCopyImage,
    handleSaveAs,
    handleSelectFromMenu,
    isMessagePinned,
  };
};
