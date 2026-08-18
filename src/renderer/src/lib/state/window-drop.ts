/** A file dragged onto the window.
 *
 *  Held apart from the app shell because it is a complete idea with its own
 *  state: the depth counter exists because `dragenter` and `dragleave` fire for
 *  every element the pointer crosses, so a single boolean flickers the dropzone
 *  on and off as the file moves over the strip. */

import { attachments } from './attachments.svelte'

export interface WindowDrop {
  ondragenter: (event: DragEvent) => void
  ondragleave: () => void
  ondragover: (event: DragEvent) => void
  ondrop: (event: DragEvent) => void
}

export function windowDrop(): WindowDrop {
  let depth = 0

  return {
    ondragenter(event) {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      depth += 1
      attachments.dragging = true
    },
    ondragleave() {
      depth = Math.max(0, depth - 1)
      if (depth === 0) attachments.dragging = false
    },
    ondragover(event) {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    },
    ondrop(event) {
      event.preventDefault()
      depth = 0
      attachments.dragging = false
      attachments.add([...(event.dataTransfer?.files ?? [])])
    },
  }
}
