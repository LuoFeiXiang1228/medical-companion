// 陪诊员工作台：当日统计 + 资质提示 + 待接单池 / 我的任务
const companionApi = require('../../../services/companion');
const { isCompanionLoggedIn } = require('../../../utils/request');

const TASK_STATUS_TEXT = {
  10: '待受理', 20: '待派单', 30: '待服务', 40: '服务中', 50: '已完成', 0: '已取消', 60: '纠纷中',
};

Page({
  data: {
    tab: 'pool', // pool | mine
    stats: null,
    qualified: true,
    reasons: [],
    pool: [],
    tasks: [],
    acceptingId: 0,
  },

  onShow() {
    if (!isCompanionLoggedIn()) {
      wx.reLaunch({ url: '/pages/companion/login/login' });
      return;
    }
    this.loadAll();
  },

  async onPullDownRefresh() {
    await this.loadAll();
    wx.stopPullDownRefresh();
  },

  async loadAll() {
    this.loadStats();
    this.loadCapability();
    this.loadPool();
    this.loadTasks();
  },

  async loadStats() {
    try { const stats = await companionApi.getStats(); this.setData({ stats }); } catch (e) { /* 静默 */ }
  },
  async loadCapability() {
    try {
      const cap = await companionApi.getCapability();
      this.setData({ qualified: !!cap.eligible, reasons: cap.reasons || [] });
    } catch (e) { /* 静默 */ }
  },
  async loadPool() {
    try {
      const list = await companionApi.getAvailable();
      this.setData({ pool: (list || []).map((o) => ({ ...o, serviceDate: String(o.service_date || '').slice(0, 10) })) });
    } catch (e) { /* 静默 */ }
  },
  async loadTasks() {
    try {
      const list = await companionApi.getTasks();
      this.setData({
        tasks: (list || []).map((o) => ({
          ...o,
          serviceDate: String(o.service_date || '').slice(0, 10),
          statusText: TASK_STATUS_TEXT[o.status] || '',
        })),
      });
    } catch (e) { /* 静默 */ }
  },

  onTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },
  goDetail(e) {
    wx.navigateTo({ url: '/pages/companion/task-detail/task-detail?id=' + e.currentTarget.dataset.id });
  },
  goMine() { wx.switchTab({ url: '/pages/companion/mine/mine' }); },

  async accept(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.acceptingId) return;
    this.setData({ acceptingId: id });
    try {
      await companionApi.acceptTask(id);
      wx.showToast({ title: '接单成功', icon: 'success' });
      this.loadAll();
    } catch (err) { /* 资质校验失败等，message 已含原因 */ } finally {
      this.setData({ acceptingId: 0 });
    }
  },
});
