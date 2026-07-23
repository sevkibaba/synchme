# SynchMe

SynchMe is a React Native iOS application built with Expo that allows multiple iPhones to play an audio file (MP3) in perfect synchronization over Bluetooth. It completely bypasses the need for an active Wi-Fi or internet connection by using BLE (Bluetooth Low Energy) for its control signals.

## Features

- **Decentralized Synchronization**: No Wi-Fi or internet required. Completely powered by local Bluetooth.
- **Manual Nudging**: In case of slight device lag, users can manually nudge their playback by +/- 10ms or 50ms to achieve perfectly aligned audio.
- **Host / Guest Architecture**: One device acts as the Host (Broadcaster) to control Play/Pause, and nearby devices can scan and join as Guests (Listeners).
- **Precise Timing Payload**: The Bluetooth payload sends the exact audio `currentTime` during Play/Pause actions, snapping all Guests precisely to the correct timestamp instantly.

## How It Works

1. **Host**: The user selects an MP3 from their device. The Host then initializes a BLE Peripheral server using `munim-bluetooth` and advertises a custom `SYNC_SERVICE_UUID`.
2. **Guest**: The user selects the *same* MP3 file from their device. The Guest scans for the Host, connects to its GATT server, and listens for characteristic value changes.
3. **Playback**: When the Host presses "Play" or "Pause", it broadcasts a Hex-encoded payload containing the Action and the precise Timestamp (e.g., `PLAY:12.345`). The Guest receives this, seeks to the timestamp, and fires the corresponding action locally.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Expo CLI
- Physical iPhones (Bluetooth scanning and broadcasting do not work correctly on iOS Simulators)

### Installation
1. Clone the repository and navigate to the directory:
   ```bash
   cd synchme
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the project directly on your physical iPhone (requires Expo Dev Client or native build):
   ```bash
   npx expo run:ios --device
   ```
   > **Note**: For independent testing away from the computer's Metro Bundler, run `npx expo run:ios --device --configuration Release` to bundle the JavaScript inside the app.

## Testing

The project includes a robust Jest testing suite ensuring that:
- Bluetooth message Hex encoding/decoding works reliably.
- The Host UI safely mounts and triggers broadcasts.
- The Guest UI correctly connects and parses time-sync signals.

To run the tests:
```bash
npm test
```

## Technologies Used
- [React Native](https://reactnative.dev/)
- [Expo](https://expo.dev/)
- [expo-audio](https://docs.expo.dev/versions/latest/sdk/audio/) (For audio playback)
- [munim-bluetooth](https://github.com/munim/munim-bluetooth) (For BLE Central/Peripheral communication)


npx expo run:ios --device --configuration Release
