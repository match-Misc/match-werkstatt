// WebSocket utility for the app
// Usage: import ws from '../utils/websocket';
// ws.connect(orderId, onMessage)

let socket: WebSocket | null = null;
let listeners: Array<(data: any) => void> = [];

const WS_URL = 'ws://localhost:3001/ws'; // Passe ggf. die URL an dein Backend an

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
      const data = JSON.parse(event.data);
      listeners.forEach((cb) => cb(data));
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
