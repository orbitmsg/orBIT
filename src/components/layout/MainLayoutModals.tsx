import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { ConnectModal } from './ConnectModal';
import { MyProfileModal } from '../chat/MyProfileModal';
import { CallsModal } from '../call/CallsModal';
import { FriendRequestsModal } from './FriendRequestsModal';
import { DeleteAccountModal } from '../common/DeleteAccountModal';
import { ActionConfirmModal, type ConfirmActionType } from '../common/ActionConfirmModal';
import { IncomingCallModal } from '../call/IncomingCallModal';
import { CallWindow } from '../call/CallWindow';
import { DevicePermissionModal } from '../common/DevicePermissionModal';
import { GroupInviteModal } from '../chat/GroupInviteModal';
import { ChannelInviteModal } from '../chat/ChannelInviteModal';
import type { ChannelInfo } from '../../services/channelService';
import { useChatStore, type IncomingFriendRequest } from '../../store/useChatStore';

export interface MainLayoutModalsProps {
  groupInviteUrl?: string | null;
  setGroupInviteUrl?: (url: string | null) => void;
  channelInviteUrl?: string | null;
  setChannelInviteUrl?: (url: string | null) => void;
  channelInviteData?: ChannelInfo | null;
  setChannelInviteData?: (data: ChannelInfo | null) => void;
  connectModalConfig: { isOpen: boolean; type: 'friend' | 'group' | 'channel' };
  setConnectModalConfig: React.Dispatch<React.SetStateAction<{ isOpen: boolean; type: 'friend' | 'group' | 'channel' }>>;
  handleConnectRequest: (friendCode: string, callback: (success: boolean, error?: string) => void) => void;
  isMyProfileOpen: boolean;
  setIsMyProfileOpen: (open: boolean) => void;
  showCallsModal: boolean;
  setShowCallsModal: (open: boolean) => void;
  setActiveChat: (chatId: string | null) => void;
  isMobileView: boolean;
  showFriendRequestsModal: boolean;
  setShowFriendRequestsModal: (open: boolean) => void;
  handleAcceptFriendRequest: (req: IncomingFriendRequest) => Promise<void>;
  handleRejectFriendRequest: (req: IncomingFriendRequest) => Promise<void>;
  showDeleteModal: boolean;
  setShowDeleteModal: (open: boolean) => void;
  handleDeleteAccount: () => Promise<void>;
  confirmModal: {
    isOpen: boolean;
    type: ConfirmActionType | null;
    chatId: string;
    chatName: string;
    avatarUrl?: string;
    isNotes?: boolean;
  };
  setConfirmModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    type: ConfirmActionType | null;
    chatId: string;
    chatName: string;
    avatarUrl?: string;
    isNotes?: boolean;
  }>>;
  handleClearHistory: (chatId: string) => void;
  handleDeleteChat: (chatId: string) => void;
  showVoiceDiscardModal: boolean;
  setShowVoiceDiscardModal: (open: boolean) => void;
  showUploadDiscardModal: boolean;
  setShowUploadDiscardModal: (open: boolean) => void;
  pendingSwitchChatId: string | null;
  setPendingSwitchChatId: (id: string | null) => void;
  showCallModalsInWindow: boolean;
}

export const MainLayoutModals: React.FC<MainLayoutModalsProps> = ({
  connectModalConfig,
  setConnectModalConfig,
  handleConnectRequest,
  isMyProfileOpen,
  setIsMyProfileOpen,
  showCallsModal,
  setShowCallsModal,
  setActiveChat,
  isMobileView,
  showFriendRequestsModal,
  setShowFriendRequestsModal,
  handleAcceptFriendRequest,
  handleRejectFriendRequest,
  showDeleteModal,
  setShowDeleteModal,
  handleDeleteAccount,
  confirmModal,
  setConfirmModal,
  handleClearHistory,
  handleDeleteChat,
  showVoiceDiscardModal,
  setShowVoiceDiscardModal,
  showUploadDiscardModal,
  setShowUploadDiscardModal,
  pendingSwitchChatId,
  setPendingSwitchChatId,
  showCallModalsInWindow,
  groupInviteUrl,
  setGroupInviteUrl,
  channelInviteUrl,
  setChannelInviteUrl,
  channelInviteData,
  setChannelInviteData,
}) => {
  return (
    <>
      {connectModalConfig.isOpen && (
        <ConnectModal
          type={connectModalConfig.type}
          onClose={() => setConnectModalConfig(prev => ({ ...prev, isOpen: false }))}
          onConnectRequest={handleConnectRequest}
        />
      )}

      <MyProfileModal
        isOpen={isMyProfileOpen}
        onClose={() => setIsMyProfileOpen(false)}
        isMobileView={isMobileView}
      />

      <AnimatePresence>
        {showCallsModal && (
          <CallsModal
            isOpen={showCallsModal}
            onClose={() => setShowCallsModal(false)}
          />
        )}
      </AnimatePresence>

      <FriendRequestsModal
        isOpen={showFriendRequestsModal}
        onClose={() => setShowFriendRequestsModal(false)}
        onAccept={handleAcceptFriendRequest}
        onReject={handleRejectFriendRequest}
      />

      <AnimatePresence>
        {showDeleteModal && (
          <DeleteAccountModal
            isOpen={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={handleDeleteAccount}
          />
        )}
      </AnimatePresence>

      <ActionConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        chatName={confirmModal.chatName}
        avatarUrl={confirmModal.avatarUrl}
        isNotes={confirmModal.isNotes}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false, type: null }))}
        onConfirm={() => {
          if (confirmModal.type === 'clear_history') {
            handleClearHistory(confirmModal.chatId);
          } else if (confirmModal.type === 'delete_chat' || confirmModal.type === 'leave_channel') {
            handleDeleteChat(confirmModal.chatId);
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false, type: null }));
        }}
      />

      <ActionConfirmModal
        isOpen={showVoiceDiscardModal}
        type="discard_voice"
        onClose={() => {
          setShowVoiceDiscardModal(false);
          setPendingSwitchChatId(null);
        }}
        onConfirm={() => {
          window.dispatchEvent(new CustomEvent('orbita:cancel-voice-recording'));
          useChatStore.getState().setIsRecordingVoice(false);
          setShowVoiceDiscardModal(false);
          if (pendingSwitchChatId) {
            if (pendingSwitchChatId === '__CLOSE__') {
              setActiveChat(null);
            } else if (pendingSwitchChatId === '__QUIT__') {
              try { ((window as any).orbita?.closeWindow?.()); } catch {}
            } else {
              setActiveChat(pendingSwitchChatId);
            }
            setPendingSwitchChatId(null);
          }
        }}
      />

      <ActionConfirmModal
        isOpen={showUploadDiscardModal}
        type="abort_upload"
        onClose={() => {
          setShowUploadDiscardModal(false);
          setPendingSwitchChatId(null);
        }}
        onConfirm={() => {
          window.dispatchEvent(new CustomEvent('orbita:abort-media-upload'));
          useChatStore.getState().setIsUploadingMedia(false);
          setShowUploadDiscardModal(false);
          if (pendingSwitchChatId) {
            if (pendingSwitchChatId === '__CLOSE__') {
              setActiveChat(null);
            } else if (pendingSwitchChatId === '__QUIT__') {
              try { ((window as any).orbita?.closeWindow?.()); } catch {}
            } else {
              setActiveChat(pendingSwitchChatId);
            }
            setPendingSwitchChatId(null);
          }
        }}
      />

      {showCallModalsInWindow && <IncomingCallModal />}
      {showCallModalsInWindow && <CallWindow />}
      <DevicePermissionModal />
      {groupInviteUrl && (
        <GroupInviteModal
          inviteUrl={groupInviteUrl}
          onClose={() => setGroupInviteUrl?.(null)}
        />
      )}
      {(channelInviteUrl || channelInviteData) && (
        <ChannelInviteModal
          inviteUrl={channelInviteUrl || null}
          initialChannel={channelInviteData || null}
          onClose={() => {
            setChannelInviteUrl?.(null);
            setChannelInviteData?.(null);
          }}
        />
      )}
    </>
  );
};
