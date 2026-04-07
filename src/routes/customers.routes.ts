// src/routes/customers.routes.ts
import { Router } from 'express'
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '@/controllers/customers.controller'

const router = Router()

router.get('/', listCustomers) // GET  /api/customers
router.get('/:id', getCustomer) // GET  /api/customers/:id
router.post('/', createCustomer) // POST /api/customers
router.patch('/:id', updateCustomer) // PATCH /api/customers/:id
router.delete('/:id', deleteCustomer) // DELETE /api/customers/:id

export { router as customersRouter }
