import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Button, FlatList, ActivityIndicator, TextInput } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { usePcmPlayer as useAudioPlayer } from '../../modules/synchme-pcm-player';
import { ScreenType } from '../../App';
import { startGuestScanning, stopGuestScanning, connectToHost, disconnectFromHost, requestSongFromHost, pingHost, sendReadyToHost, requestSyncFromHost, BluetoothDevice, SyncMessage } from '../services/BleService';

interface Props {
  onNavigate: (screen: ScreenType) => void;
}

export default function GuestScreen({ onNavigate }: Props) {
  const [audioFile, setAudioFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [discoveredHosts, setDiscoveredHosts] = useState<BluetoothDevice[]>([]);
  const [connectedHostId, setConnectedHostId] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState<number | null>(null);
  const clockOffsetRef = useRef(clockOffset);
  const [nudgeSuggestion, setNudgeSuggestion] = useState<'forward' | 'backward' | 'synced' | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const periodicPingCountRef = useRef(0);

  const startPeriodicPing = (deviceId: string) => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    periodicPingCountRef.current = 0;
    
    // Start with 2 seconds period
    syncIntervalRef.current = setInterval(() => {
      pingHost(deviceId).catch(()=>{});
      periodicPingCountRef.current += 1;
      
      // After 2 times, switch to 30 seconds
      if (periodicPingCountRef.current >= 2) {
        clearInterval(syncIntervalRef.current!);
        addLog("Switching to 30s ping interval.");
        syncIntervalRef.current = setInterval(() => {
          pingHost(deviceId).catch(()=>{});
        }, 30000);
      }
    }, 2000);
  };

  const addLog = (log: string) => {
    setDebugLogs(prev => [log, ...prev].slice(0, 10)); // keep last 10 logs
  };
  
  const player = useAudioPlayer(audioFile ? { uri: audioFile.uri } : null);
  const playerRef = useRef(player);
  const audioFileRef = useRef(audioFile);
  const lastSyncRef = useRef<{ hostTime: number; localTimeAtSync: number; isPlaying: boolean } | null>(null);
  // Accumulated manual nudge offset (survives SYNC messages from host)
  const nudgeOffsetRef = useRef<number>(0);

  useEffect(() => {
    playerRef.current = player;
    audioFileRef.current = audioFile;
    clockOffsetRef.current = clockOffset;
  }, [player, audioFile, clockOffset]);

  useEffect(() => {
    return () => {
      stopGuestScanning();
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      if (connectedHostIdRef.current) {
        disconnectFromHost(connectedHostIdRef.current);
      }
    };
  }, []);

  const connectedHostIdRef = useRef<string | null>(null);
  useEffect(() => {
    connectedHostIdRef.current = connectedHostId;
  }, [connectedHostId]);

  useEffect(() => {
    if (audioFile && connectedHostId) {
      sendReadyToHost(connectedHostId);
    }
  }, [audioFile, connectedHostId]);



  // Removed manual pickDocument

  const isConnectingRef = useRef(false);

  const handleScan = async () => {
    if (connectedHostIdRef.current || isConnectingRef.current) return; // Already connected/connecting
    setIsScanning(true);
    setDiscoveredHosts([]);
    await startGuestScanning((device) => {
      setDiscoveredHosts((prev) => {
        if (prev.find(d => d.id === device.id)) return prev;
        return [...prev, device];
      });
    });
  };

  // Auto-scan when screen mounts
  useEffect(() => {
    const timer = setTimeout(() => handleScan(), 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const downloadSong = async (url: string, filename: string) => {
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      const fileUri = FileSystem.cacheDirectory + filename;
      
      
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      let size = 0;
      
      if (fileInfo.exists) {
        
        size = fileInfo.size || 0;
      } else {
        
        
        const downloadResumable = FileSystem.createDownloadResumable(
          url,
          fileUri,
          {},
          (downloadProgress) => {
            const progress = (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100;
            setDownloadProgress(progress);
            
          }
        );

        const result = await downloadResumable.downloadAsync();
        if (!result) throw new Error('Download failed completely');
        
      
      size = result.status === 200 ? parseInt(result.headers['Content-Length'] || '0', 10) || 0 : 0;
      }
      
      setAudioFile({
        uri: fileUri,
        name: filename,
        mimeType: 'audio/mpeg',
        size: size
      } as DocumentPicker.DocumentPickerAsset);
      
      
    } catch (e: any) {
      
      alert(`Failed to download song automatically: ${e.message}. Please select it manually.`);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleConnect = async (deviceId: string) => {
    try {
      let pingResults: { rtt: number; offset: number }[] = [];

      await connectToHost(
        deviceId, 
        async (msg: SyncMessage) => {
          const currentPlayer = playerRef.current;
          const currentFile = audioFileRef.current;
          const currentOffset = clockOffsetRef.current;
          
          if (msg.action === 'PONG') {
            const guestSendTime = msg.time;
            const [hostDateNowStr, hostAudioTimeStr] = (msg.name || '0|0').split('|');
            const hostDateNow = parseFloat(hostDateNowStr);
            const hostAudioTime = parseFloat(hostAudioTimeStr || '0');
            
            const rtt = Date.now() - guestSendTime;
            const offset = hostDateNow - (Date.now() - (rtt / 2));
            
            pingResults.push({ rtt, offset });
            
            // Eagerly set offset on the first ping so it's never null!
            if (pingResults.length === 1) {
                setClockOffset(offset);
            }
            
            if (pingResults.length < 3) {
              setTimeout(async () => {
                 let err = await pingHost(deviceId);
                 if (err) {
                    addLog(`PING ${pingResults.length + 1} FAILED: ${err}. Retrying in 500ms...`);
                    setTimeout(async () => {
                        const retryErr = await pingHost(deviceId);
                        if (retryErr) addLog(`PING ${pingResults.length + 1} RETRY FAILED: ${retryErr}`);
                    }, 500);
                 }
              }, 300);
              return;
            } else if (pingResults.length === 3) {
              pingResults.sort((a, b) => a.rtt - b.rtt);
              const bestPings = pingResults.slice(0, 2);
              const avgOffset = bestPings.reduce((sum, p) => sum + p.offset, 0) / bestPings.length;
              setClockOffset(avgOffset);
              addLog(`PING BURST DONE! Offset: ${avgOffset.toFixed(1)}ms`);
              startPeriodicPing(deviceId);
              return;
            }

            // Periodic PONG handling (length > 3)
            // Gently adjust clock offset
            setClockOffset(prev => prev !== null ? (prev * 0.9 + offset * 0.1) : offset);

            if (lastSyncRef.current && lastSyncRef.current.isPlaying) {
              const transitTime = rtt / 2;
              const trueHostTime = hostAudioTime + (transitTime / 1000);
              const targetGuestPos = trueHostTime + nudgeOffsetRef.current;
              const diffMs = (targetGuestPos - currentPlayer.currentTime) * 1000;
              const timeSinceNudge = Date.now() - lastNudgeTimeRef.current;
              
              const isDrifting = Math.abs(diffMs) > 2; // Auto correct if drift > 2ms
              const canSteer = timeSinceNudge > 2000 && !isSeekingRef.current;

              if (isDrifting && canSteer) {
                isSeekingRef.current = true;
                const EXTRA_FORWARD_BUFFER_SECS = 0.05;
                const compensationSecs = (lastSeekComputeDelayRef.current / 1000) + EXTRA_FORWARD_BUFFER_SECS;
                const compensatedTarget = Math.max(0, targetGuestPos + compensationSecs);
                
                const steerStart = Date.now();
                currentPlayer.seekTo(compensatedTarget).finally(() => { 
                    isSeekingRef.current = false;
                    const steerTimeMs = Date.now() - steerStart;
                    addLog(`[AUTO-SYNC] DRIFT: ${diffMs.toFixed(1)}ms! ⚠️ Corrected. (RTT: ${rtt}ms)`);
                });
                setNudgeSuggestion('synced');
              } else {
                addLog(`[SYNC-CHECK] Drift: ${diffMs.toFixed(1)}ms ✅ (RTT: ${rtt}ms)`);
                if (timeSinceNudge < 1500) {
                  setNudgeSuggestion('synced');
                } else {
                  if (diffMs > 1) {
                    setNudgeSuggestion('forward');
                  } else if (diffMs < -1) {
                    setNudgeSuggestion('backward');
                  } else {
                    setNudgeSuggestion('synced');
                  }
                }
              }
            }
            return;
          }
          if (msg.action === 'SONG' && msg.name) {
            
            
            if (msg.name.startsWith('FIREBASE|')) {
              // Firebase payload format: FIREBASE|URL|FILENAME
              const parts = msg.name.split('|');
              const url = parts[1];
              const actualFilename = parts[2];
              
              if (!currentFile || currentFile.name !== actualFilename) {
                
                await downloadSong(url, actualFilename);
              } else {
                
              }
            } else {
              // Legacy fallback logic
              const [ip, filename] = msg.name.split('|');
              const actualFilename = filename || msg.name;
              
              if (!currentFile || currentFile.name !== actualFilename) {
                alert(`Host changed the song to: ${actualFilename}. Please select the exact same file!`);
              }
            }
            return;
          }

          try {
            if (msg.action === 'PLAY' && currentPlayer) {
              const executeAtHost = parseFloat(msg.name || '0');
              if (executeAtHost > 0 && currentOffset !== null) {
                const executeAtGuest = executeAtHost - currentOffset;
                lastSyncRef.current = { hostTime: msg.time, localTimeAtSync: executeAtGuest, isPlaying: true };
                const waitTime = executeAtGuest - Date.now();
                
                const schedulePlay = () => {
                   const now = Date.now();
                   const elapsedSinceStart = (now - executeAtGuest) / 1000;
                   const targetTime = msg.time + Math.max(0, elapsedSinceStart);
                   
                   currentPlayer.seekTo(targetTime).then(() => {
                       currentPlayer.play();
                       addLog(`Started PLAY. Target: ${targetTime.toFixed(3)}s (Wait: ${waitTime.toFixed(0)}ms, Elapsed: ${(elapsedSinceStart*1000).toFixed(0)}ms)`);
                   });
                };

                if (waitTime > 10) {
                  setTimeout(schedulePlay, waitTime);
                } else {
                  schedulePlay();
                }
              } else {
                lastSyncRef.current = { hostTime: msg.time, localTimeAtSync: Date.now(), isPlaying: true };
                currentPlayer.play();
                addLog(`Started PLAY immediately. No ping offset available!`);
              }
            } else if (msg.action === 'PAUSE' && currentPlayer) {
              if (msg.time !== undefined) {
                await currentPlayer.seekTo(msg.time);
              }
              lastSyncRef.current = { hostTime: msg.time, localTimeAtSync: Date.now(), isPlaying: false };
              currentPlayer.pause();
            } else if (msg.action === 'RESET' && currentPlayer) {
              lastSyncRef.current = { hostTime: 0, localTimeAtSync: Date.now(), isPlaying: false };
              currentPlayer.pause();
              await currentPlayer.seekTo(0);
            }
          } catch (err) {
          }
        },
        async (hostSongPayload) => {
          const currentFile = audioFileRef.current;
          if (hostSongPayload) {
            
            if (hostSongPayload.startsWith('FIREBASE|')) {
              const parts = hostSongPayload.split('|');
              const url = parts[1];
              const actualFilename = parts[2];
              
              if (!currentFile || currentFile.name !== actualFilename) {
                await downloadSong(url, actualFilename);
              }
            } else {
               const [ip, filename] = hostSongPayload.split('|');
               const actualFilename = filename || hostSongPayload;
               if (!currentFile || currentFile.name !== actualFilename) {
                  alert(`The Host is playing: ${actualFilename}. Please select the exact same file to sync properly!`);
               }
             }
          }
          addLog("Connected! Sending initial PING...");
          
          // Retry logic for initial ping in case services are still resolving
          let attempts = 0;
          while (attempts < 3) {
            const err = await pingHost(deviceId);
            if (!err) {
              addLog("Initial PING sent successfully.");
              break;
            }
            attempts++;
            addLog(`Initial PING failed (attempt ${attempts}): ${err}`);
            if (attempts < 3) await new Promise(r => setTimeout(r, 500));
          }
          
          if (!hostSongPayload) {
             // If we connected late and the Host was broadcasting SYNC instead of SONG,
             // we need to explicitly ask the Host to broadcast the SONG again.
             
             await requestSongFromHost(deviceId);
          }
        }
      );
      setConnectedHostId(deviceId);
      setIsScanning(false);
      isConnectingRef.current = false;
    } catch (err: any) {
      isConnectingRef.current = false;
      alert(`Failed to connect: ${err.message || err}`);
    }
  };

  const lastSeekComputeDelayRef = useRef<number>(0); // 0ms delay for PCM player
  const lastNudgeTimeRef = useRef<number>(0);
  const isSeekingRef = useRef<boolean>(false);

  const handleNudge = async (offsetMs: number) => {
    if (!player || !lastSyncRef.current || isSeekingRef.current) return;

    isSeekingRef.current = true;
    lastNudgeTimeRef.current = Date.now();

    const offsetSecs = offsetMs / 1000;
    const pressTime = Date.now(); // Wall clock at button press

    // Accumulate the intended manual offset
    nudgeOffsetRef.current += offsetSecs;

    // Compute TRUE host position at press time
    const elapsedSinceSync = (pressTime - lastSyncRef.current.localTimeAtSync) / 1000;
    const trueHostPos = lastSyncRef.current.hostTime + elapsedSinceSync;
    
    // Target position for Guest includes accumulated nudgeOffset and CPU/hardware compensation
    const EXTRA_FORWARD_BUFFER_SECS = 0.05;
    const compensationSecs = (lastSeekComputeDelayRef.current / 1000) + EXTRA_FORWARD_BUFFER_SECS;
    const targetPos = Math.max(0, trueHostPos + nudgeOffsetRef.current + compensationSecs);

    const posBefore = player.currentTime;

    try {
      const seekStart = performance.now();
      await player.seekTo(targetPos, 0, 0); // sub-ms precision
      const actualFreeze = performance.now() - seekStart;

      // Update moving average for this device's seekTo cost
      lastSeekComputeDelayRef.current = lastSeekComputeDelayRef.current * 0.7 + actualFreeze * 0.3;

      // Update lastSyncRef with TRUE host position at resume time
      const resumeTime = Date.now();
      const resumeElapsed = (resumeTime - pressTime) / 1000;
      lastSyncRef.current.hostTime = trueHostPos + resumeElapsed;
      lastSyncRef.current.localTimeAtSync = resumeTime;

      const posAfter = player.currentTime;
      const realizedShiftMs = (posAfter - posBefore) * 1000;

    } catch(e) {
    } finally {
      isSeekingRef.current = false;
    }
  };



  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => onNavigate('HOME')}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Join as Guest</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>1. Connect to Host</Text>
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
          <Text style={styles.statusText}>Connected to Host</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>2. Sync Status</Text>
        {!connectedHostId ? (
          <Text style={styles.waitingText}>Please connect to a host first.</Text>
        ) : isDownloading ? (
          <View style={styles.downloadContainer}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.downloadText}>
              {downloadProgress > 0 
                ? `Downloading song from Host... ${downloadProgress.toFixed(0)}%` 
                : 'Preparing download...'}
            </Text>
          </View>
        ) : !audioFile ? (
          <Text style={styles.waitingText}>Waiting for Host to pick a song...</Text>
        ) : (
          <View>
            <Text style={styles.readyText}>✅ Ready to Play!</Text>
            <Text style={styles.fileName}>Loaded: {audioFile.name}</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>3. Beatmatch Controls</Text>
        <Text style={styles.nudgeHint}>
          {nudgeSuggestion === 'forward' ? '⚠️ Guest is behind — press >>>' :
           nudgeSuggestion === 'backward' ? '⚠️ Guest is ahead — press <<<' :
           nudgeSuggestion === 'synced' ? '✅ In sync!' :
           'Waiting for sync data...'}
        </Text>
        
        <View style={styles.nudgeRow}>
          <TouchableOpacity
            style={[styles.nudgeButton, { flex: 1, marginRight: 10, alignItems: 'center' },
              nudgeSuggestion === 'backward' ? { backgroundColor: '#dc3545', borderColor: '#ff6b6b', borderWidth: 2 } :
              nudgeSuggestion === 'synced' ? { backgroundColor: '#007AFF' } : {}
            ]}
            onPress={() => handleNudge(-1)} disabled={!audioFile}>
            <Text style={styles.nudgeButtonText}>&lt;&lt;&lt;</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nudgeButton, { flex: 1, marginLeft: 10, alignItems: 'center' },
              nudgeSuggestion === 'forward' ? { backgroundColor: '#28a745', borderColor: '#5cb85c', borderWidth: 2 } :
              nudgeSuggestion === 'synced' ? { backgroundColor: '#007AFF' } : {}
            ]}
            onPress={() => handleNudge(1)} disabled={!audioFile}>
            <Text style={styles.nudgeButtonText}>&gt;&gt;&gt;</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.card}>
        <Text style={styles.label}>Debug Logs (Long press to copy)</Text>
        <TextInput 
          style={styles.logBoxInput}
          multiline={true}
          editable={false}
          value={debugLogs.length === 0 ? "No logs yet..." : debugLogs.join('\n')}
        />
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
  downloadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
  },
  downloadText: {
    marginLeft: 10,
    color: '#007AFF',
    fontWeight: '500',
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
  waitingText: {
    color: '#FF9500',
    fontWeight: '500',
    marginTop: 5,
    fontStyle: 'italic',
  },
  readyText: {
    color: '#34C759',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 5,
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
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  syncButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  syncButtonText: {
    fontWeight: '600',
    color: '#FFF',
    fontSize: 16,
  },
  logBoxInput: {
    backgroundColor: '#1E1E1E',
    padding: 10,
    borderRadius: 8,
    minHeight: 120,
    color: '#00FF00',
    fontSize: 11,
    fontFamily: 'Courier',
  }
});
