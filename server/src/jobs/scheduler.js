// 定时任务：超时未支付订单自动取消、库存回滚等
const orderService = require('../features/orders/order.service');

function startScheduler() {
  // 默认每 30 秒扫描一次，可用环境变量 ORDER_EXPIRE_INTERVAL_MS 调整
  const interval = parseInt(process.env.ORDER_EXPIRE_INTERVAL_MS, 10) || 30000;
  setInterval(async () => {
    try {
      const n = await orderService.expireUnpaidOrders();
      if (n > 0) console.log(`[scheduler] expired ${n} unpaid order(s)`);
    } catch (e) {
      console.error('[scheduler] expire unpaid orders failed:', e.message);
    }
  }, interval);
  console.log(`[scheduler] started: expire unpaid orders every ${interval}ms`);
}

module.exports = { startScheduler };
