/*
  Store application timestamps in WIB (UTC+7) at the database layer.
  - Shift existing UTC data to WIB for app-owned timestamp columns.
  - Install MySQL triggers so future INSERT/UPDATE values are stored in WIB.
*/

-- Shift existing app-owned timestamps from UTC to WIB
UPDATE `TB_M_USER`
SET
  `createdAt` = `createdAt` + INTERVAL 7 HOUR,
  `updatedAt` = `updatedAt` + INTERVAL 7 HOUR,
  `lastLoginAt` = CASE
    WHEN `lastLoginAt` IS NULL THEN NULL
    ELSE `lastLoginAt` + INTERVAL 7 HOUR
  END;

UPDATE `TB_M_PUSH_SUBSCRIPTION`
SET
  `createdAt` = `createdAt` + INTERVAL 7 HOUR,
  `updatedAt` = `updatedAt` + INTERVAL 7 HOUR;

UPDATE `TB_H_NOTIFICATION_LOG`
SET `createdAt` = `createdAt` + INTERVAL 7 HOUR;

UPDATE `TB_R_QUOTATION`
SET
  `createdAt` = `createdAt` + INTERVAL 7 HOUR,
  `updatedAt` = `updatedAt` + INTERVAL 7 HOUR,
  `sentToCustomerAt` = CASE
    WHEN `sentToCustomerAt` IS NULL THEN NULL
    ELSE `sentToCustomerAt` + INTERVAL 7 HOUR
  END;

UPDATE `TB_M_CUSTOMER`
SET
  `createdAt` = `createdAt` + INTERVAL 7 HOUR,
  `updatedAt` = `updatedAt` + INTERVAL 7 HOUR;

-- Recreate triggers safely
DROP TRIGGER IF EXISTS `trg_tb_m_user_bi_wib`;
DROP TRIGGER IF EXISTS `trg_tb_m_user_bu_wib`;
DROP TRIGGER IF EXISTS `trg_tb_m_push_subscription_bi_wib`;
DROP TRIGGER IF EXISTS `trg_tb_m_push_subscription_bu_wib`;
DROP TRIGGER IF EXISTS `trg_tb_h_notification_log_bi_wib`;
DROP TRIGGER IF EXISTS `trg_tb_r_quotation_bi_wib`;
DROP TRIGGER IF EXISTS `trg_tb_r_quotation_bu_wib`;
DROP TRIGGER IF EXISTS `trg_tb_m_customer_bi_wib`;
DROP TRIGGER IF EXISTS `trg_tb_m_customer_bu_wib`;

CREATE TRIGGER `trg_tb_m_user_bi_wib`
BEFORE INSERT ON `TB_M_USER`
FOR EACH ROW
SET
  NEW.`createdAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR,
  NEW.`updatedAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR;

CREATE TRIGGER `trg_tb_m_user_bu_wib`
BEFORE UPDATE ON `TB_M_USER`
FOR EACH ROW
SET NEW.`updatedAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR;

CREATE TRIGGER `trg_tb_m_push_subscription_bi_wib`
BEFORE INSERT ON `TB_M_PUSH_SUBSCRIPTION`
FOR EACH ROW
SET
  NEW.`createdAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR,
  NEW.`updatedAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR;

CREATE TRIGGER `trg_tb_m_push_subscription_bu_wib`
BEFORE UPDATE ON `TB_M_PUSH_SUBSCRIPTION`
FOR EACH ROW
SET NEW.`updatedAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR;

CREATE TRIGGER `trg_tb_h_notification_log_bi_wib`
BEFORE INSERT ON `TB_H_NOTIFICATION_LOG`
FOR EACH ROW
SET NEW.`createdAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR;

CREATE TRIGGER `trg_tb_r_quotation_bi_wib`
BEFORE INSERT ON `TB_R_QUOTATION`
FOR EACH ROW
SET
  NEW.`createdAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR,
  NEW.`updatedAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR;

CREATE TRIGGER `trg_tb_r_quotation_bu_wib`
BEFORE UPDATE ON `TB_R_QUOTATION`
FOR EACH ROW
SET NEW.`updatedAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR;

CREATE TRIGGER `trg_tb_m_customer_bi_wib`
BEFORE INSERT ON `TB_M_CUSTOMER`
FOR EACH ROW
SET
  NEW.`createdAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR,
  NEW.`updatedAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR;

CREATE TRIGGER `trg_tb_m_customer_bu_wib`
BEFORE UPDATE ON `TB_M_CUSTOMER`
FOR EACH ROW
SET NEW.`updatedAt` = UTC_TIMESTAMP(3) + INTERVAL 7 HOUR;