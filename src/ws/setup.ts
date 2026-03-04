// src/ws/setup.ts
// ============================================================
// Daftarkan semua WebSocket polling module di sini
// Setiap entry = 1 "topic" yang bisa di-subscribe FE
//
// FE pakai: socket.emit('subscribe', 'items')
// FE dengar: socket.on('items:update', (data) => { ... })
// ============================================================
import { Server } from 'http'
import { initConnectionHandler } from './connectionHandler'
import { itemPolling } from './ITEMS/itemPolling.ws'

export function setupWebSocket(httpServer: Server) {
  initConnectionHandler(httpServer, [
    // ── Daftar topic WebSocket ────────────────────────────────
    {
      name: 'items', // topic name  → socket.emit('subscribe', 'items')
      module: itemPolling,
      eventName: 'items:update', // event name  → socket.on('items:update', ...)
    },

    // ✅ TAMBAH TOPIC BARU DI SINI:
    // {
    //   name: 'orders',
    //   module: orderPolling,
    //   eventName: 'orders:update',
    // },
  ])
}
