import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../../store/useChatStore';
import { ablyService } from '../../../services/ablyService';

export interface UseChatInputAndTypingProps {
  activeChatId: string | null;
  myNickname: string;
  typingIndicatorsEnabled: boolean;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<any>;
  editingIndex: number | null;
  setEditText: React.Dispatch<React.SetStateAction<string>>;
  selection: any;
  triggerMessage?: (
    text: string,
    mediaPayload?: any,
    linkPreviewPayload?: any,
    existingMessageId?: string,
    mediaItemsPayload?: any
  ) => Promise<void> | void;
}

export interface UseChatInputAndTypingReturn {
  stopTyping: () => void;
  handleSetInputText: (text: string) => void;
  draftDebounceTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  isEmojiPanelOpen: boolean;
  activePickerTab: 'emoji' | 'stickers' | 'gif';
  setActivePickerTab: React.Dispatch<React.SetStateAction<'emoji' | 'stickers' | 'gif'>>;
  recentEmojis: string[];
  addRecentEmoji: (emoji: string) => void;
  emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
  handleEmojiSelect: (emoji: string) => void;
  handleSendGif: (gifOrUrl: any) => void;
  handleSendSticker: (stickerOrUrl: any) => void;
  handleEmojiPanelClose: () => void;
  toggleEmoji: () => void;
  handleEmojiMouseEnter: () => void;
  handleEmojiMouseLeave: () => void;
  headerRef: React.RefObject<HTMLDivElement | null>;
  headerHeight: number;
  handleMessageClick: (e: React.MouseEvent, messageId: string) => void;
}

export const useChatInputAndTyping = ({
  activeChatId,
  myNickname,
  typingIndicatorsEnabled,
  setInputText,
  inputRef,
  editingIndex,
  setEditText,
  selection,
  triggerMessage,
}: UseChatInputAndTypingProps): UseChatInputAndTypingReturn => {
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTypingSentRef = useRef<boolean>(false);
  const lastTypingSentTimeRef = useRef<number>(0);
  const draftDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emojiHoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emojiHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSelectionRangeRef = useRef<Range | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);

  const isEmojiPanelOpen = useChatStore((s) => s.isEmojiPanelOpen);
  const setEmojiPanelOpen = useChatStore((s) => s.setEmojiPanelOpen);
  const getRecentEmojis = useChatStore((s) => s.getRecentEmojis);
  const addRecentEmoji = useChatStore((s) => s.addRecentEmoji);
  const recentEmojis = getRecentEmojis();
  const [activePickerTab, setActivePickerTab] = useState<'emoji' | 'stickers' | 'gif'>('emoji');

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !inputRef.current) return;
      if (inputRef.current.contains(sel.anchorNode)) {
        savedSelectionRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [inputRef]);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingHeartbeatRef.current) {
      clearInterval(typingHeartbeatRef.current);
      typingHeartbeatRef.current = null;
    }
    if (activeChatId && activeChatId !== 'notes' && isTypingSentRef.current) {
      ablyService.sendTyping(activeChatId, false, myNickname);
      isTypingSentRef.current = false;
      lastTypingSentTimeRef.current = 0;
    }
  }, [activeChatId, myNickname]);

  const handleSetInputText = useCallback((text: string) => {
    setInputText(text);
    const currentActiveId = activeChatId || useChatStore.getState().activeChatId;
    if (currentActiveId && currentActiveId !== 'notes') {
      if (draftDebounceTimerRef.current) {
        clearTimeout(draftDebounceTimerRef.current);
      }
      draftDebounceTimerRef.current = setTimeout(() => {
        useChatStore.getState().setDraft(currentActiveId, text);
        draftDebounceTimerRef.current = null;
      }, 500);
    }
    if (!currentActiveId || currentActiveId === 'notes' || !typingIndicatorsEnabled) return;

    if (text.trim().length > 0) {
      const now = Date.now();
      if (!isTypingSentRef.current || now - lastTypingSentTimeRef.current >= 4500) {
        ablyService.sendTyping(currentActiveId, true, myNickname);
        isTypingSentRef.current = true;
        lastTypingSentTimeRef.current = now;
      }
      if (!typingHeartbeatRef.current) {
        typingHeartbeatRef.current = setInterval(() => {
          if (activeChatId && activeChatId !== 'notes') {
            ablyService.sendTyping(activeChatId, true, myNickname);
            lastTypingSentTimeRef.current = Date.now();
          }
        }, 4000);
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = setTimeout(() => {
        stopTyping();
      }, 5000);
    } else {
      stopTyping();
    }
  }, [activeChatId, myNickname, stopTyping, typingIndicatorsEnabled, setInputText]);

  useEffect(() => {
    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
    if (activeChatId) {
      const savedDraft = useChatStore.getState().draftsByChatId[activeChatId] || '';
      setInputText(savedDraft);
    } else {
      setInputText('');
    }
    return () => {
      if (draftDebounceTimerRef.current) {
        clearTimeout(draftDebounceTimerRef.current);
        draftDebounceTimerRef.current = null;
      }
    };
  }, [activeChatId, setInputText]);

  useEffect(() => {
    if (!activeChatId || activeChatId === 'notes' || !typingIndicatorsEnabled) return;
    const typingUnsubscribe = ablyService.subscribeToTyping(activeChatId);
    return () => {
      typingUnsubscribe();
    };
  }, [activeChatId, typingIndicatorsEnabled]);

  useEffect(() => {
    if (!activeChatId || activeChatId === 'notes' || !typingIndicatorsEnabled) return;
    if (isEmojiPanelOpen && activePickerTab === 'stickers') {
      ablyService.sendTyping(activeChatId, true, myNickname, 'sticker');
      const timer = setInterval(() => {
        if (activeChatId && activeChatId !== 'notes') {
          ablyService.sendTyping(activeChatId, true, myNickname, 'sticker');
        }
      }, 1500);
      return () => {
        clearInterval(timer);
        if (activeChatId && activeChatId !== 'notes') {
          ablyService.sendTyping(activeChatId, false, myNickname, 'sticker');
        }
      };
    }
  }, [isEmojiPanelOpen, activePickerTab, activeChatId, myNickname, typingIndicatorsEnabled]);

  const handleEmojiSelect = (emoji: string) => {
    if (inputRef.current) {
      inputRef.current.focus();
      const sel = window.getSelection();
      let range: Range | null = null;

      if (
        savedSelectionRangeRef.current &&
        inputRef.current.contains(savedSelectionRangeRef.current.commonAncestorContainer)
      ) {
        range = savedSelectionRangeRef.current;
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } else if (sel && sel.rangeCount > 0 && inputRef.current.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else {
        range = document.createRange();
        range.selectNodeContents(inputRef.current);
        range.collapse(false);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      if (range) {
        range.deleteContents();
        const textNode = document.createTextNode(emoji);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        savedSelectionRangeRef.current = range.cloneRange();
      }

      inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      if (editingIndex !== null) {
        setEditText((prev) => prev + emoji);
      } else {
        setInputText((prev) => prev + emoji);
      }
    }
  };

  const handleSendGif = (gifOrUrl: any) => {
    const url = typeof gifOrUrl === 'string' ? gifOrUrl : gifOrUrl?.url;
    const rawTitle = typeof gifOrUrl === 'object' && gifOrUrl?.title ? gifOrUrl.title : 'animation';
    const cleanTitle = rawTitle.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40) || 'animation';
    const fileName = `${cleanTitle}.mp4`;

    triggerMessage?.(`[GIF] ${url}`, {
      type: 'video',
      url: url,
      name: fileName,
      mime: 'video/mp4',
    });
    setEmojiPanelOpen(false);
  };

  const handleSendSticker = (stickerOrUrl: any) => {
    const url = typeof stickerOrUrl === 'string' ? stickerOrUrl : stickerOrUrl?.url;
    const name = typeof stickerOrUrl === 'object' && stickerOrUrl?.name ? stickerOrUrl.name : 'sticker';
    const isTgs = url?.endsWith('.tgs');

    triggerMessage?.(`[Sticker] ${url}`, {
      type: 'sticker' as any,
      url: url,
      name: name,
      mime: isTgs ? 'application/x-tgsticker' : 'image/webp',
    });
    setEmojiPanelOpen(false);
  };

  const handleEmojiPanelClose = () => {
    if (emojiHoverOpenTimerRef.current) {
      clearTimeout(emojiHoverOpenTimerRef.current);
      emojiHoverOpenTimerRef.current = null;
    }
    if (emojiHoverCloseTimerRef.current) {
      clearTimeout(emojiHoverCloseTimerRef.current);
      emojiHoverCloseTimerRef.current = null;
    }
    setEmojiPanelOpen(false);
    inputRef.current?.focus();
  };

  const toggleEmoji = useCallback(() => {
    if (emojiHoverOpenTimerRef.current) {
      clearTimeout(emojiHoverOpenTimerRef.current);
      emojiHoverOpenTimerRef.current = null;
    }
    if (emojiHoverCloseTimerRef.current) {
      clearTimeout(emojiHoverCloseTimerRef.current);
      emojiHoverCloseTimerRef.current = null;
    }
    setEmojiPanelOpen(!isEmojiPanelOpen);
  }, [isEmojiPanelOpen, setEmojiPanelOpen]);

  const handleEmojiMouseEnter = useCallback(() => {
    if (emojiHoverCloseTimerRef.current) {
      clearTimeout(emojiHoverCloseTimerRef.current);
      emojiHoverCloseTimerRef.current = null;
    }
    if (!useChatStore.getState().isEmojiPanelOpen) {
      if (emojiHoverOpenTimerRef.current) clearTimeout(emojiHoverOpenTimerRef.current);
      emojiHoverOpenTimerRef.current = setTimeout(() => {
        useChatStore.getState().setEmojiPanelOpen(true);
      }, 200);
    }
  }, []);

  const handleEmojiMouseLeave = useCallback(() => {
    if (emojiHoverOpenTimerRef.current) {
      clearTimeout(emojiHoverOpenTimerRef.current);
      emojiHoverOpenTimerRef.current = null;
    }
    if (!useChatStore.getState().isEmojiPanelOpen) return;
    if (emojiHoverCloseTimerRef.current) clearTimeout(emojiHoverCloseTimerRef.current);
    emojiHoverCloseTimerRef.current = setTimeout(() => {
      useChatStore.getState().setEmojiPanelOpen(false);
    }, 300);
  }, []);

  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(56);

  useEffect(() => {
    if (!headerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderHeight(entry.contentRect.height);
      }
    });
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleMessageClick = useCallback((e: React.MouseEvent, messageId: string) => {
    if (selection?.isSelectionMode) {
      e.stopPropagation();
      selection.toggleSelection(messageId);
    }
  }, [selection?.isSelectionMode, selection?.toggleSelection]);

  useEffect(() => {
    selection?.clearSelection?.();
  }, [activeChatId, selection?.clearSelection]);

  return {
    stopTyping,
    handleSetInputText,
    draftDebounceTimerRef,
    isEmojiPanelOpen,
    activePickerTab,
    setActivePickerTab,
    recentEmojis,
    addRecentEmoji,
    emojiButtonRef,
    handleEmojiSelect,
    handleSendGif,
    handleSendSticker,
    handleEmojiPanelClose,
    toggleEmoji,
    handleEmojiMouseEnter,
    handleEmojiMouseLeave,
    headerRef,
    headerHeight,
    handleMessageClick,
  };
};
