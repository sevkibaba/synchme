import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Button, Alert, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { usePcmPlayer as useAudioPlayer } from '../../modules/synchme-pcm-player';
import { ScreenType } from '../../App';
import { startHostBroadcasting, broadcastMessage } from '../services/BleService';
import { uploadSongToFirebase } from '../services/FirebaseService';

interface Props {
  onNavigate: (screen: ScreenType) => void;
}

export default function HostScreen({ onNavigate }: Props) {
  const [audioFile, setAudioFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isGuestReady, setIsGuestReady] = useState<boolean>(false);
  const [songPayload, setSongPayload] = useState<string | null>(null);
  
  const player = useAudioPlayer(audioFile ? { uri: audioFile.uri } : null);

  const songPayloadRef = React.useRef(songPayload);
  useEffect(() => {
    songPayloadRef.current = songPayload;
  }, [songPayload]);

  const playerRef = React.useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    let unmountCleanup: (() => void) | undefined | void;
    
    startHostBroadcasting((msg) => {
      if (msg.action === 'READY') {
        setIsGuestReady(true);
      }
      if (msg.action === 'REQUEST_SONG') {
        if (songPayloadRef.current) {
          broadcastMessage({ action: 'SONG', time: 0, name: songPayloadRef.current });
        }
      }
      if (msg.action === 'REQUEST_SYNC') {
        broadcastMessage({ action: 'SYNC', time: playerRef.current.currentTime, name: Date.now().toString() });
      }
    }, () => playerRef.current.currentTime).then((cleanup) => {
      unmountCleanup = cleanup;
    });

    return () => {
      if (unmountCleanup) unmountCleanup();
    };
  }, []);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setAudioFile(file);
        setIsGuestReady(false); // Reset ready state when a new song is picked
        
        // Start uploading to Firebase immediately
        startSharing(file);
      }
    } catch (err) {
      
    }
  };

  const startSharing = async (file: DocumentPicker.DocumentPickerAsset) => {
    setIsUploading(true);
    try {
      const { url } = await uploadSongToFirebase(file.uri, file.name);
      const payload = `FIREBASE|${url}|${file.name}`;
      setSongPayload(payload);
      await broadcastMessage({ action: 'SONG', time: 0, name: payload });
    } catch (e: any) {
    } finally {
      setIsUploading(false);
    }
  };

  const handlePlayPause = async () => {
    if (player.playing) {
      player.pause();
      await broadcastMessage({ action: 'PAUSE', time: player.currentTime });
    } else {
      const executeAt = Date.now() + 150; // 150ms buffer for BLE transmission to start at the exact same time
      await broadcastMessage({ action: 'PLAY', time: player.currentTime, name: executeAt.toString() });
      setTimeout(() => {
        player.play();
      }, 150);
    }
  };

  const handleReset = async () => {
    player.pause();
    player.seekTo(0);
    await broadcastMessage({ action: 'RESET', time: 0 });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => onNavigate('HOME')}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Host Session</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>1. Select MP3 to Share</Text>
        <Button title={audioFile ? "Change MP3" : "Choose MP3"} onPress={pickDocument} disabled={isUploading} />
        {isUploading && (
          <View style={styles.uploadContainer}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.uploadText}>Uploading to Cloud...</Text>
          </View>
        )}
        {audioFile && !isUploading && (
          <Text style={styles.fileName}>Selected: {audioFile.name}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>2. Playback Controls</Text>
        {!isGuestReady && audioFile && !isUploading && (
          <Text style={styles.waitingText}>Waiting for Guest to load the song...</Text>
        )}
        <View style={styles.controlsRow}>
          <TouchableOpacity 
            style={[styles.playButton, (!audioFile || !isGuestReady) && styles.disabledButton]} 
            onPress={handlePlayPause}
            disabled={!audioFile || !isGuestReady}
          >
            <Text style={styles.playButtonText}>{player.playing ? 'Pause' : 'Play'}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.resetButton, !audioFile && styles.disabledButton]} 
            onPress={handleReset}
            disabled={!audioFile}
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>3. Ableton Link</Text>
        <Text style={styles.description}>Connect and sync with Ableton Live, Traktor, Maschine and more over Local Network.</Text>
        <Button title="Open Link Settings" onPress={() => {
           const { AbletonLink } = require('../../modules/synchme-ableton-link');
           AbletonLink.openSettings();
        }} color="#222" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  backButton: {
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  uploadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    gap: 8,
  },
  uploadText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  fileName: {
    marginTop: 10,
    fontSize: 15,
    color: '#000',
    fontWeight: 'bold',
  },
  waitingText: {
    marginBottom: 15,
    fontSize: 14,
    color: '#FF9500',
    fontWeight: '600',
    fontStyle: 'italic',
  },
  playButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 10,
  },
  resetButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  playButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
