import type { UiEvent } from '../../../../../shared/protocol'

/** A reference column, recorded as events rather than as finished blocks. */
export interface MockThread {
  events: UiEvent[]
  /** Row ids the reference draws already expanded.
   *
   *  Presentation only, and deliberately not an event: nothing a real agent
   *  reports says "start this open", and a live turn that opened every body
   *  would bury the column. It exists so the static shell still matches the
   *  reference pixel for pixel, and it retires with the mock catalog. */
  open?: string[]
}
