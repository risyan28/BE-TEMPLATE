// src/ws/setup.ts
// ============================================================
// Daftarkan semua WebSocket polling module di sini
// Setiap entry = 1 "topic" yang bisa di-subscribe FE
//
// FE pakai: socket.emit('subscribe', 'topicName')
// FE dengar: socket.on('topicName:update', (data) => { ... })
//
// ✅ TAMBAH TOPIC BARU DI SINI:
// import { myPolling } from './MY_TABLE/myPolling.ws'
// { name: 'myTopic', module: myPolling, eventName: 'myTopic:update' }
// ============================================================
import { Server } from 'http'
import { initConnectionHandler } from './connectionHandler'
import { quotationsWs } from './QUOTATIONS/quotations.ws'
import { masterdataWs } from './MASTERDATA/masterdata.ws'

export function setupWebSocket(httpServer: Server) {
  initConnectionHandler(httpServer, [
    // Quotation real-time sync (push-based — emitted from controller on each mutation)
    {
      name: 'quotations',
      module: quotationsWs,
      eventName: 'quotations:update',
    },
    // Master-data real-time sync: users, customers, positions, workgroups
    {
      name: 'masterdata',
      module: masterdataWs,
      eventName: 'masterdata:update',
    },
  ])
}
