import bluetooth from 'munim-bluetooth';

export const SYNC_SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
export const SYNC_CHARACTERISTIC_UUID = "87654321-4321-4321-4321-cba987654321";

export interface SyncMessage {
  action: 'PLAY' | 'PAUSE';
}

export const encodeMessage = (msg: SyncMessage): string => {
  return msg.action === 'PLAY' ? '01' : '00';
};

export const decodeMessage = (hex: string): SyncMessage => {
  return { action: hex === '01' ? 'PLAY' : 'PAUSE' };
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

export const startGuestScanning = async (onDeviceFound: (device: BluetoothDevice) => void) => {
  await requestPermissions();

  bluetooth.addEventListener('deviceFound', (device) => {
    if (device.name === 'SynchMeHost' || device.serviceUUIDs?.includes(SYNC_SERVICE_UUID)) {
      console.log('Found Host:', device.id);
      onDeviceFound({ id: device.id, name: device.name || 'SynchMeHost' });
    }
  });

  bluetooth.startScan({ serviceUUIDs: [SYNC_SERVICE_UUID] });
};

export const stopGuestScanning = async () => {
  bluetooth.stopScan();
};

export const connectToHost = async (deviceId: string, onMessageReceived: (msg: SyncMessage) => void) => {
  try {
    await stopGuestScanning();
    await bluetooth.connect(deviceId);
    console.log('Connected to Host:', deviceId);
    
    await bluetooth.discoverServices(deviceId);
    
    bluetooth.subscribeToCharacteristic(deviceId, SYNC_SERVICE_UUID, SYNC_CHARACTERISTIC_UUID);
    
    bluetooth.addEventListener('characteristicValueChanged', (event) => {
      if (event.characteristicUUID.toLowerCase() === SYNC_CHARACTERISTIC_UUID.toLowerCase()) {
        const msg = decodeMessage(event.value);
        onMessageReceived(msg);
      }
    });
    
  } catch (e) {
    console.error('Guest connection error:', e);
    throw e;
  }
};

// ==========================================
// HOST (PERIPHERAL) MODE
// ==========================================
export const startHostBroadcasting = async () => {
  await requestPermissions();

  try {
    bluetooth.setServices([
      {
        uuid: SYNC_SERVICE_UUID,
        characteristics: [
          {
            uuid: SYNC_CHARACTERISTIC_UUID,
            properties: ['read', 'write', 'notify'],
          }
        ]
      }
    ]);

    bluetooth.startAdvertising({
      serviceUUIDs: [SYNC_SERVICE_UUID],
      localName: 'SynchMeHost'
    });
    console.log('Host is broadcasting!');
  } catch (e) {
    console.error('Host broadcasting error:', e);
  }
};

export const broadcastMessage = async (msg: SyncMessage) => {
  const hex = encodeMessage(msg);
  console.log(`Broadcasting message: ${msg.action} (Hex: ${hex})`);
  try {
    await bluetooth.updateCharacteristicValue(SYNC_SERVICE_UUID, SYNC_CHARACTERISTIC_UUID, hex, true);
  } catch (e) {
    console.error('Broadcast message error:', e);
  }
};
