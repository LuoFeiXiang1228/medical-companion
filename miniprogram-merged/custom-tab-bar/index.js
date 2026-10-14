const { getRole } = require('../utils/request');

Component({
  data: {
    selected: 0,
    role: '',
    // 用户端 tab：首页 / 订单 / 我的
    userList: [
      { pagePath: '/pages/index/index', text: '首页', icon: '🏠' },
      { pagePath: '/pages/order/order', text: '订单', icon: '📋' },
      { pagePath: '/pages/mine/mine', text: '我的', icon: '👤' },
    ],
    // 陪诊员端 tab
    companionList: [
      { pagePath: '/pages/companion/index/index', text: '任务', icon: '📦' },
      { pagePath: '/pages/companion/mine/mine', text: '我的', icon: '🧑⚕️' },
    ],
    list: [],
  },

  lifetimes: {
    attached() { this.refresh(); },
  },

  pageLifetimes: {
    show() { this.refresh(); },
  },

  methods: {
    refresh() {
      const role = getRole();
      const isCompanionRole = role === 'companion';
      const list = isCompanionRole ? this.data.companionList : this.data.userList;
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      const path = '/' + (cur && cur.route ? cur.route : 'pages/index/index');
      let selected = list.findIndex((t) => t.pagePath === path);
      if (selected < 0) selected = 0;
      this.setData({ role, list, selected });
    },

    onTap(e) {
      const item = e.currentTarget.dataset.item;
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      if (cur && '/' + cur.route === item.pagePath) return; // 当前页不重复切换
      wx.switchTab({ url: item.pagePath });
    },
  },
});