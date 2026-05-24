import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import {
  ApiRequestError,
  pollCamSignals,
  registerCamClient,
  rtcConfig,
  sendCamSignal,
  type SignalMessage,
  unregisterCamClient,
} from "../utils/camStreaming";
import {
  formatBytes,
  parseRecordingChannelMessage,
  sendRecordingChannelMessage,
  type RecordingEntry,
} from "../utils/camRecordings";
import { APP_TIME_ZONE } from "../utils/dateUtils";

type ViewerState = "idle" | "connecting" | "active" | "offline" | "error";
type MonitorPanel = "live" | "recordings";
type RecordingTransfer = {
  error: string;
  id: string;
  name: string;
  progress: number;
  size: number;
  state: "idle" | "downloading" | "ready" | "error";
  url: string;
};

function formatMonitorTime(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatMonitorDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getConnectionLabel(viewerState: ViewerState): string {
  if (viewerState === "active") {
    return "En vivo";
  }

  if (viewerState === "connecting") {
    return "Conectando";
  }

  if (viewerState === "offline") {
    return "Sin señal";
  }

  if (viewerState === "error") {
    return "Error";
  }

  return "En espera";
}

function getCameraErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError && error.status === 429) {
    return "Demasiadas reconexiones. Reintentando en unos segundos.";
  }

  return error instanceof Error ? error.message : fallback;
}

export default function CamPage() {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const recordingVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const recordingChannelRef = useRef<RTCDataChannel | null>(null);
  const recordingChunksRef = useRef<ArrayBuffer[]>([]);
  const clientIdRef = useRef<string | null>(null);
  const publisherIdRef = useRef<string | null>(null);
  const pollingActiveRef = useRef(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState>("idle");
  const [activePanel, setActivePanel] = useState<MonitorPanel>("live");
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [recordingStatus, setRecordingStatus] = useState("Esperando lista de la tablet");
  const [recordingTransfer, setRecordingTransfer] = useState<RecordingTransfer>({
    error: "",
    id: "",
    name: "",
    progress: 0,
    size: 0,
    state: "idle",
    url: "",
  });
  const [status, setStatus] = useState("Listo para ver la camara");
  const [errorMessage, setErrorMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  const monitorTime = useMemo(() => formatMonitorTime(now), [now]);
  const monitorDate = useMemo(() => formatMonitorDate(now), [now]);
  const isLive = viewerState === "active";
  const showingRecordings = activePanel === "recordings";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (recordingTransfer.url) {
        URL.revokeObjectURL(recordingTransfer.url);
      }
    };
  }, [recordingTransfer.url]);

  useEffect(() => {
    void startViewer();
    return () => stopViewer();
  }, []);

  async function startViewer() {
    setErrorMessage("");
    setViewerState("connecting");
    setStatus("Buscando senal de la tablet");

    try {
      const registration = await registerCamClient("viewer");
      clientIdRef.current = registration.clientId;
      publisherIdRef.current = registration.publisherId;
      pollingActiveRef.current = true;

      if (registration.publisherId) {
        await announceViewerReady(registration.publisherId);
      } else {
        setViewerState("offline");
        setStatus("La tablet todavia no esta en espera");
      }

      void pollCamSignals(
        registration.clientId,
        () => pollingActiveRef.current,
        async (messages, publisherId) => {
          if (publisherId && !publisherIdRef.current) {
            await announceViewerReady(publisherId);
          }

          for (const message of messages) {
            await handleSignal(message);
          }
        },
        (error) => {
          setViewerState("error");
          setErrorMessage(getCameraErrorMessage(error, "Se perdio la conexion de camara."));
        },
      );
    } catch (error) {
      setViewerState("error");
      setStatus("No se pudo abrir la camara");
      setErrorMessage(getCameraErrorMessage(error, "No se pudo abrir la camara remota."));
      stopViewer();
    }
  }

  async function announceViewerReady(publisherId: string) {
    const viewerId = clientIdRef.current;
    if (!viewerId) {
      return;
    }

    publisherIdRef.current = publisherId;
    setViewerState("connecting");
    setStatus("Conectando con la tablet");
    await sendCamSignal(viewerId, publisherId, "viewer-ready", null);
  }

  async function handleSignal(message: SignalMessage) {
    const viewerId = clientIdRef.current;
    if (!viewerId) {
      return;
    }

    if (message.type === "offer") {
      publisherIdRef.current = message.from;
      peerRef.current?.close();

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }

      const peer = new RTCPeerConnection(rtcConfig);
      peerRef.current = peer;

      peer.ondatachannel = (event) => {
        if (event.channel.label === "recordings") {
          setupRecordingChannel(event.channel);
        }
      };
      peer.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
        setViewerState("active");
        setStatus("Viendo camara en vivo");
      };
      peer.onicecandidate = (event) => {
        if (event.candidate && publisherIdRef.current) {
          void sendCamSignal(viewerId, publisherIdRef.current, "candidate", event.candidate);
        }
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
          setViewerState("offline");
          setStatus("Conexion interrumpida");
        }
      };

      await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendCamSignal(viewerId, message.from, "answer", answer);
      return;
    }

    if (message.type === "candidate" && peerRef.current) {
      await peerRef.current.addIceCandidate(message.payload as RTCIceCandidateInit);
    }
  }

  function stopViewer() {
    pollingActiveRef.current = false;

    const clientId = clientIdRef.current;
    const publisherId = publisherIdRef.current;

    if (clientId && publisherId) {
      void sendCamSignal(clientId, publisherId, "viewer-left", null).catch(() => {});
    }

    if (clientId) {
      void unregisterCamClient(clientId).catch(() => {});
    }

    clientIdRef.current = null;
    publisherIdRef.current = null;
    recordingChannelRef.current?.close();
    recordingChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    remoteStreamRef.current = null;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setViewerState("idle");
    setStatus("Listo para ver la camara");
  }

  function setupRecordingChannel(channel: RTCDataChannel) {
    recordingChannelRef.current = channel;
    channel.binaryType = "arraybuffer";
    setRecordingStatus("Conectando con grabaciones");

    channel.onopen = () => {
      setRecordingStatus("Cargando grabaciones");
      sendRecordingChannelMessage(channel, { type: "recordings-list-request" });
    };

    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        recordingChunksRef.current.push(event.data);
        return;
      }

      if (typeof event.data !== "string") {
        return;
      }

      const message = parseRecordingChannelMessage(event.data);

      if (!message) {
        return;
      }

      if (message.type === "recordings-list") {
        setRecordings(message.recordings);
        setRecordingStatus(
          message.recordings.length > 0 ? "Grabaciones disponibles en la tablet" : "Sin grabaciones guardadas",
        );
        return;
      }

      if (message.type === "recording-start") {
        recordingChunksRef.current = [];
        setRecordingTransfer((current) => {
          if (current.url) {
            URL.revokeObjectURL(current.url);
          }

          return {
            error: "",
            id: message.id,
            name: message.name,
            progress: 0,
            size: message.size,
            state: "downloading",
            url: "",
          };
        });
        setRecordingStatus("Recibiendo grabacion desde la tablet");
        return;
      }

      if (message.type === "recording-progress") {
        setRecordingTransfer((current) =>
          current.id === message.id
            ? { ...current, progress: message.size > 0 ? message.sent / message.size : 0, size: message.size }
            : current,
        );
        return;
      }

      if (message.type === "recording-complete") {
        const blob = new Blob(recordingChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        recordingChunksRef.current = [];
        setRecordingTransfer((current) => {
          if (current.url) {
            URL.revokeObjectURL(current.url);
          }

          return { ...current, progress: 1, state: "ready", url };
        });
        setRecordingStatus("Grabacion lista para reproducir");
        return;
      }

      if (message.type === "recording-error") {
        setRecordingTransfer((current) => ({ ...current, error: message.message, state: "error" }));
        setRecordingStatus("No se pudo recibir la grabacion");
      }
    };

    channel.onclose = () => {
      if (recordingChannelRef.current === channel) {
        recordingChannelRef.current = null;
      }

      setRecordingStatus("Grabaciones desconectadas");
    };
  }

  function requestRecordingsList() {
    const channel = recordingChannelRef.current;

    if (!channel || channel.readyState !== "open") {
      setRecordingStatus("Todavia no hay conexion con la tablet");
      return;
    }

    setRecordingStatus("Actualizando lista");
    sendRecordingChannelMessage(channel, { type: "recordings-list-request" });
  }

  function requestRecording(recording: RecordingEntry) {
    const channel = recordingChannelRef.current;

    if (!channel || channel.readyState !== "open") {
      setRecordingStatus("Todavia no hay conexion con la tablet");
      return;
    }

    setActivePanel("recordings");
    setRecordingStatus("Solicitando grabacion a la tablet");
    sendRecordingChannelMessage(channel, { type: "recording-request", id: recording.id });
  }

  function repairWebmDuration(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;

    if (Number.isFinite(video.duration) && video.duration > 0) {
      return;
    }

    const restoreStart = () => {
      video.removeEventListener("timeupdate", restoreStart);
      video.currentTime = 0;
      video.pause();
    };

    video.addEventListener("timeupdate", restoreStart);

    try {
      video.currentTime = Number.MAX_SAFE_INTEGER;
    } catch {
      video.removeEventListener("timeupdate", restoreStart);
    }
  }

  async function restartViewer() {
    stopViewer();
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    await startViewer();
  }

  const transferPercent = Math.round(recordingTransfer.progress * 100);

  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <header className="flex min-h-16 items-center justify-between border-b border-white/10 bg-[#090d12] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <a
            aria-label="Volver"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-2xl font-black transition hover:bg-white/[0.12] active:scale-[0.96]"
            href="/"
          >
            ‹
          </a>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/40">Crono Security</p>
            <h1 className="truncate text-xl font-black sm:text-2xl">Cocina · Cámara principal</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`h-3 w-3 rounded-full ${
              isLive ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" : "bg-amber-300"
            }`}
          />
          <div className="text-right">
            <p className="text-lg font-black tabular-nums leading-none">{monitorTime}</p>
            <p className="mt-1 text-xs font-bold text-white/45">{monitorDate}</p>
          </div>
        </div>
      </header>

      <section className="grid min-h-[calc(100vh-4rem)] grid-rows-[1fr_auto] lg:grid-cols-[1fr_21rem] lg:grid-rows-1">
        <div className="relative bg-black">
          <video
            autoPlay
            className={`h-[calc(100vh-18rem)] min-h-[26rem] w-full bg-black object-contain lg:h-[calc(100vh-4rem)] ${
              showingRecordings ? "pointer-events-none absolute inset-0 opacity-0" : ""
            }`}
            controls
            playsInline
            ref={remoteVideoRef}
          />

          {showingRecordings ? (
            <div className="relative z-10 flex h-[calc(100vh-18rem)] min-h-[26rem] w-full items-center justify-center bg-black p-4 lg:h-[calc(100vh-4rem)]">
              {recordingTransfer.url ? (
                <video
                  className="max-h-full w-full bg-black object-contain"
                  controls
                  onLoadedMetadata={repairWebmDuration}
                  playsInline
                  preload="metadata"
                  ref={recordingVideoRef}
                  src={recordingTransfer.url}
                />
              ) : (
                <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#0b1118] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
                  <p className="text-sm font-black uppercase tracking-[0.22em] text-white/40">
                    Grabaciones
                  </p>
                  <p className="mt-3 text-3xl font-black">
                    {recordingTransfer.state === "downloading" ? `${transferPercent}%` : "Selecciona un bloque"}
                  </p>
                  <p className="mt-3 text-base font-bold text-white/55">{recordingStatus}</p>
                  {recordingTransfer.state === "downloading" ? (
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-300 transition-all"
                        style={{ width: `${transferPercent}%` }}
                      />
                    </div>
                  ) : null}
                  {recordingTransfer.error ? (
                    <p className="mt-4 rounded-lg bg-rose-500/15 p-3 text-sm font-bold text-rose-100">
                      {recordingTransfer.error}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {!showingRecordings ? (
          <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-3 py-2 text-sm font-black uppercase tracking-[0.18em] ${
                isLive ? "bg-rose-500 text-white" : "bg-amber-300 text-slate-950"
              }`}
            >
              {isLive ? "Live" : getConnectionLabel(viewerState)}
            </span>
            <span className="rounded-md bg-black/65 px-3 py-2 text-sm font-black uppercase tracking-[0.16em] text-white/75">
              CAM 01
            </span>
          </div>
          ) : null}

          {!showingRecordings ? (
          <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-black/65 px-3 py-2 text-sm font-bold text-white/75">
            {status}
          </div>
          ) : null}

          {!showingRecordings && viewerState !== "active" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center">
              <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#0b1118] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
                <p className="text-sm font-black uppercase tracking-[0.22em] text-white/40">
                  Señal de video
                </p>
                <p className="mt-3 text-3xl font-black">{getConnectionLabel(viewerState)}</p>
                <p className="mt-3 text-base font-bold text-white/55">{status}</p>
                {viewerState === "offline" || viewerState === "error" ? (
                  <button
                    className="mt-6 min-h-14 w-full rounded-lg bg-cyan-300 px-5 text-lg font-black text-slate-950 transition hover:bg-cyan-200 active:scale-[0.97]"
                    onClick={restartViewer}
                    type="button"
                  >
                    Reconectar
                  </button>
                ) : null}
                {errorMessage ? (
                  <p className="mt-4 rounded-lg bg-rose-500/15 p-3 text-sm font-bold text-rose-100">
                    {errorMessage}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="border-t border-white/10 bg-[#090d12] p-4 lg:border-l lg:border-t-0 lg:p-5">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-white/[0.04] p-1">
            <button
              className={`min-h-11 rounded-md px-3 text-sm font-black transition ${
                activePanel === "live" ? "bg-cyan-300 text-slate-950" : "text-white/70 hover:bg-white/[0.08]"
              }`}
              onClick={() => setActivePanel("live")}
              type="button"
            >
              En vivo
            </button>
            <button
              className={`min-h-11 rounded-md px-3 text-sm font-black transition ${
                activePanel === "recordings" ? "bg-cyan-300 text-slate-950" : "text-white/70 hover:bg-white/[0.08]"
              }`}
              onClick={() => {
                setActivePanel("recordings");
                requestRecordingsList();
              }}
              type="button"
            >
              Grabaciones
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Estado</p>
              <p className="mt-3 text-2xl font-black">{getConnectionLabel(viewerState)}</p>
              <p className="mt-2 text-sm font-bold text-white/50">{status}</p>
            </section>

            {activePanel === "recordings" ? (
              <section className="col-span-2 rounded-lg border border-white/10 bg-white/[0.04] p-4 lg:col-span-1">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Historial</p>
                    <p className="mt-2 text-sm font-bold text-white/50">{recordingStatus}</p>
                  </div>
                  <button
                    className="min-h-10 rounded-lg bg-white/[0.08] px-3 text-sm font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
                    onClick={requestRecordingsList}
                    type="button"
                  >
                    Actualizar
                  </button>
                </div>

                {recordingTransfer.state === "downloading" ? (
                  <div className="mt-4 rounded-lg bg-cyan-300/10 p-3">
                    <div className="flex items-center justify-between text-sm font-black text-cyan-100">
                      <span>Recibiendo</span>
                      <span>{transferPercent}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-300 transition-all"
                        style={{ width: `${transferPercent}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid max-h-[22rem] gap-2 overflow-y-auto pr-1">
                  {recordings.map((recording) => (
                    <button
                      className={`rounded-lg border p-3 text-left transition active:scale-[0.98] ${
                        recordingTransfer.id === recording.id
                          ? "border-cyan-300/70 bg-cyan-300/10"
                          : "border-white/10 bg-black/20 hover:bg-white/[0.07]"
                      }`}
                      key={recording.id}
                      onClick={() => requestRecording(recording)}
                      type="button"
                    >
                      <span className="block text-base font-black text-white">{recording.label}</span>
                      <span className="mt-1 block text-xs font-bold text-white/45">
                        {formatBytes(recording.size)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Ubicación</p>
              <p className="mt-3 text-2xl font-black">Cocina</p>
              <p className="mt-2 text-sm font-bold text-white/50">Tablet principal</p>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Audio</p>
              <p className="mt-3 text-2xl font-black">{isLive ? "Activo" : "En espera"}</p>
              <p className="mt-2 text-sm font-bold text-white/50">Controlado por el visor</p>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Acciones</p>
              <div className="mt-4 grid gap-2">
                <button
                  className="min-h-12 rounded-lg bg-white/[0.08] px-4 text-base font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
                  onClick={restartViewer}
                  type="button"
                >
                  Reconectar
                </button>
                <button
                  className="min-h-12 rounded-lg bg-white/[0.08] px-4 text-base font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
                  disabled={viewerState === "idle"}
                  onClick={stopViewer}
                  type="button"
                >
                  Detener visor
                </button>
              </div>
            </section>
          </div>
        </aside>
      </section>
    </main>
  );
}
