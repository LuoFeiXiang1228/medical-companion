-- ============================================================
-- 陪诊服务国标合规与全流程调度系统
-- 数据库建库脚本 · MySQL 8.0 · utf8mb4
--
-- 说明：全新库从零建表（无 ALTER、无数据迁移）。
--       共 22 张表：保留 3 + 改造 7 + 新增 12。
-- ============================================================

CREATE DATABASE IF NOT EXISTS `peizhen` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `peizhen`;

-- ============================================================
-- 一、用户与人员
-- ============================================================

-- 用户（下单人 / 患者 / 机构管理员）
CREATE TABLE `users` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `openid` VARCHAR(64) DEFAULT NULL,
  `unionid` VARCHAR(64) DEFAULT NULL,
  `nickname` VARCHAR(64) DEFAULT NULL,
  `avatar` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `real_name` VARCHAR(32) DEFAULT NULL COMMENT '实名',
  `id_card_no` VARBINARY(256) DEFAULT NULL COMMENT '身份证号(加密存储)',
  `user_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=普通用户 2=机构管理员',
  `relation_default` VARCHAR(16) DEFAULT NULL COMMENT '默认就诊人关系:self/parent/child/other',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1正常 0禁用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`),
  KEY `idx_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户(下单人/患者/机构管理员)';

-- 就医人档案（服务对象，可与下单人不同）
CREATE TABLE `patient_info` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `owner_user_id` BIGINT NOT NULL COMMENT '创建人/下单人',
  `real_name` VARCHAR(32) NOT NULL COMMENT '就医人姓名',
  `phone` VARCHAR(20) DEFAULT NULL COMMENT '就医人联系电话',
  `id_card_no` VARBINARY(256) DEFAULT NULL COMMENT '身份证号(加密存储)',
  `gender` TINYINT DEFAULT NULL COMMENT '1男 2女',
  `birth_date` DATE DEFAULT NULL,
  `relation` VARCHAR(16) DEFAULT NULL COMMENT '与下单人关系:self/parent/child/other',
  `mobility` TINYINT DEFAULT NULL COMMENT '行动能力:1可自理 2需搀扶 3轮椅 4卧床',
  `medical_history` TEXT COMMENT '既往病史(敏感信息,需加密存放)',
  `allergy` VARCHAR(255) DEFAULT NULL COMMENT '过敏史(敏感信息)',
  `emergency_contact_name` VARCHAR(32) DEFAULT NULL COMMENT '紧急联系人',
  `emergency_contact_phone` VARCHAR(20) DEFAULT NULL,
  `is_default` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_owner` (`owner_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='就医人档案';

-- 陪诊员（含资质三态审核）
CREATE TABLE `companions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `openid` VARCHAR(64) DEFAULT NULL,
  `username` VARCHAR(32) DEFAULT NULL COMMENT '登录账号(账密登录)',
  `password_hash` VARCHAR(128) DEFAULT NULL COMMENT '登录密码哈希',
  `real_name` VARCHAR(32) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `gender` TINYINT DEFAULT NULL COMMENT '1男 2女',
  `id_card_no` VARBINARY(256) DEFAULT NULL COMMENT '身份证号(加密)',
  `avatar` VARCHAR(255) DEFAULT NULL,
  `cert_type` VARCHAR(64) DEFAULT NULL COMMENT '证书类型:陪诊服务专项职业能力证书等',
  `cert_no` VARCHAR(64) DEFAULT NULL COMMENT '证书编号(唯一编码)',
  `cert_issue_org` VARCHAR(128) DEFAULT NULL COMMENT '发证机构',
  `cert_expire` DATE DEFAULT NULL COMMENT '证书有效期',
  `health_cert_no` VARCHAR(64) DEFAULT NULL COMMENT '健康证编号',
  `health_cert_expire` DATE DEFAULT NULL COMMENT '健康证有效期',
  `train_status` TINYINT NOT NULL DEFAULT 0 COMMENT '培训状态:0未培训 1培训中 2已通过',
  `skill_tags` VARCHAR(255) DEFAULT NULL COMMENT '技能标签(逗号分隔)',
  `hospital_scope` VARCHAR(255) DEFAULT NULL COMMENT '可服务医院范围',
  `audit_status` TINYINT NOT NULL DEFAULT 0 COMMENT '资质审核三态:0待审核 1审核通过 2审核驳回',
  `audit_remark` VARCHAR(255) DEFAULT NULL COMMENT '审核意见',
  `audited_by` BIGINT DEFAULT NULL COMMENT '审核人(admin_users.id)',
  `audited_at` DATETIME DEFAULT NULL,
  `work_status` TINYINT NOT NULL DEFAULT 1 COMMENT '接单状态:1接单中 0歇业',
  `score` DECIMAL(3,2) DEFAULT NULL COMMENT '服务评分',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_audit_work` (`audit_status`, `work_status`),
  KEY `idx_cert_no` (`cert_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='陪诊员(含资质三态)';

-- ============================================================
-- 二、服务与主数据
-- ============================================================

-- 服务分类
CREATE TABLE `categories` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `parent_id` BIGINT NOT NULL DEFAULT 0 COMMENT '0=顶级',
  `name` VARCHAR(64) NOT NULL,
  `code` VARCHAR(32) DEFAULT NULL COMMENT '分类编码',
  `icon` VARCHAR(255) DEFAULT NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1上架 0隐藏',
  `is_sensitive` TINYINT NOT NULL DEFAULT 0 COMMENT '1=该类别涉及敏感信息处理',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服务分类';

-- 陪诊服务项目
CREATE TABLE `service_types` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `category_id` BIGINT NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `cover` VARCHAR(255) DEFAULT NULL,
  `images` JSON DEFAULT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `sales` INT NOT NULL DEFAULT 0,
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1上架 0下架',
  `service_mode` TINYINT NOT NULL DEFAULT 1 COMMENT '1按次 2按时 3按天',
  `duration_minutes` INT DEFAULT NULL COMMENT '预计时长(分钟)',
  `daily_capacity` INT DEFAULT NULL COMMENT '日接单上限',
  `positive_list_codes` VARCHAR(255) DEFAULT NULL COMMENT '对应国标第8.1条12项可协助活动的条目编码',
  `requires_patient_info` TINYINT NOT NULL DEFAULT 1 COMMENT '是否需要就医人信息',
  `requires_family_consent` TINYINT NOT NULL DEFAULT 0 COMMENT '是否需要家属授权',
  `description` TEXT,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cat` (`category_id`),
  KEY `idx_status_sales` (`status`, `sales`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='陪诊服务项目';

-- 医院主数据
CREATE TABLE `hospitals` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(128) NOT NULL,
  `level` VARCHAR(16) DEFAULT NULL COMMENT '等级:三甲/三乙/二甲等',
  `province` VARCHAR(32) DEFAULT NULL,
  `city` VARCHAR(32) DEFAULT NULL,
  `address` VARCHAR(255) DEFAULT NULL,
  `lng` DECIMAL(10,6) DEFAULT NULL,
  `lat` DECIMAL(10,6) DEFAULT NULL,
  `is_pilot` TINYINT NOT NULL DEFAULT 0 COMMENT '是否陪诊试点医院',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_city` (`city`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='医院主数据';

-- 科室主数据
CREATE TABLE `departments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `hospital_id` BIGINT NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `floor` VARCHAR(32) DEFAULT NULL COMMENT '所在楼层',
  `building` VARCHAR(64) DEFAULT NULL COMMENT '院区/楼栋',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hospital` (`hospital_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='科室主数据';

-- 就诊时段
CREATE TABLE `delivery_slots` (
  `id` TINYINT NOT NULL AUTO_INCREMENT,
  `time_label` VARCHAR(16) NOT NULL,
  `cutoff_time` TIME NOT NULL COMMENT '截单时间',
  `sort` TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='就诊时段';

INSERT INTO `delivery_slots` (`id`,`time_label`,`cutoff_time`,`sort`) VALUES
 (1,'08:00-12:00','07:00',1),
 (2,'13:00-17:00','12:00',2),
 (3,'全天','07:00',3);

-- ============================================================
-- 三、订单与服务留痕
-- ============================================================

-- 陪诊订单（国标三阶段：1信息提供 2委托受理 3服务交付）
CREATE TABLE `orders` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(32) NOT NULL,
  `user_id` BIGINT NOT NULL COMMENT '下单人',
  `patient_id` BIGINT DEFAULT NULL COMMENT '就医人 patient_info.id',
  `service_type_id` BIGINT DEFAULT NULL,
  `hospital_id` BIGINT DEFAULT NULL,
  `department_id` BIGINT DEFAULT NULL,
  `slot_id` TINYINT DEFAULT NULL COMMENT '就诊时段',
  `service_date` DATE DEFAULT NULL COMMENT '服务日期',
  `stage` TINYINT NOT NULL DEFAULT 1 COMMENT '1信息提供 2委托受理 3服务交付',
  `status` TINYINT NOT NULL DEFAULT 10 COMMENT '10待受理 20已受理待派单 30已派单待服务 40服务中 50已完成 0已取消 60纠纷中',
  `total_amount` DECIMAL(10,2) NOT NULL,
  `pay_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0未付 1已付 2已退款 3部分退款',
  `aftersale_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0无 1待处理 2已同意 3已拒绝',
  `consent_id` BIGINT DEFAULT NULL COMMENT '服务协议签署记录',
  `risk_assessment_id` BIGINT DEFAULT NULL COMMENT '风险评估记录',
  `pay_time` DATETIME DEFAULT NULL,
  `cancelled_at` DATETIME DEFAULT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user_status` (`user_id`, `status`),
  KEY `idx_slot_date_status` (`slot_id`, `service_date`, `status`),
  KEY `idx_patient` (`patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='陪诊订单(国标三阶段)';

-- 订单服务明细
CREATE TABLE `order_items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `service_type_id` BIGINT DEFAULT NULL,
  `name` VARCHAR(128) DEFAULT NULL COMMENT '服务名快照',
  `price` DECIMAL(10,2) DEFAULT NULL,
  `quantity` INT DEFAULT 1,
  `subtotal` DECIMAL(10,2) DEFAULT NULL,
  `snapshot_positive_codes` VARCHAR(255) DEFAULT NULL COMMENT '下单时国标8.1条条目编码快照',
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单服务明细';

-- 服务执行单
CREATE TABLE `deliveries` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `companion_id` BIGINT DEFAULT NULL,
  `slot_id` TINYINT DEFAULT NULL,
  `status` TINYINT NOT NULL DEFAULT 10 COMMENT '10待接单 20已接单 30服务中 40已完成 0取消',
  `accepted_at` DATETIME DEFAULT NULL,
  `finished_at` DATETIME DEFAULT NULL COMMENT '服务完成时间',
  `delivery_proof_image` VARCHAR(255) DEFAULT NULL COMMENT '兼容保留(单图)',
  `log_count` INT NOT NULL DEFAULT 0 COMMENT '已打卡节点数',
  `proof_summary` VARCHAR(512) DEFAULT NULL COMMENT '留痕摘要',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order` (`order_id`),
  KEY `idx_companion_slot` (`companion_id`, `slot_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服务执行单';

-- 服务过程节点打卡留痕（不可编辑/删除）
CREATE TABLE `service_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `companion_id` BIGINT DEFAULT NULL,
  `node_code` VARCHAR(32) NOT NULL COMMENT '节点编码:ARRIVE到院/REGISTER挂号/WAIT候诊/SEE_DOCT就诊/CHECK检查/PAY缴费/PICK_MED取药/LEAVE离院',
  `node_name` VARCHAR(64) DEFAULT NULL COMMENT '节点名称',
  `seq` INT NOT NULL DEFAULT 1 COMMENT '节点顺序',
  `occurred_at` DATETIME NOT NULL COMMENT '节点发生时间(时间戳)',
  `lng` DECIMAL(10,6) DEFAULT NULL COMMENT '定位经度',
  `lat` DECIMAL(10,6) DEFAULT NULL COMMENT '定位纬度',
  `location_text` VARCHAR(255) DEFAULT NULL COMMENT '定位描述',
  `remark` TEXT COMMENT '备注(禁止输入医学判断)',
  `proof_images` JSON DEFAULT NULL COMMENT '留痕图片(脱敏)URL数组',
  `client_ip` VARCHAR(64) DEFAULT NULL,
  `is_flagged` TINYINT NOT NULL DEFAULT 0 COMMENT '是否触发禁止性规则(0否 1是)',
  `flag_reason` VARCHAR(255) DEFAULT NULL COMMENT '触发原因',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_seq` (`order_id`, `seq`),
  KEY `idx_companion` (`companion_id`),
  KEY `idx_node` (`node_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服务过程节点打卡留痕(不可编辑/删除)';

-- ============================================================
-- 四、合规与协议
-- ============================================================

-- 服务协议签署记录
CREATE TABLE `service_consents` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `template_id` BIGINT DEFAULT NULL COMMENT '协议模板',
  `content_snapshot` TEXT COMMENT '协议签署时内容快照',
  `signer_user_id` BIGINT DEFAULT NULL COMMENT '签署人',
  `signer_name` VARCHAR(32) DEFAULT NULL,
  `signature_data` TEXT COMMENT '电子签名数据',
  `signed_at` DATETIME DEFAULT NULL COMMENT '签署时间(时间戳)',
  `sign_ip` VARCHAR(64) DEFAULT NULL,
  `sign_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0未签 1已签',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服务协议签署记录';

-- 风险评估记录
CREATE TABLE `risk_assessments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `patient_id` BIGINT DEFAULT NULL,
  `assessor_id` BIGINT DEFAULT NULL COMMENT '评估人',
  `items` JSON DEFAULT NULL COMMENT '风险评估项(结构化问卷结果)',
  `risk_level` TINYINT DEFAULT NULL COMMENT '风险等级:1低 2中 3高',
  `emergency_plan_id` BIGINT DEFAULT NULL COMMENT '关联应急预案',
  `emergency_triggered` TINYINT NOT NULL DEFAULT 0 COMMENT '是否触发应急预案',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='风险评估记录';

-- 应急预案知识库
CREATE TABLE `emergency_plans` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) DEFAULT NULL COMMENT '预案编码',
  `scene` VARCHAR(64) NOT NULL COMMENT '适用场景:摔倒/晕厥/走失/突发不适等',
  `title` VARCHAR(128) NOT NULL,
  `content` TEXT COMMENT '处置步骤(禁止包含医学诊断/用药建议)',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='应急预案知识库';

-- 国标规则对照（第 8.1 条可协助活动 / 第 8.2 条不应开展服务）
CREATE TABLE `compliance_rules` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `rule_code` VARCHAR(32) NOT NULL COMMENT '规则编码',
  `rule_type` TINYINT NOT NULL COMMENT '1=不应开展的服务(国标8.2条) 2=可协助的活动(国标8.1条)',
  `std_clause` VARCHAR(64) DEFAULT NULL COMMENT '对应国标条款号',
  `title` VARCHAR(128) NOT NULL COMMENT '规则标题(如:不判读检查结果)',
  `description` TEXT COMMENT '规则说明',
  `detect_type` TINYINT NOT NULL DEFAULT 1 COMMENT '检测方式:1关键词 2字段校验 3功能禁用',
  `detect_pattern` VARCHAR(512) DEFAULT NULL COMMENT '检测模式(关键词正则等)',
  `severity` TINYINT NOT NULL DEFAULT 2 COMMENT '严重级:1提示 2拦截 3阻断',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rule_code` (`rule_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='国标规则对照(第8.1条可协助活动/第8.2条不应开展服务)';

-- ============================================================
-- 五、评价与投诉
-- ============================================================

-- 服务评价
CREATE TABLE `service_reviews` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `reviewer_type` TINYINT NOT NULL COMMENT '1家属/患者 2陪诊员',
  `reviewer_id` BIGINT DEFAULT NULL,
  `companion_id` BIGINT DEFAULT NULL,
  `score` TINYINT NOT NULL COMMENT '评分1-5',
  `tags` VARCHAR(255) DEFAULT NULL COMMENT '评价标签',
  `content` TEXT COMMENT '评价内容',
  `is_anonymous` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`),
  KEY `idx_companion` (`companion_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='服务评价';

-- 投诉/退款处理
CREATE TABLE `after_sales` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `type` VARCHAR(16) NOT NULL COMMENT 'cancel取消 refund退款 complaint投诉',
  `complaint_category` VARCHAR(32) DEFAULT NULL COMMENT '投诉分类',
  `reason` VARCHAR(255) DEFAULT NULL,
  `images` JSON DEFAULT NULL COMMENT '凭证图片数组',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0待处理 1已同意 2已拒绝 3处理中',
  `sla_deadline` DATETIME DEFAULT NULL COMMENT '处理时限',
  `handler_id` BIGINT DEFAULT NULL,
  `remark` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `handled_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_order` (`order_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投诉/退款处理';

-- ============================================================
-- 六、支付与系统
-- ============================================================

-- 支付流水
CREATE TABLE `payments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT DEFAULT NULL,
  `transaction_id` VARCHAR(64) DEFAULT NULL,
  `amount` DECIMAL(10,2) DEFAULT NULL,
  `method` VARCHAR(16) DEFAULT NULL,
  `status` TINYINT DEFAULT 0 COMMENT '0未付 1已付 2已退款',
  `paid_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付流水';

-- 后台账号
CREATE TABLE `admin_users` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(32) NOT NULL,
  `password_hash` VARCHAR(128) DEFAULT NULL,
  `role` VARCHAR(16) NOT NULL DEFAULT 'admin',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台账号';

-- 操作审计日志（设计参考：ethan-lau/medical_companion，MIT License）
CREATE TABLE `audit_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `operator_id` BIGINT NOT NULL COMMENT '操作者ID',
  `operator_type` VARCHAR(16) NOT NULL COMMENT '操作者类型:user/companion/admin/system',
  `action` VARCHAR(64) NOT NULL COMMENT '动作:LOGIN/CREATE/UPDATE/DELETE/VIEW/EXPORT/AUDIT',
  `resource_type` VARCHAR(32) NOT NULL COMMENT '资源类型:order/patient/companion/service_type等',
  `resource_id` BIGINT DEFAULT NULL COMMENT '资源ID',
  `details` JSON DEFAULT NULL COMMENT '操作详情(变更前后等)',
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_operator` (`operator_id`, `operator_type`),
  KEY `idx_resource` (`resource_type`, `resource_id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作审计日志';

-- 系统配置
CREATE TABLE `settings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `cfg_key` VARCHAR(64) NOT NULL,
  `cfg_value` TEXT,
  `remark` VARCHAR(255) DEFAULT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cfg_key` (`cfg_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统配置';

-- ============================================================
-- 附：可选表（如需要时启用）
-- ============================================================

-- 用户就医偏好（可选）
-- CREATE TABLE `user_preferences` (
--   `id` BIGINT NOT NULL AUTO_INCREMENT,
--   `user_id` BIGINT NOT NULL,
--   `pref_hospital_id` BIGINT DEFAULT NULL COMMENT '常用医院',
--   `pref_transport` VARCHAR(32) DEFAULT NULL COMMENT '交通偏好:自驾/网约车/公共交通',
--   `remark` VARCHAR(255) DEFAULT NULL,
--   `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `uk_user` (`user_id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户就医偏好(可选)';

-- ============================================================
-- 初始化数据：
--   演示数据（医院 / 科室 / 服务分类 / 服务项目）见 seed.sql
--   国标规则（第 8.1 / 8.2 条）见 seed-compliance.sql
--   emergency_plans（应急预案）待补充
-- ============================================================
