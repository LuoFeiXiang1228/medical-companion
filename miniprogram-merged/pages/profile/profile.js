// 个人资料：昵称 / 头像 / 手机号
const { request, getUserProfile, setUserProfile, refreshProfile, normalizeAvatar, BASE_URL } = require('../../utils/request');

function uploadImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => {
        const ext = /\.png$/i.test(filePath) ? 'png' : 'jpeg';
        wx.request({
          url: BASE_URL + '/upload/image-base64',
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { image: `data:image/${ext};base64,${r.data}` },
          success: (res) => {
            const body = res.data || {};
            if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0 && body.data && body.data.url) {
              resolve(body.data.url);
            } else {
              reject(new Error('上传失败'));
            }
          },
          fail: () => reject(new Error('上传失败')),
        });
      },
      fail: () => reject(new Error('读取失败')),
    });
  });
}

Page({
  data: { profile: {}, avatar: '' },

  onShow() { this.load(); },

  async load() {
    const fresh = await refreshProfile().catch(() => null);
    const p = fresh || getUserProfile();
    this.setData({ profile: p || {}, avatar: normalizeAvatar((p || {}).avatar) });
  },

  editNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入昵称（最多 16 字）',
      success: async (r) => {
        if (r.confirm && r.content && r.content.trim()) {
          await this.save({ nickname: r.content.trim().slice(0, 16) });
        }
      },
    });
  },

  async onChooseAvatar(e) {
    const path = e.detail && e.detail.avatarUrl;
    if (!path) return;
    wx.showLoading({ title: '上传中…', mask: true });
    try {
      const url = await uploadImage(path);
      await this.save({ avatar: url });
    } catch (err) {
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async bindPhone(e) {
    const code = e.detail && e.detail.code;
    if (!code) { wx.showToast({ title: '未获取到手机号授权', icon: 'none' }); return; }
    await this.save({ phoneCode: code });
  },

  async save(payload) {
    try {
      const res = await request({ url: '/auth/profile', method: 'POST', data: payload });
      if (res && res.user) {
        setUserProfile(res.user);
        this.load();
        wx.showToast({ title: '已保存', icon: 'success' });
      }
    } catch (e) { /* 提示已处理 */ }
  },
});
