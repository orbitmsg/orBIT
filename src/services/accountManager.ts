import { create } from 'zustand';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { ablyService } from './ablyService';
import { generateRandomCode } from '../lib/codes';
import { generateMasterSeedHex, deriveAccountKeys } from '../lib/zkAccountCrypto';
import { sqliteStorage } from './sqliteStorage';

export interface AccountMeta {
  id: 'account_1' | 'account_2';
  nickname: string;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  myCode: string | null;
  userId: string;
  isRegistered: boolean;
  username?: string | null;
  bio?: string | null;
  birthday?: string | null;
}

interface AccountRegistryData {
  activeAccountId: 'account_1' | 'account_2';
  accounts: AccountMeta[];
}

const REGISTRY_STORAGE_KEY = 'orbita-accounts-registry';
const AUTH_STORAGE_PREFIX = 'orbita-auth-storage_';
const CHAT_STORAGE_PREFIX = 'orbita-chat-storage_';

const storageGet = async (key: string): Promise<string | null> => {
  return await sqliteStorage.get(key);
};

const storageSet = async (key: string, value: string): Promise<void> => {
  await sqliteStorage.set(key, value);
};

const storageRemove = async (key: string): Promise<void> => {
  await sqliteStorage.remove(key);
};

const syncActiveAccountScope = (accountId: 'account_1' | 'account_2') => {
  if (typeof window === 'undefined') return;
  try {
    (window as any).orbita?.setActiveAccountScope?.(accountId);
  } catch {}
};

if (typeof window !== 'undefined') {
  syncActiveAccountScope('account_1');
}

interface AccountStoreState {
  activeAccountId: 'account_1' | 'account_2';
  accounts: AccountMeta[];
  isSwitching: boolean;
  isAddingSecondAccount: boolean;
  init: () => Promise<void>;
  switchAccount: (targetId: 'account_1' | 'account_2') => Promise<void>;
  prepareAddSecondAccount: () => Promise<void>;
  cancelAddSecondAccount: () => Promise<void>;
  prepareSecondAccountForRestore: () => Promise<void>;
  finalizeSecondAccountRestore: () => Promise<void>;
  completeSecondAccountRegistration: (data?: { nickname: string; avatarUrl?: string | null; myCode?: string | null }) => Promise<void>;
  deleteCurrentAccount: () => Promise<void>;
  syncCurrentAccountMeta: () => Promise<void>;
}

let isInitialized = false;
let initPromise: Promise<void> | null = null;
let isRestoringSecondAccount = false;

const unwrapPersistedState = (rawJson: string): any | null => {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed.state && typeof parsed.state === 'object' ? parsed.state : parsed;
  } catch {
    return null;
  }
};

const wrapPersistedState = (rawJson: string, version: number): string => {
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === 'object' && parsed.state && typeof parsed.state === 'object') {
      return JSON.stringify({
        state: parsed.state,
        version: typeof parsed.version === 'number' ? parsed.version : version,
      });
    }
    return JSON.stringify({ state: parsed, version });
  } catch {
    return rawJson;
  }
};

const waitForStoreHydration = async (storePersist: {
  hasHydrated: () => boolean;
  onFinishHydration: (cb: () => void) => () => void;
  rehydrate: () => Promise<void> | void;
} | undefined): Promise<void> => {
  if (!storePersist || storePersist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    let triggerTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (triggerTimer) clearTimeout(triggerTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      unsub();
      resolve();
    };
    const unsub = storePersist.onFinishHydration(finish);
    if (storePersist.hasHydrated()) {
      finish();
      return;
    }
    triggerTimer = setTimeout(() => {
      if (!settled && !storePersist.hasHydrated()) {
        Promise.resolve(storePersist.rehydrate()).then(() => {
          if (storePersist.hasHydrated()) {
            finish();
          }
        }).catch(() => {});
      }
    }, 50);
    timeoutTimer = setTimeout(finish, 3000);
  });
};

export const useAccountStore = create<AccountStoreState>((set, get) => ({
  activeAccountId: 'account_1',
  accounts: [],
  isSwitching: false,
  isAddingSecondAccount: false,

  init: async () => {
    if (isInitialized) return;
    if (initPromise) {
      await initPromise;
      return;
    }
    initPromise = (async () => {
      syncActiveAccountScope('account_1');
      await Promise.all([
        waitForStoreHydration(useAuthStore.persist),
        waitForStoreHydration(useChatStore.persist),
      ]);

      let registry: AccountRegistryData = {
        activeAccountId: 'account_1',
        accounts: [],
      };

      try {
        const raw = await storageGet(REGISTRY_STORAGE_KEY);
        if (raw) {
          registry = JSON.parse(raw);
        }
      } catch {}

      let account1 = registry.accounts.find((a) => a.id === 'account_1');
      const account2 = registry.accounts.find((a) => a.id === 'account_2');
      const currentActiveId = (registry.activeAccountId === 'account_2' && account2) ? 'account_2' : 'account_1';

      const account1AuthRaw = await storageGet(`${AUTH_STORAGE_PREFIX}account_1`);
      const account1ChatRaw = await storageGet(`${CHAT_STORAGE_PREFIX}account_1`);
      const parsedAuth1 = account1AuthRaw ? unwrapPersistedState(account1AuthRaw) : null;
      const parsedChat1 = account1ChatRaw ? unwrapPersistedState(account1ChatRaw) : null;

      if (currentActiveId === 'account_1') {
        const auth = useAuthStore.getState();
        if (parsedAuth1) {
          const needsFullRestore =
            (!auth.userId || !auth.nickname || auth.step === 'welcome') &&
            Boolean(parsedAuth1.nickname || parsedAuth1.step === 'main' || parsedAuth1.userId);
          if (needsFullRestore) {
            auth.importAuthState(parsedAuth1);
          } else if (!auth.userId || !parsedAuth1.userId || auth.userId === parsedAuth1.userId) {
            const mergedAuth: Record<string, any> = {};
            if (!auth.numericId && parsedAuth1.numericId) mergedAuth.numericId = parsedAuth1.numericId;
            if (!auth.avatarUrl && parsedAuth1.avatarUrl) mergedAuth.avatarUrl = parsedAuth1.avatarUrl;
            if (!auth.bannerUrl && parsedAuth1.bannerUrl) mergedAuth.bannerUrl = parsedAuth1.bannerUrl;
            if (!auth.username && parsedAuth1.username) mergedAuth.username = parsedAuth1.username;
            if (!auth.bio && parsedAuth1.bio) mergedAuth.bio = parsedAuth1.bio;
            if (!auth.birthday && parsedAuth1.birthday) mergedAuth.birthday = parsedAuth1.birthday;
            if (!auth.masterSeed && parsedAuth1.masterSeed) mergedAuth.masterSeed = parsedAuth1.masterSeed;
            if (!auth.recoveryKey && parsedAuth1.recoveryKey) mergedAuth.recoveryKey = parsedAuth1.recoveryKey;
            if (!auth.identityKeyPair && parsedAuth1.identityKeyPair) mergedAuth.identityKeyPair = parsedAuth1.identityKeyPair;
            if (!auth.signedPreKeyPair && parsedAuth1.signedPreKeyPair) mergedAuth.signedPreKeyPair = parsedAuth1.signedPreKeyPair;
            if (!auth.identitySigningKeyPair && parsedAuth1.identitySigningKeyPair) {
              mergedAuth.identitySigningKeyPair = parsedAuth1.identitySigningKeyPair;
            }
            if (
              (!auth.oneTimePreKeys || auth.oneTimePreKeys.length === 0) &&
              Array.isArray(parsedAuth1.oneTimePreKeys) &&
              parsedAuth1.oneTimePreKeys.length > 0
            ) {
              mergedAuth.oneTimePreKeys = parsedAuth1.oneTimePreKeys;
            }
            if (Object.keys(mergedAuth).length > 0) {
              useAuthStore.setState(mergedAuth);
            }
          }
        }

        if (parsedChat1) {
          const chat = useChatStore.getState();
          if (parsedChat1.myCode && !chat.myCode) chat.setMyCode(parsedChat1.myCode);
          const liveChats = useChatStore.getState().chats || [];
          const liveRealCount = liveChats.filter((c: any) => c && c.id && c.id !== 'notes' && c.id !== 'system_support').length;
          const parsedRealChats = (parsedChat1.chats || []).filter((c: any) => c && c.id && c.id !== 'notes' && c.id !== 'system_support');
          if (liveRealCount === 0 && parsedRealChats.length > 0) {
            chat.importChatState(parsedChat1);
          }
        }

        if (account1?.myCode && !useChatStore.getState().myCode) {
          useChatStore.getState().setMyCode(account1.myCode);
        }
        if (account1?.userId && !useAuthStore.getState().userId) {
          useAuthStore.getState().setUserId(account1.userId);
        }
        if (account1?.nickname && !useAuthStore.getState().nickname) {
          useAuthStore.getState().setNickname(account1.nickname);
        }
      }

      const currentAuth = useAuthStore.getState();
      const currentChat = useChatStore.getState();

      if (currentActiveId === 'account_1') {
        if (!account1) {
          account1 = {
            id: 'account_1',
            nickname: currentAuth.nickname || '',
            avatarUrl: currentAuth.avatarUrl || null,
            bannerUrl: currentAuth.bannerUrl || null,
            myCode: currentChat.myCode || null,
            userId: currentAuth.userId || '',
            isRegistered: Boolean(currentAuth.nickname && currentAuth.step === 'main'),
            username: currentAuth.username || null,
            bio: currentAuth.bio || null,
            birthday: currentAuth.birthday || null,
          };
          registry.accounts = [account1, ...(account2 ? [account2] : [])];
        } else {
          if (currentAuth.nickname) account1.nickname = currentAuth.nickname;
          if (currentAuth.avatarUrl !== undefined) account1.avatarUrl = currentAuth.avatarUrl;
          if (currentAuth.bannerUrl !== undefined) account1.bannerUrl = currentAuth.bannerUrl;
          if (currentChat.myCode) account1.myCode = currentChat.myCode;
          if (currentAuth.userId) account1.userId = currentAuth.userId;
          if (currentAuth.username !== undefined) account1.username = currentAuth.username;
          if (currentAuth.bio !== undefined) account1.bio = currentAuth.bio;
          if (currentAuth.birthday !== undefined) account1.birthday = currentAuth.birthday;
          if (currentAuth.nickname && currentAuth.step === 'main') account1.isRegistered = true;
        }
      } else if (!account1) {
        account1 = {
          id: 'account_1',
          nickname: parsedAuth1?.nickname || '',
          avatarUrl: parsedAuth1?.avatarUrl || null,
          bannerUrl: parsedAuth1?.bannerUrl || null,
          myCode: parsedChat1?.myCode || null,
          userId: parsedAuth1?.userId || '',
          isRegistered: Boolean(parsedAuth1?.nickname && parsedAuth1?.step === 'main'),
          username: parsedAuth1?.username || null,
          bio: parsedAuth1?.bio || null,
          birthday: parsedAuth1?.birthday || null,
        };
        registry.accounts = [account1, ...(account2 ? [account2] : [])];
      }

      registry.activeAccountId = currentActiveId;
      await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));

      if (currentActiveId === 'account_1') {
        if (currentAuth.nickname || currentAuth.userId) {
          await storageSet(`${AUTH_STORAGE_PREFIX}account_1`, JSON.stringify(currentAuth.exportAuthState()));
        }
        const freshChat = useChatStore.getState();
        const currentRealCount = (freshChat.chats || []).filter((c: any) => c && c.id && c.id !== 'notes' && c.id !== 'system_support').length;
        if (currentRealCount > 0 || freshChat.myCode) {
          await storageSet(`${CHAT_STORAGE_PREFIX}account_1`, JSON.stringify(freshChat.exportChatState()));
        }
      } else {
        const account2AuthRaw = await storageGet(`${AUTH_STORAGE_PREFIX}account_2`);
        const account2ChatRaw = await storageGet(`${CHAT_STORAGE_PREFIX}account_2`);

        const parsedAuth2 = account2AuthRaw ? unwrapPersistedState(account2AuthRaw) : null;
        const parsedChat2 = account2ChatRaw ? unwrapPersistedState(account2ChatRaw) : null;

        if (parsedAuth2) {
          useAuthStore.getState().importAuthState(parsedAuth2);
        }
        if (parsedChat2) {
          useChatStore.getState().importChatState(parsedChat2);
        }
        const freshAuth2 = useAuthStore.getState();
        if (freshAuth2.userId && (freshAuth2.nickname || freshAuth2.username || freshAuth2.birthday)) {
          useChatStore.getState().setUserProfile(freshAuth2.userId, {
            nickname: freshAuth2.nickname,
            avatarUrl: freshAuth2.avatarUrl,
            bannerUrl: freshAuth2.bannerUrl,
            username: freshAuth2.username,
            bio: freshAuth2.bio,
            birthday: freshAuth2.birthday,
          });
        }
      }

      set({
        activeAccountId: currentActiveId,
        accounts: registry.accounts,
        isSwitching: false,
      });
      syncActiveAccountScope(currentActiveId);
      isInitialized = true;
    })();

    try {
      await initPromise;
    } finally {
      if (!isInitialized) {
        initPromise = null;
      }
    }
  },

  syncCurrentAccountMeta: async () => {
    const { activeAccountId, accounts, isAddingSecondAccount } = get();
    if (isAddingSecondAccount || isRestoringSecondAccount) return;
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();

    const currentAccount = accounts.find((a) => a.id === activeAccountId);
    if (!currentAccount) return;

    let changed = false;
    if (auth.nickname && currentAccount.nickname !== auth.nickname) {
      currentAccount.nickname = auth.nickname;
      changed = true;
    }
    if (currentAccount.avatarUrl !== auth.avatarUrl) {
      currentAccount.avatarUrl = auth.avatarUrl;
      changed = true;
    }
    if (currentAccount.bannerUrl !== auth.bannerUrl) {
      currentAccount.bannerUrl = auth.bannerUrl;
      changed = true;
    }
    if (chat.myCode && currentAccount.myCode !== chat.myCode) {
      currentAccount.myCode = chat.myCode;
      changed = true;
    }
    if (auth.userId && currentAccount.userId !== auth.userId) {
      currentAccount.userId = auth.userId;
      changed = true;
    }
    if (currentAccount.username !== auth.username) {
      currentAccount.username = auth.username;
      changed = true;
    }
    if (currentAccount.bio !== auth.bio) {
      currentAccount.bio = auth.bio;
      changed = true;
    }
    if (currentAccount.birthday !== auth.birthday) {
      currentAccount.birthday = auth.birthday;
      changed = true;
    }
    if (auth.step === 'main' && !currentAccount.isRegistered) {
      currentAccount.isRegistered = true;
      changed = true;
    }

    if (changed) {
      const updatedAccounts = accounts.map((a) => (a.id === activeAccountId ? { ...currentAccount } : a));
      set({ accounts: updatedAccounts });
      await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify({ activeAccountId, accounts: updatedAccounts }));
    }

    await storageSet(`${AUTH_STORAGE_PREFIX}${activeAccountId}`, JSON.stringify(auth.exportAuthState()));
    await storageSet(`${CHAT_STORAGE_PREFIX}${activeAccountId}`, JSON.stringify(chat.exportChatState()));
  },

  switchAccount: async (targetId: 'account_1' | 'account_2') => {
    const { activeAccountId, accounts, isSwitching } = get();
    if (isSwitching || activeAccountId === targetId) return;

    set({ isSwitching: true });

    try {
      const auth = useAuthStore.getState();
      const chat = useChatStore.getState();

      const currentAuthData = auth.exportAuthState();
      const currentChatData = chat.exportChatState();

      await storageSet(`${AUTH_STORAGE_PREFIX}${activeAccountId}`, JSON.stringify(currentAuthData));
      await storageSet(`${CHAT_STORAGE_PREFIX}${activeAccountId}`, JSON.stringify(currentChatData));

      const activeClientId = chat.myCode || auth.userId;
      if (activeClientId) {
        ablyService.setOffline(activeClientId);
      }
      ablyService.disconnect();

      const targetAuthRaw = await storageGet(`${AUTH_STORAGE_PREFIX}${targetId}`);
      const targetChatRaw = await storageGet(`${CHAT_STORAGE_PREFIX}${targetId}`);

      if (targetAuthRaw) {
        const parsedAuth = unwrapPersistedState(targetAuthRaw);
        if (parsedAuth) {
          auth.importAuthState(parsedAuth);
        }
      }

      if (targetChatRaw) {
        const parsedChat = unwrapPersistedState(targetChatRaw);
        if (parsedChat) {
          chat.importChatState(parsedChat);
        }
      } else {
        chat.resetChats();
      }

      const freshAuth = useAuthStore.getState();
      if (freshAuth.userId && (freshAuth.nickname || freshAuth.username || freshAuth.birthday)) {
        useChatStore.getState().setUserProfile(freshAuth.userId, {
          nickname: freshAuth.nickname,
          avatarUrl: freshAuth.avatarUrl,
          bannerUrl: freshAuth.bannerUrl,
          username: freshAuth.username,
          bio: freshAuth.bio,
          birthday: freshAuth.birthday,
        });
      }

      const updatedRegistry: AccountRegistryData = {
        activeAccountId: targetId,
        accounts,
      };
      await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(updatedRegistry));

      set({
        activeAccountId: targetId,
        isSwitching: false,
        isAddingSecondAccount: false,
      });
      syncActiveAccountScope(targetId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('orbita:account-switched', { detail: { targetId } }));
      }
    } catch {
      set({ isSwitching: false });
    }
  },

  prepareAddSecondAccount: async () => {
    const { isSwitching } = get();
    if (isSwitching) return;
    set({ isAddingSecondAccount: true });
  },

  cancelAddSecondAccount: async () => {
    if (isRestoringSecondAccount) {
      isRestoringSecondAccount = false;
      const raw1Auth = await storageGet(`${AUTH_STORAGE_PREFIX}account_1`);
      const raw1Chat = await storageGet(`${CHAT_STORAGE_PREFIX}account_1`);
      const parsedAuth1 = raw1Auth ? unwrapPersistedState(raw1Auth) : null;
      const parsedChat1 = raw1Chat ? unwrapPersistedState(raw1Chat) : null;
      if (parsedAuth1) {
        useAuthStore.getState().importAuthState(parsedAuth1);
      }
      if (parsedChat1) {
        useChatStore.getState().importChatState(parsedChat1);
      }
      syncActiveAccountScope('account_1');
      const restoredClient = useChatStore.getState().myCode || useAuthStore.getState().userId;
      if (restoredClient) {
        ablyService.connect(restoredClient).catch(() => {});
      }
    }
    set({ isAddingSecondAccount: false, isSwitching: false });
  },

  prepareSecondAccountForRestore: async () => {
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();
    if (!isRestoringSecondAccount && get().activeAccountId === 'account_1') {
      const currentAuthData = auth.exportAuthState();
      const currentChatData = chat.exportChatState();
      await storageSet(`${AUTH_STORAGE_PREFIX}account_1`, JSON.stringify(currentAuthData));
      await storageSet(`${CHAT_STORAGE_PREFIX}account_1`, JSON.stringify(currentChatData));
    }
    isRestoringSecondAccount = true;
    set({ isAddingSecondAccount: true });
    const activeClientId = chat.myCode || auth.userId;
    if (activeClientId) {
      ablyService.setOffline(activeClientId);
    }
    ablyService.disconnect();
    useChatStore.setState({
      chats: [],
      messagesByChatId: {},
      usersById: {},
      pinnedChatIds: [],
      deletedChatIds: [],
      deletedChatSessions: {},
      incomingFriendRequests: [],
      activeChatId: null,
      activeProfileChatId: null,
      myCode: '',
    });
    syncActiveAccountScope('account_2');
  },

  finalizeSecondAccountRestore: async () => {
    isRestoringSecondAccount = false;
    const { accounts } = get();
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();

    let account1 = accounts.find((a) => a.id === 'account_1');
    if (!account1) {
      const raw1 = await storageGet(`${AUTH_STORAGE_PREFIX}account_1`);
      const rawChat1 = await storageGet(`${CHAT_STORAGE_PREFIX}account_1`);
      const parsed = raw1 ? unwrapPersistedState(raw1) : null;
      const parsedChat = rawChat1 ? unwrapPersistedState(rawChat1) : null;
      if (parsed) {
        account1 = {
          id: 'account_1',
          nickname: parsed.nickname || 'User',
          avatarUrl: parsed.avatarUrl || null,
          bannerUrl: parsed.bannerUrl || null,
          myCode: parsedChat?.myCode || null,
          userId: parsed.userId || '',
          isRegistered: true,
          username: parsed.username || null,
          bio: parsed.bio || null,
          birthday: parsed.birthday || null,
        };
      }
    }

    const account2: AccountMeta = {
      id: 'account_2',
      nickname: auth.nickname || 'User',
      avatarUrl: auth.avatarUrl || null,
      bannerUrl: auth.bannerUrl || null,
      myCode: chat.myCode || null,
      userId: auth.userId || '',
      isRegistered: true,
      username: auth.username || null,
      bio: auth.bio || null,
      birthday: auth.birthday || null,
    };

    const updatedAccounts = account1 ? [account1, account2] : [account2];
    const registry: AccountRegistryData = {
      activeAccountId: 'account_2',
      accounts: updatedAccounts,
    };

    await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
    await storageSet(`${AUTH_STORAGE_PREFIX}account_2`, JSON.stringify(auth.exportAuthState()));
    await storageSet(`${CHAT_STORAGE_PREFIX}account_2`, JSON.stringify(chat.exportChatState()));

    set({
      activeAccountId: 'account_2',
      accounts: updatedAccounts,
      isAddingSecondAccount: false,
      isSwitching: false,
    });
    syncActiveAccountScope('account_2');

    const client = chat.myCode || auth.userId;
    if (client) {
      ablyService.connect(client).catch(() => {});
    }
  },

  completeSecondAccountRegistration: async (data) => {
    const { accounts } = get();
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();

    const currentAuthData = auth.exportAuthState();
    const currentChatData = chat.exportChatState();

    await storageSet(`${AUTH_STORAGE_PREFIX}account_1`, JSON.stringify(currentAuthData));
    await storageSet(`${CHAT_STORAGE_PREFIX}account_1`, JSON.stringify(currentChatData));

    const activeClientId = chat.myCode || auth.userId;
    if (activeClientId) {
      ablyService.setOffline(activeClientId);
    }
    ablyService.disconnect();

    const newSeed = generateMasterSeedHex();
    const derived = deriveAccountKeys(newSeed);
    const newCode = data?.myCode || generateRandomCode();
    const newUserId = derived.userId;
    const nick = data?.nickname || 'User';
    const avatar = data?.avatarUrl || null;

    useChatStore.setState({
      chats: [],
      messagesByChatId: {},
      usersById: {},
      pinnedChatIds: [],
      deletedChatIds: [],
      deletedChatSessions: {},
      incomingFriendRequests: [],
      activeChatId: null,
      activeProfileChatId: null,
      myCode: newCode,
    });

    auth.importAuthState({
      userId: newUserId,
      nickname: nick,
      avatarUrl: avatar,
      step: 'main',
      recoveryKey: null,
      masterSeed: newSeed,
      configVersion: 0,
      lastSyncTime: null,
      syncStatus: 'idle',
      backupEnabled: false,
      backupFolder: null,
      lastBackupTime: null,
    });

    const account1: AccountMeta = accounts.find((a) => a.id === 'account_1') || {
      id: 'account_1',
      nickname: currentAuthData.nickname || 'User',
      avatarUrl: currentAuthData.avatarUrl || null,
      bannerUrl: currentAuthData.bannerUrl || null,
      myCode: currentChatData.myCode || null,
      userId: currentAuthData.userId || '',
      isRegistered: true,
      username: currentAuthData.username || null,
      bio: currentAuthData.bio || null,
      birthday: currentAuthData.birthday || null,
    };

    const account2: AccountMeta = {
      id: 'account_2',
      nickname: nick,
      avatarUrl: avatar,
      bannerUrl: null,
      myCode: newCode,
      userId: newUserId,
      isRegistered: true,
      username: null,
      bio: null,
      birthday: null,
    };

    const updatedAccounts = [account1, account2];
    const registry: AccountRegistryData = {
      activeAccountId: 'account_2',
      accounts: updatedAccounts,
    };

    await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
    await storageSet(`${AUTH_STORAGE_PREFIX}account_2`, JSON.stringify(useAuthStore.getState().exportAuthState()));
    await storageSet(`${CHAT_STORAGE_PREFIX}account_2`, JSON.stringify(useChatStore.getState().exportChatState()));

    set({
      activeAccountId: 'account_2',
      accounts: updatedAccounts,
      isAddingSecondAccount: false,
      isSwitching: false,
    });
    syncActiveAccountScope('account_2');

    ablyService.connect(newCode).catch(() => {});
  },

  deleteCurrentAccount: async () => {
    const { activeAccountId, accounts } = get();
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();

    const account1 = accounts.find((a) => a.id === 'account_1');
    const account2 = accounts.find((a) => a.id === 'account_2');

    if (activeAccountId === 'account_1' && account2 && account2.isRegistered) {
      await storageRemove(`${AUTH_STORAGE_PREFIX}account_1`);
      await storageRemove(`${CHAT_STORAGE_PREFIX}account_1`);

      const account2AuthRaw = await storageGet(`${AUTH_STORAGE_PREFIX}account_2`);
      const account2ChatRaw = await storageGet(`${CHAT_STORAGE_PREFIX}account_2`);

      await storageRemove(`${AUTH_STORAGE_PREFIX}account_2`);
      await storageRemove(`${CHAT_STORAGE_PREFIX}account_2`);

      if (account2AuthRaw) {
        const authUnwrapped = unwrapPersistedState(account2AuthRaw);
        const authWrapped = wrapPersistedState(account2AuthRaw, useAuthStore.persist?.getOptions().version ?? 2);
        await storageSet(`${AUTH_STORAGE_PREFIX}account_1`, account2AuthRaw);
        await storageSet('orbita-auth-storage', authWrapped);
        if (authUnwrapped) {
          auth.importAuthState(authUnwrapped);
        }
      }

      if (account2ChatRaw) {
        const chatUnwrapped = unwrapPersistedState(account2ChatRaw);
        const chatWrapped = wrapPersistedState(account2ChatRaw, useChatStore.persist?.getOptions().version ?? 38);
        await storageSet(`${CHAT_STORAGE_PREFIX}account_1`, account2ChatRaw);
        await storageSet('orbita-chat-storage', chatWrapped);
        if (chatUnwrapped) {
          chat.importChatState(chatUnwrapped);
        }
      }

      const promotedAccount: AccountMeta = {
        ...account2,
        id: 'account_1',
      };

      const newAccounts: AccountMeta[] = [promotedAccount];
      const registry: AccountRegistryData = {
        activeAccountId: 'account_1',
        accounts: newAccounts,
      };
      await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));

      set({
        activeAccountId: 'account_1',
        accounts: newAccounts,
        isAddingSecondAccount: false,
      });
      syncActiveAccountScope('account_1');

      const promotedClient = useChatStore.getState().myCode || useAuthStore.getState().userId;
      if (promotedClient) {
        ablyService.connect(promotedClient).catch(() => {});
      }

      return;
    }

    if (activeAccountId === 'account_2' && account1 && account1.isRegistered) {
      await storageRemove(`${AUTH_STORAGE_PREFIX}account_2`);
      await storageRemove(`${CHAT_STORAGE_PREFIX}account_2`);

      const activeClientId = chat.myCode || auth.userId;
      if (activeClientId) {
        ablyService.setOffline(activeClientId);
      }
      ablyService.disconnect();

      const account1AuthRaw = await storageGet(`${AUTH_STORAGE_PREFIX}account_1`) || await storageGet('orbita-auth-storage');
      const account1ChatRaw = await storageGet(`${CHAT_STORAGE_PREFIX}account_1`) || await storageGet('orbita-chat-storage');

      if (account1AuthRaw) {
        try {
          const parsed = JSON.parse(account1AuthRaw);
          auth.importAuthState(parsed.state || parsed);
        } catch {}
      }

      if (account1ChatRaw) {
        try {
          const parsed = JSON.parse(account1ChatRaw);
          chat.importChatState(parsed.state || parsed);
        } catch {}
      }

      const newAccounts = accounts.filter((a) => a.id !== 'account_2');
      const registry: AccountRegistryData = {
        activeAccountId: 'account_1',
        accounts: newAccounts,
      };
      await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));

      set({
        activeAccountId: 'account_1',
        accounts: newAccounts,
        isAddingSecondAccount: false,
      });
      syncActiveAccountScope('account_1');

      const restoredClient = useChatStore.getState().myCode || useAuthStore.getState().userId;
      if (restoredClient) {
        ablyService.connect(restoredClient).catch(() => {});
      }

      return;
    }

    await storageRemove(REGISTRY_STORAGE_KEY);
    await storageRemove(`${AUTH_STORAGE_PREFIX}account_1`);
    await storageRemove(`${CHAT_STORAGE_PREFIX}account_1`);
    await storageRemove(`${AUTH_STORAGE_PREFIX}account_2`);
    await storageRemove(`${CHAT_STORAGE_PREFIX}account_2`);
    await storageRemove('orbita-auth-storage');
    await storageRemove('orbita-chat-storage');

    document.documentElement.removeAttribute('data-theme');
    chat.resetChats();

    const newUserId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    auth.importAuthState({
      userId: newUserId,
      nickname: '',
      avatarUrl: null,
      step: 'welcome',
      recoveryKey: null,
      masterSeed: null,
      configVersion: 0,
      lastSyncTime: null,
      syncStatus: 'idle',
      backupEnabled: false,
      backupFolder: null,
      lastBackupTime: null,
    });

    set({
      activeAccountId: 'account_1',
      accounts: [],
      isAddingSecondAccount: false,
    });
    syncActiveAccountScope('account_1');
  },
}));
