import React, { useId } from 'react';

const GEAR_STYLES = `
  .pdi-gear-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: #b5bac1;
    transition: color 0.15s ease, transform 0.12s ease;
  }
  .dock-btn:hover .pdi-gear-wrap,
  .pdi-gear-wrap:hover {
    color: #ffffff;
  }
  .dock-btn:active .pdi-gear-wrap,
  .pdi-gear-wrap:active {
    color: #ffffff;
    transform: scale(0.92);
  }
  .pdi-gear-svg {
    display: block;
    transform-origin: 50% 50%;
  }
  .dock-btn:hover .pdi-gear-svg,
  .pdi-gear-wrap:hover .pdi-gear-svg {
    animation: pdi-gear-spin 2.2s linear infinite;
  }
  @keyframes pdi-gear-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dock-btn:hover .pdi-gear-svg,
    .pdi-gear-wrap:hover .pdi-gear-svg {
      animation: none;
    }
  }
`;

const MIC_STYLES = `
  .pdi-mic-hitbox {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px;
    margin: -5px;
    border-radius: 5px;
    transition: color 0.15s ease;
  }
  .pdi-pop-anim {
    animation: pdi-icon-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes pdi-icon-pop {
    0% {
      transform: scale(0.82) translateY(1.5px);
    }
    55% {
      transform: scale(1.18) translateY(-2px);
    }
    100% {
      transform: scale(1) translateY(0);
    }
  }
  .pdi-slash-line,
  .pdi-slash-mask-line {
    stroke-dasharray: 32;
    stroke-dashoffset: 0;
    animation: pdi-slash-draw 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes pdi-slash-draw {
    from {
      stroke-dashoffset: 32;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  .pdi-mic-unmuted {
    color: #b5bac1;
  }
  .dock-btn:hover .pdi-mic-unmuted,
  .pdi-mic-hitbox.pdi-mic-unmuted:hover {
    color: #ffffff;
  }
  .pdi-mic-muted {
    color: #f23f43;
  }
  .dock-btn:hover .pdi-mic-muted,
  .pdi-mic-hitbox.pdi-mic-muted:hover {
    color: #fa777c;
  }
  .pdi-mic-svg {
    display: block;
    overflow: visible;
  }
  .pdi-mic-upper {
    transform-box: view-box;
    transform-origin: 12px 17.5px;
  }
  .pdi-mic-hitbox:hover .pdi-mic-upper,
  .dock-btn:hover .pdi-mic-upper {
    animation: pdi-mic-sway 0.95s infinite;
  }
  @keyframes pdi-mic-sway {
    0% {
      transform: rotate(0deg);
      animation-timing-function: ease-out;
    }
    25% {
      transform: rotate(-11deg);
      animation-timing-function: ease-in;
    }
    50% {
      transform: rotate(0deg);
      animation-timing-function: ease-out;
    }
    75% {
      transform: rotate(11deg);
      animation-timing-function: ease-in;
    }
    100% {
      transform: rotate(0deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pdi-mic-hitbox:hover .pdi-mic-upper,
    .dock-btn:hover .pdi-mic-upper,
    .pdi-pop-anim,
    .pdi-slash-line,
    .pdi-slash-mask-line {
      animation: none;
    }
  }
`;

const HEADPHONES_STYLES = `
  .pdi-hp-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    transition: color 0.15s ease;
  }
  .pdi-pop-anim {
    animation: pdi-icon-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .pdi-slash-line,
  .pdi-slash-mask-line {
    stroke-dasharray: 32;
    stroke-dashoffset: 0;
    animation: pdi-slash-draw 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes pdi-slash-draw {
    from {
      stroke-dashoffset: 32;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  .pdi-hp-unmuted {
    color: #b5bac1;
  }
  .dock-btn:hover .pdi-hp-unmuted,
  .pdi-hp-wrap.pdi-hp-unmuted:hover {
    color: #ffffff;
  }
  .pdi-hp-muted {
    color: #f23f43;
  }
  .dock-btn:hover .pdi-hp-muted,
  .pdi-hp-wrap.pdi-hp-muted:hover {
    color: #fa777c;
  }
  .pdi-hp-svg {
    display: block;
    overflow: visible;
  }
  .pdi-hp-headband {
    transform-box: view-box;
    transform-origin: 12px 13px;
  }
  .dock-btn:hover .pdi-hp-headband,
  .pdi-hp-wrap:hover .pdi-hp-headband {
    animation: pdi-headband-expand 1.1s ease-in-out infinite;
  }
  @keyframes pdi-headband-expand {
    0%, 100% {
      transform: scale(1, 1);
    }
    50% {
      transform: scale(1.04, 1.09) translateY(-0.7px);
    }
  }
  .pdi-hp-earcup-left,
  .pdi-hp-earcup-right {
    transform-box: view-box;
    transform-origin: 12px 17px;
  }
  .dock-btn:hover .pdi-hp-earcup-left,
  .pdi-hp-wrap:hover .pdi-hp-earcup-left,
  .dock-btn:hover .pdi-hp-earcup-right,
  .pdi-hp-wrap:hover .pdi-hp-earcup-right {
    animation: pdi-earcup-beat 1.1s ease-in-out infinite;
  }
  @keyframes pdi-earcup-beat {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-0.5px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dock-btn:hover .pdi-hp-headband,
    .pdi-hp-wrap:hover .pdi-hp-headband,
    .dock-btn:hover .pdi-hp-earcup-left,
    .pdi-hp-wrap:hover .pdi-hp-earcup-left,
    .dock-btn:hover .pdi-hp-earcup-right,
    .pdi-hp-wrap:hover .pdi-hp-earcup-right,
    .pdi-pop-anim,
    .pdi-slash-line,
    .pdi-slash-mask-line {
      animation: none;
    }
  }
`;

export const DiscordSettingsIcon: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 20,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.56 1.1c-.46.05-.7.53-.64.98.18 1.16-.19 2.2-.98 2.53-.8.33-1.79-.15-2.49-1.1-.27-.36-.78-.52-1.14-.24-.77.59-1.45 1.27-2.04 2.04-.28.36-.12.87.24 1.14.96.7 1.43 1.7 1.1 2.49-.33.8-1.37 1.16-2.53.98-.45-.07-.93.18-.99.64a11.1 11.1 0 0 0 0 2.88c.06.46.54.7.99.64 1.16-.18 2.2.19 2.53.98.33.8-.14 1.79-1.1 2.49-.36.27-.52.78-.24 1.14.59.77 1.27 1.45 2.04 2.04.36.28.87.12 1.14-.24.7-.95 1.7-1.43 2.49-1.1.8.33 1.16 1.37.98 2.53-.07.45.18.93.64.99a11.1 11.1 0 0 0 2.88 0c.46-.06.7-.54.64-.99-.18-1.16.19-2.2.98-2.53.8-.33 1.79.14 2.49 1.1.27.36.78.52 1.14.24.77-.59 1.45-1.27 2.04-2.04.28-.36.12-.87-.24-1.14-.96-.7-1.43-1.7-1.1-2.49.33-.8 1.37-1.16 2.53-.98.45.07.93-.18.99-.64a11.1 11.1 0 0 0 0-2.88c-.06-.46-.54-.7-.99-.64-1.16.18-2.2-.19-2.53-.98-.33-.8.14-1.79 1.1-2.49.36-.27.52-.78.24-1.14a11.07 11.07 0 0 0-2.04-2.04c-.36-.28-.87-.12-1.14.24-.7.96-1.7 1.43-2.49 1.1-.8-.33-1.16-1.37-.98-2.53.07-.45-.18-.93-.64-.99a11.1 11.1 0 0 0-2.88 0ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
    />
  </svg>
);

export const GearIcon: React.FC = () => (
  <span className="pdi-gear-wrap">
    <style>{GEAR_STYLES}</style>
    <DiscordSettingsIcon className="pdi-gear-svg" />
  </span>
);

export const MicToggleIcon: React.FC<{ muted: boolean }> = ({ muted }) => {
  const rawId = useId();
  const maskId = `pdi-mic-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <span key={String(muted)} className={`pdi-mic-hitbox pdi-pop-anim ${muted ? 'pdi-mic-muted' : 'pdi-mic-unmuted'}`}>
      <style>{MIC_STYLES}</style>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        fill="none"
        viewBox="0 0 24 24"
        className="pdi-mic-svg"
        aria-hidden="true"
      >
        {muted && (
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="-4" y="-4" width="32" height="32">
              <rect x="-4" y="-4" width="32" height="32" fill="white" />
              <line className="pdi-slash-mask-line" x1="22" y1="2" x2="2" y2="22" stroke="black" strokeWidth="5.8" strokeLinecap="round" />
            </mask>
          </defs>
        )}
        <g mask={muted ? `url(#${maskId})` : undefined}>
          <path
            fill="currentColor"
            d="M11 17.5a1 1 0 0 1 2 0V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.5Z"
          />
          <g className="pdi-mic-upper">
            <path
              fill="currentColor"
              d="M12 2a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Z"
            />
            <path
              fill="currentColor"
              d="M6 10a1 1 0 0 0-2 0 8 8 0 0 0 16 0 1 1 0 1 0-2 0 6 6 0 0 1-12 0Z"
            />
          </g>
        </g>
        {muted && (
          <line
            className="pdi-slash-line"
            x1="22"
            y1="2"
            x2="2"
            y2="22"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
};

export const HeadphonesToggleIcon: React.FC<{ muted: boolean }> = ({ muted }) => {
  const rawId = useId();
  const maskId = `pdi-hp-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <span key={String(muted)} className={`pdi-hp-wrap pdi-pop-anim ${muted ? 'pdi-hp-muted' : 'pdi-hp-unmuted'}`}>
      <style>{HEADPHONES_STYLES}</style>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        fill="none"
        viewBox="0 0 24 24"
        className="pdi-hp-svg"
        aria-hidden="true"
      >
        {muted && (
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="-4" y="-4" width="32" height="32">
              <rect x="-4" y="-4" width="32" height="32" fill="white" />
              <line className="pdi-slash-mask-line" x1="22" y1="2" x2="2" y2="22" stroke="black" strokeWidth="5.6" strokeLinecap="round" />
            </mask>
          </defs>
        )}
        <g mask={muted ? `url(#${maskId})` : undefined}>
          <path
            fill="currentColor"
            className="pdi-hp-headband"
            d="M12 3A9 9 0 0 0 3.09 13.3H1.08A11 11 0 1 1 22.92 13.3H20.91A9 9 0 0 0 12 3Z"
          />
          <path
            fill="currentColor"
            className="pdi-hp-earcup-left"
            d="M1.05 13H4.92a5 5 0 0 1 4.1 2.13l1.37 1.97a3.1 3.1 0 0 1-.17 3.78 2.85 2.85 0 0 1-3.55.74A11 11 0 0 1 1.05 13Z"
          />
          <path
            fill="currentColor"
            className="pdi-hp-earcup-right"
            d="M17.33 21.62c-1.27.71-2.73.23-3.55-.74a3.1 3.1 0 0 1-.17-3.78l1.38-1.97a5 5 0 0 1 4.1-2.13h3.86A11 11 0 0 1 17.33 21.62Z"
          />
        </g>
        {muted && (
          <line
            className="pdi-slash-line"
            x1="22"
            y1="2"
            x2="2"
            y2="22"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
};
