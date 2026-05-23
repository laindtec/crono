export type RecordingEntry = {
  id: string;
  name: string;
  label: string;
  size: number;
  lastModified: number;
};

export type RecordingChannelMessage =
  | { type: "recordings-list-request" }
  | { type: "recordings-list"; recordings: RecordingEntry[] }
  | { type: "recording-request"; id: string }
  | { type: "recording-start"; id: string; name: string; size: number }
  | { type: "recording-progress"; id: string; sent: number; size: number }
  | { type: "recording-complete"; id: string }
  | { type: "recording-error"; message: string };

export const RECORDING_PREFIX = "crono-cocina";

export function formatRecordingLabel(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function parseRecordingChannelMessage(value: string): RecordingChannelMessage | null {
  try {
    const parsed = JSON.parse(value) as RecordingChannelMessage;
    return parsed && typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function sendRecordingChannelMessage(channel: RTCDataChannel, message: RecordingChannelMessage) {
  if (channel.readyState === "open") {
    channel.send(JSON.stringify(message));
  }
}
