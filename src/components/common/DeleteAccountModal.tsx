import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteAccountModal = ({ isOpen, onClose, onConfirm }: DeleteAccountModalProps) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
          className="w-full max-w-sm rounded-[10px] p-6 shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
            borderRadius: '10px',
            border: 'none',
            outline: 'none',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <div className="mb-4 flex justify-center" style={{ color: 'var(--md-error, #f2b8b5)' }}>
              <Trash2 size={48} />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-main)' }}>
              {t('settings.delete_account_confirm_title')}
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-dim)' }}>
              {t('settings.delete_account_confirm_description')}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.cancel')}
                className="px-6 py-2 rounded-[10px] text-sm font-medium transition-colors cursor-pointer"
                style={{
                  borderRadius: '10px',
                  backgroundColor: 'var(--surface-muted)',
                  color: 'var(--text-main)',
                  border: 'none',
                  outline: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-muted)')}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                aria-label={t('common.delete')}
                className="px-6 py-2 rounded-[10px] text-sm font-bold transition-colors cursor-pointer"
                style={{
                  borderRadius: '10px',
                  backgroundColor: 'var(--accent-color)',
                  color: '#fff',
                  border: 'none',
                  outline: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-light)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-color)')}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};