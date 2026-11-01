import { useState, useEffect, useRef } from 'react';
import { ablyService } from '../services/ablyService';

interface UseTypingStatusProps {
  chatId: string;
  userId: string;
}

export function useTypingStatus({ chatId, userId }: UseTypingStatusProps) {
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!chatId) return;

    let unsubscribe: (() => void) | null = null;
    let isCancelled = false;

    const timer = setTimeout(() => {
      if (isCancelled) return;

      unsubscribe = ablyService.subscribeToTyping(chatId, (typingUserId, typingStatus) => {
        if (typingUserId === userId) {
          return;
        }

        if (typingStatus) {
          setIsTyping(true);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
          }, 3000);
        } else {
          setIsTyping(false);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
          }
        }
      });
    }, 150);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      if (unsubscribe) {
        unsubscribe();
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [chatId, userId]);

  return { isTyping };
}
