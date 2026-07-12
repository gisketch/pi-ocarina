import { Button } from "@/shared/ui/button";
import { PlusIcon } from "@/shared/ui/icon";

export default <div className="flex flex-wrap items-center gap-3">
  <Button>Default</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="destructive">Destructive</Button>
  <Button disabled>Disabled</Button><Button size="icon" aria-label="Add"><PlusIcon /></Button>
</div>;
