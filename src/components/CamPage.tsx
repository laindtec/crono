import { useEffect, useRef, useState } from "react";
import {
  pollCamSignals,
  registerCamClient,
  rtcConfig,
  sendCamSignal,
  type SignalMessage,
  unregisterCamClient,
} from "../utils/camStreaming";

type ViewerState = "idle" | "connecting" | "active" | "offline" | "error";

export default function CamPage() {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const publisherIdRef = useRef<string | null>(null);
  const pollingActiveRef = useRef(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState>("idle");
  const [status, setStatus] = useState("Listo para ver la cámara");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    return () => stopViewer();
  }, []);

  async function startViewer() {
    setErrorMessage("");
    setViewerState("connecting");
    setStatus("Buscando señal de la tablet");

    try {
      const registration = await registerCamClient("viewer");
      clientIdRef.current = registration.clientId;
      publisherIdRef.current = registration.publisherId;
      pollingActiveRef.current = true;

      if (registration.publisherId) {
        await announceViewerReady(registration.publisherId);
      } else {
        setViewerState("offline");
        setStatus("La tablet todavía no está emitiendo");
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
          setErrorMessage(error instanceof Error ? error.message : "Se perdió la conexión de cámara.");
        },
      );
    } catch (error) {
      setViewerState("error");
      setStatus("No se pudo abrir la cámara");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo abrir la cámara remota.");
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
        setStatus("Viendo cámara en vivo");
      };
      peer.onicecandidate = (event) => {
        if (event.candidate && publisherIdRef.current) {
          void sendCamSignal(viewerId, publisherIdRef.current, "candidate", event.candidate);
        }
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
          setViewerState("offline");
          setStatus("Conexión interrumpida");
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
    setStatus("Listo para ver la cámara");
  }

  const canStart = viewerState === "idle" || viewerState === "offline" || viewerState === "error";

  return (
    <main className="flex min-h-screen flex-col bg-black px-4 py-5 text-white sm:px-8">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-white/45">Crono</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Cámara de cocina</h1>
          <p className="mt-2 text-lg font-bold text-white/50">{status}</p>
        </div>
        <a
          className="rounded-lg bg-white/[0.08] px-4 py-3 text-base font-black text-white transition hover:bg-white/[0.14]"
          href="/"
        >
          Volver
        </a>
      </header>

      <section className="mx-auto mt-6 grid w-full max-w-6xl flex-1 gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="relative min-h-[56vh] overflow-hidden rounded-lg border border-white/10 bg-slate-950">
          <video
            autoPlay
            className="h-full min-h-[56vh] w-full object-cover"
            controls
            playsInline
            ref={remoteVideoRef}
          />

          {viewerState !== "active" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-6 text-center">
              <div className="max-w-xl">
                <p className="text-2xl font-black text-white/75">{status}</p>
                <button
                  className="mt-6 min-h-16 rounded-lg bg-cyan-300 px-6 text-xl font-black text-slate-950 transition hover:bg-cyan-200 active:scale-[0.97]"
                  disabled={!canStart}
                  onClick={startViewer}
                  type="button"
                >
                  Ver cámara en vivo
                </button>
                {errorMessage ? (
                  <p className="mt-4 rounded-lg bg-rose-500/15 p-3 text-base font-bold text-rose-100">
                    {errorMessage}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-lg border border-white/10 bg-slate-950 p-5">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-white/45">Visor remoto</p>
          <p className="mt-3 text-2xl font-black">
            {viewerState === "active" ? "En vivo" : "Esperando señal"}
          </p>

          <div className="mt-8 space-y-3 text-base font-bold text-white/55">
            <p>La tablet emite desde la pantalla principal de Crono con el botón Cámara.</p>
            <p>Esta página solo visualiza audio y video desde otro dispositivo.</p>
          </div>

          <button
            className="mt-8 min-h-14 w-full rounded-lg bg-white/[0.08] px-4 text-lg font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
            disabled={viewerState === "idle"}
            onClick={stopViewer}
            type="button"
          >
            Detener
          </button>
        </aside>
      </section>
    </main>
  );
}
