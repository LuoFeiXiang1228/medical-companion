// 客服与帮助
const catalog = require('../../services/catalog');

Page({
  data: { service: {}, notice: '' },

  onLoad() { this.load(); },

  async load() {
    try {
      const s = await catalog.getPublicSettings();
      this.setData({ notice: (s && s.notice) || '', service: (s && s.service) || {} });
    } catch (e) { /* 静默 */ }
  },

  copyPhone() {
    const p = this.data.service.phone;
    if (p) wx.setClipboardData({ data: p, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },
  copyWechat() {
    const w = this.data.service.wechat;
    if (w) wx.setClipboardData({ data: w, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
  },
});
