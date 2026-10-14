// 隐私合规：本地同意态 + 微信官方隐私授权接口的兼容封装
// 微信基础库 2.32.3+ 起，调用地理位置/手机号等接口前必须完成隐私授权，
// 否则接口直接失败。这里做双保险：本地首启弹窗 + 官方 onNeedPrivacyAuthorization 拦截。
const AGREE_KEY = 'privacy_agreed_v1';

function hasAgreed() {
  try { return !!wx.getStorageSync(AGREE_KEY); } catch (e) { return false; }
}

function setAgreed() {
  try { wx.setStorageSync(AGREE_KEY, Date.now()); } catch (e) {}
}

function clearAgreed() {
  try { wx.removeStorageSync(AGREE_KEY); } catch (e) {}
}

// 官方隐私接口是否可用（低版本基础库/未在后台配置指引时不可用）
function supported() {
  return typeof wx.getPrivacySetting === 'function';
}

// 查询微信侧是否还需要弹隐私授权
function needAuthorize() {
  return new Promise((resolve) => {
    if (!supported()) { resolve(false); return; }
    wx.getPrivacySetting({
      success: (res) => resolve(!!res.needAuthorization),
      fail: () => resolve(false),
    });
  });
}

// 敏感接口调用前的守卫：未同意先弹自定义弹窗，同意即记录并放行
// usage: if (!(await ensureAgreed())) return;
function ensureAgreed() {
  return new Promise((resolve) => {
    if (hasAgreed()) { resolve(true); return; }
    wx.showModal({
      title: '隐私保护提示',
      content: '为了提供下单、配送、售后服务，我们需要收集必要信息。点击「同意」即表示你已阅读并同意《隐私政策》与《用户协议》。',
      confirmText: '同意',
      cancelText: '暂不使用',
      success: (res) => {
        // 关键修复：之前点「查看并同意」也 resolve(false) 导致调用方直接 return，相机永远打不开
        if (res.confirm) { setAgreed(); resolve(true); }
        else { resolve(false); }
      },
      fail: () => resolve(false),
    });
  });
}

module.exports = { AGREE_KEY, hasAgreed, setAgreed, clearAgreed, supported, needAuthorize, ensureAgreed };
