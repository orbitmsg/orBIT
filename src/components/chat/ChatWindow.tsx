import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  ChevronDown
} from 'lucide-react';
import { GroupEmptyCard } from './GroupEmptyCard';
import { useChatStore, type Message, type ChatAction, type ChatTypingUser, isMessageOutgoing } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ablyService } from '../../services/ablyService';
import { deriveChannelKey } from '../../lib/crypto';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '../../store/useCallStore';
import { useConnectionStore } from '../../store/useConnectionStore';
import { supabaseService } from '../../services/supabaseService';
import { AttachedFile } from './FileAttachmentModal';
import { useSelection } from '../../hooks/useSelection';
import { SelectionPanel } from './SelectionPanel';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { MessageInput } from './MessageInput';
import { useShallow } from 'zustand/react/shallow';
import { useToastStore } from '../../store/useToastStore';
import { groupService } from '../../services/groupService';
import { type ConfirmActionType } from '../common/ActionConfirmModal';
import { type MediaViewerItem } from './TelegramMediaViewer';
import { EmptyChatGreeting } from './EmptyChatGreeting';
import { ChannelEmptyCard } from './ChannelEmptyCard';
export {
  CustomPinIcon,
  CustomUnpinIcon,
  CustomEditIcon,
  CustomReplyIcon,
  CustomClearHistoryIcon,
  CustomMuteIcon,
  CustomUnmuteIcon
} from './ChatIcons';
import { type ContextMenuState } from './MessageContextMenu';
import { ChatPinnedBar } from './ChatPinnedBar';
import { ChatHeader } from './ChatHeader';
import { ChatWindowModals } from './window/ChatWindowModals';
import { ChatMessageItem } from './window/ChatMessageItem';
import { useChatDragDrop } from './window/useChatDragDrop';
import { useChatScroll } from './window/useChatScroll';
import { useChatRealtime } from './window/useChatRealtime';
import { useChatMessageActions } from './window/useChatMessageActions';
import { useChatMessageSend } from './window/useChatMessageSend';
import { useChatAudioAndFiles } from './window/useChatAudioAndFiles';
import { useChatChannelsAndCalls } from './window/useChatChannelsAndCalls';
import { useChatInputAndTyping } from './window/useChatInputAndTyping';

declare global {
  interface Window {
    _lastSendTime?: number;
  }
}

import {
  MAX_FILE_MB,
  getOptimalMessageBatchSize,
  MessageList,
  EMPTY_ARRAY,
  EMPTY_TYPING_USERS,
  decryptedUrlCache,
  saveChatScroll,
  restoreChatScroll,
  getChatDateLabel,
  buildChatMediaViewerItems,
  resolveMediaViewerFallback,
} from './window/chatWindowHelpers';

interface ChatWindowProps {
  isMobileView?: boolean;
  onBack?: () => void;
}

export const ChatWindow = memo(({ isMobileView = false, onBack }: ChatWindowProps) => {
  const { t, i18n } = useTranslation();
  const activeChatId = useChatStore((s) => s.activeChatId);
  const activeChat = useChatStore(
    useShallow((s) => {
      const chat = s.chats.find((c) => c.id === activeChatId);
      if (!chat) return undefined;
      return {
        ...chat,
        lastMsg: '',
        updatedAt: 0,
        unreadCount: 0,
        ratchetState: undefined,
      };
    })
  );
  const rawMessages = useChatStore(useShallow((s) => {
    const chatId = activeChatId || '';
    return chatId ? s.messagesByChatId[chatId] || EMPTY_ARRAY : EMPTY_ARRAY;
  }));

  const messages = useMemo(() => {
    let hasAnyLargeMediaGroup = false;
    for (let i = 0; i < rawMessages.length; i++) {
      const m = rawMessages[i];
      if (m.mediaItems && m.mediaItems.length > 10) {
        hasAnyLargeMediaGroup = true;
        break;
      }
    }
    if (!hasAnyLargeMediaGroup) return rawMessages.slice().sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

    const result: Message[] = [];
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      if (msg.mediaItems && msg.mediaItems.length > 10) {
        for (let j = 0; j < msg.mediaItems.length; j += 10) {
          const chunk = msg.mediaItems.slice(j, j + 10);
          const isFirst = j === 0;
          result.push({
            ...msg,
            id: isFirst ? msg.id : `${msg.id}_part_${Math.floor(j / 10)}`,
            mediaItems: chunk,
            text: isFirst ? msg.text : '',
            time: msg.time + Math.floor(j / 10),
          });
        }
      } else {
        result.push(msg);
      }
    }
    return result.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
  }, [rawMessages]);

  const [renderedCount, setRenderedCount] = useState<number>(getOptimalMessageBatchSize);
  const [prevChatId, setPrevChatId] = useState<string | null>(activeChatId);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef<number | null>(null);

  if (prevChatId !== activeChatId) {
    setPrevChatId(activeChatId);
    setRenderedCount(getOptimalMessageBatchSize());
  }

  useEffect(() => {
    decryptedUrlCache.clear();
    prevScrollHeightRef.current = null;
    prevScrollTopRef.current = null;
  }, [activeChatId]);

  const hasMoreAbove = messages.length > renderedCount;
  const startIndex = hasMoreAbove ? messages.length - renderedCount : 0;
  const visibleMessages = useMemo(() => {
    if (!hasMoreAbove) return messages;
    return messages.slice(startIndex);
  }, [messages, hasMoreAbove, startIndex]);

  const loadMoreAbove = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el || !hasMoreAbove) return;
    prevScrollHeightRef.current = el.scrollHeight;
    prevScrollTopRef.current = el.scrollTop;
    const batch = getOptimalMessageBatchSize();
    setRenderedCount((prev) => Math.min(messages.length, prev + batch));
  }, [hasMoreAbove, messages.length]);

  useLayoutEffect(() => {
    if (prevScrollHeightRef.current !== null && prevScrollTopRef.current !== null && messagesContainerRef.current) {
      const el = messagesContainerRef.current;
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      if (diff !== 0) {
        el.scrollTop = prevScrollTopRef.current + diff;
      }
      prevScrollHeightRef.current = null;
      prevScrollTopRef.current = null;
    }
  }, [renderedCount]);

  const addMessage = useChatStore((s) => s.addMessage);
  const updateChat = useChatStore((s) => s.updateChat);
  const closeChat = useChatStore((s) => s.closeChat);
  const setActiveProfileChatId = useChatStore((s) => s.setActiveProfileChatId);
  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myAvatarUrl = useAuthStore((s) => s.avatarUrl);
  const myUserId = useAuthStore((s) => s.userId);
  const bubbleRadius = useChatStore((s) => s.bubbleRadius);
  const voiceCallsEnabled = useChatStore((s) => s.voiceCallsEnabled);
  const typingIndicatorsEnabled = useChatStore((s) => s.typingIndicatorsEnabled);
  const readReceiptsEnabled = useChatStore((s) => s.readReceiptsEnabled);
  const myCode = useChatStore((s) => s.myCode);

  const [inputText, setInputText] = useState('');
  const [isDiscordFileLimitModalOpen, setIsDiscordFileLimitModalOpen] = useState(false);
  const [isSendAsTxtModalOpen, setIsSendAsTxtModalOpen] = useState(false);
  const [isSupportTicketsModalOpen, setIsSupportTicketsModalOpen] = useState(false);
  const [unsafeLinkData, setUnsafeLinkData] = useState<{ isOpen: boolean; url: string }>({ isOpen: false, url: '' });
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);

  useEffect(() => {
    const handleReplyTicketEvent = (e: any) => {
      const tNum = e?.detail?.ticketNumber;
      if (tNum) {
        setInputText(`/reply ${tNum} `);
      }
    };
    window.addEventListener('orbita:reply-ticket', handleReplyTicketEvent);
    return () => window.removeEventListener('orbita:reply-ticket', handleReplyTicketEvent);
  }, []);

  useEffect(() => {
    if (activeChat?.type === 'group' && activeChatId) {
      groupService.getGroup(activeChatId).then((info) => {
        if (info && info.members && info.members.length > 0) {
          useChatStore.getState().updateChat(activeChatId, {
            members: info.members as any[],
            membersCount: Math.max(info.membersCount || 0, info.members.length),
          });
        }
      }).catch(() => {});
    }
  }, [activeChatId, activeChat?.type]);

  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});
  const checkedMembersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeChat || activeChat.type !== 'group' || !activeChat.members) return;
    let isMounted = true;
    const allChats = useChatStore.getState().chats || [];
    const usersById = useChatStore.getState().usersById || {};

    activeChat.members.forEach((m) => {
      const code = m.userId || (m as any).userCode;
      if (!code || checkedMembersRef.current.has(code)) return;
      if (m.avatarUrl || (m as any).avatar_url) return;
      if (memberAvatars[code]) return;

      checkedMembersRef.current.add(code);

      let localAvatar = '';
      if (usersById[code]?.avatarUrl) {
        localAvatar = usersById[code].avatarUrl;
      }
      if (!localAvatar) {
        const directChat = allChats.find(c => c.type === 'private' && (c.peerCode === code || c.originalPeerCode === code));
        if (directChat?.avatarUrl) localAvatar = directChat.avatarUrl;
      }

      if (localAvatar) {
        setMemberAvatars(prev => ({
          ...prev,
          [code]: localAvatar,
        }));
        return;
      }

      supabaseService.lookupPublicProfile(code).then((profile) => {
        if (isMounted && profile?.avatar_url) {
          setMemberAvatars((prev) => ({
            ...prev,
            [code]: profile.avatar_url!,
          }));
        }
      }).catch(() => {});
    });
    return () => {
      isMounted = false;
    };
  }, [activeChat?.id, activeChat?.type, activeChat?.members?.length]);


  const selection = useSelection();
  const inputRef = useRef<HTMLDivElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);
  const [isSendingFiles, setIsSendingFiles] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditText('');
  }, []);
  const handleOpenTxtModal = useCallback(() => {
    setIsSendAsTxtModalOpen(true);
  }, []);

  const triggerMessageRef = useRef<((...args: any[]) => any) | null>(null);

  const {
    stopTyping,
    handleSetInputText,
    draftDebounceTimerRef,
    isEmojiPanelOpen,
    setActivePickerTab,
    recentEmojis,
    addRecentEmoji,
    emojiButtonRef,
    handleEmojiSelect,
    handleSendGif,
    handleSendSticker,
    handleEmojiPanelClose,
    toggleEmoji,
    handleEmojiMouseEnter,
    handleEmojiMouseLeave,
    headerRef,
    headerHeight,
    handleMessageClick,
  } = useChatInputAndTyping({
    activeChatId,
    myNickname,
    typingIndicatorsEnabled,
    setInputText,
    inputRef,
    editingIndex,
    setEditText,
    selection,
    triggerMessage: (...args) => triggerMessageRef.current?.(...args),
  });
  const [replyingTo, setReplyingTo] = useState<{ id?: string; senderId?: string; index: number; sender: string; text: string; time: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, messageIndex: -1, isOwn: false, type: 'text', hasMultipleImages: false });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: ConfirmActionType | null;
    messageIndex?: number;
    messageId?: string;
    selectedIndices?: number[];
  }>({
    isOpen: false,
    type: null,
  });
  const activeChatTypingUsers = useChatStore(
    useShallow((s) => (activeChatId ? s.typingByChatId[activeChatId] || EMPTY_TYPING_USERS : EMPTY_TYPING_USERS))
  );
  const otherUserTyping = Boolean(activeChat?.type !== 'group' && activeChatTypingUsers.length > 0);
  const otherUserAction: ChatAction = activeChatTypingUsers[0]?.action || 'typing';
  const groupTypingUsers: ChatTypingUser[] = activeChat?.type === 'group' ? activeChatTypingUsers : EMPTY_TYPING_USERS;
  const reactionDebounceTimers = useRef<Map<string, any>>(new Map());
  const [mediaViewerState, setMediaViewerState] = useState<{
    isOpen: boolean;
    initialIndex: number;
    customItems?: MediaViewerItem[];
  }>({
    isOpen: false,
    initialIndex: 0,
  });

  const sharedSecret = useMemo(() => {
    if (activeChat?.type === 'channel') {
      return activeChat.sharedSecret || deriveChannelKey(activeChat.id);
    }
    return activeChat?.sharedSecret;
  }, [activeChat?.id, activeChat?.type, activeChat?.sharedSecret]);

  const chatMediaViewerItems = useMemo(() => {
    return buildChatMediaViewerItems(messages, sharedSecret, activeChatId);
  }, [messages, sharedSecret, activeChatId]);

  const openMediaViewer = useCallback((url: string, messageId?: string, customItems?: MediaViewerItem[], explicitIndex?: number) => {
    const items = customItems || chatMediaViewerItems;
    let index = typeof explicitIndex === 'number' && explicitIndex >= 0 && customItems ? explicitIndex : -1;
    if (index === -1) {
      if (url) {
        index = items.findIndex((it) => it.url === url && (!messageId || it.messageId === messageId));
        if (index === -1) {
          index = items.findIndex((it) => it.url === url);
        }
      }
      if (index === -1 && messageId) {
        index = items.findIndex((it) => it.messageId === messageId);
      }
    }
    const finalItems = customItems || (index === -1 && items.length === 0 ? resolveMediaViewerFallback(url, messageId, messages, sharedSecret, activeChatId) : items);
    const initialIndex = index !== -1 ? index : 0;
    const orbita = (window as any).orbita;

    if (orbita?.openMediaWindow) {
      orbita.openMediaWindow({
        items: finalItems,
        initialIndex,
        sharedSecret,
        chatId: activeChatId,
      });
      return;
    }

    setMediaViewerState({
      isOpen: true,
      initialIndex,
      customItems: customItems || (index === -1 ? finalItems : undefined),
    });
  }, [chatMediaViewerItems, messages, sharedSecret, activeChatId]);
  const atBottomRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const lastChatSwitchTimeRef = useRef(0);

  const unreadCount = useMemo(() => {
    if (!showScrollDown || !messages || messages.length === 0) return 0;
    return messages.filter((m) => !isMessageOutgoing(m, myCode, myNickname, activeChat, myUserId) && !m.read).length;
  }, [showScrollDown, messages, myCode, myNickname, activeChat, myUserId]);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const readMessageIdsRef = useRef<Set<string>>(new Set());
  const prevMessagesLengthRef = useRef(messages.length);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  const activeChatIdRef = useRef<string | null>(activeChatId);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (activeChatIdRef.current && el && activeChatIdRef.current !== activeChatId) {
      saveChatScroll(activeChatIdRef.current, el);
    }
    activeChatIdRef.current = activeChatId;
    sendQueueRef.current = Promise.resolve();
    setShowScrollDown(false);
    lastChatSwitchTimeRef.current = performance.now();
    if (el && activeChatId) {
      const restored = restoreChatScroll(activeChatId, el);
      if (!restored) {
        el.scrollTop = el.scrollHeight;
        atBottomRef.current = true;
        setShowScrollDown(false);
      } else {
        const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 100;
        atBottomRef.current = isBottom;
        setShowScrollDown(!isBottom);
      }
      requestAnimationFrame(() => {
        if (el) {
          const r = restoreChatScroll(activeChatId, el);
          if (!r) el.scrollTop = el.scrollHeight;
        }
      });
      setTimeout(() => {
        if (el) {
          const r = restoreChatScroll(activeChatId, el);
          if (!r) el.scrollTop = el.scrollHeight;
        }
      }, 50);
      setTimeout(() => {
        if (el && atBottomRef.current) {
          el.scrollTop = el.scrollHeight;
        }
      }, 150);
      setTimeout(() => {
        if (el && atBottomRef.current) {
          el.scrollTop = el.scrollHeight;
        }
      }, 350);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [activeChatId]);

  useEffect(() => {
    const handleForceScroll = (e?: Event) => {
      const customDetail = (e as CustomEvent)?.detail;
      if (!customDetail?.chatId || customDetail.chatId === activeChatId) {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        });
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }, 50);
      }
    };

    window.addEventListener('orbita:scroll-to-bottom', handleForceScroll);
    return () => window.removeEventListener('orbita:scroll-to-bottom', handleForceScroll);
  }, [activeChatId]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const wasAdded = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (wasAdded) {
      const lastMsg = messages[messages.length - 1];
      const isOutgoing = Boolean(lastMsg && isMessageOutgoing(lastMsg, myCode, myNickname, activeChat, myUserId));
      const wasAtBottom = atBottomRef.current || (el.scrollHeight - el.scrollTop - el.clientHeight <= 160);

      if (isOutgoing || wasAtBottom) {
        el.scrollTop = el.scrollHeight;
        atBottomRef.current = true;
        setShowScrollDown(false);
        if (activeChatId) {
          saveChatScroll(activeChatId, el);
        }
        setTimeout(() => {
          if (el && atBottomRef.current) {
            el.scrollTop = el.scrollHeight;
          }
        }, 1);
        setTimeout(() => {
          if (el && atBottomRef.current) {
            el.scrollTop = el.scrollHeight;
          }
        }, 60);
      } else {
        setShowScrollDown(true);
      }
    } else if (atBottomRef.current && performance.now() - lastChatSwitchTimeRef.current < 1500) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, myCode, myNickname, activeChat, activeChatId, myUserId]);

  useEffect(() => {
    if (otherUserTyping) {
      const el = messagesContainerRef.current;
      if (!el) return;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 180;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    }
  }, [otherUserTyping]);

  useEffect(() => {
    if (activeChatId) {
      inputRef.current?.focus();
    }
  }, [activeChatId]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!activeChatId) return;
      if (useChatStore.getState().currentView !== 'chats') return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || (activeEl.isContentEditable && activeEl !== inputRef.current)) {
          return;
        }
      }

      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (inputRef.current && document.activeElement !== inputRef.current) {
        if (e.key.length === 1 || e.key === 'Backspace') {
          inputRef.current.focus();
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(inputRef.current);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeChatId]);

  useEffect(() => {
    const handleWindowFocus = () => {
      if (activeChatId && useChatStore.getState().currentView === 'chats') {
        inputRef.current?.focus();
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [activeChatId]);

  const handleChatWindowMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target) {
      const isInteractive = target.closest(
        'button, a, input, textarea, select, option, audio, video, [role="button"], [role="menuitem"], [role="dialog"], [role="menu"], .emoji-picker, .modal'
      );
      if (isInteractive) {
        return;
      }
    }
  }, []);

  const handleChatWindowMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      return;
    }

    const target = e.target as HTMLElement | null;
    if (target) {
      const isInteractive = target.closest(
        'button, a, input, textarea, select, option, audio, video, [role="button"], [role="menuitem"], [role="dialog"], [role="menu"], .emoji-picker, .modal'
      );
      if (isInteractive) {
        return;
      }
    }

    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(inputRef.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, []);

  const handleChatWindowClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      return;
    }

    const target = e.target as HTMLElement | null;
    if (target) {
      const isInteractive = target.closest(
        'button, a, input, textarea, select, option, audio, video, [role="button"], [role="menuitem"], [role="dialog"], [role="menu"], .emoji-picker, .modal'
      );
      if (isInteractive) {
        return;
      }
    }

    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(inputRef.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, []);

  const showToast = (message: string) => {
    useToastStore.getState().showToast(message, 'text');
  };

  const isOnline = activeChat?.online ?? false;
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);
  const pinnedMessage = activeChat?.pinnedMessage;
  const [floatingDate, setFloatingDate] = useState<string | null>(null);
  const [showFloatingDate, setShowFloatingDate] = useState(false);
  const [floatingDateOffsetY, setFloatingDateOffsetY] = useState(0);
  const floatingDateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const themeColor = 'var(--accent-color)';

  const startCall = useCallStore((state) => state.startCall);
  const isUserInCall = useCallStore((state) => state.callState !== 'idle' && state.callState !== 'ended' && !!state.activeCall);


  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleIsScrolling = useCallback((scrolling: boolean) => {
    const el = document.querySelector('.custom-chat-scrollbar');
    if (!el) return;
    if (scrolling) {
      if (scrollbarTimeoutRef.current) clearTimeout(scrollbarTimeoutRef.current);
      el.classList.add('is-scrolling');
    } else {
      if (scrollbarTimeoutRef.current) clearTimeout(scrollbarTimeoutRef.current);
      scrollbarTimeoutRef.current = setTimeout(() => {
        el.classList.remove('is-scrolling');
      }, 900);
    }
  }, []);

  const getDateLabel = useCallback((ts: number) => getChatDateLabel(ts, i18n.language), [i18n.language]);

  const {
    chatThumb,
    isChatActive,
    triggerChatActive,
    handleChatMouseLeave,
    handleMessagesWheel,
    handleScroll,
    scrollToBottom,
    scrollToPinnedMessage,
    handleQuoteClick,
    notifyPeerReadBatch,
  } = useChatScroll({
    activeChatId,
    activeChat,
    messages,
    visibleMessages,
    startIndex,
    hasMoreAbove,
    loadMoreAbove,
    renderedCount,
    setRenderedCount,
    messagesContainerRef,
    messagesContentRef,
    atBottomRef,
    lastChatSwitchTimeRef,
    readMessageIdsRef,
    myCode,
    myNickname,
    myUserId,
    readReceiptsEnabled,
    pinnedMessage,
    getDateLabel,
    handleIsScrolling,
    floatingDateTimeoutRef,
    setShowScrollDown,
    setHighlightedIndex,
    setShowFloatingDate,
    setFloatingDate,
    setFloatingDateOffsetY,
  });
  const isChannelOwner = useMemo(() => {
    if (activeChat?.type !== 'channel') return false;
    if (myUserId) {
      if (activeChat.creatorId && activeChat.creatorId === myUserId) return true;
      if (activeChat.members?.some((m) => m.userId === myUserId && (m.role === 'owner' || m.role === 'admin'))) return true;
    }
    if (activeChat.isOwner && (!activeChat.creatorId || (myUserId && activeChat.creatorId === myUserId))) return true;
    if ((activeChat.role === 'owner' || activeChat.role === 'admin') && (!activeChat.creatorId || (myUserId && activeChat.creatorId === myUserId))) return true;
    return false;
  }, [activeChat, myUserId]);

  const {
    isDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDropFiles,
  } = useChatDragDrop({
    activeChatId,
    sharedSecret,
    maxFileMb: MAX_FILE_MB,
    setAttachedFiles,
    setIsAttachmentModalOpen,
    setIsDiscordFileLimitModalOpen,
  });

  const isPrivateChat = activeChat?.type === 'private';

  const {
    triggerMessage,
    handleSendMessage,
    handleSendAsTxt,
  } = useChatMessageSend({
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
  });
  triggerMessageRef.current = triggerMessage;

  const {
    triggerEditMessage,
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
  } = useChatMessageActions({
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
  });

  const handleEditMessage = async (overrideText?: string) => {
    const textToSave = (typeof overrideText === 'string' ? overrideText : editText).trim();
    if (editingIndex === null || !textToSave) return;
    triggerEditMessage(editingIndex, textToSave);
    inputRef.current?.focus();
  };

  useChatRealtime({
    activeChatId,
    activeChat,
    messagesContainerRef,
    myCode,
    myNickname,
    myUserId,
    notifyPeerReadBatch,
    setMemberAvatars,
  });

  const isRatchetReady = useMemo(() => {
    if (!activeChat) return false;
    return true;
  }, [activeChat]);

  const canSend = (!!inputText.trim() || !!attachedFiles.length) && editingIndex === null && isRatchetReady;

  const {
    isRecording,
    isRecordingPaused,
    recordingTime,
    recordingAmplitude,
    pauseAudioRecording,
    resumeAudioRecording,
    cancelAudioRecording,
    handleStartRecording,
    handleStopRecordingAndSend,
    handleFilePick,
    handleSendFiles,
    handleAddMoreFiles,
  } = useChatAudioAndFiles({
    activeChatId,
    activeChat,
    isChannelOwner,
    sharedSecret,
    isRatchetReady,
    myCode,
    myNickname,
    addMessage,
    updateChat,
    triggerMessage,
    attachedFiles,
    setAttachedFiles,
    setIsAttachmentModalOpen,
    setIsDiscordFileLimitModalOpen,
    setIsSendingFiles,
    draftDebounceTimerRef,
    setInputText,
    scrollToBottom,
    showToast,
    t,
  });

  useEffect(() => {
    if (!activeChatId || activeChatId === 'notes' || !typingIndicatorsEnabled) return;
    if (isRecording) {
      ablyService.sendTyping(activeChatId, true, myNickname, 'voice');
      const timer = setInterval(() => {
        if (activeChatId && activeChatId !== 'notes') {
          ablyService.sendTyping(activeChatId, true, myNickname, 'voice');
        }
      }, 1500);
      return () => {
        clearInterval(timer);
        if (activeChatId && activeChatId !== 'notes') {
          ablyService.sendTyping(activeChatId, false, myNickname, 'voice');
        }
      };
    }
  }, [isRecording, activeChatId, myNickname, typingIndicatorsEnabled]);

  const {
    handleLinkClick,
    handleOpenDirectChat,
    handleAudioCallPress,
    handleCallPress,
    handleMediaGoToMessage,
    handleMediaForwardMessage,
    handleMediaDeleteMessage,
    isSubscribed,
    isSubscribing,
    handleSubscribeToChannel,
    handleMessageButtonClick,
  } = useChatChannelsAndCalls({
    activeChatId,
    activeChat,
    isChannelOwner,
    messages,
    messagesContainerRef,
    atBottomRef,
    lastChatSwitchTimeRef,
    setShowScrollDown,
    setHighlightedIndex,
    setReplyingTo,
    setInputText,
    inputRef,
    setUnsafeLinkData,
    myCode,
    myNickname,
    myUserId,
    memberAvatars,
    voiceCallsEnabled,
    startCall,
    showToast,
    t,
  });


  useEffect(() => {
    return () => {
      if (scrollbarTimeoutRef.current) clearTimeout(scrollbarTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    readMessageIdsRef.current.clear();
  }, [activeChatId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.ctrlKey && e.key === 'o') { e.preventDefault(); closeChat(); } };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeChat]);

  useEffect(() => {
    const blockBrowserMenu = (e: MouseEvent) => { const target = e.target as HTMLElement; if (!target.closest('[data-message]')) e.preventDefault(); };
    document.addEventListener('contextmenu', blockBrowserMenu);
    return () => document.removeEventListener('contextmenu', blockBrowserMenu);
  }, []);

  const renderMessage = useCallback((index: number, msg: Message) => {
    const prevMsg = index > 0 ? messagesRef.current[index - 1] : null;
    const nextMsg = index < messagesRef.current.length - 1 ? messagesRef.current[index + 1] : null;

    return (
      <ChatMessageItem
        key={msg.id || `msg_${msg.time}_${index}`}
        index={index}
        msg={msg}
        prevMsg={prevMsg}
        nextMsg={nextMsg}
        myCode={myCode}
        myNickname={myNickname}
        myUserId={myUserId}
        activeChat={activeChat}
        activeChatId={activeChatId}
        sharedSecret={sharedSecret}
        bubbleRadius={bubbleRadius}
        themeColor={themeColor}
        highlightedIndex={highlightedIndex}
        selection={selection}
        editingIndex={editingIndex}
        editText={editText}
        setEditText={setEditText}
        setEditingIndex={setEditingIndex}
        memberAvatars={memberAvatars}
        isMessagePinned={isMessagePinned}
        getDateLabel={getDateLabel}
        openMediaViewer={openMediaViewer}
        triggerReactionMessage={triggerReactionMessage}
        triggerEditMessage={triggerEditMessage}
        handleMessageClick={handleMessageClick}
        handleContextMenu={handleContextMenu}
        handleCallPress={handleCallPress}
        handleQuoteClick={handleQuoteClick}
        handleLinkClick={handleLinkClick}
        handleMessageButtonClick={handleMessageButtonClick}
        handleOpenDirectChat={handleOpenDirectChat}
      />
    );
  }, [myCode, myNickname, myUserId, activeChat, activeChatId, sharedSecret, bubbleRadius, themeColor, highlightedIndex, selection, editingIndex, editText, memberAvatars, isMessagePinned, getDateLabel, openMediaViewer, triggerReactionMessage, triggerEditMessage, handleMessageClick, handleContextMenu, handleCallPress, handleQuoteClick, handleLinkClick, handleMessageButtonClick, handleOpenDirectChat]);



  return (
    <div
      className="flex flex-col h-full bg-transparent overflow-hidden min-h-0 relative"
      onMouseDown={handleChatWindowMouseDown}
      onMouseUp={handleChatWindowMouseUp}
      onClick={handleChatWindowClick}
      onContextMenu={(e) => e.preventDefault()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDropFiles}
    >
      <ChatHeader
        headerRef={headerRef}
        activeChatId={activeChatId}
        activeChat={activeChat}
        isMobileView={isMobileView}
        onBack={onBack}
        isOnline={isOnline}
        otherUserTyping={otherUserTyping}
        otherUserAction={otherUserAction}
        groupTypingUsers={groupTypingUsers}
        isServerConnected={isServerConnected}
        voiceCallsEnabled={voiceCallsEnabled}
        onAudioCallPress={handleAudioCallPress}
        onAddMember={() => setIsAddMemberModalOpen(true)}
        onOpenSupportTickets={() => setIsSupportTicketsModalOpen(true)}
        onProfileClick={() => setActiveProfileChatId(activeChatId)}
      />

      {selection.isSelectionMode && (
        <SelectionPanel
          selectedCount={selection.selectedIds.size}
          onDelete={activeChat?.type === 'channel' && !isChannelOwner ? undefined : requestDeleteSelected}
          onCancel={selection.exitSelectionMode}
          height={headerHeight}
        />
      )}

      {activeChat?.type === 'group' && activeChat.activeCallRoom && !isUserInCall && (
        <div
          className="flex-shrink-0 flex items-center justify-between select-none px-4 py-2.5 transition-all"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 14%, var(--bg-secondary))',
            borderBottom: 'none',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              className="w-6 h-6 flex-shrink-0 text-[var(--accent-color,#7C3AED)]"
            >
              <g fill="none">
                <path fill="currentColor" d="m13.087 21.388l.645.382zm.542-.916l-.646-.382zm-3.258 0l-.645.382zm.542.916l.646-.382zm-8.532-5.475l.693-.287zm5.409 3.078l-.013.75zm-2.703-.372l-.287.693zm16.532-2.706l.693.287zm-5.409 3.078l-.012-.75zm2.703-.372l.287.693zm.7-15.882l-.392.64zm1.65 1.65l.64-.391zM4.388 2.738l-.392-.64zm-1.651 1.65l-.64-.391zM9.403 19.21l.377-.649zm4.33 2.56l.541-.916l-1.29-.764l-.543.916zm-4.007-.916l.542.916l1.29-.764l-.541-.916zm2.715.152a.52.52 0 0 1-.882 0l-1.291.764c.773 1.307 2.69 1.307 3.464 0zM10.5 2.75h3v-1.5h-3zm10.75 7.75v1h1.5v-1zm-18.5 1v-1h-1.5v1zm-1.5 0c0 1.155 0 2.058.05 2.787c.05.735.153 1.347.388 1.913l1.386-.574c-.147-.352-.233-.782-.278-1.441c-.046-.666-.046-1.51-.046-2.685zm6.553 6.742c-1.256-.022-1.914-.102-2.43-.316L4.8 19.313c.805.334 1.721.408 2.977.43zM1.688 16.2A5.75 5.75 0 0 0 4.8 19.312l.574-1.386a4.25 4.25 0 0 1-2.3-2.3zm19.562-4.7c0 1.175 0 2.019-.046 2.685c-.045.659-.131 1.089-.277 1.441l1.385.574c.235-.566.338-1.178.389-1.913c.05-.729.049-1.632.049-2.787zm-5.027 8.241c1.256-.021 2.172-.095 2.977-.429l-.574-1.386c-.515.214-1.173.294-2.428.316zm4.704-4.115a4.25 4.25 0 0 1-2.3 2.3l.573 1.386a5.75 5.75 0 0 0 3.112-3.112zM13.5 2.75c1.651 0 2.837 0 3.762.089c.914.087 1.495.253 1.959.537l.783-1.279c-.739-.452-1.577-.654-2.6-.752c-1.012-.096-2.282-.095-3.904-.095zm9.25 7.75c0-1.622 0-2.891-.096-3.904c-.097-1.023-.299-1.862-.751-2.6l-1.28.783c.285.464.451 1.045.538 1.96c.088.924.089 2.11.089 3.761zm-3.53-7.124a4.25 4.25 0 0 1 1.404 1.403l1.279-.783a5.75 5.75 0 0 0-1.899-1.899zM10.5 1.25c-1.622 0-2.891 0-3.904.095c-1.023.098-1.862.3-2.6.752l.783 1.28c.464-.285 1.045-.451 1.96-.538c.924-.088 2.11-.089 3.761-.089zM2.75 10.5c0-1.651 0-2.837.089-3.762c.087-.914.253-1.495.537-1.959l-1.279-.783c-.452.738-.654 1.577-.752 2.6C1.25 7.61 1.25 8.878 1.25 10.5zm1.246-8.403a5.75 5.75 0 0 0-1.899 1.899l1.28.783a4.25 4.25 0 0 1 1.402-1.403zm7.02 17.993c-.202-.343-.38-.646-.554-.884a2.2 2.2 0 0 0-.682-.645l-.754 1.297c.047.028.112.078.224.232c.121.166.258.396.476.764zm-3.24-.349c.44.008.718.014.93.037c.198.022.275.054.32.08l.754-1.297a2.2 2.2 0 0 0-.909-.274c-.298-.033-.657-.038-1.069-.045zm6.498 1.113c.218-.367.355-.598.476-.764c.112-.154.177-.204.224-.232l-.754-1.297c-.29.17-.5.395-.682.645c-.173.238-.352.54-.555.884zm1.924-2.612c-.412.007-.771.012-1.069.045c-.311.035-.616.104-.909.274l.754 1.297c.045-.026.122-.058.32-.08c.212-.023.49-.03.93-.037z"/>
                <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" d="M12 15V7m-4 6V9m8 4V9"/>
              </g>
            </svg>
            <span className="text-[13px] font-semibold text-[var(--text-main)] truncate">
              {t('groupCall.active_title', 'Идёт групповой звонок')}
            </span>
          </div>
          <button
            type="button"
            onClick={handleAudioCallPress}
            aria-label={t('groupCall.join', 'Присоединиться')}
            className="px-3 py-1.5 rounded-lg text-white font-semibold text-[12px] transition-opacity hover:opacity-90 cursor-pointer border-0"
            style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
          >
            {t('groupCall.join', 'Присоединиться')}
          </button>
        </div>
      )}

      <ChatPinnedBar
        pinnedMessage={pinnedMessage}
        activeChat={activeChat}
        isChannelOwner={isChannelOwner}
        onScrollToPinned={scrollToPinnedMessage}
        onUnpin={requestUnpinMessage}
        onLinkClick={handleLinkClick}
      />

      <div
        className="flex-1 min-h-0 flex flex-col relative"
        onMouseMove={triggerChatActive}
        onMouseEnter={triggerChatActive}
        onMouseLeave={handleChatMouseLeave}
      >
        <AnimatePresence>
          {showFloatingDate && floatingDate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: floatingDateOffsetY }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 0.1 }, y: { duration: 0 } }}
              className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none date-badge"
              style={{ top: '12px', userSelect: 'none', WebkitUserSelect: 'none' }}
            >
              <div
                className="date-badge-pill select-none"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--surface-container, rgba(255,255,255,0.06)) 92%, #000)',
                  color: 'var(--text-main, #ffffff)',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '3px 12px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              >
                {floatingDate}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          onWheel={handleMessagesWheel}
          className="chat-list-scrollbar flex-1 min-h-0 overflow-y-scroll overflow-x-hidden flex flex-col"
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '6px 0 0 0',
            boxSizing: 'border-box',
            transform: 'translateZ(0)',
            willChange: 'scroll-position',
            overscrollBehaviorY: 'contain',
            overflowAnchor: 'none',
          }}
        >
          <div
            ref={messagesContentRef}
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              minHeight: '100%',
              flex: '1 0 auto',
            }}
          >
            {messages.length === 0 ? (
              activeChat?.type === 'channel' ? (
                <ChannelEmptyCard key={activeChat.id} chat={activeChat} />
              ) : activeChat?.type === 'group' ? (
                <GroupEmptyCard key={activeChat.id} chat={activeChat} />
              ) : (
                <EmptyChatGreeting
                  onSendGreeting={(stk) => {
                    if (stk) {
                      handleSendSticker(stk);
                    } else {
                      triggerMessage('👋');
                    }
                  }}
                  chatId={activeChatId}
                />
              )
            ) : (
              <MessageList
                messages={visibleMessages}
                startIndex={startIndex}
                renderFn={renderMessage}
              />
            )}

            <div style={{ height: '10px', flexShrink: 0 }} />
          </div>
        </div>

        {chatThumb && (
          <>
            <div
              className="overlay-scroll-track"
              onMouseDown={(e) => handleScrollbarTrackMouseDown(e, messagesContainerRef.current)}
              style={{
                top: '6px',
                bottom: '6px',
                opacity: isChatActive ? 1 : 0,
              }}
            />

            <div
              className="overlay-scroll-thumb"
              onMouseDown={(e) => handleScrollbarThumbMouseDown(e, messagesContainerRef.current)}
              style={{
                top: chatThumb.top + 6,
                height: chatThumb.height,
                opacity: isChatActive ? 1 : 0,
              }}
            />
          </>
        )}

        <button
          className={`scroll-btn ${showScrollDown ? 'visible' : ''}`}
          onClick={() => scrollToBottom(false)}
          aria-label={t('chatWindow.scroll_down', 'Прокрутить вниз')}
          style={{
            position: 'absolute',
            right: isMobileView ? '12px' : '20px',
            bottom: '16px',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--surface-container, #33363f)',
            color: 'var(--text-main)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.28)',
            border: 'none',
            outline: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
          }}
        >
          {unreadCount > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '-4px',
                right: unreadCount >= 10 ? '-5px' : '-2px',
                backgroundColor: 'var(--accent-color, #7C3AED)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                minWidth: '18px',
                height: '18px',
                borderRadius: unreadCount >= 10 ? '9999px' : '50%',
                padding: unreadCount >= 10 ? '0 6px' : '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                lineHeight: 1,
                zIndex: 35,
                whiteSpace: 'nowrap',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
          <ChevronDown size={24} strokeWidth={2.4} style={{ color: 'var(--text-main)' }} />
        </button>
      </div>

      {activeChat?.type === 'channel' && !isChannelOwner ? (
        !isSubscribed ? (
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              margin: '0 auto',
            }}
          >
            <button
              onClick={handleSubscribeToChannel}
              disabled={isSubscribing}
              aria-label={t('channel_settings.subscribe', 'Подписаться')}
              style={{
                width: '100%',
                maxWidth: '280px',
                padding: '11px 28px',
                borderRadius: '9999px',
                border: 'none',
                outline: 'none',
                background: 'var(--accent-color, #7C3AED)',
                color: '#ffffff',
                fontSize: '14.5px',
                fontWeight: 600,
                cursor: isSubscribing ? 'default' : 'pointer',
                opacity: isSubscribing ? 0.7 : 1,
                transition: 'background 0.2s ease, opacity 0.2s ease, transform 0.1s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(124, 58, 237, 0.25)',
              }}
              onMouseDown={(e) => {
                if (!isSubscribing) (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
            >
              {t('channel_settings.subscribe', 'Подписаться')}
            </button>
          </div>
        ) : null
      ) : (
        <MessageInput
          key={activeChatId || 'empty'}
          inputText={inputText}
          setInputText={handleSetInputText}
          editingIndex={editingIndex}
          editingOriginalText={editingIndex !== null && messages[editingIndex] ? messages[editingIndex].text : ''}
          onCancelEdit={handleCancelEdit}
          editText={editText}
          setEditText={setEditText}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          isRecording={isRecording}
          isRecordingPaused={isRecordingPaused}
          recordingTime={recordingTime}
          recordingAmplitude={recordingAmplitude}
          onSendMessage={handleSendMessage}
          onEditMessage={handleEditMessage}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecordingAndSend}
          onPauseRecording={pauseAudioRecording}
          onResumeRecording={resumeAudioRecording}
          onCancelRecording={cancelAudioRecording}
          onFilePick={handleFilePick}
          onToggleEmoji={toggleEmoji}
          isEmojiOpen={isEmojiPanelOpen}
          canSend={canSend}
          isRatchetReady={isRatchetReady}
          isPrivateChat={isPrivateChat}
          isChannel={activeChat?.type === 'channel'}
          emojiButtonRef={emojiButtonRef}
          inputRef={inputRef}
          onOpenTxtModal={handleOpenTxtModal}
          onEmojiMouseEnter={handleEmojiMouseEnter}
          onEmojiMouseLeave={handleEmojiMouseLeave}
        />
      )}

        <ChatWindowModals
          isDiscordFileLimitModalOpen={isDiscordFileLimitModalOpen}
          setIsDiscordFileLimitModalOpen={setIsDiscordFileLimitModalOpen}
          maxFileMb={MAX_FILE_MB}
          isSendAsTxtModalOpen={isSendAsTxtModalOpen}
          setIsSendAsTxtModalOpen={setIsSendAsTxtModalOpen}
          handleSendAsTxt={handleSendAsTxt}
          inputTextLength={inputText.length}
          confirmModal={confirmModal}
          setConfirmModal={setConfirmModal}
          activeChatId={activeChatId}
          activeChat={activeChat}
          handleConfirmAction={handleConfirmAction}
          mediaViewerState={mediaViewerState}
          setMediaViewerState={setMediaViewerState}
          chatMediaViewerItems={chatMediaViewerItems}
          sharedSecret={sharedSecret}
          handleMediaGoToMessage={handleMediaGoToMessage}
          handleMediaForwardMessage={handleMediaForwardMessage}
          handleMediaDeleteMessage={handleMediaDeleteMessage}
          attachedFiles={attachedFiles}
          isAttachmentModalOpen={isAttachmentModalOpen}
          setIsAttachmentModalOpen={setIsAttachmentModalOpen}
          setAttachedFiles={setAttachedFiles}
          handleAddMoreFiles={handleAddMoreFiles}
          handleSendFiles={handleSendFiles}
          isSendingFiles={isSendingFiles}
          isDragOver={isDragOver}
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          handleReply={handleReply}
          handleEdit={handleEdit}
          isMessagePinned={isMessagePinned}
          requestUnpinMessage={requestUnpinMessage}
          requestPinMessage={requestPinMessage}
          requestDeleteMessage={requestDeleteMessage}
          handleCopy={handleCopy}
          handleCopyImage={handleCopyImage}
          handleSaveAs={handleSaveAs}
          handleSelectFromMenu={handleSelectFromMenu}
          triggerReactionMessage={triggerReactionMessage}
          isChannelOwner={isChannelOwner}
          messages={messages}
          isEmojiPanelOpen={isEmojiPanelOpen}
          emojiButtonRef={emojiButtonRef}
          headerRef={headerRef}
          handleEmojiSelect={handleEmojiSelect}
          handleSendGif={handleSendGif}
          handleSendSticker={handleSendSticker}
          handleEmojiPanelClose={handleEmojiPanelClose}
          recentEmojis={recentEmojis}
          addRecentEmoji={addRecentEmoji}
          handleEmojiMouseEnter={handleEmojiMouseEnter}
          handleEmojiMouseLeave={handleEmojiMouseLeave}
          setActivePickerTab={setActivePickerTab}
          unsafeLinkData={unsafeLinkData}
          setUnsafeLinkData={setUnsafeLinkData}
          isSupportTicketsModalOpen={isSupportTicketsModalOpen}
          setIsSupportTicketsModalOpen={setIsSupportTicketsModalOpen}
          isAddMemberModalOpen={isAddMemberModalOpen}
          setIsAddMemberModalOpen={setIsAddMemberModalOpen}
        />
    </div>
  );
});
ChatWindow.displayName = 'ChatWindow';