/*
  Warnings:

  - The primary key for the `tb_h_notification_log` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `tb_h_notification_log` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `userId` on the `tb_h_notification_log` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `quotationId` on the `tb_h_notification_log` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `tb_m_customer` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `tb_m_customer` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `tb_m_position` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `tb_m_position` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `tb_m_push_subscription` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `tb_m_push_subscription` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `userId` on the `tb_m_push_subscription` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `tb_m_user` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `tb_m_user` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `positionId` on the `tb_m_user` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `tb_m_work_group` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `tb_m_work_group` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `assistanceId` on the `tb_m_work_group` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `salesPicId` on the `tb_m_work_group` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `managerId` on the `tb_m_work_group` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - The primary key for the `tb_r_quotation` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `tb_r_quotation` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `customerId` on the `tb_r_quotation` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `assistanceId` on the `tb_r_quotation` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `salesPicId` on the `tb_r_quotation` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - You are about to alter the column `managerId` on the `tb_r_quotation` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.

*/
-- DropForeignKey
ALTER TABLE `tb_h_notification_log` DROP FOREIGN KEY `TB_H_NOTIFICATION_LOG_quotationId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_h_notification_log` DROP FOREIGN KEY `TB_H_NOTIFICATION_LOG_userId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_m_push_subscription` DROP FOREIGN KEY `TB_M_PUSH_SUBSCRIPTION_userId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_m_user` DROP FOREIGN KEY `TB_M_USER_positionId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_m_work_group` DROP FOREIGN KEY `TB_M_WORK_GROUP_assistanceId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_m_work_group` DROP FOREIGN KEY `TB_M_WORK_GROUP_managerId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_m_work_group` DROP FOREIGN KEY `TB_M_WORK_GROUP_salesPicId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_r_quotation` DROP FOREIGN KEY `TB_R_QUOTATION_assistanceId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_r_quotation` DROP FOREIGN KEY `TB_R_QUOTATION_customerId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_r_quotation` DROP FOREIGN KEY `TB_R_QUOTATION_managerId_fkey`;

-- DropForeignKey
ALTER TABLE `tb_r_quotation` DROP FOREIGN KEY `TB_R_QUOTATION_salesPicId_fkey`;

-- DropIndex
DROP INDEX `TB_H_NOTIFICATION_LOG_quotationId_fkey` ON `tb_h_notification_log`;

-- DropIndex
DROP INDEX `TB_M_WORK_GROUP_managerId_fkey` ON `tb_m_work_group`;

-- DropIndex
DROP INDEX `TB_M_WORK_GROUP_salesPicId_fkey` ON `tb_m_work_group`;

-- DropIndex
DROP INDEX `TB_R_QUOTATION_assistanceId_fkey` ON `tb_r_quotation`;

-- DropIndex
DROP INDEX `TB_R_QUOTATION_managerId_fkey` ON `tb_r_quotation`;

-- DropIndex
DROP INDEX `TB_R_QUOTATION_salesPicId_fkey` ON `tb_r_quotation`;

-- AlterTable
ALTER TABLE `tb_h_notification_log` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `userId` INTEGER NOT NULL,
    MODIFY `quotationId` INTEGER NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `tb_m_customer` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `tb_m_position` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `tb_m_push_subscription` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `userId` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `tb_m_user` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `positionId` INTEGER NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `tb_m_work_group` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `assistanceId` INTEGER NOT NULL,
    MODIFY `salesPicId` INTEGER NOT NULL,
    MODIFY `managerId` INTEGER NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `tb_r_quotation` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `customerId` INTEGER NULL,
    MODIFY `assistanceId` INTEGER NOT NULL,
    MODIFY `salesPicId` INTEGER NOT NULL,
    MODIFY `managerId` INTEGER NULL,
    ADD PRIMARY KEY (`id`);

-- AddForeignKey
ALTER TABLE `TB_M_USER` ADD CONSTRAINT `TB_M_USER_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `TB_M_POSITION`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_M_WORK_GROUP` ADD CONSTRAINT `TB_M_WORK_GROUP_assistanceId_fkey` FOREIGN KEY (`assistanceId`) REFERENCES `TB_M_USER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_M_WORK_GROUP` ADD CONSTRAINT `TB_M_WORK_GROUP_salesPicId_fkey` FOREIGN KEY (`salesPicId`) REFERENCES `TB_M_USER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_M_WORK_GROUP` ADD CONSTRAINT `TB_M_WORK_GROUP_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `TB_M_USER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_M_PUSH_SUBSCRIPTION` ADD CONSTRAINT `TB_M_PUSH_SUBSCRIPTION_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `TB_M_USER`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_H_NOTIFICATION_LOG` ADD CONSTRAINT `TB_H_NOTIFICATION_LOG_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `TB_M_USER`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_H_NOTIFICATION_LOG` ADD CONSTRAINT `TB_H_NOTIFICATION_LOG_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `TB_R_QUOTATION`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_R_QUOTATION` ADD CONSTRAINT `TB_R_QUOTATION_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `TB_M_CUSTOMER`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_R_QUOTATION` ADD CONSTRAINT `TB_R_QUOTATION_assistanceId_fkey` FOREIGN KEY (`assistanceId`) REFERENCES `TB_M_USER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_R_QUOTATION` ADD CONSTRAINT `TB_R_QUOTATION_salesPicId_fkey` FOREIGN KEY (`salesPicId`) REFERENCES `TB_M_USER`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TB_R_QUOTATION` ADD CONSTRAINT `TB_R_QUOTATION_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `TB_M_USER`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
