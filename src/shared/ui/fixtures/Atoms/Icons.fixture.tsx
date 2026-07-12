import { Icon, MessageSquarePlusIcon, PlusIcon, SettingsIcon, TerminalIcon } from "@/shared/ui/icon";

export default <div className="grid gap-6 text-primary">
  <div className="flex items-center gap-5"><Icon name="archive" aria-label="Archive" /><PlusIcon aria-label="Add" /><MessageSquarePlusIcon aria-label="New thread" /><SettingsIcon aria-label="Settings" /><TerminalIcon aria-label="Terminal" /></div>
  <div className="flex items-center gap-5"><Icon glow name="archive" aria-label="Glowing archive" /><PlusIcon glow aria-label="Glowing add" /><MessageSquarePlusIcon glow aria-label="Glowing new thread" /><SettingsIcon glow aria-label="Glowing settings" /><TerminalIcon glow aria-label="Glowing terminal" /></div>
</div>;
