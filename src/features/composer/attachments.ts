import { invokeTauri } from "@/shared/lib/tauri-client";

export type Attachment = { path: string; name: string; size: number; kind: "image" | "file" };

export function prepareAttachments(paths: string[]) {
  return invokeTauri("prepare_attachments", { paths });
}

export async function importAttachments(files: File[]) {
  return Promise.all(files.map(async (file) => invokeTauri("import_attachment", {
    name: file.name,
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
  })));
}
