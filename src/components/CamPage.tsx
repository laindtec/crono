import { useEffect, useRef, useState } from "react";

type CamRole = "idle" | "publisher" | "viewer";
type SignalMessage = {
  from: string;
  type: string;
  payload: unknown;
};

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

function sendSignal(from: string, to: string, type: string, payload: unknown) {
  return apiRequest<{ ok: true }>("/api/cam/signals", {
    method: "POST",
    body: JSON.stringify({ from, to, type, payload }),
  });
}

export default function CamPage() {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const publisherIdRef = useRef<string | null>(null);
  const pollingActiveRef = useRef(false);
  const publisherPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerPeerRef = useRef<RTCPeerConnection | null>(null);

  const [role, setRole] = useState<CamRole>("idle");
  const [status, setStatus] = useState("Listo");
  const [errorMessage, setErrorMessage] = useState("");
  const [viewerConnected, setViewerConnected] = useState(false);

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  async function registerClient(nextRole: Exclude<CamRole, "idle">) {
    const result = await apiRequest<{
      clientId: string;
      publisherId: string | null;
      publisherAvailable: boolean;
    }>("/api/cam/clients", {
      method: "POST",
      body: JSON.stringify({ role: nextRole }),
    });

    clientIdRef.current = result.clientId;
    publisherIdRef.current = result.publisherId;
    return result;
  }

  async function pollSignals(onMessages: (messages: SignalMessage[]) => Promise<void>) {
    pollingActiveRef.current = true;

    while (pollingActiveRef.current && clientIdRef.current) {
      try {
        const result = await apiRequest<{ messages: SignalMessage[]; publisherId: string | null }>(
          `/api/cam/signals?clientId=${encodeURIComponent(clientIdRef.current)}`,
        );

        publisherIdRef.current = result.publisherId;
        if (result.messages.length > 0) {
          await onMessages(result.messages);
        }
      } catch (error) {
        if (pollingActiveRef.current) {
          setErrorMessage(error instanceof Error ? error.message : "Se perdió la conexión de cámara.");
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
        }
      }
    }
  }

  async function startPublisher() {
    setErrorMessage("");
    setStatus("Pidiendo permisos de cámara y micrófono");

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
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await registerClient("publisher");
      setRole("publisher");
      setStatus("Transmitiendo desde esta tablet");

      void pollSignals(async (messages) => {
        for (const message of messages) {
          await handlePublisherSignal(message);
        }
      });
    } catch (error) {
      setStatus("Inactivo");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo iniciar la transmisión.");
      stopSession();
    }
  }

  async function handlePublisherSignal(message: SignalMessage) {
    const publisherId = clientIdRef.current;
    const stream = localStreamRef.current;

    if (!publisherId || !stream) {
      return;
    }

    if (message.type === "viewer-ready") {
      const viewerId = message.from;
      const previousPeer = publisherPeersRef.current.get(viewerId);
      previousPeer?.close();

      const peer = new RTCPeerConnection(rtcConfig);
      publisherPeersRef.current.set(viewerId, peer);

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal(publisherId, viewerId, "candidate", event.candidate);
        }
      };
      peer.onconnectionstatechange = () => {
        if (["closed", "failed", "disconnected"].includes(peer.connectionState)) {
          publisherPeersRef.current.delete(viewerId);
          peer.close();
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal(publisherId, viewerId, "offer", offer);
      return;
    }

    const peer = publisherPeersRef.current.get(message.from);
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
      publisherPeersRef.current.delete(message.from);
    }
  }

  async function startViewer() {
    setErrorMessage("");
    setViewerConnected(false);
    setStatus("Buscando tablet transmisora");

    try {
      const registration = await registerClient("viewer");
      setRole("viewer");

      if (!registration.publisherId) {
        setStatus("No hay una tablet transmitiendo");
      } else {
        await announceViewerReady(registration.publisherId);
      }

      void pollSignals(async (messages) => {
        for (const message of messages) {
          await handleViewerSignal(message);
        }
      });
    } catch (error) {
      setStatus("Inactivo");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo abrir la cámara remota.");
      stopSession();
    }
  }

  async function announceViewerReady(publisherId: string) {
    const viewerId = clientIdRef.current;
    if (!viewerId) {
      return;
    }

    publisherIdRef.current = publisherId;
    setStatus("Conectando con la tablet");
    await sendSignal(viewerId, publisherId, "viewer-ready", null);
  }

  async function handleViewerSignal(message: SignalMessage) {
    const viewerId = clientIdRef.current;
    if (!viewerId) {
      return;
    }

    if (message.type === "offer") {
      publisherIdRef.current = message.from;

      const previousPeer = viewerPeerRef.current;
      previousPeer?.close();

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }

      const peer = new RTCPeerConnection(rtcConfig);
      viewerPeerRef.current = peer;

      peer.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
        setViewerConnected(true);
        setStatus("Viendo cámara en vivo");
      };
      peer.onicecandidate = (event) => {
        if (event.candidate && publisherIdRef.current) {
          void sendSignal(viewerId, publisherIdRef.current, "candidate", event.candidate);
        }
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
          setViewerConnected(false);
          setStatus("Conexión interrumpida");
        }
      };

      await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal(viewerId, message.from, "answer", answer);
      return;
    }

    if (message.type === "candidate" && viewerPeerRef.current) {
      await viewerPeerRef.current.addIceCandidate(message.payload as RTCIceCandidateInit);
    }
  }

  function stopSession() {
    pollingActiveRef.current = false;

    const clientId = clientIdRef.current;
    const publisherId = publisherIdRef.current;

    if (clientId && publisherId && role === "viewer") {
      void sendSignal(clientId, publisherId, "viewer-left", null).catch(() => {});
    }

    if (clientId) {
      void fetch(`/api/cam/clients/${encodeURIComponent(clientId)}`, {
        credentials: "same-origin",
        method: "DELETE",
      }).catch(() => {});
    }

    clientIdRef.current = null;
    publisherIdRef.current = null;
    publisherPeersRef.current.forEach((peer) => peer.close());
    publisherPeersRef.current.clear();
    viewerPeerRef.current?.close();
    viewerPeerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setRole("idle");
    setStatus("Listo");
    setViewerConnected(false);
  }

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
            className={`h-full min-h-[56vh] w-full object-cover ${role === "publisher" ? "" : "hidden"}`}
            muted
            playsInline
            ref={localVideoRef}
          />
          <video
            autoPlay
            className={`h-full min-h-[56vh] w-full object-cover ${role === "viewer" ? "" : "hidden"}`}
            controls
            playsInline
            ref={remoteVideoRef}
          />

          {role === "idle" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950 p-6 text-center">
              <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
                <button
                  className="min-h-40 rounded-lg bg-cyan-300 px-6 text-2xl font-black text-slate-950 transition hover:bg-cyan-200 active:scale-[0.97]"
                  onClick={startPublisher}
                  type="button"
                >
                  Transmitir desde esta tablet
                </button>
                <button
                  className="min-h-40 rounded-lg bg-white/[0.08] px-6 text-2xl font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
                  onClick={startViewer}
                  type="button"
                >
                  Ver cámara en vivo
                </button>
              </div>
            </div>
          ) : null}

          {role === "viewer" && !viewerConnected ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-6 text-center">
              <p className="text-2xl font-black text-white/70">{status}</p>
            </div>
          ) : null}
        </div>

        <aside className="rounded-lg border border-white/10 bg-slate-950 p-5">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-white/45">Modo</p>
          <p className="mt-3 text-2xl font-black">
            {role === "publisher" ? "Tablet emitiendo" : role === "viewer" ? "Visor remoto" : "Sin conexión"}
          </p>

          <div className="mt-8 space-y-3 text-base font-bold text-white/55">
            <p>La tablet debe quedar abierta en esta página con “Transmitir desde esta tablet”.</p>
            <p>Desde otro dispositivo entrás a la misma URL y elegís “Ver cámara en vivo”.</p>
          </div>

          {errorMessage ? (
            <p className="mt-6 rounded-lg bg-rose-500/15 p-3 text-base font-bold text-rose-100">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="mt-8 min-h-14 w-full rounded-lg bg-white/[0.08] px-4 text-lg font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
            disabled={role === "idle"}
            onClick={stopSession}
            type="button"
          >
            Detener
          </button>
        </aside>
      </section>
    </main>
  );
}
