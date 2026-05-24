import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiRequestError,
  heartbeatCamClient,
  pollCamSignals,
  registerCamClient,
  rtcConfig,
  sendCamSignal,
  type SignalMessage,
  unregisterCamClient,
} from "../utils/camStreaming";
import {
  RECORDING_PREFIX,
  formatRecordingLabel,
  parseRecordingChannelMessage,
  sendRecordingChannelMessage,
  type RecordingEntry,
} from "../utils/camRecordings";
import {
  getRecordingsDirectory,
  hasReadWritePermission,
  pickRecordingsDirectory,
  requestReadWritePermission,
  supportsDirectoryPicker,
  type CronoDirectoryHandle,
} from "../utils/fileSystemAccess";

type PublisherState = "starting" | "standby" | "streaming" | "error";
type RecordingState = "unsupported" | "needs-folder" | "starting" | "recording" | "error";

const RECORDING_SEGMENT_MS = 20 * 60 * 1000;
const RECORDING_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_RECORDING_FILES = 72;
const RECORDING_CHUNK_SIZE = 256 * 1024;
const RECORDER_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function getCameraErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError && error.status === 429) {
    return "Demasiadas reconexiones. Reintentando en unos segundos.";
  }

  return error instanceof Error ? error.message : fallback;
}

function getRecorderMimeType() {
  return RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function formatRecordingFileName(date: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(" ", "_")
    .replaceAll(":", "-");

  return `${RECORDING_PREFIX}_${parts}.webm`;
}

export default function CamPublisherControl() {
  const localStreamRef = useRef<MediaStream | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const recordingSegmentTimerRef = useRef<number | null>(null);
  const pollingActiveRef = useRef(false);
  const registeringRef = useRef(false);
  const recordingEnabledRef = useRef(false);
  const recordingSetupCheckedRef = useRef(false);
  const recordingSetupPromptedRef = useRef(false);
  const directoryRef = useRef<CronoDirectoryHandle | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingWritableRef = useRef<FileSystemWritableFileStream | null>(null);
  const recordingWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const recordingChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const [publisherState, setPublisherState] = useState<PublisherState>("starting");
  const [recordingState, setRecordingState] = useState<RecordingState>("starting");
  const [recordingMessage, setRecordingMessage] = useState("Preparando grabacion local");
  const [viewerCount, setViewerCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const stopPublishing = useCallback(() => {
    pollingActiveRef.current = false;

    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    if (clientIdRef.current) {
      void unregisterCamClient(clientIdRef.current).catch(() => {});
    }

    clientIdRef.current = null;
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    recordingChannelsRef.current.forEach((channel) => channel.close());
    recordingChannelsRef.current.clear();
    stopCurrentRecording();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setViewerCount(0);
  }, []);

  async function configureRecordingsDirectory() {
    try {
      const directory = await pickRecordingsDirectory();
      const allowed = await requestReadWritePermission(directory);

      if (!allowed) {
        setRecordingState("needs-folder");
        setRecordingMessage("La carpeta no quedo autorizada");
        return;
      }

      directoryRef.current = directory;
      recordingEnabledRef.current = true;
      setRecordingState("starting");
      setRecordingMessage("Iniciando grabacion local");
      await startRecordingSegment();
    } catch (error) {
      setRecordingState("error");
      setRecordingMessage(error instanceof Error ? error.message : "No se pudo elegir la carpeta");
    }
  }

  useEffect(() => {
    let active = true;

    async function loadRecordingDirectory() {
      if (!supportsDirectoryPicker() || typeof MediaRecorder === "undefined") {
        setRecordingState("unsupported");
        setRecordingMessage("Grabacion local no disponible en este navegador");
        return;
      }

      try {
        const directory = await getRecordingsDirectory();

        if (!active) {
          return;
        }

        if (!directory) {
          setRecordingState("needs-folder");
          setRecordingMessage("Elegir carpeta para guardar las ultimas 24 horas");
          return;
        }

        const allowed = await hasReadWritePermission(directory);

        if (!active) {
          return;
        }

        if (!allowed) {
          setRecordingState("needs-folder");
          setRecordingMessage("Toca para reautorizar la carpeta de grabaciones");
          return;
        }

        directoryRef.current = directory;
        recordingEnabledRef.current = true;
        await startRecordingSegment();
      } catch (error) {
        if (active) {
          setRecordingState("error");
          setRecordingMessage(error instanceof Error ? error.message : "No se pudo preparar la grabacion");
        }
      }
    }

    void loadRecordingDirectory();

    return () => {
      active = false;
      recordingEnabledRef.current = false;
      stopCurrentRecording();
    };
  }, []);

  useEffect(() => {
    if (!supportsDirectoryPicker() || typeof MediaRecorder === "undefined") {
      return undefined;
    }

    async function ensureRecordingSetupAfterInteraction() {
      if (recordingSetupCheckedRef.current || recordingEnabledRef.current) {
        return;
      }

      recordingSetupCheckedRef.current = true;
      const directory = await getRecordingsDirectory();

      if (directory && (await requestReadWritePermission(directory))) {
        directoryRef.current = directory;
        recordingEnabledRef.current = true;
        setRecordingState("starting");
        setRecordingMessage("Iniciando grabacion local");
        await startRecordingSegment();
        return;
      }

      if (recordingSetupPromptedRef.current) {
        return;
      }

      recordingSetupPromptedRef.current = true;
      await configureRecordingsDirectory();
    }

    function promptForRecordingsDirectory() {
      void ensureRecordingSetupAfterInteraction();
    }

    window.addEventListener("pointerdown", promptForRecordingsDirectory, { capture: true, once: true });
    window.addEventListener("keydown", promptForRecordingsDirectory, { capture: true, once: true });

    return () => {
      window.removeEventListener("pointerdown", promptForRecordingsDirectory, { capture: true });
      window.removeEventListener("keydown", promptForRecordingsDirectory, { capture: true });
    };
  }, []);

  const registerPublisher = useCallback(async () => {
    if (registeringRef.current) {
      return;
    }

    registeringRef.current = true;
    setPublisherState("starting");

    try {
      if (clientIdRef.current) {
        void unregisterCamClient(clientIdRef.current).catch(() => {});
      }

      pollingActiveRef.current = false;
      const registration = await registerCamClient("publisher");
      clientIdRef.current = registration.clientId;
      pollingActiveRef.current = true;
      setErrorMessage("");
      setPublisherState("standby");

      void pollCamSignals(
        registration.clientId,
        () => pollingActiveRef.current && clientIdRef.current === registration.clientId,
        async (messages) => {
          for (const message of messages) {
            await handleSignal(message);
          }
        },
        (error) => {
          if (error instanceof ApiRequestError && error.status === 404) {
            void registerPublisher();
            return;
          }

          setPublisherState("error");
          setErrorMessage(getCameraErrorMessage(error, "Se perdio la conexion de camara."));
        },
      );
    } catch (error) {
      setPublisherState("error");
      setErrorMessage(getCameraErrorMessage(error, "No se pudo preparar la camara."));
    } finally {
      registeringRef.current = false;
    }
  }, []);

  useEffect(() => {
    void registerPublisher();

    heartbeatTimerRef.current = window.setInterval(() => {
      const clientId = clientIdRef.current;
      if (!clientId) {
        void registerPublisher();
        return;
      }

      heartbeatCamClient(clientId).catch((error) => {
        if (error instanceof ApiRequestError && error.status === 404) {
          void registerPublisher();
          return;
        }

        setPublisherState("error");
        setErrorMessage(getCameraErrorMessage(error, "No se pudo sostener la espera de camara."));
      });
    }, 30_000);

    return () => stopPublishing();
  }, [registerPublisher, stopPublishing]);

  async function getLocalStream() {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    localStreamRef.current = stream;
    return stream;
  }

  function stopLocalStreamIfIdle() {
    if (peersRef.current.size > 0 || mediaRecorderRef.current?.state === "recording") {
      return;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setPublisherState("standby");
  }

  async function purgeOldRecordings(directory: CronoDirectoryHandle) {
    const now = Date.now();
    const recordings: Array<{ name: string; lastModified: number }> = [];

    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file" || !name.startsWith(RECORDING_PREFIX) || !name.endsWith(".webm")) {
        continue;
      }

      const file = await handle.getFile();
      recordings.push({ name, lastModified: file.lastModified });

      if (now - file.lastModified > RECORDING_RETENTION_MS) {
        await directory.removeEntry(name).catch(() => {});
      }
    }

    recordings.sort((left, right) => left.lastModified - right.lastModified);
    const overflow = recordings.length - MAX_RECORDING_FILES;

    for (let index = 0; index < overflow; index += 1) {
      await directory.removeEntry(recordings[index].name).catch(() => {});
    }
  }

  async function listLocalRecordings(): Promise<RecordingEntry[]> {
    const directory = directoryRef.current;

    if (!directory) {
      return [];
    }

    const recordings: RecordingEntry[] = [];

    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file" || !name.startsWith(RECORDING_PREFIX) || !name.endsWith(".webm")) {
        continue;
      }

      const file = await handle.getFile();

      if (file.size <= 0) {
        continue;
      }

      recordings.push({
        id: name,
        name,
        label: formatRecordingLabel(new Date(file.lastModified)),
        size: file.size,
        lastModified: file.lastModified,
      });
    }

    return recordings.sort((left, right) => right.lastModified - left.lastModified);
  }

  async function sendRecordingsList(viewerId: string) {
    const channel = recordingChannelsRef.current.get(viewerId);

    if (!channel || channel.readyState !== "open") {
      return;
    }

    sendRecordingChannelMessage(channel, {
      type: "recordings-list",
      recordings: await listLocalRecordings(),
    });
  }

  async function sendRecordingFile(viewerId: string, recordingId: string) {
    const directory = directoryRef.current;
    const channel = recordingChannelsRef.current.get(viewerId);

    if (!directory || !channel || channel.readyState !== "open") {
      return;
    }

    try {
      const fileHandle = await directory.getFileHandle(recordingId);
      const file = await fileHandle.getFile();
      let sent = 0;

      sendRecordingChannelMessage(channel, {
        type: "recording-start",
        id: recordingId,
        name: file.name,
        size: file.size,
      });

      for (let offset = 0; offset < file.size; offset += RECORDING_CHUNK_SIZE) {
        if (channel.readyState !== "open") {
          return;
        }

        while (channel.bufferedAmount > RECORDING_CHUNK_SIZE * 8) {
          await new Promise((resolve) => window.setTimeout(resolve, 80));
        }

        const chunk = await file.slice(offset, offset + RECORDING_CHUNK_SIZE).arrayBuffer();
        channel.send(chunk);
        sent += chunk.byteLength;
        sendRecordingChannelMessage(channel, {
          type: "recording-progress",
          id: recordingId,
          sent,
          size: file.size,
        });
      }

      sendRecordingChannelMessage(channel, { type: "recording-complete", id: recordingId });
    } catch (error) {
      sendRecordingChannelMessage(channel, {
        type: "recording-error",
        message: error instanceof Error ? error.message : "No se pudo enviar la grabacion",
      });
    }
  }

  function setupRecordingChannel(viewerId: string, channel: RTCDataChannel) {
    channel.binaryType = "arraybuffer";
    recordingChannelsRef.current.set(viewerId, channel);

    channel.onopen = () => {
      void sendRecordingsList(viewerId);
    };

    channel.onmessage = (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      const message = parseRecordingChannelMessage(event.data);

      if (!message) {
        return;
      }

      if (message.type === "recordings-list-request") {
        void sendRecordingsList(viewerId);
        return;
      }

      if (message.type === "recording-request") {
        void sendRecordingFile(viewerId, message.id);
      }
    };

    channel.onclose = () => {
      recordingChannelsRef.current.delete(viewerId);
    };
  }

  async function stopCurrentRecording() {
    if (recordingSegmentTimerRef.current !== null) {
      window.clearTimeout(recordingSegmentTimerRef.current);
      recordingSegmentTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function closeRecordingFile() {
    const writable = recordingWritableRef.current;
    recordingWritableRef.current = null;

    if (writable) {
      await recordingWriteChainRef.current;
      await writable.close();
    }
  }

  async function startRecordingSegment() {
    const directory = directoryRef.current;

    if (!recordingEnabledRef.current || !directory) {
      return;
    }

    try {
      const stream = await getLocalStream();
      const fileHandle = await directory.getFileHandle(formatRecordingFileName(new Date()), { create: true });
      const writable = await fileHandle.createWritable();
      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64_000,
        videoBitsPerSecond: 1_000_000,
      });

      recordingWritableRef.current = writable;
      mediaRecorderRef.current = recorder;
      setRecordingState("recording");
      setRecordingMessage("Grabando en bloques de 20 minutos");

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && recordingWritableRef.current) {
          const writable = recordingWritableRef.current;
          recordingWriteChainRef.current = recordingWriteChainRef.current.then(() =>
            writable.write(event.data).then(() => undefined),
          );
        }
      };

      recorder.onerror = () => {
        setRecordingState("error");
        setRecordingMessage("Se interrumpio la grabacion local");
      };

      recorder.onstop = () => {
        void closeRecordingFile()
          .then(() => purgeOldRecordings(directory))
          .then(() => {
            if (recordingEnabledRef.current) {
              void startRecordingSegment();
              return;
            }

            stopLocalStreamIfIdle();
          })
          .catch((error) => {
            setRecordingState("error");
            setRecordingMessage(error instanceof Error ? error.message : "No se pudo guardar la grabacion");
          });
      };

      recorder.start(30_000);
      recordingSegmentTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current === recorder && recorder.state === "recording") {
          recorder.stop();
        }
      }, RECORDING_SEGMENT_MS);
    } catch (error) {
      setRecordingState("error");
      setRecordingMessage(error instanceof Error ? error.message : "No se pudo iniciar la grabacion");
      await closeRecordingFile().catch(() => {});
      stopLocalStreamIfIdle();
    }
  }

  async function handleSignal(message: SignalMessage) {
    const publisherId = clientIdRef.current;

    if (!publisherId) {
      return;
    }

    if (message.type === "viewer-ready") {
      const viewerId = message.from;
      peersRef.current.get(viewerId)?.close();

      const stream = await getLocalStream();
      const peer = new RTCPeerConnection(rtcConfig);
      const recordingChannel = peer.createDataChannel("recordings");
      peersRef.current.set(viewerId, peer);
      setupRecordingChannel(viewerId, recordingChannel);
      setViewerCount(peersRef.current.size);
      setPublisherState("streaming");

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          void sendCamSignal(publisherId, viewerId, "candidate", event.candidate);
        }
      };
      peer.onconnectionstatechange = () => {
        if (["closed", "failed", "disconnected"].includes(peer.connectionState)) {
          peersRef.current.delete(viewerId);
          recordingChannelsRef.current.get(viewerId)?.close();
          recordingChannelsRef.current.delete(viewerId);
          setViewerCount(peersRef.current.size);
          peer.close();
          stopLocalStreamIfIdle();
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendCamSignal(publisherId, viewerId, "offer", offer);
      return;
    }

    const peer = peersRef.current.get(message.from);
    if (!peer) {
      return;
    }

    if (message.type === "answer") {
      await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      return;
    }

    if (message.type === "candidate") {
      await peer.addIceCandidate(message.payload as RTCIceCandidateInit);
      return;
    }

    if (message.type === "viewer-left") {
      peer.close();
      peersRef.current.delete(message.from);
      recordingChannelsRef.current.get(message.from)?.close();
      recordingChannelsRef.current.delete(message.from);
      setViewerCount(peersRef.current.size);
      stopLocalStreamIfIdle();
    }
  }

  return (
    <>
      <span
        aria-hidden="true"
        data-camera-state={publisherState}
        data-error={errorMessage || undefined}
        data-recording-message={recordingMessage || undefined}
        data-recording-state={recordingState}
        data-viewer-count={viewerCount}
        hidden
      />
    </>
  );
}
