export function App() {
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
      </section>
    </main>
  );
}
