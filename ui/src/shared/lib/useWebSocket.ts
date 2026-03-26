import { useEffect, useRef, createContext, useContext, type ReactNode } from 'react';
import { createElement } from 'react';
import { tryRefresh } from '@/shared/api/client.ts';

export interface WsEvent {
  projectId: string;
  type: string;
  data: unknown;
}

type Handler = (event: WsEvent) => void;

// --- Shared singleton WS manager ---

interface WsManager {
  subscribe: (handler: Handler) => () => void;
  connect: (projectId: string) => void;
  disconnect: () => void;
}

let _wsAuthFailure: (() => void) | null = null;

/** Register a callback for when WebSocket auth fails (refresh exhausted). */
export function onWsAuthFailure(cb: () => void) { _wsAuthFailure = cb; }

function createWsManager(): WsManager {
  const handlers = new Set<Handler>();
  let ws: WebSocket | null = null;
  let currentProjectId: string | null = null;
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout>;

  function doConnect() {
    if (disposed || !currentProjectId) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/api/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[ws] connected to', url);
    };

    ws.onmessage = (e) => {
      try {
        const event: WsEvent = JSON.parse(e.data);
        if (event.projectId === currentProjectId) {
          for (const h of handlers) h(event);
        }
      } catch { /* ignore malformed */ }
    };

    ws.onerror = () => {};

    ws.onclose = (e) => {
      console.log('[ws] closed, code:', e.code, 'reason:', e.reason);
      if (!disposed && currentProjectId) {
        reconnectTimer = setTimeout(async () => {
          if (disposed) return;
          const refreshed = await tryRefresh();
          if (disposed) return;
          if (refreshed) {
            doConnect();
          } else {
            console.log('[ws] refresh failed, stopping reconnect');
            if (_wsAuthFailure) _wsAuthFailure();
          }
        }, 3000);
      }
    };
  }

  return {
    subscribe(handler: Handler) {
      handlers.add(handler);
      return () => { handlers.delete(handler); };
    },
    connect(projectId: string) {
      if (currentProjectId === projectId && ws && ws.readyState <= WebSocket.OPEN) return;
      // New project or no connection
      disposed = false;
      clearTimeout(reconnectTimer);
      if (ws && ws.readyState <= WebSocket.OPEN) {
        ws.close();
      }
      currentProjectId = projectId;
      doConnect();
    },
    disconnect() {
      disposed = true;
      currentProjectId = null;
      clearTimeout(reconnectTimer);
      if (ws && ws.readyState <= WebSocket.OPEN) {
        ws.close();
      }
    },
  };
}

const wsManager = createWsManager();

// --- Context for providing connection lifecycle from Layout ---

const WsContext = createContext<WsManager>(wsManager);

export function WsProvider({ projectId, children }: { projectId: string | null; children: ReactNode }) {
  useEffect(() => {
    if (projectId) {
      wsManager.connect(projectId);
    }
    return () => { wsManager.disconnect(); };
  }, [projectId]);

  return createElement(WsContext.Provider, { value: wsManager }, children);
}

// --- Hook for pages to subscribe to events ---

export function useWebSocket(projectId: string | null, handler: Handler) {
  const manager = useContext(WsContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!projectId) return;
    const unsubscribe = manager.subscribe((event) => {
      handlerRef.current(event);
    });
    return unsubscribe;
  }, [projectId, manager]);
}
