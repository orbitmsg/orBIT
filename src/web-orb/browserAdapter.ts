import { getVercelBaseUrl } from '../services/gatewayManager';
import { idbMediaStorage } from '../services/mediaManager';

const WORKER_URL = getVercelBaseUrl();

export interface BrowserAudioMetadata {
  title: string;
  artist: string;
  duration: number;
  size: number;
  cover: string | null;
}

type UploadProgressCallback = (data: { publicId: string; uploadedBytes: number; totalBytes: number }) => void;

class BrowserOrbitaAdapter {
  private fileStore = new Map<string, Blob | File>();
  private activeUploadXhrs = new Map<string, XMLHttpRequest>();
  private progressListeners = new Set<UploadProgressCallback>();

  private setFile(key: string, file: Blob | File) {
    if (this.fileStore.size >= 50) {
      const firstKey = this.fileStore.keys().next().value;
      if (firstKey) this.fileStore.delete(firstKey);
    }
    this.fileStore.set(key, file);
  }

  public init() {
    if (typeof window === 'undefined') return;
    if (window.orbita) {
      console.log('[BrowserAdapter] Native window.orbita already present (Electron environment)');
      return;
    }

    console.log('[BrowserAdapter] Installing Web Browser adapter for window.orbita');
    let currentActiveAccountId = 'account_1';
    const getScopedChatId = (chatId: string) => {
      if (!chatId) return chatId;
      if (chatId.startsWith('account_1:::') || chatId.startsWith('account_2:::')) return chatId;
      return `${currentActiveAccountId}:::${chatId}`;
    };
    const getScopedMsgId = (messageId: string) => {
      if (!messageId) return messageId;
      if (messageId.startsWith('account_1:::') || messageId.startsWith('account_2:::')) return messageId;
      return `${currentActiveAccountId}:::${messageId}`;
    };

    (window as any).orbita = {
      pickFile: this.pickFile.bind(this),
      uploadToCloudinary: this.uploadToCloudinary.bind(this),
      prepareVideoForUpload: this.prepareVideoForUpload.bind(this),
      readFileAsDataURL: this.readFileAsDataURL.bind(this),
      readFileAsArrayBuffer: this.readFileAsArrayBuffer.bind(this),
      writeTempFile: this.writeTempFile.bind(this),
      deleteTempFile: this.deleteTempFile.bind(this),
      readClipboardImage: this.readClipboardImage.bind(this),
      onUploadProgress: this.onUploadProgress.bind(this),
      getFileSize: this.getFileSize.bind(this),
      getAudioMetadata: this.getAudioMetadata.bind(this),
      showCustomNotification: this.showCustomNotification.bind(this),
      clearNotifications: () => {},
      onOpenChat: this.onOpenChat.bind(this),
      onDeepLink: () => () => {},
      setThemeForElectron: () => {},
      getCurrentTheme: async () => ({ themeId: 'dark', themeVars: {} }),
      isWindowVisible: async () => true,
      showWindow: async () => {},
      hideWindow: async () => {},
      setShowInSystemTray: async () => true,
      getShowInSystemTray: async () => false,
      setAutoLaunch: async () => false,
      getAutoLaunchState: async () => false,
      setScreenProtection: async () => false,
      getScreenProtection: async () => false,
      setHideMenuBar: async () => false,
      getHideMenuBar: async () => false,
      openOrbitaFromTray: () => {},
      closeOrbitaFromTray: () => {},
      minimizeWindow: async () => {},
      maximizeWindow: async () => {},
      closeWindow: async () => {},
      cancelUpload: async (publicId?: string) => {
        if (publicId && this.activeUploadXhrs.has(publicId)) {
          const xhr = this.activeUploadXhrs.get(publicId);
          try { xhr?.abort(); } catch {}
          this.activeUploadXhrs.delete(publicId);
        } else {
          for (const [, xhr] of this.activeUploadXhrs.entries()) {
            try { xhr.abort(); } catch {}
          }
          this.activeUploadXhrs.clear();
        }
        return { success: true };
      },
      isWindowMaximized: async () => false,
      toggleFullScreen: async () => {},
      onWindowStateChange: () => () => {},
      doubleClickTitleBar: () => {},
      notificationsEnabled: async () => 'Notification' in window && Notification.permission === 'granted',
      onNotificationsChanged: () => () => {},
      startSyncServer: async () => ({ url: 'http://localhost:5173', port: 5173 }),
      stopSyncServer: async () => ({ success: true }),
      getSyncServerUrl: async () => 'http://localhost:5173',
      getLocalIp: async () => '127.0.0.1',
      openExternal: async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      setAppIcon: () => {},
      setNotificationIcon: () => {},
      downloadsSave: this.downloadsSave.bind(this),
      saveFileAs: this.saveFileAs.bind(this),
      copyImage: this.copyImage.bind(this),
      openFile: this.openFile.bind(this),
      scanUsbKey: async () => ({ found: false }),
      getRemovableDrives: async () => [],
      writeUsbKey: async () => ({ success: false }),
      readKeyFile: async () => null,
      selectDirectory: async () => null,
      mediaGet: async (url: string) => {
        try {
          return await idbMediaStorage.get(url);
        } catch {
          return null;
        }
      },
      mediaSave: async (url: string, data: any, mime: string, chatId?: string, messageId?: string) => {
        try {
          let b64 = '';
          if (typeof data === 'string') {
            b64 = data;
          } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
            }
            b64 = btoa(binary);
          }
          await idbMediaStorage.save(url, b64, mime, chatId, messageId);
        } catch {}
      },
      mediaClear: async () => ({ deleted: 0 }),
      mediaStats: async () => ({ count: 0, totalSize: 0 }),
      mediaDetailedStats: async () => ({ totalCount: 0, totalSize: 0, byType: {} }),
      mediaChatStats: async () => [],
      getDiskSpace: async () => ({ total: 1000000000000, free: 500000000000, used: 500000000000 }),
      mediaEvictByAge: async () => ({ deleted: 0 }),
      mediaEvictBySize: async () => ({ deleted: 0 }),
      mediaSetLimit: async () => ({ deleted: 0 }),
      mediaGetBatch: async () => [],
      mediaDeleteByChatId: async () => ({ deleted: 0 }),
      setActiveAccountScope: (accountId: string) => {
        currentActiveAccountId = accountId || 'account_1';
      },
      storageGetMessages: async (chatId: string) => {
        try {
          const scopedChatId = getScopedChatId(chatId);
          let raw = localStorage.getItem(`orbita_msgs_${scopedChatId}`);
          if (!raw && currentActiveAccountId === 'account_1' && !chatId.includes(':::')) {
            raw = localStorage.getItem(`orbita_msgs_${chatId}`);
          }
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      },
      storageGetAllRecentMessages: async (limitPerChat = 30) => {
        try {
          const result: Record<string, any[]> = {};
          const activePrefix = `${currentActiveAccountId}:::`;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('orbita_msgs_')) continue;
            let rawChatId = key.replace('orbita_msgs_', '');
            if (rawChatId.startsWith(activePrefix)) {
              rawChatId = rawChatId.slice(activePrefix.length);
            } else if (currentActiveAccountId === 'account_1' && !rawChatId.includes(':::')) {
            } else {
              continue;
            }
            try {
              const raw = localStorage.getItem(key);
              const msgs = raw ? JSON.parse(raw) : [];
              if (Array.isArray(msgs) && msgs.length > 0) {
                const current = result[rawChatId] || [];
                const merged = [...current, ...msgs];
                const seen = new Set();
                const unique = merged.filter((m: any) => {
                  const id = m.id || `${m.time}_${m.text}`;
                  if (seen.has(id)) return false;
                  seen.add(id);
                  return true;
                });
                unique.sort((a: any, b: any) => (a.time || 0) - (b.time || 0));
                result[rawChatId] = unique.slice(-limitPerChat);
              }
            } catch {}
          }
          return result;
        } catch {
          return {};
        }
      },
      storageAddMessage: async (chatId: string, messageId: string, messageData: any) => {
        try {
          const scopedChatId = getScopedChatId(chatId);
          const scopedMsgId = getScopedMsgId(messageId);
          const key = `orbita_msgs_${scopedChatId}`;
          const raw = localStorage.getItem(key);
          const arr = raw ? JSON.parse(raw) : [];
          const idx = arr.findIndex((m: any) => m.id === scopedMsgId || m.id === messageId);
          if (idx >= 0) {
            arr[idx] = messageData;
          } else {
            arr.push(messageData);
          }
          localStorage.setItem(key, JSON.stringify(arr.slice(-1000)));
        } catch {}
      },
      storageAddMessagesBatch: async (chatId: string, messages: Array<{ id: string; messageData: any }>) => {
        try {
          const scopedChatId = getScopedChatId(chatId);
          const key = `orbita_msgs_${scopedChatId}`;
          const raw = localStorage.getItem(key);
          const arr = raw ? JSON.parse(raw) : [];
          for (const item of messages) {
            const idx = arr.findIndex((m: any) => m.id === item.id);
            if (idx >= 0) {
              arr[idx] = item.messageData;
            } else {
              arr.push(item.messageData);
            }
          }
          localStorage.setItem(key, JSON.stringify(arr.slice(-1000)));
        } catch {}
      },
      storageDeleteMessages: async (chatId: string) => {
        try {
          const scopedChatId = getScopedChatId(chatId);
          localStorage.removeItem(`orbita_msgs_${scopedChatId}`);
          if (scopedChatId.startsWith('account_1:::')) {
            localStorage.removeItem(`orbita_msgs_${scopedChatId.slice('account_1:::'.length)}`);
          }
        } catch {}
      },
      storageDeleteMessage: async () => {},
      storageDeleteMessagesByIds: async () => {},
      storageMigrateChat: async (fromChatId: string, toChatId: string) => {
        try {
          const scopedFrom = getScopedChatId(fromChatId);
          const scopedTo = getScopedChatId(toChatId);
          const rawFrom = localStorage.getItem(`orbita_msgs_${scopedFrom}`) || localStorage.getItem(`orbita_msgs_${fromChatId}`);
          if (rawFrom) {
            const fromMsgs = JSON.parse(rawFrom);
            const rawTo = localStorage.getItem(`orbita_msgs_${scopedTo}`) || localStorage.getItem(`orbita_msgs_${toChatId}`);
            const toMsgs = rawTo ? JSON.parse(rawTo) : [];
            const seen = new Set(toMsgs.map((m: any) => m.id || `${m.time}_${m.text}`));
            const combined = [...toMsgs];
            for (const m of fromMsgs) {
              const key = m.id || `${m.time}_${m.text}`;
              if (!seen.has(key)) {
                seen.add(key);
                combined.push(m);
              }
            }
            combined.sort((a: any, b: any) => (Number(a.time) || 0) - (Number(b.time) || 0));
            localStorage.setItem(`orbita_msgs_${scopedTo}`, JSON.stringify(combined));
            localStorage.removeItem(`orbita_msgs_${scopedFrom}`);
            localStorage.removeItem(`orbita_msgs_${fromChatId}`);
          }
        } catch {}
      },
      storageSearchMessages: async () => [],
      storageSearchMessagesInChat: async () => [],
      storageSyncFts: async () => 0,
      rustSearchBm25InMemory: async () => [],
      compressImageNative: async () => null,
      generateBlurPreview: async () => null,
      encryptFileStream: async () => false,
      decryptFileStream: async () => false,
    };
  }

  public async pickFile(extensions?: string[]): Promise<string[] | null> {
    return new Promise<string[] | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;

      if (extensions && extensions.length > 0) {
        input.accept = extensions
          .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
          .join(',');
      }

      let settled = false;

      const finish = (result: string[] | null) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onFocus);
        input.remove();
        resolve(result);
      };

      input.onchange = () => {
        if (!input.files || input.files.length === 0) {
          finish(null);
          return;
        }

        const virtualPaths: string[] = [];
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          const virtualPath = `browser_file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${file.name}`;
          this.setFile(virtualPath, file);
          virtualPaths.push(virtualPath);
        }

        finish(virtualPaths);
      };

      const onFocus = () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            finish(null);
          }
        }, 500);
      };

      window.addEventListener('focus', onFocus, { once: true });
      input.click();
    });
  }

  public async readFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer | null> {
    if (!filePath) return null;
    let blob: Blob | undefined;
    if (this.fileStore.has(filePath)) {
      blob = this.fileStore.get(filePath);
    } else if (filePath.startsWith('blob:') || filePath.startsWith('data:')) {
      try {
        const res = await fetch(filePath);
        blob = await res.blob();
      } catch {
        return null;
      }
    }
    if (!blob) return null;
    return await blob.arrayBuffer();
  }

  public async readFileAsDataURL(filePath: string): Promise<string | null> {
    if (!filePath) return null;
    if (filePath.startsWith('data:')) {
      return filePath;
    }

    let blob: Blob | undefined;
    if (this.fileStore.has(filePath)) {
      blob = this.fileStore.get(filePath);
    } else if (filePath.startsWith('blob:')) {
      try {
        const res = await fetch(filePath);
        blob = await res.blob();
      } catch {
        return null;
      }
    }

    if (!blob) return null;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file as data URL'));
      reader.readAsDataURL(blob);
    });
  }

  public async getFileSize(filePath: string): Promise<number> {
    const item = this.fileStore.get(filePath);
    if (item) return item.size;
    if (filePath.startsWith('data:')) {
      const base64 = filePath.split(',')[1] || '';
      return Math.floor((base64.length * 3) / 4);
    }
    return 0;
  }

  public async writeTempFile(data: any, extension?: string): Promise<string | null> {
    try {
      let bytes: Uint8Array;
      if (data instanceof Uint8Array) {
        bytes = data;
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else if (typeof data === 'string') {
        const clean = data.includes(',') ? data.split(',')[1] : data;
        const binaryString = atob(clean);
        bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
      } else {
        return null;
      }

      let mime = 'application/octet-stream';
      if (extension === 'png') mime = 'image/png';
      else if (extension === 'jpg' || extension === 'jpeg') mime = 'image/jpeg';
      else if (extension === 'ogg') mime = 'audio/ogg';
      else if (extension === 'webm') mime = 'audio/webm';
      else if (extension === 'm4a' || extension === 'mp4') mime = 'audio/mp4';

      const blob = new Blob([bytes], { type: mime });
      const virtualPath = `browser_file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${extension ? '.' + extension : ''}`;
      
      this.setFile(virtualPath, blob);
      return virtualPath;
    } catch {
      return null;
    }
  }

  public async deleteTempFile(filePath: string): Promise<void> {
    this.fileStore.delete(filePath);
  }

  public async readClipboardImage(): Promise<string | null> {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        }
      }
    } catch (e) {
      console.warn('[BrowserAdapter] Clipboard image read not supported or permission denied:', e);
    }
    return null;
  }

  public onUploadProgress(callback: UploadProgressCallback): () => void {
    this.progressListeners.add(callback);
    return () => {
      this.progressListeners.delete(callback);
    };
  }

  private notifyProgress(publicId: string, uploadedBytes: number, totalBytes: number) {
    this.progressListeners.forEach((cb) => {
      try {
        cb({ publicId, uploadedBytes, totalBytes });
      } catch (err) {
        console.error('[BrowserAdapter] Error in progress listener:', err);
      }
    });
  }

  public async uploadToCloudinary(
    filePath: string,
    publicId: string
  ): Promise<{ success: boolean; secure_url: string; error?: string; bytes?: number }> {
    try {
      let fileBlob: Blob | undefined;

      if (this.fileStore.has(filePath)) {
        fileBlob = this.fileStore.get(filePath)!;
      } else if (filePath.startsWith('blob:') || filePath.startsWith('data:')) {
        const res = await fetch(filePath);
        fileBlob = await res.blob();
      }

      if (!fileBlob) {
        return { success: false, secure_url: '', error: 'File data not found in browser store' };
      }


      const signResp = await fetch(`${WORKER_URL}/cloudinary/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId }),
      });

      if (!signResp.ok) {
        throw new Error(`Worker signing failed: ${signResp.statusText}`);
      }

      const signed = await signResp.json();
      const uploadUrl = signed.uploadUrl || `https://api.cloudinary.com/v1_1/${signed.cloudName}/auto/upload`;

      const formData = new FormData();
      formData.append('file', fileBlob, publicId);
      formData.append('public_id', publicId);
      formData.append('timestamp', String(signed.timestamp));
      formData.append('api_key', signed.apiKey);
      formData.append('signature', signed.signature);


      const result = await new Promise<{ success: boolean; secure_url: string; bytes?: number; error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        this.activeUploadXhrs.set(publicId, xhr);
        xhr.open('POST', uploadUrl);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            this.notifyProgress(publicId, e.loaded, e.total);
          }
        };

        xhr.onload = () => {
          this.activeUploadXhrs.delete(publicId);
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status === 200 && data.secure_url) {
              if (fileBlob) {
                this.notifyProgress(publicId, fileBlob.size, fileBlob.size);
              }
              resolve({ success: true, secure_url: data.secure_url, bytes: data.bytes });
            } else {
              resolve({ success: false, secure_url: '', error: data.error?.message || `HTTP ${xhr.status}` });
            }
          } catch (parseErr: any) {
            resolve({ success: false, secure_url: '', error: parseErr?.message || 'JSON parse error' });
          }
        };

        xhr.onerror = () => {
          this.activeUploadXhrs.delete(publicId);
          resolve({ success: false, secure_url: '', error: 'Network error during upload' });
        };

        xhr.onabort = () => {
          this.activeUploadXhrs.delete(publicId);
          resolve({ success: false, secure_url: '', error: 'Upload cancelled by user' });
        };

        xhr.send(formData);
      });

      return result;
    } catch (err: any) {
      console.error('[BrowserAdapter] Cloudinary upload error:', err);
      return { success: false, secure_url: '', error: err?.message || String(err) };
    }
  }

  public async getAudioMetadata(filePath: string): Promise<BrowserAudioMetadata> {
    const fileName = filePath.split(/[\\/]/).pop()?.replace(/^browser_file_\d+_[a-z0-9]+_/, '') || 'audio';
    const cleanTitle = fileName.replace(/\.[^.]+$/, '');

    try {
      const dataUrl = await this.readFileAsDataURL(filePath);
      if (!dataUrl) {
        return { title: cleanTitle, artist: '', duration: 0, size: 0, cover: null };
      }

      const size = await this.getFileSize(filePath);

      const duration = await new Promise<number>((resolve) => {
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => resolve(audio.duration || 0);
        audio.onerror = () => resolve(0);
        audio.src = dataUrl;
      });

      return {
        title: cleanTitle,
        artist: '',
        duration: Math.round(duration),
        size,
        cover: null,
      };
    } catch (err) {
      console.warn('[BrowserAdapter] Failed to get audio metadata:', err);
      return { title: cleanTitle, artist: '', duration: 0, size: 0, cover: null };
    }
  }

  public async downloadsSave(dataBase64: string, fileName: string): Promise<{ path: string }> {
    const a = document.createElement('a');
    a.href = dataBase64.startsWith('data:') ? dataBase64 : `data:application/octet-stream;base64,${dataBase64}`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
    return { path: fileName };
  }

  public async saveFileAs(dataBase64: string, fileName: string): Promise<{ success?: boolean; canceled?: boolean; path?: string }> {
    const a = document.createElement('a');
    a.href = dataBase64.startsWith('data:') ? dataBase64 : `data:application/octet-stream;base64,${dataBase64}`;
    a.download = fileName || 'file';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
    return { success: true, path: fileName };
  }

  public async copyImage(dataBase64: string): Promise<{ success: boolean }> {
    try {
      const cleanBase64 = dataBase64.replace(/^data:image\/\w+;base64,/, '');
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  public async openFile(dataBase64: string, fileName: string): Promise<{ success: boolean; path?: string }> {
    try {
      const cleanBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray]);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      return { success: true, path: fileName };
    } catch {
      return { success: false };
    }
  }

  private openChatListeners: ((chatId: string) => void)[] = [];

  public onOpenChat(callback: (chatId: string) => void) {
    this.openChatListeners.push(callback);
    return () => {
      this.openChatListeners = this.openChatListeners.filter(cb => cb !== callback);
    };
  }

  public showCustomNotification(payload: { title: string; body: string; avatarUrl?: string; chatId?: string }) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(payload.title, {
          body: payload.body,
          icon: payload.avatarUrl || '/icon.png',
        });
        notif.onclick = () => {
          window.focus();
          if (payload.chatId) {
            this.openChatListeners.forEach(cb => cb(payload.chatId!));
          }
        };
      } catch {}
    }
  }

  public async prepareVideoForUpload(
    filePath: string
  ): Promise<{ preparedPath: string; transcoded: boolean; mime: string }> {
    let fileBlob: Blob | undefined;
    if (this.fileStore.has(filePath)) {
      fileBlob = this.fileStore.get(filePath)!;
    } else if (filePath.startsWith('blob:') || filePath.startsWith('data:')) {
      const res = await fetch(filePath);
      fileBlob = await res.blob();
    }

    if (!fileBlob || fileBlob.size <= 9.2 * 1024 * 1024) {
      return { preparedPath: filePath, transcoded: false, mime: fileBlob?.type || 'video/mp4' };
    }

    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      const objectUrl = URL.createObjectURL(fileBlob);
      video.src = objectUrl;

      let settled = false;
      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        video.remove();
      };

      const fallback = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ preparedPath: filePath, transcoded: false, mime: 'video/mp4' });
      };

      video.onerror = fallback;
      video.onloadedmetadata = () => {
        try {
          const duration = video.duration || 30;
          const targetBits = 7.8 * 8 * 1024 * 1024;
          const targetBps = Math.max(250000, Math.min(2200000, Math.floor(targetBits / duration)));

          const canvas = document.createElement('canvas');
          const maxDim = 720;
          const scale = Math.min(1, maxDim / Math.max(video.videoWidth || 1280, video.videoHeight || 720));
          canvas.width = Math.max(2, Math.floor(((video.videoWidth || 640) * scale) / 2) * 2);
          canvas.height = Math.max(2, Math.floor(((video.videoHeight || 360) * scale) / 2) * 2);
          const ctx = canvas.getContext('2d');
          if (!ctx || typeof (canvas as any).captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
            fallback();
            return;
          }

          const stream = (canvas as any).captureStream(30);
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : 'video/webm';

          const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: targetBps,
          });

          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };

          recorder.onstop = () => {
            if (settled) return;
            settled = true;
            cleanup();
            const compressedBlob = new Blob(chunks, { type: mimeType });
            if (compressedBlob.size > 0 && compressedBlob.size < fileBlob.size) {
              const newPath = `browser_file_${Date.now()}_compressed.webm`;
              this.setFile(newPath, compressedBlob);
              resolve({ preparedPath: newPath, transcoded: true, mime: mimeType });
            } else {
              resolve({ preparedPath: filePath, transcoded: false, mime: 'video/mp4' });
            }
          };

          let drawAnimId: number;
          const drawFrame = () => {
            if (video.paused || video.ended) return;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            drawAnimId = requestAnimationFrame(drawFrame);
          };

          video.onended = () => {
            cancelAnimationFrame(drawAnimId);
            setTimeout(() => {
              if (recorder.state === 'recording') recorder.stop();
            }, 100);
          };

          recorder.start(200);
          video.play().then(() => {
            drawFrame();
          }).catch(fallback);
        } catch {
          fallback();
        }
      };
    });
  }
}

export const browserOrbitaAdapter = new BrowserOrbitaAdapter();
browserOrbitaAdapter.init();
