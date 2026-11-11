import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useChatStore, type Chat, type ChatFolder } from '../../store/useChatStore';
import { useAuthStore, getInitialNumericId } from '../../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';
import { getPusher, getGroupPusher } from '../../utils/pusher';
import {
  deriveRootKey,
  getDirectChatId,
  generateChatId,
} from '../../lib/crypto';
import { generateRandomCode } from '../../lib/codes';
import { groupService } from '../../services/groupService';
import { extractCodeFromInput } from '../../utils/inviteLink';
import { ChatPlaceholder } from '../chat/ChatPlaceholder';
import { ChatWindow } from '../chat/ChatWindow';
import { ablyService } from '../../services/ablyService';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { DoubleRatchet } from '../../lib/double-ratchet';
import { useTranslation } from 'react-i18next';
import { channelService, type ChannelInfo } from '../../services/channelService';
import { useCallStore } from '../../store/useCallStore';
import { ResizableSidebar } from './ResizableSidebar';
import { supabaseService, type UserDirectoryRecord } from '../../services/supabaseService';
import { useToastStore } from '../../store/useToastStore';
import { gatewayManager } from '../../services/gatewayManager';
import { sqliteStorage } from '../../services/sqliteStorage';
import { GlobalAudioPlayer } from '../audio/GlobalAudioPlayer';
import { GlobalAudioEngine } from '../audio/GlobalAudioEngine';
import { CallMiniPlayer } from '../call/CallMiniPlayer';
import { ActiveCallBar } from '../call/ActiveCallBar';
import { useShallow } from 'zustand/react/shallow';
import { type ConfirmActionType } from '../common/ActionConfirmModal';
import { useConnectionStore } from '../../store/useConnectionStore';
import { InChatSidebarSearch } from './InChatSidebarSearch';
import { SettingsScreen } from '../chat/SettingsScreen';
import { ProfileScreen } from '../chat/ProfileScreen';
import { MainLayoutModals } from './MainLayoutModals';
import { useAccountStore } from '../../services/accountManager';
import { ChatListItem } from './sidebar/ChatListItems';
import { SidebarFolderRail } from './sidebar/SidebarFolderRail';
import { ChatContextMenuOverlay } from './sidebar/ChatContextMenuOverlay';
import { SidebarContent } from './sidebar/SidebarContent';
import { useGroupSubscriptions } from './hooks/useGroupSubscriptions';
import { usePrivateChatSubscriptions } from './hooks/usePrivateChatSubscriptions';
import { useHandshakeListeners } from './hooks/useHandshakeListeners';
import { useMainLayoutSync } from './hooks/useMainLayoutSync';
import { useConnectRequestHandler } from './hooks/useConnectRequestHandler';
import { supportService, SUPPORT_AVATAR_URL } from '../../services/supportService';

interface ChatContextMenu {
  visible: boolean;
  x: number;
  y: number;
  chatId: string;
}

export const MainLayout = () => {
  const { t } = useTranslation();
  const {
    chats,
    activeChatId,
    setActiveChat,
    currentView,
    setCurrentView,
    addMessage,
    addMessagesBatch,
    updateChat,
    myCode,
    setMyCode,
    addChat,
    setIsHandshaking,
    closeChat: closeChatStore,
    activeProfileChatId,
    setActiveProfileChatId,
    incomingFriendRequests,
    addIncomingFriendRequest,
    removeIncomingFriendRequest,
    inChatSearch,
    closeInChatSearch,
    addChannelChat,
    deletedChatSessions,
    folders,
    activeFolderId,
    setActiveFolderId,
    _hasHydrated,
  } = useChatStore(useShallow(state => ({
    chats: state.chats,
    folders: state.folders,
    activeFolderId: state.activeFolderId,
    setActiveFolderId: state.setActiveFolderId,
    activeChatId: state.activeChatId,
    setActiveChat: state.setActiveChat,
    currentView: state.currentView,
    setCurrentView: state.setCurrentView,
    addMessage: state.addMessage,
    addMessagesBatch: state.addMessagesBatch,
    updateChat: state.updateChat,
    myCode: state.myCode,
    setMyCode: state.setMyCode,
    addChat: state.addChat,
    isHandshaking: state.isHandshaking,
    setIsHandshaking: state.setIsHandshaking,
    closeChat: state.closeChat,
    activeProfileChatId: state.activeProfileChatId,
    setActiveProfileChatId: state.setActiveProfileChatId,
    incomingFriendRequests: state.incomingFriendRequests,
    addIncomingFriendRequest: state.addIncomingFriendRequest,
    removeIncomingFriendRequest: state.removeIncomingFriendRequest,
    inChatSearch: state.inChatSearch,
    closeInChatSearch: state.closeInChatSearch,
    addChannelChat: state.addChannelChat,
    deletedChatSessions: state.deletedChatSessions,
    _hasHydrated: state._hasHydrated,
  })));
  const hasNotesMessages = useChatStore((s) => (s.messagesByChatId['notes']?.length || 0) > 0);
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const { nickname, avatarUrl, bannerUrl, step, username, bio, birthday, isAuthHydrated } = useAuthStore(useShallow(state => ({
    nickname: state.nickname,
    avatarUrl: state.avatarUrl,
    bannerUrl: state.bannerUrl,
    step: state.step,
    username: state.username,
    bio: state.bio,
    birthday: state.birthday,
    isAuthHydrated: state._hasHydrated,
  })));
  const [searchQuery, setSearchQuery] = useState('');
  const [globalFoundUsers, setGlobalFoundUsers] = useState<UserDirectoryRecord[]>([]);
  const [connectModalConfig, setConnectModalConfig] = useState<{
    isOpen: boolean;
    type: 'group' | 'channel' | 'friend';
  }>({ isOpen: false, type: 'friend' });
  const [searchChannelResult, setSearchChannelResult] = useState<ChannelInfo | null>(null);
  const [isMyProfileOpen, setIsMyProfileOpen] = useState(false);
  const [showCallsModal, setShowCallsModal] = useState(false);
  const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [groupInviteUrl, setGroupInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleOpenInvite = (e: any) => {
      const u = e?.detail?.url;
      if (u) setGroupInviteUrl(u);
    };
    window.addEventListener('orbita:open-group-invite', handleOpenInvite);
    return () => {
      window.removeEventListener('orbita:open-group-invite', handleOpenInvite);
    };
  }, []);
  const [isMobileView, setIsMobileView] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 680 : false);
  const [chatContextMenu, setChatContextMenu] = useState<ChatContextMenu>({
    visible: false,
    x: 0,
    y: 0,
    chatId: '',
  });
  const pinnedChatIds = useChatStore((s) => s.pinnedChatIds) || [];
  const togglePinChat = useChatStore((s) => s.togglePinChat);
  const pinnedChatsSet = useMemo(() => new Set(pinnedChatIds), [pinnedChatIds]);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: ConfirmActionType | null;
    chatId: string;
    chatName: string;
    avatarUrl?: string;
    isNotes?: boolean;
  }>({
    isOpen: false,
    type: null,
    chatId: '',
    chatName: '',
  });
  const [pendingSwitchChatId, setPendingSwitchChatId] = useState<string | null>(null);
  const [showVoiceDiscardModal, setShowVoiceDiscardModal] = useState(false);
  const [showUploadDiscardModal, setShowUploadDiscardModal] = useState(false);

  useEffect(() => {
    const handleExitVoice = () => {
      setPendingSwitchChatId('__QUIT__');
      setShowVoiceDiscardModal(true);
    };
    const handleExitUpload = () => {
      setPendingSwitchChatId('__QUIT__');
      setShowUploadDiscardModal(true);
    };
    window.addEventListener('orbita:request-exit-app-voice', handleExitVoice);
    window.addEventListener('orbita:request-exit-app-upload', handleExitUpload);
    return () => {
      window.removeEventListener('orbita:request-exit-app-voice', handleExitVoice);
      window.removeEventListener('orbita:request-exit-app-upload', handleExitUpload);
    };
  }, []);

  const activeSubscriptions = useRef<Map<string, { channel: any; handler: (data: any) => void }>>(new Map());

  const processedChatIds = useRef<Set<string>>(new Set());
  const codeChannelRef = useRef<any>(null);
  const pingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const lastPongTime = useRef<Map<string, number>>(new Map());
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const handshakeGuard = useRef<boolean>(false);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const ablyMessageUnsubscribes = useRef<Map<string, () => void>>(new Map());

  const deliveryUnsubscribes = useRef<Map<string, () => void>>(new Map());
  const decryptQueues = useRef<Map<string, Promise<void>>>(new Map());

  useEffect(() => {
    if (!_hasHydrated) return;
    const notes = chats.find(c => c.id === 'notes');
    if (!notes) {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const sharedSecret = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
      const notesRootKey = deriveRootKey(sharedSecret);
      const notesRatchet = DoubleRatchet.initForNotes(notesRootKey);
      addChat({
        id: 'notes',
        type: 'private',
        name: t('connectModal.notes'),
        lastMsg: 'E2EE_SECURE_CHANNEL_READY',
        online: true,
        sharedSecret,
        isChatInitiator: true,
        ratchetState: notesRatchet.getState(),
        avatarUrl: undefined,
      });
    } else {
      const expectedName = t('connectModal.notes');
      if (notes.name !== expectedName) {
        updateChat('notes', { name: expectedName });
      }
    }
  }, [_hasHydrated, chats, addChat, updateChat, t]);

  useEffect(() => {
    const store = useChatStore.getState();
    if (store.chats.some((c) => c.id === 'system_orbitos')) {
      store.deleteChat('system_orbitos');
    }
    const supportChat = store.chats.find((c) => c.id === supportService.BOT_ID);
    if (supportChat) {
      const activeTicket = supportService.activeTicketNumber;
      const isAdminToken = supportService.isAdmin;
      const msgs = store.messagesByChatId[supportService.BOT_ID] || [];
      const hasOutgoing = msgs.some((m) => m.isOutgoing);
      if (!activeTicket && !isAdminToken && !hasOutgoing) {
        store.deleteChat(supportService.BOT_ID);
      } else {
        const updates: Partial<Chat> = {};
        if (!supportChat.username) updates.username = 'support';
        if (!supportChat.isOfficial) updates.isOfficial = true;
        if (supportChat.avatarUrl !== SUPPORT_AVATAR_URL) updates.avatarUrl = SUPPORT_AVATAR_URL;
        if (Object.keys(updates).length > 0) {
          store.updateChat(supportService.BOT_ID, updates);
        }
      }
    }
    supportService.init(t, myCode);
    supabaseService.ensureSupportProfile().catch(() => {});
  }, [t, myCode]);

  useEffect(() => {
    if (activeChatId === supportService.BOT_ID) {
      supportService.checkAdminStatus();
    }
  }, [activeChatId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        closeChatStore();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeChatStore]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 680);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node))
        setChatContextMenu((prev) => ({ ...prev, visible: false }));
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (_hasHydrated && !myCode && step === 'main') {
      const activeId = useAccountStore.getState().activeAccountId;
      const activeAcc = useAccountStore.getState().accounts.find((a) => a.id === activeId);
      if (activeAcc?.myCode) {
        setMyCode(activeAcc.myCode);
        return;
      }
      sqliteStorage.getJson<any>('orbita-accounts-registry', null).then((reg) => {
        const found = reg?.accounts?.find((a: any) => a.id === activeId || a.id === 'account_1');
        if (found?.myCode) {
          setMyCode(found.myCode);
          return;
        }
        sqliteStorage.getJson<any>(`orbita-chat-storage_${activeId}`, null).then((parsed) => {
          if (parsed?.state?.myCode || parsed?.myCode) {
            setMyCode(parsed.state?.myCode || parsed.myCode);
          } else if (useAccountStore.getState().accounts.length > 0) {
            setMyCode(generateRandomCode());
          }
        }).catch(() => {
          if (useAccountStore.getState().accounts.length > 0) {
            setMyCode(generateRandomCode());
          }
        });
      }).catch(() => {
        if (useAccountStore.getState().accounts.length > 0) {
          setMyCode(generateRandomCode());
        }
      });
    }
  }, [_hasHydrated, myCode, step, setMyCode]);

  useEffect(() => {
    useChatStore.getState().preloadRecentMessagesFromStorage();
  }, [_hasHydrated, step]);

  useEffect(() => {
    if (step === 'main' && nickname && myCode && isAuthHydrated && _hasHydrated) {
      supabaseService.publishPublicProfile(myCode, nickname, avatarUrl || null, null, bio, username, birthday, bannerUrl).catch(() => {});
    }
  }, [step, nickname, myCode, avatarUrl, bio, username, birthday, bannerUrl, isAuthHydrated, _hasHydrated]);

  useEffect(() => {
    const pusher = getPusher();
    (window as any).__orbitaPusher = pusher;

    const updateConn = () => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      const pusherConnected = pusher.connection.state === 'connected';
      const gatewayHealthy = gatewayManager.getActiveGateway().status !== 'unhealthy';
      useConnectionStore.getState().setServerConnected(isOnline && (pusherConnected || gatewayHealthy));
    };

    pusher.connection.bind('connected', updateConn);
    pusher.connection.bind('disconnected', updateConn);
    pusher.connection.bind('unavailable', updateConn);
    pusher.connection.bind('connecting', updateConn);
    pusher.connection.bind('state_change', updateConn);

    updateConn();

    return () => {
      pusher.connection.unbind('connected', updateConn);
      pusher.connection.unbind('disconnected', updateConn);
      pusher.connection.unbind('unavailable', updateConn);
      pusher.connection.unbind('connecting', updateConn);
      pusher.connection.unbind('state_change', updateConn);
    };
  }, []);

  const { subscribeToGroupChat, subscribeToPublicChannel } = useGroupSubscriptions({
    activeSubscriptions,
    lastPongTime,
    ablyMessageUnsubscribes,
    nickname,
    myCode,
    addMessage,
    updateChat,
  });

  const { subscribeToChat, subscribeToDeliveryUpdates } = usePrivateChatSubscriptions({
    activeSubscriptions,
    processedMessageIds,
    ablyMessageUnsubscribes,
    deliveryUnsubscribes,
    decryptQueues,
    pingIntervals,
    lastPongTime,
    codeChannelRef,
    processedChatIds,
    nickname,
    myCode,
    chats,
    deletedChatSessions,
    addMessage,
    updateChat,
    subscribeToGroupChat,
    subscribeToPublicChannel,
  });

  const { handleAcceptFriendRequest, handleRejectFriendRequest } = useHandshakeListeners({
    chats,
    myCode,
    nickname,
    avatarUrl,
    bannerUrl,
    username,
    bio,
    birthday,
    updateChat,
    addChat,
    addMessage,
    addIncomingFriendRequest,
    removeIncomingFriendRequest,
    setActiveChat,
    setShowFriendRequestsModal,
    subscribeToChat,
    processedMessageIds,
    handshakeGuard,
    activeSubscriptions,
    ablyMessageUnsubscribes,
  });

  const { handleConnectRequest } = useConnectRequestHandler({
    nickname,
    myCode,
    avatarUrl,
    bannerUrl,
    addChat,
    updateChat,
    setActiveChat,
    setIsHandshaking,
    handshakeGuard,
    codeChannelRef,
  });

  useMainLayoutSync({
    nickname,
    myCode,
    step,
    addChat,
    updateChat,
    addMessage,
    addMessagesBatch,
    addIncomingFriendRequest,
    setIsNetworkOnline,
    subscribeToChat,
    subscribeToDeliveryUpdates,
    processedMessageIds,
    activeSubscriptions,
    ablyMessageUnsubscribes,
  });


  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) {
        setChatContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    const handleScroll = () => {
      if (chatContextMenu.visible) {
        setChatContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    if (chatContextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [chatContextMenu.visible]);

  const handleDeleteAccount = async () => {
    setShowDeleteModal(false);
    await useAccountStore.getState().deleteCurrentAccount();
  };
  const handleChatContextMenu = useCallback((e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setChatContextMenu({ visible: true, x: e.clientX, y: e.clientY, chatId });
  }, []);

  const requestClearHistory = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const isNotes = chat.id === 'notes';
    const chatName = isNotes ? t('connectModal.notes') : chat.name;
    setChatContextMenu(prev => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: 'clear_history',
      chatId,
      chatName,
      avatarUrl: chat.avatarUrl,
      isNotes,
    });
  };

  const requestDeleteChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const isNotes = chat.id === 'notes';
    const isChannel = chat.type === 'channel';
    const chatName = isNotes ? t('connectModal.notes') : chat.name;
    setChatContextMenu(prev => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: isChannel ? 'leave_channel' : 'delete_chat',
      chatId,
      chatName,
      avatarUrl: chat.avatarUrl,
      isNotes,
    });
  };

  const handleClearHistory = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    if (chat.sharedSecret && chat.id !== 'notes') {
      const clearPayload = {
        type: 'system',
        action: 'clear-history',
        chatId,
        sender: nickname,
        senderCode: myCode,
        senderId: useAuthStore.getState().userId,
      };
      try {
        const pusher = getPusher();
        const channel = pusher.subscribe(`private-chat-${chatId}`);
        const sendSystemMsg = () => {
          try { channel.trigger('client-message', clearPayload); } catch {}
        };
        if (channel.subscribed) sendSystemMsg();
        else channel.bind('pusher:subscription_succeeded', sendSystemMsg);
      } catch {}
      try {
        ablyService.sendMessage(chatId, clearPayload).catch(() => {});
      } catch {}

      const recipients = Array.from(new Set([
        chat.peerCode,
        chat.originalPeerCode,
        chat.name && chat.name.length === 36 ? chat.name : undefined,
        chat.numericId,
        chat.username,
      ].filter((r): r is string => Boolean(r && r !== myCode && r !== useAuthStore.getState().userId))));

      const pusher = getPusher();
      for (const rId of recipients) {
        try {
          const rChan = pusher.subscribe(`private-handshake-${rId}`);
          const sendDirect = () => { try { rChan.trigger('client-message', clearPayload); } catch {} };
          if (rChan.subscribed) sendDirect(); else rChan.bind('pusher:subscription_succeeded', sendDirect);
        } catch {}
        try { ablyService.sendMessage(rId, clearPayload).catch(() => {}); } catch {}
      }

      supabaseService.clearChatHistory(chatId, recipients.length > 0 ? recipients : undefined, myCode).catch(() => {});
    }
    useChatStore.setState((state) => ({
      messagesByChatId: {
        ...state.messagesByChatId,
        [chatId]: [],
      }
    }));
    if (typeof window !== 'undefined' && (window as any).orbita?.storageDeleteMessages) {
      (window as any).orbita.storageDeleteMessages(chatId).catch(() => {});
    }
    updateChat(chatId, {
      lastMsg: t('common.history_cleared'),
      unreadCount: 0,
      lastReadTimestamp: Date.now()
    });
    setChatContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleDeleteChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    if (chat.type === 'channel') {
      channelService.leaveChannel(chatId, nickname);
      if (activeSubscriptions.current.has(chatId)) {
        const sub = activeSubscriptions.current.get(chatId)!;
        sub.channel.unbind_all();
        getPusher().unsubscribe(`public-channel-${chatId}`);
        activeSubscriptions.current.delete(chatId);
      }
      if (ablyMessageUnsubscribes.current.has(chatId)) {
        const unsub = ablyMessageUnsubscribes.current.get(chatId)!;
        unsub();
        ablyMessageUnsubscribes.current.delete(chatId);
      }
    } else if (chat.type === 'group') {
      const myUid = useAuthStore.getState().userId;
      const isOwner = chat.role === 'owner' || chat.isOwner || (chat.creatorCode && (chat.creatorCode === myCode || chat.creatorCode === myUid)) || (chat.creatorId && chat.creatorId === myUid);
      if (isOwner) {
        groupService.deleteGroup(chatId).catch(() => {});
      } else {
        groupService.leaveGroup(chatId, chat.sharedSecret!, nickname, myCode, myUid).catch(() => {});
      }
      if (activeSubscriptions.current.has(chatId)) {
        const sub = activeSubscriptions.current.get(chatId)!;
        sub.channel.unbind_all();
        getGroupPusher().unsubscribe(`presence-group-${chatId}`);
        activeSubscriptions.current.delete(chatId);
      }
      if (ablyMessageUnsubscribes.current.has(chatId)) {
        const unsub = ablyMessageUnsubscribes.current.get(chatId)!;
        unsub();
        ablyMessageUnsubscribes.current.delete(chatId);
      }
    } else {
      if (chat.id !== 'notes') {
        const deletePayload = {
          type: 'system',
          action: 'delete-chat',
          chatId,
          sender: nickname,
          senderCode: myCode,
          senderId: useAuthStore.getState().userId,
        };
        try {
          const pusher = getPusher();
          const channel = pusher.subscribe(`private-chat-${chatId}`);
          const sendSys = () => {
            try { channel.trigger('client-message', deletePayload); } catch {}
          };
          if (channel.subscribed) sendSys();
          else channel.bind('pusher:subscription_succeeded', sendSys);
        } catch {}
        try {
          ablyService.sendMessage(chatId, deletePayload).catch(() => {});
        } catch {}

        const recipients = Array.from(new Set([
          chat.peerCode,
          chat.originalPeerCode,
          chat.name && chat.name.length === 36 ? chat.name : undefined,
          chat.numericId,
          chat.username,
        ].filter((r): r is string => Boolean(r && r !== myCode && r !== useAuthStore.getState().userId))));

        const pusher = getPusher();
        for (const rId of recipients) {
          try {
            const rChan = pusher.subscribe(`private-handshake-${rId}`);
            const sendDirect = () => { try { rChan.trigger('client-message', deletePayload); } catch {} };
            if (rChan.subscribed) sendDirect(); else rChan.bind('pusher:subscription_succeeded', sendDirect);
          } catch {}
          try { ablyService.sendMessage(rId, deletePayload).catch(() => {}); } catch {}
        }

        supabaseService.deleteChatData(chatId, recipients.length > 0 ? recipients : undefined, myCode).catch(() => {});
      }
      if (activeSubscriptions.current.has(chatId)) {
        const sub = activeSubscriptions.current.get(chatId)!;
        sub.channel.unbind_all();
        getPusher().unsubscribe(`private-chat-${chatId}`);
        activeSubscriptions.current.delete(chatId);
      }
      if (ablyMessageUnsubscribes.current.has(chatId)) {
        const unsub = ablyMessageUnsubscribes.current.get(chatId)!;
        unsub();
        ablyMessageUnsubscribes.current.delete(chatId);
      }
    }
    useChatStore.getState().deleteChat(chatId);
    if (useChatStore.getState().activeChatId === chatId) {
      useChatStore.getState().setActiveChat(null);
    }
    setChatContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handlePinChat = (chatId: string) => {
    if (chatId === 'notes') return;
    togglePinChat(chatId);
    setChatContextMenu(prev => ({ ...prev, visible: false }));
  };

  const toggleArchiveChat = useChatStore((s) => s.toggleArchiveChat);
  const [isViewingArchive, setIsViewingArchive] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).orbita?.onOpenChat) {
      const unsub = (window as any).orbita.onOpenChat((openChatId: string) => {
        if (!openChatId) return;
        const currentChats = useChatStore.getState().chats;
        const targetChat = currentChats.find(c => c.id === openChatId);
        setCurrentView('chats');
        setActiveProfileChatId(null);
        setSearchQuery('');
        if (targetChat?.isArchived) {
          setIsViewingArchive(true);
        } else {
          setIsViewingArchive(false);
        }
        setActiveChat(openChatId);
        if (typeof window !== 'undefined' && (window as any).orbita?.clearNotifications) {
          (window as any).orbita.clearNotifications();
        }
      });
      return unsub;
    }
  }, [setActiveChat, setCurrentView, setActiveProfileChatId, setIsViewingArchive, setSearchQuery]);

  const handleToggleArchiveChat = (chatId: string) => {
    if (chatId === 'notes') return;
    toggleArchiveChat(chatId);
    setChatContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleMuteChat = (chatId: string) => {
    if (chatId === 'notes') return;
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      updateChat(chatId, { muted: !chat.muted });
    }
    setChatContextMenu(prev => ({ ...prev, visible: false }));
  };

  const filteredChats = useMemo(() => {
    return chats.filter(chat => {
      if (chat.id === 'notes') {
        return hasNotesMessages;
      }
      if (chat.isDraft && !chat.peerCode) {
        return false;
      }
      return true;
    });
  }, [chats, hasNotesMessages]);

  const archivedChats = useMemo(() => {
    return filteredChats.filter(chat => chat.id !== 'notes' && !!chat.isArchived);
  }, [filteredChats]);

  const activeFilteredChats = useMemo(() => {
    if (isViewingArchive) {
      return archivedChats;
    }
    const nonArchived = filteredChats.filter(chat => !chat.isArchived);
    if (!activeFolderId) return nonArchived;
    const folder = (folders || []).find(f => f.id === activeFolderId);
    if (!folder) return nonArchived;
    const setIds = new Set(folder.chatIds || []);
    return nonArchived.filter(chat => setIds.has(chat.id));
  }, [filteredChats, archivedChats, isViewingArchive, activeFolderId, folders]);

  const getFolderUnreadCount = useCallback((folder: ChatFolder) => {
    const idSet = new Set(folder.chatIds || []);
    let count = 0;
    for (const chat of chats) {
      if (idSet.has(chat.id) && (chat.unreadCount || 0) > 0) {
        count += chat.unreadCount!;
      }
    }
    return count;
  }, [chats]);

  useEffect(() => {
    if (isViewingArchive && archivedChats.length === 0) {
      setIsViewingArchive(false);
    }
  }, [isViewingArchive, archivedChats.length]);

  const sortedChats = useMemo(() => {
    return [...activeFilteredChats].sort((a, b) => {
      if (a.id === 'notes') return -1;
      if (b.id === 'notes') return 1;
      if (pinnedChatsSet.has(a.id) && !pinnedChatsSet.has(b.id)) return -1;
      if (!pinnedChatsSet.has(a.id) && pinnedChatsSet.has(b.id)) return 1;

      const aLastTime = a.updatedAt || a.createdAt || 0;
      const bLastTime = b.updatedAt || b.createdAt || 0;

      return bLastTime - aLastTime;
    });
  }, [activeFilteredChats, pinnedChatsSet]);

  const searchedChats = useMemo(() => {
    if (!searchQuery.trim()) return sortedChats;
    const q = searchQuery.toLowerCase().trim();
    const cleanUserQ = q.replace(/^@+/, '');
    return sortedChats.filter(chat => {
      return (
        chat.name.toLowerCase().includes(q) ||
        (chat.peerCode && chat.peerCode.toLowerCase().includes(q)) ||
        (chat.username && chat.username.toLowerCase().includes(cleanUserQ))
      );
    });
  }, [sortedChats, searchQuery]);

  useEffect(() => {
    const cleanQ = searchQuery.replace(/^@+/, '').trim().toLowerCase();
    if (cleanQ.length < 2) {
      setGlobalFoundUsers([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      supabaseService.searchPublicProfiles(cleanQ, 10).then((users) => {
        if (!cancelled) {
          setGlobalFoundUsers(users || []);
        }
      }).catch(() => {
        if (!cancelled) {
          setGlobalFoundUsers([]);
        }
      });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const currentTheme = useChatStore((s) => s.currentTheme);
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    return typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme-light') === 'true'
      : false;
  });

  useEffect(() => {
    const updateThemeMode = () => {
      setIsLightTheme(document.documentElement.getAttribute('data-theme-light') === 'true');
    };
    updateThemeMode();
    const observer = new MutationObserver(updateThemeMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme-light', 'data-theme'],
    });
    return () => observer.disconnect();
  }, [currentTheme]);

  const handleOpenSettings = () => {
    useChatStore.getState().openSettings('main');
  };

  const CHAT_BATCH_SIZE = 25;
  const [renderedChatCount, setRenderedChatCount] = useState<number>(CHAT_BATCH_SIZE);

  useEffect(() => {
    setRenderedChatCount(CHAT_BATCH_SIZE);
  }, [searchQuery]);

  useEffect(() => {
    const trimmed = extractCodeFromInput(searchQuery).trim();
    if (trimmed.length < 3) {
      setSearchChannelResult(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      channelService.getChannel(trimmed).then((channel) => {
        if (!cancelled) {
          setSearchChannelResult(channel);
        }
      }).catch(() => {
        if (!cancelled) {
          setSearchChannelResult(null);
        }
      });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleSelectFoundChannel = useCallback(async (channel: ChannelInfo) => {
    const exists = chats.some(c => c.id === channel.id);
    if (!exists) {
      addChannelChat({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        avatarUrl: channel.avatarUrl,
        creatorNickname: channel.creatorNickname,
        subscribersCount: channel.subscribersCount,
        isOfficial: channel.isOfficial,
        isOwner: false,
        isSubscribed: false,
      });
    }
    setActiveChat(channel.id);
    setSearchQuery('');
    setSearchChannelResult(null);
  }, [chats, addChannelChat, setActiveChat]);

  const visibleChats = useMemo(() => {
    return searchedChats.slice(0, renderedChatCount);
  }, [searchedChats, renderedChatCount]);

  const chatListScrollRef = useRef<HTMLDivElement>(null);
  const chatThumbRef = useRef<HTMLDivElement>(null);
  const chatTrackRef = useRef<HTMLDivElement>(null);
  const chatListScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateChatThumbDom = useCallback(() => {
    const el = chatListScrollRef.current;
    const thumb = chatThumbRef.current;
    const track = chatTrackRef.current;
    if (!el || !thumb || !track) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 4 || clientHeight === 0) {
      thumb.style.display = 'none';
      track.style.display = 'none';
      return;
    }
    thumb.style.display = 'block';
    track.style.display = 'block';

    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    const top = maxTop * ratio;

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${top}px)`;
  }, []);

  const showChatScrollbar = useCallback(() => {
    updateChatThumbDom();
    if (chatThumbRef.current) chatThumbRef.current.style.opacity = '1';
    if (chatTrackRef.current) chatTrackRef.current.style.opacity = '1';
    if (chatListScrollTimerRef.current) clearTimeout(chatListScrollTimerRef.current);
    chatListScrollTimerRef.current = setTimeout(() => {
      if (chatThumbRef.current) chatThumbRef.current.style.opacity = '0';
      if (chatTrackRef.current) chatTrackRef.current.style.opacity = '0';
    }, 900);
  }, [updateChatThumbDom]);

  const handleChatListMouseLeave = useCallback(() => {
    if (chatListScrollTimerRef.current) clearTimeout(chatListScrollTimerRef.current);
    if (chatThumbRef.current) chatThumbRef.current.style.opacity = '0';
    if (chatTrackRef.current) chatTrackRef.current.style.opacity = '0';
  }, []);

  useEffect(() => {
    updateChatThumbDom();
  }, [visibleChats.length, updateChatThumbDom]);

  useEffect(() => {
    const el = chatListScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateChatThumbDom());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateChatThumbDom]);

  const handleChatListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    showChatScrollbar();

    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 350) {
      setRenderedChatCount((prev) => {
        if (prev < searchedChats.length) {
          return Math.min(searchedChats.length, prev + CHAT_BATCH_SIZE);
        }
        return prev;
      });
    }
  }, [searchedChats.length, showChatScrollbar]);

  const CHAT_MIN_WIDTH = 300;
  const SIDEBAR_MIN_WIDTH = 300;

  const isCallMinimized = useCallStore((state) => state.isMinimized && !!state.activeCall);
  const showCallModalsInWindow = !((window as any).orbita?.openCallWindow);

  const maxSidebarWidth = useMemo(() => {
    return undefined;
  }, []);

  const handleBannerReconnect = useCallback(() => {
    setIsNetworkOnline(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('orbita:sync-now'));
    }
  }, []);

  const handleSelectChat = useCallback((chatId: string) => {
    if (chatId === useChatStore.getState().activeChatId) return;
    if (useChatStore.getState().isRecordingVoice) {
      setPendingSwitchChatId(chatId);
      setShowVoiceDiscardModal(true);
      return;
    }
    if (useChatStore.getState().isUploadingMedia) {
      setPendingSwitchChatId(chatId);
      setShowUploadDiscardModal(true);
      return;
    }
    setActiveChat(chatId);
  }, [setActiveChat]);

  const handleChatWindowBack = useCallback(() => {
    if (useChatStore.getState().isRecordingVoice) {
      setPendingSwitchChatId('__CLOSE__');
      setShowVoiceDiscardModal(true);
      return;
    }
    if (useChatStore.getState().isUploadingMedia) {
      setPendingSwitchChatId('__CLOSE__');
      setShowUploadDiscardModal(true);
      return;
    }
    setActiveChat(null);
  }, [setActiveChat]);

  const handleSelectFoundSupport = useCallback(() => {
    supportService.initSupportChat(t, myCode);
    handleSelectChat(supportService.BOT_ID);
    setSearchQuery('');
  }, [t, myCode, handleSelectChat]);

  const handleSelectFoundUser = useCallback((user: UserDirectoryRecord) => {
    if (user.user_code === supportService.BOT_ID || user.username?.toLowerCase() === 'support') {
      handleSelectFoundSupport();
      return;
    }
    const myUid = useAuthStore.getState().userId;
    const myC = useChatStore.getState().myCode;
    if (user.user_code === myC || user.user_code === myUid) {
      handleSelectChat('notes');
      setSearchQuery('');
      return;
    }
    const directChatId = (myC && user.user_code) ? getDirectChatId(myC, user.user_code) : null;
    const currentChats = useChatStore.getState().chats;
    const cleanNickname = user.nickname ? user.nickname.trim().toLowerCase() : null;
    const existingChat = currentChats.find(
      (c) =>
        c.type === 'private' &&
        ((directChatId && c.id === directChatId) ||
          c.id === user.user_code ||
          c.peerCode === user.user_code ||
          c.originalPeerCode === user.user_code ||
          (user.numeric_id && c.numericId === user.numeric_id) ||
          (user.username && c.username && c.username.toLowerCase() === user.username.toLowerCase()) ||
          (cleanNickname && c.name && c.name !== 'Unknown' && c.name.trim().toLowerCase() === cleanNickname))
    );
    if (existingChat) {
      handleSelectChat(existingChat.id);
      setSearchQuery('');
      return;
    }

    const brokenChat = currentChats.find((c) => c.id === user.user_code);
    if (brokenChat) {
      useChatStore.getState().deleteChat(user.user_code);
    }

    const chatId = directChatId || generateChatId();
    const draftChat: Partial<Chat> = {
      id: chatId,
      type: 'private',
      name: user.nickname || 'User',
      avatarUrl: user.avatar_url || undefined,
      bannerUrl: user.banner_url || undefined,
      username: user.username || undefined,
      numericId: user.numeric_id || getInitialNumericId(user.user_code),
      description: user.bio || undefined,
      birthday: user.birthday || undefined,
      peerCode: user.user_code,
      originalPeerCode: user.user_code,
      lastMsg: '',
      online: false,
      unreadCount: 0,
      createdAt: Date.now(),
      notificationsEnabled: true,
      isDraft: true,
      isChatInitiator: true,
      peerPublicKey: user.public_key || null,
    };
    useChatStore.getState().addChat(draftChat as any);
    handleSelectChat(chatId);
    setSearchQuery('');
  }, [handleSelectChat]);


  const renderChat = useCallback((chat: Chat) => {
    const isPinned = pinnedChatsSet.has(chat.id);
    return (
      <ChatListItem
        key={chat.id}
        chat={chat}
        isPinned={isPinned}
        onSelect={handleSelectChat}
        onContextMenu={handleChatContextMenu}
        nickname={nickname || ''}
        myCode={myCode}
        t={t}
        isLightTheme={isLightTheme}
      />
    );
  }, [pinnedChatsSet, handleSelectChat, handleChatContextMenu, nickname, myCode, t, isLightTheme]);

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {!isMobileView && (
        <SidebarFolderRail
          activeFolderId={activeFolderId}
          setActiveFolderId={setActiveFolderId}
          currentView={currentView}
          setCurrentView={setCurrentView}
          folders={folders}
          getFolderUnreadCount={getFolderUnreadCount}
          isLightTheme={isLightTheme}
        />
      )}

      {(!isMobileView || !activeChatId) && (
        <ResizableSidebar
          defaultWidth={260}
          minWidth={SIDEBAR_MIN_WIDTH}
          maxWidth={maxSidebarWidth}
          className="md:flex-none"
        >
          <SidebarContent
            isMobileView={isMobileView}
            isViewingArchive={isViewingArchive}
            setIsViewingArchive={setIsViewingArchive}
            archivedChats={archivedChats}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            setShowFriendRequestsModal={setShowFriendRequestsModal}
            incomingFriendRequests={incomingFriendRequests}
            isNetworkOnline={isNetworkOnline}
            handleBannerReconnect={handleBannerReconnect}
            chatListScrollRef={chatListScrollRef}
            handleChatListScroll={handleChatListScroll}
            showChatScrollbar={showChatScrollbar}
            handleChatListMouseLeave={handleChatListMouseLeave}
            chatTrackRef={chatTrackRef}
            chatThumbRef={chatThumbRef}
            handleScrollbarTrackMouseDown={handleScrollbarTrackMouseDown}
            handleScrollbarThumbMouseDown={handleScrollbarThumbMouseDown}
            visibleChats={visibleChats}
            renderChat={renderChat}
            searchChannelResult={searchChannelResult}
            handleSelectFoundChannel={handleSelectFoundChannel}
            globalFoundUsers={globalFoundUsers}
            handleSelectFoundUser={handleSelectFoundUser}
            handleSelectFoundSupport={handleSelectFoundSupport}
            isLightTheme={isLightTheme}
            onOpenCreateGroup={() => setConnectModalConfig({ isOpen: true, type: 'group' })}
            onOpenCreateChannel={() => setConnectModalConfig({ isOpen: true, type: 'channel' })}
            onOpenAddFriend={() => setConnectModalConfig({ isOpen: true, type: 'friend' })}
            onOpenFriends={() => {
              setActiveFolderId(null);
              setActiveChat(null);
              setCurrentView('chats');
            }}
            onOpenSavedMessages={() => setActiveChat('notes')}
            onOpenCalls={() => setShowCallsModal(true)}
            onOpenSettings={handleOpenSettings}
            onOpenProfile={() => setIsMyProfileOpen(true)}
          />
        </ResizableSidebar>
      )}

      <div className="flex flex-1 min-w-0 relative flex-col">
        {!(isMobileView && !activeChatId) && (isCallMinimized ? <CallMiniPlayer /> : <GlobalAudioPlayer />)}

        {(!isMobileView || activeChatId) && (
          <main
            className="flex-1 flex flex-col rounded-tl-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-primary)',
              minWidth: isMobileView ? 0 : CHAT_MIN_WIDTH,
            }}
          >
            <div className="flex flex-col h-full relative">
              <div className="relative flex flex-col flex-1 min-h-0">
                {activeChatId && chats.some(c => c.id === activeChatId) ? (
                  <ChatWindow
                    isMobileView={isMobileView}
                    onBack={handleChatWindowBack}
                  />
                ) : (
                  <>
                    <ActiveCallBar />
                    <ChatPlaceholder
                      onConnectRequest={handleConnectRequest}
                      onAcceptFriendRequest={handleAcceptFriendRequest}
                      onRejectFriendRequest={handleRejectFriendRequest}
                    />
                  </>
                )}
              </div>
            </div>
          </main>
        )}
      </div>

        <AnimatePresence>
          {currentView === 'settings' && (
            <SettingsScreen />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeProfileChatId && (
            <ProfileScreen
              chatId={activeProfileChatId}
              onClose={() => setActiveProfileChatId(null)}
              isMobileView={isMobileView}
              onLinkClick={(url) => {
                const cleanUrl = url.trim();
                if (cleanUrl.startsWith('@')) {
                  const targetUsername = cleanUrl.replace(/^@+/, '').trim().toLowerCase();
                  if (!targetUsername) return;
                  const myUid = useAuthStore.getState().userId;
                  const myC = useChatStore.getState().myCode;
                  const myU = useAuthStore.getState().username?.toLowerCase();
                  if (targetUsername === myU || targetUsername === myC?.toLowerCase() || targetUsername === myUid?.toLowerCase()) {
                    handleSelectChat('notes');
                    setActiveProfileChatId('notes');
                    return;
                  }
                  const currentChats = useChatStore.getState().chats;
                  const existingChat = currentChats.find(
                    (c) =>
                      c.type === 'private' &&
                      ((c.username && c.username.toLowerCase() === targetUsername) ||
                        c.peerCode?.toLowerCase() === targetUsername ||
                        c.originalPeerCode?.toLowerCase() === targetUsername)
                  );
                  if (existingChat) {
                    handleSelectChat(existingChat.id);
                    setActiveProfileChatId(existingChat.id);
                    return;
                  }
                  supabaseService.lookupProfileByUsername(targetUsername).then((user) => {
                    if (!user) {
                      useToastStore.getState().showToast(t('chatWindow.userNotFound'), 'text');
                      return;
                    }
                    handleSelectFoundUser(user);
                  }).catch(() => {
                    useToastStore.getState().showToast(t('chatWindow.userNotFound'), 'text');
                  });
                  return;
                }
                if ((window as any).orbita?.openExternal) {
                  (window as any).orbita.openExternal(cleanUrl);
                }
              }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isMobileView && inChatSearch?.isOpen && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-x-0 bottom-0 top-[var(--titlebar-height,0px)] z-[100] flex flex-col"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <InChatSidebarSearch
                onClose={closeInChatSearch}
                activeChatId={activeChatId}
                isMobileView={true}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <MainLayoutModals
          groupInviteUrl={groupInviteUrl}
          setGroupInviteUrl={setGroupInviteUrl}
          connectModalConfig={connectModalConfig}
          setConnectModalConfig={setConnectModalConfig}
          handleConnectRequest={handleConnectRequest}
          isMyProfileOpen={isMyProfileOpen}
          setIsMyProfileOpen={setIsMyProfileOpen}
          showCallsModal={showCallsModal}
          setShowCallsModal={setShowCallsModal}
          setActiveChat={setActiveChat}
          isMobileView={isMobileView}
          showFriendRequestsModal={showFriendRequestsModal}
          setShowFriendRequestsModal={setShowFriendRequestsModal}
          handleAcceptFriendRequest={handleAcceptFriendRequest}
          handleRejectFriendRequest={handleRejectFriendRequest}
          showDeleteModal={showDeleteModal}
          setShowDeleteModal={setShowDeleteModal}
          handleDeleteAccount={handleDeleteAccount}
          confirmModal={confirmModal}
          setConfirmModal={setConfirmModal}
          handleClearHistory={handleClearHistory}
          handleDeleteChat={handleDeleteChat}
          showVoiceDiscardModal={showVoiceDiscardModal}
          setShowVoiceDiscardModal={setShowVoiceDiscardModal}
          showUploadDiscardModal={showUploadDiscardModal}
          setShowUploadDiscardModal={setShowUploadDiscardModal}
          pendingSwitchChatId={pendingSwitchChatId}
          setPendingSwitchChatId={setPendingSwitchChatId}
          showCallModalsInWindow={showCallModalsInWindow}
        />

      <GlobalAudioEngine />

      <ChatContextMenuOverlay
        chatContextMenu={chatContextMenu}
        chatMenuRef={chatMenuRef}
        chats={chats}
        pinnedChatsSet={pinnedChatsSet}
        handlePinChat={handlePinChat}
        handleToggleArchiveChat={handleToggleArchiveChat}
        handleMuteChat={handleMuteChat}
        requestClearHistory={requestClearHistory}
        requestDeleteChat={requestDeleteChat}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-color, rgba(255,255,255,0.05)); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--accent-color, #7C3AED) 20%, transparent); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};