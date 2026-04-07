/*
  Warnings:

  - A unique constraint covering the columns `[quotationNumber]` on the table `Quotation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `quotation` ADD COLUMN `attachments` JSON NULL,
    ADD COLUMN `customerId` VARCHAR(191) NULL,
    ADD COLUMN `customerName` VARCHAR(191) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `priority` VARCHAR(20) NULL,
    ADD COLUMN `quotationDate` DATETIME(3) NULL,
    ADD COLUMN `quotationNumber` VARCHAR(50) NULL,
    ADD COLUMN `revisionNote` TEXT NULL,
    ADD COLUMN `sentToCustomerAt` DATETIME(3) NULL,
    ADD COLUMN `totalValue` VARCHAR(50) NULL;

-- CreateTable
CREATE TABLE `TB_M_CUSTOMER` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TB_M_CUSTOMER_code_key`(`code`),
    INDEX `TB_M_CUSTOMER_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Quotation_quotationNumber_key` ON `Quotation`(`quotationNumber`);

-- CreateIndex
CREATE INDEX `Quotation_status_idx` ON `Quotation`(`status`);

-- CreateIndex
CREATE INDEX `Quotation_customerId_idx` ON `Quotation`(`customerId`);

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `TB_M_CUSTOMER`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
