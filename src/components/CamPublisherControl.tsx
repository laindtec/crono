import { useEffect, useRef, useState } from "react";
import {
  pollCamSignals,
  registerCamClient,
  rtcConfig,
  sendCamSignal,
  type SignalMessage,
  unregisterCamClient,
} from "../utils/camStreaming";

type PublisherState = "starting" | "standby" | "streaming" | "error";

export default function CamPublisherControl() {
  const localStreamRef = useRef<MediaStream | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const pollingActiveRef = useRef(false);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [publisherState, setPublisherState] = useState<PublisherState>("starting");
  const [viewerCount, setViewerCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function startStandby() {
      try {
        const registration = await registerCamClient("publisher");

        if (!active) {
          void unregisterCamClient(registration.clientId).catch(() => {});
          return;
        }

        clientIdRef.current = registration.clientId;
        pollingActiveRef.current = true;
        setPublisherState("standby");

        void pollCamSignals(
          registration.clientId,
          () => pollingActiveRef.current,
          async (messages) => {
            for (const message of messages) {
              await handleSignal(message);
            }
          },
          (error) => {
            setPublisherState("error");
            setErrorMessage(error instanceof Error ? error.message : "Se perdió la conexión de cámara.");
          },
        );
      } catch (error) {
        if (active) {
          setPublisherState("error");
          setErrorMessage(error instanceof Error ? error.message : "No se pudo preparar la cámara.");
        }
      }
    }

    void startStandby();

    return () => {
      active = false;
      stopPublishing();
    };
  }, []);

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
    if (peersRef.current.size > 0) {
      return;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setPublisherState("standby");
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
      peersRef.current.set(viewerId, peer);
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
      setViewerCount(peersRef.current.size);
      stopLocalStreamIfIdle();
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
  }

  const label =
    publisherState === "streaming"
      ? "EN VIVO"
      : publisherState === "standby"
        ? "ESPERA"
        : publisherState === "starting"
          ? "..."
          : "ERROR";

  return (
    <div
      aria-label="Estado de cámara remota"
      className={`flex min-h-24 w-40 flex-col justify-center rounded-lg border p-4 text-left shadow-[0_18px_55px_rgba(0,0,0,0.35)] backdrop-blur sm:min-h-28 sm:w-56 ${
        publisherState === "streaming"
          ? "border-emerald-300/60 bg-emerald-300/15"
          : "border-white/10 bg-white/[0.045]"
      }`}
      title={errorMessage || undefined}
    >
      <span className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Cámara</span>
      <span className="mt-2 text-2xl font-black text-white">{label}</span>
      <span className="mt-1 text-sm font-bold text-white/55">
        {publisherState === "streaming" ? `${viewerCount} mirando` : "Auto"}
      </span>
    </div>
  );
}
