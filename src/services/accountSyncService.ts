import { useAuthStore } from '../store/useAuthStore';
import { useChatStore, Chat } from '../store/useChatStore';
import { gatewayManager } from './gatewayManager';
import {
  deriveAccountKeys,
  encryptConfigBlob,
  decryptConfigBlob,
  signConfigPayload,
  isValidMasterSeedHex,
  generateMasterSeedHex,
} from '../lib/zkAccountCrypto';

export interface UserConfigPayload {
  version: number;
  updatedAt: number;
  auth: {
    userId: string;
    nickname: string;
    avatarUrl: string | null;
    bannerUrl?: string | null;
    username?: string | null;
    bio?: string | null;
    birthday?: string | null;
  };
  chatStore: {
    myCode: string;
    pinnedChatIds: string[];
    deletedChatIds: string[];
    usersById: Record<string, any>;
    chats: any[];
    currentTheme?: string;
    dotOverlay?: boolean;
    blurProtection?: boolean;
    hideOnBackground?: boolean;
    hideFromScreenCapture?: boolean;
    fontFamily?: any;
    textScale?: number;
    dotColor?: string;
    language?: any;
    headerEnabled?: boolean;
    headerTitle?: any;
    ringEnabled?: boolean;
    notificationCount?: number;
    notificationPosition?: any;
    notificationHideContent?: boolean;
    notificationPreviewTheme?: any;
    bubbleRadius?: number;
    notificationSoundEnabled?: boolean;
    notificationsEnabled?: boolean;
    notificationFlashTaskbar?: boolean;
    notificationVolume?: number;
    notificationShowName?: boolean;
    notificationShowText?: boolean;
    voiceCallsEnabled?: boolean;
    readReceiptsEnabled?: boolean;
    typingIndicatorsEnabled?: boolean;
    linkPreviewsEnabled?: boolean;
    anonymousForwardingEnabled?: boolean;
    recentEmojis?: string[];
    autoUpdate?: boolean;
    showInSystemTray?: boolean;
    autoLaunch?: boolean;
    sendOnEnter?: boolean;
    useImprovedPlayer?: boolean;
    noiseSuppression?: boolean;
    noiseSuppressionMode?: any;
  };
}

const isNonEmptyStr = (val: unknown): val is string =>
  typeof val === 'string' && val.trim().length > 0;

const mergeUserProfileEntry = (localUser: any, cloudUser: any): any => {
  if (!localUser) return cloudUser;
  if (!cloudUser) return localUser;
  const localUpdated = Number(localUser.updatedAt) || 0;
  const cloudUpdated = Number(cloudUser.updatedAt) || 0;
  const primary = localUpdated >= cloudUpdated ? localUser : cloudUser;
  const secondary = localUpdated >= cloudUpdated ? cloudUser : localUser;
  const pick = (a: unknown, b: unknown) => {
    if (isNonEmptyStr(a)) return a;
    if (isNonEmptyStr(b)) return b;
    return a ?? b ?? null;
  };
  const maxUpdated = Math.max(localUpdated, cloudUpdated);
  return {
    ...secondary,
    ...primary,
    nickname: pick(primary.nickname, secondary.nickname) || '',
    avatarUrl: pick(primary.avatarUrl, secondary.avatarUrl),
    bannerUrl: pick(primary.bannerUrl, secondary.bannerUrl),
    username: pick(primary.username, secondary.username),
    bio: pick(primary.bio, secondary.bio),
    birthday: pick(primary.birthday, secondary.birthday),
    ...(maxUpdated > 0 ? { updatedAt: maxUpdated } : {}),
  };
};

const mergeUsersByIdMaps = (
  localUsers: Record<string, any> | undefined,
  cloudUsers: Record<string, any> | undefined
): Record<string, any> => {
  const localMap = localUsers && typeof localUsers === 'object' ? localUsers : {};
  const cloudMap = cloudUsers && typeof cloudUsers === 'object' ? cloudUsers : {};
  const merged: Record<string, any> = {};
  const allIds = new Set([...Object.keys(cloudMap), ...Object.keys(localMap)]);
  for (const uid of allIds) {
    merged[uid] = mergeUserProfileEntry(localMap[uid], cloudMap[uid]);
  }
  return merged;
};

class AccountSyncService {
  private syncTimer: any = null;
  private isSyncing = false;
  private initialized = false;
  private readonly DEBOUNCE_MS = 15000;

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.ensureMasterSeed();
  }

  public ensureMasterSeed(): string {
    const auth = useAuthStore.getState();
    if (auth.masterSeed && isValidMasterSeedHex(auth.masterSeed)) {
      return auth.masterSeed;
    }

    if (auth.step === 'main' && auth.userId) {
      return auth.masterSeed || '';
    }

    const newSeed = generateMasterSeedHex();
    const derived = deriveAccountKeys(newSeed);
    useAuthStore.getState().setMasterSeed(newSeed);
    useAuthStore.getState().setUserId(derived.userId);
    return newSeed;
  }

  public packAccountState(): UserConfigPayload {
    const authState = useAuthStore.getState();
    const chatState = useChatStore.getState();

    const sanitizedChats = (chatState.chats || []).map((chat) => ({
      id: chat.id,
      type: chat.type,
      name: chat.name,
      avatarUrl: chat.avatarUrl || null,
      peerCode: chat.peerCode || null,
      sharedSecret: chat.sharedSecret,
      ratchetState: chat.ratchetState,
      pinnedMessage: chat.pinnedMessage,
      role: chat.role,
      members: chat.members,
      inviteCode: chat.inviteCode,
      isBlocked: chat.isBlocked,
      muted: chat.muted,
      notificationsEnabled: chat.notificationsEnabled,
      isOfficial: chat.isOfficial,
      isOwner: chat.isOwner,
      creatorId: chat.creatorId,
      creatorNickname: chat.creatorNickname,
      description: chat.description,
      subscribersCount: chat.subscribersCount,
    }));

    return {
      version: 1,
      updatedAt: Date.now(),
      auth: {
        userId: authState.userId,
        nickname: authState.nickname,
        avatarUrl: authState.avatarUrl,
        bannerUrl: authState.bannerUrl,
        username: authState.username,
        bio: authState.bio,
        birthday: authState.birthday,
      },
      chatStore: {
        myCode: chatState.myCode,
        pinnedChatIds: chatState.pinnedChatIds || [],
        deletedChatIds: chatState.deletedChatIds || [],
        usersById: chatState.usersById || {},
        chats: sanitizedChats,
        currentTheme: chatState.currentTheme,
        dotOverlay: chatState.dotOverlay,
        blurProtection: chatState.blurProtection,
        hideOnBackground: chatState.hideOnBackground,
        hideFromScreenCapture: chatState.hideFromScreenCapture,
        fontFamily: chatState.fontFamily,
        textScale: chatState.textScale,
        dotColor: chatState.dotColor,
        language: chatState.language,
        headerEnabled: chatState.headerEnabled,
        headerTitle: chatState.headerTitle,
        ringEnabled: chatState.ringEnabled,
        notificationCount: chatState.notificationCount,
        notificationPosition: chatState.notificationPosition,
        notificationHideContent: chatState.notificationHideContent,
        notificationPreviewTheme: chatState.notificationPreviewTheme,
        bubbleRadius: chatState.bubbleRadius,
        notificationSoundEnabled: chatState.notificationSoundEnabled,
        notificationsEnabled: chatState.notificationsEnabled,
        notificationFlashTaskbar: chatState.notificationFlashTaskbar,
        notificationVolume: chatState.notificationVolume,
        notificationShowName: chatState.notificationShowName,
        notificationShowText: chatState.notificationShowText,
        voiceCallsEnabled: chatState.voiceCallsEnabled,
        readReceiptsEnabled: chatState.readReceiptsEnabled,
        typingIndicatorsEnabled: chatState.typingIndicatorsEnabled,
        linkPreviewsEnabled: chatState.linkPreviewsEnabled,
        anonymousForwardingEnabled: chatState.anonymousForwardingEnabled,
        recentEmojis: chatState.recentEmojis,
        autoUpdate: chatState.autoUpdate,
        showInSystemTray: chatState.showInSystemTray,
        autoLaunch: chatState.autoLaunch,
        sendOnEnter: chatState.sendOnEnter,
        useImprovedPlayer: chatState.useImprovedPlayer,
        noiseSuppression: chatState.noiseSuppression,
        noiseSuppressionMode: chatState.noiseSuppressionMode,
      },
    };
  }

  public unpackAccountState(payload: UserConfigPayload, options?: { preferLocalOnConflict?: boolean }): void {
    if (!payload || !payload.auth || !payload.chatStore) {
      throw new Error('INVALID_CONFIG_STRUCTURE');
    }

    const authState = useAuthStore.getState();
    const chatState = useChatStore.getState();
    const currentUserId = authState.userId;
    const restoredUserId = payload.auth.userId || currentUserId;
    const isSameUser = Boolean(!currentUserId || !payload.auth.userId || currentUserId === payload.auth.userId);
    const preferLocal = Boolean(options?.preferLocalOnConflict && isSameUser);

    const pickField = (cloudVal: string | null | undefined, localVal: string | null | undefined): string | null => {
      if (preferLocal) {
        if (isNonEmptyStr(localVal)) return localVal;
        if (isNonEmptyStr(cloudVal)) return cloudVal;
        return cloudVal ?? localVal ?? null;
      }
      if (isNonEmptyStr(cloudVal)) return cloudVal;
      if (isSameUser && isNonEmptyStr(localVal)) return localVal;
      return cloudVal ?? (isSameUser ? localVal ?? null : null);
    };

    const nextNickname = preferLocal
      ? (isNonEmptyStr(authState.nickname) ? authState.nickname : (payload.auth.nickname || ''))
      : (isNonEmptyStr(payload.auth.nickname) ? payload.auth.nickname : (isSameUser ? authState.nickname : '') || '');
    const nextAvatarUrl = pickField(payload.auth.avatarUrl, authState.avatarUrl);
    const nextBannerUrl = pickField(payload.auth.bannerUrl, authState.bannerUrl);
    const nextUsername = pickField(payload.auth.username, authState.username);
    const nextBio = pickField(payload.auth.bio, authState.bio);
    const nextBirthday = pickField(payload.auth.birthday, authState.birthday);

    const mergedUsersById = mergeUsersByIdMaps(
      isSameUser ? chatState.usersById : {},
      payload.chatStore.usersById
    );
    if (restoredUserId) {
      mergedUsersById[restoredUserId] = mergeUserProfileEntry(
        {
          id: restoredUserId,
          nickname: nextNickname,
          avatarUrl: nextAvatarUrl,
          bannerUrl: nextBannerUrl,
          username: nextUsername,
          bio: nextBio,
          birthday: nextBirthday,
          updatedAt: Date.now(),
        },
        mergedUsersById[restoredUserId]
      );
    }

    const restoredChats: Chat[] = Array.isArray(payload.chatStore.chats)
      ? payload.chatStore.chats.map((c: any) => ({
          ...c,
          online: false,
          lastMsg: '',
          unreadCount: 0,
        }))
      : [];

    useChatStore.setState({
      ...(payload.chatStore as any),
      usersById: mergedUsersById,
      chats: restoredChats,
      messagesByChatId: chatState.messagesByChatId || {},
    });

    useAuthStore.setState({
      userId: restoredUserId,
      nickname: nextNickname,
      avatarUrl: nextAvatarUrl,
      bannerUrl: nextBannerUrl,
      username: nextUsername,
      bio: nextBio,
      birthday: nextBirthday,
    });
  }

  public queueSync(delayMs = this.DEBOUNCE_MS): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => {
      this.syncNow().catch(() => {});
    }, delayMs);
  }

  public async syncNow(): Promise<boolean> {
    if (this.isSyncing) return false;
    const authState = useAuthStore.getState();
    if (!authState.masterSeed || !isValidMasterSeedHex(authState.masterSeed)) {
      return false;
    }

    this.isSyncing = true;
    useAuthStore.getState().setSyncStatus('syncing');

    try {
      const keys = deriveAccountKeys(authState.masterSeed);
      const payloadObj = this.packAccountState();
      const jsonStr = JSON.stringify(payloadObj);
      const jsonByteLength = new TextEncoder().encode(jsonStr).length;
      if (jsonByteLength > 4.5 * 1024 * 1024) {
        throw new Error(`Payload size ${jsonByteLength} bytes exceeds 4.5 MB safety quota`);
      }
      const configBlob = await encryptConfigBlob(keys.backupEncKey, jsonStr);

      const nextVersion = (authState.configVersion || 0) + 1;
      const signature = signConfigPayload(keys.authSeed, keys.userId, nextVersion, configBlob);

      const res = await gatewayManager.fetch('/user/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': keys.userId,
        },
        body: JSON.stringify({
          user_id: keys.userId,
          config_blob: configBlob,
          version: nextVersion,
          signature,
        }),
      });

      if (res.status === 409) {
        await this.pullAndMerge(keys.userId, keys.backupEncKey);
        this.isSyncing = false;
        return true;
      }

      if (!res.ok) {
        let errorDetail = '';
        try {
          const errJson = await res.json();
          errorDetail = errJson.error || JSON.stringify(errJson);
        } catch {
          errorDetail = await res.text().catch(() => '');
        }
        throw new Error(`HTTP ${res.status}: ${errorDetail || 'Sync endpoint failed'}`);
      }

      const data = await res.json();
      const finalVersion = Number(data.version) || nextVersion;
      useAuthStore.getState().setConfigVersion(finalVersion);
      useAuthStore.getState().setSyncStatus('synced', Date.now());
      this.isSyncing = false;
      return true;
    } catch (err: any) {
      console.error('[AccountSyncService] syncNow failure:', err?.message || err);
      useAuthStore.getState().setSyncStatus('error');
      this.isSyncing = false;
      return false;
    }
  }

  private async pullAndMerge(userId: string, backupEncKey: Uint8Array): Promise<void> {
    const res = await gatewayManager.fetch(`/user/config?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.config_blob) return;

    const decryptedJson = await decryptConfigBlob(backupEncKey, data.config_blob);
    const parsed: UserConfigPayload = JSON.parse(decryptedJson);

    this.unpackAccountState(parsed, { preferLocalOnConflict: true });

    const serverVersion = Number(data.version) || 1;
    useAuthStore.getState().setConfigVersion(serverVersion);

    const mergedAuth = useAuthStore.getState();
    const mergedUsersById = useChatStore.getState().usersById || {};
    const cloudAuth = parsed.auth || ({} as UserConfigPayload['auth']);
    const cloudUsersById = parsed.chatStore?.usersById || {};

    const authHasNewerData =
      (isNonEmptyStr(mergedAuth.nickname) && mergedAuth.nickname !== cloudAuth.nickname) ||
      (isNonEmptyStr(mergedAuth.avatarUrl) && mergedAuth.avatarUrl !== cloudAuth.avatarUrl) ||
      (isNonEmptyStr(mergedAuth.bannerUrl) && mergedAuth.bannerUrl !== cloudAuth.bannerUrl) ||
      (isNonEmptyStr(mergedAuth.username) && mergedAuth.username !== cloudAuth.username) ||
      (isNonEmptyStr(mergedAuth.bio) && mergedAuth.bio !== cloudAuth.bio) ||
      (isNonEmptyStr(mergedAuth.birthday) && mergedAuth.birthday !== cloudAuth.birthday);

    const usersHaveNewerData = Object.keys(mergedUsersById).some((uid) => {
      const mergedUser = mergedUsersById[uid];
      const cloudUser = cloudUsersById[uid];
      if (!cloudUser) return true;
      return (
        (isNonEmptyStr(mergedUser?.nickname) && mergedUser.nickname !== cloudUser.nickname) ||
        (isNonEmptyStr(mergedUser?.avatarUrl) && mergedUser.avatarUrl !== cloudUser.avatarUrl) ||
        (isNonEmptyStr(mergedUser?.bannerUrl) && mergedUser.bannerUrl !== cloudUser.bannerUrl) ||
        (isNonEmptyStr(mergedUser?.username) && mergedUser.username !== cloudUser.username) ||
        (isNonEmptyStr(mergedUser?.bio) && mergedUser.bio !== cloudUser.bio) ||
        (isNonEmptyStr(mergedUser?.birthday) && mergedUser.birthday !== cloudUser.birthday)
      );
    });

    if (authHasNewerData || usersHaveNewerData) {
      try {
        const masterSeed = mergedAuth.masterSeed;
        if (masterSeed && isValidMasterSeedHex(masterSeed)) {
          const keys = deriveAccountKeys(masterSeed);
          const mergedPayload = this.packAccountState();
          const mergedJson = JSON.stringify(mergedPayload);
          const mergedByteLength = new TextEncoder().encode(mergedJson).length;
          if (mergedByteLength <= 4.5 * 1024 * 1024) {
            const mergedBlob = await encryptConfigBlob(backupEncKey, mergedJson);
            const nextVersion = serverVersion + 1;
            const signature = signConfigPayload(keys.authSeed, keys.userId, nextVersion, mergedBlob);
            const putRes = await gatewayManager.fetch('/user/config', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': keys.userId,
              },
              body: JSON.stringify({
                user_id: keys.userId,
                config_blob: mergedBlob,
                version: nextVersion,
                signature,
              }),
            });
            if (putRes.ok) {
              const putData = await putRes.json().catch(() => ({}));
              const finalVersion = Number(putData.version) || nextVersion;
              useAuthStore.getState().setConfigVersion(finalVersion);
            }
          }
        }
      } catch {}
    }

    useAuthStore.getState().setSyncStatus('synced', Date.now());

    if (typeof window !== 'undefined') {
      import('./accountManager').then((m) => {
        m.useAccountStore.getState().syncCurrentAccountMeta();
      }).catch(() => {});
    }
  }

  public async restoreAccountFromCloud(masterSeedHex: string): Promise<{ restored: boolean; userId: string }> {
    const trimmed = masterSeedHex.trim().toLowerCase();
    if (!isValidMasterSeedHex(trimmed)) {
      throw new Error('INVALID_MASTER_SEED');
    }

    const keys = deriveAccountKeys(trimmed);
    const res = await gatewayManager.fetch(`/user/config?user_id=${encodeURIComponent(keys.userId)}`);

    if (res.status === 404) {
      useAuthStore.setState({
        userId: keys.userId,
        masterSeed: trimmed,
        configVersion: 0,
        syncStatus: 'idle',
        lastSyncTime: null,
        step: 'nickname',
      });
      return { restored: false, userId: keys.userId };
    }

    if (!res.ok) {
      throw new Error(`SERVER_ERROR_${res.status}`);
    }

    const data = await res.json();
    if (!data || !data.config_blob) {
      useAuthStore.setState({
        userId: keys.userId,
        masterSeed: trimmed,
        configVersion: 0,
        syncStatus: 'idle',
        lastSyncTime: null,
        step: 'nickname',
      });
      return { restored: false, userId: keys.userId };
    }

    let decryptedJson = '';
    try {
      decryptedJson = await decryptConfigBlob(keys.backupEncKey, data.config_blob);
    } catch {
      throw new Error('INVALID_KEY_OR_CORRUPT');
    }

    let parsed: UserConfigPayload;
    try {
      parsed = JSON.parse(decryptedJson);
    } catch {
      throw new Error('INVALID_JSON');
    }

    this.unpackAccountState(parsed);

    useAuthStore.setState({
      userId: keys.userId,
      masterSeed: trimmed,
      configVersion: Number(data.version) || 1,
      syncStatus: 'synced',
      lastSyncTime: Date.now(),
      step: 'main',
    });

    if (typeof window !== 'undefined') {
      import('./accountManager').then((m) => {
        m.useAccountStore.getState().syncCurrentAccountMeta();
      }).catch(() => {});
    }

    return { restored: true, userId: keys.userId };
  }

  public async refreshCloudBackupStatus(): Promise<void> {
    const authState = useAuthStore.getState();
    if (!authState.masterSeed || !isValidMasterSeedHex(authState.masterSeed)) {
      return;
    }

    try {
      const keys = deriveAccountKeys(authState.masterSeed);
      const res = await gatewayManager.fetch(`/user/config?user_id=${encodeURIComponent(keys.userId)}`);
      if (res.status === 404) {
        useAuthStore.getState().setConfigVersion(0);
        useAuthStore.getState().setSyncStatus('idle', null);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data && data.version && data.config_blob) {
          const version = Number(data.version) || 0;
          const updated = data.updated_at ? new Date(data.updated_at).getTime() : Date.now();
          useAuthStore.getState().setConfigVersion(version);
          useAuthStore.getState().setSyncStatus('synced', updated);
        } else {
          useAuthStore.getState().setConfigVersion(0);
          useAuthStore.getState().setSyncStatus('idle', null);
        }
      }
    } catch {}
  }

  public async deleteCloudConfig(): Promise<boolean> {
    const authState = useAuthStore.getState();
    if (!authState.masterSeed || !isValidMasterSeedHex(authState.masterSeed)) {
      useAuthStore.getState().setConfigVersion(0);
      useAuthStore.getState().setSyncStatus('idle', null);
      return false;
    }

    let isSuccess = false;
    try {
      const keys = deriveAccountKeys(authState.masterSeed);
      try {
        const res = await gatewayManager.fetch(`/user/config?user_id=${encodeURIComponent(keys.userId)}&action=delete`, {
          method: 'DELETE',
          headers: {
            'x-user-id': keys.userId,
          },
        });
        if (res.ok || res.status === 404) {
          isSuccess = true;
        } else {
          const postRes = await gatewayManager.fetch(`/user/config?user_id=${encodeURIComponent(keys.userId)}&action=delete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': keys.userId,
            },
            body: JSON.stringify({ action: 'delete', user_id: keys.userId }),
          });
          if (postRes.ok || postRes.status === 404) {
            isSuccess = true;
          }
        }
      } catch {
        try {
          const postRes = await gatewayManager.fetch(`/user/config?user_id=${encodeURIComponent(keys.userId)}&action=delete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': keys.userId,
            },
            body: JSON.stringify({ action: 'delete', user_id: keys.userId }),
          });
          if (postRes.ok || postRes.status === 404) {
            isSuccess = true;
          }
        } catch {}
      }

      useAuthStore.getState().setConfigVersion(0);
      useAuthStore.getState().setSyncStatus('idle', null);
      return isSuccess;
    } catch {
      useAuthStore.getState().setConfigVersion(0);
      useAuthStore.getState().setSyncStatus('idle', null);
      return false;
    }
  }
}

export const accountSyncService = new AccountSyncService();
