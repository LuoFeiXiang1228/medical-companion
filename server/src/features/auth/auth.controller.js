const { hashPassword, verifyPassword } = require('../../utils/password');
const Router = require('koa-router');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const pool = require('../../db/mysql');
const wechat = require('../../utils/wechat');
const { ok } = require('../../utils/response');
const { ValidationError, ConflictError } = require('../../errors');
const { authenticate } = require('../../middleware/auth');
const { logAudit } = require('../../services/log.service');

// 只返回允许暴露给前端的用户字段（不暴露 openid，避免隐私泄露）
function publicUser(u) {
  return {
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    phone: u.phone,
    created_at: u.created_at,
  };
}

function sign(user) {
  return jwt.sign({ userId: user.id, role: user.role || 'user' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function register(router) {
  // ===== 用户端（微信） =====

  // 用户端登录：微信 code 换 session，首次自动建号
  router.post('/auth/login', async (ctx) => {
    const { code } = ctx.request.body;
    const session = await wechat.code2Session(code);
    let [users] = await pool.query('SELECT * FROM users WHERE openid=?', [session.openid]);
    let user = users[0];
    if (!user) {
      const [r] = await pool.query('INSERT INTO users (openid,unionid) VALUES (?,?)', [session.openid, session.unionid || null]);
      [users] = await pool.query('SELECT * FROM users WHERE id=?', [r.insertId]);
      user = users[0];
    }
    user.role = 'user';
    ok(ctx, { token: sign(user), user: publicUser(user) });
  });

  // 当前登录用户资料（GET，需登录）
  router.get('/auth/profile', authenticate, async (ctx) => {
    const [rows] = await pool.query(
      'SELECT id, openid, nickname, avatar, phone, created_at FROM users WHERE id=?',
      [ctx.state.user.userId],
    );
    if (!rows.length) { ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '用户不存在', data: null }; return; }
    ok(ctx, { user: publicUser(rows[0]) });
  });

  // 更新当前用户资料（POST，需登录）
  // 字段：nickname（昵称）、avatar（头像 URL）、phoneCode（getPhoneNumber 授权码，服务端换真实手机号）
  // 微信规则：手机号必须用户点按钮授权后由服务端解密；昵称/头像由用户在前端填写后传上来。
  router.post('/auth/profile', authenticate, async (ctx) => {
    const userId = ctx.state.user.userId;
    const body = ctx.request.body || {};
    const sets = [];
    const params = [];

    if (typeof body.nickname === 'string' && body.nickname.trim()) {
      sets.push('nickname = ?');
      params.push(body.nickname.trim().slice(0, 64));
    }
    if (typeof body.avatar === 'string' && body.avatar.trim()) {
      sets.push('avatar = ?');
      params.push(body.avatar.trim().slice(0, 255));
    }
    if (body.phoneCode) {
      const phoneInfo = await wechat.getPhoneNumber(body.phoneCode);
      const phone = phoneInfo && phoneInfo.phoneNumber;
      if (!phone || !/^1\d{10}$/.test(phone)) throw new ValidationError('微信返回的手机号格式异常');
      sets.push('phone = ?');
      params.push(phone);
    }

    if (!sets.length) {
      ctx.status = 400;
      ctx.body = { code: 'INVALID', message: '没有需要更新的资料', data: null };
      return;
    }
    params.push(userId);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.query(
      'SELECT id, openid, nickname, avatar, phone, created_at FROM users WHERE id=?',
      [userId],
    );
    ok(ctx, { user: publicUser(rows[0]) });
  });

  // 合并小程序身份判定：同一 openid 同时查用户/陪诊员身份，供前端决定入口
  router.post('/auth/app-login', async (ctx) => {
    const { code } = ctx.request.body;
    if (!code) { ctx.status = 400; ctx.body = { code: 'INVALID', message: '缺少 code', data: null }; return; }
    const session = await wechat.code2Session(code);
    const [users] = await pool.query('SELECT id FROM users WHERE openid=?', [session.openid]);
    const [companions] = await pool.query(
      'SELECT audit_status, phone FROM companions WHERE openid=?',
      [session.openid],
    );
    const c = companions[0];
    // 审核通过且已绑定微信，才算「已就绪的陪诊员」
    const isCompanion = !!(c && c.audit_status === 1);
    const isUser = users.length > 0;
    ok(ctx, {
      isUser,
      isCompanion,
      // 是否可注册成为陪诊员：已有用户身份但尚无可用陪诊员账号时鼓励去注册
      needCompanionRegister: isUser && !isCompanion,
    });
  });

  // ===== 陪诊员端（账号密码，机构发放管理） =====

  // 陪诊员登录：返回 token + 资质状态摘要（供前端提示证件续期）
  router.post('/companion/login', async (ctx) => {
    const { username, password } = ctx.request.body;
    if (!username || !password) {
      ctx.status = 400; ctx.body = { code: 'INVALID', message: '请输入账号和密码', data: null }; return;
    }
    const [rows] = await pool.query('SELECT * FROM companions WHERE username=?', [String(username).trim()]);
    if (!rows.length) {
      ctx.status = 401; ctx.body = { code: 'UNAUTHORIZED', message: '账号或密码错误', data: null }; return;
    }
    const c = rows[0];
    if (!(await verifyPassword(password, c.password_hash))) {
      ctx.status = 401; ctx.body = { code: 'UNAUTHORIZED', message: '账号或密码错误', data: null }; return;
    }
    if (c.audit_status === 0) {
      ctx.status = 403; ctx.body = { code: 'PENDING_REVIEW', message: '资质审核中，请等待管理员审核', data: null }; return;
    }
    if (c.audit_status === 2) {
      ctx.status = 403;
      ctx.body = { code: 'REJECTED', message: c.audit_remark ? `资质审核未通过：${c.audit_remark}` : '资质审核未通过', data: null };
      return;
    }
    if (!c.password_hash.startsWith('scrypt$')) await pool.query('UPDATE companions SET password_hash=? WHERE id=? AND password_hash=?', [await hashPassword(password), c.id, c.password_hash]);
    const token = jwt.sign({ userId: c.id, role: 'companion' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    logAudit({
      operatorId: c.id, operatorType: 'companion', action: 'LOGIN',
      resourceType: 'auth', details: { username: c.username }, ipAddress: ctx.ip,
    });
    ok(ctx, {
      token,
      companion: { id: c.id, name: c.real_name, phone: c.phone, username: c.username },
      // 资质状态摘要（前端可提示「健康证将于 X 天到期」）
      qualification: {
        auditStatus: c.audit_status,
        trainStatus: c.train_status,
        workStatus: c.work_status,
        certExpire: c.cert_expire,
        healthCertExpire: c.health_cert_expire,
      },
    });
  });

  // 陪诊员注册申请（基础资料 + 资质材料，落库为「待审核」）
  router.post('/companion/register', async (ctx) => {
    const b = ctx.request.body || {};
    const name = String(b.name || '').trim();
    const phone = String(b.phone || '').trim();
    const uname = String(b.username || '').trim();
    const password = String(b.password || '');
    if (!name) throw new ValidationError('请填写姓名');
    if (!/^1\d{10}$/.test(phone)) throw new ValidationError('请填写正确的11位手机号');
    if (!/^[A-Za-z0-9_]{4,20}$/.test(uname)) throw new ValidationError('登录账号需为4-20位字母、数字或下划线');
    if (password.length < 12 || password.length > 128) throw new ValidationError('登录密码需为12-128位');

    const [nameDup] = await pool.query('SELECT id FROM companions WHERE username=?', [uname]);
    if (nameDup.length) throw new ConflictError('该登录账号已被占用，请换一个');
    const [phoneDup] = await pool.query('SELECT id FROM companions WHERE phone=?', [phone]);
    if (phoneDup.length) throw new ConflictError('手机号已被注册');

    // 微信授权可选：拿得到就顺手绑定 openid，失败不影响注册
    let openid = null;
    if (b.code) {
      try {
        const session = await wechat.code2Session(b.code);
        openid = session.openid || null;
        if (openid) {
          const [oidDup] = await pool.query('SELECT id FROM companions WHERE openid=?', [openid]);
          if (oidDup.length) openid = null;
        }
      } catch (e) {
        console.warn('companion register code2Session failed, skip openid bind:', e.message);
      }
    }

    // 注：身份证号采集与加密方案待定（设计清单待确认项），暂不开放
    const hash = await hashPassword(password);
    const [r] = await pool.query(
      `INSERT INTO companions
         (real_name, phone, openid, username, password_hash, cert_type, cert_no, cert_issue_org, cert_expire, health_cert_no, health_cert_expire, audit_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
      [
        name, phone, openid, uname, hash,
        b.certType ? String(b.certType).slice(0, 64) : null,
        b.certNo ? String(b.certNo).slice(0, 64) : null,
        b.certIssueOrg ? String(b.certIssueOrg).slice(0, 128) : null,
        b.certExpire || null,
        b.healthCertNo ? String(b.healthCertNo).slice(0, 64) : null,
        b.healthCertExpire || null,
      ],
    );

    logAudit({
      operatorId: 0, operatorType: 'companion', action: 'REGISTER_APPLY',
      resourceType: 'companion', resourceId: r.insertId,
      details: { name, phone, username: uname },
      ipAddress: ctx.ip,
    });

    ok(ctx, {
      status: 'PENDING',
      companionId: r.insertId,
      message: '注册申请已提交，请等待管理员审核通过后使用账号密码登录',
    });
  });

  // 统一身份查询：按 token 角色返回对应身份资料
  router.get('/auth/me', authenticate, async (ctx) => {
    const { userId, role } = ctx.state.user;
    if (role === 'companion') {
      const [rows] = await pool.query(
        `SELECT id, real_name, phone, avatar, cert_no, cert_expire, health_cert_no, health_cert_expire,
                train_status, audit_status, audit_remark, work_status, score
         FROM companions WHERE id=?`,
        [userId],
      );
      if (!rows.length) { ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '陪诊员不存在', data: null }; return; }
      ok(ctx, { role: 'companion', companion: rows[0] });
      return;
    }
    if (role === 'super' || role === 'manager' || role === 'admin') {
      const [rows] = await pool.query('SELECT id, username, role FROM admin_users WHERE id=?', [userId]);
      if (!rows.length) { ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '管理员不存在', data: null }; return; }
      ok(ctx, { role: rows[0].role, admin: { id: rows[0].id, username: rows[0].username } });
      return;
    }
    const [rows] = await pool.query(
      'SELECT id, openid, nickname, avatar, phone, created_at FROM users WHERE id=?',
      [userId],
    );
    if (!rows.length) { ctx.status = 404; ctx.body = { code: 'NOT_FOUND', message: '用户不存在', data: null }; return; }
    ok(ctx, { role: 'user', user: publicUser(rows[0]) });
  });

  // ===== 管理端 =====

  // 管理端登录（账号密码）
  // 注：admin_users 的权限/状态字段随 admin 模块重写后接入，当前按 role 控制
  router.post('/admin/login', async (ctx) => {
    const { username, password } = ctx.request.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || password.length > 128) throw new ValidationError('请输入有效账号和密码');
    const [rows] = await pool.query('SELECT * FROM admin_users WHERE username=?', [username]);
    if (!rows.length) { ctx.status = 401; ctx.body = { code: 'UNAUTHORIZED', message: '账号或密码错误', data: null }; return; }
    const admin = rows[0];
    if (!(await verifyPassword(password, admin.password_hash))) { ctx.status = 401; ctx.body = { code: 'UNAUTHORIZED', message: '账号或密码错误', data: null }; return; }
    if (!admin.password_hash.startsWith('scrypt$')) await pool.query('UPDATE admin_users SET password_hash=? WHERE id=? AND password_hash=?', [await hashPassword(password), admin.id, admin.password_hash]);
    const token = jwt.sign(
      { userId: admin.id, role: admin.role || 'manager', username: admin.username },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn },
    );
    logAudit({
      operatorId: admin.id, operatorType: 'admin', action: 'LOGIN',
      resourceType: 'auth', details: { username: admin.username }, ipAddress: ctx.ip,
    });
    ok(ctx, { token, role: admin.role || 'manager' });
  });
}

module.exports = { register };
