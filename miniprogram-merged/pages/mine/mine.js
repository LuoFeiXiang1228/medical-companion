// 我的（用户端）：资料卡 + 快捷入口 + 陪诊员入口（双态）
const { bootstrap, getUserProfile, isCompanionLoggedIn, switchIdentity, normalizeAvatar } = require('../../utils/request');
const catalog = require('../../services/catalog');

Page({
  data: { profile: {}, avatar: '', companionLoggedIn: false },

  onShow() { this.load(); },

  async load() {
    try { await bootstrap(); } catch (e) { /* 静默 */ }
    const profile = getUserProfile();
    this.setData({
      profile,
      avatar: normalizeAvatar(profile.avatar),
      companionLoggedIn: isCompanionLoggedIn(),
    });
  },

  goPatients() { wx.navigateTo({ url: '/pages/patients/patients' }); },
  goOrders() { wx.switchTab({ url: '/pages/order/order' }); },

  async contact() {
    try {
      const s = await catalog.getPublicSettings();
      const svc = (s && s.service) || {};
      wx.showModal({
        title: '联系客服',
        content: `电话：${svc.phone || '未设置'}\n微信：${svc.wechat || '未设置'}\n服务时间：${svc.hours || '-'}`,
        showCancel: false,
      });
    } catch (e) { /* 静默 */ }
  },

  async goCompanion() {
    if (isCompanionLoggedIn()) {
      try {
        await switchIdentity('companion');
        wx.switchTab({ url: '/pages/companion/index/index' });
        return;
      } catch (e) { /* 落到登录页 */ }
    }
    wx.navigateTo({ url: '/pages/companion/login/login' });
  },
});
