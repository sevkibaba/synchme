import { encodeMessage, decodeMessage, startHostBroadcasting, SYNC_SERVICE_UUID } from '../src/services/BleService';
import bluetooth from 'munim-bluetooth';

describe('BleService', () => {
  describe('encodeMessage / decodeMessage', () => {
    it('encodes PLAY correctly', () => {
      expect(encodeMessage({ action: 'PLAY' })).toBe('01');
    });

    it('encodes PAUSE correctly', () => {
      expect(encodeMessage({ action: 'PAUSE' })).toBe('00');
    });

    it('decodes 01 to PLAY', () => {
      expect(decodeMessage('01').action).toBe('PLAY');
    });

    it('decodes 00 to PAUSE', () => {
      expect(decodeMessage('00').action).toBe('PAUSE');
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
