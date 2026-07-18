import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Button } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioPlayer } from 'expo-audio';
import { ScreenType } from '../../App';
import { startHostBroadcasting, broadcastMessage } from '../services/BleService';

interface Props {
  onNavigate: (screen: ScreenType) => void;
}

export default function HostScreen({ onNavigate }: Props) {
  const [audioFile, setAudioFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  
  const player = useAudioPlayer(audioFile ? { uri: audioFile.uri } : null);

  useEffect(() => {
    startHostBroadcasting();
  }, []);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAudioFile(result.assets[0]);
      }
    } catch (err) {
      console.log('Error picking document', err);
    }
  };

  const handlePlayPause = async () => {
    if (player.playing) {
      player.pause();
      await broadcastMessage({ action: 'PAUSE' });
    } else {
      player.play();
      await broadcastMessage({ action: 'PLAY' });
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => onNavigate('HOME')}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Host Session</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>1. Select MP3 File</Text>
        <Button title="Choose MP3" onPress={pickDocument} />
        {audioFile && (
          <Text style={styles.fileName}>{audioFile.name}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>2. Playback Controls</Text>
        <TouchableOpacity 
          style={[styles.playButton, !audioFile && styles.disabledButton]} 
          onPress={handlePlayPause}
          disabled={!audioFile}
        >
          <Text style={styles.playButtonText}>{player.playing ? 'Pause' : 'Play'}</Text>
        </TouchableOpacity>
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
  fileName: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  playButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 8,
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
