/*
  Warnings:

  - You are about to drop the `notificationlog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `pushsubscription` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `quotation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `workgroup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `notificationlog` DROP FOREIGN KEY `NotificationLog_quotationId_fkey`;

-- DropForeignKey
ALTER TABLE `notificationlog` DROP FOREIGN KEY `NotificationLog_userId_fkey`;

-- DropForeignKey
ALTER TABLE `pushsubscription` DROP FOREIGN KEY `PushSubscription_userId_fkey`;

-- DropForeignKey
ALTER TABLE `quotation` DROP FOREIGN KEY `Quotation_assistanceId_fkey`;

-- DropForeignKey
ALTER TABLE `quotation` DROP FOREIGN KEY `Quotation_customerId_fkey`;

-- DropForeignKey
ALTER TABLE `quotation` DROP FOREIGN KEY `Quotation_managerId_fkey`;

-- DropForeignKey
ALTER TABLE `quotation` DROP FOREIGN KEY `Quotation_salesPicId_fkey`;

-- DropForeignKey
ALTER TABLE `workgroup` DROP FOREIGN KEY `WorkGroup_assistanceId_fkey`;

-- DropForeignKey
ALTER TABLE `workgroup` DROP FOREIGN KEY `WorkGroup_managerId_fkey`;

-- DropForeignKey
ALTER TABLE `workgroup` DROP FOREIGN KEY `WorkGroup_salesPicId_fkey`;

-- DropTable
DROP TABLE `notificationlog`;

-- DropTable
DROP TABLE `pushsubscription`;

-- DropTable
DROP TABLE `quotation`;

-- DropTable
DROP TABLE `user`;

-- DropTable
DROP TABLE `workgroup`;

-- CreateTable
CREATE TABLE `TB_M_USER` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ASSISTANCE', 'SALES_PIC', 'SALES_MANAGER', 'ADMIN') NOT NULL DEFAULT 'ASSISTANCE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TB_M_USER_username_key`(`username`),
    UNIQUE INDEX `TB_M_USER_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TB_M_WORK_GROUP` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `assistanceId` VARCHAR(191) NOT NULL,
    `salesPicId` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `TB_M_WORK_GROUP_assistanceId_salesPicId_managerId_key`(`assistanceId`, `salesPicId`, `managerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TB_M_PUSH_SUBSCRIPTION` (
    `id` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `keys` JSON NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TB_M_PUSH_SUBSCRIPTION_endpoint_key`(`endpoint`),
    INDEX `TB_M_PUSH_SUBSCRIPTION_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TB_H_NOTIFICATION_LOG` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `tag` VARCHAR(100) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `quotationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TB_H_NOTIFICATION_LOG_userId_isRead_idx`(`userId`, `isRead`),
    INDEX `TB_H_NOTIFICATION_LOG_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TB_R_QUOTATION` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_SALES_REVIEW', 'PENDING_MANAGER_REVIEW', 'APPROVED', 'REJECTED', 'REVISION') NOT NULL DEFAULT 'DRAFT',
    `quotationNumber` VARCHAR(50) NULL,
    `customerName` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `quotationDate` DATETIME(3) NULL,
    `priority` VARCHAR(20) NULL,
    `totalValue` VARCHAR(50) NULL,
    `notes` TEXT NULL,
    `attachments` JSON NULL,
    `revisionNote` TEXT NULL,
    `sentToCustomerAt` DATETIME(3) NULL,
    `assistanceId` VARCHAR(191) NOT NULL,
    `salesPicId` VARCHAR(191) NOT NULL,
    `managerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TB_R_QUOTATION_quotationNumber_key`(`quotationNumber`),
    INDEX `TB_R_QUOTATION_status_idx`(`status`),
    INDEX `TB_R_QUOTATION_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
