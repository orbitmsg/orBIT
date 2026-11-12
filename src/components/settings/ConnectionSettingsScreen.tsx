import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  RotateCw,
  MoreVertical,
  Trash2,
  Edit2,
  Copy,
  Check,
  Shield,
  ShieldAlert,
  Phone,
  Radio,
  Globe,
  ListPlus,
  AlertTriangle,
} from 'lucide-react';
import { useConnectionStore, type ProxyProfile } from '../../store/useConnectionStore';
import { parseProxyList, formatProxyUri } from '../../lib/proxyParser';
import { ProxyEditModal } from './ProxyEditModal';
import { PillToggle } from '../common/PillToggle';

interface ConnectionSettingsScreenProps {
  onBack?: () => void;
}

export const ConnectionSettingsScreen: React.FC<ConnectionSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const {
    proxyEnabled,
    activeProxyId,
    proxies,
    killSwitch,
    proxyCalls,
    autoFallback,
    isApplying,
    connectionStatus,
    errorMessage,
    setProxyEnabled,
    setActiveProxy,
    deleteProxy,
    setKillSwitch,
    setProxyCalls,
    setAutoFallback,
    checkAllPings,
    checkPing,
    addProxiesBulk,
    verifyActiveProxy,
    clearError,
  } = useConnectionStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<ProxyProfile | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isRefreshingPings, setIsRefreshingPings] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isVerifyingIp, setIsVerifyingIp] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isImportingBulk, setIsImportingBulk] = useState(false);

  useEffect(() => {
    checkAllPings();
  }, []);

  const parsedBulk = useMemo(() => parseProxyList(bulkText), [bulkText]);
  const activeProxy = proxies.find((p) => p.id === activeProxyId);
  const isKillSwitchIsolating = proxyEnabled && killSwitch && connectionStatus === 'error';

  const handleRefreshPings = async () => {
    setIsRefreshingPings(true);
    await checkAllPings();
    setIsRefreshingPings(false);
  };

  const handleVerifyIp = async () => {
    if (!activeProxy || isVerifyingIp) return;
    setIsVerifyingIp(true);
    setVerifyError(null);
    const res = await verifyActiveProxy();
    if (!res?.success && res?.error) {
      setVerifyError(res.error);
    }
    setIsVerifyingIp(false);
  };

  const handleBulkImport = async () => {
    if (parsedBulk.length === 0 || isImportingBulk) return;
    setIsImportingBulk(true);
    await addProxiesBulk(parsedBulk);
    setBulkText('');
    setBulkOpen(false);
    setIsImportingBulk(false);
  };

  const handleCopyLink = (proxy: ProxyProfile) => {
    const link = formatProxyUri(proxy);
    navigator.clipboard.writeText(link);
    setCopiedId(proxy.id);
    setTimeout(() => setCopiedId(null), 2000);
    setActiveMenuId(null);
  };

  const getStatusBadgeStyle = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          label: t('proxy.status_connected'),
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.14)',
        };
      case 'connecting':
        return {
          label: t('proxy.status_connecting'),
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.14)',
        };
      case 'error':
        return {
          label: t('proxy.status_error'),
          color: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.14)',
        };
      default:
        return {
          label: t('proxy.status_disconnected'),
          color: 'var(--text-dim)',
          bg: 'rgba(255, 255, 255, 0.08)',
        };
    }
  };

  const statusMeta = getStatusBadgeStyle();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{
        padding: '0 10px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        color: 'var(--text-main)',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.04))',
          borderRadius: '18px',
          border: 'none',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                {t('proxy.use_proxy')}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  color: statusMeta.color,
                  backgroundColor: statusMeta.bg,
                }}
              >
                {statusMeta.label}
              </span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
              {proxyEnabled
                ? activeProxy
                  ? connectionStatus === 'connecting' || isApplying
                    ? t('proxy.connecting')
                    : t('proxy.connected', { name: activeProxy.name })
                  : t('proxy.connecting')
                : t('proxy.direct')}
            </div>
          </div>

          <PillToggle
            checked={proxyEnabled}
            disabled={isApplying}
            onChange={() => setProxyEnabled(!proxyEnabled)}
          />
        </div>

        {activeProxy && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '10px 12px',
              borderRadius: '14px',
              border: 'none',
              backgroundColor: 'var(--surface-container-soft, rgba(255, 255, 255, 0.04))',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: 'var(--accent-glow-light, rgba(88, 101, 242, 0.16))',
                  color: 'var(--accent-color, #9b7dd4)',
                  letterSpacing: '0.3px',
                }}
              >
                {activeProxy.type.toUpperCase()}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                {activeProxy.host}:{activeProxy.port}
              </span>
              {activeProxy.ping !== null && activeProxy.ping !== undefined && (
                <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 500 }}>
                  {activeProxy.ping} ms
                </span>
              )}
              {activeProxy.exitIp && (
                <span style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 500 }}>
                  • {t('proxy.exit_ip', { ip: activeProxy.exitIp })}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleVerifyIp}
              disabled={isVerifyingIp}
              aria-label={t('proxy.verify_ip')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '14px',
                border: 'none',
                backgroundColor: 'var(--surface-muted, var(--surface-container-high, rgba(255,255,255,0.06)))',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
                color: 'var(--text-main)',
                fontSize: '11.5px',
                fontWeight: 500,
                cursor: isVerifyingIp ? 'default' : 'pointer',
                opacity: isVerifyingIp ? 0.7 : 1,
                flexShrink: 0,
              }}
            >
              <Globe size={13} className={isVerifyingIp ? 'animate-spin' : ''} />
              <span>{isVerifyingIp ? t('proxy.verifying_ip') : t('proxy.verify_ip')}</span>
            </button>
          </div>
        )}

        {verifyError && (
          <div style={{ fontSize: '11.5px', color: '#ef4444' }}>
            {verifyError}
          </div>
        )}

        {(isKillSwitchIsolating || errorMessage) && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px 14px',
              borderRadius: '14px',
              backgroundColor: 'rgba(239, 68, 68, 0.14)',
              border: 'none',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.12)',
              color: '#fca5a5',
              fontSize: '12px',
              lineHeight: 1.4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              {isKillSwitchIsolating ? (
                <ShieldAlert size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }} />
              ) : (
                <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {isKillSwitchIsolating && (
                  <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: errorMessage ? '2px' : 0 }}>
                    {t('proxy.kill_switch_isolated')}
                  </div>
                )}
                {errorMessage && (
                  <div style={{ wordBreak: 'break-word' }}>
                    {errorMessage}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
              {activeProxy && (
                <button
                  type="button"
                  onClick={() => setActiveProxy(activeProxy.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '14px',
                    border: 'none',
                    backgroundColor: 'rgba(239, 68, 68, 0.22)',
                    color: '#fff',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {t('proxy.retry')}
                </button>
              )}
              {errorMessage && (
                <button
                  type="button"
                  onClick={clearError}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '14px',
                    border: 'none',
                    background: 'none',
                    color: '#fca5a5',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                  }}
                >
                  {t('proxy.dismiss')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--md-on-surface-var, #9f96b3)' }}>
            {t('proxy.saved_proxies')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setBulkOpen((prev) => !prev)}
              aria-label={t('proxy.bulk_import')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-color, #9b7dd4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                padding: '2px 4px',
              }}
            >
              <ListPlus size={14} />
              <span>{t('proxy.bulk_import')}</span>
            </button>

            <button
              type="button"
              onClick={handleRefreshPings}
              disabled={isRefreshingPings}
              aria-label={t('proxy.refresh_ping')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-color, #9b7dd4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                padding: '2px 4px',
              }}
            >
              <RotateCw size={13} className={isRefreshingPings ? 'animate-spin' : ''} />
              <span>{t('proxy.refresh')}</span>
            </button>
          </div>
        </div>

        {bulkOpen && (
          <div
            style={{
              backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.04))',
              borderRadius: '18px',
              border: 'none',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.4 }}>
              {t('proxy.bulk_import_desc')}
            </span>
            <textarea
              aria-label={t('proxy.bulk_import')}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={t('proxy.bulk_import_placeholder')}
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '14px',
                backgroundColor: 'var(--surface-container, rgba(255,255,255,0.04))',
                border: 'none',
                boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.12)',
                color: 'var(--text-main)',
                fontSize: '12.5px',
                fontFamily: 'monospace',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: parsedBulk.length > 0 ? '#10b981' : 'var(--text-dim)' }}>
                {t('proxy.bulk_parsed_count', { count: parsedBulk.length })}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setBulkOpen(false);
                    setBulkText('');
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '14px',
                    backgroundColor: 'var(--surface-muted, var(--surface-container-high, rgba(255,255,255,0.06)))',
                    border: 'none',
                    color: 'var(--text-main)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {t('avatar.cancel')}
                </button>
                <button
                  type="button"
                  disabled={parsedBulk.length === 0 || isImportingBulk}
                  onClick={handleBulkImport}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '14px',
                    backgroundColor: 'var(--accent-color, #9b7dd4)',
                    border: 'none',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: parsedBulk.length === 0 || isImportingBulk ? 'default' : 'pointer',
                    opacity: parsedBulk.length === 0 || isImportingBulk ? 0.5 : 1,
                  }}
                >
                  {t('proxy.bulk_import_btn', { count: parsedBulk.length })}
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.04))',
            borderRadius: '18px',
            border: 'none',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
            padding: '4px 0',
          }}
        >
          {proxies.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-dim)' }}>
              {t('proxy.no_saved_proxies')}
            </div>
          )}

          {proxies.map((proxy) => {
            const isSelected = proxy.id === activeProxyId;
            const hasMenu = activeMenuId === proxy.id;
            const pingLabel =
              proxy.pingStatus === 'testing'
                ? t('proxy.checking')
                : proxy.ping !== null && proxy.ping !== undefined
                ? `${proxy.ping} ms`
                : proxy.pingStatus === 'error'
                ? t('proxy.unavailable')
                : '—';

            return (
              <div
                key={proxy.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  margin: '2px 6px',
                  border: 'none',
                  backgroundColor: isSelected && proxyEnabled ? 'var(--surface-muted, rgba(255, 255, 255, 0.06))' : 'transparent',
                  cursor: 'pointer',
                  position: 'relative',
                  boxSizing: 'border-box',
                }}
                onClick={() => {
                  setActiveProxy(proxy.id);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: isSelected && proxyEnabled
                        ? '5px solid var(--accent-color, #9b7dd4)'
                        : isSelected
                        ? '2px solid var(--accent-color, #9b7dd4)'
                        : '2px solid rgba(255, 255, 255, 0.3)',
                      boxSizing: 'border-box',
                      flexShrink: 0,
                      transition: 'border 0.15s ease',
                    }}
                  />

                  <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <span
                        style={{
                          fontSize: '13.5px',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: 'var(--text-main)',
                        }}
                      >
                        {proxy.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: '999px',
                          backgroundColor: 'var(--accent-glow-light, rgba(88, 101, 242, 0.16))',
                          color: 'var(--accent-color, #9b7dd4)',
                          flexShrink: 0,
                          letterSpacing: '0.3px',
                        }}
                      >
                        {proxy.type.toUpperCase()}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: proxy.pingStatus === 'error' && proxy.lastError ? '#ef4444' : 'var(--text-dim)',
                        display: 'block',
                        marginTop: '2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {proxy.host}:{proxy.port}
                      {proxy.exitIp ? ` • ${proxy.exitIp}` : ''}
                      {proxy.pingStatus === 'error' && proxy.lastError ? ` • ${proxy.lastError}` : ''}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <span
                    aria-label={
                      proxy.pingStatus === 'error' && proxy.lastError
                        ? t('proxy.ping_error_label', { error: proxy.lastError })
                        : pingLabel
                    }
                    style={{
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      color:
                        proxy.pingStatus === 'error'
                          ? '#ef4444'
                          : proxy.ping !== null && proxy.ping !== undefined
                          ? '#10b981'
                          : 'var(--text-dim)',
                    }}
                  >
                    {pingLabel}
                  </span>

                  <button
                    type="button"
                    aria-label={t('common.more_options')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(hasMenu ? null : proxy.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.6)',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>

                {hasMenu && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(null);
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '44px',
                        zIndex: 999,
                        backgroundColor: 'var(--surface-container-high, var(--settings-surface, #2b2d31))',
                        borderRadius: '16px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.36)',
                        border: 'none',
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        minWidth: '160px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          checkPing(proxy.id);
                          setActiveMenuId(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-main)',
                          fontSize: '13px',
                          cursor: 'pointer',
                          borderRadius: '14px',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-muted, var(--surface-container))')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <RotateCw size={14} />
                        <span>{t('proxy.check_ping')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingProxy(proxy);
                          setModalOpen(true);
                          setActiveMenuId(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-main)',
                          fontSize: '13px',
                          cursor: 'pointer',
                          borderRadius: '14px',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-muted, var(--surface-container))')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <Edit2 size={14} />
                        <span>{t('proxy.edit')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyLink(proxy)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-main)',
                          fontSize: '13px',
                          cursor: 'pointer',
                          borderRadius: '14px',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-muted, var(--surface-container))')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {copiedId === proxy.id ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                        <span>{copiedId === proxy.id ? t('proxy.copied') : t('proxy.copy_link')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          deleteProxy(proxy.id);
                          setActiveMenuId(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          fontSize: '13px',
                          cursor: 'pointer',
                          borderRadius: '14px',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <Trash2 size={14} />
                        <span>{t('proxy.delete')}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setEditingProxy(null);
              setModalOpen(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '14px',
              margin: '2px 6px',
              background: 'none',
              border: 'none',
              color: 'var(--accent-color, #9b7dd4)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              boxSizing: 'border-box',
            }}
          >
            <Plus size={16} />
            <span>{t('proxy.add_proxy')}</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--md-on-surface-var, #9f96b3)', padding: '0 8px' }}>
          {t('proxy.security_and_calls')}
        </span>

        <div
          style={{
            backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.04))',
            borderRadius: '18px',
            border: 'none',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingRight: '12px' }}>
              {isKillSwitchIsolating ? (
                <ShieldAlert size={18} style={{ marginTop: '2px', color: '#ef4444', flexShrink: 0 }} />
              ) : (
                <Shield size={18} style={{ marginTop: '2px', color: killSwitch ? 'var(--accent-color, #9b7dd4)' : 'var(--text-main)', flexShrink: 0 }} />
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-main)' }}>
                    {t('proxy.kill_switch_title')}
                  </span>
                  {killSwitch && (
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 600,
                        padding: '1px 7px',
                        borderRadius: '999px',
                        color: isKillSwitchIsolating ? '#ef4444' : '#f59e0b',
                        backgroundColor: isKillSwitchIsolating
                          ? 'rgba(239, 68, 68, 0.16)'
                          : 'rgba(245, 158, 11, 0.14)',
                      }}
                    >
                      {isKillSwitchIsolating ? t('proxy.kill_switch_blocking') : t('proxy.kill_switch_armed')}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '2px', display: 'block', lineHeight: 1.35 }}>
                  {t('proxy.kill_switch')}
                </span>
              </div>
            </div>

            <PillToggle checked={killSwitch} onChange={() => setKillSwitch(!killSwitch)} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingRight: '12px' }}>
              <Phone size={18} style={{ marginTop: '2px', color: 'var(--text-main)', flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 500, display: 'block', color: 'var(--text-main)' }}>
                  {t('proxy.proxy_calls')}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '2px', display: 'block', lineHeight: 1.35 }}>
                  {t('proxy.proxy_calls_desc')}
                </span>
              </div>
            </div>

            <PillToggle checked={proxyCalls} onChange={() => setProxyCalls(!proxyCalls)} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingRight: '12px' }}>
              <Radio size={18} style={{ marginTop: '2px', color: 'var(--text-main)', flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '13.5px', fontWeight: 500, display: 'block', color: 'var(--text-main)' }}>
                  {t('proxy.auto_fallback')}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '2px', display: 'block', lineHeight: 1.35 }}>
                  {t('proxy.auto_fallback_desc')}
                </span>
              </div>
            </div>

            <PillToggle checked={autoFallback} onChange={() => setAutoFallback(!autoFallback)} />
          </div>
        </div>
      </div>

      <ProxyEditModal
        isOpen={modalOpen}
        proxyToEdit={editingProxy}
        onClose={() => {
          setModalOpen(false);
          setEditingProxy(null);
        }}
        onSaved={(id) => {
          setActiveProxy(id);
        }}
      />
    </motion.div>
  );
};
