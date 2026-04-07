/*
  Warnings:

  - You are about to drop the column `code` on the `tb_m_customer` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `TB_M_CUSTOMER` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `TB_M_CUSTOMER_code_key` ON `tb_m_customer`;

-- AlterTable
ALTER TABLE `tb_m_customer` DROP COLUMN `code`;

-- CreateIndex
CREATE UNIQUE INDEX `TB_M_CUSTOMER_name_key` ON `TB_M_CUSTOMER`(`name`);
