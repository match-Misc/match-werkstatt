// WebSocket utility for the app
// Usage: import ws from '../utils/websocket';
// ws.connect(orderId, onMessage)

let socket: WebSocket | null = null;
let listeners: Array<(data: any) => void> = [];

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

const ws = {
  connect(orderId: string, onMessage: (data: any) => void) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      listeners.push(onMessage);
      return;
    }
    socket = new WebSocket(`${WS_URL}?orderId=${orderId}`);
    socket.onopen = () => {
      // Verbindung steht
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        listeners.forEach((cb) => cb(data));
      } catch (error) {
        console.error('WebSocket payload parsing error:', error);
      }
    };
    socket.onclose = () => {
      socket = null;
      listeners = [];
    };
    listeners.push(onMessage);
  },
  disconnect() {
    if (socket) {
      socket.close();
      socket = null;
      listeners = [];
    }
  }
};

export default ws;
