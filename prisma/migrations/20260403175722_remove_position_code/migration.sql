/*
  Warnings:

  - You are about to drop the column `code` on the `tb_m_position` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `TB_M_POSITION_code_key` ON `tb_m_position`;

-- AlterTable
ALTER TABLE `tb_m_position` DROP COLUMN `code`;
