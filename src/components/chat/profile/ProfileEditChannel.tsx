import React from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Smile } from 'lucide-react';
import { EmojiPicker } from '../EmojiPicker';
import { AvatarCropperModal } from '../../settings/AvatarCropperModal';

interface ProfileEditChannelProps {
  isGroup: boolean;
  editName: string;
  setEditName: React.Dispatch<React.SetStateAction<string>>;
  editDescription: string;
  setEditDescription: React.Dispatch<React.SetStateAction<string>>;
  editAvatarUrl: string | null;
  setEditAvatarUrl: React.Dispatch<React.SetStateAction<string | null>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  emojiBtnRef: React.RefObject<HTMLButtonElement | null>;
  showEmojiPicker: boolean;
  setShowEmojiPicker: React.Dispatch<React.SetStateAction<boolean>>;
  cropperModalOpen: boolean;
  setCropperModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  cropperImageSrc: string | null;
  setCropperImageSrc: React.Dispatch<React.SetStateAction<string | null>>;
}

export const ProfileEditChannel: React.FC<ProfileEditChannelProps> = ({
  isGroup,
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  editAvatarUrl,
  setEditAvatarUrl,
  fileInputRef,
  handleAvatarFileChange,
  emojiBtnRef,
  showEmojiPicker,
  setShowEmojiPicker,
  cropperModalOpen,
  setCropperModalOpen,
  cropperImageSrc,
  setCropperImageSrc,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '24px 20px 32px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', width: '100%' }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('channel.change_avatar', 'Изменить аватарку')}
          style={{
            width: '74px',
            height: '74px',
            borderRadius: '50%',
            backgroundColor: '#3B82F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {editAvatarUrl ? (
            <>
              <img src={editAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={26} color="#ffffff" />
              </div>
            </>
          ) : (
            <Camera size={30} color="#ffffff" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          style={{ display: 'none' }}
          onChange={handleAvatarFileChange}
        />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <span style={{ fontSize: '12px', color: 'var(--accent-color, #7C3AED)', fontWeight: 500, marginBottom: '2px' }}>
            {isGroup ? t('groupSettings.group_name', 'Название группы') : t('channel.channel_name', 'Название канала')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid var(--accent-color, #7C3AED)', paddingBottom: '4px' }}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={isGroup ? t('groupSettings.group_name', 'Название группы') : t('channel.channel_name_placeholder', 'Название')}
              aria-label={isGroup ? t('groupSettings.group_name', 'Название группы') : t('channel.channel_name', 'Название канала')}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main, #ffffff)',
                fontSize: '15px',
                padding: 0,
              }}
            />
            <button
              ref={emojiBtnRef}
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              aria-label={t('emojiPicker.emojis', 'Эмодзи')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim, #8e8e93)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Smile size={20} />
            </button>
          </div>
          {showEmojiPicker && (
            <div
              style={{ position: 'absolute', right: 0, top: '100%', zIndex: 999999, marginTop: '8px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <EmojiPicker
                onSelect={(emoji: string) => {
                  setEditName((prev) => prev + emoji);
                }}
                onClose={() => setShowEmojiPicker(false)}
                anchorEl={emojiBtnRef.current}
                recentEmojis={[]}
                onRecentUpdate={() => {}}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: '28px', width: '100%' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-dim, #8e8e93)', marginBottom: '6px' }}>
          {isGroup ? t('groupSettings.group_desc', 'Описание группы') : t('channel.description_optional', 'Описание (необязательно)')}
        </span>
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder={isGroup ? t('groupSettings.group_desc', 'Описание группы') : t('channel.description_optional', 'Описание (необязательно)')}
          aria-label={isGroup ? t('groupSettings.group_desc', 'Описание группы') : t('channel.description_optional', 'Описание (необязательно)')}
          rows={3}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--surface-border, rgba(255, 255, 255, 0.15))',
            color: 'var(--text-main, #ffffff)',
            fontSize: '14px',
            lineHeight: '1.4',
            resize: 'none',
            outline: 'none',
            padding: '6px 0',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <AvatarCropperModal
        isOpen={cropperModalOpen}
        imageSrc={cropperImageSrc}
        onClose={() => {
          setCropperModalOpen(false);
          setCropperImageSrc(null);
        }}
        onSave={(dataUrl) => {
          setEditAvatarUrl(dataUrl);
          setCropperModalOpen(false);
          setCropperImageSrc(null);
        }}
      />
    </div>
  );
};
