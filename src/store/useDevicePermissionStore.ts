import { create } from 'zustand';
import { sqliteStorage } from '../services/sqliteStorage';

export type DevicePermissionType = 'camera' | 'microphone';

interface DevicePermissionState {
  isModalOpen: boolean;
  permissionType: DevicePermissionType | null;
  hasCameraPermission: boolean;
  hasMicrophonePermission: boolean;
  pendingResolve: ((granted: boolean) => void) | null;
  requestPermission: (type: DevicePermissionType) => Promise<boolean>;
  setCameraPermission: (granted: boolean) => void;
  setMicrophonePermission: (granted: boolean) => void;
  confirmPermission: () => void;
  denyPermission: () => void;
  resetPermissions: () => void;
}

export const useDevicePermissionStore = create<DevicePermissionState>((set, get) => ({
  isModalOpen: false,
  permissionType: null,
  hasCameraPermission: true,
  hasMicrophonePermission: true,
  pendingResolve: null,

  requestPermission: (_type: DevicePermissionType): Promise<boolean> => {
    return Promise.resolve(true);
  },

  setCameraPermission: (granted: boolean) => {
    if (granted) {
      sqliteStorage.set('orbita_perm_camera', 'granted').catch(() => {});
    } else {
      sqliteStorage.remove('orbita_perm_camera').catch(() => {});
    }
    set({ hasCameraPermission: granted });
  },

  setMicrophonePermission: (granted: boolean) => {
    if (granted) {
      sqliteStorage.set('orbita_perm_microphone', 'granted').catch(() => {});
    } else {
      sqliteStorage.remove('orbita_perm_microphone').catch(() => {});
    }
    set({ hasMicrophonePermission: granted });
  },

  confirmPermission: () => {
    const { permissionType, pendingResolve } = get();
    if (permissionType === 'camera') {
      sqliteStorage.set('orbita_perm_camera', 'granted').catch(() => {});
      set({ hasCameraPermission: true, isModalOpen: false, permissionType: null, pendingResolve: null });
    } else if (permissionType === 'microphone') {
      sqliteStorage.set('orbita_perm_microphone', 'granted').catch(() => {});
      set({ hasMicrophonePermission: true, isModalOpen: false, permissionType: null, pendingResolve: null });
    }
    if (pendingResolve) {
      pendingResolve(true);
    }
  },

  denyPermission: () => {
    const { pendingResolve } = get();
    set({ isModalOpen: false, permissionType: null, pendingResolve: null });
    if (pendingResolve) {
      pendingResolve(false);
    }
  },

  resetPermissions: () => {
    sqliteStorage.remove('orbita_perm_camera').catch(() => {});
    sqliteStorage.remove('orbita_perm_microphone').catch(() => {});
    set({ hasCameraPermission: false, hasMicrophonePermission: false });
  },
}));

sqliteStorage.get('orbita_perm_camera').then((val) => {
  if (val !== null) {
    useDevicePermissionStore.setState({ hasCameraPermission: val !== 'denied' });
  }
}).catch(() => {});

sqliteStorage.get('orbita_perm_microphone').then((val) => {
  if (val !== null) {
    useDevicePermissionStore.setState({ hasMicrophonePermission: val !== 'denied' });
  }
}).catch(() => {});
