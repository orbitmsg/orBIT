import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { securityService } from '../../services/securityService';

interface AppLockScreenProps {
  onUnlocked: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlocked }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        {/* User Profile Avatar */}
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
            {userProfile.nickname 
              ? t('appLock.welcome_back', 'С возвращением, {{name}}!', { name: userProfile.nickname })
              : t('appLock.welcome_back_generic', 'С возвращением!')}
          </h2>
          <p className="text-sm text-[var(--text-dim)] text-center whitespace-nowrap">
            {t('appLock.enter_pin_to_unlock', 'Введите пароль для разблокировки Orbita')}
          </p>
        </div>

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
                className="w-full px-1 py-2.5 outline-none text-sm transition-all pr-10"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${errorMsg ? '#ef4444' : 'var(--border-color, rgba(255,255,255,0.15))'}`,
                  borderRadius: '0px',
                  color: 'var(--text-main, #ffffff)',
                  fontFamily: 'var(--main-font, inherit)',
                }}
                onFocus={(e) => (e.currentTarget.style.borderBottomColor = errorMsg ? '#ef4444' : 'var(--accent-color, #7C3AED)')}
                onBlur={(e) => (e.currentTarget.style.borderBottomColor = errorMsg ? '#ef4444' : 'var(--border-color, rgba(255,255,255,0.15))')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
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
      </motion.div>
    </div>
  );
};
