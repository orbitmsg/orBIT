import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OrbitIcon } from '../common/OrbitBrand';
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
          maxWidth: '460px',
          boxSizing: 'border-box',
          gap: '18px',
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: '76px',
            height: '76px',
          }}
        >
          <OrbitIcon size={76} />
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
