// 首页：公告 + 快捷入口 + 服务分类 + 服务项目列表
const catalog = require('../../services/catalog');
const { bootstrap } = require('../../utils/request');

Page({
  data: {
    notice: '',
    categories: [{ id: 0, name: '全部' }],
    activeCategory: 0,
    packages: [],
    loading: false,
  },

  onLoad() { this.init(); },

  async onPullDownRefresh() {
    await this.init();
    wx.stopPullDownRefresh();
  },

  async init() {
    try { await bootstrap(); } catch (e) { /* 401 恢复由请求层处理 */ }
    this.loadNotice();
    this.loadCategories();
    this.loadPackages();
  },

  async loadNotice() {
    try {
      const s = await catalog.getPublicSettings();
      this.setData({ notice: (s && s.notice) || '' });
    } catch (e) { /* 静默 */ }
  },

  async loadCategories() {
    try {
      const list = await catalog.getCategories();
      this.setData({ categories: [{ id: 0, name: '全部' }].concat(list || []) });
    } catch (e) { /* 静默 */ }
  },

  async loadPackages() {
    this.setData({ loading: true });
    try {
      const params = this.data.activeCategory ? { categoryId: this.data.activeCategory } : {};
      const list = await catalog.getPackages(params);
      this.setData({ packages: list || [] });
    } catch (e) { /* 静默 */ } finally {
      this.setData({ loading: false });
    }
  },

  onCategory(e) {
    const id = Number(e.currentTarget.dataset.id);
    this.setData({ activeCategory: id }, () => this.loadPackages());
  },

  goPackage(e) {
    wx.navigateTo({ url: '/pages/package/package?id=' + e.currentTarget.dataset.id });
  },
  goPatients() { wx.navigateTo({ url: '/pages/patients/patients' }); },
  goOrders() { wx.switchTab({ url: '/pages/order/order' }); },
});
