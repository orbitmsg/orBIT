import { useState, useRef, useEffect, useCallback } from 'react';
import { type AttachedFile } from '../FileAttachmentModal';
import { stripExifMetadata } from '../../../lib/exifStripper';
import { type AudioMetadata } from './chatWindowHelpers';

export interface UseChatDragDropProps {
  activeChatId: string | null;
  sharedSecret?: string | null;
  maxFileMb: number;
  setAttachedFiles: React.Dispatch<React.SetStateAction<AttachedFile[]>>;
  setIsAttachmentModalOpen: (v: boolean) => void;
  setIsDiscordFileLimitModalOpen: (v: boolean) => void;
}

export interface UseChatDragDropReturn {
  isDragOver: boolean;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDropFiles: (e: React.DragEvent) => Promise<void>;
}

export const useChatDragDrop = ({
  activeChatId,
  sharedSecret,
  maxFileMb,
  setAttachedFiles,
  setIsAttachmentModalOpen,
  setIsDiscordFileLimitModalOpen,
}: UseChatDragDropProps): UseChatDragDropReturn => {
  const dragCounterRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!activeChatId) return;
    if (activeChatId === 'notes') return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          let ext = item.type.split('/')[1] || 'png';
          if (ext === 'jpeg') ext = 'jpg';
          const fileName = `image.${ext}`;
          const arrayBuffer = await file.arrayBuffer();
          const sizeMb = arrayBuffer.byteLength / (1024 * 1024);
          if (sizeMb > maxFileMb) {
            setIsDiscordFileLimitModalOpen(true);
            return;
          }
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });
          const preview = `data:${item.type};base64,${base64}`;
          const tempPath = await window.orbita?.writeTempFile(base64);
          if (!tempPath) return;

          let dimensions: { width?: number; height?: number } = {};
          try {
            const img = new Image();
            img.src = preview;
            await new Promise((r) => { img.onload = r; img.onerror = r; });
            if (img.width && img.height) {
              dimensions = { width: img.width, height: img.height };
            }
          } catch {}

          setAttachedFiles((prev) => [...prev, {
            filePath: tempPath,
            preview,
            name: fileName,
            sizeMb,
            fileType: 'photo',
            uploadedMb: 0,
            uploading: false,
            error: null,
            uploadedUrl: null,
            width: dimensions.width,
            height: dimensions.height,
          }]);
          setIsAttachmentModalOpen(true);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeChatId, sharedSecret, maxFileMb, setAttachedFiles, setIsAttachmentModalOpen, setIsDiscordFileLimitModalOpen]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    if (!isDragOver && e.dataTransfer?.types?.includes('Files')) {
      setIsDragOver(true);
    }
  }, [isDragOver]);

  const handleDropFiles = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    if (!window.orbita?.writeTempFile) return;

    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    if (droppedFiles.length === 0) return;

    const newFiles: AttachedFile[] = [];

    for (const file of droppedFiles) {
      const rawPath = (file as any).path || '';
      const fileName = file.name;
      const ext = (fileName.split('.').pop() || '').toLowerCase();

      let fileType: AttachedFile['fileType'] = 'document';
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
        fileType = 'photo';
      } else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
        fileType = 'video';
      } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
        fileType = 'audio';
      }

      const arrayBuffer = await file.arrayBuffer();
      const sizeMb = arrayBuffer.byteLength / (1024 * 1024);

      if (sizeMb > maxFileMb) {
        setIsDiscordFileLimitModalOpen(true);
        continue;
      }

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      let preview: string | null = null;
      let tempPath: string | null = rawPath || null;

      if (!tempPath) {
        try {
          tempPath = (await window.orbita?.writeTempFile(base64)) || null;
        } catch {}
      }

      let dimensions: { width?: number; height?: number } = {};
      let videoDuration: number | undefined;
      let audioMetadata: AudioMetadata | undefined;
      let blurPreview: string | undefined;

      if (fileType === 'photo') {
        if (window.orbita?.generateBlurPreview) {
          try {
            const bPreview = await window.orbita.generateBlurPreview(new Uint8Array(arrayBuffer), 32);
            if (bPreview) blurPreview = bPreview;
          } catch {}
        }
        const safeBuffer = stripExifMetadata(arrayBuffer);
        const safeBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(new Blob([safeBuffer]));
        });
        preview = `data:${file.type || 'image/jpeg'};base64,${safeBase64}`;

        try {
          const img = new Image();
          img.src = preview;
          await new Promise((r) => { img.onload = r; img.onerror = r; });
          if (img.width && img.height) {
            dimensions = { width: img.width, height: img.height };
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 32 / Math.max(img.width, img.height));
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              blurPreview = canvas.toDataURL('image/jpeg', 0.6);
            }
          }
        } catch {}
      } else if (fileType === 'video') {
        try {
          const vUrl = URL.createObjectURL(file);
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.muted = true;
          v.playsInline = true;
          v.src = vUrl;
          await new Promise((r) => {
            v.onloadedmetadata = () => {
              videoDuration = Math.round(v.duration);
              dimensions = { width: v.videoWidth, height: v.videoHeight };
              v.currentTime = Math.min(1, v.duration * 0.1);
            };
            v.onseeked = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = Math.min(480, v.videoWidth || 320);
                canvas.height = Math.round(canvas.width * ((v.videoHeight || 240) / (v.videoWidth || 320)));
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                  preview = canvas.toDataURL('image/jpeg', 0.8);
                  blurPreview = preview;
                }
              } catch {}
              URL.revokeObjectURL(vUrl);
              r(null);
            };
            v.onerror = () => { URL.revokeObjectURL(vUrl); r(null); };
          });
        } catch {}
      } else if (fileType === 'audio') {
        try {
          const metadata: AudioMetadata = {
            title: fileName.replace(/\.[^/.]+$/, ''),
            artist: '',
            duration: 0,
            size: file.size,
          };

          const audioDataUrl = URL.createObjectURL(file);
          const dur = await new Promise<number>((res) => {
            const a = new Audio();
            a.src = audioDataUrl;
            a.onloadedmetadata = () => {
              URL.revokeObjectURL(audioDataUrl);
              res(Math.round(a.duration));
            };
            a.onerror = () => {
              URL.revokeObjectURL(audioDataUrl);
              res(0);
            };
          });
          metadata.duration = dur;

          if (window.jsmediatags) {
            await new Promise<void>((res) => {
              window.jsmediatags.read(file, {
                onSuccess: (tags: any) => {
                  if (tags.tags.title) metadata.title = tags.tags.title;
                  if (tags.tags.artist) metadata.artist = tags.tags.artist;
                  if (tags.tags.picture) {
                    const pic = tags.tags.picture;
                    let base64String = '';
                    for (let i = 0; i < pic.data.length; i++) {
                      base64String += String.fromCharCode(pic.data[i]);
                    }
                    const b64 = window.btoa(base64String);
                    metadata.cover = `data:${pic.format};base64,${b64}`;
                    preview = metadata.cover;
                  }
                  res();
                },
                onError: () => res(),
              });
            });
          }
          audioMetadata = metadata;
        } catch {}
      }

      newFiles.push({
        filePath: tempPath || preview || fileName,
        preview: preview || null,
        name: fileName,
        sizeMb,
        fileType,
        uploadedMb: 0,
        uploading: false,
        error: null,
        uploadedUrl: null,
        audioMetadata,
        width: dimensions.width,
        height: dimensions.height,
        duration: videoDuration || audioMetadata?.duration,
        blurPreview,
      });
    }

    if (newFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newFiles]);
      setIsAttachmentModalOpen(true);
    }
  }, [maxFileMb, setAttachedFiles, setIsAttachmentModalOpen, setIsDiscordFileLimitModalOpen]);

  return {
    isDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDropFiles,
  };
};
