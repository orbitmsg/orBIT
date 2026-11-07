import React from 'react';
import { useTypingStatus } from '../hooks/useTypingStatus';

interface TypingIndicatorProps {
  chatId: string;
  userId: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ chatId, userId }) => {
  const { isTyping } = useTypingStatus({ chatId, userId });

  if (!isTyping) {
    return null;
  }

  return (
    <span className="uppercase font-mono font-bold tracking-wider select-none" style={{ color: 'var(--accent-color, #6366f1)', fontSize: '9px' }}>
      Печатает<span className="animate-pulse">.</span><span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span><span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
    </span>
  );
};