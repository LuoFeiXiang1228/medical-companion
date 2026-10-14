-- ============================================================
-- 陪诊服务系统 · 演示数据（示例）
-- 执行顺序：先执行 schema.sql 建库，再执行本文件
-- 说明：以下均为演示用示例数据（医院 / 科室 / 服务分类 / 服务项目），
--       上线前请整段替换为真实数据；可重复执行（已存在的行不会覆盖）。
-- ============================================================

USE `peizhen`;

-- 示例医院（1 家，可替换）
INSERT IGNORE INTO `hospitals` (`id`,`name`,`level`,`province`,`city`,`address`,`is_pilot`,`status`) VALUES
 (1,'示例医院','三甲',NULL,NULL,'示例地址（请替换）',1,1);

-- 常见科室（12 个，可按需增删）
INSERT IGNORE INTO `departments` (`id`,`hospital_id`,`name`,`floor`,`building`,`status`) VALUES
 (1,1,'内科',NULL,NULL,1),
 (2,1,'外科',NULL,NULL,1),
 (3,1,'儿科',NULL,NULL,1),
 (4,1,'妇产科',NULL,NULL,1),
 (5,1,'骨科',NULL,NULL,1),
 (6,1,'眼科',NULL,NULL,1),
 (7,1,'耳鼻喉科',NULL,NULL,1),
 (8,1,'口腔科',NULL,NULL,1),
 (9,1,'皮肤科',NULL,NULL,1),
 (10,1,'心血管内科',NULL,NULL,1),
 (11,1,'神经内科',NULL,NULL,1),
 (12,1,'康复科',NULL,NULL,1);

-- 服务分类（示例）
INSERT IGNORE INTO `categories` (`id`,`parent_id`,`name`,`code`,`sort`,`status`,`is_sensitive`) VALUES
 (1,0,'全程陪诊','FULL',1,1,0),
 (2,0,'半程陪诊','HALF',2,1,0),
 (3,0,'代取报告','REPORT',3,1,0);

-- 服务项目 / 服务包（示例；正式条目请按国标第 8.1 条细化后替换）
INSERT IGNORE INTO `service_types`
 (`id`,`category_id`,`name`,`price`,`sales`,`status`,`service_mode`,`duration_minutes`,`requires_patient_info`,`requires_family_consent`,`description`) VALUES
 (1,1,'全程陪诊（半天）',198.00,0,1,2,240,1,1,'从到院到离院的全程陪同：取号、候诊陪同、检查引导、取药等。示例数据，正式服务项以国标条目细化后为准。'),
 (2,2,'半程陪诊',98.00,0,1,1,120,1,1,'按约定环节提供陪同服务（示例数据）。'),
 (3,3,'代取报告',39.00,0,1,1,60,1,0,'代取检查报告并拍照发送（示例数据）。涉及结果传递的服务边界以「服务边界声明」为准。');
