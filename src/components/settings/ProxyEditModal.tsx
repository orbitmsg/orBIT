import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useConnectionStore, type ProxyProfile, type ProxyType } from '../../store/useConnectionStore';
import { parseProxyInput } from '../../lib/proxyParser';
import { PillToggle } from '../common/PillToggle';

interface ProxyEditModalProps {
  isOpen: boolean;
  proxyToEdit?: ProxyProfile | null;
  onClose: () => void;
  onSaved: (proxyId: string) => void;
}

const PROTOCOL_OPTIONS: Array<{ id: ProxyType; label: string; defaultPort: string }> = [
  { id: 'socks5', label: 'SOCKS5', defaultPort: '1080' },
  { id: 'socks5h', label: 'SOCKS5h', defaultPort: '1080' },
  { id: 'socks4', label: 'SOCKS4', defaultPort: '1080' },
  { id: 'socks4a', label: 'SOCKS4a', defaultPort: '1080' },
  { id: 'http', label: 'HTTP', defaultPort: '8080' },
  { id: 'https', label: 'HTTPS', defaultPort: '443' },
  { id: 'ss', label: 'SS', defaultPort: '8388' },
  { id: 'trojan', label: 'Trojan', defaultPort: '443' },
];

const SS_CIPHER_METHODS = [
  'aes-256-gcm',
  'aes-128-gcm',
  'chacha20-ietf-poly1305',
] as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '12px',
  backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.05))',
  border: 'none',
  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.08)',
  color: 'var(--text-main)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  color: 'var(--text-dim)',
  marginBottom: '5px',
};

export const ProxyEditModal: React.FC<ProxyEditModalProps> = ({
  isOpen,
  proxyToEdit,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { addProxy, updateProxy } = useConnectionStore();

  const [type, setType] = useState<ProxyType>('socks5');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('1080');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [method, setMethod] = useState('aes-256-gcm');
  const [sni, setSni] = useState('');
  const [allowInsecure, setAllowInsecure] = useState(false);
  const [quickLink, setQuickLink] = useState('');
  const [detectedType, setDetectedType] = useState<ProxyType | null>(null);
  const [quickPasteError, setQuickPasteError] = useState(false);
  const [portManuallyEdited, setPortManuallyEdited] = useState(false);
  const [testResult, setTestResult] = useState<{ ping?: number; error?: string; testing?: boolean } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (proxyToEdit) {
        setType(proxyToEdit.type || 'socks5');
        setName(proxyToEdit.name);
        setHost(proxyToEdit.host);
        setPort(String(proxyToEdit.port));
        setUsername(proxyToEdit.username || '');
        setPassword(proxyToEdit.password || '');
        setMethod(proxyToEdit.method || 'aes-256-gcm');
        setSni(proxyToEdit.sni || '');
        setAllowInsecure(Boolean(proxyToEdit.allowInsecure));
        setPortManuallyEdited(true);
      } else {
        setType('socks5');
        setName('');
        setHost('');
        setPort('1080');
        setUsername('');
        setPassword('');
        setMethod('aes-256-gcm');
        setSni('');
        setAllowInsecure(false);
        setPortManuallyEdited(false);
      }
      setQuickLink('');
      setDetectedType(null);
      setQuickPasteError(false);
      setTestResult(null);
      setErrorMessage(null);
    }
  }, [isOpen, proxyToEdit]);

  if (!isOpen) return null;

  const isSocks4Family = type === 'socks4' || type === 'socks4a';
  const isShadowsocks = type === 'ss';
  const isTrojan = type === 'trojan';
  const showUsername = !isShadowsocks && !isTrojan;
  const showPassword = !isSocks4Family;
  const showTlsFields = isTrojan || type === 'https';

  const handleSelectProtocol = (nextType: ProxyType) => {
    setType(nextType);
    setTestResult(null);
    setErrorMessage(null);
    if (!proxyToEdit && !portManuallyEdited) {
      const option = PROTOCOL_OPTIONS.find((item) => item.id === nextType);
      if (option) {
        setPort(option.defaultPort);
      }
    }
  };

  const handleQuickLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuickLink(val);
    if (!val.trim()) {
      setDetectedType(null);
      setQuickPasteError(false);
      return;
    }

    const parsed = parseProxyInput(val);
    if (parsed) {
      setDetectedType(parsed.type);
      setQuickPasteError(false);
      setType(parsed.type);
      setHost(parsed.host);
      setPort(String(parsed.port));
      setPortManuallyEdited(true);
      setUsername(parsed.username || '');
      setPassword(parsed.password || '');
      setMethod(parsed.method || 'aes-256-gcm');
      setSni(parsed.sni || '');
      setAllowInsecure(Boolean(parsed.allowInsecure));
      if (parsed.name && (!name.trim() || !proxyToEdit)) {
        setName(parsed.name);
      }
      setErrorMessage(null);
      setTestResult(null);
    } else {
      setDetectedType(null);
      setQuickPasteError(true);
    }
  };

  const buildCurrentConfig = (cleanHost: string, cleanPort: number) => ({
    host: cleanHost,
    port: cleanPort,
    type,
    username: showUsername && username.trim() ? username.trim() : undefined,
    password: showPassword && password ? password : undefined,
    method: isShadowsocks ? method : undefined,
    sni: showTlsFields && sni.trim() ? sni.trim() : undefined,
    allowInsecure: showTlsFields && allowInsecure ? true : undefined,
  });

  const handleTestConnection = async () => {
    const cleanHost = host.trim();
    const cleanPort = parseInt(port.trim(), 10);
    if (!cleanHost || isNaN(cleanPort) || cleanPort <= 0 || cleanPort > 65535) {
      setErrorMessage(t('proxy.err_host_port'));
      return;
    }
    if ((isShadowsocks || isTrojan) && !password) {
      setErrorMessage(t('proxy.err_password_required'));
      return;
    }

    setTestResult({ testing: true });
    setErrorMessage(null);

    if (window.orbita?.checkProxyPing) {
      try {
        const res = await window.orbita.checkProxyPing(buildCurrentConfig(cleanHost, cleanPort), 5000);
        if (res?.success && res.ping !== undefined) {
          setTestResult({ ping: res.ping });
        } else {
          setTestResult({ error: res?.error || t('proxy.unavailable') });
        }
      } catch (err: any) {
        setTestResult({ error: err?.message || t('proxy.unavailable') });
      }
    } else {
      setTestResult({ error: t('proxy.unavailable') });
    }
  };

  const handleSave = async () => {
    const cleanHost = host.trim();
    const cleanPort = parseInt(port.trim(), 10);
    if (!cleanHost) {
      setErrorMessage(t('proxy.err_host'));
      return;
    }
    if (isNaN(cleanPort) || cleanPort <= 0 || cleanPort > 65535) {
      setErrorMessage(t('proxy.err_port'));
      return;
    }
    if ((isShadowsocks || isTrojan) && !password) {
      setErrorMessage(t('proxy.err_password_required'));
      return;
    }

    const finalName = name.trim() || `${cleanHost}:${cleanPort}`;
    const config = buildCurrentConfig(cleanHost, cleanPort);

    if (proxyToEdit) {
      await updateProxy(proxyToEdit.id, {
        name: finalName,
        ...config,
      });
      onSaved(proxyToEdit.id);
    } else {
      const newId = await addProxy({
        name: finalName,
        ...config,
      });
      onSaved(newId);
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'var(--settings-surface, var(--bg-secondary))',
          borderRadius: '18px',
          border: 'none',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          animation: 'scaleUp 0.15s ease',
          color: 'var(--text-main)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
            {proxyToEdit ? t('proxy.edit_proxy') : t('proxy.add_proxy')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'none',
              border: 'none',
              borderRadius: '12px',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px', gap: '8px' }}>
            <label htmlFor="proxy-quick-paste" style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {t('proxy.quick_paste')}
            </label>
            {detectedType && (
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  flexShrink: 0,
                }}
              >
                {t('proxy.detected_protocol', { protocol: detectedType.toUpperCase() })}
              </span>
            )}
          </div>
          <input
            id="proxy-quick-paste"
            type="text"
            value={quickLink}
            onChange={handleQuickLinkChange}
            placeholder={t('proxy.quick_paste_placeholder')}
            style={inputStyle}
          />
          {quickPasteError && (
            <span style={{ display: 'block', fontSize: '11.5px', color: '#f59e0b', marginTop: '4px' }}>
              {t('proxy.quick_paste_invalid')}
            </span>
          )}
        </div>

        <div>
          <span style={labelStyle}>{t('proxy.protocol')}</span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '6px',
            }}
          >
            {PROTOCOL_OPTIONS.map((option) => {
              const active = type === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectProtocol(option.id)}
                  style={{
                    padding: '7px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: active
                      ? 'var(--accent-color, #9b7dd4)'
                      : 'var(--surface-container, rgba(255, 255, 255, 0.05))',
                    boxShadow: active ? '0 4px 12px var(--accent-glow, rgba(88, 101, 242, 0.25))' : 'none',
                    color: active ? '#fff' : 'var(--text-main)',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="proxy-name" style={labelStyle}>
            {t('proxy.name')}
          </label>
          <input
            id="proxy-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('proxy.name_placeholder')}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="proxy-host" style={labelStyle}>
              {t('proxy.server_host')}
            </label>
            <input
              id="proxy-host"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder={t('proxy.host_placeholder')}
              style={inputStyle}
            />
          </div>
          <div style={{ width: '92px' }}>
            <label htmlFor="proxy-port" style={labelStyle}>
              {t('proxy.port')}
            </label>
            <input
              id="proxy-port"
              type="text"
              value={port}
              onChange={(e) => {
                setPort(e.target.value);
                setPortManuallyEdited(true);
              }}
              placeholder="1080"
              style={inputStyle}
            />
          </div>
        </div>

        {isShadowsocks && (
          <div>
            <label htmlFor="proxy-ss-method" style={labelStyle}>
              {t('proxy.cipher_method')}
            </label>
            <select
              id="proxy-ss-method"
              aria-label={t('proxy.cipher_method')}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              style={{
                ...inputStyle,
                cursor: 'pointer',
              }}
            >
              {SS_CIPHER_METHODS.map((cipher) => (
                <option key={cipher} value={cipher}>
                  {cipher}
                </option>
              ))}
            </select>
          </div>
        )}

        {(showUsername || showPassword) && (
          <div style={{ display: 'flex', gap: '10px' }}>
            {showUsername && (
              <div style={{ flex: 1 }}>
                <label htmlFor="proxy-username" style={labelStyle}>
                  {isSocks4Family ? t('proxy.user_id_optional') : t('proxy.username_optional')}
                </label>
                <input
                  id="proxy-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('proxy.username_placeholder')}
                  style={inputStyle}
                />
              </div>
            )}
            {showPassword && (
              <div style={{ flex: 1 }}>
                <label htmlFor="proxy-password" style={labelStyle}>
                  {isShadowsocks || isTrojan ? t('proxy.password') : t('proxy.password_optional')}
                </label>
                <input
                  id="proxy-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('proxy.password_placeholder')}
                  style={inputStyle}
                />
              </div>
            )}
          </div>
        )}

        {showTlsFields && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label htmlFor="proxy-sni" style={labelStyle}>
                {t('proxy.sni_optional')}
              </label>
              <input
                id="proxy-sni"
                type="text"
                value={sni}
                onChange={(e) => setSni(e.target.value)}
                placeholder={t('proxy.sni_placeholder')}
                style={inputStyle}
              />
            </div>

            <div
              onClick={() => setAllowInsecure(!allowInsecure)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '12px',
                backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.05))',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-main)' }}>
                  {t('proxy.allow_insecure_tls')}
                </span>
                <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '2px' }}>
                  {t('proxy.allow_insecure_tls_desc')}
                </span>
              </div>
              <PillToggle checked={allowInsecure} onChange={() => setAllowInsecure(!allowInsecure)} />
            </div>
          </div>
        )}

        {errorMessage && (
          <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>
            {errorMessage}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '2px' }}>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testResult?.testing}
            style={{
              background: 'none',
              border: 'none',
              borderRadius: '12px',
              color: 'var(--accent-color, #9b7dd4)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: testResult?.testing ? 'default' : 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {testResult?.testing ? t('proxy.checking') : t('proxy.test_connection')}
          </button>

          {testResult && !testResult.testing && (
            <span
              style={{
                fontSize: '12.5px',
                color: testResult.ping !== undefined ? '#10b981' : '#ef4444',
                textAlign: 'right',
                wordBreak: 'break-word',
              }}
            >
              {testResult.ping !== undefined ? `${testResult.ping} ms` : (testResult.error || t('proxy.unavailable'))}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: '12px',
              background: 'var(--surface-container, rgba(255, 255, 255, 0.05))',
              border: 'none',
              color: 'var(--text-main)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {t('avatar.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              borderRadius: '12px',
              background: 'var(--accent-color, #9b7dd4)',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('avatar.save')}
          </button>
        </div>
      </div>
    </div>
  );
};
