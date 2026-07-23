import { encodeMessage, decodeMessage, startHostBroadcasting, SYNC_SERVICE_UUID } from '../src/services/BleService';
import bluetooth from 'munim-bluetooth';

describe('BleService', () => {
  describe('encodeMessage / decodeMessage', () => {
    it('encodes PLAY and time correctly', () => {
      // PLAY:1.5 -> hex
      const encoded = encodeMessage({ action: 'PLAY', time: 1.5 });
      expect(encoded).toBeTruthy();
      
      const decoded = decodeMessage(encoded);
      expect(decoded.action).toBe('PLAY');
      expect(decoded.time).toBe(1.5);
    });

    it('encodes PAUSE and time correctly', () => {
      const encoded = encodeMessage({ action: 'PAUSE', time: 0 });
      const decoded = decodeMessage(encoded);
      expect(decoded.action).toBe('PAUSE');
      expect(decoded.time).toBe(0);
    });

    it('encodes RESET and time correctly', () => {
      const encoded = encodeMessage({ action: 'RESET', time: 0 });
      const decoded = decodeMessage(encoded);
      expect(decoded.action).toBe('RESET');
      expect(decoded.time).toBe(0);
    });
  });

  describe('startHostBroadcasting', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('requests permissions and starts advertising', async () => {
      await startHostBroadcasting();
      
      expect(bluetooth.requestBluetoothPermission).toHaveBeenCalledWith(['scan', 'connect', 'advertise']);
      expect(bluetooth.setServices).toHaveBeenCalled();
      expect(bluetooth.startAdvertising).toHaveBeenCalledWith({
        serviceUUIDs: [SYNC_SERVICE_UUID],
        localName: 'SynchMeHost'
      });
    });
  });
});
