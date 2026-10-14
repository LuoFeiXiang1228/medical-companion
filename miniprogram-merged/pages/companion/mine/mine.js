// 陪诊员 · 我的：资质状态 / 可接单范围 / 当日统计 / 退出登录
const companionApi = require('../../../services/companion');
const { companionLogout, isCompanionLoggedIn } = require('../../../utils/request');

const AUDIT_TEXT = { 0: '审核中', 1: '已通过', 2: '已驳回' };
const TRAIN_TEXT = { 0: '未培训', 1: '培训中', 2: '已完成' };

Page({
  data: { me: null, capability: null, stats: null, auditText: '', trainText: '' },

  onShow() {
    if (!isCompanionLoggedIn()) {
      wx.reLaunch({ url: '/pages/companion/login/login' });
      return;
    }
    this.load();
  },

  async load() {
    try {
      const [me, capability, stats] = await Promise.all([
        companionApi.getMe(),
        companionApi.getCapability().catch(() => null),
        companionApi.getStats().catch(() => null),
      ]);
      this.setData({
        me,
        capability,
        stats,
        auditText: AUDIT_TEXT[me.audit_status] || '',
        trainText: TRAIN_TEXT[me.train_status] || '',
      });
    } catch (e) { /* 静默 */ }
  },

  tipCert() {
    wx.showModal({
      title: '资质与证件',
      content: '证件更新（健康证 / 职业能力证书）请联系机构管理员在管理端录入；证件到期前请及时更新，否则将无法接单。',
      showCancel: false,
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出陪诊员端吗？',
      success: (r) => {
        if (!r.confirm) return;
        companionLogout();
        wx.reLaunch({ url: '/pages/index/index' });
      },
    });
  },
});
