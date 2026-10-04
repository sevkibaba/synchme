import { readPlaybackSnapshot, songKey } from "../services/PlaybackSync";
import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Button,
  FlatList,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { usePcmPlayer as useAudioPlayer } from "../../modules/synchme-pcm-player";
import { ScreenType } from "../../App";
import {
  startGuestScanning,
  stopGuestScanning,
  connectToHost,
  disconnectFromHost,
  requestSongFromHost,
  pingHost,
  sendReadyToHost,
  requestSyncFromHost,
  consumePong,
  BluetoothDevice,
  SyncMessage,
} from "../services/BleService";

interface Props {
  onNavigate: (screen: ScreenType) => void;
}

export default function GuestScreen({ onNavigate }: Props) {
  const alive = useRef(true);
  const sourceRef = useRef<string | null>(null);
  const downloadingRef = useRef<string | null>(null);
  const downloadGeneration = useRef(0);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackGeneration = useRef(0);
  const pendingSnapshot = useRef<{ id: string; sentAt: number } | null>(null);
  const snapshotRetry = useRef<ReturnType<typeof setInterval> | null>(null);
  const [joinStatus, setJoinStatus] = useState("");
  const cancelPlay = () => {
    playbackGeneration.current++;
    if (playTimer.current) clearTimeout(playTimer.current);
    playTimer.current = null;
  };
  const stopSnapshotRequests = () => {
    pendingSnapshot.current = null;
    if (snapshotRetry.current) clearInterval(snapshotRetry.current);
    snapshotRetry.current = null;
  };
  const requestCurrentPlayback = () => {
    const host = connectedHostIdRef.current;
    if (!host || !sourceRef.current || !playerRef.current.isLoaded) return;
    stopSnapshotRequests();
    setJoinStatus("Joining the current track…");
    let attempts = 0;
    const request = () => {
      if (!alive.current) return;
      if (attempts++ >= 5) {
        stopSnapshotRequests();
        setJoinStatus("Could not sync with the DJ. Tap to retry.");
        return;
      }
      const id =
        Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      pendingSnapshot.current = { id, sentAt: Date.now() };
      requestSyncFromHost(host, id).catch(() => {
        /* Retried with a new correlation ID. */
      });
    };
    snapshotRetry.current = setInterval(request, 2000);
    request();
  };
  const [audioFile, setAudioFile] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [discoveredHosts, setDiscoveredHosts] = useState<BluetoothDevice[]>([]);
  const [connectedHostId, setConnectedHostId] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState<number | null>(null);
  const clockOffsetRef = useRef(clockOffset);
  const [nudgeSuggestion, setNudgeSuggestion] = useState<
    "forward" | "backward" | "synced" | null
  >(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const periodicPingCountRef = useRef(0);

  const startPeriodicPing = (deviceId: string) => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    periodicPingCountRef.current = 0;

    // Start with 2 seconds period
    syncIntervalRef.current = setInterval(() => {
      pingHost(deviceId).catch(() => {});
      periodicPingCountRef.current += 1;

      // After 2 times, switch to 30 seconds
      if (periodicPingCountRef.current >= 2) {
        clearInterval(syncIntervalRef.current!);
        addLog("Switching to 30s ping interval.");
        syncIntervalRef.current = setInterval(() => {
          pingHost(deviceId).catch(() => {});
        }, 30000);
      }
    }, 2000);
  };

  const addLog = (log: string) => {
    setDebugLogs((prev) => [log, ...prev].slice(0, 10)); // keep last 10 logs
  };

  const player = useAudioPlayer(audioFile ? { uri: audioFile.uri } : null);
  const playerRef = useRef(player);
  const audioFileRef = useRef(audioFile);
  const lastSyncRef = useRef<{
    hostTime: number;
    localTimeAtSync: number;
    isPlaying: boolean;
  } | null>(null);
  // Accumulated manual nudge offset (survives SYNC messages from host)
  const nudgeOffsetRef = useRef<number>(0);

  useEffect(() => {
    playerRef.current = player;
    audioFileRef.current = audioFile;
    clockOffsetRef.current = clockOffset;
  }, [player, audioFile, clockOffset]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      downloadGeneration.current++;
      cancelPlay();
      stopSnapshotRequests();
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
    if (
      audioFile &&
      connectedHostId &&
      player.isLoaded &&
      player.loadedUri === audioFile.uri
    ) {
      sendReadyToHost(connectedHostId);
      requestCurrentPlayback();
    }
    return stopSnapshotRequests;
  }, [audioFile?.uri, connectedHostId, player.isLoaded, player.loadedUri]);

  useEffect(() => {
    if (player.loadError)
      setJoinStatus("Could not load this track. Reconnect to try again.");
  }, [player.loadError]);

  // Removed manual pickDocument

  const isConnectingRef = useRef(false);

  const handleScan = async () => {
    if (connectedHostIdRef.current || isConnectingRef.current) return; // Already connected/connecting
    setIsScanning(true);
    setDiscoveredHosts([]);
    setScanError(null);
    try {
      await startGuestScanning((device) => {
        setDiscoveredHosts((prev) => {
          if (prev.find((d) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      });
    } catch {
      setIsScanning(false);
      setScanError(
        "Bluetooth is unavailable. Turn it on and try again. Nearby discovery requires a physical phone.",
      );
    }
  };

  // Auto-scan when screen mounts
  useEffect(() => {
    const timer = setTimeout(() => handleScan(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const downloadSong = async (url: string, filename: string) => {
    const source = `FIREBASE|${url}|${filename}`;
    // A SONG reply for a new listener is broadcast: existing listeners must not reload.
    if (
      sourceRef.current === source &&
      (downloadingRef.current === source || audioFileRef.current)
    )
      return;
    const generation = ++downloadGeneration.current;
    sourceRef.current = source;
    downloadingRef.current = source;
    cancelPlay();
    stopSnapshotRequests();
    playerRef.current.pause();
    lastSyncRef.current = null;
    audioFileRef.current = null;
    setAudioFile(null);
    setJoinStatus("Downloading the current track…");
    setIsDownloading(true);
    setDownloadProgress(0);
    const current = () =>
      alive.current && generation === downloadGeneration.current;
    const extension = filename.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] || ".mp3";
    const fileUri = `${FileSystem.cacheDirectory}party-${songKey(source)}${extension}`;
    const partial = `${fileUri}.${generation}.part`;
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!current()) return;
      if (!info.exists || !info.size) {
        const task = FileSystem.createDownloadResumable(
          url,
          partial,
          {},
          (progress) => {
            if (current())
              setDownloadProgress(
                progress.totalBytesExpectedToWrite > 0
                  ? (100 * progress.totalBytesWritten) /
                      progress.totalBytesExpectedToWrite
                  : 0,
              );
          },
        );
        const result = await task.downloadAsync();
        if (!current()) return;
        if (!result || result.status !== 200)
          throw new Error("Download failed");
        const downloaded = await FileSystem.getInfoAsync(partial);
        if (!downloaded.exists || !downloaded.size)
          throw new Error("Empty download");
        await FileSystem.moveAsync({ from: partial, to: fileUri });
      }
      if (!current()) return;
      const file = {
        uri: fileUri,
        name: filename,
        mimeType: "audio/mpeg",
        lastModified: Date.now(),
      };
      audioFileRef.current = file;
      setAudioFile(file);
      setJoinStatus("Preparing your player…");
    } catch {
      if (current()) setJoinStatus("Download failed. Tap to retry.");
    } finally {
      FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
      if (current()) {
        downloadingRef.current = null;
        setIsDownloading(false);
        setDownloadProgress(0);
      }
    }
  };

  const handleConnect = async (deviceId: string) => {
    if (isConnectingRef.current || connectedHostIdRef.current) return;
    isConnectingRef.current = true;
    try {
      let pingResults: { rtt: number; offset: number }[] = [];

      await connectToHost(
        deviceId,
        async (msg: SyncMessage) => {
          if (!alive.current) return;
          const currentPlayer = playerRef.current;
          const currentFile = audioFileRef.current;
          const currentOffset = clockOffsetRef.current;

          if (msg.action === "PONG") {
            if (!consumePong(msg.time)) return;
            const guestSendTime = msg.time;
            const [hostDateNowStr, hostAudioTimeStr] = (
              msg.name || "0|0"
            ).split("|");
            const hostDateNow = parseFloat(hostDateNowStr);
            const hostAudioTime = parseFloat(hostAudioTimeStr || "0");

            const rtt = Date.now() - guestSendTime;
            const offset = hostDateNow - (Date.now() - rtt / 2);

            pingResults.push({ rtt, offset });

            // Eagerly set offset on the first ping so it's never null!
            if (pingResults.length === 1) {
              setClockOffset(offset);
            }

            if (pingResults.length < 3) {
              setTimeout(async () => {
                let err = await pingHost(deviceId);
                if (err) {
                  addLog(
                    `PING ${pingResults.length + 1} FAILED: ${err}. Retrying in 500ms...`,
                  );
                  setTimeout(async () => {
                    const retryErr = await pingHost(deviceId);
                    if (retryErr)
                      addLog(
                        `PING ${pingResults.length + 1} RETRY FAILED: ${retryErr}`,
                      );
                  }, 500);
                }
              }, 300);
              return;
            } else if (pingResults.length === 3) {
              pingResults.sort((a, b) => a.rtt - b.rtt);
              const bestPings = pingResults.slice(0, 2);
              const avgOffset =
                bestPings.reduce((sum, p) => sum + p.offset, 0) /
                bestPings.length;
              setClockOffset(avgOffset);
              addLog(`PING BURST DONE! Offset: ${avgOffset.toFixed(1)}ms`);
              startPeriodicPing(deviceId);
              return;
            }

            // Periodic PONG handling (length > 3)
            // Gently adjust clock offset
            setClockOffset((prev) =>
              prev !== null ? prev * 0.9 + offset * 0.1 : offset,
            );

            if (
              currentPlayer.isLoaded &&
              !pendingSnapshot.current &&
              lastSyncRef.current &&
              lastSyncRef.current.isPlaying
            ) {
              const transitTime = rtt / 2;
              const trueHostTime = hostAudioTime + transitTime / 1000;
              const targetGuestPos = trueHostTime + nudgeOffsetRef.current;
              const diffMs =
                (targetGuestPos - currentPlayer.currentTime) * 1000;
              const timeSinceNudge = Date.now() - lastNudgeTimeRef.current;

              const isDrifting = Math.abs(diffMs) > 2; // Auto correct if drift > 2ms
              const canSteer = timeSinceNudge > 2000 && !isSeekingRef.current;

              if (isDrifting && canSteer) {
                isSeekingRef.current = true;
                const EXTRA_FORWARD_BUFFER_SECS = 0.05;
                const compensationSecs =
                  lastSeekComputeDelayRef.current / 1000 +
                  EXTRA_FORWARD_BUFFER_SECS;
                const compensatedTarget = Math.max(
                  0,
                  targetGuestPos + compensationSecs,
                );

                const steerStart = Date.now();
                currentPlayer.seekTo(compensatedTarget).finally(() => {
                  isSeekingRef.current = false;
                  const steerTimeMs = Date.now() - steerStart;
                  addLog(
                    `[AUTO-SYNC] DRIFT: ${diffMs.toFixed(1)}ms! ⚠️ Corrected. (RTT: ${rtt}ms)`,
                  );
                });
                setNudgeSuggestion("synced");
              } else {
                addLog(
                  `[SYNC-CHECK] Drift: ${diffMs.toFixed(1)}ms ✅ (RTT: ${rtt}ms)`,
                );
                if (timeSinceNudge < 1500) {
                  setNudgeSuggestion("synced");
                } else {
                  if (diffMs > 1) {
                    setNudgeSuggestion("forward");
                  } else if (diffMs < -1) {
                    setNudgeSuggestion("backward");
                  } else {
                    setNudgeSuggestion("synced");
                  }
                }
              }
            }
            return;
          }
          if (msg.action === "SONG" && msg.name) {
            if (msg.name.startsWith("FIREBASE|")) {
              // Firebase payload format: FIREBASE|URL|FILENAME
              const parts = msg.name.split("|");
              const url = parts[1];
              const actualFilename = parts.slice(2).join("|");

              await downloadSong(url, actualFilename);
            } else {
              // Legacy fallback logic
              const [ip, filename] = msg.name.split("|");
              const actualFilename = filename || msg.name;

              if (!currentFile || currentFile.name !== actualFilename) {
                alert(
                  `Host changed the song to: ${actualFilename}. Please select the exact same file!`,
                );
              }
            }
            return;
          }

          if (msg.action === "SYNC") {
            const pending = pendingSnapshot.current;
            const source = sourceRef.current;
            if (!pending || !source || !currentPlayer.isLoaded) return;
            const snapshot = readPlaybackSnapshot(msg, pending.id, source);
            if (!snapshot) {
              // The DJ may have changed tracks while this phone was downloading.
              if (msg.name?.startsWith(pending.id + "|")) {
                stopSnapshotRequests();
                requestSongFromHost(deviceId);
              }
              return;
            }
            const receivedAt = Date.now();
            const elapsed =
              currentOffset === null
                ? Math.max(0, receivedAt - pending.sentAt) / 2000
                : (receivedAt + currentOffset - snapshot.sampledAt) / 1000;
            stopSnapshotRequests();
            cancelPlay();
            const generation = playbackGeneration.current;
            const start = async () => {
              if (
                !alive.current ||
                generation !== playbackGeneration.current ||
                sourceRef.current !== source
              )
                return;
              try {
                const position =
                  snapshot.position +
                  (snapshot.playing
                    ? Math.max(0, elapsed + (Date.now() - receivedAt) / 1000)
                    : 0);
                currentPlayer.pause();
                await currentPlayer.seekTo(position);
                if (!alive.current || generation !== playbackGeneration.current)
                  return;
                if (snapshot.playing) currentPlayer.play();
                lastSyncRef.current = {
                  hostTime: position,
                  localTimeAtSync: Date.now(),
                  isPlaying: snapshot.playing,
                };
                setJoinStatus(
                  snapshot.playing
                    ? "You’re in! Playing with the DJ."
                    : "Ready — waiting for the DJ to play.",
                );
              } catch {
                if (alive.current)
                  setJoinStatus("Could not sync with the DJ. Tap to retry.");
              }
            };
            playTimer.current = setTimeout(
              () => {
                void start();
              },
              snapshot.playing ? Math.max(0, -elapsed * 1000) : 0,
            );
            return;
          }
          if (!["PLAY", "PAUSE", "RESET"].includes(msg.action)) return;
          cancelPlay();
          // Missed commands are recovered by the snapshot requested after native load completes.
          if (!currentPlayer.isLoaded || !currentFile || downloadingRef.current)
            return;
          stopSnapshotRequests();
          const generation = playbackGeneration.current;
          const executeAt =
            msg.action === "PLAY" &&
            Number(msg.name) > 0 &&
            currentOffset !== null
              ? Number(msg.name) - currentOffset
              : Date.now();
          const apply = async () => {
            if (!alive.current || generation !== playbackGeneration.current)
              return;
            try {
              const position =
                msg.action === "RESET"
                  ? 0
                  : msg.time +
                    (msg.action === "PLAY"
                      ? Math.max(0, (Date.now() - executeAt) / 1000)
                      : 0);
              currentPlayer.pause();
              await currentPlayer.seekTo(position);
              if (!alive.current || generation !== playbackGeneration.current)
                return;
              if (msg.action === "PLAY") currentPlayer.play();
              lastSyncRef.current = {
                hostTime: position,
                localTimeAtSync: Date.now(),
                isPlaying: msg.action === "PLAY",
              };
              setJoinStatus(
                msg.action === "PLAY"
                  ? "You’re in! Playing with the DJ."
                  : "Ready — waiting for the DJ to play.",
              );
            } catch {
              if (alive.current)
                setJoinStatus("Could not sync with the DJ. Tap to retry.");
            }
          };
          playTimer.current = setTimeout(
            () => {
              void apply();
            },
            Math.max(0, executeAt - Date.now()),
          );
        },
        async (hostSongPayload) => {
          if (!alive.current) {
            disconnectFromHost(deviceId);
            return;
          }
          connectedHostIdRef.current = deviceId;
          setConnectedHostId(deviceId);
          const currentFile = audioFileRef.current;
          if (hostSongPayload) {
            if (hostSongPayload.startsWith("FIREBASE|")) {
              const parts = hostSongPayload.split("|");
              const url = parts[1];
              const actualFilename = parts.slice(2).join("|");

              await downloadSong(url, actualFilename);
            } else {
              const [ip, filename] = hostSongPayload.split("|");
              const actualFilename = filename || hostSongPayload;
              if (!currentFile || currentFile.name !== actualFilename) {
                alert(
                  `The Host is playing: ${actualFilename}. Please select the exact same file to sync properly!`,
                );
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
            if (attempts < 3) await new Promise((r) => setTimeout(r, 500));
          }

          if (!hostSongPayload) {
            // If we connected late and the Host was broadcasting SYNC instead of SONG,
            // we need to explicitly ask the Host to broadcast the SONG again.

            await requestSongFromHost(deviceId);
          }
        },
      );
      if (!alive.current) {
        disconnectFromHost(deviceId);
        return;
      }
      setConnectedHostId(deviceId);
      setIsScanning(false);
      isConnectingRef.current = false;
    } catch (err: any) {
      isConnectingRef.current = false;
      connectedHostIdRef.current = null;
      setConnectedHostId(null);
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
    const elapsedSinceSync =
      (pressTime - lastSyncRef.current.localTimeAtSync) / 1000;
    const trueHostPos = lastSyncRef.current.hostTime + elapsedSinceSync;

    // Target position for Guest includes accumulated nudgeOffset and CPU/hardware compensation
    const EXTRA_FORWARD_BUFFER_SECS = 0.05;
    const compensationSecs =
      lastSeekComputeDelayRef.current / 1000 + EXTRA_FORWARD_BUFFER_SECS;
    const targetPos = Math.max(
      0,
      trueHostPos + nudgeOffsetRef.current + compensationSecs,
    );

    const posBefore = player.currentTime;

    try {
      const seekStart = performance.now();
      await player.seekTo(targetPos);
      const actualFreeze = performance.now() - seekStart;

      // Update moving average for this device's seekTo cost
      lastSeekComputeDelayRef.current =
        lastSeekComputeDelayRef.current * 0.7 + actualFreeze * 0.3;

      // Update lastSyncRef with TRUE host position at resume time
      const resumeTime = Date.now();
      const resumeElapsed = (resumeTime - pressTime) / 1000;
      lastSyncRef.current.hostTime = trueHostPos + resumeElapsed;
      lastSyncRef.current.localTimeAtSync = resumeTime;

      const posAfter = player.currentTime;
      const realizedShiftMs = (posAfter - posBefore) * 1000;
    } catch (e) {
    } finally {
      isSeekingRef.current = false;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => onNavigate("HOME")}
      >
        <Text style={styles.backButtonText}>← BACK</Text>
      </TouchableOpacity>

      <Text style={styles.eyebrow}>HEADPHONES ON · WORLD OFF</Text>
      <Text style={styles.title}>
        Join the <Text style={styles.neon}>Party.</Text>
      </Text>
      <Text style={styles.subtitle}>Find your DJ. Feel the same beat.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>01 / FIND YOUR DJ</Text>
        {!connectedHostId ? (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.scanButton, isScanning && styles.scanning]}
              onPress={handleScan}
              disabled={isScanning}
            >
              {isScanning && <ActivityIndicator color="#C1FF3D" size="small" />}
              <Text
                style={[styles.scanText, isScanning && { color: "#C1FF3D" }]}
              >
                {isScanning ? "LOOKING FOR YOUR DJ…" : "SCAN FOR NEARBY DJs"}
              </Text>
            </TouchableOpacity>
            <View style={styles.hostList}>
              {discoveredHosts.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  style={styles.hostItem}
                  onPress={() => handleConnect(item.id)}
                >
                  <Text style={styles.hostName}>
                    {item.name || "Nearby DJ"}{" "}
                    <Text style={styles.neon}>↗</Text>
                  </Text>
                  <Text style={styles.hostId}>Tap to connect</Text>
                </TouchableOpacity>
              ))}
              {discoveredHosts.length === 0 && (
                <Text style={styles.searchHint}>
                  {scanError || "Keep your DJ nearby with Bluetooth turned on."}
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.statusText}>✓ Connected to your DJ</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>02 / GET READY</Text>
        {!connectedHostId ? (
          <Text style={styles.waitingText}>
            Connect to a DJ to get the music.
          </Text>
        ) : isDownloading ? (
          <View style={styles.downloadContainer}>
            <ActivityIndicator size="small" color="#C1FF3D" />
            <Text style={styles.downloadText}>
              {downloadProgress > 0
                ? `Downloading your track… ${downloadProgress.toFixed(0)}%`
                : "Preparing download..."}
            </Text>
          </View>
        ) : !audioFile ? (
          <Text style={styles.waitingText}>
            Waiting for your DJ to choose a track…
          </Text>
        ) : (
          <View>
            <Text style={styles.readyText}>
              {player.isLoaded ? "✓ Ready to Play!" : "Preparing audio…"}
            </Text>
            <Text style={styles.fileName}>Loaded: {audioFile.name}</Text>
          </View>
        )}
      </View>

      {joinStatus !== "" && (
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!joinStatus.includes("retry")}
          style={styles.card}
          onPress={() => {
            if (audioFile && player.isLoaded) requestCurrentPlayback();
            else if (sourceRef.current) {
              const [, url, ...name] = sourceRef.current.split("|");
              void downloadSong(url, name.join("|"));
            }
          }}
        >
          <Text style={styles.waitingText}>{joinStatus}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>03 / FINE-TUNE YOUR BEAT</Text>
        <Text style={styles.nudgeHint}>
          {nudgeSuggestion === "forward"
            ? "⚠️ Guest is behind — press >>>"
            : nudgeSuggestion === "backward"
              ? "⚠️ Guest is ahead — press <<<"
              : nudgeSuggestion === "synced"
                ? "✅ In sync!"
                : "Waiting for sync data..."}
        </Text>

        <View style={styles.nudgeRow}>
          <TouchableOpacity
            style={[
              styles.nudgeButton,
              { flex: 1, marginRight: 10, alignItems: "center" },
              nudgeSuggestion === "backward"
                ? {
                    backgroundColor: "#48203C",
                    borderColor: "#FF4DD8",
                    borderWidth: 2,
                  }
                : nudgeSuggestion === "synced"
                  ? { backgroundColor: "#263619" }
                  : {},
            ]}
            accessibilityRole="button"
            accessibilityLabel="Nudge audio backward"
            onPress={() => handleNudge(-1)}
            disabled={!audioFile}
          >
            <Text style={styles.nudgeButtonText}>&lt;&lt;&lt;</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.nudgeButton,
              { flex: 1, marginLeft: 10, alignItems: "center" },
              nudgeSuggestion === "forward"
                ? {
                    backgroundColor: "#263619",
                    borderColor: "#C1FF3D",
                    borderWidth: 2,
                  }
                : nudgeSuggestion === "synced"
                  ? { backgroundColor: "#263619" }
                  : {},
            ]}
            accessibilityRole="button"
            accessibilityLabel="Nudge audio forward"
            onPress={() => handleNudge(1)}
            disabled={!audioFile}
          >
            <Text style={styles.nudgeButtonText}>&gt;&gt;&gt;</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: showDiagnostics }}
          onPress={() => setShowDiagnostics((value) => !value)}
        >
          <Text style={styles.detailsLabel}>
            CONNECTION DETAILS {showDiagnostics ? "−" : "+"}
          </Text>
        </TouchableOpacity>
        {showDiagnostics && (
          <TextInput
            style={styles.logBoxInput}
            multiline={true}
            editable={false}
            value={
              debugLogs.length === 0 ? "No logs yet..." : debugLogs.join("\n")
            }
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 22, paddingBottom: 36 },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    marginBottom: 18,
  },
  backButtonText: { fontSize: 12, color: "#A6A7BB", fontWeight: "700" },
  eyebrow: {
    color: "#FF4DD8",
    fontSize: 9,
    letterSpacing: 2,
    marginBottom: 10,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#F4F5FA",
    letterSpacing: -1,
  },
  neon: { color: "#C1FF3D" },
  subtitle: { color: "#9699AF", fontSize: 14, marginTop: 10, marginBottom: 28 },
  card: {
    backgroundColor: "#151722",
    padding: 18,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#343349",
  },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#F4F5FA",
    marginBottom: 16,
  },
  scanButton: {
    backgroundColor: "#C1FF3D",
    minHeight: 52,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  scanning: {
    backgroundColor: "#202A19",
    borderWidth: 1,
    borderColor: "#4D6630",
  },
  scanText: {
    color: "#111707",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  searchHint: {
    fontSize: 12,
    lineHeight: 18,
    color: "#9296AA",
    textAlign: "center",
    paddingTop: 4,
  },
  hostList: { marginTop: 14 },
  hostItem: {
    padding: 14,
    backgroundColor: "#202332",
    borderWidth: 1,
    borderColor: "#48425A",
    borderRadius: 9,
    marginBottom: 9,
  },
  hostName: { fontWeight: "700", fontSize: 16, color: "#F0F1F9" },
  hostId: { fontSize: 11, color: "#A2A6BB", marginTop: 6 },
  fileName: { marginTop: 10, fontSize: 13, color: "#C0C4D7" },
  downloadContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  downloadText: { color: "#C1FF3D", fontSize: 13, flex: 1 },
  statusText: { color: "#C1FF3D", fontWeight: "600" },
  waitingText: { color: "#A4A8BF", fontSize: 13, lineHeight: 20 },
  readyText: { color: "#C1FF3D", fontWeight: "800", fontSize: 18 },
  nudgeHint: {
    fontSize: 12,
    color: "#A4A8BF",
    marginBottom: 16,
    lineHeight: 18,
  },
  nudgeRow: { flexDirection: "row", justifyContent: "space-between" },
  nudgeButton: {
    backgroundColor: "#252738",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#48445C",
  },
  nudgeButtonText: { fontWeight: "800", color: "#DBDDF0" },
  detailsLabel: {
    fontSize: 10,
    letterSpacing: 1,
    color: "#9195AD",
    fontWeight: "700",
  },
  logBoxInput: {
    backgroundColor: "#090D10",
    padding: 12,
    borderRadius: 8,
    minHeight: 120,
    color: "#B4DB83",
    fontSize: 11,
    fontFamily: "Courier",
    marginTop: 14,
  },
});
