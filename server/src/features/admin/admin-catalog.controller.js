// 管理端：主数据维护（服务分类 / 服务项目 / 就诊时段 / 医院 / 科室）
// 统一模式：GET 列表（含停用）｜ POST 新增｜ PUT 局部更新（动态拼 SET）｜ DELETE 删除
const Router = require('koa-router');
const pool = require('../../db/mysql');
const { ok } = require('../../utils/response');
const { authenticate, authorize } = require('../../middleware/auth');
const { ValidationError } = require('../../errors');
const { logAudit } = require('../../services/log.service');

// 动态拼 SET：只更新请求体中出现的字段（字段名 → 列名 映射）
function buildUpdate(body, allowed) {
  const sets = [];
  const params = [];
  for (const [field, col] of Object.entries(allowed)) {
    if (body[field] !== undefined) { sets.push(`${col} = ?`); params.push(body[field]); }
  }
  return { sets, params };
}

function register(router) {
  const guard = [authenticate, authorize('admin')];
  const audit = (ctx, action, resourceType, resourceId) => logAudit({
    operatorId: ctx.state.user.userId, operatorType: 'admin', action,
    resourceType, resourceId: resourceId ? Number(resourceId) : null, ipAddress: ctx.ip,
  });

  // ===== 服务分类 =====
  const CATEGORY_FIELDS = {
    parentId: 'parent_id', name: 'name', code: 'code', icon: 'icon',
    sort: 'sort', status: 'status', isSensitive: 'is_sensitive',
  };
  router.get('/admin/service-categories', ...guard, async (ctx) => {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY sort, id');
    ok(ctx, rows);
  });
  router.post('/admin/service-categories', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    if (!b.name || !String(b.name).trim()) throw new ValidationError('请填写分类名称');
    const [r] = await pool.query(
      'INSERT INTO categories (parent_id, name, code, icon, sort, status, is_sensitive) VALUES (?,?,?,?,?,?,?)',
      [b.parentId || 0, String(b.name).trim().slice(0, 64), b.code || null, b.icon || null,
        Number(b.sort) || 0, b.status === 0 ? 0 : 1, b.isSensitive ? 1 : 0],
    );
    audit(ctx, 'CREATE', 'service_category', r.insertId);
    ok(ctx, { id: r.insertId });
  });
  router.put('/admin/service-categories/:id', ...guard, async (ctx) => {
    const { sets, params } = buildUpdate(ctx.request.body || {}, CATEGORY_FIELDS);
    if (!sets.length) { ok(ctx, { ok: true }); return; }
    params.push(ctx.params.id);
    await pool.query(`UPDATE categories SET ${sets.join(', ')} WHERE id=?`, params);
    audit(ctx, 'UPDATE', 'service_category', ctx.params.id);
    ok(ctx, { ok: true });
  });
  router.delete('/admin/service-categories/:id', ...guard, async (ctx) => {
    await pool.query('DELETE FROM categories WHERE id=?', [ctx.params.id]);
    audit(ctx, 'DELETE', 'service_category', ctx.params.id);
    ok(ctx, { ok: true });
  });

  // ===== 服务项目（服务包）=====
  const PACKAGE_FIELDS = {
    categoryId: 'category_id', name: 'name', cover: 'cover', price: 'price',
    status: 'status', serviceMode: 'service_mode', durationMinutes: 'duration_minutes',
    dailyCapacity: 'daily_capacity', positiveListCodes: 'positive_list_codes',
    requiresPatientInfo: 'requires_patient_info', requiresFamilyConsent: 'requires_family_consent',
    description: 'description',
  };
  router.get('/admin/service-packages', ...guard, async (ctx) => {
    const [rows] = await pool.query(
      `SELECT st.*, c.name AS category_name FROM service_types st
       LEFT JOIN categories c ON c.id = st.category_id ORDER BY st.id DESC`,
    );
    ok(ctx, rows);
  });
  router.post('/admin/service-packages', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    if (!b.name || !String(b.name).trim()) throw new ValidationError('请填写服务项目名称');
    if (b.price === undefined || isNaN(Number(b.price))) throw new ValidationError('请填写正确的价格');
    const [r] = await pool.query(
      `INSERT INTO service_types
         (category_id, name, cover, images, price, status, service_mode, duration_minutes,
          daily_capacity, positive_list_codes, requires_patient_info, requires_family_consent, description)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.categoryId || null, String(b.name).trim().slice(0, 128), b.cover || null,
        b.images !== undefined ? JSON.stringify(b.images) : null, Number(b.price).toFixed(2),
        b.status === 0 ? 0 : 1, Number(b.serviceMode) || 1, b.durationMinutes || null,
        b.dailyCapacity || null, b.positiveListCodes || null,
        b.requiresPatientInfo === 0 ? 0 : 1, b.requiresFamilyConsent ? 1 : 0,
        b.description || null],
    );
    audit(ctx, 'CREATE', 'service_package', r.insertId);
    ok(ctx, { id: r.insertId });
  });
  router.put('/admin/service-packages/:id', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    const { sets, params } = buildUpdate(b, PACKAGE_FIELDS);
    if (b.images !== undefined) { sets.push('images = ?'); params.push(JSON.stringify(b.images)); }
    if (!sets.length) { ok(ctx, { ok: true }); return; }
    params.push(ctx.params.id);
    await pool.query(`UPDATE service_types SET ${sets.join(', ')} WHERE id=?`, params);
    audit(ctx, 'UPDATE', 'service_package', ctx.params.id);
    ok(ctx, { ok: true });
  });
  router.delete('/admin/service-packages/:id', ...guard, async (ctx) => {
    await pool.query('DELETE FROM service_types WHERE id=?', [ctx.params.id]);
    audit(ctx, 'DELETE', 'service_package', ctx.params.id);
    ok(ctx, { ok: true });
  });

  // ===== 就诊时段 =====
  const SLOT_FIELDS = { timeLabel: 'time_label', cutoffTime: 'cutoff_time', sort: 'sort' };
  router.get('/admin/appoint-slots', ...guard, async (ctx) => {
    const [rows] = await pool.query('SELECT * FROM delivery_slots ORDER BY sort, id');
    ok(ctx, rows);
  });
  router.post('/admin/appoint-slots', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    if (!b.timeLabel || !String(b.timeLabel).trim()) throw new ValidationError('请填写时段名称');
    if (!b.cutoffTime) throw new ValidationError('请填写截单时间（HH:MM:SS）');
    const [r] = await pool.query(
      'INSERT INTO delivery_slots (time_label, cutoff_time, sort) VALUES (?,?,?)',
      [String(b.timeLabel).trim().slice(0, 16), b.cutoffTime, Number(b.sort) || 0],
    );
    audit(ctx, 'CREATE', 'appoint_slot', r.insertId);
    ok(ctx, { id: r.insertId });
  });
  router.put('/admin/appoint-slots/:id', ...guard, async (ctx) => {
    const { sets, params } = buildUpdate(ctx.request.body || {}, SLOT_FIELDS);
    if (!sets.length) { ok(ctx, { ok: true }); return; }
    params.push(ctx.params.id);
    await pool.query(`UPDATE delivery_slots SET ${sets.join(', ')} WHERE id=?`, params);
    audit(ctx, 'UPDATE', 'appoint_slot', ctx.params.id);
    ok(ctx, { ok: true });
  });
  router.delete('/admin/appoint-slots/:id', ...guard, async (ctx) => {
    await pool.query('DELETE FROM delivery_slots WHERE id=?', [ctx.params.id]);
    audit(ctx, 'DELETE', 'appoint_slot', ctx.params.id);
    ok(ctx, { ok: true });
  });

  // ===== 医院 =====
  const HOSPITAL_FIELDS = {
    name: 'name', level: 'level', province: 'province', city: 'city', address: 'address',
    lng: 'lng', lat: 'lat', isPilot: 'is_pilot', status: 'status',
  };
  router.get('/admin/hospitals', ...guard, async (ctx) => {
    const [rows] = await pool.query('SELECT * FROM hospitals ORDER BY is_pilot DESC, id');
    ok(ctx, rows);
  });
  router.post('/admin/hospitals', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    if (!b.name || !String(b.name).trim()) throw new ValidationError('请填写医院名称');
    const [r] = await pool.query(
      'INSERT INTO hospitals (name, level, province, city, address, lng, lat, is_pilot, status) VALUES (?,?,?,?,?,?,?,?,?)',
      [String(b.name).trim().slice(0, 128), b.level || null, b.province || null, b.city || null,
        b.address || null, b.lng || null, b.lat || null, b.isPilot ? 1 : 0, b.status === 0 ? 0 : 1],
    );
    audit(ctx, 'CREATE', 'hospital', r.insertId);
    ok(ctx, { id: r.insertId });
  });
  router.put('/admin/hospitals/:id', ...guard, async (ctx) => {
    const { sets, params } = buildUpdate(ctx.request.body || {}, HOSPITAL_FIELDS);
    if (!sets.length) { ok(ctx, { ok: true }); return; }
    params.push(ctx.params.id);
    await pool.query(`UPDATE hospitals SET ${sets.join(', ')} WHERE id=?`, params);
    audit(ctx, 'UPDATE', 'hospital', ctx.params.id);
    ok(ctx, { ok: true });
  });
  router.delete('/admin/hospitals/:id', ...guard, async (ctx) => {
    await pool.query('DELETE FROM hospitals WHERE id=?', [ctx.params.id]);
    audit(ctx, 'DELETE', 'hospital', ctx.params.id);
    ok(ctx, { ok: true });
  });

  // ===== 科室 =====
  const DEPARTMENT_FIELDS = { hospitalId: 'hospital_id', name: 'name', floor: 'floor', building: 'building', status: 'status' };
  router.get('/admin/departments', ...guard, async (ctx) => {
    const { hospitalId } = ctx.query;
    let sql = `SELECT d.*, h.name AS hospital_name FROM departments d
               LEFT JOIN hospitals h ON h.id = d.hospital_id WHERE 1=1`;
    const params = [];
    if (hospitalId) { sql += ' AND d.hospital_id = ?'; params.push(hospitalId); }
    sql += ' ORDER BY d.hospital_id, d.id';
    const [rows] = await pool.query(sql, params);
    ok(ctx, rows);
  });
  router.post('/admin/departments', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    if (!b.hospitalId) throw new ValidationError('请选择所属医院');
    if (!b.name || !String(b.name).trim()) throw new ValidationError('请填写科室名称');
    const [r] = await pool.query(
      'INSERT INTO departments (hospital_id, name, floor, building, status) VALUES (?,?,?,?,?)',
      [b.hospitalId, String(b.name).trim().slice(0, 64), b.floor || null, b.building || null, b.status === 0 ? 0 : 1],
    );
    audit(ctx, 'CREATE', 'department', r.insertId);
    ok(ctx, { id: r.insertId });
  });
  router.put('/admin/departments/:id', ...guard, async (ctx) => {
    const { sets, params } = buildUpdate(ctx.request.body || {}, DEPARTMENT_FIELDS);
    if (!sets.length) { ok(ctx, { ok: true }); return; }
    params.push(ctx.params.id);
    await pool.query(`UPDATE departments SET ${sets.join(', ')} WHERE id=?`, params);
    audit(ctx, 'UPDATE', 'department', ctx.params.id);
    ok(ctx, { ok: true });
  });
  router.delete('/admin/departments/:id', ...guard, async (ctx) => {
    await pool.query('DELETE FROM departments WHERE id=?', [ctx.params.id]);
    audit(ctx, 'DELETE', 'department', ctx.params.id);
    ok(ctx, { ok: true });
  });
}

module.exports = { register };
