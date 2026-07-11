import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Maximize2Icon, PlusIcon, TerminalIcon, XIcon } from "@/shared/ui/icon";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { invokeTauri, listenTauri } from "@/shared/lib/tauri-client";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

/** @typedef {{ id: string, title: string }} Tab */
/** @typedef {{ terminal: Terminal, fit: FitAddon, opened: boolean }} TerminalEntry */

/** @param {{ workspaceId: string }} props */
type Tab = { id: string; title: string };
type TerminalEntry = { terminal: Terminal; fit: FitAddon; opened: boolean };

export function TerminalPanel({ workspaceId }: { workspaceId: string }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState("");
  const [visible, setVisible] = useState(false);
  const [shell, setShell] = useState("");
  const [error, setError] = useState("");
  const [height, setHeight] = useState(256);
  const [maximized, setMaximized] = useState(false);
  const terminals = useRef(new Map<string, TerminalEntry>());

  useEffect(() => {
    void invokeTauri("app_state_snapshot").then(({ state }) => { setShell(state.preferences.terminal_shell || ""); setHeight(state.preferences.terminal_height || 256); setMaximized(Boolean(state.preferences.terminal_maximized)); });
    const listeners = Promise.all([
      listenTauri("terminal://output", ({ payload }) => terminals.current.get(payload.terminalId)?.terminal.write(payload.data)),
      listenTauri("terminal://error", ({ payload }) => setError(payload.message)),
      listenTauri("terminal://closed", ({ payload }) => terminals.current.get(payload.terminalId)?.terminal.write("\r\n[process exited]\r\n")),
    ]);
    const current = terminals.current;
    return () => {
      void listeners.then((stops) => stops.forEach((stop) => stop()));
      for (const [id, entry] of current) {
        void invokeTauri("close_terminal", { terminalId: id }).catch(() => {});
        entry.terminal.dispose();
      }
    };
  }, []);

  useEffect(() => {
    if (!visible || !active) return;
    const entry = terminals.current.get(active);
    entry?.fit.fit();
    entry?.terminal.focus();
  }, [active, visible]);

  async function addTab() {
    try {
      const terminal = new Terminal({ convertEol: true, cursorBlink: true, theme: { background: "#00000000" } });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      const id = await invokeTauri("open_terminal", { workspaceId, cols: 80, rows: 24 });
      terminals.current.set(id, { terminal, fit, opened: false });
      const next = { id, title: `Terminal ${tabs.length + 1}` };
      setTabs((items) => [...items, next]);
      setActive(id);
      setVisible(true);
      setError("");
    } catch (cause) {
      setError(String(cause));
    }
  }

  /** @param {string} id */
  async function closeTab(id: string) {
    await invokeTauri("close_terminal", { terminalId: id }).catch(() => {});
    terminals.current.get(id)?.terminal.dispose();
    terminals.current.delete(id);
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    setActive((current) => current === id ? remaining.at(-1)?.id || "" : current);
  }

  /** @param {string} id @param {HTMLDivElement | null} node */
  function attachTerminal(id: string, node: HTMLDivElement | null) {
    const entry = terminals.current.get(id);
    if (!node || !entry || entry.opened) return;
    entry.opened = true;
    entry.terminal.open(node);
    entry.fit.fit();
    entry.terminal.onData((data) => void invokeTauri("write_terminal", { terminalId: id, data }).catch((cause) => setError(String(cause))));
    entry.terminal.onResize(({ cols, rows }) => void invokeTauri("resize_terminal", { terminalId: id, cols, rows }));
  }

  async function saveShell() {
    try {
      await invokeTauri("set_terminal_shell", { shell });
      setError("");
    } catch (cause) {
      setError(String(cause));
    }
  }

  /** @param {number} next */
  function resizePanel(next: number) {
    const bounded = Math.max(160, Math.min(900, next));
    setHeight(bounded);
    void invokeTauri("set_panel_layout", { terminalHeight: bounded });
    requestAnimationFrame(() => terminals.current.get(active)?.fit.fit());
  }

  function toggleMaximized() {
    const next = !maximized;
    setMaximized(next);
    void invokeTauri("set_panel_layout", { terminalMaximized: next });
  }

  return (
    <section className="mt-4 border-t pt-3" aria-label="Integrated terminal">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setVisible((value) => !value)}>
          <TerminalIcon />{visible ? "Hide terminal" : "Show terminal"}
        </Button>
        <Button size="sm" variant="outline" onClick={addTab}><PlusIcon />New terminal</Button>
        <Button aria-label="Decrease terminal height" size="sm" variant="ghost" onClick={() => resizePanel(height - 80)}>−</Button>
        <Button aria-label="Increase terminal height" size="sm" variant="ghost" onClick={() => resizePanel(height + 80)}>+</Button>
        <Button size="sm" variant="ghost" onClick={toggleMaximized}><Maximize2Icon />{maximized ? "Restore" : "Maximize"}</Button>
        <Input type="text" className="h-8 min-w-40 flex-1" aria-label="Shell path" placeholder="Default login shell" value={shell} onChange={(event: ChangeEvent<HTMLInputElement>) => setShell(event.target.value)} />
        <Button size="sm" variant="outline" onClick={saveShell} disabled={!shell}>Save shell</Button>
      </div>
      <div className={visible ? "mt-2" : "hidden"}>
        <div className="flex gap-1 overflow-x-auto border-b pb-1">
          {tabs.map((tab) => (
            <div className="flex items-center" key={tab.id}>
              <Button size="sm" variant={active === tab.id ? "secondary" : "ghost"} onClick={() => setActive(tab.id)}>{tab.title}</Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Close ${tab.title}`} onClick={() => void closeTab(tab.id)}><XIcon /></Button>
            </div>
          ))}
          {active && <Button size="icon-sm" variant="ghost" aria-label="Focus terminal" onClick={() => terminals.current.get(active)?.terminal.focus()}><Maximize2Icon /></Button>}
        </div>
        {tabs.length === 0 && <p className="py-4 text-sm text-muted-foreground">Open a terminal for this workspace.</p>}
        {tabs.map((tab) => <div key={tab.id} ref={(node) => attachTerminal(tab.id, node)} style={{ height: maximized ? "min(70vh, 900px)" : `${height}px` }} className={active === tab.id ? "min-h-40 overflow-hidden rounded-md bg-terminal p-2" : "hidden"} />)}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
