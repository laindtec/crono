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

type PublisherState = "starting" | "standby" | "streaming" | "error";

export default function CamPublisherControl() {
  const localStreamRef = useRef<MediaStream | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const pollingActiveRef = useRef(false);
  const registeringRef = useRef(false);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [publisherState, setPublisherState] = useState<PublisherState>("starting");
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
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setViewerCount(0);
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
          setErrorMessage(error instanceof Error ? error.message : "Se perdio la conexion de camara.");
        },
      );
    } catch (error) {
      setPublisherState("error");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo preparar la camara.");
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
        setErrorMessage(error instanceof Error ? error.message : "No se pudo sostener la espera de camara.");
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

  return (
    <span
      aria-hidden="true"
      data-camera-state={publisherState}
      data-error={errorMessage || undefined}
      data-viewer-count={viewerCount}
      hidden
    />
  );
}
