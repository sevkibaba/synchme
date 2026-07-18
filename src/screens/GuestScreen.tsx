import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Button, FlatList } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioPlayer } from 'expo-audio';
import { ScreenType } from '../../App';
import { startGuestScanning, stopGuestScanning, connectToHost, BluetoothDevice, SyncMessage } from '../services/BleService';

interface Props {
  onNavigate: (screen: ScreenType) => void;
}

export default function GuestScreen({ onNavigate }: Props) {
  const [audioFile, setAudioFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredHosts, setDiscoveredHosts] = useState<BluetoothDevice[]>([]);
  const [connectedHostId, setConnectedHostId] = useState<string | null>(null);
  
  const player = useAudioPlayer(audioFile ? { uri: audioFile.uri } : null);

  useEffect(() => {
    return () => {
      stopGuestScanning();
    };
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

  const handleScan = async () => {
    setIsScanning(true);
    setDiscoveredHosts([]);
    await startGuestScanning((device) => {
      setDiscoveredHosts((prev) => {
        if (!prev.find(d => d.id === device.id)) {
          return [...prev, device];
        }
        return prev;
      });
    });
  };

  const handleConnect = async (deviceId: string) => {
    try {
      await connectToHost(deviceId, (msg: SyncMessage) => {
        if (msg.action === 'PLAY') {
          player.play();
        } else if (msg.action === 'PAUSE') {
          player.pause();
        }
      });
      setConnectedHostId(deviceId);
      setIsScanning(false);
    } catch (err) {
      alert('Failed to connect to Host');
    }
  };

  const handleNudge = async (offsetMs: number) => {
    if (!player) return;
    const offsetSecs = offsetMs / 1000;
    const newPos = Math.max(0, player.currentTime + offsetSecs);
    await player.seekTo(newPos);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => onNavigate('HOME')}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Join as Guest</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>1. Select MP3 Manually</Text>
        <Button title="Choose MP3" onPress={pickDocument} />

        {audioFile && (
          <Text style={styles.fileName}>Ready: {audioFile.name}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>2. Connect to Host</Text>
        {!connectedHostId ? (
          <>
            <Button title={isScanning ? "Scanning..." : "Scan for Hosts"} onPress={handleScan} disabled={isScanning} />
            <FlatList
              data={discoveredHosts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.hostItem} onPress={() => handleConnect(item.id)}>
                  <Text style={styles.hostName}>{item.name}</Text>
                  <Text style={styles.hostId}>{item.id}</Text>
                </TouchableOpacity>
              )}
              style={styles.hostList}
            />
          </>
        ) : (
          <Text style={styles.statusText}>Connected! Waiting for playback...</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>3. Manual Nudge</Text>
        <Text style={styles.nudgeHint}>Use these if audio is slightly off</Text>
        
        <View style={styles.nudgeRow}>
          <TouchableOpacity style={styles.nudgeButton} onPress={() => handleNudge(-50)} disabled={!audioFile}>
            <Text style={styles.nudgeButtonText}>-50ms</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nudgeButton} onPress={() => handleNudge(-10)} disabled={!audioFile}>
            <Text style={styles.nudgeButtonText}>-10ms</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nudgeButton} onPress={() => handleNudge(10)} disabled={!audioFile}>
            <Text style={styles.nudgeButtonText}>+10ms</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nudgeButton} onPress={() => handleNudge(50)} disabled={!audioFile}>
            <Text style={styles.nudgeButtonText}>+50ms</Text>
          </TouchableOpacity>
        </View>
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
  hostList: {
    marginTop: 15,
    maxHeight: 150,
  },
  hostItem: {
    padding: 12,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    marginBottom: 8,
  },
  hostName: {
    fontWeight: '600',
    fontSize: 16,
  },
  hostId: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusText: {
    color: '#34C759',
    fontWeight: '600',
    marginTop: 10,
  },
  nudgeHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 15,
  },
  nudgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nudgeButton: {
    backgroundColor: '#E5E5EA',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  nudgeButtonText: {
    fontWeight: '600',
    color: '#333',
  },
});
