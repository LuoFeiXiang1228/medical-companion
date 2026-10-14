// 订阅消息授权封装
// 模板 ID 由管理端在后台填写后经 /subscribe/templates 下发，
// 小程序未认证（拿不到模板 ID）时这里全部安全跳过，不打断主流程。
const { getSubscribeTemplates, grantSubscribe } = require('../services/growth');

let cache = null;      // 模板列表缓存，避免每次下单都拉一次
let cacheAt = 0;
const TTL = 5 * 60 * 1000;

async function loadTemplates() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL) return cache;
  try {
    cache = (await getSubscribeTemplates()) || [];
    cacheAt = now;
  } catch (e) {
    cache = [];
  }
  return cache;
}

// 弹出授权并把结果同步给后端
// keys: 想申请的场景键数组，不传则申请全部已配置模板
async function requestSubscribe(keys) {
  const templates = await loadTemplates();
  const targets = keys && keys.length
    ? templates.filter((t) => keys.includes(t.key))
    : templates;
  if (!targets.length) return { accepted: [], skipped: true };

  const tmplIds = targets.map((t) => t.templateId).filter(Boolean).slice(0, 3); // 微信单次最多 3 个
  if (!tmplIds.length) return { accepted: [], skipped: true };

  const res = await new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: resolve,
      fail: () => resolve({}),
    });
  });

  const accepted = targets
    .filter((t) => res[t.templateId] === 'accept')
    .map((t) => t.key);

  if (accepted.length) {
    try { await grantSubscribe(accepted); } catch (e) { /* 授权入库失败不影响用户 */ }
  }
  return { accepted, skipped: false };
}

module.exports = { loadTemplates, requestSubscribe };
