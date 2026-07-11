// @ts-check

/**
 * Coalesces replaceable work and serializes durable writes. `flush` is the
 * safety boundary used before navigation, submission, and shutdown.
 * @template T
 * @param {(value: T) => void | Promise<void>} run
 * @param {number} delay
 */
export function createCoalescedTask(run, delay) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {T | undefined} */
  let pending;
  let hasPending = false;
  let inFlight = Promise.resolve();

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!hasPending) return inFlight;
    const value = /** @type {T} */ (pending);
    pending = undefined;
    hasPending = false;
    inFlight = inFlight.catch(() => {}).then(() => run(value));
    return inFlight;
  };

  return {
    /** @param {T} value */
    schedule(value) {
      pending = value;
      hasPending = true;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), delay);
    },
    flush,
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      pending = undefined;
      hasPending = false;
    },
    pending() { return hasPending; },
  };
}
