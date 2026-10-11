import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, User, KeyRound, Usb, CheckCircle2, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { securityService } from '../../services/securityService';
import { orbitaKeyService } from '../../services/orbitaKeyService';

interface AppLockScreenProps {
  onUnlocked: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlocked }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUsbMode, setIsUsbMode] = useState(false);
  const [usbStatus, setUsbStatus] = useState<'scanning' | 'detected' | 'success'>('scanning');
  const [usbError, setUsbError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userProfile] = useState<{ nickname: string; avatarUrl: string | null }>(() => {
    try {
      const raw = localStorage.getItem('orbita_lock_user_profile');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            nickname: parsed.nickname || '',
            avatarUrl: parsed.avatarUrl || null,
          };
        }
      }
    } catch {}
    return { nickname: '', avatarUrl: null };
  });

  const getGreetingKey = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'day';
    if (hour >= 18 && hour < 23) return 'evening';
    return 'night';
  };

  const greetingKey = getGreetingKey();
  const greeting = userProfile.nickname
    ? t(`appLock.greeting_${greetingKey}`, { name: userProfile.nickname })
    : t(`appLock.greeting_${greetingKey}_generic`);

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg('');

    const isValid = await securityService.verifyPassword(password);
    setIsSubmitting(false);

    if (isValid) {
      onUnlocked();
    } else {
      setErrorMsg(t('appLock.wrong_password', 'Неверный пароль. Попробуйте еще раз.'));
      setPassword('');
    }
  };

  useEffect(() => {
    if (!isUsbMode) return;

    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const checkUsb = async () => {
      if (!isMounted) return;
      try {
        const res = await orbitaKeyService.scanForUsbKey();
        if (res.found && res.keyPayload) {
          if (!isMounted) return;
          setUsbStatus('detected');
          const unlocked = await orbitaKeyService.verifyAndUnlock(res.keyPayload);
          if (unlocked) {
            setUsbStatus('success');
            setTimeout(() => {
              if (isMounted) onUnlocked();
            }, 600);
            return;
          } else {
            setUsbError(t('appLock.usb_mode_invalid'));
            setUsbStatus('scanning');
          }
        }
      } catch {}

      if (isMounted) {
        timer = setTimeout(checkUsb, 1200);
      }
    };

    checkUsb();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [isUsbMode, t, onUnlocked]);

  const handleManualFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUsbError('');
    setUsbStatus('detected');

    const res = await orbitaKeyService.parseKeyFile(file);
    if (res.success && res.payload) {
      const unlocked = await orbitaKeyService.verifyAndUnlock(res.payload);
      if (unlocked) {
        setUsbStatus('success');
        setTimeout(() => {
          onUnlocked();
        }, 600);
      } else {
        setUsbError(t('appLock.usb_mode_invalid'));
        setUsbStatus('scanning');
      }
    } else {
      setUsbError(t('appLock.usb_mode_invalid'));
      setUsbStatus('scanning');
    }
    if (e.target) e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center select-none"
      style={{
        backgroundColor: 'var(--bg-primary, #121212)',
        color: 'var(--text-main, #ffffff)',
        fontFamily: 'var(--main-font, inherit)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center p-8 max-w-2xl w-full relative z-10"
      >
        <div className="mb-6 flex flex-col items-center">
          <div className="w-48 h-48 rounded-full mb-4 flex items-center justify-center overflow-hidden"
            style={{ 
              border: 'none',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              background: userProfile.avatarUrl ? 'transparent' : 'linear-gradient(135deg, var(--accent-color), #4f46e5)'
            }}
          >
            {userProfile.avatarUrl ? (
              <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : userProfile.nickname ? (
              <span className="text-6xl font-bold text-white uppercase">{userProfile.nickname.charAt(0)}</span>
            ) : (
              <User size={40} className="text-white opacity-80" />
            )}
          </div>
          
          <h2 className="text-xl font-bold text-[var(--text-main)] text-center mb-1 whitespace-nowrap">
            {greeting}
          </h2>
          <p className="text-sm text-[var(--text-dim)] text-center whitespace-nowrap">
            {isUsbMode ? t('appLock.usb_mode_title') : t('appLock.enter_pin_to_unlock')}
          </p>
        </div>

        {isUsbMode ? (
          <div className="w-full max-w-sm flex flex-col items-center">
            <motion.div
              animate={{ scale: usbStatus === 'success' ? 1.05 : [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
              transition={{ repeat: usbStatus === 'success' ? 0 : Infinity, duration: 1.8, ease: 'easeInOut' }}
              className="w-16 h-16 rounded-full flex items-center justify-center mb-3 mt-1"
              style={{
                backgroundColor: usbStatus === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(124, 58, 237, 0.15)',
                border: `2px solid ${usbStatus === 'success' ? '#10b981' : 'var(--accent-color, #7C3AED)'}`,
              }}
            >
              {usbStatus === 'success' ? (
                <CheckCircle2 size={32} className="text-emerald-400" />
              ) : (
                <Usb size={30} style={{ color: 'var(--accent-color, #7C3AED)' }} />
              )}
            </motion.div>

            <p className="text-sm font-semibold text-[var(--text-main)] mb-1 text-center">
              {usbStatus === 'success'
                ? t('appLock.usb_mode_success')
                : usbStatus === 'detected'
                ? t('appLock.usb_mode_detected')
                : t('appLock.usb_mode_insert')}
            </p>

            <p className="text-xs text-[var(--text-dim)] text-center mb-4 flex items-center justify-center gap-1.5 min-h-[20px]">
              {usbStatus === 'scanning' && (
                <>
                  <Loader2 size={13} className="animate-spin text-[var(--accent-color)]" />
                  <span>{t('appLock.usb_mode_searching')}</span>
                </>
              )}
            </p>

            {usbError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-400 text-center font-medium mb-3"
              >
                {usbError}
              </motion.p>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleManualFile}
              accept=".key,.json"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('appLock.usb_mode_choose_file')}
              className="w-full py-2.5 rounded-full text-xs font-medium cursor-pointer border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.06)] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-all flex items-center justify-center gap-2 mb-2"
            >
              <FolderOpen size={14} />
              <span>{t('appLock.usb_mode_choose_file')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsUsbMode(false);
                setUsbError('');
              }}
              aria-label={t('appLock.usb_mode_back')}
              className="w-full py-2 text-xs font-medium cursor-pointer text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors text-center"
            >
              {t('appLock.usb_mode_back')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleUnlock} className="w-full max-w-sm flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 w-full">
              <div className="relative flex items-center w-full">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder={t('appLock.placeholder', 'Пароль')}
                  autoFocus
                  className="w-full px-5 py-3.5 outline-none text-sm transition-all pr-12 rounded-full"
                  style={{
                    backgroundColor: 'var(--surface-container-strong, #323232)',
                    border: `2px solid ${errorMsg ? '#ef4444' : 'transparent'}`,
                    color: 'var(--text-main, #ffffff)',
                    fontFamily: 'var(--main-font, inherit)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = errorMsg ? '#ef4444' : 'var(--accent-color, #7C3AED)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = errorMsg ? '#ef4444' : 'transparent')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsUsbMode(true);
                  setUsbStatus('scanning');
                  setUsbError('');
                }}
                aria-label={t('appLock.unlock_with_orbita_key')}
                className="mt-1 flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer transition-opacity opacity-85 hover:opacity-100 self-center"
                style={{ color: 'var(--accent-color, #7C3AED)' }}
              >
                <KeyRound size={14} />
                <span>{t('appLock.unlock_with_orbita_key')}</span>
              </button>
            </div>

            {errorMsg && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-400 text-center font-medium"
              >
                {errorMsg}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={!password || isSubmitting}
              aria-label={t('appLock.done_button', 'Готово')}
              className="w-full py-3.5 rounded-full font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
              style={{
                backgroundColor: 'var(--accent-color)',
                color: '#ffffff',
                opacity: !password || isSubmitting ? 0.6 : 1,
                fontFamily: 'var(--main-font, inherit)',
              }}
            >
              {isSubmitting && <Loader2 size={18} className="animate-spin" />}
              <span>{t('appLock.done_button', 'Готово')}</span>
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};
