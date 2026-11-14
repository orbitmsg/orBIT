import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  X,
  ChevronRight,
  Gamepad2,
  Users,
  GraduationCap,
  School,
  Sparkles,
  Globe2,
  Camera,
  Plus,
} from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { lobbyService } from '../../services/lobbyService';
import { getMediaInfoFromDataUrl } from '../../utils/staticImageValidation';
import { extractGroupCode } from '../../lib/groupCrypto';

export interface CreateLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLobbyCreated?: (lobbyId: string) => void;
}

type Step = 'templates' | 'audience' | 'customize' | 'join';

export const CreateLobbyModal: React.FC<CreateLobbyModalProps> = ({
  isOpen,
  onClose,
  onLobbyCreated,
}) => {
  const { t } = useTranslation();
  const nickname = useAuthStore((s) => s.nickname) || 'User';
  const myCode = useChatStore((s) => s.myCode) || '';
  const myAvatar = useAuthStore((s) => s.avatarUrl);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const addChat = useChatStore((s) => s.addChat);

  const [step, setStep] = useState<Step>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('custom');
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [lobbyName, setLobbyName] = useState<string>(`Лобби ${nickname}`);
  const [avatarData, setAvatarData] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectTemplate = (_templateId: string, templateCategory: string) => {
    setSelectedTemplate(templateCategory);
    let defaultName = `Лобби ${nickname}`;
    if (templateCategory === 'gaming') defaultName = `Игровое лобби ${nickname}`;
    if (templateCategory === 'friends') defaultName = `Комната друзей ${nickname}`;
    if (templateCategory === 'study') defaultName = `Учебная группа ${nickname}`;
    if (templateCategory === 'club') defaultName = `Клуб ${nickname}`;
    setLobbyName(defaultName);
    setStep('audience');
  };

  const handleSelectAudience = (publicChoice: boolean) => {
    setIsPublic(publicChoice);
    setStep('customize');
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarData(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!lobbyName.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      let finalAvatarUrl: string | null = avatarData;
      if (avatarData && avatarData.startsWith('data:')) {
        const base64 = avatarData.includes(',') ? avatarData.split(',')[1] : avatarData;
        const { ext } = getMediaInfoFromDataUrl(avatarData);
        if (typeof window !== 'undefined' && window.orbita?.writeTempFile && window.orbita?.uploadToCloudinary) {
          try {
            const tempPath = await window.orbita.writeTempFile(base64, ext);
            if (tempPath) {
              const publicId = `lobby_avatar_${Date.now()}`;
              const uploadRes = await window.orbita.uploadToCloudinary(tempPath, publicId);
              if (uploadRes.success && uploadRes.secure_url) {
                finalAvatarUrl = uploadRes.secure_url;
              }
              await window.orbita.deleteTempFile(tempPath);
            }
          } catch {}
        }
      }

      const lobby = await lobbyService.createLobby({
        name: lobbyName.trim(),
        avatarUrl: finalAvatarUrl,
        category: selectedTemplate,
        isPublic: isPublic,
        creatorCode: myCode,
        creatorNickname: nickname,
        creatorAvatar: myAvatar || null,
      });

      addChat({
        id: lobby.id,
        type: 'group',
        name: lobby.name,
        description: lobby.description || '',
        avatarUrl: lobby.avatarUrl || undefined,
        sharedSecret: lobby.sharedSecret || undefined,
        inviteCode: lobby.code,
        creatorCode: myCode,
        isOwner: true,
        role: 'owner',
        lastMsg: 'Лобби создано',
        unreadCount: 0,
      });

      setActiveChat(lobby.id);
      onLobbyCreated?.(lobby.id);
      handleClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ошибка создания лобби');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinByInvite = async () => {
    const raw = inviteInput.trim();
    if (!raw) return;
    const code = extractGroupCode(raw) || raw;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const lobby = await lobbyService.getLobbyByCode(code);
      if (!lobby) {
        setErrorMsg(t('lobby.invalid_invite'));
        setIsLoading(false);
        return;
      }

      const joined = await lobbyService.joinLobby(lobby.id, {
        userCode: myCode,
        nickname: nickname,
        avatarUrl: myAvatar || null,
      });

      if (joined) {
        addChat({
          id: joined.id,
          type: 'group',
          name: joined.name,
          description: joined.description || '',
          avatarUrl: joined.avatarUrl || undefined,
          sharedSecret: joined.sharedSecret || undefined,
          inviteCode: joined.code,
          creatorCode: joined.creatorCode,
          isOwner: joined.creatorCode === myCode,
          role: joined.creatorCode === myCode ? 'owner' : 'member',
          lastMsg: 'Вы присоединились к лобби',
          unreadCount: 0,
        });

        setActiveChat(joined.id);
        onLobbyCreated?.(joined.id);
        handleClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('lobby.invalid_invite'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('templates');
    setSelectedTemplate('custom');
    setIsPublic(false);
    setAvatarData(null);
    setErrorMsg(null);
    setInviteInput('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="relative w-full max-w-[440px] flex flex-col rounded-[10px] overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
          borderRadius: '10px',
          border: 'none',
          outline: 'none',
          color: 'var(--text-main, #ffffff)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label={t('common.close', 'Закрыть')}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-[var(--text-dim)] hover:text-white hover:bg-white/10 transition-colors border-none outline-none cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="p-6 flex flex-col min-h-0">
          <AnimatePresence mode="wait">
            {step === 'templates' && (
              <motion.div
                key="step-templates"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.14 }}
                className="flex flex-col gap-4"
              >
                <div className="text-center px-2">
                  <h2 className="text-xl font-bold tracking-tight mb-1">
                    {t('lobby.create_title')}
                  </h2>
                  <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">
                    {t('lobby.create_subtitle')}
                  </p>
                </div>

                <div className="flex flex-col gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('custom', 'general')}
                    aria-label={t('lobby.my_template')}
                    className="flex items-center justify-between p-3.5 rounded-[10px] transition-all cursor-pointer border-none outline-none text-left"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 text-white">
                        <Sparkles size={18} />
                      </div>
                      <span className="font-semibold text-[14px]">
                        {t('lobby.my_template')}
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-[var(--text-dim)]" />
                  </button>

                  <div className="text-[11px] font-bold tracking-wider text-[var(--text-dim)] uppercase px-1 mt-2">
                    {t('lobby.start_from_template')}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('gaming', 'gaming')}
                    aria-label={t('lobby.template_gaming')}
                    className="flex items-center justify-between p-3 rounded-[10px] transition-all cursor-pointer border-none outline-none text-left"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-indigo-500/20 text-indigo-400">
                        <Gamepad2 size={17} />
                      </div>
                      <span className="font-medium text-[13.5px]">
                        {t('lobby.template_gaming')}
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-[var(--text-dim)]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('friends', 'friends')}
                    aria-label={t('lobby.template_friends')}
                    className="flex items-center justify-between p-3 rounded-[10px] transition-all cursor-pointer border-none outline-none text-left"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-pink-500/20 text-pink-400">
                        <Users size={17} />
                      </div>
                      <span className="font-medium text-[13.5px]">
                        {t('lobby.template_friends')}
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-[var(--text-dim)]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('study', 'study')}
                    aria-label={t('lobby.template_study')}
                    className="flex items-center justify-between p-3 rounded-[10px] transition-all cursor-pointer border-none outline-none text-left"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-400">
                        <GraduationCap size={17} />
                      </div>
                      <span className="font-medium text-[13.5px]">
                        {t('lobby.template_study')}
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-[var(--text-dim)]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTemplate('club', 'club')}
                    aria-label={t('lobby.template_club')}
                    className="flex items-center justify-between p-3 rounded-[10px] transition-all cursor-pointer border-none outline-none text-left"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-500/20 text-blue-400">
                        <School size={17} />
                      </div>
                      <span className="font-medium text-[13.5px]">
                        {t('lobby.template_club')}
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-[var(--text-dim)]" />
                  </button>
                </div>

                <div className="mt-2 pt-3 border-t border-white/5 flex flex-col items-center gap-2">
                  <span className="text-[13px] font-semibold text-[var(--text-dim)]">
                    {t('lobby.have_invite')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep('join')}
                    aria-label={t('lobby.join_lobby')}
                    className="w-full py-2.5 rounded-[10px] font-medium text-[13.5px] transition-colors cursor-pointer border-none outline-none"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      color: '#ffffff',
                    }}
                  >
                    {t('lobby.join_lobby')}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'audience' && (
              <motion.div
                key="step-audience"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.14 }}
                className="flex flex-col gap-4"
              >
                <div className="text-center px-2">
                  <h2 className="text-xl font-bold tracking-tight mb-1">
                    {t('lobby.tell_about')}
                  </h2>
                  <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">
                    {t('lobby.tell_subtitle')}
                  </p>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAudience(false)}
                    aria-label={t('lobby.for_friends')}
                    className="flex items-center justify-between p-3.5 rounded-[10px] transition-all cursor-pointer border-none outline-none text-left"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-pink-500/20 text-pink-400">
                        <Users size={18} />
                      </div>
                      <span className="font-semibold text-[14px]">
                        {t('lobby.for_friends')}
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-[var(--text-dim)]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAudience(true)}
                    aria-label={t('lobby.for_community')}
                    className="flex items-center justify-between p-3.5 rounded-[10px] transition-all cursor-pointer border-none outline-none text-left"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-500/20 text-emerald-400">
                        <Globe2 size={18} />
                      </div>
                      <span className="font-semibold text-[14px]">
                        {t('lobby.for_community')}
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-[var(--text-dim)]" />
                  </button>
                </div>

                <div className="text-center mt-2">
                  <button
                    type="button"
                    onClick={() => setStep('customize')}
                    className="text-[12px] text-[var(--text-dim)] hover:text-white transition-colors border-none bg-transparent cursor-pointer underline underline-offset-2"
                  >
                    {t('lobby.skip_question')}
                  </button>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('templates')}
                    aria-label={t('lobby.back_btn')}
                    className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-[var(--text-dim)] hover:text-white transition-colors border-none bg-transparent cursor-pointer"
                  >
                    {t('lobby.back_btn')}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'customize' && (
              <motion.div
                key="step-customize"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.14 }}
                className="flex flex-col gap-4"
              >
                <div className="text-center px-2">
                  <h2 className="text-xl font-bold tracking-tight mb-1">
                    {t('lobby.customize')}
                  </h2>
                  <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">
                    {t('lobby.customize_subtitle')}
                  </p>
                </div>

                <div className="flex flex-col items-center justify-center my-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-20 h-20 rounded-full border-2 border-dashed border-white/20 hover:border-indigo-400 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    }}
                  >
                    {avatarData ? (
                      <img src={avatarData} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Camera size={22} className="text-white/60 mb-0.5" />
                        <span className="text-[10px] font-bold text-white/60 uppercase">
                          {t('lobby.upload_avatar')}
                        </span>
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#5865F2] flex items-center justify-center text-white">
                          <Plus size={12} strokeWidth={3} />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold tracking-wider text-[var(--text-dim)] uppercase">
                    {t('lobby.lobby_name')} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={lobbyName}
                    onChange={(e) => setLobbyName(e.target.value)}
                    placeholder={t('lobby.lobby_name')}
                    maxLength={48}
                    className="w-full px-3.5 py-2.5 rounded-[10px] text-[14px] font-medium outline-none border-none transition-colors"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  />
                </div>

                {errorMsg && (
                  <div className="text-[12px] text-red-400 text-center font-medium">
                    {errorMsg}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('audience')}
                    aria-label={t('lobby.back_btn')}
                    className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-[var(--text-dim)] hover:text-white transition-colors border-none bg-transparent cursor-pointer"
                  >
                    {t('lobby.back_btn')}
                  </button>

                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={!lobbyName.trim() || isLoading}
                    aria-label={t('lobby.create_btn')}
                    className="px-6 py-2.5 rounded-[10px] text-[13.5px] font-semibold text-white transition-all cursor-pointer border-none outline-none disabled:opacity-50"
                    style={{
                      backgroundColor: '#5865F2',
                    }}
                  >
                    {isLoading ? '...' : t('lobby.create_btn')}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'join' && (
              <motion.div
                key="step-join"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.14 }}
                className="flex flex-col gap-4"
              >
                <div className="text-center px-2">
                  <h2 className="text-xl font-bold tracking-tight mb-1">
                    {t('lobby.join_lobby')}
                  </h2>
                  <p className="text-[13px] text-[var(--text-dim)] leading-relaxed">
                    {t('lobby.invite_placeholder')}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  <input
                    type="text"
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    placeholder={t('lobby.invite_placeholder')}
                    className="w-full px-3.5 py-2.5 rounded-[10px] text-[14px] font-medium outline-none border-none transition-colors"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  />
                </div>

                {errorMsg && (
                  <div className="text-[12px] text-red-400 text-center font-medium">
                    {errorMsg}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('templates')}
                    aria-label={t('lobby.back_btn')}
                    className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-[var(--text-dim)] hover:text-white transition-colors border-none bg-transparent cursor-pointer"
                  >
                    {t('lobby.back_btn')}
                  </button>

                  <button
                    type="button"
                    onClick={handleJoinByInvite}
                    disabled={!inviteInput.trim() || isLoading}
                    aria-label={t('lobby.enter_lobby')}
                    className="px-6 py-2.5 rounded-[10px] text-[13.5px] font-semibold text-white transition-all cursor-pointer border-none outline-none disabled:opacity-50"
                    style={{
                      backgroundColor: '#5865F2',
                    }}
                  >
                    {isLoading ? '...' : t('lobby.enter_lobby')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default CreateLobbyModal;
