import { useEffect, useRef, useState } from "react";

type AccessState = "idle" | "requesting" | "active" | "error";

export default function CamPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [accessState, setAccessState] = useState<AccessState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [micLevel, setMicLevel] = useState(0);

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAccessState("error");
      setErrorMessage("Este navegador no permite acceder a cámara y micrófono.");
      return;
    }

    setAccessState("requesting");
    setErrorMessage("");

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

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const samples = new Uint8Array(analyser.frequencyBinCount);

      analyser.fftSize = 512;
      source.connect(analyser);
      audioContextRef.current = audioContext;

      function updateMicLevel() {
        analyser.getByteFrequencyData(samples);
        const average = samples.reduce((total, value) => total + value, 0) / samples.length;
        setMicLevel(Math.min(100, Math.round((average / 128) * 100)));
        animationRef.current = requestAnimationFrame(updateMicLevel);
      }

      updateMicLevel();
      setAccessState("active");
    } catch (error) {
      setAccessState("error");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo acceder a cámara y micrófono.");
    }
  }

  function stopCamera() {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setMicLevel(0);
    setAccessState("idle");
  }

  return (
    <main className="flex min-h-screen flex-col bg-black px-4 py-5 text-white sm:px-8">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-white/45">Crono</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Cámara de cocina</h1>
        </div>
        <a
          className="rounded-lg bg-white/[0.08] px-4 py-3 text-base font-black text-white transition hover:bg-white/[0.14]"
          href="/"
        >
          Volver
        </a>
      </header>

      <section className="mx-auto mt-6 grid w-full max-w-6xl flex-1 gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="relative min-h-[50vh] overflow-hidden rounded-lg border border-white/10 bg-slate-950">
          <video
            autoPlay
            className="h-full min-h-[50vh] w-full object-cover"
            muted
            playsInline
            ref={videoRef}
          />
          {accessState !== "active" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950 p-6 text-center">
              <div className="max-w-lg">
                <p className="text-xl font-bold text-white/60">
                  La cámara y el micrófono se activan solo después de tocar el botón y aceptar el permiso del navegador.
                </p>
                <button
                  className="mt-6 min-h-16 rounded-lg bg-cyan-300 px-6 text-xl font-black text-slate-950 transition hover:bg-cyan-200 active:scale-[0.97]"
                  disabled={accessState === "requesting"}
                  onClick={startCamera}
                  type="button"
                >
                  {accessState === "requesting" ? "Solicitando permiso" : "Activar cámara y micrófono"}
                </button>
                {errorMessage ? (
                  <p className="mt-4 text-base font-bold text-rose-200">{errorMessage}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-lg border border-white/10 bg-slate-950 p-5">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-white/45">Estado</p>
          <p className="mt-3 text-2xl font-black">
            {accessState === "active" ? "Transmitiendo local" : "Inactivo"}
          </p>

          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-black uppercase tracking-[0.18em] text-white/45">Micrófono</span>
              <span className="text-sm font-black tabular-nums text-cyan-100">{micLevel}%</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-cyan-300 transition-all"
                style={{ width: `${micLevel}%` }}
              />
            </div>
          </div>

          <button
            className="mt-8 min-h-14 w-full rounded-lg bg-white/[0.08] px-4 text-lg font-black text-white transition hover:bg-white/[0.14] active:scale-[0.97]"
            disabled={accessState !== "active"}
            onClick={stopCamera}
            type="button"
          >
            Detener
          </button>
        </aside>
      </section>
    </main>
  );
}
