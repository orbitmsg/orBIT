import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IncomingFriendRequest } from '../../store/useChatStore';

export interface ChatPlaceholderProps {
  onConnectRequest?: (friendCode: string, callback: (success: boolean, error?: string) => void) => void;
  onAcceptFriendRequest?: (req: IncomingFriendRequest) => Promise<void>;
  onRejectFriendRequest?: (req: IncomingFriendRequest) => Promise<void>;
}

const PHRASE_KEYS = [
  'chatPlaceholder.phrase_0',
  'chatPlaceholder.phrase_1',
  'chatPlaceholder.phrase_2',
  'chatPlaceholder.phrase_3',
  'chatPlaceholder.phrase_4',
  'chatPlaceholder.phrase_5',
  'chatPlaceholder.phrase_6',
];

export const ChatPlaceholder: React.FC<ChatPlaceholderProps> = () => {
  const { t } = useTranslation();
  const planetSvgId = useId().replace(/:/g, '');
  const [phraseIndex] = useState(() => Math.floor(Math.random() * PHRASE_KEYS.length));

  return (
    <div
      className="flex-1 w-full h-full flex flex-col items-center justify-center p-6 select-none overflow-hidden"
      style={{
        backgroundColor: 'transparent',
      }}
    >
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{
          maxWidth: '440px',
          padding: '32px 28px',
          borderRadius: '24px',
          backgroundColor: 'color-mix(in srgb, var(--surface-container, rgba(255, 255, 255, 0.04)) 40%, transparent)',
          boxSizing: 'border-box',
          gap: '16px',
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: '88px',
            height: '64px',
            color: 'var(--accent-color, #5865F2)',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="60 160 680 480"
            width="80"
            height="56"
            className="shrink-0"
            style={{ overflow: 'visible', display: 'block' }}
            aria-hidden="true"
          >
            <defs>
              <clipPath id={`${planetSvgId}-front-clip`}>
                <rect x="-600" y="0" width="1200" height="600" />
              </clipPath>
              <mask id={`${planetSvgId}-back-ring-mask`}>
                <rect x="0" y="0" width="800" height="800" fill="white" />
                <circle cx="400" cy="400" r="192" fill="black" />
              </mask>
              <mask id={`${planetSvgId}-planet-mask`}>
                <rect x="0" y="0" width="800" height="800" fill="white" />
                <g transform="translate(400, 400) rotate(-26)">
                  <path d="M 224 0 A 224 59 0 0 1 -224 0 L -376 0 A 376 121 0 0 0 376 0 Z" fill="black" />
                </g>
              </mask>
              <mask id={`${planetSvgId}-ring-hole`}>
                <rect x="-600" y="-600" width="1200" height="1200" fill="white" />
                <ellipse cx="0" cy="0" rx="240" ry="75" fill="black" />
              </mask>
            </defs>
            <g mask={`url(#${planetSvgId}-back-ring-mask)`}>
              <g transform="translate(400, 400) rotate(-26)">
                <ellipse cx="0" cy="0" rx="360" ry="105" fill="currentColor" mask={`url(#${planetSvgId}-ring-hole)`} />
              </g>
            </g>
            <circle cx="400" cy="400" r="175" fill="currentColor" mask={`url(#${planetSvgId}-planet-mask)`} />
            <g transform="translate(400, 400) rotate(-26)">
              <g clipPath={`url(#${planetSvgId}-front-clip)`}>
                <ellipse cx="0" cy="0" rx="360" ry="105" fill="currentColor" mask={`url(#${planetSvgId}-ring-hole)`} />
              </g>
            </g>
          </svg>
        </div>

        <span
          style={{
            fontSize: '15.5px',
            fontWeight: 600,
            lineHeight: 1.45,
            color: 'var(--text-main, #ffffff)',
            letterSpacing: '-0.01em',
          }}
        >
          {t(PHRASE_KEYS[phraseIndex], 'С кем сегодня будем общаться?')}
        </span>
      </div>
    </div>
  );
};
