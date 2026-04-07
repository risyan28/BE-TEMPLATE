-- AlterTable
ALTER TABLE `tb_m_user` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `lastLoginAt` DATETIME(3) NULL;
