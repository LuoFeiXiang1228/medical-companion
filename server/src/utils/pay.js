const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

// ===== 微信支付 V2（JSAPI / 小程序）示例实现 =====
// 生产环境建议升级到 V3（RSA 签名 + 平台证书），此处 V2 MD5 便于快速跑通
function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

function buildSign(params, key) {
  const str = Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&') + `&key=${key}`;
  return md5(str);
}

function toXml(obj) {
  let xml = '<xml>';
  for (const k in obj) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === '') continue;
    xml += `<${k}>${obj[k]}</${k}>`;
  }
  return xml + '</xml>';
}

function fromXml(xml) {
  const result = {};
  const re = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g;
  let m;
  while ((m = re.exec(xml))) {
    const key = m[1] || m[3];
    const val = m[2] !== undefined ? m[2] : m[4];
    result[key] = val;
  }
  return result;
}

// 调用统一下单，返回 prepay_id
async function createUnifiedOrder({ body, outTradeNo, totalFee, openid }) {
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const params = {
    appid: config.wechat.appid,
    mch_id: config.wechat.mchId,
    nonce_str: nonceStr,
    body,
    out_trade_no: outTradeNo,
    total_fee: totalFee,
    spbill_create_ip: config.wechat.spbillIp,
    notify_url: config.wechat.notifyUrl,
    trade_type: 'JSAPI',
    openid,
  };
  params.sign = buildSign(params, config.wechat.mchKey);
  const { data } = await axios.post(
    'https://api.mch.weixin.qq.com/pay/unifiedorder',
    toXml(params),
    { headers: { 'Content-Type': 'text/xml' } },
  );
  const res = fromXml(data);
  if (res.return_code !== 'SUCCESS' || res.result_code !== 'SUCCESS') {
    const detail = `return_code=${res.return_code || ''}, result_code=${res.result_code || ''}, err_code=${res.err_code || ''}, err_code_des=${res.err_code_des || ''}, return_msg=${res.return_msg || ''}`;
    throw new Error('微信支付统一下单失败: ' + detail);
  }
  return res.prepay_id;
}

// 组装小程序端 wx.requestPayment 所需参数
function buildPayParams(prepayId) {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const payParams = {
    appId: config.wechat.appid,
    timeStamp,
    nonceStr,
    package: `prepay_id=${prepayId}`,
    signType: 'MD5',
  };
  payParams.paySign = buildSign(payParams, config.wechat.mchKey);
  return payParams;
}

module.exports = { createUnifiedOrder, buildPayParams, toXml, fromXml };
