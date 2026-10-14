const pool = require('../../db/mysql');

// 本地日期字符串 YYYY-MM-DD
function todayStr() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

/**
 * 陪诊员接单资格校验
 * 校验项：资质审核状态 / 健康证有效期 / 职业能力证书 / 岗前培训 / 时段冲突
 * 返回 { eligible, reasons: [{ code, message }] }
 *
 * 注：证书"核验状态"暂无独立字段，暂以"是否登记证书编号"代表核验前提
 *     （待核验流程落地后再扩展）。
 */
async function checkCompanionEligibility(companionId, { serviceDate, slotId } = {}) {
  const reasons = [];
  const [rows] = await pool.query(
    `SELECT id, real_name, audit_status, work_status,
            cert_no, cert_expire, health_cert_no, health_cert_expire, train_status
     FROM companions WHERE id = ?`,
    [companionId],
  );
  if (!rows.length) {
    return { eligible: false, reasons: [{ code: 'NOT_FOUND', message: '陪诊员不存在' }] };
  }
  const c = rows[0];
  const day = serviceDate ? String(serviceDate).slice(0, 10) : todayStr();

  // 1) 资质审核状态
  if (c.audit_status === 0) reasons.push({ code: 'PENDING_REVIEW', message: '资质审核中，暂不可接单' });
  if (c.audit_status === 2) reasons.push({ code: 'AUDIT_REJECTED', message: '资质审核未通过，请先补充材料' });
  if (c.work_status !== 1) reasons.push({ code: 'OFF_DUTY', message: '当前为歇业状态' });

  // 2) 健康证：必须登记且在有效期内
  if (!c.health_cert_no || !c.health_cert_expire) {
    reasons.push({ code: 'CERT_UNVERIFIED', message: '未登记有效健康证' });
  } else if (String(c.health_cert_expire).slice(0, 10) < day) {
    reasons.push({ code: 'CERT_EXPIRED', message: `健康证已于 ${String(c.health_cert_expire).slice(0, 10)} 过期` });
  }

  // 3) 职业能力证书
  if (!c.cert_no) {
    reasons.push({ code: 'CERT_UNVERIFIED', message: '未登记职业能力证书' });
  } else if (c.cert_expire && String(c.cert_expire).slice(0, 10) < day) {
    reasons.push({ code: 'CERT_EXPIRED', message: `证书已于 ${String(c.cert_expire).slice(0, 10)} 过期` });
  }

  // 4) 岗前培训
  if (c.train_status !== 2) reasons.push({ code: 'TRAINING_REQUIRED', message: '岗前培训未完成' });

  // 5) 排班冲突：同一日期同一时段已有未完成的服务
  if (serviceDate && slotId) {
    const [conf] = await pool.query(
      `SELECT o.id FROM orders o
       JOIN deliveries d ON d.order_id = o.id
       WHERE d.companion_id = ? AND o.service_date = ? AND o.slot_id = ?
         AND o.status IN (30, 40)
       LIMIT 1`,
      [companionId, String(serviceDate).slice(0, 10), slotId],
    );
    if (conf.length) reasons.push({ code: 'SLOT_CONFLICT', message: '该时段已有进行中的服务' });
  }

  return { eligible: reasons.length === 0, reasons };
}

module.exports = { checkCompanionEligibility, todayStr };
