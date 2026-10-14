// 管理端：陪诊员资质审核 + 合规规则维护 + 合规体检报告（数据摘要版）
const Router = require('koa-router');
const pool = require('../../db/mysql');
const { ok } = require('../../utils/response');
const { authenticate, authorize } = require('../../middleware/auth');
const { ValidationError, NotFoundError } = require('../../errors');
const { logAudit } = require('../../services/log.service');

function register(router) {
  const guard = [authenticate, authorize('admin')];
  const audit = (ctx, action, resourceType, resourceId, details) => logAudit({
    operatorId: ctx.state.user.userId, operatorType: 'admin', action,
    resourceType, resourceId: resourceId ? Number(resourceId) : null,
    details, ipAddress: ctx.ip,
  });

  // ===== 陪诊员：列表 =====
  router.get('/admin/companions', ...guard, async (ctx) => {
    const { auditStatus, keyword, expiring } = ctx.query;
    let sql = `SELECT id, real_name, phone, username, cert_type, cert_no, cert_expire,
                      health_cert_no, health_cert_expire, train_status, audit_status, audit_remark,
                      work_status, score, created_at
               FROM companions WHERE 1=1`;
    const params = [];
    if (auditStatus !== undefined && auditStatus !== '') { sql += ' AND audit_status = ?'; params.push(Number(auditStatus)); }
    if (keyword) {
      sql += ' AND (real_name LIKE ? OR phone LIKE ? OR username LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (expiring === '1') {
      sql += ` AND audit_status = 1 AND (
        (health_cert_expire IS NOT NULL AND health_cert_expire <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)) OR
        (cert_expire IS NOT NULL AND cert_expire <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)))`;
    }
    sql += ' ORDER BY audit_status DESC, id DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    ok(ctx, rows);
  });

  // 即将到期证件预警（days=30 / 7；需先于 :id 路由注册）
  router.get('/admin/companions/expiring', ...guard, async (ctx) => {
    const days = Number(ctx.query.days) || 30;
    const [rows] = await pool.query(
      `SELECT id, real_name, phone, health_cert_no, health_cert_expire, cert_no, cert_expire
       FROM companions
       WHERE audit_status = 1 AND (
         (health_cert_expire IS NOT NULL AND health_cert_expire <= DATE_ADD(CURDATE(), INTERVAL ? DAY)) OR
         (cert_expire IS NOT NULL AND cert_expire <= DATE_ADD(CURDATE(), INTERVAL ? DAY)))
       ORDER BY LEAST(COALESCE(health_cert_expire, '9999-12-31'), COALESCE(cert_expire, '9999-12-31'))`,
      [days, days],
    );
    ok(ctx, rows);
  });

  // 陪诊员详情
  router.get('/admin/companions/:id', ...guard, async (ctx) => {
    const [rows] = await pool.query(
      `SELECT id, real_name, phone, username, gender, avatar, cert_type, cert_no, cert_issue_org, cert_expire,
              health_cert_no, health_cert_expire, train_status, skill_tags, hospital_scope,
              audit_status, audit_remark, audited_by, audited_at, work_status, score, created_at, updated_at
       FROM companions WHERE id = ?`,
      [ctx.params.id],
    );
    if (!rows.length) throw new NotFoundError('陪诊员不存在');
    ok(ctx, rows[0]);
  });

  // 资质审核（通过 / 驳回 + 意见）
  router.post('/admin/companions/:id/audit', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    const result = String(b.result || '').toUpperCase();
    if (!['APPROVE', 'REJECT'].includes(result)) throw new ValidationError('result 需为 APPROVE 或 REJECT');
    const [r] = await pool.query(
      'UPDATE companions SET audit_status = ?, audit_remark = ?, audited_by = ?, audited_at = NOW() WHERE id = ?',
      [result === 'APPROVE' ? 1 : 2, b.comment ? String(b.comment).slice(0, 255) : null, ctx.state.user.userId, ctx.params.id],
    );
    if (!r.affectedRows) throw new NotFoundError('陪诊员不存在');
    audit(ctx, 'AUDIT_COMPANION', 'companion', ctx.params.id, { result, comment: b.comment || null });
    ok(ctx, { ok: true, auditStatus: result === 'APPROVE' ? 1 : 2 });
  });

  // 录入 / 更新证件（type: cert=职业能力证书 ｜ health=健康证）
  // 注：证件影像（imageUrl）与生效日期（validFrom）暂无对应字段，待定
  router.post('/admin/companions/:id/certificates', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    const type = String(b.type || '').toLowerCase();
    if (!['cert', 'health'].includes(type)) throw new ValidationError('type 需为 cert（职业能力证书）或 health（健康证）');
    if (!b.no || !String(b.no).trim()) throw new ValidationError('请填写证件编号');
    let r;
    if (type === 'health') {
      [r] = await pool.query(
        'UPDATE companions SET health_cert_no = ?, health_cert_expire = ? WHERE id = ?',
        [String(b.no).trim().slice(0, 64), b.validTo || null, ctx.params.id],
      );
    } else {
      [r] = await pool.query(
        'UPDATE companions SET cert_type = ?, cert_no = ?, cert_issue_org = ?, cert_expire = ? WHERE id = ?',
        [b.certType ? String(b.certType).slice(0, 64) : '陪诊服务专项职业能力证书',
          String(b.no).trim().slice(0, 64), b.issuer ? String(b.issuer).slice(0, 128) : null,
          b.validTo || null, ctx.params.id],
      );
    }
    if (!r.affectedRows) throw new NotFoundError('陪诊员不存在');
    audit(ctx, 'UPDATE_COMPANION_CERT', 'companion', ctx.params.id, { type, no: String(b.no).trim() });
    ok(ctx, { ok: true });
  });

  // 触发证书核验（R-P0-05）
  // 注：外部核验服务未接入，当前为人工核验模式（调用即记录，核验结论线下录入）
  router.post('/admin/companions/:id/verify', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    audit(ctx, 'VERIFY_COMPANION_CERT', 'companion', ctx.params.id, { certificateId: b.certificateId || null });
    ok(ctx, {
      verified: null,
      mode: 'manual',
      message: '证书核验服务未接入（当前为人工核验模式，待配置外部核验通道）',
    });
  });

  // ===== 合规规则 =====
  router.get('/admin/compliance-rules', ...guard, async (ctx) => {
    const [rows] = await pool.query('SELECT * FROM compliance_rules ORDER BY rule_type DESC, rule_code');
    ok(ctx, rows);
  });

  // 启用/停用 + 关键词库 + 动作（BLOCK→severity 2 / WARN→severity 1）
  router.put('/admin/compliance-rules/:id', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    const sets = [];
    const params = [];
    if (b.enabled !== undefined) { sets.push('status = ?'); params.push(b.enabled ? 1 : 0); }
    if (Array.isArray(b.keywords)) {
      sets.push('detect_pattern = ?');
      params.push(b.keywords.map((k) => String(k).trim()).filter(Boolean).join('|').slice(0, 512) || null);
    }
    if (b.action !== undefined) {
      sets.push('severity = ?');
      params.push(String(b.action).toUpperCase() === 'BLOCK' ? 2 : 1);
    }
    if (!sets.length) { ok(ctx, { ok: true }); return; }
    params.push(ctx.params.id);
    const [r] = await pool.query(`UPDATE compliance_rules SET ${sets.join(', ')} WHERE id = ?`, params);
    if (!r.affectedRows) throw new NotFoundError('规则不存在');
    audit(ctx, 'UPDATE_COMPLIANCE_RULE', 'compliance_rule', ctx.params.id, {
      enabled: b.enabled, keywords: b.keywords, action: b.action,
    });
    ok(ctx, { ok: true });
  });

  // 规则自测：输入一段文本，返回是否触发
  router.post('/admin/compliance-rules/:id/test', ...guard, async (ctx) => {
    const text = String((ctx.request.body || {}).text || '');
    const [rules] = await pool.query(
      'SELECT rule_code, title, detect_pattern, severity FROM compliance_rules WHERE id = ?',
      [ctx.params.id],
    );
    if (!rules.length) throw new NotFoundError('规则不存在');
    const rule = rules[0];
    let hit = false;
    let error = null;
    if (!rule.detect_pattern) {
      error = '该规则尚未配置关键词库';
    } else if (text) {
      try {
        hit = new RegExp(rule.detect_pattern, 'i').test(text);
      } catch (e) {
        error = '规则正则不合法：' + e.message;
      }
    }
    ok(ctx, { ruleCode: rule.rule_code, title: rule.title, severity: rule.severity, text, hit, error });
  });

  // ===== 合规体检报告（数据摘要版）=====
  // 说明：按 GB/T 47801—2026 的七个方面输出「客观数据摘要」，不含评分；
  //       细粒度评分表待国标条目设计后接入（scoring=PENDING_DESIGN）；报告即时生成、不落库。
  router.post('/admin/compliance-report', ...guard, async (ctx) => {
    const b = ctx.request.body || {};
    const from = b.periodFrom || null;
    const to = b.periodTo || null;
    const where = [];
    const params = [];
    if (from) { where.push('o.created_at >= ?'); params.push(`${from} 00:00:00`); }
    if (to) { where.push('o.created_at <= ?'); params.push(`${to} 23:59:59`); }
    const periodCond = where.length ? ' AND ' + where.join(' AND ') : '';

    const [[orderStats]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(o.status IN (20, 30, 40, 50)) AS accepted,
              SUM(o.status = 50) AS done
       FROM orders o WHERE 1=1${periodCond}`,
      params,
    );
    const [[companionStats]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(audit_status = 1) AS approved,
              SUM(train_status = 2) AS trained,
              SUM(audit_status = 1 AND (
                (health_cert_expire IS NOT NULL AND health_cert_expire < CURDATE()) OR
                (cert_expire IS NOT NULL AND cert_expire < CURDATE()))) AS expired_docs
       FROM companions`,
    );
    const [[ruleStats]] = await pool.query(
      `SELECT SUM(rule_type = 2) AS allowed_rules,
              SUM(rule_type = 1) AS forbidden_rules,
              SUM(detect_pattern IS NOT NULL AND detect_pattern <> '') AS with_keywords
       FROM compliance_rules WHERE status = 1`,
    );
    const [[flowStats]] = await pool.query(
      `SELECT COUNT(DISTINCT l.order_id) AS logged_orders,
              COUNT(*) AS nodes,
              SUM(l.is_flagged = 1) AS flagged
       FROM service_logs l
       JOIN orders o ON o.id = l.order_id
       WHERE 1=1${periodCond}`,
      params,
    );
    const [[consentStats]] = await pool.query(
      `SELECT COUNT(*) AS signed
       FROM service_consents s
       JOIN orders o ON o.id = s.order_id
       WHERE s.sign_status = 1${periodCond}`,
      params,
    );
    let reviewSql = 'SELECT COUNT(*) AS reviews, AVG(score) AS avg_score FROM service_reviews';
    const reviewWhere = [];
    const reviewParams = [];
    if (from) { reviewWhere.push('created_at >= ?'); reviewParams.push(`${from} 00:00:00`); }
    if (to) { reviewWhere.push('created_at <= ?'); reviewParams.push(`${to} 23:59:59`); }
    if (reviewWhere.length) reviewSql += ' WHERE ' + reviewWhere.join(' AND ');
    const [[reviewStats]] = await pool.query(reviewSql, reviewParams);

    const n = (v) => Number(v) || 0;
    ok(ctx, {
      standard: 'GB/T 47801—2026',
      period: { from, to },
      aspects: [
        { aspect: '服务提供者', facts: { ordersTotal: n(orderStats.total), ordersAccepted: n(orderStats.accepted), ordersDone: n(orderStats.done) } },
        { aspect: '服务用品', facts: null, note: '未纳入平台管理' },
        { aspect: '服务平台', note: '以平台功能路由为准（服务展示 / 预约 / 订单 / 支付 / 评价 / 账号）' },
        { aspect: '服务人员', facts: { companionsTotal: n(companionStats.total), approved: n(companionStats.approved), trained: n(companionStats.trained), withExpiredDocs: n(companionStats.expired_docs) } },
        { aspect: '服务内容', facts: { allowedRules: n(ruleStats.allowed_rules), forbiddenRules: n(ruleStats.forbidden_rules), rulesWithKeywords: n(ruleStats.with_keywords) } },
        { aspect: '服务流程', facts: { ordersWithLogs: n(flowStats.logged_orders), checkinNodes: n(flowStats.nodes), flaggedNodes: n(flowStats.flagged), consentsSigned: n(consentStats.signed) } },
        { aspect: '服务评价与改进', facts: { reviewsTotal: n(reviewStats.reviews), reviewsAvgScore: reviewStats.avg_score ? Number(reviewStats.avg_score) : null } },
      ],
      scoring: 'PENDING_DESIGN',
      note: '数据摘要版（不含评分）；细粒度评分规则待设计后接入；报告即时生成、不落库',
    });
  });
}

module.exports = { register };
