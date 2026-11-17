import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Bluetooth, Check, AlertCircle, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';

interface QuickEntryProps {
  onStatusChange?: (active: boolean) => void;
}

export const QuickEntry = ({ onStatusChange }: QuickEntryProps) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<{ running: boolean; url: string | null; ip: string | null; port: number | null }>({
    running: false,
    url: null,
    ip: null,
    port: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateQR = useCallback(async (url: string) => {
    if (canvasRef.current) {
      try {
        await QRCode.toCanvas(canvasRef.current, url, {
          width: 180,
          margin: 2,
          color: {
            dark: '#0D0B14',
            light: '#ffffff'
          }
        });
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const logoSize = 36;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(90, 90, logoSize/2 + 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#5D3FD3';
          ctx.beginPath();
          ctx.arc(90, 90, logoSize/2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(90, 90, logoSize/2 - 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#FFD700';
          ctx.beginPath();
          ctx.arc(70, 70, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } catch (err) {
        console.error('QR generation failed:', err);
      }
    }
  }, []);

  const startServer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).orbita.startSyncServer();
      setStatus({
        running: true,
        url: result.url,
        ip: result.url ? result.url.split('/')[2].split(':')[0] : null,
        port: result.port,
      });
      onStatusChange?.(true);
    } catch (err) {
      setError(t('quickEntry.server_error'));
      console.error('Failed to start sync server:', err);
    } finally {
      setLoading(false);
    }
  }, [t, onStatusChange]);

  const stopServer = useCallback(async () => {
    setLoading(true);
    try {
      await (window as any).orbita.stopSyncServer();
      setStatus({ running: false, url: null, ip: null, port: null });
      onStatusChange?.(false);
    } catch (err) {
      console.error('Failed to stop sync server:', err);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  const refreshQR = useCallback(async () => {
    if (status.running) {
      await stopServer();
      setTimeout(() => startServer(), 300);
    } else {
      startServer();
    }
  }, [status.running, startServer, stopServer]);

  useEffect(() => {
    const init = async () => {
      try {
        const url = await (window as any).orbita.getSyncServerUrl();
        if (url) {
          const ip = url.split('/')[2].split(':')[0];
          const port = parseInt(url.split(':')[2].split('/')[0]);
          setStatus({ running: true, url, ip, port });
          onStatusChange?.(true);
        } else {
          startServer();
        }
      } catch {
        startServer();
      }
    };
    init();
    return () => {
      stopServer();
    };
  }, [startServer, stopServer, onStatusChange]);

  useEffect(() => {
    if (status.running && status.url) {
      generateQR(status.url);
    }
  }, [status.running, status.url, generateQR]);

  const handleCopy = useCallback(async () => {
    if (status.url) {
      try {
        await navigator.clipboard.writeText(status.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    }
  }, [status.url]);

  const toggleServer = useCallback(() => {
    if (status.running) {
      stopServer();
    } else {
      startServer();
    }
  }, [status.running, startServer, stopServer]);

  return (
    <div
      style={{
        backgroundColor: 'var(--surface-container)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        padding: '20px 24px',
        width: '100%',
        maxWidth: '480px',
        transition: 'all 0.3s ease',
        marginTop: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-main)',
              margin: 0,
              letterSpacing: '0.02em',
            }}
          >
            {t('quickEntry.title')}
          </h3>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-dim)',
              margin: '4px 0 0',
            }}
          >
            {t('quickEntry.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AnimatePresence>
            {status.running && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '999px',
                  backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent-color) 28%, transparent)',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--accent-text, var(--accent-color))',
                }}
              >
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-color)',
                    boxShadow: '0 0 8px color-mix(in srgb, var(--accent-color) 50%, transparent)',
                    animation: 'pulse-dot 1.5s ease-in-out infinite',
                  }}
                />
                {t('quickEntry.active')}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          gap: '16px',
        }}
      >
        {loading && !status.running ? (
          <div
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '10px',
              backgroundColor: 'var(--surface-container-strong)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Loader size={36} className="animate-spin" style={{ color: 'var(--accent-color)' }} />
          </div>
        ) : status.running && status.url ? (
          <div
            style={{
              position: 'relative',
              padding: '12px',
              borderRadius: '10px',
              backgroundColor: '#ffffff',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
            }}
          >
            <canvas ref={canvasRef} width={180} height={180} style={{ width: '180px', height: '180px', display: 'block' }} />
          </div>
        ) : (
          <div
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '10px',
              border: '2px dashed var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-dim)',
              fontSize: '13px',
              textAlign: 'center',
              padding: '16px',
            }}
          >
            {t('quickEntry.server_stopped')}
          </div>
        )}

        {status.running && status.ip && status.port && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--text-dim)',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{t('quickEntry.server_info', { ip: status.ip, port: status.port })}</span>
              <button
                onClick={handleCopy}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-dim)',
                  padding: '2px',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-text, var(--accent-color))')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
              >
                {copied ? <Check size={14} style={{ color: '#22c55e' }} /> : <span style={{ fontSize: '10px' }}>📋</span>}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              padding: '6px 12px',
              borderRadius: '8px',
            }}
          >
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          marginTop: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: 'var(--text-dim)',
            padding: '8px 12px',
            backgroundColor: 'var(--surface-container-strong)',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
          }}
        >
          <Bluetooth size={16} style={{ color: 'var(--accent-text, #d97706)' }} />
          <span>{t('quickEntry.bluetooth_info')}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            onClick={refreshQR}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              flex: 1,
              padding: '10px 16px',
              borderRadius: '10px',
              backgroundColor: 'var(--surface-container-strong)',
              border: '1px solid var(--border-color)',
              color: 'var(--accent-text, var(--accent-color))',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)';
            }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {t('quickEntry.refresh_qr')}
          </button>

          <button
            onClick={toggleServer}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '10px 16px',
              borderRadius: '10px',
              backgroundColor: status.running ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent-color)',
              border: status.running
                ? '1px solid rgba(239, 68, 68, 0.35)'
                : '1px solid transparent',
              color: status.running ? '#ef4444' : 'var(--accent-on-color, #ffffff)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {status.running ? t('quickEntry.stop') : t('quickEntry.start')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};