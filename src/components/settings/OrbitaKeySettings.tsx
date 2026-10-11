import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Usb, KeyRound, CheckCircle2, Trash2, HardDrive, Download, AlertCircle, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { orbitaKeyService } from '../../services/orbitaKeyService';
import { securityService } from '../../services/securityService';

interface OrbitaKeySettingsProps {
  onBack?: () => void;
}

const MD3 = {
  surface: 'var(--surface-container-low, #1e1e1e)',
  surfaceHigh: 'var(--surface-container-high, #2d2d2d)',
  onSurface: 'var(--text-main, #ffffff)',
  onSurfaceVar: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
  primary: 'var(--accent-color, #7C3AED)',
  outline: 'rgba(255, 255, 255, 0.1)',
  error: '#ef4444',
  success: '#10b981',
};

export const OrbitaKeySettings: React.FC<OrbitaKeySettingsProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const [keyInfo, setKeyInfo] = useState(() => orbitaKeyService.getKeyInfo());
  const [currentPassword, setCurrentPassword] = useState('');
  const [selectedDrivePath, setSelectedDrivePath] = useState('');
  const [detectedDrives, setDetectedDrives] = useState<Array<{ path: string; label: string }>>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isPasswordSet = securityService.isPasswordSet();

  useEffect(() => {
    let isMounted = true;
    const fetchDrives = async () => {
      if (typeof window !== 'undefined' && (window as any).orbita?.getRemovableDrives) {
        try {
          const drives = await (window as any).orbita.getRemovableDrives();
          if (isMounted && Array.isArray(drives) && drives.length > 0) {
            setDetectedDrives(drives);
            setSelectedDrivePath(drives[0].path);
          }
        } catch {}
      }
    };
    fetchDrives();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectDirectory = async () => {
    if (typeof window !== 'undefined' && (window as any).orbita?.selectDirectory) {
      try {
        const dir = await (window as any).orbita.selectDirectory();
        if (dir) {
          setSelectedDrivePath(dir);
        }
      } catch {}
    }
  };

  const handleCreateAndWriteKey = async (downloadOnly = false) => {
    setErrorMsg('');
    setSuccessMsg('');

    if (isPasswordSet) {
      if (!currentPassword) {
        setErrorMsg(t('security.orbita_key_err_wrong_pass'));
        return;
      }
      setIsSubmitting(true);
      const isPassValid = await securityService.verifyPassword(currentPassword);
      setIsSubmitting(false);
      if (!isPassValid) {
        setErrorMsg(t('security.orbita_key_err_wrong_pass'));
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const { payload, jsonString } = await orbitaKeyService.generateKeyData(
        isPasswordSet ? currentPassword : undefined,
        selectedDrivePath || undefined
      );

      const registered = await orbitaKeyService.registerKey(payload, selectedDrivePath || undefined);
      if (!registered) {
        setErrorMsg(t('common.error', 'Ошибка'));
        setIsSubmitting(false);
        return;
      }

      if (downloadOnly) {
        orbitaKeyService.downloadKeyFile(jsonString);
        setSuccessMsg(t('security.orbita_key_success_created'));
        setKeyInfo(orbitaKeyService.getKeyInfo());
        setCurrentPassword('');
      } else if (selectedDrivePath) {
        const ok = await orbitaKeyService.writeKeyToFolder(selectedDrivePath, jsonString);
        if (ok) {
          setSuccessMsg(t('security.orbita_key_success_created'));
          setKeyInfo(orbitaKeyService.getKeyInfo());
          setCurrentPassword('');
        } else {
          orbitaKeyService.downloadKeyFile(jsonString);
          setSuccessMsg(t('security.orbita_key_success_created'));
          setKeyInfo(orbitaKeyService.getKeyInfo());
          setCurrentPassword('');
        }
      } else {
        orbitaKeyService.downloadKeyFile(jsonString);
        setSuccessMsg(t('security.orbita_key_success_created'));
        setKeyInfo(orbitaKeyService.getKeyInfo());
        setCurrentPassword('');
      }
    } catch {
      setErrorMsg(t('common.error', 'Ошибка'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveKey = () => {
    orbitaKeyService.removeKey();
    setKeyInfo(orbitaKeyService.getKeyInfo());
    setSuccessMsg(t('security.orbita_key_success_removed'));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ padding: '0 0 32px' }}
    >
      {onBack && (
        <div
          onClick={onBack}
          className="cursor-pointer flex items-center gap-2 mb-4 px-5 py-2 text-sm transition-opacity opacity-80 hover:opacity-100"
          style={{ color: MD3.onSurface }}
        >
          <ArrowLeft size={18} />
          <span>{t('common.back', 'Назад')}</span>
        </div>
      )}

      <div style={{ marginBottom: 20, padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: 'rgba(124, 58, 237, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: MD3.primary,
            }}
          >
            <Usb size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: MD3.onSurface, margin: 0 }}>
              {t('security.orbita_key_screen_title')}
            </h2>
            <span style={{ fontSize: 12, color: MD3.onSurfaceVar }}>
              {keyInfo.isConfigured ? t('security.orbita_key_status_active') : t('security.orbita_key_status_inactive')}
            </span>
          </div>
        </div>

        <p style={{ fontSize: 13, color: MD3.onSurfaceVar, marginTop: 8, lineHeight: 1.45 }}>
          {t('security.orbita_key_screen_desc')}
        </p>
      </div>

      {keyInfo.isConfigured ? (
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              backgroundColor: MD3.surface,
              borderRadius: 16,
              padding: '18px 20px',
              border: `1px solid ${MD3.outline}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} style={{ color: MD3.success }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>
                  {t('security.orbita_key_status_active')}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: MD3.success,
                  fontWeight: 600,
                }}
              >
                {t('security.orbita_key_active')}
              </span>
            </div>

            {keyInfo.keyId && (
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar }}>
                {t('security.orbita_key_id', { id: keyInfo.keyId })}
              </div>
            )}

            {keyInfo.createdAt && (
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar }}>
                {t('security.orbita_key_created_at', {
                  date: new Date(keyInfo.createdAt).toLocaleString(),
                })}
              </div>
            )}

            {keyInfo.label && (
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar }}>
                {keyInfo.label}
              </div>
            )}
          </div>

          {successMsg && (
            <div style={{ fontSize: 13, color: MD3.success, textAlign: 'center', fontWeight: 500 }}>
              {successMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => handleCreateAndWriteKey(true)}
              disabled={isSubmitting}
              aria-label={t('security.orbita_key_download_btn')}
              style={{
                backgroundColor: MD3.surface,
                color: MD3.onSurface,
                border: `1px solid ${MD3.outline}`,
                borderRadius: 999,
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Download size={16} />
              <span>{t('security.orbita_key_download_btn')}</span>
            </button>

            <button
              type="button"
              onClick={handleRemoveKey}
              aria-label={t('security.orbita_key_remove_btn')}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                color: MD3.error,
                border: 'none',
                borderRadius: 999,
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Trash2 size={16} />
              <span>{t('security.orbita_key_remove_btn')}</span>
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isPasswordSet && (
            <div
              style={{
                backgroundColor: MD3.surface,
                borderRadius: 16,
                padding: '16px 20px',
                border: `1px solid ${MD3.outline}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <label style={{ fontSize: 13, fontWeight: 600, color: MD3.onSurface }}>
                {t('security.orbita_key_enter_current_password')}
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder={t('security.orbita_key_password_placeholder')}
                style={{
                  backgroundColor: MD3.surfaceHigh,
                  color: MD3.onSurface,
                  border: 'none',
                  borderRadius: 999,
                  padding: '12px 18px',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>
          )}

          <div
            style={{
              backgroundColor: MD3.surface,
              borderRadius: 16,
              padding: '16px 20px',
              border: `1px solid ${MD3.outline}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: MD3.onSurface, display: 'flex', alignItems: 'center', gap: 8 }}>
              <HardDrive size={16} style={{ color: MD3.primary }} />
              <span>{t('security.orbita_key_select_drive')}</span>
            </div>

            {detectedDrives.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {detectedDrives.map((d) => (
                  <button
                    key={d.path}
                    type="button"
                    onClick={() => setSelectedDrivePath(d.path)}
                    aria-label={d.label}
                    style={{
                      backgroundColor: selectedDrivePath === d.path ? MD3.primary : MD3.surfaceHigh,
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 999,
                      padding: '8px 16px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                readOnly
                value={selectedDrivePath}
                placeholder="E:\"
                style={{
                  flex: 1,
                  backgroundColor: MD3.surfaceHigh,
                  color: MD3.onSurface,
                  border: 'none',
                  borderRadius: 999,
                  padding: '10px 16px',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSelectDirectory}
                aria-label={t('security.orbita_key_choose_drive_btn')}
                style={{
                  backgroundColor: MD3.surfaceHigh,
                  color: MD3.onSurface,
                  border: `1px solid ${MD3.outline}`,
                  borderRadius: 999,
                  padding: '10px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('security.orbita_key_choose_drive_btn')}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: MD3.error, fontSize: 12, justifyContent: 'center' }}>
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{ fontSize: 13, color: MD3.success, textAlign: 'center', fontWeight: 500 }}>
              {successMsg}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => handleCreateAndWriteKey(false)}
              disabled={isSubmitting || (isPasswordSet && !currentPassword)}
              aria-label={t('security.orbita_key_create_btn')}
              style={{
                backgroundColor: MD3.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: 999,
                padding: '14px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: isSubmitting || (isPasswordSet && !currentPassword) ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <KeyRound size={17} />
              <span>{t('security.orbita_key_create_btn')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleCreateAndWriteKey(true)}
              disabled={isSubmitting || (isPasswordSet && !currentPassword)}
              aria-label={t('security.orbita_key_download_btn')}
              style={{
                backgroundColor: MD3.surface,
                color: MD3.onSurface,
                border: `1px solid ${MD3.outline}`,
                borderRadius: 999,
                padding: '12px 20px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: isSubmitting || (isPasswordSet && !currentPassword) ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Download size={16} />
              <span>{t('security.orbita_key_download_btn')}</span>
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};
