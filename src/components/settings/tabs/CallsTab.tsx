import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MD3, PreferencesGroup, PreferenceSwitch, DeviceSelect } from '../SettingsShared';
import { liveKitService } from '../../../services/livekitService';

interface CallsTabProps {
  voiceCallsEnabled: boolean;
  setVoiceCallsEnabled: (val: boolean) => void;
  callSoundsEnabled: boolean;
  setCallSoundsEnabled: (val: boolean) => void;
  peerVolume: number;
  setPeerVolume: (val: number) => void;
  micVolume: number;
  setMicVolume: (val: number) => void;
  selectedCameraId: string;
  setSelectedCameraId: (id: string) => void;
  selectedMicrophoneId: string;
  setSelectedMicrophoneId: (id: string) => void;
  selectedSpeakerId: string;
  setSelectedSpeakerId: (id: string) => void;
  videoInputDevices: MediaDeviceInfo[];
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  alwaysRelayCalls: boolean;
  setAlwaysRelayCalls: (val: boolean) => void;
}

export const CallsTab = ({
  voiceCallsEnabled,
  setVoiceCallsEnabled,
  callSoundsEnabled,
  setCallSoundsEnabled,
  peerVolume,
  setPeerVolume,
  micVolume,
  setMicVolume,
  selectedCameraId,
  setSelectedCameraId,
  selectedMicrophoneId,
  setSelectedMicrophoneId,
  selectedSpeakerId,
  setSelectedSpeakerId,
  videoInputDevices,
  audioInputDevices,
  audioOutputDevices,
  alwaysRelayCalls,
  setAlwaysRelayCalls,
}: CallsTabProps) => {
  const { t } = useTranslation();
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{ padding: '0 0 32px' }}
      >
        <PreferencesGroup title={t('settings.calls')}>
          <PreferenceSwitch
            label={t('settings.enable_incoming_calls')}
            checked={voiceCallsEnabled}
            onChange={() => setVoiceCallsEnabled(!voiceCallsEnabled)}
          />
          <PreferenceSwitch
            label={t('settings.play_call_sounds')}
            checked={callSoundsEnabled}
            onChange={() => setCallSoundsEnabled(!callSoundsEnabled)}
          />
        </PreferencesGroup>

        <PreferencesGroup title={t('settings.voice_section')}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '14px 0',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: MD3.onSurface }}>
                {t('call.peer_volume')}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: peerVolume > 100 ? '#f59e0b' : MD3.primary, fontVariantNumeric: 'tabular-nums' }}>
                {peerVolume}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={peerVolume}
              onChange={(e) => setPeerVolume(Number(e.target.value))}
              aria-label={t('call.peer_volume')}
              style={{
                width: '100%',
                height: 8,
                accentColor: peerVolume > 100 ? '#f59e0b' : 'var(--accent-color, #7C3AED)',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MD3.onSurfaceVar }}>
              <span>0%</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '14px 0',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: MD3.onSurface }}>
                {t('call.mic_volume')}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: micVolume > 100 ? '#f59e0b' : MD3.primary, fontVariantNumeric: 'tabular-nums' }}>
                {micVolume}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={micVolume}
              onChange={(e) => setMicVolume(Number(e.target.value))}
              aria-label={t('call.mic_volume')}
              style={{
                width: '100%',
                height: 8,
                accentColor: micVolume > 100 ? '#f59e0b' : 'var(--accent-color, #7C3AED)',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MD3.onSurfaceVar }}>
              <span>0%</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>
        </PreferencesGroup>

        <PreferencesGroup title={t('settings.devices_header')}>
          <DeviceSelect
            label={t('settings.video_device')}
            value={selectedCameraId}
            devices={videoInputDevices}
            defaultLabel={t('settings.default_device')}
            onChange={(id) => {
              setSelectedCameraId(id);
              liveKitService.switchDevice('videoinput', id);
            }}
          />
          <DeviceSelect
            label={t('settings.microphone_device')}
            value={selectedMicrophoneId}
            devices={audioInputDevices}
            defaultLabel={t('settings.default_device')}
            onChange={(id) => {
              setSelectedMicrophoneId(id);
              liveKitService.switchDevice('audioinput', id);
            }}
          />
          <DeviceSelect
            label={t('settings.speakers_device')}
            value={selectedSpeakerId}
            devices={audioOutputDevices}
            defaultLabel={t('settings.default_device')}
            onChange={(id) => {
              setSelectedSpeakerId(id);
              liveKitService.switchDevice('audiooutput', id);
            }}
          />
        </PreferencesGroup>

        <PreferencesGroup title={t('settings.advanced_header')}>
          <PreferenceSwitch
            label={t('settings.always_relay_calls')}
            description={t('settings.always_relay_calls_desc')}
            checked={alwaysRelayCalls}
            onChange={() => setAlwaysRelayCalls(!alwaysRelayCalls)}
          />
        </PreferencesGroup>
      </motion.div>
  );
};
