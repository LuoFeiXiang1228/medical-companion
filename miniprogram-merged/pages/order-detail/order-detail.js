// 订单详情：状态 / 服务信息 / 进度时间轴 / 留痕（只读）/ 协议状态 / 支付入口
const ordersApi = require('../../services/orders');

const STATUS_TEXT = {
  10: '待受理', 20: '已受理 · 待派单', 30: '已派单 · 待服务',
  40: '服务中', 50: '已完成', 0: '已取消', 60: '纠纷处理中',
};
const STAGE_TEXT = { 1: '服务信息提供', 2: '委托与受理', 3: '服务交付' };

function fmtTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(5, 16);
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getMonth() + 1}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    id: 0,
    order: null,
    items: [],
    logs: [],
    consent: null,
    companion: null,
    timeline: [],
    statusText: '',
    stageText: '',
    loading: true,
    paying: false,
  },

  onLoad(query) {
    this.setData({ id: Number(query.id || 0) });
    this.load();
  },

  async load() {
    try {
      const detail = await ordersApi.getOrderDetail(this.data.id);
      const o = detail.order || {};
      const logs = (detail.logs || []).map((l) => ({
        ...l,
        timeText: fmtTime(l.occurred_at),
        isCorrection: l.node_code === 'CORRECTION',
      }));
      this.setData({
        order: o,
        items: detail.items || [],
        logs,
        consent: detail.consent || null,
        companion: detail.companion || null,
        statusText: STATUS_TEXT[o.status] || '',
        stageText: STAGE_TEXT[o.stage] || '',
      });
      this.loadTimeline();
    } catch (e) { /* 提示已处理 */ } finally {
      this.setData({ loading: false });
    }
  },

  async loadTimeline() {
    try {
      const list = await ordersApi.getOrderTimeline(this.data.id);
      const timeline = (list || []).map((t) => ({ ...t, timeText: fmtTime(t.at) }));
      this.setData({ timeline });
    } catch (e) { /* 静默 */ }
  },

  // 未支付订单可继续支付（mock / 微信通道）
  async payNow() {
    const o = this.data.order;
    if (!o || this.data.paying) return;
    this.setData({ paying: true });
    try {
      const prepay = await ordersApi.prepay(o.id);
      if (prepay && prepay.mock) {
        const confirmed = await new Promise((resolve) => {
          wx.showModal({
            title: '测试环境 · 模拟支付',
            content: `订单金额 ¥${o.total_amount}。点击「确认支付」即视为支付成功。`,
            confirmText: '确认支付',
            success: (r) => resolve(!!r.confirm),
            fail: () => resolve(false),
          });
        });
        if (confirmed) {
          await ordersApi.mockConfirm(o.id);
          wx.showToast({ title: '支付成功', icon: 'success' });
        }
      } else if (prepay && prepay.timeStamp) {
        await new Promise((resolve, reject) => {
          wx.requestPayment(Object.assign({}, prepay, { success: resolve, fail: reject }));
        });
        wx.showToast({ title: '支付成功', icon: 'success' });
      }
    } catch (e) { /* 静默 */ } finally {
      this.setData({ paying: false });
      this.load();
    }
  },
});
