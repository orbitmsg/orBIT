import React, { useRef, useEffect, useState, memo, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useChatStore, type LinkPreviewData } from '../../store/useChatStore';
import { InputContextMenu, FormattingType } from './InputContextMenu';
import { extractFirstUrl, fetchLinkPreview } from '../../utils/linkPreviewUtils';
import { htmlToMarkdown, markdownToHtml } from '../../utils/messageUtils';
import { supportService } from '../../services/supportService';
import {
  FileWithArrowIcon,
  AttachIcon,
  EmojiIcon,
  MicIcon,
  SendIcon,
  ConfirmEditIcon,
} from './input/MessageInputIcons';
import { MessageInputCommandsMenu } from './input/MessageInputCommandsMenu';
import { MessageInputLinkPreview } from './input/MessageInputLinkPreview';
import { MessageInputActionBanner } from './input/MessageInputActionBanner';
import { MessageInputVoiceRecorder } from './input/MessageInputVoiceRecorder';

export { htmlToMarkdown, markdownToHtml };

interface MessageInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  editingIndex: number | null;
  editingOriginalText?: string;
  onCancelEdit?: () => void;
  editText: string;
  setEditText: (text: string) => void;
  replyingTo: { index: number; sender: string; text: string; time: number } | null;
  setReplyingTo: (reply: null | { index: number; sender: string; text: string; time: number }) => void;
  isRecording: boolean;
  isRecordingPaused?: boolean;
  recordingTime: number;
  recordingAmplitude?: number;
  onSendMessage: (overrideText?: string, linkPreview?: LinkPreviewData) => void;
  onEditMessage: (overrideText?: string) => void;
  onStopRecording: () => void;
  onStartRecording: () => void;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onCancelRecording?: () => void;
  onFilePick: () => void;
  onToggleEmoji: () => void;
  isEmojiOpen: boolean;
  canSend: boolean;
  isPrivateChat: boolean;
  isChannel?: boolean;
  isRatchetReady?: boolean;
  emojiButtonRef: React.RefObject<HTMLButtonElement | null>;
  inputRef?: React.RefObject<HTMLDivElement | null>;
  onOpenTxtModal?: () => void;
  onEmojiMouseEnter?: () => void;
  onEmojiMouseLeave?: () => void;
}

export const MessageInput = memo<MessageInputProps>(({
  inputText,
  setInputText,
  editingIndex,
  editingOriginalText,
  onCancelEdit,
  editText,
  setEditText,
  replyingTo,
  setReplyingTo,
  isRecording,
  isRecordingPaused = false,
  recordingTime,
  recordingAmplitude = 0,
  onSendMessage,
  onEditMessage,
  onStopRecording,
  onStartRecording,
  onPauseRecording: _onPauseRecording,
  onResumeRecording: _onResumeRecording,
  onCancelRecording,
  onFilePick,
  onToggleEmoji,
  isEmojiOpen,
  canSend,
  isPrivateChat: _isPrivateChat,
  isChannel = false,
  isRatchetReady = true,
  emojiButtonRef,
  inputRef,
  onOpenTxtModal,
  onEmojiMouseEnter,
  onEmojiMouseLeave,
}) => {
  const { t, i18n } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const sendOnEnter = useChatStore((state) => state.sendOnEnter);
  const pendingForwardMessages = useChatStore((state) => state.pendingForwardMessages);
  const setPendingForwardMessages = useChatStore((state) => state.setPendingForwardMessages);
  const anonymousForwardingEnabled = useChatStore((state) => state.anonymousForwardingEnabled);

  const [hoverAttach, setHoverAttach] = useState(false);
  const [hoverEmoji, setHoverEmoji] = useState(false);
  const [hoverMic, setHoverMic] = useState(false);

  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [isHoldingVoice, setIsHoldingVoice] = useState(false);
  const [isLockedRecording, setIsLockedRecording] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);
  const dragStartYRef = useRef(0);
  const holdStartTimeRef = useRef(0);
  const hasLockedRef = useRef(false);

  useEffect(() => {
    if (!isRecording) {
      setIsHoldingVoice(false);
      setIsLockedRecording(false);
      setLockProgress(0);
      hasLockedRef.current = false;
    }
  }, [isRecording]);

  useEffect(() => {
    if (!isHoldingVoice) return;

    const handlePointerMove = (e: MouseEvent) => {
      if (hasLockedRef.current) return;
      const deltaY = dragStartYRef.current - e.clientY;
      const progress = Math.min(1, Math.max(0, deltaY / 80));
      setLockProgress(progress);

      if (deltaY >= 80) {
        hasLockedRef.current = true;
        setIsLockedRecording(true);
        setIsHoldingVoice(false);
      }
    };

    const handlePointerUp = (e: MouseEvent) => {
      setIsHoldingVoice(false);

      if (hasLockedRef.current) {
        return;
      }

      const elapsed = Date.now() - holdStartTimeRef.current;
      if (elapsed < 400) {
        if (onCancelRecording) onCancelRecording();
        return;
      }

      const rect = inputContainerRef.current?.getBoundingClientRect();
      if (
        rect &&
        (e.clientX < rect.left - 40 ||
          e.clientX > rect.right + 40 ||
          e.clientY < rect.top - 120 ||
          e.clientY > rect.bottom + 60)
      ) {
        if (onCancelRecording) onCancelRecording();
        return;
      }

      onStopRecording();
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [isHoldingVoice, onCancelRecording, onStopRecording]);

  const handleMicMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !isRatchetReady) return;
    e.preventDefault();
    setIsHoldingVoice(true);
    setIsLockedRecording(false);
    setLockProgress(0);
    dragStartYRef.current = e.clientY;
    holdStartTimeRef.current = Date.now();
    hasLockedRef.current = false;
    onStartRecording();
  }, [isRatchetReady, onStartRecording]);

  useEffect(() => {
    setHoverMic(false);
    setHoverAttach(false);
    setHoverEmoji(false);
  }, [isRecording]);

  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const [linkModalData, setLinkModalData] = useState<{ open: boolean; text: string; url: string; range: Range | null }>({ open: false, text: '', url: '', range: null });

  const currentText = editingIndex !== null ? editText : inputText;
  const setCurrentText = editingIndex !== null ? setEditText : setInputText;

  const linkPreviewsEnabled = useChatStore((state) => state.linkPreviewsEnabled);
  const [liveLinkPreview, setLiveLinkPreview] = useState<LinkPreviewData | null>(null);
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);

  const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeChatId = useChatStore((state) => state.activeChatId);
  const [slashQuery, setSlashQuery] = useState('');
  const [showCommandsMenu, setShowCommandsMenu] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const availableCommands = useMemo(() => {
    if (activeChatId === 'system_support') {
      if (supportService.isAdmin) {
        return [
          { command: '/reply', desc: t('commands.support_admin_reply_desc', 'Ответить на обращение: /reply #T-XXXXX <текст>') },
          { command: '/tickets', desc: t('commands.support_admin_tickets_desc', 'Показать список открытых обращений') },
          { command: '/help', desc: t('support.admin_help', 'Справка администратора поддержки') },
        ];
      }
      return [
        { command: '/start', desc: t('commands.support_start_desc', 'Начать диалог с поддержкой') },
        { command: '/ticket', desc: t('commands.support_ticket_desc', 'Проверить статус обращений') },
        { command: '/help', desc: t('commands.support_help_desc', 'Как получить помощь') },
        { command: '/faq', desc: t('commands.support_faq_desc', 'Частые вопросы перед обращением') },
      ];
    }
    return [
      { command: '/start', desc: t('commands.start_desc', 'Запустить бота и получить приветствие') },
      { command: '/help', desc: t('commands.help_desc', 'Справка и список возможностей') },
      { command: '/backup', desc: t('commands.backup_desc', 'Инструкция и создание резервной копии') },
      { command: '/channels', desc: t('commands.channels_desc', 'Официальные каналы и новости') },
      { command: '/security', desc: t('commands.security_desc', 'Сквозное шифрование и безопасность') },
      { command: '/privacy', desc: t('commands.privacy_desc', 'Конфиденциальность и скрытие ID') },
      { command: '/calls', desc: t('commands.calls_desc', 'Голосовые и видеозвонки P2P') },
      { command: '/appearance', desc: t('commands.appearance_desc', 'Оформление, темы и кастомизация') },
      { command: '/network', desc: t('commands.network_desc', 'Сеть, WebRTC и прокси') },
      { command: '/proxy', desc: t('commands.proxy_desc', 'Настройки сетевого прокси') },
      { command: '/faq', desc: t('commands.faq_desc', 'Часто задаваемые вопросы') },
      { command: '/about', desc: t('commands.about_desc', 'О мессенджере Orbita') },
    ];
  }, [activeChatId, t]);

  const filteredCommands = useMemo(() => {
    if (!slashQuery.startsWith('/')) return [];
    const q = slashQuery.slice(1).toLowerCase().trim();
    if (!q) return availableCommands;
    return availableCommands.filter((c) => c.command.slice(1).toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
  }, [availableCommands, slashQuery]);

  const executeCommand = useCallback((cmdStr: string) => {
    setShowCommandsMenu(false);
    setSlashQuery('');
    if (cmdStr === '/reply') {
      setCurrentText('/reply ');
      if (editorRef.current) {
        editorRef.current.innerHTML = '/reply ';
        setIsEditorEmpty(false);
        placeCaretAtEnd(editorRef.current);
      }
      return;
    }
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
      setIsEditorEmpty(true);
    }
    setCurrentText('');
    onSendMessage(cmdStr);
  }, [onSendMessage, setCurrentText]);

  useEffect(() => {
    const trimmed = currentText.trim();
    if (trimmed.startsWith('/')) {
      setSlashQuery(trimmed);
      setShowCommandsMenu(true);
      setSelectedCommandIndex(0);
    } else {
      setShowCommandsMenu(false);
      setSlashQuery('');
    }
  }, [currentText]);

  useEffect(() => {
    if (!linkPreviewsEnabled || editingIndex !== null) {
      setLiveLinkPreview(null);
      return;
    }
    if (linkPreviewTimerRef.current) clearTimeout(linkPreviewTimerRef.current);
    linkPreviewTimerRef.current = setTimeout(() => {
      const url = extractFirstUrl(currentText);
      if (!url || url === dismissedUrl) {
        if (!url) setDismissedUrl(null);
        setLiveLinkPreview(null);
        return;
      }
      let isMounted = true;
      fetchLinkPreview(url).then((data) => {
        if (isMounted) {
          setLiveLinkPreview(data);
        }
      });
    }, 400);

    return () => {
      if (linkPreviewTimerRef.current) clearTimeout(linkPreviewTimerRef.current);
    };
  }, [currentText, linkPreviewsEnabled, dismissedUrl, editingIndex]);

  // Track true emptiness for placeholder rendering locally without lagging the main thread
  const [isEditorEmpty, setIsEditorEmpty] = useState(!currentText.trim());

  // Forward ref for external components if needed
  useEffect(() => {
    if (inputRef) {
      (inputRef as React.MutableRefObject<HTMLDivElement | null>).current = editorRef.current;
    }
  }, [inputRef]);

  const placeCaretAtEnd = (el: HTMLElement) => {
    el.focus();
    if (typeof window.getSelection !== 'undefined' && typeof document.createRange !== 'undefined') {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  };

  useEffect(() => {
    if (editorRef.current) {
      setTimeout(() => {
        if (editorRef.current) {
          placeCaretAtEnd(editorRef.current);
        }
      }, 0);
    }
  }, [editingIndex, replyingTo, activeChatId]);

  const isInternalInputRef = useRef(false);
  const syncDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevEditingIndexRef = useRef(editingIndex);

  useEffect(() => {
    return () => {
      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current);
        syncDebounceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      if (editingIndex !== prevEditingIndexRef.current) {
        prevEditingIndexRef.current = editingIndex;
        editorRef.current.innerHTML = currentText ? markdownToHtml(currentText, 'inherit', true) : '';
        setIsEditorEmpty(currentText.trim() === '');
        setTimeout(() => {
          if (editorRef.current) {
            placeCaretAtEnd(editorRef.current);
          }
        }, 0);
        return;
      }

      if (document.activeElement === editorRef.current) {
        return;
      }

      if (isInternalInputRef.current) {
        isInternalInputRef.current = false;
        return;
      }

      if (currentText === '') {
        if (editorRef.current.innerHTML !== '') {
          editorRef.current.innerHTML = '';
        }
        setIsEditorEmpty(true);
        return;
      }

      const currentMd = htmlToMarkdown(editorRef.current);
      if (currentMd.trim() !== currentText.trim()) {
        editorRef.current.innerHTML = markdownToHtml(currentText, 'inherit', true);
        setIsEditorEmpty(currentText.trim() === '');
        setTimeout(() => {
          if (editorRef.current) {
            placeCaretAtEnd(editorRef.current);
          }
        }, 0);
      }
    }
  }, [currentText, editingIndex]);

  useEffect(() => {
    const handleWindowPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target === editorRef.current ||
        editorRef.current?.contains(target) ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('[role="dialog"]') ||
        target.closest('.modal-container') ||
        target.closest('.orbita-context-menu') ||
        target.closest('.orbita-modal')
      ) {
        return;
      }
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) {
        return;
      }
      requestAnimationFrame(() => {
        if (editorRef.current && document.activeElement !== editorRef.current) {
          placeCaretAtEnd(editorRef.current);
        }
      });
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active !== editorRef.current && active.getAttribute('contenteditable') === 'true') ||
          active.closest('[role="dialog"]') ||
          active.closest('.modal-container') ||
          active.closest('.orbita-modal'))
      ) {
        return;
      }
      if (e.key.length === 1 && editorRef.current && active !== editorRef.current) {
        editorRef.current.focus();
        placeCaretAtEnd(editorRef.current);
      }
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  const handleEditorBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (
      related &&
      (related.tagName === 'INPUT' ||
        related.tagName === 'TEXTAREA' ||
        related.getAttribute('contenteditable') === 'true' ||
        related.closest('[role="dialog"]') ||
        related.closest('.modal-container') ||
        related.closest('.orbita-modal'))
    ) {
      return;
    }
    requestAnimationFrame(() => {
      if (editorRef.current && document.activeElement !== editorRef.current) {
        placeCaretAtEnd(editorRef.current);
      }
    });
  };

  const cancelCurrentAction = () => {
    if (editingIndex !== null) {
      if (onCancelEdit) {
        onCancelEdit();
      } else {
        setEditText('');
      }
    } else if (replyingTo) {
      setReplyingTo(null);
    } else if (pendingForwardMessages) {
      setPendingForwardMessages(null);
    }
    if (editorRef.current) {
      placeCaretAtEnd(editorRef.current);
    }
  };

  const syncEditorToState = useCallback(() => {
    if (editorRef.current) {
      isInternalInputRef.current = true;
      const md = htmlToMarkdown(editorRef.current);
      setCurrentText(md);
    }
  }, [setCurrentText]);

  const handleEditorInput = () => {
    const el = editorRef.current;
    if (!el) return;
    isInternalInputRef.current = true;
    const raw = (el.textContent || '').replace(/\u200B/g, '');
    const empty = raw.trim() === '';
    if (empty !== isEditorEmpty) {
      setIsEditorEmpty(empty);
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith('/')) {
      setSlashQuery(trimmed);
      setShowCommandsMenu(true);
      setSelectedCommandIndex(0);
    } else {
      setShowCommandsMenu(false);
      setSlashQuery('');
    }

    if (empty) {
      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current);
        syncDebounceTimerRef.current = null;
      }
      setCurrentText('');
      const currentChatId = activeChatId || useChatStore.getState().activeChatId;
      if (currentChatId) {
        useChatStore.getState().clearDraft(currentChatId);
      }
      return;
    }

    if (syncDebounceTimerRef.current) clearTimeout(syncDebounceTimerRef.current);
    syncDebounceTimerRef.current = setTimeout(() => {
      syncEditorToState();
    }, 200);
  };

  const handleSend = () => {
    if (!isRatchetReady) return;
    setShowCommandsMenu(false);
    setSlashQuery('');
    if (syncDebounceTimerRef.current) {
      clearTimeout(syncDebounceTimerRef.current);
      syncDebounceTimerRef.current = null;
    }
    let textToSend = currentText;
    if (editorRef.current) {
      textToSend = htmlToMarkdown(editorRef.current);
      editorRef.current.innerHTML = '';
      setIsEditorEmpty(true);
    }
    isInternalInputRef.current = false;
    setCurrentText('');
    const targetChatId = activeChatId || useChatStore.getState().activeChatId;
    if (targetChatId) {
      useChatStore.getState().clearDraft(targetChatId);
    }
    const hasForward = Boolean(useChatStore.getState().pendingForwardMessages?.length);
    if (!textToSend.trim() && !hasForward) return;
    if (editingIndex !== null) {
      onEditMessage(textToSend);
      if (onCancelEdit) {
        onCancelEdit();
      } else {
        setEditText('');
      }
    } else {
      onSendMessage(textToSend, liveLinkPreview || undefined);
      setLiveLinkPreview(null);
      setDismissedUrl(null);
    }
  };

  const applyFormatting = (type: FormattingType) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    switch (type) {
      case 'bold':
        document.execCommand('bold', false);
        break;
      case 'italic':
        document.execCommand('italic', false);
        break;
      case 'underline':
        document.execCommand('underline', false);
        break;
      case 'strikethrough':
        document.execCommand('strikeThrough', false);
        break;
      case 'monospace': {
        const codeEl = document.createElement('code');
        codeEl.style.fontFamily = 'monospace';
        codeEl.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
        codeEl.style.padding = '2px 4px';
        codeEl.style.borderRadius = '4px';
        try {
          range.surroundContents(codeEl);
        } catch {
          document.execCommand('insertHTML', false, `<code style="font-family:monospace;background:rgba(255,255,255,0.12);padding:2px 4px;border-radius:4px;">${sel.toString()}</code>`);
        }
        break;
      }
      case 'quote': {
        const blockquoteEl = document.createElement('blockquote');
        blockquoteEl.style.borderLeft = '3px solid var(--accent-color, #7C3AED)';
        blockquoteEl.style.paddingLeft = '8px';
        blockquoteEl.style.margin = '4px 0';
        try {
          range.surroundContents(blockquoteEl);
        } catch {
          document.execCommand('insertHTML', false, `<blockquote style="border-left:3px solid var(--accent-color, #7C3AED);padding-left:8px;margin:4px 0;">${sel.toString() || t('inputContextMenu.quote')}</blockquote>`);
        }
        break;
      }
      case 'link': {
        setIsContextMenuOpen(false);
        setLinkModalData({ open: true, text: sel.toString(), url: '', range: range.cloneRange() });
        break;
      }
      case 'spoiler': {
        const spoilerEl = document.createElement('span');
        spoilerEl.className = 'spoiler';
        spoilerEl.setAttribute('data-spoiler', 'true');
        spoilerEl.style.backgroundColor = 'rgba(255, 255, 255, 0.18)';
        spoilerEl.style.filter = 'blur(3px)';
        spoilerEl.style.padding = '0 3px';
        spoilerEl.style.borderRadius = '4px';
        try {
          range.surroundContents(spoilerEl);
        } catch {
          document.execCommand('insertHTML', false, `<span class="spoiler" data-spoiler="true" style="background:rgba(255,255,255,0.18);filter:blur(3px);padding:0 3px;border-radius:4px;">${sel.toString()}</span>`);
        }
        break;
      }
      case 'date': {
        const dateLocale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';
        const dateStr = new Date().toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        document.execCommand('insertText', false, dateStr);
        break;
      }
      case 'clear':
        document.execCommand('removeFormat', false);
        break;
    }
    syncEditorToState();
    if (editorRef.current) {
      placeCaretAtEnd(editorRef.current);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isCmdOrCtrl = e.ctrlKey || e.metaKey;

    if (isCmdOrCtrl) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        applyFormatting('bold');
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        applyFormatting('italic');
        return;
      }
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        applyFormatting('underline');
        return;
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        applyFormatting('link');
        return;
      }
      if (e.shiftKey) {
        if (e.key === 'X' || e.key === 'x') {
          e.preventDefault();
          applyFormatting('strikethrough');
          return;
        }
        if (e.key === 'M' || e.key === 'm') {
          e.preventDefault();
          applyFormatting('monospace');
          return;
        }
        if (e.key === 'P' || e.key === 'p') {
          e.preventDefault();
          applyFormatting('spoiler');
          return;
        }
      }
    }

    if (showCommandsMenu && filteredCommands.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const targetCmd = filteredCommands[selectedCommandIndex] || filteredCommands[0];
        if (targetCmd) {
          executeCommand(targetCmd.command);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommandsMenu(false);
        return;
      }
    }

    if (e.key === 'Enter') {
      if (sendOnEnter) {
        if (!e.shiftKey && !isCmdOrCtrl) {
          e.preventDefault();
          if (editingIndex !== null) {
            handleSend();
          } else {
            if (canSend || !isEditorEmpty) {
              handleSend();
            }
          }
        }
      } else {
        if (isCmdOrCtrl) {
          e.preventDefault();
          if (editingIndex !== null) {
            handleSend();
          } else {
            if (canSend || !isEditorEmpty) {
              handleSend();
            }
          }
        }
      }
    }
    if (e.key === 'Escape') {
      if (isRecordingActive) {
        setIsLockedRecording(false);
        setIsHoldingVoice(false);
        setLockProgress(0);
        hasLockedRef.current = false;
        if (onCancelRecording) onCancelRecording();
        return;
      }
      cancelCurrentAction();
    }
  };

  const handleEditorContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const sel = window.getSelection();
    setHasSelection(!!(sel && sel.toString().trim().length > 0));
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setIsContextMenuOpen(true);
  };

  const isHasContent = canSend || !isEditorEmpty;
  const attachColor = hoverAttach ? 'var(--text-main)' : 'var(--text-dim)';
  const emojiColor = (hoverEmoji || isEmojiOpen) ? 'var(--text-main)' : 'var(--text-dim)';
  const micColor = (isRecording || (isHasContent && !isRecording)) ? (hoverMic ? 'var(--text-main)' : 'var(--accent-color)') : (hoverMic ? 'var(--text-main)' : 'var(--text-dim)');

  const showActionBanner = editingIndex !== null || replyingTo !== null || Boolean(pendingForwardMessages && pendingForwardMessages.length > 0);
  const isRecordingActive = isRecording || isRecordingPaused || isHoldingVoice || isLockedRecording;

  return (
    <div
      ref={inputContainerRef}
      style={{
        position: 'relative',
        flexShrink: 0,
        zIndex: 10,
        backgroundColor: 'transparent',
        padding: '6px 14px 10px 14px',
        borderTop: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        overflow: 'visible',
      }}
    >
      {showCommandsMenu && filteredCommands.length > 0 && !isRecordingActive && (
        <MessageInputCommandsMenu
          commands={filteredCommands}
          selectedIndex={selectedCommandIndex}
          onSelectIndex={setSelectedCommandIndex}
          onExecute={executeCommand}
        />
      )}

      {liveLinkPreview && !isRecordingActive && (
        <MessageInputLinkPreview
          preview={liveLinkPreview}
          onDismiss={(url) => {
            setDismissedUrl(url);
            setLiveLinkPreview(null);
          }}
        />
      )}

      {showActionBanner && !isRecordingActive && (
        <MessageInputActionBanner
          editingIndex={editingIndex}
          editingOriginalText={editingOriginalText}
          editText={editText}
          replyingTo={replyingTo}
          forwardingMessages={pendingForwardMessages}
          anonymousForwardingEnabled={anonymousForwardingEnabled}
          isChannel={isChannel}
          onCancel={cancelCurrentAction}
        />
      )}

      {isRecordingActive ? (
        <MessageInputVoiceRecorder
          recordingTime={recordingTime}
          recordingAmplitude={recordingAmplitude}
          isLocked={isLockedRecording}
          lockProgress={lockProgress}
          onCancel={() => {
            setHoverMic(false);
            setHoverAttach(false);
            setHoverEmoji(false);
            window.getSelection()?.removeAllRanges();
            if (onCancelRecording) onCancelRecording();
          }}
          onStop={() => {
            setHoverMic(false);
            setHoverAttach(false);
            setHoverEmoji(false);
            window.getSelection()?.removeAllRanges();
            onStopRecording();
          }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', minHeight: '34px', position: 'relative' }}>
          {currentText.length > 256 && onOpenTxtModal && (
            <button
              type="button"
              tabIndex={-1}
              onClick={onOpenTxtModal}
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '0px',
                marginBottom: '6px',
                backgroundColor: 'var(--bg-secondary, #252836)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                outline: 'none',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                color: 'var(--accent-color, #7C3AED)',
                borderRadius: '50%',
                width: '34px',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, background-color 0.15s ease',
                zIndex: 20,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <FileWithArrowIcon />
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            disabled={!isRatchetReady}
            onClick={isRatchetReady ? onFilePick : undefined}
            onFocus={(e) => e.currentTarget.blur()}
            aria-label={t('chatWindow.attach_file', 'Прикрепить файл')}
            onMouseEnter={() => isRatchetReady && setHoverAttach(true)}
            onMouseLeave={() => setHoverAttach(false)}
            style={{
              background: 'transparent',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              color: attachColor,
              cursor: isRatchetReady ? 'pointer' : 'not-allowed',
              opacity: isRatchetReady ? 1 : 0.35,
              width: '32px',
              height: '32px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, opacity 0.2s',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              flexShrink: 0,
            }}
          >
            <AttachIcon />
          </button>

          <div
            style={{
              flex: 1,
              backgroundColor: 'var(--surface-container, #33363f)',
              borderRadius: '20px',
              padding: '0 14px',
              minHeight: '34px',
              maxHeight: '120px',
              display: 'flex',
              alignItems: 'center',
              boxSizing: 'border-box',
              position: 'relative',
              transition: 'background-color 0.15s ease',
            }}
          >
            <div
              ref={editorRef}
              contentEditable={true}
              suppressContentEditableWarning
              spellCheck={false}
              data-empty={isEditorEmpty}
              data-placeholder={
                editingIndex !== null
                  ? t('chatWindow.edit_message_placeholder')
                  : t('chatWindow.placeholder')
              }
              onInput={handleEditorInput}
              onKeyDown={handleKeyDown}
              onBlur={handleEditorBlur}
              onContextMenu={handleEditorContextMenu}
              className="rich-editor"
              style={{
                flex: 1,
                position: 'relative',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main)',
                fontSize: '14px',
                lineHeight: '20px',
                fontFamily: 'inherit',
                minHeight: '20px',
                maxHeight: '120px',
                overflowY: 'auto',
                padding: '0',
                width: '100%',
                caretColor: 'var(--accent-color, #7C3AED)',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                userSelect: 'text',
                WebkitUserSelect: 'text',
                cursor: 'text',
                opacity: 1,
              }}
            />
          </div>

          <button
            type="button"
            tabIndex={-1}
            ref={emojiButtonRef}
            disabled={!isRatchetReady}
            onClick={onToggleEmoji}
            aria-label={t('chatWindow.emoji', 'Эмодзи')}
            onMouseEnter={() => {
              if (isRatchetReady) {
                setHoverEmoji(true);
                if (onEmojiMouseEnter) onEmojiMouseEnter();
              }
            }}
            onMouseLeave={() => {
              setHoverEmoji(false);
              if (onEmojiMouseLeave) onEmojiMouseLeave();
            }}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              color: emojiColor,
              cursor: isRatchetReady ? 'pointer' : 'not-allowed',
              opacity: isRatchetReady ? 1 : 0.35,
              width: '32px',
              height: '32px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, opacity 0.2s',
              flexShrink: 0,
            }}
          >
            <EmojiIcon />
          </button>

          <button
            type="button"
            tabIndex={-1}
            disabled={!isRatchetReady}
            onMouseDown={
              !isRatchetReady || editingIndex !== null || isHasContent
                ? undefined
                : handleMicMouseDown
            }
            onClick={
              !isRatchetReady
                ? undefined
                : (editingIndex !== null || isHasContent)
                  ? handleSend
                  : undefined
            }
            aria-label={editingIndex !== null ? t('chatWindow.confirm_edit', 'Сохранить') : isHasContent ? t('chatWindow.send', 'Отправить') : t('chatWindow.voice_message', 'Голосовое сообщение')}
            onMouseEnter={() => isRatchetReady && setHoverMic(true)}
            onMouseLeave={() => setHoverMic(false)}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              color: !isRatchetReady ? 'var(--text-dim)' : editingIndex !== null ? 'var(--accent-color)' : micColor,
              cursor: !isRatchetReady ? 'not-allowed' : 'pointer',
              opacity: !isRatchetReady ? 0.35 : 1,
              width: '34px',
              height: '34px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s, opacity 0.2s',
              flexShrink: 0,
            }}
          >
            {editingIndex !== null ? (
              <ConfirmEditIcon />
            ) : isHasContent ? (
              <SendIcon />
            ) : (
              <MicIcon />
            )}
          </button>
        </div>
      )}

      <InputContextMenu
        x={contextMenuPos.x}
        y={contextMenuPos.y}
        isOpen={isContextMenuOpen}
        onClose={() => setIsContextMenuOpen(false)}
        onUndo={() => document.execCommand('undo')}
        onRedo={() => document.execCommand('redo')}
        onCut={() => {
          document.execCommand('cut');
          syncEditorToState();
        }}
        onCopy={() => {
          document.execCommand('copy');
        }}
        onPaste={async () => {
          try {
            const clipText = await navigator.clipboard.readText();
            if (clipText) {
              document.execCommand('insertText', false, clipText);
              syncEditorToState();
            }
          } catch { }
        }}
        onDelete={() => {
          document.execCommand('delete');
          syncEditorToState();
        }}
        onSelectAll={() => {
          document.execCommand('selectAll');
        }}
        onFormat={applyFormatting}
        hasSelection={hasSelection}
      />

      {linkModalData.open && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          }}
          onClick={() => setLinkModalData({ ...linkModalData, open: false })}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary, #252836)',
              borderRadius: '8px',
              padding: '20px',
              width: '320px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              color: 'var(--text-main)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, fontSize: '15px' }}>{t('inputContextMenu.add_link')}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-dim, rgba(255,255,255,0.45))' }}>{t('inputContextMenu.text')}</label>
              <input
                type="text"
                value={linkModalData.text}
                onChange={(e) => setLinkModalData({ ...linkModalData, text: e.target.value })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text-main)',
                  padding: '4px 0',
                  outline: 'none',
                  fontSize: '14px'
                }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-dim, rgba(255,255,255,0.45))' }}>{t('inputContextMenu.url')}</label>
              <input
                type="text"
                value={linkModalData.url}
                onChange={(e) => setLinkModalData({ ...linkModalData, url: e.target.value })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--accent-color, #7C3AED)',
                  color: 'var(--text-main)',
                  padding: '4px 0',
                  outline: 'none',
                  fontSize: '14px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const confirmBtn = document.getElementById('add-link-confirm-btn');
                    if (confirmBtn) confirmBtn.click();
                  }
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', marginTop: '8px' }}>
              <button
                onClick={() => setLinkModalData({ ...linkModalData, open: false })}
                style={{ color: 'var(--accent-color, #7C3AED)', background: 'none', border: 'none', fontSize: '14px', cursor: 'pointer', padding: 0 }}
                className="hover:opacity-80 transition-opacity"
              >
                {t('inputContextMenu.cancel')}
              </button>
              <button
                id="add-link-confirm-btn"
                onClick={() => {
                  setLinkModalData({ ...linkModalData, open: false });
                  if (linkModalData.url && linkModalData.range) {
                    const { text, url, range } = linkModalData;
                    const a = document.createElement('a');
                    a.href = url.startsWith('http') ? url : `https://${url}`;
                    a.textContent = text || url;
                    a.style.color = 'var(--accent-color, #7C3AED)';
                    a.style.textDecoration = 'none';
                    a.style.cursor = 'pointer';

                    const sel = window.getSelection();
                    if (sel) {
                      sel.removeAllRanges();
                      sel.addRange(range);
                    }
                    try {
                      range.deleteContents();
                      range.insertNode(a);
                    } catch {
                      document.execCommand('insertHTML', false, a.outerHTML);
                    }
                    syncEditorToState();
                    if (editorRef.current) {
                      placeCaretAtEnd(editorRef.current);
                    }
                  }
                }}
                style={{ color: 'var(--accent-color, #7C3AED)', background: 'none', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                className="hover:opacity-80 transition-opacity"
              >
                {t('inputContextMenu.add')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        
        .rich-editor::-webkit-scrollbar { 
          display: none; 
        }
        
        .rich-editor, .rich-editor * {
          -webkit-app-region: no-drag;
          user-select: text !important;
          -webkit-user-select: text !important;
        }
        
        .rich-editor[data-empty="true"]::before {
          content: attr(data-placeholder);
          color: var(--text-dim, rgba(255, 255, 255, 0.45));
          pointer-events: none;
          position: absolute;
          top: 0;
          bottom: 0;
          height: 20px;
          line-height: 20px;
          margin: auto 0;
          left: 0;
          cursor: text;
        }

        .rich-editor code {
          font-family: monospace;
          background-color: rgba(255, 255, 255, 0.12);
          padding: 2px 4px;
          border-radius: 4px;
        }

        .rich-editor .spoiler {
          background-color: rgba(255, 255, 255, 0.18);
          filter: blur(3px);
          padding: 0 3px;
          border-radius: 4px;
        }

        button:focus, button:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }

        button, button * {
          user-select: none !important;
          -webkit-user-select: none !important;
        }

        button::selection, button *::selection {
          background: transparent !important;
          color: inherit !important;
        }
      `}</style>
    </div>
  );
});