// 审计日志服务（audit_logs）
// 说明：原 operation_logs 表未随陪诊版保留，统一落 audit_logs；
//       logOperation / logSystem / listLogs 为兼容旧调用保留的转换层（admin 模块重写后可移除）。
const pool = require('../db/mysql');

/**
 * 写审计日志
 * @param {Object} opt
 * @param {number} opt.operatorId   操作者 ID（系统动作传 0）
 * @param {string} opt.operatorType user / companion / admin / system
 * @param {string} opt.action       LOGIN / CREATE / UPDATE / DELETE / VIEW / EXPORT / AUDIT / 自定义
 * @param {string} opt.resourceType 资源类型：order / patient / companion / service_type 等
 * @param {number} [opt.resourceId]
 * @param {Object} [opt.details]
 * @param {string} [opt.ipAddress]
 * @param {string} [opt.userAgent]
 */
async function logAudit({ operatorId, operatorType = 'system', action, resourceType, resourceId, details, ipAddress, userAgent }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (operator_id, operator_type, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        operatorId || 0, operatorType, action, resourceType || 'system',
        resourceId || null,
        details ? JSON.stringify(details) : null,
        ipAddress || null, userAgent || null,
      ],
    );
  } catch (e) {
    console.error('log audit failed:', e.message);
  }
}

async function listAudit({ operatorId, operatorType, action, resourceType, startDate, endDate, page = 1, pageSize = 50 }) {
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const p = [];
  if (operatorId) { sql += ' AND operator_id=?'; p.push(operatorId); }
  if (operatorType) { sql += ' AND operator_type=?'; p.push(operatorType); }
  if (action) { sql += ' AND action=?'; p.push(action); }
  if (resourceType) { sql += ' AND resource_type=?'; p.push(resourceType); }
  if (startDate) { sql += ' AND DATE(created_at)>=?'; p.push(startDate); }
  if (endDate) { sql += ' AND DATE(created_at)<=?'; p.push(endDate); }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  p.push(Number(pageSize), (page - 1) * pageSize);
  const [rows] = await pool.query(sql, p);
  return rows;
}

// —— 兼容层（旧调用签名 → audit_logs） ——

async function logOperation({ admin, module, action, detail, orderId, aftersaleId, productId }) {
  const adminId = admin && (admin.id || admin.userId);
  if (!adminId) return;
  return logAudit({
    operatorId: adminId,
    operatorType: 'admin',
    action,
    resourceType: module,
    resourceId: orderId || aftersaleId || productId || null,
    details: { detail },
  });
}

async function logSystem({ actorName, actorRole = 'system', module, action, detail }) {
  return logAudit({
    operatorId: 0,
    operatorType: actorRole,
    action,
    resourceType: module,
    details: { actorName, detail },
  });
}

const listLogs = (opts = {}) => listAudit({
  operatorId: opts.adminId,
  action: opts.action,
  resourceType: opts.module,
  startDate: opts.startDate,
  endDate: opts.endDate,
  page: opts.page,
  pageSize: opts.pageSize,
});

module.exports = { logAudit, listAudit, logOperation, logSystem, listLogs };
