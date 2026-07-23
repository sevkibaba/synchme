import { NativeModule, requireNativeModule } from 'expo';

declare class SynchmePcmPlayerModule extends NativeModule {
  load(uriStr: string): Promise<{ success: boolean; duration: number }>;
  play(): void;
  pause(): void;
  seekTo(positionSecs: number): void;
  getCurrentTime(): number;
  isPlaying(): boolean;
}

export default requireNativeModule<SynchmePcmPlayerModule>('SynchmePcmPlayer');
