import React from "react";
import renderer, { act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";
import GuestScreen from "../src/screens/GuestScreen";
import { playbackSnapshot } from "../src/services/PlaybackSync";
import * as FileSystem from "expo-file-system/legacy";
import {
  requestSongFromHost,
  requestSyncFromHost,
  sendReadyToHost,
} from "../src/services/BleService";

const mockSource = "FIREBASE|https://example.com/live.mp3|Party.mp3";
let mockReceive: (message: any) => Promise<void>;
let mockDiscover: (device: any) => void;
let mockLoaded = false;
const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockSeek = jest.fn(async (_position: number) => {});
jest.mock("../modules/synchme-pcm-player", () => ({
  usePcmPlayer: (source: any) => ({
    isLoaded: !!source && mockLoaded,
    loadedUri: mockLoaded ? source?.uri : null,
    loadError: null,
    playing: false,
    currentTime: 0,
    play: mockPlay,
    pause: mockPause,
    seekTo: mockSeek,
  }),
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 100 })),
  deleteAsync: jest.fn(async () => {}),
  moveAsync: jest.fn(async () => {}),
}));
jest.mock("../src/services/BleService", () => ({
  startGuestScanning: jest.fn(async (callback) => {
    mockDiscover = callback;
  }),
  stopGuestScanning: jest.fn(),
  disconnectFromHost: jest.fn(),
  connectToHost: jest.fn(async (id, receive, connected) => {
    mockReceive = receive;
    await connected(mockSource);
  }),
  requestSongFromHost: jest.fn(async () => {}),
  pingHost: jest.fn(async () => null),
  consumePong: jest.fn(() => false),
  sendReadyToHost: jest.fn(async () => {}),
  requestSyncFromHost: jest.fn(async () => {}),
}));

describe("Late joining a party", () => {
  let tree: any;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockLoaded = false;
  });
  afterEach(async () => {
    await act(async () => tree?.unmount());
    jest.useRealTimers();
  });
  async function connect() {
    await act(async () => {
      tree = renderer.create(<GuestScreen onNavigate={jest.fn()} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => mockDiscover({ id: "dj", name: "Test DJ" }));
    await act(async () =>
      tree.root
        .findAllByType(TouchableOpacity)
        .find(
          (node: any) =>
            node.findAll(
              (child: any) =>
                child.type === "Text" &&
                String(child.props.children).includes("Test DJ"),
            ).length,
        )!
        .props.onPress(),
    );
  }
  async function load() {
    mockLoaded = true;
    await act(async () => tree.update(<GuestScreen onNavigate={jest.fn()} />));
  }
  const requestId = () =>
    (requestSyncFromHost as jest.Mock).mock.calls.slice(-1)[0][1];
  it("waits for native audio load, then seeks and plays without another DJ Play", async () => {
    await connect();
    expect(sendReadyToHost).not.toHaveBeenCalled();
    expect(requestSyncFromHost).not.toHaveBeenCalled();
    await load();
    expect(sendReadyToHost).toHaveBeenCalledWith("dj");
    await act(async () =>
      mockReceive(playbackSnapshot(requestId(), mockSource, 82, true)),
    );
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockSeek).toHaveBeenCalledWith(expect.any(Number));
    expect(mockSeek.mock.calls[0][0]).toBeGreaterThanOrEqual(82);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });
  it("keeps a late listener paused when the DJ is paused", async () => {
    await connect();
    await load();
    await act(async () =>
      mockReceive(playbackSnapshot(requestId(), mockSource, 33, false)),
    );
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockSeek).toHaveBeenCalledWith(33);
    expect(mockPlay).not.toHaveBeenCalled();
  });
  it("ignores another listener’s response and does not replay a duplicate response", async () => {
    await connect();
    await load();
    const id = requestId();
    await act(async () =>
      mockReceive(playbackSnapshot("another-phone", mockSource, 82, true)),
    );
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockSeek).not.toHaveBeenCalled();
    const snapshot = playbackSnapshot(id, mockSource, 82, true);
    await act(async () => mockReceive(snapshot));
    await act(async () => jest.advanceTimersByTime(1));
    await act(async () => mockReceive(snapshot));
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });
  it("a pause cancels a pending late-join start", async () => {
    await connect();
    await load();
    await act(async () => {
      await mockReceive(playbackSnapshot(requestId(), mockSource, 82, true));
      await mockReceive({ action: "PAUSE", time: 83 });
    });
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockSeek).toHaveBeenLastCalledWith(83);
  });
  it("retries missing responses and gives up without starting the player", async () => {
    await connect();
    await load();
    await act(async () => jest.advanceTimersByTime(10000));
    expect(requestSyncFromHost).toHaveBeenCalledTimes(5);
    expect(mockPlay).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("Tap to retry");
  });
  it("rejects a stale track snapshot and requests the current song", async () => {
    await connect();
    await load();
    await act(async () =>
      mockReceive(
        playbackSnapshot(
          requestId(),
          "FIREBASE|https://example.com/new.mp3|Party.mp3",
          5,
          true,
        ),
      ),
    );
    await act(async () => jest.advanceTimersByTime(1));
    expect(requestSongFromHost).toHaveBeenCalledWith("dj");
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockSeek).not.toHaveBeenCalled();
  });
  it("does not announce readiness or play after a failed download", async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockRejectedValueOnce(
      new Error("Storage unavailable"),
    );
    await connect();
    await load();
    expect(sendReadyToHost).not.toHaveBeenCalled();
    expect(requestSyncFromHost).not.toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("Download failed");
  });
});
