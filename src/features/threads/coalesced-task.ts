/**
 * Coalesces replaceable work and serializes durable writes. `flush` is the
 * safety boundary used before navigation, submission, and shutdown.
 * @template T
 * @param {(value: T) => void | Promise<void>} run
 * @param {number} delay
 */
export function createCoalescedTask<T>(run: (value: T) => void | Promise<void>, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: T | undefined;
  let hasPending = false;
  let inFlight = Promise.resolve();

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!hasPending) return inFlight;
    const value = pending as T;
    pending = undefined;
    hasPending = false;
    inFlight = inFlight.catch(() => {}).then(() => run(value));
    return inFlight;
  };

  return {
    schedule(value: T) {
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
