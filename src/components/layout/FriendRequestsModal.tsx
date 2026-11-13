import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useChatStore, type IncomingFriendRequest } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';

interface FriendRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (request: IncomingFriendRequest) => void;
  onReject: (request: IncomingFriendRequest) => void;
}

export const FriendRequestsModal: React.FC<FriendRequestsModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  onReject,
}) => {
  const { t } = useTranslation();
  const incomingRequests = useChatStore((state) => state.incomingFriendRequests);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="friend-requests-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            border: 'none',
            outline: 'none',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl"
            style={{
              width: '100%',
              maxWidth: '420px',
              maxHeight: '80vh',
              borderRadius: '16px',
              backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              color: 'var(--text-main)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              padding: '16px',
              userSelect: 'none',
              border: 'none',
              outline: 'none',
            }}
          >
            <div className="relative flex items-center justify-center mb-3 w-full select-none min-h-[32px]">
              <h3 className="text-base font-semibold text-[var(--text-main)] text-center">
                {t('friendRequests.title', 'Запросы на переписку')}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.08))] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                style={{ border: 'none', outline: 'none' }}
                aria-label={t('common.close', 'Закрыть')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 flex flex-col gap-1 custom-scrollbar">
              {incomingRequests.length === 0 ? (
                <div className="py-10 text-center text-[var(--text-dim)] text-xs rounded-xl">
                  {t('friendRequests.empty', 'Нет новых запросов')}
                </div>
              ) : (
                incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-[var(--surface-container,rgba(255,255,255,0.05))] transition-colors select-none"
                    style={{ border: 'none', outline: 'none' }}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-3">
                      <Avatar
                        src={req.avatarUrl}
                        alt={req.senderNickname}
                        className="w-10 h-10 rounded-full"
                      />
                      <div className="min-w-0 flex flex-col">
                        <span className="text-sm font-semibold text-[var(--text-main)] truncate leading-tight">
                          {req.senderNickname}
                        </span>
                        <span className="text-xs text-[var(--text-dim)] font-mono truncate leading-normal mt-0.5 opacity-80">
                          {req.senderCode || req.chatId}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onReject(req)}
                        aria-label={t('common.decline', 'Отклонить')}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-full hover:opacity-80 transition-opacity cursor-pointer select-none"
                        style={{
                          borderRadius: '9999px',
                          backgroundColor: 'var(--surface-container-strong, rgba(255,255,255,0.08))',
                          color: 'var(--text-main, #ffffff)',
                          border: 'none',
                          outline: 'none',
                        }}
                      >
                        {t('common.decline', 'Отклонить')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onAccept(req)}
                        aria-label={t('common.accept', 'Принять')}
                        className="px-4 py-1.5 text-xs font-semibold rounded-full hover:opacity-90 transition-opacity cursor-pointer select-none shadow-sm"
                        style={{
                          borderRadius: '9999px',
                          backgroundColor: 'var(--accent-color, #7C3AED)',
                          color: '#ffffff',
                          border: 'none',
                          outline: 'none',
                        }}
                      >
                        {t('common.accept', 'Принять')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
