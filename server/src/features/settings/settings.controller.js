// 系统设置（公开信息 + 管理端维护）
// 说明：时段管理已迁移至 /appoint-slots（公开）与 /admin/appoint-slots（管理端）；
//       计费类设置项已不再维护。
const pool = require('../../db/mysql');
const { ok } = require('../../utils/response');
const { authenticate, authorize } = require('../../middleware/auth');
const { ValidationError } = require('../../errors');

// 允许管理端修改的设置项白名单（防止前端塞垃圾键）
const ALLOWED_KEYS = new Set([
  // 公告与客服
  'shop_notice',
  'service_phone',
  'service_wechat',
  'service_hours',
  'service_note',
  'service_faq',
  // 协议
  'privacy_policy',
  'user_agreement',
]);

// 读取全部设置为 { key: value } 形式，供其它模块复用
async function getSettingsMap() {
  const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
  const map = {};
  rows.forEach((r) => { map[r.key] = r.value; });
  return map;
}

// 数值型设置读取（带默认值兜底）
async function getNumber(key, fallback = 0) {
  const [rows] = await pool.query('SELECT `value` FROM settings WHERE `key`=?', [key]);
  if (!rows.length) return fallback;
  const n = Number(rows[0].value);
  return Number.isFinite(n) ? n : fallback;
}

// JSON 型设置读取（带默认值兜底，解析失败返回 fallback）
async function getJSON(key, fallback = null) {
  const [rows] = await pool.query('SELECT `value` FROM settings WHERE `key`=?', [key]);
  if (!rows.length) return fallback;
  try {
    const v = JSON.parse(rows[0].value);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function register(router) {
  // ===== 公开接口（用户端 / 陪诊员端用） =====

  // 公开设置（公告 + 客服信息），不暴露内部配置
  router.get('/settings/public', async (ctx) => {
    const map = await getSettingsMap();
    ok(ctx, {
      notice: map.shop_notice || '',
      service: {
        phone: map.service_phone || '',
        wechat: map.service_wechat || '',
        hours: map.service_hours || '',
        note: map.service_note || '',
      },
    });
  });

  // ===== 管理端：系统设置 =====

  router.get('/admin/settings', authenticate, authorize('admin'), async (ctx) => {
    const [rows] = await pool.query('SELECT `key`, `value`, `label`, `type` FROM settings ORDER BY `key`');
    ok(ctx, rows);
  });

  // 批量更新：body 形如 { "shop_notice": "...", "service_phone": "..." }
  router.put('/admin/settings', authenticate, authorize('admin'), async (ctx) => {
    const b = ctx.request.body || {};
    const entries = Object.entries(b).filter(([k]) => ALLOWED_KEYS.has(k));
    if (!entries.length) throw new ValidationError('没有可更新的设置项');

    for (const [k, v] of entries) {
      if (k === 'service_faq') {
        try {
          const arr = JSON.parse(v || '[]');
          if (!Array.isArray(arr)) throw new Error('not array');
        } catch (e) {
          throw new ValidationError('常见问题格式错误，应为 [{"q":"问题","a":"答案"}] 数组');
        }
      }
      if (k === 'service_phone' && v && !/^[\d\-+ ]{5,20}$/.test(String(v).trim())) {
        throw new ValidationError('客服电话格式不正确');
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [k, v] of entries) {
        await conn.query(
          'INSERT INTO settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',
          [k, String(v)],
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    ok(ctx, { ok: true, updated: entries.length });
  });
}

module.exports = { register, getSettingsMap, getNumber, getJSON };
