import { describe, it, expect } from 'vitest';
import { appReducer, initialState, AppState } from '../../context/AppContext';
import { Order } from '../../types';

describe('appReducer', () => {
  describe('ARCHIVE_ORDER', () => {
    it('sollte einen Auftrag NICHT archivieren, wenn Unteraufgaben nicht abgeschlossen sind', () => {
      const state: AppState = {
        ...initialState,
        orders: [
          {
            id: 'order-1',
            status: 'completed',
            confirmationDate: new Date().toISOString(),
            subTasks: [
              { id: 'st-1', status: 'in-progress' }
            ]
          } as unknown as Order
        ]
      };

      const newState = appReducer(state, { type: 'ARCHIVE_ORDER', payload: 'order-1' });
      expect(newState.orders[0].status).toBe('completed'); // Unverändert
    });

    it('sollte einen Auftrag NICHT archivieren, wenn die Endabnahme (confirmationDate) fehlt', () => {
      const state: AppState = {
        ...initialState,
        orders: [
          {
            id: 'order-1',
            status: 'completed',
            confirmationDate: undefined,
            subTasks: [
              { id: 'st-1', status: 'completed' }
            ]
          } as unknown as Order
        ]
      };

      const newState = appReducer(state, { type: 'ARCHIVE_ORDER', payload: 'order-1' });
      expect(newState.orders[0].status).toBe('completed'); // Unverändert
    });

    it('sollte einen Auftrag archivieren, wenn alle Bedingungen erfüllt sind', () => {
      const state: AppState = {
        ...initialState,
        orders: [
          {
            id: 'order-1',
            status: 'completed',
            confirmationDate: new Date().toISOString(),
            subTasks: [
              { id: 'st-1', status: 'completed' }
            ]
          } as unknown as Order
        ]
      };

      const newState = appReducer(state, { type: 'ARCHIVE_ORDER', payload: 'order-1' });
      expect(newState.orders[0].status).toBe('archived');
    });
  });

  describe('UPDATE_CURRENT_USER', () => {
    it('sollte Security Role-Updates aus dem WebSocket Payload durchführen', () => {
      const state: AppState = {
        ...initialState,
        currentUser: { id: 'u1', role: 'guest', username: 'test' } as any,
      };

      const newState = appReducer(state, { type: 'UPDATE_CURRENT_USER', payload: { role: 'admin' } });
      expect(newState.currentUser?.role).toBe('admin');
      expect(newState.currentUser?.username).toBe('test'); // Restliche Daten bleiben erhalten
    });
  });
});
