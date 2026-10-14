// 微信支付通道（V2 JSAPI）：复用 utils/pay 的统一下单与签名工具
// 注：入账与状态流转由 order.service.confirmPayment 统一处理（回调触发），本文件只负责"下单取支付参数"
const payUtil = require('../utils/pay');

async function createPayment({ orderNo, amountFen, description, openid }) {
  const prepayId = await payUtil.createUnifiedOrder({
    body: description,
    outTradeNo: orderNo,
    totalFee: amountFen,
    openid,
  });
  return payUtil.buildPayParams(prepayId);
}

function getChannelInfo() {
  return { channel: 'wechat', label: '微信支付', mock: false };
}

module.exports = { createPayment, getChannelInfo };
