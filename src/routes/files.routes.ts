// src/routes/files.routes.ts
// ============================================================
// File upload & serving routes
// Mount di app.ts: app.use('/api/files', authenticate, filesRouter)
// ============================================================
import { Router } from 'express'
import {
  upload,
  uploadFiles,
  serveFile,
  serveFileLegacy,
  uploadSignature,
  uploadUserSignature,
  serveSignature,
  getUserSignatureInfo,
} from '@/controllers/files.controller'

const router = Router()

// Quotation file uploads
router.post('/', upload.array('files', 20), uploadFiles) // POST /api/files?date=YYYY-MM-DD
router.get('/:date/:fileId', serveFile) // GET  /api/files/YYYY-MM-DD/:fileId
router.get('/:fileId', serveFileLegacy) // GET  /api/files/:fileId (legacy)

// User signature uploads
router.post('/signatures/upload', uploadSignature, uploadUserSignature) // POST /api/files/signatures/upload
router.get('/signatures/:filename', serveSignature) // GET  /api/files/signatures/:filename
router.get('/users/:userId/signature', getUserSignatureInfo) // GET  /api/files/users/:userId/signature

export { router as filesRouter }
