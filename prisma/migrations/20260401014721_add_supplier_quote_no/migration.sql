-- AlterTable
ALTER TABLE `tb_m_position` ALTER COLUMN `code` DROP DEFAULT;

-- AlterTable
ALTER TABLE `tb_r_quotation` ADD COLUMN `supplierQuoteNo` VARCHAR(100) NULL;
