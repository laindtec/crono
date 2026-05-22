export type CamRole = "publisher" | "viewer";

export type SignalMessage = {
  from: string;
  type: string;
  payload: unknown;
};

export const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
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

export async function registerCamClient(role: CamRole) {
  return apiRequest<{
    clientId: string;
    publisherId: string | null;
    publisherAvailable: boolean;
  }>("/api/cam/clients", {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export function sendCamSignal(from: string, to: string, type: string, payload: unknown) {
  return apiRequest<{ ok: true }>("/api/cam/signals", {
    method: "POST",
    body: JSON.stringify({ from, to, type, payload }),
  });
}

export async function pollCamSignals(
  clientId: string,
  isActive: () => boolean,
  onMessages: (messages: SignalMessage[], publisherId: string | null) => Promise<void>,
  onError: (error: unknown) => void,
) {
  while (isActive()) {
    try {
      const result = await apiRequest<{ messages: SignalMessage[]; publisherId: string | null }>(
        `/api/cam/signals?clientId=${encodeURIComponent(clientId)}`,
      );

      if (result.messages.length > 0 || result.publisherId) {
        await onMessages(result.messages, result.publisherId);
      }
    } catch (error) {
      if (isActive()) {
        onError(error);
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    }
  }
}

export function unregisterCamClient(clientId: string) {
  return fetch(`/api/cam/clients/${encodeURIComponent(clientId)}`, {
    credentials: "same-origin",
    method: "DELETE",
  });
}
