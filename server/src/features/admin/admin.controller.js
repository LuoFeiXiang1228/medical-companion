// 管理端：通用（会话 / 看板）+ 订单管理（受理 / 查询 / 审计日志）
const Router = require('koa-router');
const pool = require('../../db/mysql');
const { ok } = require('../../utils/response');
const { authenticate, authorize } = require('../../middleware/auth');
const orderService = require('../orders/order.service');
const { logAudit, listAudit } = require('../../services/log.service');

function register(router) {
  const guard = [authenticate, authorize('admin')];

  // 当前管理员信息
  router.get('/admin/me', authenticate, async (ctx) => {
    const { userId } = ctx.state.user;
    const [rows] = await pool.query('SELECT id, username, role FROM admin_users WHERE id=?', [userId]);
    if (!rows.length) { ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '管理员不存在', data: null }; return; }
    ok(ctx, rows[0]);
  });

  // 看板：订单概览 + 陪诊员资质概览（含 30 天到期预警）
  router.get('/admin/dashboard', ...guard, async (ctx) => {
    const [[orders]] = await pool.query(
      `SELECT
         SUM(status = 10) AS pending_review,
         SUM(status IN (20, 30, 40)) AS in_service,
         SUM(status = 50) AS done,
         SUM(pay_status = 1 AND status = 10) AS paid_pending
       FROM orders`,
    );
    const [[companions]] = await pool.query(
      'SELECT SUM(audit_status = 0) AS pending_audit, SUM(audit_status = 1) AS approved FROM companions',
    );
    const [[expiring]] = await pool.query(
      `SELECT COUNT(*) AS n FROM companions
       WHERE audit_status = 1 AND (
         (health_cert_expire IS NOT NULL AND health_cert_expire <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)) OR
         (cert_expire IS NOT NULL AND cert_expire <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))
       )`,
    );
    ok(ctx, {
      orders: {
        pendingReview: Number(orders.pending_review) || 0,
        inService: Number(orders.in_service) || 0,
        done: Number(orders.done) || 0,
        paidPending: Number(orders.paid_pending) || 0,
      },
      companions: {
        pendingAudit: Number(companions.pending_audit) || 0,
        approved: Number(companions.approved) || 0,
        expiringIn30d: Number(expiring.n) || 0,
      },
    });
  });

  // 订单列表（按状态 / 阶段 / 支付状态 / 关键词筛选）
  router.get('/admin/orders', ...guard, async (ctx) => {
    const { status, stage, payStatus, keyword, page = 1, pageSize = 50 } = ctx.query;
    let sql = `SELECT o.id, o.order_no, o.status, o.stage, o.pay_status, o.total_amount, o.service_date,
                      h.name AS hospital_name, dep.name AS department_name, s.time_label,
                      p.real_name AS patient_name, u.phone AS user_phone,
                      c.real_name AS companion_name, c.audit_status AS companion_audit_status,
                      (SELECT COUNT(*) FROM service_logs l WHERE l.order_id = o.id) AS log_count
               FROM orders o
               LEFT JOIN hospitals h ON h.id = o.hospital_id
               LEFT JOIN departments dep ON dep.id = o.department_id
               LEFT JOIN delivery_slots s ON s.id = o.slot_id
               LEFT JOIN patient_info p ON p.id = o.patient_id
               LEFT JOIN users u ON u.id = o.user_id
               LEFT JOIN deliveries d ON d.order_id = o.id
               LEFT JOIN companions c ON c.id = d.companion_id
               WHERE 1=1`;
    const params = [];
    if (status !== undefined && status !== '') { sql += ' AND o.status = ?'; params.push(Number(status)); }
    if (stage !== undefined && stage !== '') { sql += ' AND o.stage = ?'; params.push(Number(stage)); }
    if (payStatus !== undefined && payStatus !== '') { sql += ' AND o.pay_status = ?'; params.push(Number(payStatus)); }
    if (keyword) { sql += ' AND (o.order_no LIKE ? OR p.real_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    sql += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    const [rows] = await pool.query(sql, params);
    ok(ctx, rows);
  });

  // 订单详情（管理端全量视图：含就医人、陪诊员、留痕、协议、风险评估）
  router.get('/admin/orders/:id', ...guard, async (ctx) => {
    const [orders] = await pool.query(
      `SELECT o.*, h.name AS hospital_name, h.address AS hospital_address,
              dep.name AS department_name, dep.floor, dep.building, s.time_label,
              p.real_name AS patient_name, p.phone AS patient_phone, p.gender, p.mobility, p.relation,
              u.phone AS user_phone,
              c.id AS companion_id, c.real_name AS companion_name, c.phone AS companion_phone,
              c.audit_status AS companion_audit_status, d.accepted_at, d.finished_at
       FROM orders o
       LEFT JOIN hospitals h ON h.id = o.hospital_id
       LEFT JOIN departments dep ON dep.id = o.department_id
       LEFT JOIN delivery_slots s ON s.id = o.slot_id
       LEFT JOIN patient_info p ON p.id = o.patient_id
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       LEFT JOIN companions c ON c.id = d.companion_id
       WHERE o.id = ?`,
      [ctx.params.id],
    );
    if (!orders.length) { ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '订单不存在', data: null }; return; }
    const [items] = await pool.query(
      'SELECT service_type_id, name, price, quantity, subtotal, snapshot_positive_codes FROM order_items WHERE order_id=?',
      [ctx.params.id],
    );
    const [logs] = await pool.query(
      `SELECT id, node_code, node_name, seq, occurred_at, location_text, remark, proof_images, is_flagged, flag_reason
       FROM service_logs WHERE order_id=? ORDER BY seq, id`,
      [ctx.params.id],
    );
    const [consents] = await pool.query(
      'SELECT id, sign_status, signed_at FROM service_consents WHERE order_id=? LIMIT 1',
      [ctx.params.id],
    );
    const [risks] = await pool.query(
      'SELECT id, risk_level, emergency_triggered, created_at FROM risk_assessments WHERE order_id=? LIMIT 1',
      [ctx.params.id],
    );
    ok(ctx, { order: orders[0], items, logs, consent: consents[0] || null, riskAssessment: risks[0] || null });
  });

  // 受理订单（国标阶段 2：委托与受理）
  router.post('/admin/orders/:id/accept', ...guard, async (ctx) => {
    await orderService.acceptCommission(ctx.params.id);
    logAudit({
      operatorId: ctx.state.user.userId, operatorType: 'admin', action: 'ACCEPT_COMMISSION',
      resourceType: 'order', resourceId: Number(ctx.params.id), ipAddress: ctx.ip,
    });
    ok(ctx, { ok: true });
  });

  // 审计日志查询
  router.get('/admin/logs', ...guard, async (ctx) => {
    const { operatorType, action, resourceType, startDate, endDate, page, pageSize } = ctx.query;
    const rows = await listAudit({ operatorType, action, resourceType, startDate, endDate, page, pageSize });
    ok(ctx, rows);
  });
}

module.exports = { register };
