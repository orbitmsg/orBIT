import React, { useCallback } from 'react';
import { useChatStore, type Message, type MediaItem } from '../../../store/useChatStore';
import { useUploadProgressStore } from '../../../store/useUploadProgressStore';
import { mediaManager } from '../../../services/mediaManager';
import { stripExifMetadata } from '../../../lib/exifStripper';
import { generateEphemeralKey, encryptFile, MAX_FILE_MB, type AudioMetadata } from './chatWindowHelpers';
import { type AttachedFile } from '../FileAttachmentModal';
import { useAudioRecorder } from '../../../hooks/useAudioRecorder';

export interface UseChatAudioAndFilesProps {
  activeChatId: string | null;
  activeChat: any;
  isChannelOwner: boolean;
  sharedSecret?: string | null;
  isRatchetReady: boolean;
  myCode: string;
  myNickname: string;
  addMessage: (chatId: string, message: Message) => void;
  updateChat: (chatId: string, partial: any) => void;
  triggerMessage: (
    text: string,
    mediaPayload?: any,
    linkPreviewPayload?: any,
    existingMessageId?: string,
    mediaItemsPayload?: any
  ) => Promise<void>;
  attachedFiles: AttachedFile[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  setIsAttachmentModalOpen: (v: boolean) => void;
  setIsDiscordFileLimitModalOpen: (v: boolean) => void;
  setIsSendingFiles: (v: boolean) => void;
  draftDebounceTimerRef: React.MutableRefObject<any>;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  scrollToBottom: (smooth?: boolean) => void;
  showToast: (msg: string) => void;
  t: (key: string, defaultVal?: any) => string;
}

export interface UseChatAudioAndFilesReturn {
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordingTime: number;
  recordingAmplitude: number;
  startAudioRecording: () => Promise<void>;
  pauseAudioRecording: () => void;
  resumeAudioRecording: () => void;
  stopAudioRecording: () => Promise<{ blob: Blob; duration: number; waveform: number[] } | null>;
  cancelAudioRecording: () => void;
  handleStartRecording: () => Promise<void>;
  handleStopRecordingAndSend: () => Promise<void>;
  getMediaDimensionsForFile: (filePath: string, fileType: AttachedFile['fileType']) => Promise<{ width?: number; height?: number; duration?: number; blurPreview?: string; preview?: string }>;
  handleFilePick: () => Promise<void>;
  handleSendFiles: (caption: string, group: boolean, asFile: boolean) => Promise<void>;
  handleAddMoreFiles: () => void;
}

export const useChatAudioAndFiles = ({
  activeChatId,
  activeChat,
  isChannelOwner,
  sharedSecret,
  isRatchetReady,
  myCode,
  myNickname,
  addMessage,
  updateChat,
  triggerMessage,
  attachedFiles,
  setAttachedFiles,
  setIsAttachmentModalOpen,
  setIsDiscordFileLimitModalOpen,
  setIsSendingFiles,
  draftDebounceTimerRef,
  setInputText,
  scrollToBottom,
  showToast,
  t,
}: UseChatAudioAndFilesProps): UseChatAudioAndFilesReturn => {
  const {
    isRecording,
    isPaused: isRecordingPaused,
    recordingTime,
    amplitude: recordingAmplitude,
    startRecording: startAudioRecording,
    pauseRecording: pauseAudioRecording,
    resumeRecording: resumeAudioRecording,
    stopRecording: stopAudioRecording,
    cancelRecording: cancelAudioRecording,
  } = useAudioRecorder();

  const handleStartRecording = useCallback(async () => {
    const isBotChat = activeChatId === 'system_support';
    const isChannel = activeChat?.type === 'channel';
    if (!isBotChat && !isChannel && (!sharedSecret || !isRatchetReady) && !activeChat?.isDraft && !activeChat?.peerCode) return;
    if (isChannel && !isChannelOwner) return;
    try {
      await startAudioRecording();
    } catch (err) {
      showToast(t('chatWindow.mic_permission_error'));
    }
  }, [activeChatId, activeChat?.type, isChannelOwner, sharedSecret, isRatchetReady, startAudioRecording, showToast, t]);

  const handleStopRecordingAndSend = useCallback(async () => {
    const recorded = await stopAudioRecording();
    if (!recorded || !recorded.blob) return;

    const { blob, duration, waveform } = recorded;
    if (!activeChatId) return;

    const isBotChat = activeChatId === 'system_support';
    const isChannel = activeChat?.type === 'channel';
    if (!isBotChat && !isChannel && !sharedSecret) return;
    if (isChannel && !isChannelOwner) return;

    const voiceFileName = `voice_${Date.now()}.ogg`;
    const localBlobUrl = URL.createObjectURL(blob);
    const optimisticMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    mediaManager.setDirectDecryptedMedia(localBlobUrl, '', blob, 'audio/ogg;codecs=opus', activeChatId, optimisticMessageId);
    if (sharedSecret) {
      mediaManager.setDirectDecryptedMedia(localBlobUrl, sharedSecret, blob, 'audio/ogg;codecs=opus', activeChatId, optimisticMessageId);
    }

    const optimisticMessage: Message = {
      id: optimisticMessageId,
      senderId: myCode,
      sender: myNickname,
      isOutgoing: true,
      text: `[Audio] ${voiceFileName}`,
      time: Date.now(),
      read: activeChatId === 'notes',
      status: activeChatId === 'notes' ? 'sent' : 'sending',
      uploading: activeChatId !== 'notes',
      mediaType: 'voice',
      mediaUrl: localBlobUrl,
      mediaName: voiceFileName,
      mime: 'audio/ogg;codecs=opus',
      duration,
      waveform,
      fileSize: blob.size,
      isListened: false,
    };

    addMessage(activeChatId, optimisticMessage);
    updateChat(activeChatId, { lastMsg: t('chatWindow.voice_message') || voiceFileName });
    requestAnimationFrame(() => scrollToBottom(false));

    (async () => {
      try {
        const isPublic = isBotChat || isChannel;
        let fileKey: string | undefined = undefined;
        let encryptedBase64: string;

        if (isPublic) {
          const arrayBuffer = await blob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSz = 8192;
          for (let j = 0; j < uint8.length; j += chunkSz) {
            binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(j, j + chunkSz)));
          }
          encryptedBase64 = btoa(binary);
        } else {
          const arrayBuffer = await blob.arrayBuffer();
          fileKey = generateEphemeralKey();
          const encryptedBlob = await encryptFile(arrayBuffer, fileKey);
          encryptedBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(encryptedBlob);
          });
        }

        const tempPath = await window.orbita?.writeTempFile(encryptedBase64, isPublic ? 'ogg' : undefined);
        if (!tempPath) {
          showToast(t('chatWindow.upload_failed'));
          useChatStore.getState().deleteMessage(activeChatId, optimisticMessageId);
          return;
        }

        const publicId = `orbita_${Date.now()}`;
        const unsub = window.orbita?.onUploadProgress(({ publicId: pid, uploadedBytes, totalBytes }: any) => {
          if (pid === publicId) {
            useUploadProgressStore.getState().setProgress(optimisticMessageId, uploadedBytes, totalBytes);
          }
        });
        const result = await window.orbita?.uploadToCloudinary(tempPath, publicId);
        unsub?.();
        window.orbita?.deleteTempFile?.(tempPath);

        if (result && result.success && result.secure_url) {
          useUploadProgressStore.getState().setProgress(optimisticMessageId, 1, 1);
          await new Promise((r) => setTimeout(r, 220));
          useUploadProgressStore.getState().clearProgress(optimisticMessageId);
          mediaManager.setDirectDecryptedMedia(result.secure_url, fileKey || '', blob, 'audio/ogg;codecs=opus', activeChatId, optimisticMessageId);
          if (sharedSecret && sharedSecret !== fileKey) {
            mediaManager.setDirectDecryptedMedia(result.secure_url, sharedSecret, blob, 'audio/ogg;codecs=opus', activeChatId, optimisticMessageId);
          }
          await triggerMessage(
            `[Audio] ${voiceFileName}`,
            {
              type: 'voice',
              url: result.secure_url,
              key: fileKey,
              name: voiceFileName,
              mime: 'audio/ogg;codecs=opus',
              duration,
              waveform,
              size: blob.size,
            },
            undefined,
            optimisticMessageId
          );
        } else {
          useUploadProgressStore.getState().clearProgress(optimisticMessageId);
          showToast(t('chatWindow.upload_failed'));
          useChatStore.getState().deleteMessage(activeChatId, optimisticMessageId);
        }
      } catch (error) {
        useUploadProgressStore.getState().clearProgress(optimisticMessageId);
        console.error('Failed to upload recorded audio:', error);
        showToast(t('chatWindow.upload_failed'));
        useChatStore.getState().deleteMessage(activeChatId, optimisticMessageId);
      }
    })();
  }, [sharedSecret, activeChatId, activeChat?.type, isChannelOwner, stopAudioRecording, triggerMessage, showToast, t, myCode, myNickname, addMessage, updateChat, scrollToBottom]);

  const getMediaDimensionsForFile = useCallback(async (
    filePath: string,
    fileType: AttachedFile['fileType']
  ): Promise<{ width?: number; height?: number; duration?: number; blurPreview?: string; preview?: string }> => {
    if (fileType === 'photo') {
      if (window.orbita?.rustReadFileFast && window.orbita?.generateBlurPreview) {
        try {
          const raw = await window.orbita.rustReadFileFast(filePath);
          if (raw) {
            const blurPreview = await window.orbita.generateBlurPreview(raw, 32);
            if (window.orbita.compressImageNative) {
              const comp = await window.orbita.compressImageNative(raw, 2560, 2560, 85);
              if (comp) {
                return { width: comp.width, height: comp.height, blurPreview: blurPreview || undefined };
              }
            }
          }
        } catch {}
      }
      const dataUrl = await window.orbita?.readFileAsDataURL(filePath);
      if (!dataUrl) return {};
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          let blurPreview: string | undefined = undefined;
          try {
            const canvas = document.createElement('canvas');
            const scale = Math.min(32 / img.naturalWidth, 32 / img.naturalHeight, 1);
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              blurPreview = canvas.toDataURL('image/jpeg', 0.5);
            }
          } catch {}
          resolve({ width: img.naturalWidth, height: img.naturalHeight, blurPreview });
        };
        img.onerror = () => resolve({});
        img.src = dataUrl;
      });
    } else if (fileType === 'video') {
      if (typeof window !== 'undefined' && (window as any).orbita?.getVideoMetadata) {
        try {
          const meta = await (window as any).orbita.getVideoMetadata(filePath);
          if (meta && (meta.preview || meta.width || meta.duration)) {
            return {
              width: meta.width,
              height: meta.height,
              duration: meta.duration,
              preview: meta.preview,
              blurPreview: meta.blurPreview,
            };
          }
        } catch {}
      }

      let videoSrc = '';
      if (typeof window !== 'undefined' && (window as any).orbita?.rustReadFileFast) {
        try {
          const binary = await (window as any).orbita.rustReadFileFast(filePath);
          if (binary) {
            const blob = new Blob([binary], { type: 'video/mp4' });
            videoSrc = URL.createObjectURL(blob);
          }
        } catch {}
      }
      if (!videoSrc) {
        const dataUrl = await window.orbita?.readFileAsDataURL?.(filePath);
        if (!dataUrl) return {};
        videoSrc = dataUrl;
      }

      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;

        let hasResolved = false;
        const cleanup = () => {
          if (videoSrc.startsWith('blob:')) {
            URL.revokeObjectURL(videoSrc);
          }
        };

        const timeout = setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            cleanup();
            resolve({
              width: video.videoWidth || undefined,
              height: video.videoHeight || undefined,
              duration: isFinite(video.duration) ? video.duration : undefined,
            });
          }
        }, 4000);

        const captureFrame = () => {
          if (hasResolved) return;
          hasResolved = true;
          clearTimeout(timeout);

          let preview: string | undefined;
          let blurPreview: string | undefined;

          try {
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 360;
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(vw, 1280);
            canvas.height = Math.round(canvas.width * (vh / vw));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              preview = canvas.toDataURL('image/jpeg', 0.85);

              const smallCanvas = document.createElement('canvas');
              const scale = Math.min(32 / canvas.width, 32 / canvas.height, 1);
              smallCanvas.width = Math.max(1, Math.round(canvas.width * scale));
              smallCanvas.height = Math.max(1, Math.round(canvas.height * scale));
              const sCtx = smallCanvas.getContext('2d');
              if (sCtx) {
                sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
                blurPreview = smallCanvas.toDataURL('image/jpeg', 0.5);
              }
            }
          } catch {}

          cleanup();
          resolve({
            width: video.videoWidth || undefined,
            height: video.videoHeight || undefined,
            duration: isFinite(video.duration) ? video.duration : undefined,
            preview,
            blurPreview,
          });
        };

        video.onloadeddata = () => {
          try {
            video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
          } catch {
            captureFrame();
          }
        };

        video.onseeked = () => {
          captureFrame();
        };

        video.onerror = () => {
          if (!hasResolved) {
            hasResolved = true;
            clearTimeout(timeout);
            cleanup();
            resolve({});
          }
        };

        video.src = videoSrc;
        video.load();
      });
    }
    return {};
  }, []);

  const handleFilePick = useCallback(async () => {
    try {
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'ape', 'alac', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp', 'csv', 'md', 'log', 'json', 'xml', 'yaml', 'yml', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'exe', 'dmg', 'apk', 'iso'];
      const rawResult = await window.orbita?.pickFile(allowedExtensions);
      if (!rawResult) return;
      const filePaths: string[] = Array.isArray(rawResult) ? rawResult : [rawResult];
      if (filePaths.length === 0) return;

      const newFiles: AttachedFile[] = [];

      for (const filePath of filePaths) {
        if (!filePath) continue;
        const fileName = filePath.split(/[\\/]/).pop() || 'file';
        const ext = (fileName.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
        let fileType: 'photo' | 'video' | 'audio' | 'document' = 'document';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'photo';
        else if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext)) fileType = 'video';
        else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'ape', 'alac'].includes(ext)) fileType = 'audio';

        let preview: string | null = null;
        let sizeMb = 0;
        try {
          if (fileType === 'photo') {
            const dataUrl = await window.orbita?.readFileAsDataURL(filePath);
            if (dataUrl) {
              preview = dataUrl;
              const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
              const binary = atob(base64);
              const fileArrayBuffer = new ArrayBuffer(binary.length);
              const view = new Uint8Array(fileArrayBuffer);
              for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
              sizeMb = fileArrayBuffer.byteLength / (1024 * 1024);
            }
          } else {
            const sizeBytes = await window.orbita?.getFileSize(filePath);
            if (sizeBytes) {
              sizeMb = sizeBytes / (1024 * 1024);
            } else {
              const dataUrl = await window.orbita?.readFileAsDataURL(filePath);
              if (dataUrl) {
                const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
                const binary = atob(base64);
                sizeMb = binary.length / (1024 * 1024);
              }
            }
          }
        } catch {}

        if (sizeMb > MAX_FILE_MB) {
          setIsDiscordFileLimitModalOpen(true);
          continue;
        }

        let audioMetadata: AudioMetadata | undefined = undefined;
        if (fileType === 'audio') {
          try {
            const metadata = await window.orbita?.getAudioMetadata(filePath);
            if (metadata) {
              audioMetadata = {
                title: metadata.title || fileName.replace(/\.[^.]+$/, ''),
                artist: metadata.artist || '',
                duration: metadata.duration || 0,
                size: metadata.size || (sizeMb * 1024 * 1024),
                cover: metadata.cover || null,
              };
            }
          } catch (err) {
            console.error('Failed to get audio metadata:', err);
            audioMetadata = undefined;
          }
        }

        let dimensions = {};
        if (fileType === 'photo' || fileType === 'video') {
          dimensions = await getMediaDimensionsForFile(filePath, fileType);
        }

        const fileDims = dimensions as any;
        newFiles.push({
          filePath,
          preview: fileType === 'video' ? (fileDims.preview || null) : preview,
          blurPreview: fileDims.blurPreview,
          name: fileName,
          sizeMb,
          fileType,
          uploadedMb: 0,
          uploading: false,
          error: null,
          uploadedUrl: null,
          audioMetadata,
          duration: audioMetadata?.duration || fileDims.duration,
          ...dimensions,
        });
      }

      if (newFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...newFiles]);
        setIsAttachmentModalOpen(true);
      }
    } catch (error) {
      console.error('File pick error:', error);
    }
  }, [getMediaDimensionsForFile, setIsAttachmentModalOpen, setIsDiscordFileLimitModalOpen, setAttachedFiles]);

  const handleSendFiles = async (caption: string, group: boolean, asFile: boolean) => {
    if (!activeChatId || attachedFiles.length === 0) return;

    const chat = useChatStore.getState().chats.find((c) => c.id === activeChatId);
    if (!chat) return;

    const isChannel = chat.type === 'channel';
    const isBotChat = activeChatId === 'system_support';
    const isGroup = chat.type === 'group';
    if (isChannel) {
      if (!isChannelOwner) return;
    } else if (isBotChat || isGroup) {
    } else {
      if (!sharedSecret && !activeChat?.isDraft && !activeChat?.peerCode) return;
    }

    const filesToSend = [...attachedFiles];
    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
    if (activeChatId) useChatStore.getState().clearDraft(activeChatId);
    setAttachedFiles([]);
    setIsAttachmentModalOpen(false);
    setIsSendingFiles(false);
    useChatStore.getState().setIsUploadingMedia(true);
    setInputText('');

    const resolveItemType = (ft: string, fileName?: string): 'photo' | 'video' | 'audio' | 'file' | 'gif' => {
      if (asFile) return 'file';
      if (ft === 'photo') return 'photo';
      if (ft === 'video') return 'video';
      if (ft === 'audio') return 'audio';
      if (fileName && /\.(jpg|jpeg|png|webp|avif|bmp|heic|gif)$/i.test(fileName)) return 'photo';
      if (fileName && /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(fileName)) return 'video';
      if (fileName && /\.(mp3|wav|flac|aac|ogg|m4a|opus)$/i.test(fileName)) return 'audio';
      return 'file';
    };

    const resolveMime = (ft: string, fileName?: string) => {
      const ext = (fileName?.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
      if (ft === 'audio') {
        if (ext === 'ogg' || ext === 'opus') return 'audio/ogg';
        if (ext === 'wav') return 'audio/wav';
        if (ext === 'flac') return 'audio/flac';
        if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
        return 'audio/mpeg';
      }
      if (ft === 'photo') {
        if (ext === 'webp') return 'image/webp';
        if (ext === 'png') return 'image/png';
        if (ext === 'gif') return 'image/gif';
        if (ext === 'svg') return 'image/svg+xml';
        if (ext === 'bmp') return 'image/bmp';
        if (ext === 'avif') return 'image/avif';
        return 'image/jpeg';
      }
      if (ft === 'video') {
        if (ext === 'webm') return 'video/webm';
        if (ext === 'mov') return 'video/quicktime';
        return 'video/mp4';
      }
      return 'application/octet-stream';
    };

    const uploadSingleFile = async (
      file: typeof filesToSend[0],
      onProgress?: (uploadedBytes: number, totalBytes: number) => void
    ) => {
      if (file.uploadedUrl) {
        return {
          url: file.uploadedUrl,
          key: undefined as string | undefined,
          type: resolveItemType(file.fileType, file.name),
          name: file.name,
          mime: resolveMime(file.fileType, file.name),
          audioMetadata: file.audioMetadata,
          size: file.sizeMb ? file.sizeMb * 1024 * 1024 : file.audioMetadata?.size,
          width: file.width,
          height: file.height,
          duration: file.duration || file.audioMetadata?.duration,
          blurPreview: file.blurPreview,
          thumbnail: file.preview || file.blurPreview,
          chatId: activeChatId,
        };
      }

      try {
        let effectiveFilePath = file.filePath;
        let isTranscodedTemp = false;
        if (!asFile && file.fileType === 'video' && window.orbita?.prepareVideoForUpload) {
          try {
            const prep = await window.orbita.prepareVideoForUpload(file.filePath);
            if (prep && prep.preparedPath) {
              effectiveFilePath = prep.preparedPath;
              isTranscodedTemp = Boolean(prep.transcoded);
            }
          } catch (prepErr) {
            console.warn('[ChatWindow:Upload] prepareVideoForUpload error:', prepErr);
          }
        }

        let fileArrayBuffer: ArrayBuffer | null = null;
        if (window.orbita?.rustReadFileFast) {
          try {
            const binary = await window.orbita.rustReadFileFast(effectiveFilePath);
            if (binary) {
              let processBinary = binary;
              if (!asFile && file.fileType === 'photo') {
                if (window.orbita?.compressImageNative) {
                  try {
                    const comp = await window.orbita.compressImageNative(binary, 2048, 2048, 85);
                    if (comp && comp.data) {
                      processBinary = comp.data;
                      if (comp.width && comp.height) {
                        file.width = comp.width;
                        file.height = comp.height;
                      }
                    }
                  } catch (e) {
                    console.warn('[Rust] Image compressImageNative failed, falling back:', e);
                  }
                } else if (window.orbita?.rustResizeImage) {
                  try {
                    const resized = await window.orbita.rustResizeImage(binary, 1920, 1920, 85);
                    if (resized) processBinary = resized;
                  } catch (e) {
                    console.warn('[Rust] Image resize failed, falling back to original:', e);
                  }
                }
              }
              fileArrayBuffer = (processBinary.buffer as ArrayBuffer).slice(
                processBinary.byteOffset,
                processBinary.byteOffset + processBinary.byteLength
              );
            }
          } catch (e) {
            console.warn('[ChatWindow] rustReadFileFast error, falling back:', e);
          }
        }

        if (!fileArrayBuffer && (window.orbita as any)?.readFileAsArrayBuffer) {
          try {
            fileArrayBuffer = await (window.orbita as any).readFileAsArrayBuffer(effectiveFilePath);
          } catch {}
        }

        if (!fileArrayBuffer && window.orbita?.readFileAsDataURL) {
          try {
            const dataUrl = await window.orbita.readFileAsDataURL(effectiveFilePath);
            if (dataUrl) {
              const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
              const binaryStr = atob(base64);
              fileArrayBuffer = new ArrayBuffer(binaryStr.length);
              const view = new Uint8Array(fileArrayBuffer);
              for (let j = 0; j < binaryStr.length; j++) view[j] = binaryStr.charCodeAt(j);
            }
          } catch (e) {
            console.warn('[ChatWindow] readFileAsDataURL fallback error:', e);
          }
        }

        if (isTranscodedTemp && effectiveFilePath) {
          window.orbita?.deleteTempFile?.(effectiveFilePath);
        }

        if (!fileArrayBuffer) {
          console.error('[ChatWindow:Upload] Failed to read file bytes into ArrayBuffer:', effectiveFilePath);
          return null;
        }

        const cleanedBuffer = stripExifMetadata(fileArrayBuffer, file.fileType || file.name);
        let fileKey: string | undefined = undefined;
        let tempPath: string | null = null;
        let uploadTotalBytes = cleanedBuffer.byteLength;
        const isPublic = isChannel || isBotChat;
        const ext = isTranscodedTemp ? 'mp4' : (file.name?.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();

        if (isPublic) {
          tempPath = await window.orbita?.writeTempFile(new Uint8Array(cleanedBuffer), ext);
        } else {
          fileKey = generateEphemeralKey();
          const encryptedBlob = await encryptFile(cleanedBuffer, fileKey);
          const encryptedAb = await encryptedBlob.arrayBuffer();
          uploadTotalBytes = encryptedAb.byteLength;
          tempPath = await window.orbita?.writeTempFile(new Uint8Array(encryptedAb), undefined);
        }

        if (!tempPath) {
          console.error('[ChatWindow:Upload] Failed to create tempPath for upload');
          return null;
        }

        const publicId = `orbita_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        const unsub = window.orbita?.onUploadProgress(({ publicId: pid, uploadedBytes, totalBytes }: any) => {
          if (pid === publicId && onProgress) {
            if (typeof totalBytes === 'number' && totalBytes > 0) {
              uploadTotalBytes = totalBytes;
            }
            onProgress(uploadedBytes, uploadTotalBytes);
          }
        });

        const result = await window.orbita?.uploadToCloudinary(tempPath, publicId);
        unsub?.();
        window.orbita?.deleteTempFile?.(tempPath);

        if (!result || !result.success || !result.secure_url) {
          console.error('[ChatWindow:Upload] Cloudinary upload failed:', result);
          return null;
        }

        const itemMime = isTranscodedTemp ? 'video/mp4' : resolveMime(file.fileType, file.name);
        const localBlob = new Blob([cleanedBuffer], { type: itemMime });
        mediaManager.setDirectDecryptedMedia(result.secure_url, fileKey || '', localBlob, itemMime, activeChatId);

        return {
          url: result.secure_url,
          key: fileKey,
          type: resolveItemType(file.fileType, file.name),
          name: file.name,
          mime: itemMime,
          audioMetadata: file.audioMetadata,
          size: uploadTotalBytes || cleanedBuffer.byteLength || (file.sizeMb ? Math.round(file.sizeMb * 1024 * 1024) : file.audioMetadata?.size),
          width: file.width,
          height: file.height,
          duration: file.duration || file.audioMetadata?.duration,
          blurPreview: file.blurPreview,
          thumbnail: file.preview || file.blurPreview,
        };
      } catch (err) {
        console.error('Upload error for file', file.name, err);
        return null;
      }
    };

    const shouldGroup = group && filesToSend.length > 1;

    if (shouldGroup) {
      const CHUNK_SIZE = 10;
      const chunks: (typeof filesToSend)[] = [];
      for (let i = 0; i < filesToSend.length; i += CHUNK_SIZE) {
        chunks.push(filesToSend.slice(i, i + CHUNK_SIZE));
      }

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunkFiles = chunks[cIdx];
        const chunkCaption = cIdx === 0 ? (caption || '') : '';
        const messageId = `msg_${Date.now()}_${cIdx}_${Math.random().toString(36).substr(2, 9)}`;

        const initialMediaItems: MediaItem[] = chunkFiles.map((file) => ({
          url: file.preview || file.filePath || '',
          preview: file.preview,
          type: resolveItemType(file.fileType, file.name),
          name: file.name,
          mime: resolveMime(file.fileType, file.name),
          audioMetadata: file.audioMetadata,
          size: file.sizeMb ? file.sizeMb * 1024 * 1024 : file.audioMetadata?.size,
          width: file.width,
          height: file.height,
          duration: file.duration || file.audioMetadata?.duration,
          blurPreview: file.blurPreview,
          thumbnail: file.preview || file.blurPreview,
          uploading: true,
          uploadedMb: 0,
        }));

        const localMessage: Message = {
          id: messageId,
          senderId: myCode,
          sender: myNickname,
          isOutgoing: true,
          text: chunkCaption,
          time: Date.now() + cIdx,
          read: false,
          status: 'sending',
          uploading: true,
          mediaItems: initialMediaItems,
          chatId: activeChatId,
        };
        addMessage(activeChatId, localMessage);
        updateChat(activeChatId, { lastMsg: chunkCaption || '[MediaGroup]' });

        for (let fIdx = 0; fIdx < chunkFiles.length; fIdx++) {
          const cFile = chunkFiles[fIdx];
          const initialBytes = cFile.sizeMb ? Math.round(cFile.sizeMb * 1024 * 1024) : 1;
          useUploadProgressStore.getState().setProgress(`${messageId}_${fIdx}`, 0, initialBytes);
        }

        (async () => {
          const uploadedItems: MediaItem[] = [];
          for (let fIdx = 0; fIdx < chunkFiles.length; fIdx++) {
            const currentFile = chunkFiles[fIdx];
            const uploaded = await uploadSingleFile(currentFile, (uploadedBytes, totalBytes) => {
              useUploadProgressStore.getState().setProgress(`${messageId}_${fIdx}`, uploadedBytes, totalBytes);
            });

            if (!uploaded) {
              useUploadProgressStore.getState().clearProgress(`${messageId}_${fIdx}`);
              useUploadProgressStore.getState().clearProgress(messageId);
              useChatStore.getState().setIsUploadingMedia(false);
              const isStillPresent = useChatStore.getState().messagesByChatId[activeChatId]?.some((m) => m.id === messageId);
              if (!isStillPresent) return;
              useChatStore.setState((state) => ({
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [activeChatId]: (state.messagesByChatId[activeChatId] || []).map((m) =>
                    m.id === messageId ? { ...m, status: 'error' as const, uploading: false } : m
                  ),
                },
              }));
              showToast(t('chatWindow.upload_failed'));
              return;
            }
            useUploadProgressStore.getState().setProgress(`${messageId}_${fIdx}`, uploaded.size || 1, uploaded.size || 1);
            await new Promise((r) => setTimeout(r, 220));
            useUploadProgressStore.getState().clearProgress(`${messageId}_${fIdx}`);
            uploadedItems.push({
              ...uploaded,
              preview: currentFile.preview,
              thumbnail: currentFile.preview || uploaded.thumbnail,
              uploading: false,
            });
          }

          const isPresent = useChatStore.getState().messagesByChatId[activeChatId]?.some((m) => m.id === messageId);
          if (!isPresent) {
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
            return;
          }

          try {
            await triggerMessage(
              chunkCaption,
              undefined,
              undefined,
              messageId,
              uploadedItems
            );
          } finally {
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
          }
        })();
      }
    } else {
      for (let fIdx = 0; fIdx < filesToSend.length; fIdx++) {
        const file = filesToSend[fIdx];
        const postCaption = fIdx === 0 ? (caption || '') : '';
        const messageId = `msg_${Date.now()}_${fIdx}_${Math.random().toString(36).substr(2, 9)}`;
        const itemType = resolveItemType(file.fileType, file.name);
        const itemMime = resolveMime(file.fileType, file.name);

        const fileSizeBytes = file.sizeMb ? Math.round(file.sizeMb * 1024 * 1024) : undefined;
        const localMessage: Message = {
          id: messageId,
          senderId: myCode,
          sender: myNickname,
          isOutgoing: true,
          text: postCaption,
          time: Date.now() + fIdx,
          read: false,
          status: 'sending',
          uploading: true,
          uploadedMb: 0,
          mediaType: itemType,
          mediaUrl: file.preview || file.filePath || '',
          preview: file.preview,
          mediaName: file.name,
          mime: itemMime,
          fileSize: fileSizeBytes,
          audioMetadata: file.audioMetadata,
          width: file.width,
          height: file.height,
          duration: file.duration || file.audioMetadata?.duration,
          blurPreview: file.blurPreview,
          thumbnail: file.preview || file.blurPreview,
        };
        addMessage(activeChatId, localMessage);
        updateChat(activeChatId, { lastMsg: postCaption || file.name || `[${itemType}]` });
        useUploadProgressStore.getState().setProgress(messageId, 0, fileSizeBytes || 1);

        (async () => {
          const uploaded = await uploadSingleFile(file, (uploadedBytes, totalBytes) => {
            useUploadProgressStore.getState().setProgress(messageId, uploadedBytes, totalBytes);
          });

          if (!uploaded) {
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
            const isStillPresent = useChatStore.getState().messagesByChatId[activeChatId]?.some((m) => m.id === messageId);
            if (!isStillPresent) return;
            useChatStore.setState((state) => ({
              messagesByChatId: {
                ...state.messagesByChatId,
                [activeChatId]: (state.messagesByChatId[activeChatId] || []).map((m) =>
                  m.id === messageId ? { ...m, status: 'error' as const, uploading: false } : m
                ),
              },
            }));
            showToast(t('chatWindow.upload_failed'));
            return;
          }

          useUploadProgressStore.getState().setProgress(messageId, uploaded.size || 1, uploaded.size || 1);
          await new Promise((r) => setTimeout(r, 220));

          const isPresent = useChatStore.getState().messagesByChatId[activeChatId]?.some((m) => m.id === messageId);
          if (!isPresent) {
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
            return;
          }

          try {
            await triggerMessage(
              postCaption,
              {
                ...uploaded,
                preview: file.preview,
                thumbnail: file.preview || uploaded.thumbnail,
              },
              undefined,
              messageId
            );
          } finally {
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
          }
        })();
      }
    }
  };

  const handleAddMoreFiles = () => {
    handleFilePick();
  };

  return {
    isRecording,
    isRecordingPaused,
    recordingTime,
    recordingAmplitude,
    startAudioRecording,
    pauseAudioRecording,
    resumeAudioRecording,
    stopAudioRecording,
    cancelAudioRecording,
    handleStartRecording,
    handleStopRecordingAndSend,
    getMediaDimensionsForFile,
    handleFilePick,
    handleSendFiles,
    handleAddMoreFiles,
  };
};
