import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

export default <div className="grid max-w-md gap-4">
  <label className="grid gap-1 text-sm">Name<Input placeholder="Workspace name" /></label>
  <label className="grid gap-1 text-sm">Message<Textarea placeholder="Ask Pi anything…" /></label>
  <Input aria-invalid defaultValue="Invalid value" />
</div>;
