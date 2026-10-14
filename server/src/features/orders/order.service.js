const crypto = require('crypto');
const pool = require('../../db/mysql');
const { ConflictError, NotFoundError, ValidationError } = require('../../errors');
const payment = require('../../payment');

// 订单状态机（7 态）：
// 10待受理 → 20已受理待派单 → 30已派单待服务 → 40服务中 → 50已完成；0已取消；60纠纷中
const STATUS = { PENDING_REVIEW: 10, ACCEPTED: 20, ASSIGNED: 30, SERVING: 40, DONE: 50, CANCELLED: 0, DISPUTE: 60 };
// 国标三阶段：1服务信息提供 2委托与受理 3服务交付
const STAGE = { INFO: 1, COMMISSION: 2, DELIVERY: 3 };

function genOrderNo() {
  return 'PZ' + Date.now().toString() + crypto.randomBytes(2).toString('hex');
}

// 格式化为本地时区日期字符串 YYYY-MM-DD（避免 toISOString() 使用 UTC 导致跨天错误）
function formatLocalDate(d = new Date()) {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

// 姓名脱敏（家属端展示陪诊员信息时使用）
function maskName(name) {
  if (!name) return null;
  return String(name)[0] + '*';
}

// 创建订单：服务包 + 就医人 + 医院科室 + 就诊日期时段
// 约定：下单进入国标阶段 1（服务信息提供）；待机构受理（阶段 2）后进入派单流程
async function createOrder({ userId, packageId, patientId, hospitalId, departmentId, appointDate, appointSlot, riskAssessment, remark }) {
  if (!packageId) throw new ValidationError('请选择服务项目');
  if (!patientId) throw new ValidationError('请选择就医人');
  if (!hospitalId || !departmentId) throw new ValidationError('请选择医院与科室');
  if (!appointDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(appointDate))) throw new ValidationError('请选择就诊日期');
  if (String(appointDate) < formatLocalDate()) throw new ValidationError('就诊日期不能早于今天');

  const [pkg] = await pool.query('SELECT * FROM service_types WHERE id=? AND status=1', [packageId]);
  if (!pkg.length) throw new ValidationError('服务项目不存在或已下架');
  const [pt] = await pool.query('SELECT id FROM patient_info WHERE id=? AND owner_user_id=?', [patientId, userId]);
  if (!pt.length) throw new NotFoundError('就医人不存在');
  const [hosp] = await pool.query('SELECT id FROM hospitals WHERE id=? AND status=1', [hospitalId]);
  if (!hosp.length) throw new ValidationError('医院不存在或已停用');
  const [dep] = await pool.query('SELECT id FROM departments WHERE id=? AND hospital_id=? AND status=1', [departmentId, hospitalId]);
  if (!dep.length) throw new ValidationError('科室不存在或与医院不匹配');
  if (appointSlot) {
    const [slot] = await pool.query('SELECT id FROM delivery_slots WHERE id=?', [appointSlot]);
    if (!slot.length) throw new ValidationError('就诊时段不存在');
  }

  const total = Number(pkg[0].price).toFixed(2);
  const orderNo = genOrderNo();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO orders
         (order_no, user_id, patient_id, service_type_id, hospital_id, department_id, slot_id, service_date,
          stage, status, total_amount, pay_status, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?)`,
      [orderNo, userId, patientId, packageId, hospitalId, departmentId, appointSlot || null, appointDate,
        STAGE.INFO, STATUS.PENDING_REVIEW, total, remark ? String(remark).slice(0, 255) : null],
    );
    const orderId = r.insertId;
    await conn.query(
      `INSERT INTO order_items (order_id, service_type_id, name, price, quantity, subtotal, snapshot_positive_codes)
       VALUES (?,?,?,?,1,?,?)`,
      [orderId, packageId, pkg[0].name, pkg[0].price, total, pkg[0].positive_list_codes || null],
    );
    await conn.query(
      'INSERT INTO deliveries (order_id, companion_id, slot_id, status) VALUES (?,NULL,?,10)',
      [orderId, appointSlot || null],
    );
    if (riskAssessment && typeof riskAssessment === 'object') {
      const [rr] = await conn.query(
        'INSERT INTO risk_assessments (order_id, patient_id, items, risk_level) VALUES (?,?,?,?)',
        [orderId, patientId, JSON.stringify(riskAssessment.items || riskAssessment), riskAssessment.riskLevel || null],
      );
      await conn.query('UPDATE orders SET risk_assessment_id=? WHERE id=?', [rr.insertId, orderId]);
    }
    await conn.commit();
    return { orderId, orderNo, totalAmount: total };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// 获取支付参数（支付适配层：mock 模拟通道 / wechat 微信支付）
async function prepay({ orderId, userId, openid }) {
  const [orders] = await pool.query('SELECT * FROM orders WHERE id=? AND user_id=?', [orderId, userId]);
  if (!orders.length) throw new NotFoundError('订单不存在');
  const order = orders[0];
  if (order.status === STATUS.CANCELLED) throw new ConflictError('订单已取消');
  if (order.pay_status === 1) return { alreadyPaid: true, orderId };

  const amountFen = Math.round(Number(order.total_amount) * 100);
  const params = await payment.createPayment({
    orderNo: order.order_no,
    amountFen,
    description: `陪诊服务订单 ${order.order_no}`,
    openid,
  });
  return { ...params, orderId, channel: payment.channel };
}

// 支付成功入账（微信回调 / 模拟支付确认共用同一套状态流转；按订单幂等）
async function confirmPayment(orderNo, { transactionId = null, method = 'wechat' } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [orders] = await conn.query('SELECT * FROM orders WHERE order_no=? FOR UPDATE', [orderNo]);
    if (!orders.length) { await conn.rollback(); return { ok: false, reason: 'ORDER_NOT_FOUND' }; }
    const order = orders[0];
    if (order.pay_status === 1) { await conn.commit(); return { ok: true, alreadyPaid: true }; } // 幂等
    if (order.status === STATUS.CANCELLED) { await conn.rollback(); return { ok: false, reason: 'ORDER_CANCELLED' }; }

    await conn.query('UPDATE orders SET pay_status=1, pay_time=NOW() WHERE id=?', [order.id]);
    const [exist] = await conn.query('SELECT id FROM payments WHERE order_id=? LIMIT 1', [order.id]);
    if (exist.length) {
      await conn.query(
        'UPDATE payments SET transaction_id=?, amount=?, method=?, status=1, paid_at=NOW() WHERE id=?',
        [transactionId, order.total_amount, method, exist[0].id],
      );
    } else {
      await conn.query(
        'INSERT INTO payments (order_id, transaction_id, amount, method, status, paid_at) VALUES (?,?,?,?,1,NOW())',
        [order.id, transactionId, order.total_amount, method],
      );
    }
    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// 模拟支付确认（仅 PAY_CHANNEL=mock 时可用；走与真实回调相同的入账逻辑）
async function mockConfirm({ orderId, userId }) {
  const [orders] = await pool.query('SELECT id, order_no, user_id FROM orders WHERE id=? AND user_id=?', [orderId, userId]);
  if (!orders.length) throw new NotFoundError('订单不存在');
  return confirmPayment(orders[0].order_no, { transactionId: 'MOCK_' + Date.now(), method: 'mock' });
}

// 机构受理（国标阶段 2 起点；管理端调用，admin 批次接入）
async function acceptCommission(orderId) {
  const [r] = await pool.query(
    'UPDATE orders SET status=?, stage=? WHERE id=? AND status=? AND pay_status=1',
    [STATUS.ACCEPTED, STAGE.COMMISSION, orderId, STATUS.PENDING_REVIEW],
  );
  if (!r.affectedRows) throw new ConflictError('订单当前状态不可受理（需已支付且待受理）');
  return { ok: true };
}

// 我的订单列表（按状态筛选，LIMIT 100）
async function listOrders({ userId, status }) {
  let sql = `SELECT o.id, o.order_no, o.status, o.stage, o.service_date, o.total_amount, o.pay_status,
                    h.name AS hospital_name, dep.name AS department_name, s.time_label,
                    p.real_name AS patient_name, st.name AS service_name,
                    d.status AS delivery_status
             FROM orders o
             LEFT JOIN hospitals h ON h.id=o.hospital_id
             LEFT JOIN departments dep ON dep.id=o.department_id
             LEFT JOIN delivery_slots s ON s.id=o.slot_id
             LEFT JOIN patient_info p ON p.id=o.patient_id
             LEFT JOIN service_types st ON st.id=o.service_type_id
             LEFT JOIN deliveries d ON d.order_id=o.id
             WHERE o.user_id=?`;
  const params = [userId];
  if (status !== undefined && status !== '') { sql += ' AND o.status=?'; params.push(Number(status)); }
  sql += ' ORDER BY o.id DESC LIMIT 100';
  const [rows] = await pool.query(sql, params);
  return rows;
}

// 订单详情（家属端）：服务包明细 + 协议状态 + 留痕 + 风险评估 + 陪诊员（脱敏）
async function getOrderDetail({ orderId, userId }) {
  const [rows] = await pool.query(
    `SELECT o.*, h.name AS hospital_name, h.address AS hospital_address,
            dep.name AS department_name, dep.floor, dep.building,
            s.time_label, p.real_name AS patient_name, p.gender, p.mobility, p.relation
     FROM orders o
     LEFT JOIN hospitals h ON h.id=o.hospital_id
     LEFT JOIN departments dep ON dep.id=o.department_id
     LEFT JOIN delivery_slots s ON s.id=o.slot_id
     LEFT JOIN patient_info p ON p.id=o.patient_id
     WHERE o.id=? AND o.user_id=?`,
    [orderId, userId],
  );
  if (!rows.length) throw new NotFoundError('订单不存在');
  const order = rows[0];

  const [items] = await pool.query(
    'SELECT service_type_id, name, price, quantity, subtotal FROM order_items WHERE order_id=?',
    [orderId],
  );
  const [consents] = await pool.query(
    'SELECT id, sign_status, signed_at FROM service_consents WHERE order_id=? LIMIT 1',
    [orderId],
  );
  const [logs] = await pool.query(
    `SELECT id, node_code, node_name, seq, occurred_at, location_text, remark, proof_images, is_flagged
     FROM service_logs WHERE order_id=? ORDER BY seq, id`,
    [orderId],
  );
  const [risks] = await pool.query(
    'SELECT id, risk_level, emergency_triggered, created_at FROM risk_assessments WHERE order_id=? LIMIT 1',
    [orderId],
  );

  // 陪诊员信息（脱敏：不返回手机号与证件信息，姓名脱敏展示）
  let companion = null;
  const [d] = await pool.query('SELECT companion_id FROM deliveries WHERE order_id=?', [orderId]);
  if (d.length && d[0].companion_id) {
    const [cs] = await pool.query('SELECT id, real_name, avatar, score, skill_tags FROM companions WHERE id=?', [d[0].companion_id]);
    if (cs.length) companion = { ...cs[0], real_name: maskName(cs[0].real_name) };
  }

  return {
    order,
    items,
    consent: consents[0] || null,
    logs,
    riskAssessment: risks[0] || null,
    companion,
  };
}

// 家属端进度时间轴（把合规留痕转成可感知的进度）
async function getOrderTimeline({ orderId, userId }) {
  const [rows] = await pool.query(
    `SELECT o.id, o.status, o.created_at, o.pay_time, o.cancelled_at,
            d.accepted_at, d.finished_at
     FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id
     WHERE o.id=? AND o.user_id=?`,
    [orderId, userId],
  );
  if (!rows.length) throw new NotFoundError('订单不存在');
  const o = rows[0];

  const timeline = [];
  timeline.push({ at: o.created_at, type: 'created', title: '提交服务委托' });
  if (o.pay_time) timeline.push({ at: o.pay_time, type: 'paid', title: '完成支付' });
  if (o.accepted_at) timeline.push({ at: o.accepted_at, type: 'accepted', title: '陪诊员已接单' });

  const [logs] = await pool.query(
    'SELECT node_code, node_name, occurred_at, remark FROM service_logs WHERE order_id=? ORDER BY seq, id',
    [orderId],
  );
  for (const l of logs) {
    timeline.push({
      at: l.occurred_at,
      type: l.node_code === 'CORRECTION' ? 'correction' : 'checkin',
      title: l.node_name || l.node_code,
      desc: l.node_code === 'CORRECTION' ? (l.remark || null) : null,
    });
  }

  if (o.finished_at) timeline.push({ at: o.finished_at, type: 'finished', title: '服务完成' });
  if (o.cancelled_at) timeline.push({ at: o.cancelled_at, type: 'cancelled', title: '订单已取消' });

  timeline.sort((a, b) => new Date(a.at) - new Date(b.at));
  return timeline;
}

// 轻量状态轮询（家属端高频调用）
async function getOrderStatus({ orderId, userId }) {
  const [rows] = await pool.query(
    'SELECT id, status, stage, pay_status, updated_at FROM orders WHERE id=? AND user_id=?',
    [orderId, userId],
  );
  if (!rows.length) throw new NotFoundError('订单不存在');
  return rows[0];
}

// 超时未支付自动取消（定时任务调用；默认 5 分钟，可用 ORDER_EXPIRE_MINUTES 调整）
async function expireUnpaidOrders() {
  const minutes = parseInt(process.env.ORDER_EXPIRE_MINUTES, 10) || 5;
  const [orders] = await pool.query(
    'SELECT id FROM orders WHERE status=? AND pay_status=0 AND cancelled_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)',
    [STATUS.PENDING_REVIEW, minutes],
  );
  let cancelled = 0;
  for (const o of orders) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ord] = await conn.query('SELECT * FROM orders WHERE id=? FOR UPDATE', [o.id]);
      if (!ord.length || ord[0].status !== STATUS.PENDING_REVIEW || ord[0].pay_status !== 0) {
        await conn.rollback(); conn.release(); continue;
      }
      await conn.query('UPDATE orders SET status=?, cancelled_at=NOW() WHERE id=?', [STATUS.CANCELLED, o.id]);
      await conn.query('UPDATE deliveries SET status=? WHERE order_id=?', [STATUS.CANCELLED, o.id]);
      await conn.commit();
      cancelled += 1;
      // TODO(改造)：取消通知待 notify 服务按陪诊文案改造后接回
    } catch (e) {
      await conn.rollback();
      console.error('expire unpaid order failed:', o.id, e.message);
    } finally {
      if (conn) conn.release();
    }
  }
  return cancelled;
}

module.exports = {
  STATUS,
  STAGE,
  createOrder,
  prepay,
  confirmPayment,
  mockConfirm,
  acceptCommission,
  listOrders,
  getOrderDetail,
  getOrderTimeline,
  getOrderStatus,
  expireUnpaidOrders,
};
