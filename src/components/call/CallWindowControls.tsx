import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { accentButtonStyle, rejectButtonStyle, neutralButtonStyle } from './callButtonStyles';

export interface CallWindowControlsProps {
  isIncoming: boolean;
  isPreparing: boolean;
  isRinging: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  isEnded: boolean;
  isMicEnabled: boolean;
  isVideoEnabled: boolean;
  hasLocalScreenShare: boolean;
  sendAction: (action: string) => void;
  handleToggleMic: () => void;
  handleToggleVideo: () => void;
  handleToggleScreenShare: () => void;
  handleHangupOrCancel: (action: 'cancelCall' | 'endCall') => void;
}

export const CallWindowControls: React.FC<CallWindowControlsProps> = ({
  isIncoming,
  isPreparing,
  isRinging,
  isConnecting,
  isConnected,
  isEnded,
  isMicEnabled,
  isVideoEnabled,
  hasLocalScreenShare,
  sendAction,
  handleToggleMic,
  handleToggleVideo,
  handleToggleScreenShare,
  handleHangupOrCancel,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center gap-6 sm:gap-8 flex-wrap z-30 select-none py-1">
      {isIncoming ? (
        <>
          <button
            type="button"
            onClick={() => handleHangupOrCancel('cancelCall')}
            aria-label={t('call.reject')}
            className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors flex-shrink-0" style={rejectButtonStyle}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-current">
                <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
              </svg>
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {t('call.reject') || 'Отклонить'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => sendAction('answerCall')}
            aria-label={t('call.answer')}
            className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0" style={accentButtonStyle}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-current">
                <path fill="currentColor" d="m19.23 15.26l-2.54-.29a1.99 1.99 0 0 0-1.64.57l-1.84 1.84a15.05 15.05 0 0 1-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52a2 2 0 0 0-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07c.53 8.54 7.36 15.36 15.89 15.89c1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98" />
              </svg>
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {t('call.answer') || 'Принять'}
            </span>
          </button>
        </>
      ) : isPreparing ? (
        <>
          <button
            type="button"
            onClick={handleToggleVideo}
            aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
            className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-all flex-shrink-0"
              style={isVideoEnabled ? accentButtonStyle : neutralButtonStyle(false)}
            >
              {isVideoEnabled ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                  <path fill="currentColor" fillRule="evenodd" d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                  <path fill="currentColor" fillRule="evenodd" d="M10.961 12.365a2 2 0 0 0 .522-1.103l3.11 1.382A1 1 0 0 0 16 11.731V4.269a1 1 0 0 0-1.406-.913l-3.111 1.382A2 2 0 0 0 9.5 3H4.272zm-10.114-9A2 2 0 0 0 0 5v6a2 2 0 0 0 2 2h5.728zm9.746 11.925l-10-14l.814-.58l10 14z" />
                </svg>
              )}
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleHangupOrCancel('cancelCall')}
            aria-label={t('call.cancel')}
            className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors flex-shrink-0" style={rejectButtonStyle}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-current">
                <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
              </svg>
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {t('call.cancel')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => sendAction('initiateCall')}
            aria-label={t('call.call')}
            className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0" style={accentButtonStyle}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-current">
                <path fill="currentColor" d="m19.23 15.26l-2.54-.29a1.99 1.99 0 0 0-1.64.57l-1.84 1.84a15.05 15.05 0 0 1-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52a2 2 0 0 0-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07c.53 8.54 7.36 15.36 15.89 15.89c1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98" />
              </svg>
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {t('call.call')}
            </span>
          </button>
        </>
      ) : (isRinging || isConnecting || isConnected) ? (
        <>
          <button
            type="button"
            onClick={handleToggleMic}
            aria-label={isMicEnabled ? t('call.mic') : t('call.mic_off')}
            className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0" style={neutralButtonStyle(isMicEnabled)}>
              {isMicEnabled ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                  <g fill="currentColor">
                    <path d="M13 5a1 1 0 0 1 1 1a6 6 0 0 1-5.005 5.915Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 2 0a4 4 0 1 0 8 0a1 1 0 0 1 1-1" />
                    <path d="M8 1a3 3 0 0 1 3 3v2a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3" />
                  </g>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                  <path fill="currentColor" d="M4.113 6.945a4 4 0 0 0 2.94 2.94L9.069 11.9l-.073.015Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 .382-.786zM8 1a3 3 0 0 1 3 3v2c0 .978-.47 1.843-1.195 2.39l.712.713A3.99 3.99 0 0 0 12 6a1 1 0 0 1 2 0a5.97 5.97 0 0 1-2.065 4.52l2.772 2.773a1 1 0 1 1-1.414 1.414l-12-12a1 1 0 1 1 1.414-1.414l2.318 2.318A3 3 0 0 1 8 1" />
                </svg>
              )}
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {isMicEnabled ? t('call.mic') : t('call.mic_off')}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleVideo}
            aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
            className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent outline-none cursor-pointer select-none p-0"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-all flex-shrink-0" style={neutralButtonStyle(isVideoEnabled)}>
              {isVideoEnabled ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                  <path fill="currentColor" fillRule="evenodd" d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="28" height="28" className="w-7 h-7 text-current">
                  <path fill="currentColor" fillRule="evenodd" d="M10.961 12.365a2 2 0 0 0 .522-1.103l3.11 1.382A1 1 0 0 0 16 11.731V4.269a1 1 0 0 0-1.406-.913l-3.111 1.382A2 2 0 0 0 9.5 3H4.272zm-10.114-9A2 2 0 0 0 0 5v6a2 2 0 0 0 2 2h5.728zm9.746 11.925l-10-14l.814-.58l10 14z" />
                </svg>
              )}
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
            </span>
          </button>

          {(isConnected || isRinging || isConnecting) && (
            <button
              type="button"
              onClick={handleToggleScreenShare}
              aria-label={t('call.screen_share')}
              className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0"
                style={neutralButtonStyle(hasLocalScreenShare)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -3 24 24" width="28" height="28" className="w-7 h-7 text-current">
                  <path fill="currentColor" d="M3 2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zm0-2h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3m4 16h6a1 1 0 0 1 0 2H7a1 1 0 0 1 0-2" />
                </svg>
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.screen_share')}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleHangupOrCancel('endCall')}
            aria-label={t('call.hang_up')}
            className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors flex-shrink-0" style={rejectButtonStyle}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" className="w-7 h-7 text-current">
                <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
              </svg>
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {t('call.hang_up')}
            </span>
          </button>
        </>
      ) : isEnded ? (
        <button
          type="button"
          onClick={() => handleHangupOrCancel('cancelCall')}
          aria-label={t('call.close')}
          className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors flex-shrink-0" style={rejectButtonStyle}>
            <X size={28} color="currentColor" />
          </div>
          <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
            {t('call.close')}
          </span>
        </button>
      ) : null}
    </div>
  );
};
