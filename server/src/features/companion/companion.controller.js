// 陪诊员端接口（companion）
// 设计要点：接单前置资质校验（审核态 / 证件有效期 / 培训 / 时段冲突）+ 订单详情归属校验；
// 服务过程打卡（原"送达"）由 service-logs 模块承接（待实现）。
const Router = require('koa-router');
const pool = require('../../db/mysql');
const { ok } = require('../../utils/response');
const { authenticate, authorize } = require('../../middleware/auth');
const { checkCompanionEligibility, todayStr } = require('./companion.eligibility');

// orders.status：10待受理 20已受理待派单 30已派单待服务 40服务中 50已完成 0已取消 60纠纷中
const ORDER_STATUS = { PENDING: 10, ACCEPTED: 20, ASSIGNED: 30, SERVING: 40, DONE: 50, CANCELLED: 0, DISPUTE: 60 };
// deliveries.status：10待接单 20已接单 30服务中 40已完成 0取消
const DELIVERY_STATUS = { PENDING: 10, ACCEPTED: 20, SERVING: 30, DONE: 40, CANCELLED: 0 };

function register(router) {
  // 我的服务任务（按服务日期/时段过滤，前端分组展示）
  router.get('/companion/tasks', authenticate, authorize('companion'), async (ctx) => {
    const cid = ctx.state.user.userId;
    const { date, slotId } = ctx.query;
    let sql = `SELECT o.id, o.order_no, o.status, o.stage, o.service_date, o.remark,
                      h.name AS hospital_name, dep.name AS department_name, s.time_label,
                      p.real_name AS patient_name,
                      d.status AS delivery_status, d.accepted_at
               FROM orders o
               JOIN deliveries d ON d.order_id = o.id
               LEFT JOIN patient_info p ON p.id = o.patient_id
               LEFT JOIN hospitals h ON h.id = o.hospital_id
               LEFT JOIN departments dep ON dep.id = o.department_id
               LEFT JOIN delivery_slots s ON s.id = o.slot_id
               WHERE d.companion_id = ? AND o.pay_status = 1 AND o.status != 0`;
    const p = [cid];
    if (date) { sql += ' AND o.service_date = ?'; p.push(date); }
    if (slotId) { sql += ' AND o.slot_id = ?'; p.push(slotId); }
    // 已完成订单自动下移，新接订单优先置顶
    sql += ' ORDER BY (o.status = ?) ASC, d.accepted_at DESC';
    p.push(ORDER_STATUS.DONE);
    const [rows] = await pool.query(sql, p);
    ok(ctx, rows);
  });

  // 待接单池：已受理待派单、未分配的订单（陪诊员从这里承接）
  router.get('/companion/available', authenticate, authorize('companion'), async (ctx) => {
    const { date, hospitalId, departmentId } = ctx.query;
    let sql = `SELECT o.id, o.order_no, o.total_amount, o.service_date, o.stage, o.remark,
                      h.name AS hospital_name, dep.name AS department_name, s.time_label
               FROM orders o
               JOIN deliveries d ON d.order_id = o.id
               LEFT JOIN hospitals h ON h.id = o.hospital_id
               LEFT JOIN departments dep ON dep.id = o.department_id
               LEFT JOIN delivery_slots s ON s.id = o.slot_id
               WHERE d.companion_id IS NULL AND o.pay_status = 1 AND o.status = ?`;
    const p = [ORDER_STATUS.ACCEPTED];
    if (date) { sql += ' AND o.service_date = ?'; p.push(date); }
    if (hospitalId) { sql += ' AND o.hospital_id = ?'; p.push(hospitalId); }
    if (departmentId) { sql += ' AND o.department_id = ?'; p.push(departmentId); }
    sql += ' ORDER BY o.created_at DESC LIMIT 50';
    const [rows] = await pool.query(sql, p);
    ok(ctx, rows);
  });

  // 任务详情（★ 归属校验：仅承接本单的陪诊员可查看；就医人敏感字段不返回）
  router.get('/companion/tasks/:id', authenticate, authorize('companion'), async (ctx) => {
    const cid = ctx.state.user.userId;
    const [rows] = await pool.query(
      `SELECT o.*, d.status AS delivery_status, d.companion_id, d.accepted_at,
              p.real_name AS patient_name, p.gender, p.mobility, p.relation,
              h.name AS hospital_name, h.address AS hospital_address,
              dep.name AS department_name, dep.floor, dep.building,
              s.time_label
       FROM orders o
       JOIN deliveries d ON d.order_id = o.id
       LEFT JOIN patient_info p ON p.id = o.patient_id
       LEFT JOIN hospitals h ON h.id = o.hospital_id
       LEFT JOIN departments dep ON dep.id = o.department_id
       LEFT JOIN delivery_slots s ON s.id = o.slot_id
       WHERE o.id = ?`,
      [ctx.params.id],
    );
    if (!rows.length) {
      ctx.status = 404;
      ctx.body = { code: 'NOT_FOUND', message: '订单不存在', data: null };
      return;
    }
    const order = rows[0];
    if (order.companion_id !== cid) {
      ctx.status = 403;
      ctx.body = { code: 'FORBIDDEN', message: '无权限查看该订单', data: null };
      return;
    }
    const [items] = await pool.query(
      `SELECT oi.service_type_id, oi.name, oi.price, oi.quantity, oi.subtotal
       FROM order_items oi WHERE oi.order_id = ?`,
      [ctx.params.id],
    );
    // 隐私最小必要：不返回就医人身份证 / 病史 / 过敏史等敏感字段
    const { companion_id, ...safeOrder } = order;
    ok(ctx, { order: safeOrder, items });
  });

  // 承接订单：已受理待派单(20) → 已派单待服务(30)
  // ★ 前置资质校验：审核态 / 健康证与证书有效期 / 培训 / 时段冲突
  router.post('/companion/tasks/:id/accept', authenticate, authorize('companion'), async (ctx) => {
    const cid = ctx.state.user.userId;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [d] = await conn.query('SELECT * FROM deliveries WHERE order_id = ? FOR UPDATE', [ctx.params.id]);
      if (!d.length || d[0].companion_id) {
        await conn.rollback(); conn.release();
        ctx.status = 409; ctx.body = { code: 'CONFLICT', message: '订单已被承接', data: null }; return;
      }
      if (d[0].status === DELIVERY_STATUS.CANCELLED) {
        await conn.rollback(); conn.release();
        ctx.status = 409; ctx.body = { code: 'CONFLICT', message: '订单已取消', data: null }; return;
      }
      const [ord] = await conn.query(
        'SELECT id, status, pay_status, service_date, slot_id FROM orders WHERE id = ?',
        [ctx.params.id],
      );
      if (!ord.length || ord[0].pay_status !== 1 || ord[0].status !== ORDER_STATUS.ACCEPTED) {
        await conn.rollback(); conn.release();
        ctx.status = 409; ctx.body = { code: 'BAD_STATE', message: '当前订单状态不可接单', data: null }; return;
      }
      const eligibility = await checkCompanionEligibility(cid, {
        serviceDate: ord[0].service_date,
        slotId: ord[0].slot_id,
      });
      if (!eligibility.eligible) {
        await conn.rollback(); conn.release();
        const isConflict = eligibility.reasons.some((r) => r.code === 'SLOT_CONFLICT');
        ctx.status = isConflict ? 409 : 403;
        ctx.body = {
          code: eligibility.reasons[0].code,
          message: '资质校验未通过：' + eligibility.reasons.map((r) => r.message).join('；'),
          data: { reasons: eligibility.reasons },
        };
        return;
      }
      await conn.query(
        'UPDATE deliveries SET companion_id = ?, status = ?, accepted_at = NOW() WHERE order_id = ?',
        [cid, DELIVERY_STATUS.ACCEPTED, ctx.params.id],
      );
      await conn.query('UPDATE orders SET status = ? WHERE id = ?', [ORDER_STATUS.ASSIGNED, ctx.params.id]);
      await conn.commit();
      // TODO(改造)：订阅消息通知待 notify 服务按陪诊文案改造后接回（推送资质待确认）
      ok(ctx, { ok: true });
    } catch (e) { await conn.rollback(); throw e; } finally { if (conn) conn.release(); }
  });

  // 当日工作量统计（默认今天）
  router.get('/companion/stats', authenticate, authorize('companion'), async (ctx) => {
    const cid = ctx.state.user.userId;
    const date = ctx.query.date || todayStr();
    const [[row]] = await pool.query(
      `SELECT
         COUNT(CASE WHEN DATE(d.accepted_at) = ? THEN d.id END)                    AS accepted_orders,
         SUM(CASE WHEN d.status = ? AND DATE(d.finished_at) = ? THEN 1 ELSE 0 END) AS finished_orders,
         SUM(CASE WHEN d.status IN (?, ?) THEN 1 ELSE 0 END)                       AS ongoing_orders
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE d.companion_id = ? AND o.pay_status IN (1, 3) AND o.status != 0`,
      [date, DELIVERY_STATUS.DONE, date, DELIVERY_STATUS.ACCEPTED, DELIVERY_STATUS.SERVING, cid],
    );
    ok(ctx, {
      date,
      acceptedOrders: Number(row.accepted_orders) || 0,
      finishedOrders: Number(row.finished_orders) || 0,
      ongoingOrders: Number(row.ongoing_orders) || 0,
    });
  });

  // 我的资料
  router.get('/companion/me', authenticate, authorize('companion'), async (ctx) => {
    const cid = ctx.state.user.userId;
    const [rows] = await pool.query(
      `SELECT id, real_name, phone, gender, avatar, cert_type, cert_no, cert_expire,
              health_cert_no, health_cert_expire, train_status, audit_status, audit_remark,
              work_status, hospital_scope, skill_tags, score
       FROM companions WHERE id = ?`,
      [cid],
    );
    if (!rows.length) {
      ctx.status = 404;
      ctx.body = { code: 'NOT_FOUND', message: '陪诊员不存在', data: null };
      return;
    }
    ok(ctx, rows[0]);
  });

  // 我的资质状态与可接单范围（含不可接单原因）
  router.get('/companion/me/capability', authenticate, authorize('companion'), async (ctx) => {
    const cid = ctx.state.user.userId;
    const result = await checkCompanionEligibility(cid, {});
    const [rows] = await pool.query('SELECT hospital_scope, skill_tags FROM companions WHERE id = ?', [cid]);
    ok(ctx, {
      eligible: result.eligible,
      reasons: result.reasons,
      hospitalScope: rows.length ? rows[0].hospital_scope : null,
      skillTags: rows.length ? rows[0].skill_tags : null,
    });
  });
}

module.exports = { register };
