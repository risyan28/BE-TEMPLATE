/*
  Warnings:

  - You are about to drop the column `role` on the `tb_m_user` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `TB_M_POSITION` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `TB_M_POSITION` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: add code with temporary default, then populate, then make NOT NULL unique
ALTER TABLE `TB_M_POSITION` ADD COLUMN `code` VARCHAR(50) NOT NULL DEFAULT '';

-- Populate code from existing position names
UPDATE `TB_M_POSITION` SET `code` = 'ASSISTANCE'  WHERE `name` = 'Assistance';
UPDATE `TB_M_POSITION` SET `code` = 'SALES_PIC'   WHERE `name` = 'Sales PIC';
UPDATE `TB_M_POSITION` SET `code` = 'SALES_MANAGER' WHERE `name` = 'Manager';
UPDATE `TB_M_POSITION` SET `code` = 'ADMINISTRATOR' WHERE `name` = 'Administrator';

-- AlterTable
ALTER TABLE `tb_m_user` DROP COLUMN `role`;

-- CreateIndex
CREATE UNIQUE INDEX `TB_M_POSITION_code_key` ON `TB_M_POSITION`(`code`);
