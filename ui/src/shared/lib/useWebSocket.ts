import { useEffect, useRef, createContext, useContext, type ReactNode } from 'react';
import { createElement } from 'react';
import { triggerAuthFailure } from '@/shared/api/client.ts';

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

const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;

function createWsManager(): WsManager {
  const handlers = new Set<Handler>();
  let ws: WebSocket | null = null;
  let currentProjectId: string | null = null;
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout>;
  let reconnectDelay = RECONNECT_BASE_MS;

  function doConnect() {
    if (disposed || !currentProjectId) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/api/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[ws] connected to', url);
      reconnectDelay = RECONNECT_BASE_MS;
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
          try {
            // Try refresh — distinguish network errors from auth rejection
            const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
            if (disposed) return;
            if (res.ok) {
              doConnect();
              return;
            }
            // Server responded but rejected → real auth failure
            console.log('[ws] refresh rejected, auth failure');
            triggerAuthFailure();
          } catch {
            // Network error (server down) — retry with backoff
            if (disposed) return;
            console.log(`[ws] server unreachable, retry in ${reconnectDelay / 1000}s`);
            reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
            reconnectTimer = setTimeout(() => { if (!disposed) doConnect(); }, reconnectDelay);
          }
        }, reconnectDelay);
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
