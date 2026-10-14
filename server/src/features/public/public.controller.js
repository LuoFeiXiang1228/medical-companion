// 公开主数据接口（免登录）：服务分类 / 服务项目（服务包）/ 就诊时段 / 医院 / 科室 / 服务边界声明
const Router = require('koa-router');
const pool = require('../../db/mysql');
const { ok } = require('../../utils/response');

function register(router) {
  // 服务分类（上架）
  router.get('/service-categories', async (ctx) => {
    const [rows] = await pool.query(
      'SELECT id, parent_id, name, code, icon, sort FROM categories WHERE status = 1 ORDER BY sort, id',
    );
    ok(ctx, rows);
  });

  // 服务项目 / 服务包（上架；支持分类与关键词筛选）
  router.get('/service-packages', async (ctx) => {
    const { categoryId, keyword } = ctx.query;
    let sql = `SELECT id, category_id, name, cover, price, sales, service_mode, duration_minutes,
                      requires_patient_info, requires_family_consent, description
               FROM service_types WHERE status = 1`;
    const p = [];
    if (categoryId) { sql += ' AND category_id = ?'; p.push(categoryId); }
    if (keyword) { sql += ' AND name LIKE ?'; p.push(`%${keyword}%`); }
    sql += ' ORDER BY sales DESC, id DESC';
    const [rows] = await pool.query(sql, p);
    ok(ctx, rows);
  });

  // 服务包详情
  router.get('/service-packages/:id', async (ctx) => {
    const [rows] = await pool.query(
      `SELECT id, category_id, name, cover, images, price, sales, service_mode, duration_minutes,
              requires_patient_info, requires_family_consent, description
       FROM service_types WHERE id = ? AND status = 1`,
      [ctx.params.id],
    );
    if (!rows.length) {
      ctx.status = 404;
      ctx.body = { code: 'NOT_FOUND', message: '服务项目不存在或已下架', data: null };
      return;
    }
    ok(ctx, rows[0]);
  });

  // 就诊时段
  router.get('/appoint-slots', async (ctx) => {
    const [rows] = await pool.query('SELECT id, time_label, cutoff_time, sort FROM delivery_slots ORDER BY sort, id');
    ok(ctx, rows);
  });

  // 医院列表（可选按城市筛选）
  router.get('/hospitals', async (ctx) => {
    const { city } = ctx.query;
    let sql = `SELECT id, name, level, province, city, address, lng, lat, is_pilot
               FROM hospitals WHERE status = 1`;
    const p = [];
    if (city) { sql += ' AND city = ?'; p.push(city); }
    sql += ' ORDER BY is_pilot DESC, id';
    const [rows] = await pool.query(sql, p);
    ok(ctx, rows);
  });

  // 某医院科室列表
  router.get('/hospitals/:id/departments', async (ctx) => {
    const [rows] = await pool.query(
      'SELECT id, name, floor, building FROM departments WHERE hospital_id = ? AND status = 1 ORDER BY id',
      [ctx.params.id],
    );
    ok(ctx, rows);
  });

  // 服务边界声明：国标「可协助活动 / 不应开展服务」统一下发（下单页与陪诊员端共用同一份文案）
  router.get('/service-boundary', async (ctx) => {
    const [rows] = await pool.query(
      `SELECT rule_code, rule_type, std_clause, title, description
       FROM compliance_rules WHERE status = 1 ORDER BY rule_code`,
    );
    const pick = (r) => ({ code: r.rule_code, clause: r.std_clause, title: r.title, description: r.description });
    ok(ctx, {
      standard: 'GB/T 47801—2026',
      allowed: rows.filter((r) => r.rule_type === 2).map(pick),
      forbidden: rows.filter((r) => r.rule_type === 1).map(pick),
    });
  });
}

module.exports = { register };
