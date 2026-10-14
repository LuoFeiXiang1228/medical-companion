// 首次启动隐私授权弹窗
// 兼容两种模式：
// 1) 基础库支持官方隐私接口 -> 用 <button open-type="agreePrivacyAuthorization"> 完成微信侧授权
// 2) 不支持（旧基础库 / 后台未配置指引）-> 退化成普通按钮，只记录本地同意态
const privacy = require('../../utils/privacy');
const { track } = require('../../utils/track');

Component({
  data: {
    visible: false,
    useWxAuth: false, // 是否走微信官方授权按钮
  },

  lifetimes: {
    attached() {
      this.resolveList = [];
      this.setData({ useWxAuth: privacy.supported() });

      // 微信侧主动拦截：调用 getLocation 等接口时会回调这里，弹窗后必须调 resolve
      if (typeof wx.onNeedPrivacyAuthorization === 'function') {
        wx.onNeedPrivacyAuthorization((resolve) => {
          this.resolveList.push(resolve);
          this.setData({ visible: true });
        });
      }

      // 本地首启未同意 -> 主动弹一次
      if (!privacy.hasAgreed()) {
        this.setData({ visible: true });
      }
    },
  },

  methods: {
    // 官方授权按钮回调
    onAgreeWx() {
      this.finish(true);
    },

    // 退化模式的普通同意按钮
    onAgreePlain() {
      this.finish(true);
    },

    onDisagree() {
      wx.showModal({
        title: '无法继续',
        content: '不同意隐私政策将无法下单和配送。你可以先浏览商品，需要下单时再同意。',
        confirmText: '我知道了',
        showCancel: false,
      });
      this.finish(false);
    },

    finish(agreed) {
      if (agreed) {
        privacy.setAgreed();
        track('privacy_agree');
      }
      // 通知微信侧继续/中断被拦截的接口调用
      this.resolveList.forEach((fn) => {
        try { fn({ event: agreed ? 'agree' : 'disagree', buttonId: 'agree-btn' }); } catch (e) {}
      });
      this.resolveList = [];
      this.setData({ visible: false });
      this.triggerEvent('done', { agreed });
    },

    goPrivacy() {
      wx.navigateTo({ url: '/pages/legal/legal?type=privacy' });
    },

    goAgreement() {
      wx.navigateTo({ url: '/pages/legal/legal?type=agreement' });
    },

    noop() {},
  },
});
