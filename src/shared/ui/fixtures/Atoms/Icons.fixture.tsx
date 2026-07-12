import { Icon, MessageSquarePlusIcon, PlusIcon, SettingsIcon, TerminalIcon } from "@/shared/ui/icon";

export default <div className="flex items-center gap-5 text-primary">
  <Icon name="archive" aria-label="Archive" /><PlusIcon aria-label="Add" /><MessageSquarePlusIcon aria-label="New thread" /><SettingsIcon aria-label="Settings" /><TerminalIcon aria-label="Terminal" />
</div>;
