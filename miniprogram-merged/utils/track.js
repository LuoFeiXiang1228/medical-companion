// 轻量埋点：本地队列 + 批量上报，避免每个事件都发一次请求
// 事件名必须在后端 ALLOWED_EVENTS 白名单内，否则会被丢弃
const { getToken } = require('./request');

const { API_BASE_URL: BASE_URL } = require('../config');
const MAX_BATCH = 50;      // 与后端单次上限一致
const FLUSH_DELAY = 3000;  // 3s 内的事件合并成一次请求
const STORAGE_KEY = 'track_queue';

let queue = [];
let timer = null;
let flushing = false;

// 冷启动时把上次没发出去的事件捞回来（弱网/闪退兜底）
try {
  const cached = wx.getStorageSync(STORAGE_KEY);
  if (Array.isArray(cached) && cached.length) queue = cached.slice(-MAX_BATCH);
} catch (e) {}

function persist() {
  try { wx.setStorageSync(STORAGE_KEY, queue.slice(-MAX_BATCH)); } catch (e) {}
}

function currentPage() {
  try {
    const pages = getCurrentPages();
    const p = pages[pages.length - 1];
    return p ? p.route : '';
  } catch (e) {
    return '';
  }
}

// 直连后端上报，失败静默
function post(events) {
  const header = {
    'Content-Type': 'application/json',
    Authorization: getToken() ? 'Bearer ' + getToken() : '',
  };
  return new Promise((resolve) => {
    wx.request({
      url: BASE_URL + '/track',
      method: 'POST',
      header,
      data: { events, platform: 'user' },
      success: (res) => resolve(res),
      fail: () => resolve(null),
    });
  });
}

async function flush() {
  if (flushing || !queue.length) return;
  flushing = true;
  const batch = queue.slice(0, MAX_BATCH);
  queue = queue.slice(batch.length);
  persist();
  const res = await post(batch);
  // 上报失败则把事件放回队首，下次再试（最多保留 MAX_BATCH 条）
  if (!res || res.statusCode !== 200) {
    queue = batch.concat(queue).slice(-MAX_BATCH);
    persist();
  }
  flushing = false;
}

function track(event, extra) {
  if (!event) return;
  queue.push({ event, page: currentPage(), extra: extra || undefined });
  if (queue.length > MAX_BATCH) queue = queue.slice(-MAX_BATCH);
  persist();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; flush(); }, FLUSH_DELAY);
}

// 退到后台立即冲刷，避免事件丢失
function flushNow() {
  if (timer) { clearTimeout(timer); timer = null; }
  return flush();
}

module.exports = { track, flushNow };
