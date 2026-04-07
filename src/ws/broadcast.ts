// src/ws/broadcast.ts
// ============================================================
// Centralized Socket.IO broadcast helpers.
// Called from controllers after any DB mutation so every
// subscribed client knows to re-fetch fresh data from the API.
//
// Two rooms are used:
//   'quotations'  — emits 'quotations:update'
//   'masterdata'  — emits 'masterdata:update' with a { type } tag
//                   so the FE only invalidates the affected query
// ============================================================
import { getIO } from './connectionHandler'

/**
 * Broadcast after any Quotation mutation (create / update / status change / delete).
 * All subscribers of the 'quotations' room will invalidate their cache and refetch.
 */
export function broadcastQuotationUpdate(): void {
  try {
    getIO().to('quotations').emit('quotations:update', { invalidate: true })
  } catch {
    // Socket not yet initialized during startup — safe to ignore
  }
}

/**
 * Broadcast after any master-data mutation.
 * The FE uses `type` to invalidate only the affected query key.
 *
 * @param type - Matches the React Query queryKey prefix used in the FE hook
 *   'customers' | 'users' | 'positions' | 'workgroups'
 */
export function broadcastMasterdataUpdate(
  type: 'customers' | 'users' | 'positions' | 'workgroups',
): void {
  try {
    getIO().to('masterdata').emit('masterdata:update', { type })
  } catch {
    // Socket not yet initialized during startup — safe to ignore
  }
}
