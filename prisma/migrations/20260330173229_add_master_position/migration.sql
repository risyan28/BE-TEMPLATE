-- AlterTable
ALTER TABLE `tb_m_user` ADD COLUMN `positionId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `TB_M_POSITION` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `TB_M_POSITION_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `TB_M_USER_positionId_idx` ON `TB_M_USER`(`positionId`);

-- AddForeignKey
ALTER TABLE `TB_M_USER` ADD CONSTRAINT `TB_M_USER_positionId_fkey` FOREIGN KEY (`positionId`) REFERENCES `TB_M_POSITION`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
