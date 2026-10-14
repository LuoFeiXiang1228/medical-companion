// 支付适配层：按环境变量 PAY_CHANNEL 选择实现（mock=模拟支付 / wechat=微信支付）
// 设计说明：
//   · createPayment / getChannelInfo 由两个实现提供（同签名，便于无缝切换）
//   · 支付成功后的「入账与状态流转」统一在 order.service.confirmPayment（mock 与真实支付共用，
//     环境切换只改 PAY_CHANNEL，不改业务代码）
const config = require('../config');
const mock = require('./mock');
const wechat = require('./wechat');

const impl = config.payChannel === 'wechat' ? wechat : mock;

module.exports = {
  channel: config.payChannel,
  isMock: () => impl === mock,
  createPayment: (params) => impl.createPayment(params),
  getChannelInfo: () => impl.getChannelInfo(),
};
