export type DocumentOpenSource = "picker" | "native" | "recent";
export type DocumentOpenOutcome =
  | "opened"
  | "current"
  | "cancelled"
  | "failed"
  | "busy";

export type AppEventMap = {
  "document-committed": {
    kind: "open" | "reload";
    previousPath: string | null;
    path: string;
  };
  "document-open-settled": {
    source: DocumentOpenSource;
    outcome: DocumentOpenOutcome;
  };
  "external-notice-will-show": undefined;
  "external-notice-dismissed": undefined;
  "recent-sidebar-opened": undefined;
};

type AppEventListener<K extends keyof AppEventMap> = (
  payload: AppEventMap[K],
) => void;

export type AppEventChannel = {
  emit<K extends keyof AppEventMap>(
    eventName: K,
    payload: AppEventMap[K],
  ): void;
  subscribe<K extends keyof AppEventMap>(
    eventName: K,
    listener: AppEventListener<K>,
  ): () => void;
};

export function createAppEventChannel(): AppEventChannel {
  const listeners = new Map<
    keyof AppEventMap,
    Set<(payload: AppEventMap[keyof AppEventMap]) => void>
  >();

  return {
    emit(eventName, payload) {
      const eventListeners = listeners.get(eventName);

      if (!eventListeners) {
        return;
      }

      for (const listener of eventListeners) {
        try {
          listener(payload);
        } catch (error) {
          console.error(`Aster event listener failed: ${eventName}`, error);
        }
      }
    },
    subscribe(eventName, listener) {
      const eventListeners =
        listeners.get(eventName) ??
        new Set<(payload: AppEventMap[keyof AppEventMap]) => void>();
      const typedListener = listener as (
        payload: AppEventMap[keyof AppEventMap],
      ) => void;
      eventListeners.add(typedListener);
      listeners.set(eventName, eventListeners);

      return () => {
        eventListeners.delete(typedListener);
        if (eventListeners.size === 0) {
          listeners.delete(eventName);
        }
      };
    },
  };
}
