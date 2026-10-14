const Router = require('koa-router');
const pool = require('../../db/mysql');
const { ok } = require('../../utils/response');
const { authenticate } = require('../../middleware/auth');
const orderService = require('./order.service');
const payment = require('../../payment');

function register(router) {
  // 创建订单（服务包 + 就医人 + 医院科室 + 就诊日期时段）
  router.post('/orders', authenticate, async (ctx) => {
    const uid = ctx.state.user.userId;
    const b = ctx.request.body || {};
    const result = await orderService.createOrder({
      userId: uid,
      packageId: b.packageId,
      patientId: b.patientId,
      hospitalId: b.hospitalId,
      departmentId: b.departmentId,
      appointDate: b.appointDate,
      appointSlot: b.appointSlot,
      riskAssessment: b.riskAssessment,
      remark: b.remark,
    });
    ok(ctx, result);
  });

  // 获取支付参数（mock 通道返回 mock:true；wechat 通道返回 wx.requestPayment 参数）
  router.post('/orders/:id/prepay', authenticate, async (ctx) => {
    const uid = ctx.state.user.userId;
    const [users] = await pool.query('SELECT openid FROM users WHERE id=?', [uid]);
    const openid = users[0] && users[0].openid;
    if (!openid) { ctx.status = 400; ctx.body = { code: 'NO_OPENID', message: '当前账号无微信 openid，无法发起支付', data: null }; return; }
    try {
      const result = await orderService.prepay({ orderId: ctx.params.id, userId: uid, openid });
      ok(ctx, result);
    } catch (e) {
      if (e && e.isOperational) throw e; // 业务错误（订单不存在 / 已支付 / 已取消等）如实返回
      ctx.status = 400;
      ctx.body = { code: 'PAY_ERROR', message: e.message || '支付参数获取失败', data: null };
    }
  });

  // 支付通道信息（前端据此展示「模拟支付」标识等）
  router.get('/pay/channel', (ctx) => {
    ok(ctx, payment.getChannelInfo());
  });

  // 模拟支付确认（仅 PAY_CHANNEL=mock 可用；生产环境自动失效）
  // 与真实支付共用同一套订单状态流转（order.service.confirmPayment）
  router.post('/pay/mock-confirm', authenticate, async (ctx) => {
    if (!payment.isMock()) { ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '接口不存在', data: null }; return; }
    const b = ctx.request.body || {};
    const uid = ctx.state.user.userId;
    const result = await orderService.mockConfirm({ orderId: b.orderId, userId: uid });
    ok(ctx, result);
  });

  // 未验证的真实支付回调不参与入账，避免伪造通知。
  router.post('/orders/wxpay/callback', (ctx) => {
    ctx.status = 501;
    ctx.body = { code: 'NOT_IMPLEMENTED', message: '演示版未开放真实支付', data: null };
  });

  // 我的订单列表（按状态筛选）
  router.get('/orders', authenticate, async (ctx) => {
    const uid = ctx.state.user.userId;
    const rows = await orderService.listOrders({ userId: uid, status: ctx.query.status });
    ok(ctx, rows);
  });

  // 订单详情（服务包明细 + 协议状态 + 留痕 + 风险评估 + 陪诊员脱敏信息）
  router.get('/orders/:id', authenticate, async (ctx) => {
    const uid = ctx.state.user.userId;
    const result = await orderService.getOrderDetail({ orderId: ctx.params.id, userId: uid });
    ok(ctx, result);
  });

  // 家属端进度时间轴
  router.get('/orders/:id/timeline', authenticate, async (ctx) => {
    const uid = ctx.state.user.userId;
    const timeline = await orderService.getOrderTimeline({ orderId: ctx.params.id, userId: uid });
    ok(ctx, timeline);
  });

  // 轻量状态轮询（家属端高频调用，避免拉全量详情）
  router.get('/orders/:id/status', authenticate, async (ctx) => {
    const uid = ctx.state.user.userId;
    const status = await orderService.getOrderStatus({ orderId: ctx.params.id, userId: uid });
    ok(ctx, status);
  });
}

module.exports = { register };
