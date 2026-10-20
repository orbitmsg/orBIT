import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { parseBirthday, serializeBirthday, MONTH_FULL_RU, MONTH_FULL_EN } from '../../utils/birthday';
import { useChatStore } from '../../store/useChatStore';
import { supabaseService } from '../../services/supabaseService';

interface NameEditModalProps {
  open: boolean;
  onClose: () => void;
  currentNickname: string;
  onSave: (newName: string) => void;
}
export const NameEditModal = ({ open, onClose, currentNickname, onSave }: NameEditModalProps) => {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState((currentNickname || '').trim());
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFirstName((currentNickname || '').trim());
      setLastName('');
      setError(null);
    }
  }, [open, currentNickname]);

  const handleSave = () => {
    const f = firstName.trim();
    const l = lastName.trim();
    const combined = [f, l].filter(Boolean).join(' ');
    if (combined.length < 1 || combined.length > 32) {
      setError(t('settings.nickname_length_error'));
      return;
    }
    onSave(combined);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            border: 'none',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px', color: 'var(--text-main)' }}>
              {t('profile.edit_name_title', 'Редактирование имени')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--accent-color, #9b7dd4)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                  {t('profile.first_name', 'Имя')}
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t('profile.first_name', 'Имя')}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '8px 4px',
                    borderRadius: '0px',
                    border: 'none',
                    borderBottom: '1.5px solid var(--border-color, rgba(255,255,255,0.15))',
                    backgroundColor: 'transparent',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
                  onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255,255,255,0.15))')}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-dim, #8e8e93)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                  {t('profile.last_name_optional', 'Фамилия (необязательно)')}
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder={t('profile.last_name', 'Фамилия')}
                  style={{
                    width: '100%',
                    padding: '8px 4px',
                    borderRadius: '0px',
                    border: 'none',
                    borderBottom: '1.5px solid var(--border-color, rgba(255,255,255,0.15))',
                    backgroundColor: 'transparent',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
                  onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255,255,255,0.15))')}
                />
              </div>
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '12px', marginBottom: 0 }}>{error}</p>}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.cancel', 'Отмена')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--accent-color, #9b7dd4)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                aria-label={t('common.save', 'Сохранить')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: 'var(--accent-color, #7C3AED)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {t('common.save', 'Сохранить')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const NicknameEditModal = NameEditModal;

interface UsernameEditModalProps {
  open: boolean;
  onClose: () => void;
  currentUsername: string | null;
  onSave: (newUsername: string | null) => void;
}

export const UsernameEditModal = ({ open, onClose, currentUsername, onSave }: UsernameEditModalProps) => {
  const { t } = useTranslation();
  const myCode = useChatStore((s) => s.myCode);
  const [value, setValue] = useState(currentUsername || '');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  useEffect(() => {
    if (open) {
      setValue(currentUsername || '');
      setError(null);
      setStatus('idle');
    }
  }, [open, currentUsername]);

  useEffect(() => {
    if (!open) return;
    const raw = value.trim().replace(/^@+/, '').toLowerCase();
    const cur = (currentUsername || '').replace(/^@+/, '').trim().toLowerCase();

    if (!raw || raw === cur) {
      setError(null);
      setStatus('idle');
      return;
    }

    if (raw.length < 5 || raw.length > 32 || !/^[a-zA-Z0-9_]+$/.test(raw)) {
      setStatus('idle');
      return;
    }

    setStatus('checking');
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const available = await supabaseService.isUsernameAvailable(raw, myCode);
        if (available) {
          setStatus('available');
          setError(null);
        } else {
          setStatus('taken');
          setError(t('profile.username_taken', 'Это имя пользователя уже занято'));
        }
      } catch {
        setStatus('idle');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [value, open, currentUsername, myCode, t]);

  const handleSave = async () => {
    const raw = value.trim().replace(/^@+/, '').toLowerCase();
    const cur = (currentUsername || '').replace(/^@+/, '').trim().toLowerCase();

    if (!raw) {
      onSave(null);
      onClose();
      return;
    }
    if (raw.length < 5) {
      setError(t('profile.username_error_min_length', 'Минимальная длина — 5 символов'));
      return;
    }
    if (raw.length > 32) {
      setError(t('profile.username_error_max_length', 'Максимальная длина — 32 символа'));
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(raw)) {
      setError(t('profile.username_error_invalid_chars', 'Разрешены только буквы латиницы, цифры и знак подчеркивания'));
      return;
    }

    if (raw !== cur) {
      setStatus('checking');
      try {
        const available = await supabaseService.isUsernameAvailable(raw, myCode);
        if (!available) {
          setStatus('taken');
          setError(t('profile.username_taken', 'Это имя пользователя уже занято'));
          return;
        }
      } catch {
        setError(t('profile.username_taken', 'Это имя пользователя уже занято'));
        return;
      }
    }

    onSave(raw);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            border: 'none',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-main)' }}>
              {t('profile.username_title', 'Имя пользователя')}
            </h3>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--accent-color, #9b7dd4)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                @username
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value.replace(/^@+/, ''));
                  if (error) setError(null);
                }}
                placeholder={t('profile.username_placeholder', 'username')}
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 4px',
                  borderRadius: '0px',
                  border: 'none',
                  borderBottom: `1.5px solid ${status === 'taken' || error ? '#ef4444' : status === 'available' ? '#22c55e' : 'var(--border-color, rgba(255,255,255,0.15))'}`,
                  backgroundColor: 'transparent',
                  color: 'var(--text-main, #ffffff)',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => {
                  if (!error && status !== 'taken' && status !== 'available') {
                    e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)';
                  }
                }}
                onBlur={(e) => {
                  if (!error && status !== 'taken' && status !== 'available') {
                    e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255,255,255,0.15))';
                  }
                }}
              />
            </div>

            {status === 'checking' && (
              <p style={{ color: 'var(--text-dim, #8e8e93)', fontSize: '12px', marginTop: '8px', marginBottom: 0 }}>
                {t('profile.username_checking', 'Проверка доступности...')}
              </p>
            )}

            {status === 'available' && !error && (
              <p style={{ color: '#22c55e', fontSize: '12px', marginTop: '8px', marginBottom: 0 }}>
                {t('profile.username_available', 'Имя пользователя свободно')}
              </p>
            )}

            {error && <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px', marginBottom: 0 }}>{error}</p>}

            <div style={{ fontSize: '13px', color: 'var(--text-dim, #8e8e93)', lineHeight: '1.45', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ margin: 0 }}>
                {t('profile.username_modal_desc', 'Вы можете выбрать публичное имя пользователя. Другие пользователи смогут найти Вас по такому имени и связаться, не зная вашего ID аккаунта.')}
              </p>
              <p style={{ margin: 0, whiteSpace: 'pre-line' }}>
                {t('profile.username_modal_rules', 'Можно использовать символы a-z, 0-9 и _.\nМинимальная длина — 5 символов.')}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.cancel', 'Отмена')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--accent-color, #9b7dd4)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {t('common.cancel', 'Отмена')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={status === 'checking' || status === 'taken'}
                aria-label={t('common.save', 'Сохранить')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: status === 'checking' || status === 'taken' ? 'rgba(124, 58, 237, 0.4)' : 'var(--accent-color, #7C3AED)',
                  color: '#fff',
                  cursor: status === 'checking' || status === 'taken' ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {t('common.save', 'Сохранить')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface BirthdayEditModalProps {
  open: boolean;
  onClose: () => void;
  currentBirthday: string | null;
  onSave: (newBirthday: string | null) => void;
}

export const BirthdayEditModal = ({ open, onClose, currentBirthday, onSave }: BirthdayEditModalProps) => {
  const { t, i18n } = useTranslation();
  const parsed = parseBirthday(currentBirthday);
  const [day, setDay] = useState(parsed?.day || 1);
  const [month, setMonth] = useState(parsed?.month || 1);
  const [year, setYear] = useState<number | ''>(parsed?.year || '');

  useEffect(() => {
    if (open) {
      const p = parseBirthday(currentBirthday);
      setDay(p?.day || 1);
      setMonth(p?.month || 1);
      setYear(p?.year || '');
    }
  }, [open, currentBirthday]);

  const isRu = i18n.language === 'ru' || i18n.language === 'uk' || i18n.language === 'be';
  const monthNames = isRu ? MONTH_FULL_RU : MONTH_FULL_EN;

  const handleSave = () => {
    const y = typeof year === 'number' && year > 1900 && year <= new Date().getFullYear() ? year : null;
    const serialized = serializeBirthday(day, month, y);
    onSave(serialized);
    onClose();
  };

  const handleDelete = () => {
    onSave(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            border: 'none',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-main)' }}>
              {t('profile.birthday_title', 'День рождения')}
            </h3>

            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <div style={{ flex: '0 0 70px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-dim, #8e8e93)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                  {t('profile.day', 'День')}
                </label>
                <select
                  value={day}
                  onChange={(e) => setDay(parseInt(e.target.value, 10))}
                  aria-label={t('profile.day', 'День')}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                    backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d} style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-main)' }}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: 'var(--text-dim, #8e8e93)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                  {t('profile.month', 'Месяц')}
                </label>
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                  aria-label={t('profile.month', 'Месяц')}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                    backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {monthNames.map((name, i) => (
                    <option key={i + 1} value={i + 1} style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-main)' }}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '0 0 90px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-dim, #8e8e93)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
                  {t('profile.year_optional', 'Год')}
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => {
                    const v = e.target.value;
                    setYear(v === '' ? '' : parseInt(v, 10));
                  }}
                  placeholder="YYYY"
                  min={1920}
                  max={new Date().getFullYear()}
                  aria-label={t('profile.year_optional', 'Год')}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                    backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
              <div>
                {currentBirthday && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    aria-label={t('common.delete', 'Удалить')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '20px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: 'var(--md-error, #ff595a)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    {t('common.delete', 'Удалить')}
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common.cancel', 'Отмена')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--accent-color, #9b7dd4)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  {t('common.cancel', 'Отмена')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  aria-label={t('common.save', 'Сохранить')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    border: 'none',
                    backgroundColor: 'var(--accent-color, #7C3AED)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  {t('common.save', 'Сохранить')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
