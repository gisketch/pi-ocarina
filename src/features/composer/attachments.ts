import { invoke } from "@tauri-apps/api/core";

export type Attachment = { path: string; name: string; size: number; kind: "image" | "file" };

export function prepareAttachments(paths: string[]) {
  return invoke<Attachment[]>("prepare_attachments", { paths });
}

export async function importAttachments(files: File[]) {
  return Promise.all(files.map(async (file) => invoke<Attachment>("import_attachment", {
    name: file.name,
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
  })));
}
