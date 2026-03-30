import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from 'react';
import { createElement } from 'react';
import { triggerAuthFailure } from '@/shared/api/client.ts';

export interface WsEvent {
  projectId: string;
  type: string;
  data: unknown;
}

type Handler = (event: WsEvent) => void;

// --- Connection status ---

export type WsConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
type StatusHandler = (status: WsConnectionStatus) => void;

// --- Shared singleton WS manager ---

interface WsManager {
  subscribe: (handler: Handler) => () => void;
  connect: (projectId: string) => void;
  disconnect: () => void;
  getStatus: () => WsConnectionStatus;
  onStatusChange: (handler: StatusHandler) => () => void;
}

const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;

function createWsManager(): WsManager {
  const handlers = new Set<Handler>();
  const statusHandlers = new Set<StatusHandler>();
  let ws: WebSocket | null = null;
  let currentProjectId: string | null = null;
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout>;
  let reconnectDelay = RECONNECT_BASE_MS;
  let status: WsConnectionStatus = 'disconnected';

  function setStatus(next: WsConnectionStatus) {
    if (next !== status) {
      status = next;
      for (const h of statusHandlers) h(next);
    }
  }

  function doConnect() {
    if (disposed || !currentProjectId) return;
    setStatus('connecting');
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/api/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectDelay = RECONNECT_BASE_MS;
      setStatus('connected');
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

    ws.onclose = () => {
      if (!disposed && currentProjectId) {
        setStatus('reconnecting');
        reconnectTimer = setTimeout(async () => {
          if (disposed) return;
          try {
            // Check if auth is required before trying refresh
            const statusRes = await fetch('/api/auth/status', { credentials: 'include' });
            if (disposed) return;
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (!statusData.required || statusData.authenticated) {
                // Auth not needed or already valid — just reconnect
                doConnect();
                return;
              }
              // Auth required but not authenticated — try refresh
              const refreshRes = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
              if (disposed) return;
              if (refreshRes.ok) {
                doConnect();
                return;
              }
              // Refresh failed — auth truly expired
              setStatus('disconnected');
              triggerAuthFailure();
            } else {
              // Server returned error for status check — retry with backoff
              reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
              reconnectTimer = setTimeout(() => { if (!disposed) doConnect(); }, reconnectDelay);
            }
          } catch {
            if (disposed) return;
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
      setStatus('disconnected');
    },
    getStatus() {
      return status;
    },
    onStatusChange(handler: StatusHandler) {
      statusHandlers.add(handler);
      handler(status);
      return () => { statusHandlers.delete(handler); };
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

// --- Hook for connection status ---

export function useWsStatus(): WsConnectionStatus {
  const manager = useContext(WsContext);
  const [s, setS] = useState<WsConnectionStatus>(() => manager.getStatus());

  useEffect(() => manager.onStatusChange(setS), [manager]);

  return s;
}
