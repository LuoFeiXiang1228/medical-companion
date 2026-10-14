// 我的订单列表（按状态筛选；点击进入详情）
const ordersApi = require('../../services/orders');

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: '10', label: '待受理' },
  { value: '20', label: '待派单' },
  { value: '30', label: '待服务' },
  { value: '40', label: '服务中' },
  { value: '50', label: '已完成' },
];
const STATUS_TEXT = {
  10: '待受理', 20: '已受理 · 待派单', 30: '已派单 · 待服务',
  40: '服务中', 50: '已完成', 0: '已取消', 60: '纠纷处理中',
};
const STAGE_TEXT = { 1: '服务信息提供', 2: '委托与受理', 3: '服务交付' };

Page({
  data: { tabs: STATUS_TABS, activeTab: '', orders: [], loading: false },

  onShow() { this.load(); },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  onTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.value || '' }, () => this.load());
  },

  async load() {
    this.setData({ loading: true });
    try {
      const list = await ordersApi.listOrders(this.data.activeTab);
      const orders = (list || []).map((o) => ({
        ...o,
        statusText: STATUS_TEXT[o.status] || '',
        stageText: STAGE_TEXT[o.stage] || '',
        serviceDate: String(o.service_date || '').slice(0, 10),
        canPay: o.pay_status === 0 && o.status !== 0,
      }));
      this.setData({ orders });
    } catch (e) { /* 静默 */ } finally {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + e.currentTarget.dataset.id });
  },
});
