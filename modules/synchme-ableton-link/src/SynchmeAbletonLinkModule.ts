import { NativeModule, requireNativeModule } from 'expo';

declare class SynchmeAbletonLinkModule extends NativeModule {
  openSettings(): void;
  getTempo(): number;
  setTempo(bpm: number): void;
  getBeatTime(): number;
  isConnected(): boolean;
  isEnabled(): boolean;
}

export default requireNativeModule<SynchmeAbletonLinkModule>('SynchmeAbletonLink');
