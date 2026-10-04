import { playbackSnapshot } from "../services/PlaybackSync";
import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { usePcmPlayer as useAudioPlayer } from "../../modules/synchme-pcm-player";
import { ScreenType } from "../../App";
import {
  startHostBroadcasting,
  broadcastMessage,
} from "../services/BleService";
import { uploadSongToFirebase } from "../services/FirebaseService";
interface Props {
  onNavigate: (screen: ScreenType) => void;
}
export default function HostScreen({ onNavigate }: Props) {
  const [tracks, setTracks] = useState<DocumentPicker.DocumentPickerAsset[]>(
    [],
  );
  const [audioFile, setAudioFile] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGuestReady, setIsGuestReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const songPayloadRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const scheduledPlay = useRef<{ position: number; at: number } | null>(null);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useAudioPlayer(audioFile ? { uri: audioFile.uri } : null);
  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    mounted.current = true;
    let cleanup: (() => void) | void;
    startHostBroadcasting(
      (msg) => {
        if (!mounted.current) return;
        if (msg.action === "READY" && songPayloadRef.current)
          setIsGuestReady(true);
        if (msg.action === "REQUEST_SONG" && songPayloadRef.current)
          broadcastMessage({
            action: "SONG",
            time: 0,
            name: songPayloadRef.current,
          });
        if (
          msg.action === "REQUEST_SYNC" &&
          msg.name &&
          songPayloadRef.current
        ) {
          const pending = scheduledPlay.current;
          broadcastMessage(
            playbackSnapshot(
              msg.name,
              songPayloadRef.current,
              pending ? pending.position : playerRef.current.currentTime,
              pending ? true : playerRef.current.playing,
              pending ? pending.at : Date.now(),
            ),
          );
        }
      },
      () => playerRef.current.currentTime,
    )
      .then((result) => {
        if (!mounted.current) result?.();
        else cleanup = result;
      })
      .catch(() => {
        if (mounted.current)
          setError(
            "Could not start Bluetooth. Check Bluetooth permissions on a physical device.",
          );
      });
    return () => {
      mounted.current = false;
      cleanup?.();
      if (playTimer.current) clearTimeout(playTimer.current);
      scheduledPlay.current = null;
    };
  }, []);
  const startSharing = async (file: DocumentPicker.DocumentPickerAsset) => {
    setIsUploading(true);
    setError(null);
    try {
      const { url } = await uploadSongToFirebase(file.uri, file.name);
      if (!mounted.current) return;
      const payload = `FIREBASE|${url}|${file.name}`;
      songPayloadRef.current = payload;
      const failure = await broadcastMessage({
        action: "SONG",
        time: 0,
        name: payload,
      });
      if (failure) throw new Error(failure);
    } catch {
      if (mounted.current)
        setError(
          "Could not share this track. Check your internet connection and Firebase settings.",
        );
    } finally {
      if (mounted.current) setIsUploading(false);
    }
  };
  const selectTrack = (file: DocumentPicker.DocumentPickerAsset) => {
    if (playTimer.current) clearTimeout(playTimer.current);
    scheduledPlay.current = null;
    player.pause();
    broadcastMessage({ action: "RESET", time: 0 });
    setAudioFile(file);
    setIsGuestReady(false);
    songPayloadRef.current = null;
    startSharing(file);
  };
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !mounted.current) return;
      setTracks((previous) => [
        ...previous,
        ...result.assets.filter(
          (file) => !previous.some((track) => track.uri === file.uri),
        ),
      ]);
      if (!audioFile && result.assets.length) selectTrack(result.assets[0]);
    } catch {
      setError("Could not open the files. Please try again.");
    }
  };
  const moveTrack = (index: number, direction: number) =>
    setTracks((previous) => {
      const next = [...previous],
        target = index + direction;
      if (target < 0 || target >= next.length) return previous;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const handlePlayPause = async () => {
    if (playTimer.current) clearTimeout(playTimer.current);
    scheduledPlay.current = null;
    if (player.playing) {
      player.pause();
      await broadcastMessage({ action: "PAUSE", time: player.currentTime });
    } else {
      const executeAt = Date.now() + 300;
      scheduledPlay.current = { position: player.currentTime, at: executeAt };
      const failure = await broadcastMessage({
        action: "PLAY",
        time: player.currentTime,
        name: executeAt.toString(),
      });
      if (failure) {
        scheduledPlay.current = null;
        setError(
          "Could not send the play command. Check your Bluetooth connection.",
        );
        return;
      }
      playTimer.current = setTimeout(
        () => {
          scheduledPlay.current = null;
          if (mounted.current) playerRef.current.play();
        },
        Math.max(0, executeAt - Date.now()),
      );
    }
  };
  const handleReset = async () => {
    if (playTimer.current) clearTimeout(playTimer.current);
    scheduledPlay.current = null;
    player.pause();
    await player.seekTo(0);
    await broadcastMessage({ action: "RESET", time: 0 });
  };
  const selectedIndex = tracks.findIndex(
    (track) => track.uri === audioFile?.uri,
  );
  const busy = isUploading;
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => onNavigate("HOME")}
        >
          <Text style={styles.back}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.badge}>DJ BOOTH</Text>
      </View>
      <Text style={styles.title}>
        Party Set List<Text style={{ color: "#FF4DD8" }}>.</Text>
      </Text>
      <Text style={styles.subtitle}>Your tracks. One beat for everyone.</Text>
      <View style={styles.deck}>
        <View style={styles.deckHeader}>
          <Text style={styles.mono}>SILENT CLUB / PLAYER</Text>
          <Text style={styles.pink}>● LIVE SET</Text>
        </View>
        <View style={styles.display}>
          <Text style={styles.caption}>
            {player.playing ? "NOW PLAYING" : "CUED UP"}
          </Text>
          <Text numberOfLines={2} style={styles.song}>
            {audioFile?.name || "BUILD YOUR SET"}
          </Text>
          <View style={styles.readout}>
            <Text style={styles.digits}>
              {String(selectedIndex + 1).padStart(2, "0")}
              <Text style={styles.dim}>
                {" "}
                / {String(tracks.length).padStart(2, "0")}
              </Text>
            </Text>
            <Text style={styles.mono}>MP3 · STEREO</Text>
          </View>
          <View
            style={styles.equalizer}
            accessibilityLabel="Decorative equalizer"
          >
            {[
              12, 22, 34, 18, 28, 42, 24, 36, 20, 32, 44, 26, 16, 30, 40, 24,
              34, 18, 28, 12,
            ].map((height, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height,
                  backgroundColor: i > 14 ? "#FF4DD8" : "#C1FF3D",
                  opacity: player.playing ? 1 : 0.35,
                }}
              />
            ))}
          </View>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Previous track"
            disabled={busy || selectedIndex <= 0}
            style={[
              styles.smallButton,
              (busy || selectedIndex <= 0) && styles.disabled,
            ]}
            onPress={() => selectTrack(tracks[selectedIndex - 1])}
          >
            <Text style={styles.controlText}>⏮</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={!audioFile || !isGuestReady || busy}
            style={[
              styles.play,
              (!audioFile || !isGuestReady || busy) && styles.disabled,
            ]}
            onPress={handlePlayPause}
          >
            <Text style={styles.playText}>
              {player.playing ? "Ⅱ PAUSE" : "▶ PLAY"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Stop and rewind"
            disabled={!audioFile || busy}
            style={[
              styles.smallButton,
              (!audioFile || busy) && styles.disabled,
            ]}
            onPress={handleReset}
          >
            <Text style={styles.controlText}>■</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Next track"
            disabled={
              busy || selectedIndex < 0 || selectedIndex >= tracks.length - 1
            }
            style={[
              styles.smallButton,
              (busy ||
                selectedIndex < 0 ||
                selectedIndex >= tracks.length - 1) &&
                styles.disabled,
            ]}
            onPress={() => selectTrack(tracks[selectedIndex + 1])}
          >
            <Text style={styles.controlText}>⏭</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.status}>
          {busy && <ActivityIndicator color="#C1FF3D" size="small" />}
          <Text style={styles.statusText}>
            {busy
              ? "Uploading track to share…"
              : isGuestReady
                ? "✓  Listener ready"
                : audioFile
                  ? "Waiting for the listener to download the track"
                  : "Add MP3s to get started"}
          </Text>
        </View>
      </View>
      {error && (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            onPress={() => audioFile && startSharing(audioFile)}
          >
            <Text style={styles.pink}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          PLAYLIST <Text style={styles.dim}>/ {tracks.length}</Text>
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.add}
          disabled={busy}
          onPress={pickDocument}
        >
          <Text style={styles.addText}>＋ ADD MP3</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.list}>
        <View style={styles.columns}>
          <Text style={styles.mono}># TRACK</Text>
          <Text style={styles.mono}>ORDER</Text>
        </View>
        {tracks.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>♫</Text>
            <Text style={styles.emptyTitle}>
              Your playlist starts the night.
            </Text>
            <Text style={styles.emptyText}>
              Add your MP3s, set the order, start the party.
            </Text>
            <TouchableOpacity accessibilityRole="button" onPress={pickDocument}>
              <Text style={styles.emptyLink}>ADD YOUR FIRST TRACKS ↗</Text>
            </TouchableOpacity>
          </View>
        ) : (
          tracks.map((track, index) => (
            <View
              key={track.uri}
              style={[
                styles.row,
                track.uri === audioFile?.uri && styles.activeRow,
              ]}
            >
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={track.name + " select"}
                disabled={busy}
                style={styles.track}
                onPress={() => selectTrack(track)}
              >
                <Text style={styles.number}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.trackName,
                      track.uri === audioFile?.uri && { color: "#C1FF3D" },
                    ]}
                  >
                    {track.name}
                  </Text>
                  <Text style={styles.trackMeta}>
                    {track.uri === audioFile?.uri ? "SELECTED · " : ""}
                    {track.size
                      ? (track.size / 1048576).toFixed(1) + " MB"
                      : "AUDIO"}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={track.name + " move up"}
                disabled={busy || index === 0}
                style={[styles.order, index === 0 && styles.disabled]}
                onPress={() => moveTrack(index, -1)}
              >
                <Text style={styles.orderText}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={track.name + " move down"}
                disabled={busy || index === tracks.length - 1}
                style={[
                  styles.order,
                  index === tracks.length - 1 && styles.disabled,
                ]}
                onPress={() => moveTrack(index, 1)}
              >
                <Text style={styles.orderText}>↓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={track.name + " remove from playlist"}
                disabled={busy || track.uri === audioFile?.uri}
                style={[
                  styles.order,
                  track.uri === audioFile?.uri && styles.disabled,
                ]}
                onPress={() =>
                  setTracks((previous) =>
                    previous.filter((t) => t.uri !== track.uri),
                  )
                }
              >
                <Text style={styles.orderText}>×</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={styles.listFooter}>
          <Text style={styles.mono}>{tracks.length} TRACKS</Text>
          <Text style={styles.pink}>YOUR MUSIC. YOUR NIGHT.</Text>
        </View>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.link}
        onPress={() => {
          const { AbletonLink } = require("../../modules/synchme-ableton-link");
          AbletonLink.openSettings();
        }}
      >
        <Text style={styles.linkText}>ABLETON LINK</Text>
        <Text style={styles.linkText}>Settings ↗</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 35 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },
  back: { color: "#A6A7BB", fontSize: 12, fontWeight: "700" },
  badge: {
    color: "#C1FF3D",
    fontSize: 10,
    letterSpacing: 2,
    borderColor: "#3D4C25",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  title: {
    color: "#F4F5FA",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: { color: "#898BA2", fontSize: 13, marginTop: 8, marginBottom: 22 },
  deck: {
    backgroundColor: "#171824",
    borderWidth: 1,
    borderColor: "#39364D",
    borderRadius: 14,
    padding: 14,
  },
  deckHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 9,
    color: "#9497AF",
    letterSpacing: 0.5,
  },
  pink: {
    color: "#FF4DD8",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  display: {
    backgroundColor: "#080E0B",
    borderColor: "#35412A",
    borderWidth: 1,
    borderRadius: 6,
    padding: 15,
  },
  caption: { color: "#7C996A", fontSize: 9, letterSpacing: 2 },
  song: {
    color: "#C1FF3D",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 20,
    fontWeight: "700",
    marginVertical: 12,
  },
  readout: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  digits: {
    color: "#C1FF3D",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 28,
  },
  dim: { color: "#656B79" },
  equalizer: {
    height: 50,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    marginTop: 10,
  },
  controls: { flexDirection: "row", gap: 8, marginTop: 14 },
  smallButton: {
    backgroundColor: "#292B3D",
    borderColor: "#45475D",
    borderWidth: 1,
    borderRadius: 6,
    width: 44,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  controlText: { color: "#F4F5FA", fontSize: 19 },
  play: {
    flex: 1,
    backgroundColor: "#C1FF3D",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  playText: { color: "#101507", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.32 },
  status: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 14 },
  statusText: { fontSize: 11, color: "#ADB09E", flex: 1 },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 26,
    marginBottom: 12,
  },
  listTitle: {
    color: "#F4F5FA",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1,
  },
  add: { borderColor: "#65502D", borderWidth: 1, borderRadius: 7, padding: 12 },
  addText: { color: "#C1FF3D", fontSize: 11, fontWeight: "800" },
  list: {
    borderWidth: 1,
    borderColor: "#303243",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#10111A",
  },
  columns: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#1B1D2B",
  },
  empty: { paddingVertical: 30, paddingHorizontal: 14, alignItems: "center" },
  emptyIcon: { color: "#FF4DD8", fontSize: 34, marginBottom: 12 },
  emptyTitle: { color: "#DBDCE8", fontSize: 15, fontWeight: "700" },
  emptyText: {
    color: "#86899F",
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
  },
  emptyLink: {
    color: "#C1FF3D",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 22,
    letterSpacing: 1,
  },
  listFooter: {
    borderTopWidth: 1,
    borderTopColor: "#303243",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#252637",
  },
  activeRow: { backgroundColor: "#1C2815" },
  track: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 44,
  },
  number: {
    color: "#767B8E",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
  },
  trackName: { color: "#DADCE8", fontSize: 12, fontWeight: "600" },
  trackMeta: { color: "#858B97", fontSize: 9, marginTop: 4 },
  order: {
    minWidth: 32,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  orderText: { color: "#ADB0C5", fontSize: 18 },
  link: {
    marginTop: 20,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  linkText: { color: "#898BA2", fontSize: 11, letterSpacing: 1 },
  error: {
    marginTop: 12,
    padding: 14,
    backgroundColor: "#291421",
    borderRadius: 8,
    gap: 12,
  },
  errorText: { color: "#FF92BF", fontSize: 12, lineHeight: 18 },
});
