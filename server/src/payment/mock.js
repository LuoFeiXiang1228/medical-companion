// 模拟支付通道（开发 / 演示用）：不调用微信，前端用户确认后由服务端标记已支付
// 注意：仅在 PAY_CHANNEL=mock 时生效；对应确认接口（/pay/mock-confirm）在生产环境返回 404
async function createPayment({ orderNo, amountFen }) {
  return { mock: true, orderNo, amountFen };
}

function getChannelInfo() {
  return { channel: 'mock', label: '模拟支付（测试环境）', mock: true };
}

module.exports = { createPayment, getChannelInfo };
