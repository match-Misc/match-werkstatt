import { describe, it, expect } from 'vitest';
import { API_BASE, getWebSocketURL } from './apiConfig';

describe('apiConfig', () => {
  it('API_BASE should be empty string for relative URLs', () => {
    expect(API_BASE).toBe('');
  });

  it('getWebSocketURL should correctly format the websocket URL', () => {
    // jsdom defaults to http://localhost:3000
    const wsUrl = getWebSocketURL('/test-path');
    expect(wsUrl).toContain('ws://');
    expect(wsUrl).toContain('/test-path');
  });
});
