// 订单接口（用户端）
const { request } = require('../utils/request');

// 创建订单：{ packageId, patientId, hospitalId, departmentId, appointDate, appointSlot, riskAssessment, remark }
const createOrder = (payload) => request({ url: '/orders', method: 'POST', data: payload });

// 获取支付参数（mock 通道返回 { mock: true, orderNo }；wechat 通道返回 wx.requestPayment 参数）
const prepay = (orderId) => request({ url: `/orders/${orderId}/prepay`, method: 'POST' });

// 模拟支付确认（仅 mock 通道可用）
const mockConfirm = (orderId) => request({ url: '/pay/mock-confirm', method: 'POST', data: { orderId } });

// 支付通道信息
const getPayChannel = () => request({ url: '/pay/channel' });

// 我的订单列表（可选 status 筛选）
const listOrders = (status) => request({ url: '/orders' + (status !== undefined && status !== '' ? '?status=' + status : '') });

// 订单详情（含服务包明细 / 协议状态 / 留痕 / 风险评估 / 陪诊员脱敏信息）
const getOrderDetail = (id) => request({ url: '/orders/' + id });

// 家属端进度时间轴
const getOrderTimeline = (id) => request({ url: `/orders/${id}/timeline` });

// 轻量状态轮询
const getOrderStatus = (id) => request({ url: `/orders/${id}/status` });

module.exports = {
  createOrder,
  prepay,
  mockConfirm,
  getPayChannel,
  listOrders,
  getOrderDetail,
  getOrderTimeline,
  getOrderStatus,
};
