// 服务项目详情：服务信息 + 服务边界声明 + 立即预约
const catalog = require('../../services/catalog');

Page({
  data: { id: 0, pkg: null, boundary: null, loading: true },

  onLoad(query) {
    this.setData({ id: Number(query.id || 0) });
    this.load();
  },

  async load() {
    try {
      const [pkg, boundary] = await Promise.all([
        catalog.getPackageDetail(this.data.id),
        catalog.getServiceBoundary().catch(() => null),
      ]);
      this.setData({ pkg, boundary });
    } catch (e) { /* 提示已处理 */ } finally {
      this.setData({ loading: false });
    }
  },

  goBooking() {
    if (!this.data.pkg) return;
    wx.navigateTo({ url: '/pages/booking/booking?packageId=' + this.data.pkg.id });
  },
});
