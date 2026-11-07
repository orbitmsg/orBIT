import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { securityService } from '../../services/securityService';
import { MD3, Block } from './SettingsShared';
export const PasswordSettingsScreen = ({ onSaved }: { onSaved?: () => void }) => {
  const { t } = useTranslation();
  const [isAlreadySet, setIsAlreadySet] = useState(() => securityService.isPasswordSet());

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLength12 = newPassword.length >= 12;
  const hasDigit = /[0-9]/.test(newPassword);
  const hasSymbol = /[^a-zA-Z0-9]/.test(newPassword);
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (isAlreadySet) {
      if (!currentPassword) {
        setErrorMsg(t('security.err_wrong_current', 'Неверный текущий пароль'));
        return;
      }
      setIsSubmitting(true);
      const isCurrentValid = await securityService.verifyPassword(currentPassword);
      setIsSubmitting(false);
      if (!isCurrentValid) {
        setErrorMsg(t('security.err_wrong_current', 'Неверный текущий пароль'));
        return;
      }
    }

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg(t('security.err_too_short', 'Пароль должен содержать минимум 6 символов'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg(t('security.err_mismatch', 'Пароли не совпадают'));
      return;
    }

    setIsSubmitting(true);
    const success = await securityService.setPassword(newPassword);
    setIsSubmitting(false);

    if (success) {
      setSuccessMsg(t('security.password_saved', 'Пароль успешно сохранен!'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsAlreadySet(true);
      onSaved?.();
    } else {
      setErrorMsg(t('common.error', 'Ошибка'));
    }
  };

  const handleRemove = async () => {
    if (!currentPassword) {
      setErrorMsg(t('security.err_wrong_current', 'Неверный текущий пароль'));
      return;
    }
    setIsSubmitting(true);
    const isCurrentValid = await securityService.verifyPassword(currentPassword);
    setIsSubmitting(false);
    if (!isCurrentValid) {
      setErrorMsg(t('security.err_wrong_current', 'Неверный текущий пароль'));
      return;
    }
    securityService.removePassword();
    setSuccessMsg(t('security.password_removed', 'Пароль удален'));
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsAlreadySet(false);
    onSaved?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ padding: '0 0 32px' }}
    >
      <form onSubmit={handleSubmit}>
        
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: MD3.onSurfaceVar,
            padding: '0 20px',
            marginBottom: 8,
          }}>
            {t('security.password_group', 'Пароль')}
          </div>

          <Block style={{
            padding: '20px',
            gap: '14px',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: MD3.onSurface, margin: 0 }}>
              {isAlreadySet ? t('security.modal_title_change', 'Изменить пароль') : t('security.modal_title_set', 'Поставить пароль')}
            </h3>
            <p style={{ fontSize: 13, color: MD3.onSurfaceVar, lineHeight: 1.45, margin: 0 }}>
              {isAlreadySet
                ? t('security.modal_desc_change', 'Измените пароль для Orbita. Локально сохранённые данные будут повторно зашифрованы с использованием нового пароля.')
                : t('security.modal_desc_set', 'Поставьте пароль для Orbita. Локально сохранённые данные будут зашифрованы с использованием пароля. Если вы забудете пароль, то восстановить аккаунт не получится.')}
            </p>

            <div className="flex flex-col gap-3 mt-1">
              {isAlreadySet && (
                <div className="relative flex items-center">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t('security.current_password', 'Текущий пароль')}
                    className="w-full px-1 py-2.5 outline-none text-sm transition-all pr-8"
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
                      borderRadius: '0px',
                      color: 'var(--text-main, #ffffff)',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
                    onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.15))')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-1 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer"
                  >
                    {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              )}

              <div className="relative flex items-center">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('security.new_password', 'Новый пароль')}
                  className="w-full px-1 py-2.5 outline-none text-sm transition-all pr-8"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
                    borderRadius: '0px',
                    color: 'var(--text-main, #ffffff)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
                  onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.15))')}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-1 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('security.confirm_password', 'Подтвердить пароль')}
                  className="w-full px-1 py-2.5 outline-none text-sm transition-all pr-8"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
                    borderRadius: '0px',
                    color: 'var(--text-main, #ffffff)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
                  onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.15))')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-1 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </Block>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: MD3.onSurfaceVar,
            padding: '0 20px',
            marginBottom: 8,
          }}>
            {t('security.strength_group', 'Надёжность')}
          </div>

          <Block style={{
            padding: '20px',
            gap: '14px',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: MD3.onSurface, margin: 0 }}>
              {t('security.strength_title', 'Индикатор надёжности пароля')}
            </h3>
            <p style={{ fontSize: 13, color: MD3.onSurfaceVar, lineHeight: 1.45, margin: 0 }}>
              {t('security.strength_desc', 'Надёжный пароль помогает защитить ваши сообщения и вложения при утере или краже устройства.')}
            </p>

            <div style={{
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}>
              <div className="flex items-center gap-3 text-xs font-medium">
                {isLength12 ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: isLength12 ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_length_12', 'Длина больше 12 симво символов')}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                {hasDigit ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: hasDigit ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_digit', 'Содержит цифру')}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                {hasSymbol ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: hasSymbol ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_symbol', 'Содержит символ')}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                {hasUpper ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: hasUpper ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_uppercase', 'Содержит заглавную букву')}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                {hasLower ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: hasLower ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_lowercase', 'Содержит строчную букву')}
                </span>
              </div>
            </div>
          </Block>
        </div>

        {errorMsg && (
          <p className="text-xs text-red-400 font-medium text-center mb-3">{errorMsg}</p>
        )}
        {successMsg && (
          <p className="text-xs text-emerald-400 font-medium text-center mb-3">{successMsg}</p>
        )}

        <div className="flex flex-col items-center gap-3 mt-4 px-4">
          <button
            type="submit"
            disabled={isSubmitting || !newPassword || newPassword !== confirmPassword}
            className="px-8 py-2.5 rounded-full text-sm font-semibold border transition-all cursor-pointer"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              color: MD3.onSurface,
              opacity: isSubmitting || !newPassword || newPassword !== confirmPassword ? 0.4 : 1,
            }}
          >
            {isAlreadySet ? t('security.action_button_change', 'Изменить пароль') : t('security.action_button_set', 'Поставить пароль')}
          </button>

          {isAlreadySet && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isSubmitting || !currentPassword}
              className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            >
              {t('security.remove_password', 'Удалить пароль')}
            </button>
          )}
        </div>
      </form>
    </motion.div>
  );
};
