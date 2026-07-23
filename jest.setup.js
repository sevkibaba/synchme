// Mock expo-audio
jest.mock('expo-audio', () => ({
  useAudioPlayer: jest.fn(() => ({
    playing: false,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    currentTime: 0,
  })),
}));

// Mock expo-document-picker
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(() => Promise.resolve({
    canceled: false,
    assets: [{ uri: 'mocked-uri', name: 'mock.mp3', size: 1024 }],
  })),
}));

// Mock expo-file-system/legacy
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/document/directory/',
  readAsStringAsync: jest.fn(() => Promise.resolve('mock-base64')),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { Base64: 'base64' },
}));

// Mock expo-network
jest.mock('expo-network', () => ({
  getIpAddressAsync: jest.fn(() => Promise.resolve('192.168.1.100')),
}));

// Mock expo-http-server
jest.mock('expo-http-server', () => ({
  setup: jest.fn(),
  route: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
}));

// Mock munim-bluetooth
jest.mock('munim-bluetooth', () => {
  const listeners = {};
  const mockBluetooth = {
    BluetoothState: { PoweredOn: 'PoweredOn' },
    addEventListener: jest.fn((event, callback) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
      return () => {
        listeners[event] = listeners[event].filter(cb => cb !== callback);
      };
    }),
    requestBluetoothPermission: jest.fn(() => Promise.resolve(true)),
    getBluetoothStateAsync: jest.fn(() => Promise.resolve('PoweredOn')),
    setServices: jest.fn(() => Promise.resolve()),
    startAdvertising: jest.fn(() => Promise.resolve()),
    updateCharacteristicValue: jest.fn(() => Promise.resolve()),
    startScan: jest.fn(() => Promise.resolve()),
    stopScan: jest.fn(() => Promise.resolve()),
    connect: jest.fn(() => Promise.resolve()),
    discoverServices: jest.fn(() => Promise.resolve()),
    subscribeToCharacteristic: jest.fn(() => Promise.resolve()),
    __triggerEvent: (event, ...args) => {
      if (listeners[event]) {
        listeners[event].forEach(cb => cb(...args));
      }
    }
  };
  return {
    __esModule: true,
    default: mockBluetooth,
    ...mockBluetooth
  };
});
