import bluetooth from 'munim-bluetooth';

export const SYNC_SERVICE_UUID = "12345678-1234-1234-1234-123456789ABD";
export const SYNC_CHARACTERISTIC_UUID = "87654321-4321-4321-4321-CBA987654322";

export interface SyncMessage {
  action: 'PLAY' | 'PAUSE' | 'RESET' | 'SONG' | 'PING' | 'PONG' | 'SYNC' | 'READY' | 'REQUEST_SONG' | 'REQUEST_SYNC';
  time: number;
  name?: string;
}

const stringToHex = (str: string) => {
  try {
    const utf8 = unescape(encodeURIComponent(str));
    let hex = '';
    for (let i = 0; i < utf8.length; i++) {
      hex += utf8.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  } catch (e) {
    return '';
  }
};

const hexToString = (hex: string) => {
  try {
    let utf8 = '';
    for (let i = 0; i < hex.length; i += 2) {
      utf8 += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return decodeURIComponent(escape(utf8));
  } catch (e) {
    return '';
  }
};

export const encodeMessage = (msg: SyncMessage): string => {
  const payload = `${msg.action}:${msg.time}${msg.name ? ':' + msg.name : ''}`;
  return stringToHex(payload);
};

export const decodeMessage = (hex: string): SyncMessage => {
  const payload = hexToString(hex);
  const [action, timeStr, ...nameParts] = payload.split(':');
  return { 
    action: action as SyncMessage['action'], 
    time: parseFloat(timeStr) || 0,
    name: nameParts.join(':') || undefined
  };
};

export const requestPermissions = async () => {
  const granted = await bluetooth.requestBluetoothPermission(['scan', 'connect', 'advertise']);
  if (!granted) {
    console.warn("Bluetooth permissions not granted.");
  }
  return granted;
};

// ==========================================
// GUEST (CENTRAL) MODE
// ==========================================
export interface BluetoothDevice {
  id: string;
  name?: string;
}

let guestScanListener: (() => void) | null = null;

export const startGuestScanning = async (onDeviceFound: (device: BluetoothDevice) => void) => {
  await requestPermissions();

  if (guestScanListener) {
    
    guestScanListener();
  }

  guestScanListener = bluetooth.addEventListener('deviceFound', (device) => {
    const isNameMatch = device.name?.toLowerCase() === 'synchmehost';
    const isServiceMatch = device.serviceUUIDs?.some(uuid => uuid.toUpperCase() === SYNC_SERVICE_UUID.toUpperCase());
    
    if (isNameMatch || isServiceMatch) {
      
      onDeviceFound({ id: device.id, name: device.name || 'SynchMeHost' });
    }
  });

  
  bluetooth.startScan({});
};

export const stopGuestScanning = async () => {
  if (guestScanListener) {
    guestScanListener();
    guestScanListener = null;
  }
  bluetooth.stopScan();
};

export const connectToHost = async (
  deviceId: string, 
  onMessageReceived: (msg: SyncMessage) => void,
  onConnected: (songName: string | null) => void
) => {
  try {
    await stopGuestScanning();
    
    await bluetooth.connect(deviceId);
    
    
    
    await bluetooth.discoverServices(deviceId);
    
    
    let currentSong: string | null = null;
    try {
      
      const charVal = await bluetooth.readCharacteristic(deviceId, SYNC_SERVICE_UUID, SYNC_CHARACTERISTIC_UUID);
      if (charVal && charVal.value) {
        
        const msg = decodeMessage(charVal.value);
        if (msg.action === 'SONG' && msg.name) {
          currentSong = msg.name;
          
        }
      }
    } catch (e) {
      
    }

    // Subscribe and listen BEFORE calling onConnected (which triggers PING)
    try {
        await bluetooth.subscribeToCharacteristic(deviceId, SYNC_SERVICE_UUID, SYNC_CHARACTERISTIC_UUID);
    } catch(e) {}
    
    bluetooth.addEventListener('characteristicValueChanged', (event) => {
      if (event.characteristicUUID.toUpperCase() === SYNC_CHARACTERISTIC_UUID.toUpperCase()) {
        const msg = decodeMessage(event.value);
        onMessageReceived(msg);
      }
    });

    await onConnected(currentSong);
    
  } catch (e) {
    console.error('[GUEST-BLE] Guest connection error:', e);
    throw e;
  }
};

export const disconnectFromHost = (deviceId: string) => {
  try {
    
    bluetooth.disconnect(deviceId);
  } catch (e) {
    console.error('[GUEST-BLE] Disconnect error:', e);
  }
};

// ==========================================
// HOST (PERIPHERAL) MODE
// ==========================================

export const startHostBroadcasting = async (
  onMessageReceived?: (msg: SyncMessage) => void,
  getCurrentAudioTime?: () => number
) => {
  
  await requestPermissions();

  try {
    if (bluetooth.stopAdvertising) {
      
      bluetooth.stopAdvertising();
    }
  } catch(e) {
    
  }

  let retries = 5;
  while (retries > 0) {
    try {
      const isEnabled = await bluetooth.isBluetoothEnabled();
      if (!isEnabled) {
        
        await new Promise(resolve => setTimeout(resolve, 500));
        retries--;
        continue;
      }

      
      bluetooth.setServices([
        {
          uuid: SYNC_SERVICE_UUID,
          characteristics: [
            {
              uuid: SYNC_CHARACTERISTIC_UUID,
              properties: ['read', 'write', 'notify']
            }
          ]
        }
      ]);
      
      break; // Success, exit retry loop
    } catch (e: any) {
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries--;
      if (retries === 0) {
        console.error('[HOST-BLE] Host broadcasting fatal error: Could not set services', e);
        return; // Abort
      }
    }
  }

  try {
    
    bluetooth.startAdvertising({
      serviceUUIDs: [SYNC_SERVICE_UUID],
      localName: 'SynchMeHost'
    });
    

    const writeListener = bluetooth.addEventListener('peripheralWriteRequest', (req) => {
      try {
        const msg = decodeMessage(req.value);
        if (msg.action === 'PING') {
          // Send PONG with Host's Date.now() and audioTime in the name field
          const audioTime = getCurrentAudioTime ? getCurrentAudioTime() : 0;
          const pongMsg: SyncMessage = { action: 'PONG', time: msg.time, name: `${Date.now()}|${audioTime}` };
          broadcastMessage(pongMsg);
        }
        if (onMessageReceived) {
          onMessageReceived(msg);
        }
      } catch (e) {
        
      }
    });

    
    return () => {
      
      try { if (bluetooth.stopAdvertising) bluetooth.stopAdvertising(); } catch(e) {}
      if (writeListener && typeof writeListener === 'function') {
        writeListener();
      } else if (writeListener && (writeListener as any).remove) {
        (writeListener as any).remove();
      }
    };
  } catch (e) {
    console.error('[HOST-BLE] Host broadcasting error:', e);
  }
};

export const stopHostBroadcasting = () => {
  
  try { if (bluetooth.stopAdvertising) bluetooth.stopAdvertising(); } catch(e) {}
};

export const pingHost = async (deviceId: string): Promise<string | null> => {
  try {
    const pingMsg: SyncMessage = { action: 'PING', time: Date.now() };
    await bluetooth.writeCharacteristic(
      deviceId, 
      SYNC_SERVICE_UUID, 
      SYNC_CHARACTERISTIC_UUID, 
      encodeMessage(pingMsg)
    );
    return null;
  } catch (err: any) {
    return err.message || 'Error writing characteristic';
  }
};

export const sendReadyToHost = async (deviceId: string) => {
  try {
    
    const readyMsg: SyncMessage = { action: 'READY', time: 0 };
    await bluetooth.writeCharacteristic(
      deviceId, 
      SYNC_SERVICE_UUID, 
      SYNC_CHARACTERISTIC_UUID, 
      encodeMessage(readyMsg)
    );
    
  } catch (err) {
    
  }
};

export const requestSongFromHost = async (deviceId: string) => {
  try {
    
    const reqMsg: SyncMessage = { action: 'REQUEST_SONG', time: 0 };
    await bluetooth.writeCharacteristic(
      deviceId, 
      SYNC_SERVICE_UUID, 
      SYNC_CHARACTERISTIC_UUID, 
      encodeMessage(reqMsg)
    );
    
  } catch (err) {
    
  }
};

export const requestSyncFromHost = async (deviceId: string) => {
  try {
    
    const reqMsg: SyncMessage = { action: 'REQUEST_SYNC', time: 0 };
    await bluetooth.writeCharacteristic(
      deviceId, 
      SYNC_SERVICE_UUID, 
      SYNC_CHARACTERISTIC_UUID, 
      encodeMessage(reqMsg)
    );
  } catch (e) {
    
    throw e;
  }
};

export const broadcastMessage = async (msg: SyncMessage): Promise<string | null> => {
  const hex = encodeMessage(msg);
  
  try {
    await bluetooth.updateCharacteristicValue(SYNC_SERVICE_UUID, SYNC_CHARACTERISTIC_UUID, hex, true);
    return null;
  } catch (e: any) {
    console.error('Broadcast message error:', e);
    return e.message || 'Error updating characteristic';
  }
};
