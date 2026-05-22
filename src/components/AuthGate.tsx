import { type FormEvent, type ReactNode, useEffect, useState } from "react";

type AuthGateProps = {
  children: ReactNode;
};

type AuthState = "checking" | "authenticated" | "login" | "unconfigured";

async function requestSession() {
  const response = await fetch("/api/cam/session", { credentials: "same-origin" });

  if (response.status === 503) {
    return { configured: false, authenticated: false };
  }

  if (!response.ok) {
    return { configured: true, authenticated: false };
  }

  return (await response.json()) as { configured?: boolean; authenticated: boolean };
}

export default function AuthGate({ children }: AuthGateProps) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    requestSession()
      .then((session) => {
        if (!active) {
          return;
        }

        if (session.configured === false) {
          setAuthState("unconfigured");
          return;
        }

        setAuthState(session.authenticated ? "authenticated" : "login");
      })
      .catch(() => {
        if (active) {
          setAuthState("login");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const response = await fetch("/api/cam/login", {
      body: JSON.stringify({ username, password }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      setErrorMessage("Usuario o contraseña incorrectos.");
      return;
    }

    setAuthState("authenticated");
  }

  if (authState === "authenticated") {
    return <>{children}</>;
  }

  if (authState === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
        <p className="text-xl font-black text-white/60">Verificando acceso</p>
      </main>
    );
  }

  if (authState === "unconfigured") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
        <section className="w-full max-w-md rounded-lg border border-white/10 bg-slate-950 p-6 text-center">
          <h1 className="text-2xl font-black">Acceso no configurado</h1>
          <p className="mt-3 text-base font-bold text-white/60">
            Faltan CAM_USERNAME y CAM_PASSWORD en las variables de entorno.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
      <form
        className="w-full max-w-md rounded-lg border border-white/10 bg-slate-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onSubmit={handleSubmit}
      >
        <p className="text-sm font-black uppercase tracking-[0.22em] text-white/45">Crono</p>
        <h1 className="mt-3 text-3xl font-black">Acceso privado</h1>

        <label className="mt-6 block">
          <span className="text-sm font-black uppercase tracking-[0.18em] text-white/45">Usuario</span>
          <input
            autoComplete="username"
            className="mt-2 min-h-14 w-full rounded-lg border border-white/10 bg-black px-4 text-lg font-bold text-white outline-none focus:border-cyan-300"
            onChange={(event) => setUsername(event.target.value)}
            value={username}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-sm font-black uppercase tracking-[0.18em] text-white/45">Contraseña</span>
          <input
            autoComplete="current-password"
            className="mt-2 min-h-14 w-full rounded-lg border border-white/10 bg-black px-4 text-lg font-bold text-white outline-none focus:border-cyan-300"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>

        {errorMessage ? (
          <p className="mt-4 rounded-lg bg-rose-500/15 p-3 text-base font-bold text-rose-100">
            {errorMessage}
          </p>
        ) : null}

        <button
          className="mt-6 min-h-14 w-full rounded-lg bg-cyan-300 px-4 text-lg font-black text-slate-950 transition hover:bg-cyan-200 active:scale-[0.97]"
          type="submit"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
