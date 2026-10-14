// 陪诊小程序统一请求层：自动带 token、统一错误提示、401 回入口重新检测身份
// 同时提供「后端判角色」的引导流程（detectRole / loginAs / bootstrap）
// 角色约定：user（微信静默登录）｜ companion（账号密码登录）
const { API_BASE_URL: BASE_URL, USE_MOCK } = require('../config');

const TOKEN_KEY = 'token';
const ROLE_KEY = 'app_role';
const FLAGS_KEY = 'app_flags';

function getToken() { try { return wx.getStorageSync(TOKEN_KEY) || ''; } catch (e) { return ''; } }
function setToken(t) { try { t ? wx.setStorageSync(TOKEN_KEY, t) : wx.removeStorageSync(TOKEN_KEY); } catch (e) {} }
function getRole() { try { return wx.getStorageSync(ROLE_KEY) || ''; } catch (e) { return ''; } }
function setRole(r) { try { r ? wx.setStorageSync(ROLE_KEY, r) : wx.removeStorageSync(ROLE_KEY); } catch (e) {} }
function getFlags() { try { return JSON.parse(wx.getStorageSync(FLAGS_KEY) || '{}'); } catch (e) { return {}; } }
function setFlags(f) { try { wx.setStorageSync(FLAGS_KEY, JSON.stringify(f || {})); } catch (e) {} }

// 用户资料本地缓存（头像/昵称/手机号），登录成功后写入，完善资料/刷新时更新。
// 注意：仅作为展示缓存，真值以服务端为准；需要最新值时调用 refreshProfile()。
const PROFILE_KEY = 'user_profile';
function getUserProfile() { try { return JSON.parse(wx.getStorageSync(PROFILE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function setUserProfile(p) { try { p ? wx.setStorageSync(PROFILE_KEY, JSON.stringify(p || {})) : wx.removeStorageSync(PROFILE_KEY); } catch (e) {} }
// 走 GET /auth/profile 拉取服务端最新资料并回写本地缓存
async function refreshProfile() {
  try {
    const data = await rawRequest({ url: '/auth/profile', method: 'GET', header: { Authorization: 'Bearer ' + getToken() } });
    if (data.statusCode >= 200 && data.statusCode < 300 && data.data && data.data.code === 0 && data.data.data && data.data.data.user) {
      setUserProfile(data.data.data.user);
      return data.data.data.user;
    }
  } catch (e) { /* 拉取失败不阻塞 UI */ }
  return null;
}

// 双身份 token 缓存：同一微信既是用户又是陪诊员时，分别缓存两份 token，
// 切换身份直接取本地缓存，无需再次请求后端（秒切、离线也能切）。
const U_TOKEN = 'user_token';
const C_TOKEN = 'companion_token';
function getRoleToken(role) {
  try { return wx.getStorageSync(role === 'companion' ? C_TOKEN : U_TOKEN) || ''; } catch (e) { return ''; }
}
function setRoleToken(role, t) {
  try {
    const k = role === 'companion' ? C_TOKEN : U_TOKEN;
    t ? wx.setStorageSync(k, t) : wx.removeStorageSync(k);
  } catch (e) {}
}
function clearRoleTokens() {
  try { wx.removeStorageSync(U_TOKEN); wx.removeStorageSync(C_TOKEN); } catch (e) {}
}

function wxLogin() {
  return new Promise((res) => wx.login({ success: res, fail: () => res({ code: '' }) }));
}

function rawRequest(options) {
  const header = Object.assign({ 'Content-Type': 'application/json' }, options.header || {});
  const t = getToken();
  if (t) header.Authorization = 'Bearer ' + t;
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + (options.url || ''),
      method: (options.method || 'GET').toUpperCase(),
      header,
      data: options.data,
      timeout: options.timeout || 10000,
      success: (res) => resolve({ statusCode: res.statusCode, data: res.data }),
      fail: (err) => reject(err || { errMsg: 'request:fail' }),
    });
  });
}

// 后端判角色：用同一个 openid 同时查用户/陪诊员，返回身份标识
// 返回：{ isUser, isCompanion, needCompanionRegister }
async function detectRole() {
  if (USE_MOCK) return { isUser: true, isCompanion: true, needCompanionRegister: false };
  const { code } = await wxLogin();
  if (!code) throw new Error('微信登录失败');
  const res = await rawRequest({ url: '/auth/app-login', method: 'POST', data: { code } });
  if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
    return res.data.data || {};
  }
  throw new Error((res.data && res.data.message) || '检测身份失败');
}

// 用户身份静默登录（微信 code 换 token）。
// ⚠️ 陪诊员端为「账号密码登录」，不支持 code 静默登录，必须走 companionLogin(username, password)。
async function loginAs(role) {
  if (USE_MOCK) {
    setToken('mock-token');
    setRole(role);
    setRoleToken(role, 'mock-token');
    return { token: 'mock-token' };
  }
  if (role === 'companion') {
    const err = new Error('NEED_COMPANION_LOGIN');
    err.needLogin = true;
    throw err;
  }
  const { code } = await wxLogin();
  if (!code) throw new Error('微信登录失败');
  const res = await rawRequest({ url: '/auth/login', method: 'POST', data: { code } });
  const body = res.data || {};
  if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
    setToken(body.data.token);
    setRole(role);
    setRoleToken(role, body.data.token);
    if (body.data && body.data.user) setUserProfile(body.data.user);
    return body.data;
  }
  throw new Error(body.message || '登录失败');
}

// 陪诊员账号密码登录（机构发放账号）
// 成功后：写 companion_token 缓存 + 激活为当前身份；返回 { token, companion, qualification }
async function companionLogin(username, password) {
  const res = await rawRequest({
    url: '/companion/login',
    method: 'POST',
    data: { username: String(username || '').trim(), password: String(password || '') },
  });
  const body = res.data || {};
  if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0 && body.data && body.data.token) {
    setRoleToken('companion', body.data.token);
    setToken(body.data.token);
    setRole('companion');
    try { wx.setStorageSync('companion_profile', body.data.companion || {}); } catch (e) {}
    try { wx.setStorageSync('companion_qualification', body.data.qualification || {}); } catch (e) {}
    return body.data;
  }
  const err = new Error(body.message || '登录失败');
  err.bizCode = body.code; // PENDING_REVIEW / REJECTED / UNAUTHORIZED
  throw err;
}

// 陪诊员注册申请（基础资料 + 资质材料，落库待审核）
async function companionRegister(payload) {
  const res = await rawRequest({ url: '/companion/register', method: 'POST', data: payload || {} });
  const body = res.data || {};
  if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) return body.data;
  const err = new Error(body.message || '注册失败');
  err.bizCode = body.code;
  throw err;
}

// 退出陪诊员端：清掉陪诊员 token，回到用户身份
function companionLogout() {
  setRoleToken('companion', '');
  try { wx.removeStorageSync('companion_profile'); wx.removeStorageSync('companion_qualification'); } catch (e) {}
  const userToken = getRoleToken('user');
  if (userToken) {
    setToken(userToken);
    setRole('user');
  } else {
    setToken('');
    setRole('');
  }
}

function isCompanionLoggedIn() {
  return !!getRoleToken('companion');
}

// 切换身份：优先用本地已缓存的该角色 token（无需再请求后端），否则退回重新登录
// companion 无缓存时抛 needLogin，由页面跳转到陪诊员登录页。
async function switchIdentity(role) {
  const cached = getRoleToken(role);
  if (cached) {
    setToken(cached);
    setRole(role);
    return { token: cached, cached: true };
  }
  return loginAs(role);
}

// 仅预登录并缓存「用户身份」的 token，绝不切换当前激活身份。
// 关键：不能调用 switchIdentity/loginAs（它们会改写统一 token/role 并激活），
// 否则会污染当前激活身份 → 陪诊员接口用了 user token → 403。
async function prefetchRole(role) {
  if (role === 'companion') return; // 陪诊员需账号密码，无法预登录
  try {
    const { code } = await wxLogin();
    if (!code) return;
    const res = await rawRequest({ url: '/auth/login', method: 'POST', data: { code } });
    const body = res.data || {};
    if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0 && body.data && body.data.token) {
      setRoleToken(role, body.data.token);
      if (body.data.user) setUserProfile(body.data.user);
    }
  } catch (e) { /* 预登录失败不阻塞主流程 */ }
}

// 头像 URL 规整：旧数据可能存了 http 地址，真机是 https 会被微信拦截导致裂图。统一升级成 https。
function normalizeAvatar(url) {
  if (!url) return '';
  if (url.indexOf('http://') === 0) {
    return 'https://' + url.slice('http://'.length);
  }
  return url;
}

// —— Mock 数据（仅 USE_MOCK=true 时启用，供无后端预览） ——
const PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23eef0f2'/%3E%3Ctext x='50%25' y='50%25' font-size='20' fill='%23b0b3b8' text-anchor='middle' dominant-baseline='middle'%3E%E6%9C%8D%E5%8A%A1%E5%9B%BE%3C/text%3E%3C/svg%3E`;

const MOCK_DATA = {
  '/service-categories': [
    { id: 1, name: '全程陪诊' },
    { id: 2, name: '半程陪诊' },
    { id: 3, name: '代取报告' },
  ],
  '/service-packages': [
    { id: 1, name: '全程陪诊（半天）', price: '198.00', sales: 0, cover: PLACEHOLDER, description: '示例数据' },
    { id: 2, name: '半程陪诊', price: '98.00', sales: 0, cover: PLACEHOLDER, description: '示例数据' },
    { id: 3, name: '代取报告', price: '39.00', sales: 0, cover: PLACEHOLDER, description: '示例数据' },
  ],
  '/appoint-slots': [
    { id: 1, time_label: '08:00-12:00' },
    { id: 2, time_label: '13:00-17:00' },
    { id: 3, time_label: '全天' },
  ],
  '/hospitals': [{ id: 1, name: '示例医院', level: '三甲' }],
  '/settings/public': { notice: '欢迎使用陪诊服务', service: { phone: '', wechat: '', hours: '09:00-18:00', note: '' } },
  '/patients': [{ id: 1, real_name: '示例就医人', relation: 'parent', phone: '', is_default: 1 }],
  '/orders': [
    { id: 1, order_no: 'PZ1001', status: 20, stage: 2, service_date: '2026-10-20', total_amount: '198.00', hospital_name: '示例医院', department_name: '内科', patient_name: '示例就医人', time_label: '08:00-12:00' },
  ],
  '/companion/stats': { date: '2026-10-14', acceptedOrders: 3, finishedOrders: 2, ongoingOrders: 1 },
  '/companion/me': { id: 1, real_name: '示例陪诊员', phone: '138****0000', audit_status: 1, train_status: 2, work_status: 1 },
  '/companion/available': [
    { id: 101, order_no: 'PZ1101', service_date: '2026-10-20', total_amount: '198.00', hospital_name: '示例医院', department_name: '内科', time_label: '08:00-12:00' },
  ],
  '/companion/tasks': [
    { id: 201, order_no: 'PZ1201', status: 30, service_date: '2026-10-20', hospital_name: '示例医院', department_name: '内科', patient_name: '示例就医人', time_label: '08:00-12:00' },
  ],
};

async function request(options, retryCount = 0) {
  const mockKey = (options.url || '').split('?')[0];
  if (USE_MOCK) {
    if (MOCK_DATA[mockKey]) return MOCK_DATA[mockKey];
    if (/^\/service-packages\/\d+/.test(mockKey)) return MOCK_DATA['/service-packages'][0];
    if (mockKey.includes('/orders') || mockKey.startsWith('/companion/')) return [];
    return {};
  }
  let res;
  try {
    res = await rawRequest(options);
  } catch (err) {
    const isTimeout = err && (err.isTimeout || String(err.errMsg).includes('timeout'));
    const isDomain = String(BASE_URL).includes('your-domain.com');
    const msg = isTimeout ? '请求超时，请检查网络' : (isDomain ? '域名未配置，请先修改 config.js 的 API_BASE_URL' : '网络异常，请检查域名/网络');
    wx.showToast({ title: msg, icon: 'none' });
    throw new Error(msg);
  }
  const body = res.data;
  if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
    return body.data;
  }
  if (res.statusCode === 401) {
    // 陪诊员 token 失效：账号密码体系无法静默续期，直接回陪诊员登录页
    if (getRole() === 'companion') {
      companionLogout();
      wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
      wx.reLaunch({ url: '/pages/companion/login/login' });
      throw new Error('陪诊员登录失效');
    }
    // 用户 token 失效：先尝试静默重新登录一次，成功后用新 token 重放原请求
    if (retryCount >= 1) {
      wx.showToast({ title: '登录失效，请重新进入小程序', icon: 'none' });
      setToken(''); setRole(''); setFlags({});
      wx.reLaunch({ url: '/pages/index/index' });
      throw new Error('登录失效');
    }
    try {
      await bootstrap({ force: true, redirect: false });
      return request(options, retryCount + 1);
    } catch (e) {
      wx.showToast({ title: '登录失败：' + (e && e.message ? e.message : '请重试'), icon: 'none' });
      throw e;
    }
  }
  const msg = (body && body.message) || '请求失败';
  wx.showToast({ title: msg, icon: 'none' });
  throw new Error(msg);
}

// 启动引导：一律以「用户身份」静默登录并停留在首页。
// 陪诊员端为账号密码登录，不自动进入；若本地已有陪诊员 token，保留缓存，可在「我的」一键切换。
let booting = null;
async function bootstrap(options = {}) {
  if (!options.force && getToken() && getRole()) return;
  if (booting) return booting;
  booting = (async () => {
    try {
      if (options.force) {
        // 只清用户侧，陪诊员 token 由陪诊员登录页单独管理
        setToken(''); setRole(''); setFlags({}); setRoleToken('user', '');
      }
      let det = {};
      try {
        det = await detectRole();
      } catch (e) { /* 身份检测失败不阻塞用户登录 */ }
      setFlags(Object.assign({}, det, { companionLoggedIn: isCompanionLoggedIn() }));
      await loginAs('user');
    } catch (e) {
      console.error('bootstrap failed', e);
      throw e;
    } finally {
      booting = null;
    }
  })();
  return booting;
}

module.exports = {
  request, rawRequest, getToken, setToken, getRole, setRole, getFlags, setFlags,
  detectRole, loginAs, switchIdentity, prefetchRole, clearRoleTokens, bootstrap, BASE_URL,
  companionLogin, companionRegister, companionLogout, isCompanionLoggedIn, getRoleToken,
  getUserProfile, setUserProfile, refreshProfile, normalizeAvatar,
};
