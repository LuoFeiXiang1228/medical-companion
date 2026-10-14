const { bootstrap } = require('./utils/request');
const { track, flushNow } = require('./utils/track');
const { loadTemplates } = require('./utils/subscribe');

App({
  globalData: {
    baseUrl: require('./config').API_BASE_URL,
    launchAt: 0,
  },

  onLaunch(options) {
    this.globalData.launchAt = Date.now();

    // 微信官方隐私授权：调用隐私相关接口（如拍照/相册）而未授权时，弹官方隐私窗，
    // 用户同意后自动继续，避免 wx.chooseMedia 因隐私拦截而静默失败、相机打不开
    if (typeof wx.onNeedPrivacyAuthorization === 'function') {
      wx.onNeedPrivacyAuthorization((resolveAuth) => {
        wx.requirePrivacyAuthorize({
          success: () => resolveAuth({ event: 'agree' }),
          fail: () => resolveAuth({ event: 'disagree' }),
        });
      });
    }

    // 启动即静默登录：后端用 openid 判角色（user / companion），决定进入哪个首页
    bootstrap()
      .then(() => track('app_launch', { scene: options && options.scene }))
      .catch(() => track('app_launch', { scene: options && options.scene, anonymous: 1 }));

    // 预热订阅模板缓存，下单时无需等待网络
    loadTemplates().catch(() => {});
  },

  onShow() {
    flushNow();
    // 切回前台时若本地无有效身份，尝试恢复登录（避免 reLaunch 回首页后没触发登录）
    bootstrap().catch(() => {});
  },

  onHide() {
    flushNow();
  },

  onError(err) {
    console.error('[app error]', err);
  },
});
