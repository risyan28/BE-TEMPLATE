import { Router } from 'express'
import { itemController } from '@/modules/item/item.controller'
import { asyncHandler } from '@/shared/middleware/errorHandler'

const router = Router()

/**
 * @openapi
 * /api/items:
 *   get:
 *     tags: [Items]
 *     summary: List all items
 *     responses:
 *       200:
 *         description: Array of items
 */
router.get('/', asyncHandler(itemController.getAll))

/**
 * @openapi
 * /api/items/{id}:
 *   get:
 *     tags: [Items]
 *     summary: Get item by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Item details
 *       404:
 *         description: Not found
 */
router.get('/:id', asyncHandler(itemController.getById))

/**
 * @openapi
 * /api/items:
 *   post:
 *     tags: [Items]
 *     summary: Create a new item
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/', asyncHandler(itemController.create))

/**
 * @openapi
 * /api/items/{id}:
 *   patch:
 *     tags: [Items]
 *     summary: Update an item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated
 */
router.patch('/:id', asyncHandler(itemController.update))

/**
 * @openapi
 * /api/items/{id}:
 *   delete:
 *     tags: [Items]
 *     summary: Delete an item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */
router.delete('/:id', asyncHandler(itemController.remove))

export { router as itemRouter }
