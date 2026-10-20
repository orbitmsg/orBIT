import React from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2, Minimize2 } from 'lucide-react';

export interface CallDualStreamViewProps {
  expandedShare: 'remote' | 'local' | null;
  setExpandedShare: (val: 'remote' | 'local' | null) => void;
  isRemoteScreenShareActive: boolean;
  isRemoteVideoActive: boolean;
  otherName: string;
  attachRemoteScreenShare: (el: HTMLVideoElement | null) => void;
  attachRemoteVideo: (el: HTMLVideoElement | null) => void;
  attachLocalScreenShare: (el: HTMLVideoElement | null) => void;
}

export const CallDualStreamView: React.FC<CallDualStreamViewProps> = ({
  expandedShare,
  setExpandedShare,
  isRemoteScreenShareActive,
  isRemoteVideoActive,
  otherName,
  attachRemoteScreenShare,
  attachRemoteVideo,
  attachLocalScreenShare,
}) => {
  const { t } = useTranslation();

  if (expandedShare === 'remote') {
    return (
      <div className="fixed inset-0 z-40 bg-black flex items-center justify-center p-3 sm:p-5">
        <div className="relative w-full h-full flex items-center justify-center">
          <video
            ref={attachRemoteScreenShare}
            autoPlay
            playsInline
            muted
            className="w-full h-full max-w-full max-h-full object-contain"
            style={{ display: isRemoteScreenShareActive ? 'block' : 'none' }}
          />
          <video
            ref={attachRemoteVideo}
            autoPlay
            playsInline
            muted
            className="w-full h-full max-w-full max-h-full object-contain"
            style={{ display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none' }}
          />
          <div className="absolute top-4 left-4 z-30 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-[12px] font-semibold text-white/90 select-none pointer-events-none">
            {isRemoteScreenShareActive ? (otherName || t('call.screen_share_of_user')) : otherName}
          </div>
          <button
            type="button"
            onClick={() => setExpandedShare(null)}
            aria-label={t('call.exit_fullscreen')}
            className="absolute top-4 right-4 z-50 p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
          >
            <Minimize2 size={20} />
          </button>

          <div
            onClick={() => setExpandedShare('local')}
            className="absolute bottom-6 right-6 z-50 w-52 aspect-video rounded-2xl overflow-hidden bg-[#09080e] border-2 border-white/20 cursor-pointer hover:scale-105 transition-all flex items-center justify-center"
          >
            <video
              ref={attachLocalScreenShare}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain pointer-events-none"
            />
            <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-semibold text-white/90 select-none pointer-events-none flex items-center gap-1.5">
              <span>{t('call.your_screen')}</span>
            </div>
            <div className="absolute top-2 right-2 z-10 p-1 rounded-md bg-black/60 text-white/80">
              <Maximize2 size={12} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (expandedShare === 'local') {
    return (
      <div className="fixed inset-0 z-40 bg-black flex items-center justify-center p-3 sm:p-5">
        <div className="relative w-full h-full flex items-center justify-center">
          <video
            ref={attachLocalScreenShare}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
          <div className="absolute top-4 left-4 z-30 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-[12px] font-semibold text-white/90 select-none pointer-events-none flex items-center gap-1.5">
            <span>{t('call.your_screen')}</span>
          </div>
          <button
            type="button"
            onClick={() => setExpandedShare(null)}
            aria-label={t('call.exit_fullscreen')}
            className="absolute top-4 right-4 z-50 p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
          >
            <Minimize2 size={20} />
          </button>

          <div
            onClick={() => setExpandedShare('remote')}
            className="absolute bottom-6 right-6 z-50 w-52 aspect-video rounded-2xl overflow-hidden bg-[#09080e] border-2 border-white/20 cursor-pointer hover:scale-105 transition-all flex items-center justify-center"
          >
            <video
              ref={attachRemoteScreenShare}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain pointer-events-none"
              style={{ display: isRemoteScreenShareActive ? 'block' : 'none' }}
            />
            <video
              ref={attachRemoteVideo}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover pointer-events-none"
              style={{ display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none' }}
            />
            <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-semibold text-white/90 select-none pointer-events-none">
              {isRemoteScreenShareActive ? (otherName || t('call.screen_share_of_user')) : otherName}
            </div>
            <div className="absolute top-2 right-2 z-10 p-1 rounded-md bg-black/60 text-white/80">
              <Maximize2 size={12} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-20 flex flex-row items-center justify-center gap-3.5 w-full px-4 transition-all duration-300 max-w-[1160px] max-h-[58vh]">
      <div
        onClick={() => setExpandedShare('remote')}
        className="relative flex-1 aspect-video rounded-3xl overflow-hidden flex items-center justify-center bg-[#09080e] cursor-pointer"
      >
        <video
          ref={attachRemoteScreenShare}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-contain"
          style={{ display: isRemoteScreenShareActive ? 'block' : 'none' }}
        />
        <video
          ref={attachRemoteVideo}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none' }}
        />
        <div className="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none">
          {isRemoteScreenShareActive ? (otherName || t('call.screen_share_of_user')) : otherName}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpandedShare('remote');
          }}
          aria-label={t('call.fullscreen')}
          className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      <div
        onClick={() => setExpandedShare('local')}
        className="relative flex-1 aspect-video rounded-3xl overflow-hidden flex items-center justify-center bg-[#09080e] cursor-pointer"
      >
        <video
          ref={attachLocalScreenShare}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-contain"
        />
        <div className="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none flex items-center gap-1.5">
          <span>{t('call.your_screen')}</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpandedShare('local');
          }}
          aria-label={t('call.fullscreen')}
          className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
};
