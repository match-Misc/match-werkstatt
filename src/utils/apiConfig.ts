// API-Konfiguration: Dynamische Base-URL für Docker/Localhost
// Im Produktionsbetrieb (Docker/nginx) werden relative URLs verwendet,
// da nginx als Reverse-Proxy fungiert.

// HTTP-API Base URL (leer = relative URLs, d.h. über nginx-Proxy)
export const API_BASE = '';

// WebSocket-URL dynamisch aus dem aktuellen Host ableiten
export function getWebSocketURL(path = ''): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}
