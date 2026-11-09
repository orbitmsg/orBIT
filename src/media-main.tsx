import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { TelegramMediaViewer, MediaViewerItem } from './components/chat/TelegramMediaViewer';
import { TitleBar } from './components/layout/TitleBar';
import { useChatStore, FONT_MAP, FontFamily } from './store/useChatStore';
import { useAuthStore } from './store/useAuthStore';
import { sqliteStorage } from './services/sqliteStorage';
import './App.css';
import './i18n';

export const MediaWindowView: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [payload, setPayload] = useState<{
    items: MediaViewerItem[];
    initialIndex?: number;
    sharedSecret?: string;
    chatId?: string;
    usersById?: Record<string, any>;
    myUserId?: string;
    myNickname?: string;
  } | null>(null);

  useEffect(() => {
    const orbita = (window as any).orbita;

    const applyVars = (vars: Record<string, string>) => {
      Object.entries(vars).forEach(([k, v]) => {
        document.documentElement.style.setProperty(k, String(v));
      });
    };

    const applyFont = (fontKey: string) => {
      const fontVal = FONT_MAP[fontKey as FontFamily] || fontKey || FONT_MAP['system'];
      document.documentElement.style.setProperty('--main-font', fontVal);
      document.body.style.fontFamily = fontVal;
    };

    sqliteStorage.getJson<Record<string, string> | null>('orbita_theme_vars', null).then((savedThemeVars) => {
      if (savedThemeVars) {
        applyVars(savedThemeVars);
      }
    }).catch(() => {});

    sqliteStorage.get('orbita_font_family').then((savedFont) => {
      if (savedFont) {
        applyFont(savedFont);
      }
    }).catch(() => {});

    if (orbita?.getCurrentFont) {
      orbita.getCurrentFont().then((font: string) => {
        if (font) applyFont(font);
      });
    }

    const unsubTheme = orbita?.onThemeChanged?.((data: any) => {
      if (data?.themeVars) {
        applyVars(data.themeVars);
      }
    });

    const unsubFont = orbita?.onFontChanged?.((font: string) => {
      if (font) {
        applyFont(font);
      }
    });

    const syncUsers = (users?: Record<string, any>, myUid?: string, myNick?: string) => {
      if (users && Object.keys(users).length > 0) {
        useChatStore.setState((state) => ({
          usersById: {
            ...state.usersById,
            ...users,
          },
        }));
      }
      if (myUid || myNick) {
        useAuthStore.setState((state) => ({
          userId: myUid || state.userId,
          nickname: myNick || state.nickname,
        }));
      }
    };

    useChatStore.persist?.rehydrate?.();
    useAuthStore.persist?.rehydrate?.();

    if (orbita?.getMediaPayload) {
      orbita.getMediaPayload().then((p: any) => {
        console.log('[MediaWindow] getMediaPayload resolved:', {
          hasPayload: Boolean(p),
          itemsCount: p?.items?.length,
          initialIndex: p?.initialIndex,
          chatId: p?.chatId,
          sharedSecret: Boolean(p?.sharedSecret),
          items: p?.items?.map((it: any) => ({ id: it.id, type: it.type, url: it.url, directUrl: it.directUrl })),
        });
        if (p) {
          syncUsers(p.usersById, p.myUserId, p.myNickname);
          setPayload(p);
        }
      });
    }

    let unsubPayload: (() => void) | undefined;
    if (orbita?.onMediaPayload) {
      unsubPayload = orbita.onMediaPayload((newPayload: any) => {
        console.log('[MediaWindow] onMediaPayload received:', {
          hasPayload: Boolean(newPayload),
          itemsCount: newPayload?.items?.length,
          initialIndex: newPayload?.initialIndex,
          items: newPayload?.items?.map((it: any) => ({ id: it.id, type: it.type, url: it.url })),
        });
        if (newPayload) {
          syncUsers(newPayload.usersById, newPayload.myUserId, newPayload.myNickname);
          const root = document.getElementById('root');
          if (root) root.style.display = '';
          const viewerEl = document.getElementById('telegram-media-viewer-root');
          if (viewerEl) viewerEl.style.display = 'flex';
        }
        setPayload(newPayload || null);
      });
    }

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('orbita-media-channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'SET_MEDIA_PAYLOAD') {
          if (event.data.payload) {
            syncUsers(event.data.payload.usersById, event.data.payload.myUserId, event.data.payload.myNickname);
            const root = document.getElementById('root');
            if (root) root.style.display = '';
            const viewerEl = document.getElementById('telegram-media-viewer-root');
            if (viewerEl) viewerEl.style.display = 'flex';
          }
          setPayload(event.data.payload || null);
        } else if (event.data?.type === 'SYNC_USERS') {
          syncUsers(event.data.usersById, event.data.myUserId, event.data.myNickname);
        }
      };
      bc.postMessage({ type: 'REQUEST_MEDIA_PAYLOAD' });
    } catch {}

    if (orbita?.isWindowMaximized) {
      orbita.isWindowMaximized().then((max: boolean) => setIsMaximized(Boolean(max))).catch(() => {});
    }
    const unsubMax = orbita?.onWindowStateChange?.((max: boolean) => {
      setIsMaximized(Boolean(max));
    });

    return () => {
      unsubTheme?.();
      unsubFont?.();
      unsubPayload?.();
      unsubMax?.();
      bc?.close();
    };
  }, []);

  const handleClose = () => {
    const root = document.getElementById('root');
    if (root) root.style.display = 'none';
    const orbita = (window as any).orbita;
    if (orbita?.closeMediaWindow) {
      orbita.closeMediaWindow();
    } else {
      window.close();
    }
    setPayload(null);
  };

  const dispatchAction = (action: { type: string; messageId?: string; chatId?: string }) => {
    const orbita = (window as any).orbita;
    if (orbita?.sendMediaAction) {
      orbita.sendMediaAction(action);
    }
    try {
      const bc = new BroadcastChannel('orbita-media-action-channel');
      bc.postMessage(action);
      setTimeout(() => bc.close(), 300);
    } catch {}
    handleClose();
  };

  const handleGoToMessage = (messageId: string) => {
    dispatchAction({ type: 'GOTO_MESSAGE', messageId, chatId: payload?.chatId });
  };

  const handleForwardMessage = (messageId: string) => {
    dispatchAction({ type: 'FORWARD_MESSAGE', messageId, chatId: payload?.chatId });
  };

  const handleDeleteMessage = (messageId: string) => {
    dispatchAction({ type: 'DELETE_MESSAGE', messageId, chatId: payload?.chatId });
  };

  const handleOpenAllMedia = () => {
    dispatchAction({ type: 'OPEN_ALL_MEDIA', chatId: payload?.chatId });
  };

  return (
    <div
      className="w-full h-full min-h-screen relative overflow-hidden select-none flex flex-col box-border"
      style={{
        backgroundColor: 'rgba(33, 37, 41, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: isMaximized ? '0px' : '10px',
        border: isMaximized ? 'none' : '1px solid rgba(255, 255, 255, 0.16)',
        boxShadow: isMaximized ? 'none' : '0 16px 40px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.4)',
        transition: 'border-radius 0.15s ease, border 0.15s ease',
      }}
    >
      <div className="absolute top-0 left-0 right-0 z-50 pointer-events-auto">
        <TitleBar
          onClose={handleClose}
          style={{
            backgroundColor: 'transparent',
            ['--titlebar-fg' as any]: '#ffffff',
          }}
        />
      </div>
      <div className="w-full h-full absolute inset-0 overflow-hidden">
        {payload && payload.items && payload.items.length > 0 ? (
          <TelegramMediaViewer
            key={payload.items[0]?.id || payload.chatId || String(payload.initialIndex || 0)}
            isOpen={true}
            isWindowMode={true}
            items={payload.items}
            initialIndex={payload.initialIndex || 0}
            sharedSecret={payload.sharedSecret}
            onClose={handleClose}
            onGoToMessage={handleGoToMessage}
            onForwardMessage={handleForwardMessage}
            onDeleteMessage={handleDeleteMessage}
            onOpenAllMedia={handleOpenAllMedia}
          />
        ) : null}
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MediaWindowView />
  </React.StrictMode>
);
