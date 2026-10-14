// 搜索服务项目
const catalog = require('../../services/catalog');

Page({
  data: { keyword: '', list: [], searched: false, loading: false },

  onInput(e) { this.setData({ keyword: e.detail.value }); },

  async doSearch() {
    const kw = this.data.keyword.trim();
    if (!kw) { wx.showToast({ title: '请输入关键词', icon: 'none' }); return; }
    this.setData({ loading: true });
    try {
      const list = await catalog.getPackages({ keyword: kw });
      this.setData({ list: list || [], searched: true });
    } catch (e) { /* 静默 */ } finally {
      this.setData({ loading: false });
    }
  },

  goPackage(e) {
    wx.navigateTo({ url: '/pages/package/package?id=' + e.currentTarget.dataset.id });
  },
});
