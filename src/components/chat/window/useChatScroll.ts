import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore, type Message, isMessageOutgoing } from '../../../store/useChatStore';
import { useUploadProgressStore } from '../../../store/useUploadProgressStore';
import { getPusher, getGroupPusher } from '../../../utils/pusher';
import { ablyService } from '../../../services/ablyService';
import { groupService } from '../../../services/groupService';
import { supabaseService } from '../../../services/supabaseService';
import { mediaManager } from '../../../services/mediaManager';
import { sendEncryptedReadReceipt } from '../../../services/receiptService';
import { parseReplyChain, formatTimeOfDay } from '../../../utils/messageUtils';
import { saveChatScroll } from './chatWindowHelpers';

export interface UseChatScrollProps {
  activeChatId: string | null;
  activeChat: any;
  messages: Message[];
  visibleMessages: Message[];
  startIndex: number;
  hasMoreAbove: boolean;
  loadMoreAbove: () => void;
  renderedCount: number;
  setRenderedCount: React.Dispatch<React.SetStateAction<number>>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesContentRef: React.RefObject<HTMLDivElement | null>;
  atBottomRef: React.MutableRefObject<boolean>;
  lastChatSwitchTimeRef: React.MutableRefObject<number>;
  readMessageIdsRef: React.MutableRefObject<Set<string>>;
  myCode: string;
  myNickname: string;
  myUserId?: string;
  readReceiptsEnabled: boolean;
  pinnedMessage?: any;
  getDateLabel: (ts: number) => string;
  handleIsScrolling: (scrolling: boolean) => void;
  floatingDateTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setShowScrollDown: (v: boolean) => void;
  setHighlightedIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setShowFloatingDate: (v: boolean) => void;
  setFloatingDate: (v: string) => void;
  setFloatingDateOffsetY: (v: number) => void;
}

export interface UseChatScrollReturn {
  chatThumb: { top: number; height: number } | null;
  isChatActive: boolean;
  triggerChatActive: () => void;
  handleChatMouseLeave: () => void;
  handleMessagesWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  handleScroll: () => void;
  scrollToBottom: (smooth?: boolean) => void;
  scrollToPinnedMessage: () => void;
  handleJumpToSearchMessage: (targetIndex: number, messageId?: string) => void;
  handleQuoteClick: (q: { id?: string; sender: string; text: string; time: string }, currentMsgIndex: number) => void;
  notifyPeerReadBatch: (lastMsgId: string, lastTime: number, readIds?: string[]) => void;
}

export const useChatScroll = ({
  activeChatId,
  activeChat,
  messages,
  visibleMessages,
  startIndex,
  hasMoreAbove,
  loadMoreAbove,
  renderedCount,
  setRenderedCount,
  messagesContainerRef,
  messagesContentRef,
  atBottomRef,
  lastChatSwitchTimeRef,
  readMessageIdsRef,
  myCode,
  myNickname,
  myUserId,
  readReceiptsEnabled,
  pinnedMessage,
  getDateLabel,
  handleIsScrolling,
  floatingDateTimeoutRef,
  setShowScrollDown,
  setHighlightedIndex,
  setShowFloatingDate,
  setFloatingDate,
  setFloatingDateOffsetY,
}: UseChatScrollProps): UseChatScrollReturn => {
  const floatingDateRef = useRef<string | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  const [chatThumb, setChatThumb] = useState<{ top: number; height: number } | null>(null);
  const [isChatActive, setIsChatActive] = useState(false);
  const chatActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateChatThumb = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setChatThumb(null);
      return;
    }
    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    setChatThumb({ top: maxTop * ratio, height: thumbHeight });
  }, [messagesContainerRef]);

  const triggerChatActive = useCallback(() => {
    updateChatThumb();
    setIsChatActive(true);
    if (chatActiveTimerRef.current) clearTimeout(chatActiveTimerRef.current);
    chatActiveTimerRef.current = setTimeout(() => {
      setIsChatActive(false);
    }, 1000);
  }, [updateChatThumb]);

  const handleChatMouseLeave = useCallback(() => {
    if (chatActiveTimerRef.current) clearTimeout(chatActiveTimerRef.current);
    setIsChatActive(false);
  }, []);

  useEffect(() => {
    updateChatThumb();
  }, [visibleMessages.length, updateChatThumb]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    const content = messagesContentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let prevHeight = el.clientHeight;
    let prevContentHeight = content ? (content.scrollHeight || content.offsetHeight) : 0;
    const ro = new ResizeObserver((entries) => {
      updateChatThumb();
      for (const entry of entries) {
        if (entry.target === el) {
          const newHeight = entry.contentRect.height;
          if (prevHeight && Math.abs(newHeight - prevHeight) > 1) {
            const isCurrentlyAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 100;
            if (isCurrentlyAtBottom && atBottomRef.current) {
              el.scrollTop = el.scrollHeight;
              requestAnimationFrame(() => {
                if (el) {
                  el.scrollTop = el.scrollHeight;
                  atBottomRef.current = true;
                  setShowScrollDown(false);
                }
              });
            }
            prevHeight = newHeight;
          } else if (!prevHeight) {
            prevHeight = newHeight;
          }
        } else if (content && entry.target === content) {
          const currentContentHeight = content.scrollHeight || content.offsetHeight;
          if (Math.abs(currentContentHeight - prevContentHeight) > 1) {
            prevContentHeight = currentContentHeight;
            const isRecentlySwitched = performance.now() - lastChatSwitchTimeRef.current < 1500;
            const isCurrentlyAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
            if (atBottomRef.current || isRecentlySwitched || isCurrentlyAtBottom) {
              el.scrollTop = el.scrollHeight;
              atBottomRef.current = true;
              setShowScrollDown(false);
              if (activeChatId) {
                saveChatScroll(activeChatId, el);
              }
            }
          }
        }
      }
    });
    ro.observe(el);
    if (content) {
      ro.observe(content);
    }
    return () => ro.disconnect();
  }, [activeChatId, updateChatThumb, messagesContainerRef, messagesContentRef, atBottomRef, lastChatSwitchTimeRef, setShowScrollDown]);

  const handleMessagesWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      atBottomRef.current = false;
    }
  }, [atBottomRef]);

  useEffect(() => {
    const handleAbortUpload = () => {
      try {
        (window as any).orbita?.cancelUpload?.();
      } catch {}
      useUploadProgressStore.getState().clearAll();
      useChatStore.getState().setIsUploadingMedia(false);
      if (activeChatId) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId];
          if (!currentMsgs) return state;
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.filter((m) => !m.uploading && m.status !== 'sending'),
            },
          };
        });
      }
    };

    window.addEventListener('orbita:abort-media-upload', handleAbortUpload);
    return () => window.removeEventListener('orbita:abort-media-upload', handleAbortUpload);
  }, [activeChatId]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    if (performance.now() - lastChatSwitchTimeRef.current < 250) {
      setShowScrollDown(false);
      atBottomRef.current = true;
      return;
    }

    handleIsScrolling(true);
    triggerChatActive();

    const hasOverflow = el.scrollHeight > el.clientHeight + 20;
    const isAtBottom = !hasOverflow || (el.scrollHeight - el.scrollTop - el.clientHeight <= 60);
    if (atBottomRef.current !== isAtBottom) {
      atBottomRef.current = isAtBottom;
      setShowScrollDown(!isAtBottom && hasOverflow);
    }
    if (activeChatId) {
      saveChatScroll(activeChatId, el);
    }

    const virtualTopHeight = startIndex * 46;
    if (!atBottomRef.current && hasMoreAbove && (performance.now() - lastChatSwitchTimeRef.current >= 800)) {
      const topThreshold = startIndex > 0 ? (virtualTopHeight + 80) : 150;
      if (el.scrollTop <= topThreshold) {
        loadMoreAbove();
      }
    }

    if (floatingDateTimeoutRef.current) {
      clearTimeout(floatingDateTimeoutRef.current);
    }
    floatingDateTimeoutRef.current = setTimeout(() => {
      setShowFloatingDate(false);
      setFloatingDateOffsetY(0);
      if (messagesContainerRef.current) {
        messagesContainerRef.current.querySelectorAll<HTMLElement>('[data-date-divider]').forEach((d) => {
          d.style.opacity = '1';
        });
      }
    }, 1200);

    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      if (!messagesContainerRef.current) return;
      const container = messagesContainerRef.current;
      const rect = container.getBoundingClientRect();
      const TARGET_TOP = 12;

      const allDividers = Array.from(container.querySelectorAll<HTMLElement>('[data-date-divider]'));
      const passedDividers: { el: HTMLElement; label: string; top: number }[] = [];
      const upcomingDividers: { el: HTMLElement; label: string; top: number }[] = [];

      for (const div of allDividers) {
        const pill = div.querySelector<HTMLElement>('.date-badge-pill') || div;
        const top = pill.getBoundingClientRect().top - rect.top;
        const label = div.getAttribute('data-date-divider') || '';
        if (top <= TARGET_TOP) {
          passedDividers.push({ el: div, label, top });
        } else {
          upcomingDividers.push({ el: div, label, top });
        }
      }

      let activeDate: string | null = null;
      let pushOffsetY = 0;

      if (passedDividers.length > 0) {
        const current = passedDividers[passedDividers.length - 1];
        activeDate = current.label;
      } else if (startIndex > 0 && visibleMessages.length > 0) {
        activeDate = getDateLabel(visibleMessages[0].time);
      }

      if (upcomingDividers.length > 0 && activeDate) {
        const nextDist = upcomingDividers[0].top;
        if (nextDist < 42) {
          pushOffsetY = nextDist - 42;
        }
      }

      if (activeDate) {
        floatingDateRef.current = activeDate;
        setFloatingDate(activeDate);
        setShowFloatingDate(true);
        setFloatingDateOffsetY(pushOffsetY);
        for (const div of allDividers) {
          const isHidden = div.getAttribute('data-date-divider') === activeDate;
          div.style.opacity = isHidden ? '0' : '1';
        }
      } else {
        setShowFloatingDate(false);
        setFloatingDateOffsetY(0);
        for (const div of allDividers) {
          div.style.opacity = '1';
        }
      }
    });
  }, [
    handleIsScrolling,
    triggerChatActive,
    hasMoreAbove,
    loadMoreAbove,
    startIndex,
    visibleMessages,
    getDateLabel,
    activeChatId,
    messagesContainerRef,
    lastChatSwitchTimeRef,
    atBottomRef,
    setShowScrollDown,
    floatingDateTimeoutRef,
    setShowFloatingDate,
    setFloatingDate,
    setFloatingDateOffsetY,
  ]);

  const notifyPeerReadBatch = useCallback((lastMsgId: string, lastTime: number, readIds?: string[]) => {
    if (!readReceiptsEnabled || !activeChatId || activeChatId === 'notes') return;
    const allIds = readIds && readIds.length > 0 ? readIds : (lastMsgId ? [lastMsgId] : []);
    const isGroup = activeChat?.type === 'group';

    try {
      const pusher = isGroup ? getGroupPusher() : getPusher();
      const channelName = isGroup ? `presence-group-${activeChatId}` : `private-chat-${activeChatId}`;
      const channel = pusher.subscribe(channelName);
      const sendRead = () => channel.trigger('client-message', {
        type: 'read',
        messageId: lastMsgId,
        readIds: allIds,
        time: lastTime,
        sender: myNickname,
        senderUserId: myUserId,
        senderCode: myCode,
        senderId: myUserId || myCode,
      });
      if (channel.subscribed) sendRead();
      else channel.bind('pusher:subscription_succeeded', sendRead);
    } catch {}

    allIds.forEach((id) => {
      ablyService.markMessageRead(activeChatId, id);
    });

    ablyService.sendMessage(activeChatId, {
      type: 'read',
      messageId: lastMsgId,
      readIds: allIds,
      time: lastTime,
      sender: myNickname,
      senderUserId: myUserId,
      senderCode: myCode,
      senderId: myUserId || myCode,
    }).catch(() => {});

    if (isGroup) {
      groupService.markGroupMessagesRead({
        groupId: activeChatId,
        messageId: lastMsgId,
        readIds: allIds,
        time: lastTime,
        sender: myNickname,
        senderUserId: myUserId,
        senderCode: myCode,
      });
    } else {
      sendEncryptedReadReceipt(activeChatId, allIds, lastTime);
    }
  }, [readReceiptsEnabled, activeChatId, activeChat?.type, myNickname, myUserId, myCode]);

  useEffect(() => {
    if (!readReceiptsEnabled || !activeChatId || activeChatId === 'notes') return;

    const markUnreadInViewAsRead = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const state = useChatStore.getState();
      const currentMessages = state.messagesByChatId[activeChatId] || [];
      let hasChanges = false;
      let latestReadMsg: { id: string; time: number } | null = null;
      const readIds: string[] = [];

      const updatedMessages = currentMessages.map((m) => {
        if (!isMessageOutgoing(m, myCode, myNickname, activeChat, myUserId) && !m.read) {
          hasChanges = true;
          if (m.id) {
            readMessageIdsRef.current.add(m.id);
            readIds.push(m.id);
            ablyService.markMessageRead(activeChatId, m.id);
            latestReadMsg = { id: m.id, time: m.time };
          }
          return { ...m, read: true, status: 'read' as const };
        }
        return m;
      });

      if (hasChanges) {
        if (latestReadMsg) {
          notifyPeerReadBatch((latestReadMsg as any).id, (latestReadMsg as any).time, readIds);
        }
        useChatStore.setState((s) => ({
          messagesByChatId: {
            ...s.messagesByChatId,
            [activeChatId]: updatedMessages,
          },
        }));

        if (readIds.length > 0) {
          supabaseService.purgeServerMessages(activeChatId, readIds);
          const readMediaUrls: string[] = [];
          for (const m of updatedMessages) {
            if (m.id && readIds.includes(m.id)) {
              if (m.mediaUrl) readMediaUrls.push(m.mediaUrl);
              if (m.mediaItems && Array.isArray(m.mediaItems)) {
                for (const item of m.mediaItems) {
                  if (item?.url) readMediaUrls.push(item.url);
                }
              }
              if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
                (window as any).orbita.storageAddMessage(activeChatId, m.id, m).catch(() => {});
              }
            }
          }
          if (readMediaUrls.length > 0) {
            mediaManager.purgeServerMedia(readMediaUrls);
          }
        }
      }
    };

    markUnreadInViewAsRead();

    const handleFocus = () => markUnreadInViewAsRead();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markUnreadInViewAsRead();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const container = messagesContainerRef.current;
    if (!container) {
      return () => {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const state = useChatStore.getState();
        const currentMessages = state.messagesByChatId[activeChatId] || [];
        let hasChanges = false;
        let updatedMessages = currentMessages;
        let latestReadMsg: { id: string; time: number } | null = null;
        const readIds: string[] = [];

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const msgId = entry.target.getAttribute('data-message-id');
            if (msgId && !readMessageIdsRef.current.has(msgId)) {
              const msg = currentMessages.find((m) => m.id === msgId);
              if (msg && !isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId) && !msg.read) {
                readMessageIdsRef.current.add(msgId);
                readIds.push(msgId);
                hasChanges = true;
                ablyService.markMessageRead(activeChatId, msgId);
                latestReadMsg = { id: msgId, time: msg.time };

                if (updatedMessages === currentMessages) updatedMessages = [...currentMessages];
                const idx = updatedMessages.findIndex((m) => m.id === msgId);
                if (idx !== -1) {
                  updatedMessages[idx] = { ...updatedMessages[idx], read: true, status: 'read' as const };
                }
              }
            }
          }
        }

        if (hasChanges) {
          if (latestReadMsg) {
            notifyPeerReadBatch((latestReadMsg as any).id, (latestReadMsg as any).time, readIds);
          }
          useChatStore.setState((s) => ({
            messagesByChatId: {
              ...s.messagesByChatId,
              [activeChatId]: updatedMessages,
            },
          }));

          if (readIds.length > 0) {
            supabaseService.purgeServerMessages(activeChatId, readIds);
            const readMediaUrls: string[] = [];
            for (const m of updatedMessages) {
              if (m.id && readIds.includes(m.id)) {
                if (m.mediaUrl) readMediaUrls.push(m.mediaUrl);
                if (m.mediaItems && Array.isArray(m.mediaItems)) {
                  for (const item of m.mediaItems) {
                    if (item?.url) readMediaUrls.push(item.url);
                  }
                }
                if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
                  (window as any).orbita.storageAddMessage(activeChatId, m.id, m).catch(() => {});
                }
              }
            }
            if (readMediaUrls.length > 0) {
              mediaManager.purgeServerMedia(readMediaUrls);
            }
          }
        }
      },
      { root: container, threshold: 0.2 }
    );

    const messageElements = container.querySelectorAll('[data-message="true"]');
    messageElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeChatId, readReceiptsEnabled, myCode, myNickname, activeChat, myUserId, notifyPeerReadBatch, messagesContainerRef, readMessageIdsRef]);

  const scrollToPinnedMessage = () => {
    if (pinnedMessage) {
      let index = -1;
      if (pinnedMessage.id || pinnedMessage.messageId) {
        const targetId = pinnedMessage.id || pinnedMessage.messageId;
        index = messages.findIndex((m) => m.id === targetId);
      }
      if (index === -1) {
        index = messages.findIndex((m) => m.time === pinnedMessage.time && m.sender === pinnedMessage.sender);
      }
      if (index === -1) {
        index = messages.findIndex((m) => m.text === pinnedMessage.text && m.sender === pinnedMessage.sender);
      }
      if (index >= 0) {
        const neededCount = messages.length - index;
        if (neededCount > renderedCount) {
          setRenderedCount(neededCount + 10);
        }
        setTimeout(() => {
          const msg = messages[index];
          const el = messagesContainerRef.current?.querySelector(`[data-message-id="${msg.id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          setHighlightedIndex(index);
          setTimeout(() => {
            setHighlightedIndex((current) => (current === index ? null : current));
          }, 1200);
        }, 30);
      }
    }
  };

  const handleJumpToSearchMessage = useCallback((targetIndex: number, messageId?: string) => {
    if (targetIndex < 0 || targetIndex >= messages.length) return;
    const neededCount = messages.length - targetIndex;
    if (neededCount > renderedCount) {
      setRenderedCount(neededCount + 15);
    }
    setTimeout(() => {
      const msg = messages[targetIndex];
      const targetId = messageId || msg?.id;
      const el = targetId
        ? messagesContainerRef.current?.querySelector(`[data-message-id="${targetId}"]`)
        : null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setHighlightedIndex(targetIndex);
      setTimeout(() => {
        setHighlightedIndex((current) => (current === targetIndex ? null : current));
      }, 1500);
    }, 40);
  }, [messages, renderedCount, messagesContainerRef, setRenderedCount, setHighlightedIndex]);

  const jumpTarget = useChatStore((s) => s.inChatSearch?.jumpTarget);
  useEffect(() => {
    if (jumpTarget && jumpTarget.chatId === activeChatId) {
      handleJumpToSearchMessage(jumpTarget.messageIndex, jumpTarget.messageId);
    }
  }, [jumpTarget, activeChatId, handleJumpToSearchMessage]);

  const handleQuoteClick = useCallback(
    (q: { id?: string; sender: string; text: string; time: string }, currentMsgIndex: number) => {
      if (!messagesContainerRef.current) return;
      let targetIndex = -1;

      if (q.id) {
        targetIndex = messages.findIndex((m) => m.id === q.id);
      }

      if (targetIndex === -1) {
        for (let i = currentMsgIndex - 1; i >= 0; i--) {
          const m = messages[i];
          if (!m) continue;
          const { body } = parseReplyChain(m.text);
          const timeStr = formatTimeOfDay(m.time);
          const cleanMBody = body.trim();
          const cleanQText = q.text.trim();
          if (m.sender === q.sender && cleanMBody === cleanQText && timeStr === q.time) {
            targetIndex = i;
            break;
          }
        }
      }

      if (targetIndex === -1) {
        for (let i = currentMsgIndex - 1; i >= 0; i--) {
          const m = messages[i];
          if (!m) continue;
          const { body } = parseReplyChain(m.text);
          const timeStr = formatTimeOfDay(m.time);
          const cleanMBody = body.trim();
          const cleanQText = q.text.trim();
          if (
            m.sender === q.sender &&
            timeStr === q.time &&
            (cleanMBody.startsWith(cleanQText) || cleanQText.startsWith(cleanMBody))
          ) {
            targetIndex = i;
            break;
          }
        }
      }

      if (targetIndex === -1) {
        for (let i = currentMsgIndex - 1; i >= 0; i--) {
          const m = messages[i];
          if (!m) continue;
          const { body } = parseReplyChain(m.text);
          if (m.sender === q.sender && body.trim() === q.text.trim()) {
            targetIndex = i;
            break;
          }
        }
      }

      if (targetIndex >= 0) {
        const neededCount = messages.length - targetIndex;
        if (neededCount > renderedCount) {
          setRenderedCount(neededCount + 10);
        }
        setTimeout(() => {
          const msg = messages[targetIndex];
          const el = messagesContainerRef.current?.querySelector(`[data-message-id="${msg.id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          setHighlightedIndex(targetIndex);
          setTimeout(() => {
            setHighlightedIndex((current) => (current === targetIndex ? null : current));
          }, 1200);
        }, 30);
      }
    },
    [messages, renderedCount, messagesContainerRef, setRenderedCount, setHighlightedIndex]
  );

  const scrollToBottom = useCallback((smooth = false) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    setShowScrollDown(false);
    atBottomRef.current = true;
    if (activeChatId) {
      saveChatScroll(activeChatId, el);
    }
  }, [activeChatId, messagesContainerRef, atBottomRef, setShowScrollDown]);

  return {
    chatThumb,
    isChatActive,
    triggerChatActive,
    handleChatMouseLeave,
    handleMessagesWheel,
    handleScroll,
    scrollToBottom,
    scrollToPinnedMessage,
    handleJumpToSearchMessage,
    handleQuoteClick,
    notifyPeerReadBatch,
  };
};
