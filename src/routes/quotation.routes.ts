// src/routes/quotation.routes.ts
// ============================================================
// Quotation workflow routes
// Mount di app.ts: app.use('/api/quotations', quotationRouter)
// ============================================================
import { Router } from 'express'
import {
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  submitToManager,
  approveQuotation,
  rejectQuotation,
  resubmitQuotation,
  markQuotationSent,
  downloadQuotationPdf,
} from '@/controllers/quotation.controller'

const router = Router()

router.get('/', getQuotations) // GET  /api/quotations
router.get('/:id/export-pdf', downloadQuotationPdf) // GET  /api/quotations/:id/export-pdf (APPROVED only)
router.get('/:id', getQuotationById) // GET  /api/quotations/:id
router.post('/', createQuotation) // POST /api/quotations        (Assistance)
router.patch('/:id', updateQuotation) // PATCH /api/quotations/:id           (Assistance)
router.delete('/:id', deleteQuotation) // DELETE /api/quotations/:id          (Assistance)
router.patch('/:id/submit', submitToManager) // PATCH /api/quotations/:id/submit  (Sales PIC)
router.patch('/:id/approve', approveQuotation) // PATCH /api/quotations/:id/approve (Manager)
router.patch('/:id/reject', rejectQuotation) // PATCH /api/quotations/:id/reject  (Manager)
router.patch('/:id/resubmit', resubmitQuotation) // PATCH /api/quotations/:id/resubmit (Assistance)
router.patch('/:id/sent', markQuotationSent) // PATCH /api/quotations/:id/sent (Approved archive)

export { router as quotationRouter }
