import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export function App() {
  const [runtime, setRuntime] = useState("Starting bundled Pi…");

  useEffect(() => {
    const requestId = crypto.randomUUID();
    let unlisten = () => {};
    void listen("agent-host-event", ({ payload }) => {
      if (payload.requestId !== requestId || payload.type === "started") return;
      setRuntime(payload.type === "completed" ? "Bundled Pi ready" : payload.payload.message);
    }).then(async (stopListening) => {
      unlisten = stopListening;
      try {
        await invoke("start_agent_host");
        await invoke("send_agent_request", {
          request: { version: 1, requestId, operation: "createSession", payload: {} },
        });
      } catch (error) {
        setRuntime(String(error));
      }
    });
    return () => unlisten();
  }, []);

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100"
      data-testid="app-ready"
    >
      <section className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl shadow-black/30">
        <p className="text-xs font-semibold tracking-[0.24em] text-emerald-400 uppercase">
          Desktop foundation ready
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Pi Ocarina</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-zinc-400">
          A maintainable Tauri home for the Pi coding agent.
        </p>
        <p className="mt-4 text-xs text-zinc-500" data-testid="runtime-status">{runtime}</p>
      </section>
    </main>
  );
}
