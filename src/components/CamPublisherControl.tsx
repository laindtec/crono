import { useEffect, useRef, useState } from "react";
import {
  pollCamSignals,
  registerCamClient,
  rtcConfig,
  sendCamSignal,
  type SignalMessage,
  unregisterCamClient,
} from "../utils/camStreaming";

type PublisherState = "idle" | "starting" | "active" | "error";

export default function CamPublisherControl() {
  const localStreamRef = useRef<MediaStream | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const pollingActiveRef = useRef(false);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [publisherState, setPublisherState] = useState<PublisherState>("idle");
  const [viewerCount, setViewerCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    return () => stopPublishing();
  }, []);

  async function startPublishing() {
    setErrorMessage("");
    setPublisherState("starting");

    try {
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
      const registration = await registerCamClient("publisher");
      clientIdRef.current = registration.clientId;
      pollingActiveRef.current = true;
      setPublisherState("active");

      void pollCamSignals(
        registration.clientId,
        () => pollingActiveRef.current,
        async (messages) => {
          for (const message of messages) {
            await handleSignal(message);
          }
        },
        (error) => {
          setErrorMessage(error instanceof Error ? error.message : "Se perdió la conexión de cámara.");
        },
      );
    } catch (error) {
      setPublisherState("error");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo iniciar la cámara.");
      stopPublishing();
    }
  }

  async function handleSignal(message: SignalMessage) {
    const publisherId = clientIdRef.current;
    const stream = localStreamRef.current;

    if (!publisherId || !stream) {
      return;
    }

    if (message.type === "viewer-ready") {
      const viewerId = message.from;
      peersRef.current.get(viewerId)?.close();

      const peer = new RTCPeerConnection(rtcConfig);
      peersRef.current.set(viewerId, peer);
      setViewerCount(peersRef.current.size);

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          void sendCamSignal(publisherId, viewerId, "candidate", event.candidate);
        }
      };
      peer.onconnectionstatechange = () => {
        if (["closed", "failed", "disconnected"].includes(peer.connectionState)) {
          peersRef.current.delete(viewerId);
          setViewerCount(peersRef.current.size);
          peer.close();
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
      setViewerCount(peersRef.current.size);
    }
  }

  function stopPublishing() {
    pollingActiveRef.current = false;

    if (clientIdRef.current) {
      void unregisterCamClient(clientIdRef.current).catch(() => {});
    }

    clientIdRef.current = null;
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setViewerCount(0);
    setPublisherState("idle");
  }

  const isActive = publisherState === "active";
  const isStarting = publisherState === "starting";

  return (
    <button
      aria-label={isActive ? "Detener cámara remota" : "Activar cámara remota"}
      className={`flex min-h-24 w-40 flex-col justify-center rounded-lg border p-4 text-left shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur transition active:scale-[0.98] sm:min-h-28 sm:w-56 ${
        isActive
          ? "border-emerald-300/60 bg-emerald-300/15"
          : "border-white/10 bg-white/[0.045]"
      }`}
      disabled={isStarting}
      onClick={(event) => {
        event.stopPropagation();
        if (isActive) {
          stopPublishing();
          return;
        }

        void startPublishing();
      }}
      title={errorMessage || undefined}
      type="button"
    >
      <span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Cámara</span>
      <span className="mt-2 text-2xl font-black text-white">
        {isStarting ? "..." : isActive ? "ON" : "OFF"}
      </span>
      <span className="mt-1 text-sm font-bold text-white/55">
        {isActive ? `${viewerCount} mirando` : "Emitir"}
      </span>
    </button>
  );
}
