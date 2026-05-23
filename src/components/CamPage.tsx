import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiRequestError,
  pollCamSignals,
  registerCamClient,
  rtcConfig,
  sendCamSignal,
  type SignalMessage,
  unregisterCamClient,
} from "../utils/camStreaming";
import { APP_TIME_ZONE } from "../utils/dateUtils";

type ViewerState = "idle" | "connecting" | "active" | "offline" | "error";

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
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const publisherIdRef = useRef<string | null>(null);
  const pollingActiveRef = useRef(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState>("idle");
  const [status, setStatus] = useState("Listo para ver la camara");
  const [errorMessage, setErrorMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  const monitorTime = useMemo(() => formatMonitorTime(now), [now]);
  const monitorDate = useMemo(() => formatMonitorDate(now), [now]);
  const isLive = viewerState === "active";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
    peerRef.current?.close();
    peerRef.current = null;
    remoteStreamRef.current = null;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setViewerState("idle");
    setStatus("Listo para ver la camara");
  }

  async function restartViewer() {
    stopViewer();
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    await startViewer();
  }

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
            className="h-[calc(100vh-18rem)] min-h-[26rem] w-full bg-black object-contain lg:h-[calc(100vh-4rem)]"
            controls
            playsInline
            ref={remoteVideoRef}
          />

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

          <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-black/65 px-3 py-2 text-sm font-bold text-white/75">
            {status}
          </div>

          {viewerState !== "active" ? (
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Estado</p>
              <p className="mt-3 text-2xl font-black">{getConnectionLabel(viewerState)}</p>
              <p className="mt-2 text-sm font-bold text-white/50">{status}</p>
            </section>

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
