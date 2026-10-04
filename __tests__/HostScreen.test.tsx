import React from "react";
import renderer, { act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";
import HostScreen from "../src/screens/HostScreen";
import { getDocumentAsync } from "expo-document-picker";

jest.mock("../modules/synchme-pcm-player", () => ({
  usePcmPlayer: () => ({
    playing: false,
    currentTime: 0,
    pause: jest.fn(),
    play: jest.fn(),
    seekTo: jest.fn(async () => {}),
  }),
}));
jest.mock("../src/services/FirebaseService", () => ({
  uploadSongToFirebase: jest.fn(async () => ({
    url: "https://example.com/track.mp3",
  })),
}));
jest.mock("../src/services/BleService", () => ({
  startHostBroadcasting: jest.fn(async () => jest.fn()),
  broadcastMessage: jest.fn(async () => null),
}));

describe("DJ playlist", () => {
  it("adds multiple tracks, reorders them and removes an unselected track", async () => {
    (getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///a.mp3", name: "A.mp3" },
        { uri: "file:///b.mp3", name: "B.mp3" },
        { uri: "file:///c.mp3", name: "C.mp3" },
      ],
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<HostScreen onNavigate={jest.fn()} />);
    });
    const button = (label: string) =>
      tree.root
        .findAllByType(TouchableOpacity)
        .find((node) => node.props.accessibilityLabel === label)!;
    await act(async () => {
      await tree.root
        .findAllByType(TouchableOpacity)
        .find(
          (node) =>
            node.findAll((n) => n.props.children === "＋ ADD MP3").length,
        )!
        .props.onPress();
    });
    expect(getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true }),
    );
    const names = () =>
      tree.root
        .findAllByType(TouchableOpacity)
        .map((node) => node.props.accessibilityLabel)
        .filter((label) => label?.endsWith(" select"));
    expect(names()).toEqual(["A.mp3 select", "B.mp3 select", "C.mp3 select"]);
    await act(async () => button("C.mp3 move up").props.onPress());
    expect(names()).toEqual(["A.mp3 select", "C.mp3 select", "B.mp3 select"]);
    await act(async () => button("B.mp3 remove from playlist").props.onPress());
    expect(names()).toEqual(["A.mp3 select", "C.mp3 select"]);
    await act(async () => tree.unmount());
  });
});
