// 陪诊员端接口：任务 / 接单 / 打卡 / 资质
const { request } = require('../utils/request');

const qs = (params) => {
  const parts = Object.keys(params || {})
    .filter((k) => params[k] !== undefined && params[k] !== '' && params[k] !== null)
    .map((k) => `${k}=${encodeURIComponent(params[k])}`);
  return parts.length ? '?' + parts.join('&') : '';
};

// 我的服务任务（可选 date / slotId 筛选）
const getTasks = (params) => request({ url: '/companion/tasks' + qs(params) });

// 待接单池（可选 date / hospitalId / departmentId 筛选）
const getAvailable = (params) => request({ url: '/companion/available' + qs(params) });

// 任务详情（含服务包明细）
const getTaskDetail = (id) => request({ url: '/companion/tasks/' + id });

// 承接订单（服务端做资质校验）
const acceptTask = (id) => request({ url: `/companion/tasks/${id}/accept`, method: 'POST' });

// 当日工作量统计
const getStats = (date) => request({ url: '/companion/stats' + qs({ date }) });

// 我的资料 / 资质与可接单范围
const getMe = () => request({ url: '/companion/me' });
const getCapability = () => request({ url: '/companion/me/capability' });

// —— 服务留痕 ——

// 单节点打卡：{ nodeType, lat, lng, locationText, photos, remark }
const checkin = (orderId, payload) => request({ url: `/orders/${orderId}/checkin`, method: 'POST', data: payload });

// 某订单全部留痕
const getCheckins = (orderId) => request({ url: `/orders/${orderId}/checkins` });

// 追加更正说明：{ reason, content }
const submitCorrection = (orderId, logId, payload) => request({
  url: `/orders/${orderId}/checkins/${logId}/correction`,
  method: 'POST',
  data: payload,
});

module.exports = {
  getTasks,
  getAvailable,
  getTaskDetail,
  acceptTask,
  getStats,
  getMe,
  getCapability,
  checkin,
  getCheckins,
  submitCorrection,
};
