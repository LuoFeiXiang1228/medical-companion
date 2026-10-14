// 服务过程留痕（国标「服务过程可追溯」落点）
// 设计要点：
//   1. 打卡记录一经提交「不可编辑、不可删除」——接口层不提供 PUT / DELETE；
//      如需更正，只能通过「追加更正说明」接口新増记录，原记录保留。
//   2. 时间戳由服务端落库（occurred_at = NOW()），不接受客户端传入。
//   3. 提交时执行国标规则预检（命中则标记 is_flagged / flag_reason，不丢证据、不阻断）。
// TODO：① 节点集合以接口层图纸为准（11 个），如有增删改动本文件 NODE_TYPES 即可；
//       ② 「关键节点未打卡不可进入下一阶段」的门禁规则待节点集合定稿后细化；
//       ③ 影像脱敏（proof_images）在 utils/upload 扩展后接入；
//       ④ clientTs（客户端时间戳）暂无对应字段，待定。
const Router = require('koa-router');
const pool = require('../../db/mysql');
const { ok } = require('../../utils/response');
const { authenticate, authorize } = require('../../middleware/auth');
const { ValidationError } = require('../../errors');
const { detectViolations } = require('../../services/compliance-check');

// 服务节点枚举（到院 → 离院；对应国标三阶段的服务交付环节）
const NODE_TYPES = {
  ARRIVE_HOSPITAL: '到院',
  TAKE_NUMBER: '取号',
  GUIDE_DEPARTMENT: '引导至科室',
  WAIT_VISIT: '候诊陪同',
  VISIT_COMPANION: '面诊陪同',
  EXAM_ARRANGE: '检查安排/准备',
  SAMPLE_DELIVERY: '样本送检',
  PAY_FEE: '缴费',
  TAKE_MEDICINE: '取药',
  COLLECT_REPORT: '取报告',
  LEAVE_HOSPITAL: '离院/服务结束',
};

// orders.status：30 已派单待服务 40 服务中
const ORDER_STATUS = { ASSIGNED: 30, SERVING: 40, DONE: 50 };
// deliveries.status：20 已接单 30 服务中 40 已完成
const DELIVERY_STATUS = { ACCEPTED: 20, SERVING: 30, DONE: 40 };

function register(router) {
  // 单个节点打卡（陪诊员；原「送达」升级为多节点留痕）
  router.post('/orders/:id/checkin', authenticate, authorize('companion'), async (ctx) => {
    const cid = ctx.state.user.userId;
    const b = ctx.request.body || {};
    const nodeType = String(b.nodeType || '').trim();
    if (!NODE_TYPES[nodeType]) throw new ValidationError('节点类型不合法');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [d] = await conn.query('SELECT * FROM deliveries WHERE order_id = ? FOR UPDATE', [ctx.params.id]);
      if (!d.length) {
        await conn.rollback(); conn.release();
        ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '订单不存在', data: null }; return;
      }
      if (d[0].companion_id !== cid) {
        await conn.rollback(); conn.release();
        ctx.status = 403; ctx.body = { code: 'FORBIDDEN', message: '仅承接本单的陪诊员可打卡', data: null }; return;
      }
      const [ord] = await conn.query('SELECT id, status FROM orders WHERE id = ?', [ctx.params.id]);
      if (!ord.length || ![ORDER_STATUS.ASSIGNED, ORDER_STATUS.SERVING].includes(ord[0].status)) {
        await conn.rollback(); conn.release();
        ctx.status = 409; ctx.body = { code: 'BAD_STATE', message: '当前订单状态不可打卡', data: null }; return;
      }
      const [dup] = await conn.query(
        'SELECT id FROM service_logs WHERE order_id = ? AND node_code = ? LIMIT 1',
        [ctx.params.id, nodeType],
      );
      if (dup.length) {
        await conn.rollback(); conn.release();
        ctx.status = 409; ctx.body = { code: 'DUPLICATE_NODE', message: '该节点已打卡（留痕不可重复提交）', data: null }; return;
      }

      // 国标规则预检：备注文本对照禁止类规则（结果写进留痕，不阻断、不丢证据）
      const hits = await detectViolations(b.remark);

      const [countRows] = await conn.query('SELECT COUNT(*) AS n FROM service_logs WHERE order_id = ?', [ctx.params.id]);
      const seq = Number(countRows[0].n) + 1;
      const photos = Array.isArray(b.photos) ? b.photos.slice(0, 9) : null;

      const [r] = await conn.query(
        `INSERT INTO service_logs
           (order_id, companion_id, node_code, node_name, seq, occurred_at, lng, lat, location_text,
            remark, proof_images, client_ip, is_flagged, flag_reason)
         VALUES (?,?,?,?,?,NOW(),?,?,?,?,?,?,?,?)`,
        [
          ctx.params.id, cid, nodeType, NODE_TYPES[nodeType], seq,
          b.lng || null, b.lat || null,
          b.locationText ? String(b.locationText).slice(0, 255) : null,
          b.remark ? String(b.remark).slice(0, 2000) : null,
          photos ? JSON.stringify(photos) : null,
          ctx.ip,
          hits.length ? 1 : 0,
          hits.length ? hits.map((h) => `${h.code} ${h.title}`).join('；').slice(0, 255) : null,
        ],
      );

      // 状态流转：首次打卡 → 服务中；离院节点 → 完成
      if (ord[0].status === ORDER_STATUS.ASSIGNED) {
        await conn.query('UPDATE orders SET status = ? WHERE id = ?', [ORDER_STATUS.SERVING, ctx.params.id]);
        await conn.query('UPDATE deliveries SET status = ? WHERE order_id = ?', [DELIVERY_STATUS.SERVING, ctx.params.id]);
      }
      if (nodeType === 'LEAVE_HOSPITAL') {
        await conn.query('UPDATE orders SET status = ? WHERE id = ?', [ORDER_STATUS.DONE, ctx.params.id]);
        await conn.query('UPDATE deliveries SET status = ?, finished_at = NOW() WHERE order_id = ?', [DELIVERY_STATUS.DONE, ctx.params.id]);
      }
      await conn.commit();
      ok(ctx, { id: r.insertId, seq, nodeType, flagged: hits.length > 0, hits });
    } catch (e) { await conn.rollback(); throw e; } finally { if (conn) conn.release(); }
  });

  // 某订单全部留痕（家属端 / 陪诊员端 / 管理端证据链共用）
  router.get('/orders/:id/checkins', authenticate, async (ctx) => {
    const { userId, role } = ctx.state.user;
    const [orders] = await pool.query('SELECT id, user_id FROM orders WHERE id = ?', [ctx.params.id]);
    if (!orders.length) {
      ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '订单不存在', data: null }; return;
    }
    const order = orders[0];
    let allowed = false;
    if (role === 'super' || role === 'manager' || role === 'admin') {
      allowed = true;
    } else if (role === 'user') {
      allowed = order.user_id === userId;
    } else if (role === 'companion') {
      const [d] = await pool.query(
        'SELECT id FROM deliveries WHERE order_id = ? AND companion_id = ? LIMIT 1',
        [ctx.params.id, userId],
      );
      allowed = d.length > 0;
    }
    if (!allowed) {
      ctx.status = 403; ctx.body = { code: 'FORBIDDEN', message: '无权限查看该订单留痕', data: null }; return;
    }
    const [rows] = await pool.query(
      `SELECT id, node_code, node_name, seq, occurred_at, lng, lat, location_text,
              remark, proof_images, is_flagged, flag_reason, created_at
       FROM service_logs WHERE order_id = ? ORDER BY seq, id`,
      [ctx.params.id],
    );
    ok(ctx, rows);
  });

  // 追加更正说明（原记录不可改；更正作为新记录追加，原记录保留）
  // 注：更正与原记录的关联暂以文本标注；如需结构化关联，建议追加 corrects_log_id 列（待确认）
  router.post('/orders/:id/checkins/:cid/correction', authenticate, authorize('companion'), async (ctx) => {
    const cid = ctx.state.user.userId;
    const b = ctx.request.body || {};
    const reason = b.reason ? String(b.reason).slice(0, 200).trim() : '';
    const content = String(b.content || '').trim();
    if (!content) throw new ValidationError('请填写更正说明');

    const [d] = await pool.query('SELECT id, companion_id FROM deliveries WHERE order_id = ?', [ctx.params.id]);
    if (!d.length) {
      ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '订单不存在', data: null }; return;
    }
    if (d[0].companion_id !== cid) {
      ctx.status = 403; ctx.body = { code: 'FORBIDDEN', message: '仅承接本单的陪诊员可追加更正', data: null }; return;
    }
    const [target] = await pool.query(
      'SELECT id, node_code, node_name FROM service_logs WHERE id = ? AND order_id = ?',
      [ctx.params.cid, ctx.params.id],
    );
    if (!target.length) {
      ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '待更正的记录不存在', data: null }; return;
    }

    const [countRows] = await pool.query('SELECT COUNT(*) AS n FROM service_logs WHERE order_id = ?', [ctx.params.id]);
    const seq = Number(countRows[0].n) + 1;
    const remark = `对记录 #${target[0].id}（${target[0].node_name || target[0].node_code}）的追加更正${reason ? `（原因：${reason}）` : ''}：${content}`.slice(0, 2000);

    const [r] = await pool.query(
      `INSERT INTO service_logs
         (order_id, companion_id, node_code, node_name, seq, occurred_at, remark, client_ip)
       VALUES (?,?,?,?,?,NOW(),?,?)`,
      [ctx.params.id, cid, 'CORRECTION', '追加更正说明', seq, remark, ctx.ip],
    );
    ok(ctx, { id: r.insertId, corrects: Number(ctx.params.cid) });
  });
}

module.exports = { register };
