import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ws from '../../utils/websocket';

describe('websocket.ts', () => {
  let originalWebSocket: any;
  let mockSocketInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWebSocket = global.WebSocket;
    
    // Mock for WebSocket
    global.WebSocket = class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      url: string;
      readyState: number;
      onopen: any;
      onmessage: any;
      onclose: any;
      close: any;
      constructor(url: string) {
        mockSocketInstance = this;
        this.url = url;
        this.readyState = 1;
        this.close = vi.fn(() => {
          if (mockSocketInstance.onclose) mockSocketInstance.onclose();
        });
      }
    } as any;

    ws.disconnect(); // Ensure clean state
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    ws.disconnect();
    mockSocketInstance = null;
  });

  it('sollte eine Verbindung herstellen und den Socket initialisieren', () => {
    const callback = vi.fn();
    ws.connect('order-123', callback);
    
    expect(mockSocketInstance.url).toContain('/ws?orderId=order-123');
  });

  it('sollte eingehende Nachrichten korrekt parsen und Listener benachrichtigen', () => {
    const callback = vi.fn();
    ws.connect('order-123', callback);
    
    // Simulate incoming message
    mockSocketInstance.onmessage({ data: JSON.stringify({ type: 'UPDATE', payload: 'test' }) });
    
    expect(callback).toHaveBeenCalledWith({ type: 'UPDATE', payload: 'test' });
  });

  it('sollte den Catch-Block abdecken, wenn JSON.parse fehlschlägt', () => {
    const callback = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    ws.connect('order-123', callback);
    
    // Simulate incoming invalid JSON
    mockSocketInstance.onmessage({ data: 'invalid-json{[' });
    
    expect(callback).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('WebSocket payload parsing error:', expect.any(Error));
    
    consoleSpy.mockRestore();
  });

  it('sollte keine neue Verbindung aufbauen, wenn bereits eine OPEN-Verbindung existiert', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    
    ws.connect('order-123', callback1);
    const firstInstance = mockSocketInstance;
    
    ws.connect('order-123', callback2);
    expect(mockSocketInstance).toBe(firstInstance); // Instance hasn't changed
    
    // Simulate incoming message => beide Listener müssen gerufen werden
    mockSocketInstance.onmessage({ data: JSON.stringify({ ok: true }) });
    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });
});
