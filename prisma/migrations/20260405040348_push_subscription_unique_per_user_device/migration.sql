/*
  - Drop unique constraint on endpoint only
  - Add updatedAt column (default NOW() for existing rows)
  - Add composite unique constraint on [userId, endpoint]
*/

-- DropIndex
DROP INDEX `TB_M_PUSH_SUBSCRIPTION_endpoint_key` ON `tb_m_push_subscription`;

-- AlterTable: add updatedAt with default for existing rows, then remove default
ALTER TABLE `tb_m_push_subscription` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT NOW(3);

-- CreateIndex: composite unique per user per device
CREATE UNIQUE INDEX `TB_M_PUSH_SUBSCRIPTION_userId_endpoint_key` ON `TB_M_PUSH_SUBSCRIPTION`(`userId`, `endpoint`);
