// src/ws/QUOTATIONS/quotations.ws.ts
// ============================================================
// Push-based quotation sync — NO interval polling needed.
// Real-time updates are emitted directly from the quotation controller
// via getIO().to('quotations').emit('quotations:update', ...).
//
// This module only provides:
//   start()        → no-op (no interval timer)
//   pollingLogic() → returns { invalidate: true } as initial snapshot trigger
//                    FE re-fetches from API (which applies per-user filtering)
// ============================================================

export const quotationsWs = {
  /**
   * Called when the first subscriber joins the 'quotations' room.
   * No interval timer needed — mutations push events directly.
   */
  start: async (_io: any, _room: string) => {
    return { stop: () => {} }
  },

  /**
   * Called for each new subscriber to send an initial "something changed, refetch" signal.
   * Pool arg is intentionally ignored — we use Prisma (MySQL), not MSSQL.
   * FE will invalidate React Query cache and re-fetch from API with its auth token,
   * which applies the correct per-user filter.
   */
  pollingLogic: async (_pool: any) => {
    return { invalidate: true }
  },
}
