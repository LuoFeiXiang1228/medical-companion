const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

// 测试号（touristappid）没有真实 AppSecret，无法调用微信接口。
// 这里用 code 派生一个稳定的假 openid，使本地/预览环境的登录、判角色、token 全流程可跑通。
const TEST_APPID = 'touristappid';
function isTestMode() {
  return config.wechat.appid === TEST_APPID || process.env.WX_TEST_MODE === '1';
}

// 微信登录：code 换 openid/session_key
async function code2Session(code) {
  if (isTestMode()) {
    const openid = 'tourist_' + crypto.createHash('sha1').update(String(code || 'test')).digest('hex').slice(0, 24);
    return { openid, session_key: 'test_session_key', unionid: '' };
  }
  const { data } = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: {
      appid: config.wechat.appid,
      secret: config.wechat.secret,
      js_code: code,
      grant_type: 'authorization_code',
    },
  });
  if (data.errcode) throw new Error('wx login failed: ' + data.errcode + ' ' + data.errmsg);
  return data; // { openid, session_key, unionid? }
}

// access_token 内存缓存：微信对 token 获取有每日配额，且有效期约 2 小时，
// 缓存可避免每次发订阅消息/解密手机号都重新拉取导致配额耗尽。
let _accessToken = null;
let _accessTokenExpireAt = 0;
async function getAccessToken() {
  if (isTestMode()) throw new Error('测试号不支持获取 access_token（订阅消息推送不可用）');
  const now = Date.now();
  if (_accessToken && _accessTokenExpireAt > now) return _accessToken;
  const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: {
      grant_type: 'client_credential',
      appid: config.wechat.appid,
      secret: config.wechat.secret,
    },
  });
  if (data.errcode) throw new Error('get access_token failed: ' + data.errcode + ' ' + data.errmsg);
  // 提前 5 分钟过期，避免临界区用到即将失效的 token
  _accessToken = data.access_token;
  _accessTokenExpireAt = now + (Number(data.expires_in) || 7200) * 1000 - 5 * 60 * 1000;
  return _accessToken;
}

// 解密微信手机号：getPhoneNumber 按钮拿到的 code 需到服务端换真实号码。
// 返回 phone_info: { phoneNumber, purePhoneNumber, countryCode }
async function getPhoneNumber(code) {
  if (isTestMode()) throw new Error('测试号不支持获取手机号');
  if (!code) throw new Error('缺少手机号授权 code');
  const token = await getAccessToken();
  const { data } = await axios.post(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${token}`,
    { code },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (data.errcode) throw new Error('get phone failed: ' + data.errcode + ' ' + data.errmsg);
  return data.phone_info;
}

// 发送订阅消息（服务端推送，需用户在小程序内授权过模板）
async function sendSubscribeMessage(touser, templateId, data, page) {
  if (isTestMode()) {
    console.warn('[wechat] 测试号模式下跳过订阅消息推送');
    return { skipped: true };
  }
  const token = await getAccessToken();
  await axios.post(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
    { touser, template_id: templateId, data, page },
  );
}

module.exports = { code2Session, getAccessToken, getPhoneNumber, sendSubscribeMessage };
