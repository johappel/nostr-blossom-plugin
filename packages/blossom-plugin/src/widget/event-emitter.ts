/**
 * Lightweight typed event emitter for the Widget plugin API.
 *
 * Uses a `Map<string, Set<Function>>` internally.  Each `on()` call returns
 * an unsubscribe function for convenience.
 *
 * @example
 * ```ts
 * const ee = createEventEmitter<WidgetEventMap>();
 * const off = ee.on('signer-changed', (s) => console.log(s));
 * ee.emit('signer-changed', signer);
 * off(); // unsubscribe
 * ```
 */

export interface TypedEventEmitter<EventMap> {
  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof EventMap & string>(event: K, handler: (payload: EventMap[K]) => void): () => void;
  /** Unsubscribe a previously registered handler. */
  off<K extends keyof EventMap & string>(event: K, handler: (payload: EventMap[K]) => void): void;
  /** Emit an event to all registered handlers. */
  emit<K extends keyof EventMap & string>(event: K, payload: EventMap[K]): void;
  /** Remove all handlers for all events. */
  clear(): void;
}

/**
 * Create a new typed event emitter instance.
 */
export function createEventEmitter<EventMap>(): TypedEventEmitter<EventMap> {
  const listeners = new Map<string, Set<Function>>();

  function on<K extends keyof EventMap & string>(event: K, handler: (payload: EventMap[K]) => void): () => void {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler);
    return () => off(event, handler);
  }

  function off<K extends keyof EventMap & string>(event: K, handler: (payload: EventMap[K]) => void): void {
    const set = listeners.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) listeners.delete(event);
    }
  }

  function emit<K extends keyof EventMap & string>(event: K, payload: EventMap[K]): void {
    const set = listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[BlossomMedia] Error in event handler for "${event}":`, err);
      }
    }
  }

  function clear(): void {
    listeners.clear();
  }

  return { on, off, emit, clear };
}
