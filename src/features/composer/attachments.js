// @ts-check
import { invoke } from "@tauri-apps/api/core";

/** @typedef {{ path: string, name: string, size: number, kind: "image" | "file" }} Attachment */

/** @param {string[]} paths @returns {Promise<Attachment[]>} */
export function prepareAttachments(paths) {
  return invoke("prepare_attachments", { paths });
}

/** @param {File[]} files @returns {Promise<Attachment[]>} */
export async function importAttachments(files) {
  return Promise.all(files.map(async (file) => invoke("import_attachment", {
    name: file.name,
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
  })));
}
