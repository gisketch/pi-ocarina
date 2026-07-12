import type { CSSProperties } from "react";
import { PROJECT_COLORS } from "@/features/appearance/project-color";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

export default function ProjectColorsFixture() {
  return <div className="grid gap-3 p-4 sm:grid-cols-2">
    {PROJECT_COLORS.map((color) => <section className="pb-main-surface rounded-md border p-4" key={color.name} style={{ "--pb-primary": color.primary, "--pb-primary-foreground": color.foreground } as CSSProperties}>
      <h2 className="mb-3 font-heading capitalize text-primary">{color.name}</h2>
      <div className="pb-chat-message pb-chat-message-user mb-3"><p>Project-colored message</p></div>
      <div className="pb-composer flex items-center gap-2 rounded-md"><textarea className="min-w-0 flex-1" aria-label={`${color.name} composer`} defaultValue="Ready to send" /><Button size="icon-sm" aria-label={`Send ${color.name} message`}><Icon name="send" /></Button></div>
    </section>)}
  </div>;
}
