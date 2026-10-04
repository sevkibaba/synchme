import type { SyncMessage } from "./BleService";

// Identify the shared source rather than its display filename.
export function songKey(source: string): string {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++)
    hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

export function playbackSnapshot(
  requestId: string,
  source: string,
  position: number,
  playing: boolean,
  sampledAt = Date.now(),
): SyncMessage {
  return {
    action: "SYNC",
    time: position,
    name: `${requestId}|${songKey(source)}|${playing ? 1 : 0}|${sampledAt}`,
  };
}

export function readPlaybackSnapshot(
  message: SyncMessage,
  requestId: string,
  source: string,
) {
  const [recipient, track, state, timestamp] = (message.name || "").split("|");
  const sampledAt = Number(timestamp);
  if (
    message.action !== "SYNC" ||
    recipient !== requestId ||
    track !== songKey(source) ||
    !["0", "1"].includes(state) ||
    !Number.isFinite(sampledAt) ||
    sampledAt <= 0 ||
    !Number.isFinite(message.time) ||
    message.time < 0
  )
    return null;
  return { position: message.time, playing: state === "1", sampledAt };
}
