// 就医人档案（服务对象，可与下单人不同）
// 对应表：patient_info
const Router = require('koa-router');
const pool = require('../../db/mysql');
const { ok } = require('../../utils/response');
const { authenticate } = require('../../middleware/auth');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../errors');

const RELATIONS = ['self', 'parent', 'child', 'other'];
const MOBILITY = [1, 2, 3, 4];

function register(router) {
  // 我的就医人列表
  router.get('/patients', authenticate, async (ctx) => {
    const [rows] = await pool.query(
      `SELECT id, real_name, phone, gender, birth_date, relation, mobility, is_default, created_at
       FROM patient_info WHERE owner_user_id = ? ORDER BY is_default DESC, id DESC`,
      [ctx.state.user.userId],
    );
    ok(ctx, rows);
  });

  // 新增就医人
  router.post('/patients', authenticate, async (ctx) => {
    const b = ctx.request.body || {};
    const name = String(b.name || '').trim();
    if (!name) throw new ValidationError('请填写就医人姓名');
    if (b.phone && !/^1\d{10}$/.test(String(b.phone))) throw new ValidationError('手机号格式不正确');
    if (b.relation && !RELATIONS.includes(b.relation)) throw new ValidationError('关系取值不合法');

    // 注：身份证号（id_card_no）采集待加密方案确定（设计清单待确认项），暂不开放
    const [r] = await pool.query(
      `INSERT INTO patient_info
         (owner_user_id, real_name, phone, gender, birth_date, relation, mobility, medical_history, is_default)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        ctx.state.user.userId,
        name,
        b.phone ? String(b.phone).trim() : null,
        (b.gender === 1 || b.gender === 2) ? b.gender : null,
        b.birthDate || null,
        b.relation || null,
        MOBILITY.includes(b.mobility) ? b.mobility : null,
        b.healthNote ? String(b.healthNote).slice(0, 2000) : null,
        b.isDefault ? 1 : 0,
      ],
    );
    if (b.isDefault) {
      await pool.query(
        'UPDATE patient_info SET is_default = 0 WHERE owner_user_id = ? AND id != ?',
        [ctx.state.user.userId, r.insertId],
      );
    }
    ok(ctx, { id: r.insertId });
  });

  // 删除就医人（仅本人创建的可删）
  router.delete('/patients/:id', authenticate, async (ctx) => {
    const [rows] = await pool.query('SELECT id, owner_user_id FROM patient_info WHERE id = ?', [ctx.params.id]);
    if (!rows.length) throw new NotFoundError('就医人不存在');
    if (rows[0].owner_user_id !== ctx.state.user.userId) throw new ForbiddenError('无权限删除');
    await pool.query('DELETE FROM patient_info WHERE id = ?', [ctx.params.id]);
    ok(ctx, { ok: true });
  });
}

module.exports = { register };
