import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { TelegramMediaViewer, MediaViewerItem } from './components/chat/TelegramMediaViewer';
import { TitleBar } from './components/layout/TitleBar';
import { FONT_MAP, FontFamily } from './store/useChatStore';
import './App.css';
import './i18n';

export const MediaWindowView: React.FC = () => {
  const [payload, setPayload] = useState<{
    items: MediaViewerItem[];
    initialIndex?: number;
    sharedSecret?: string;
    chatId?: string;
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

    try {
      const savedThemeVars = localStorage.getItem('orbita_theme_vars');
      if (savedThemeVars) {
        applyVars(JSON.parse(savedThemeVars));
      }
      const savedFont = localStorage.getItem('orbita_font_family');
      if (savedFont) {
        applyFont(savedFont);
      }
    } catch {}

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

    console.log('[MediaWindow] Component mounted, requesting payload...');

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
        if (p) setPayload(p);
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
        setPayload(newPayload || null);
      });
    }

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('orbita-media-channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'SET_MEDIA_PAYLOAD') {
          console.log('[MediaWindow] BroadcastChannel payload received:', event.data.payload?.items?.length);
          setPayload(event.data.payload || null);
        }
      };
      bc.postMessage({ type: 'REQUEST_MEDIA_PAYLOAD' });
    } catch {}

    return () => {
      unsubTheme?.();
      unsubFont?.();
      unsubPayload?.();
      bc?.close();
    };
  }, []);

  const handleClose = () => {
    setPayload(null);
    const orbita = (window as any).orbita;
    if (orbita?.closeMediaWindow) {
      orbita.closeMediaWindow();
    } else {
      window.close();
    }
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

  return (
    <div
      className="w-full h-full min-h-screen relative overflow-hidden select-none"
      style={{ backgroundColor: '#000000' }}
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
        <TelegramMediaViewer
          isOpen={true}
          isWindowMode={true}
          items={payload?.items || []}
          initialIndex={payload?.initialIndex || 0}
          sharedSecret={payload?.sharedSecret}
          onClose={handleClose}
          onGoToMessage={handleGoToMessage}
          onForwardMessage={handleForwardMessage}
          onDeleteMessage={handleDeleteMessage}
        />
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MediaWindowView />
  </React.StrictMode>
);
