// 陪诊员端：登录 / 注册申请（账号由机构管理；注册需提交资质材料，审核通过后方可接单）
const { companionLogin, companionRegister } = require('../../../utils/request');

Page({
  data: {
    mode: 'login', // login | register
    username: '',
    password: '',
    rName: '',
    rPhone: '',
    rUsername: '',
    rPassword: '',
    certType: '',
    certNo: '',
    certIssueOrg: '',
    certExpire: '',
    healthCertNo: '',
    healthCertExpire: '',
    submitting: false,
  },

  switchMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }); },
  onField(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  onDate(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },

  async doLogin() {
    const { username, password, submitting } = this.data;
    if (submitting) return;
    if (!username.trim() || !password) { wx.showToast({ title: '请输入账号和密码', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      await companionLogin(username, password);
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/companion/index/index' }), 600);
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '登录失败', icon: 'none', duration: 2500 });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async doRegister() {
    const d = this.data;
    if (d.submitting) return;
    if (!d.rName.trim()) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return; }
    if (!/^1\d{10}$/.test(d.rPhone.trim())) { wx.showToast({ title: '请填写正确的手机号', icon: 'none' }); return; }
    if (!/^[A-Za-z0-9_]{4,20}$/.test(d.rUsername.trim())) { wx.showToast({ title: '账号需为 4-20 位字母、数字或下划线', icon: 'none' }); return; }
    if (d.rPassword.length < 12 || d.rPassword.length > 128) { wx.showToast({ title: '密码需为 12–128 位', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      const res = await companionRegister({
        name: d.rName.trim(),
        phone: d.rPhone.trim(),
        username: d.rUsername.trim(),
        password: d.rPassword,
        certType: d.certType || undefined,
        certNo: d.certNo || undefined,
        certIssueOrg: d.certIssueOrg || undefined,
        certExpire: d.certExpire || undefined,
        healthCertNo: d.healthCertNo || undefined,
        healthCertExpire: d.healthCertExpire || undefined,
      });
      wx.showModal({
        title: '提交成功',
        content: (res && res.message) || '注册申请已提交，请等待管理员审核',
        showCancel: false,
        success: () => this.setData({ mode: 'login' }),
      });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none', duration: 2500 });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
