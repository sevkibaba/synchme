import { useState, useEffect } from "react";
import SynchmePcmPlayerModule from "./src/SynchmePcmPlayerModule";

export const SynchmePcmPlayer = SynchmePcmPlayerModule;

export function usePcmPlayer(source: { uri: string } | null) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoadedUri(null);
    setLoadError(null);
    if (source?.uri) {
      setIsLoaded(false);
      setPlaying(false);
      SynchmePcmPlayerModule.load(source.uri)
        .then(() => {
          if (mounted) {
            setIsLoaded(true);
            setLoadedUri(source.uri);
          }
        })
        .catch((err) => {
          if (mounted) setLoadError(String(err));
          console.error("PCM Player load error:", err);
        });
    }
    return () => {
      mounted = false;
      SynchmePcmPlayerModule.pause();
    };
  }, [source?.uri]);

  return {
    isLoaded: isLoaded && loadedUri === source?.uri,
    loadedUri,
    loadError,
    get currentTime() {
      return SynchmePcmPlayerModule.getCurrentTime();
    },
    get playing() {
      return SynchmePcmPlayerModule.isPlaying();
    },
    play: () => {
      SynchmePcmPlayerModule.play();
      setPlaying(true);
    },
    pause: () => {
      SynchmePcmPlayerModule.pause();
      setPlaying(false);
    },
    seekTo: async (time: number) => {
      // Made async to be compatible with expo-audio if any code awaits it, although native is sync
      SynchmePcmPlayerModule.seekTo(time);
      return Promise.resolve();
    },
  };
}
