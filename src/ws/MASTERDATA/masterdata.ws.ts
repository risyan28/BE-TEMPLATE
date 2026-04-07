// src/ws/MASTERDATA/masterdata.ws.ts
// ============================================================
// Push-based masterdata sync — no interval polling needed.
// Events are emitted directly from controllers via broadcastMasterdataUpdate().
//
// FE listens: socket.on('masterdata:update', ({ type }) => invalidate(type))
// ============================================================

export const masterdataWs = {
  start: async (_io: any, _room: string) => {
    return { stop: () => {} }
  },

  pollingLogic: async (_pool: any) => {
    return { invalidate: true }
  },
}
