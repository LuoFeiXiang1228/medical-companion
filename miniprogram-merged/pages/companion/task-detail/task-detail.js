// 陪诊任务详情：服务信息 + 多节点打卡 + 留痕列表（只读）+ 追加更正
const companionApi = require('../../../services/companion');
const { BASE_URL, isCompanionLoggedIn } = require('../../../utils/request');

const NODES = [
  { code: 'ARRIVE_HOSPITAL', label: '到院' },
  { code: 'TAKE_NUMBER', label: '取号' },
  { code: 'GUIDE_DEPARTMENT', label: '引导至科室' },
  { code: 'WAIT_VISIT', label: '候诊陪同' },
  { code: 'VISIT_COMPANION', label: '面诊陪同' },
  { code: 'EXAM_ARRANGE', label: '检查安排' },
  { code: 'SAMPLE_DELIVERY', label: '样本送检' },
  { code: 'PAY_FEE', label: '缴费' },
  { code: 'TAKE_MEDICINE', label: '取药' },
  { code: 'COLLECT_REPORT', label: '取报告' },
  { code: 'LEAVE_HOSPITAL', label: '离院/服务结束' },
];
const MOBILITY_TEXT = { 1: '可自理', 2: '需搀扶', 3: '轮椅', 4: '卧床' };

function fmtTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(5, 16);
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getMonth() + 1}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 上传留痕图片：读取本地文件 → base64 → /upload/image-base64 → 返回 URL
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
              reject(new Error((body && body.message) || '图片上传失败'));
            }
          },
          fail: () => reject(new Error('图片上传失败')),
        });
      },
      fail: () => reject(new Error('读取图片失败')),
    });
  });
}

Page({
  data: {
    id: 0,
    task: null,
    items: [],
    checkins: [],
    nodes: NODES,
    doneCodes: [],
    showCheckin: false,
    current: null,
    cRemark: '',
    cLocation: '',
    cPhotos: [],
    showCorrection: false,
    correctTarget: null,
    corrReason: '',
    corrContent: '',
    submitting: false,
  },

  onLoad(query) {
    if (!isCompanionLoggedIn()) {
      wx.reLaunch({ url: '/pages/companion/login/login' });
      return;
    }
    this.setData({ id: Number(query.id || 0) });
  },

  onShow() { this.load(); },

  async load() {
    try {
      const [detail, checkins] = await Promise.all([
        companionApi.getTaskDetail(this.data.id),
        companionApi.getCheckins(this.data.id).catch(() => []),
      ]);
      const task = detail.order || {};
      if (task.mobility) task.mobilityText = MOBILITY_TEXT[task.mobility] || '';
      const list = checkins || [];
      const doneCodes = list.filter((l) => l.node_code !== 'CORRECTION').map((l) => l.node_code);
      this.setData({
        task,
        items: detail.items || [],
        checkins: list.map((l) => ({ ...l, timeText: fmtTime(l.occurred_at) })),
        doneCodes,
      });
    } catch (e) { /* 提示已处理 */ }
  },

  // —— 打卡 ——
  openCheckin(e) {
    const code = e.currentTarget.dataset.code;
    if (this.data.doneCodes.indexOf(code) >= 0) {
      wx.showToast({ title: '该节点已打卡', icon: 'none' });
      return;
    }
    const node = NODES.find((n) => n.code === code);
    if (!node) return;
    this.setData({ showCheckin: true, current: node, cRemark: '', cLocation: '', cPhotos: [] });
  },
  closeCheckin() { this.setData({ showCheckin: false, current: null }); },
  onRemark(e) { this.setData({ cRemark: e.detail.value }); },
  onLocation(e) { this.setData({ cLocation: e.detail.value }); },

  choosePhoto() {
    const left = 3 - this.data.cPhotos.length;
    if (left <= 0) return;
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      success: (res) => {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath);
        this.setData({ cPhotos: this.data.cPhotos.concat(paths).slice(0, 3) });
      },
      fail: () => {},
    });
  },
  removePhoto(e) {
    const i = Number(e.currentTarget.dataset.i);
    const arr = this.data.cPhotos.slice();
    arr.splice(i, 1);
    this.setData({ cPhotos: arr });
  },

  async submitCheckin() {
    const d = this.data;
    if (!d.current || d.submitting) return;
    this.setData({ submitting: true });
    try {
      let photos = [];
      if (d.cPhotos.length) {
        wx.showLoading({ title: '上传留痕照片…', mask: true });
        try {
          photos = await Promise.all(d.cPhotos.map(uploadImage));
        } finally {
          wx.hideLoading();
        }
      }
      const res = await companionApi.checkin(d.id, {
        nodeType: d.current.code,
        remark: d.cRemark || undefined,
        locationText: d.cLocation || undefined,
        photos: photos.length ? photos : undefined,
      });
      this.setData({ showCheckin: false, current: null });
      if (res && res.flagged) {
        wx.showModal({
          title: '已记录 · 触发服务边界提示',
          content: (res.hits || []).map((h) => `${h.code} ${h.title}`).join('\n') + '\n\n本条已标记待复核，原记录保留。',
          showCancel: false,
        });
      } else {
        wx.showToast({ title: '打卡成功', icon: 'success' });
      }
      this.load();
    } catch (e) { /* 提示已处理 */ } finally {
      this.setData({ submitting: false });
    }
  },

  // —— 追加更正 ——
  openCorrection(e) {
    const id = Number(e.currentTarget.dataset.id);
    const target = this.data.checkins.find((l) => l.id === id) || null;
    this.setData({ showCorrection: true, correctTarget: target, corrReason: '', corrContent: '' });
  },
  closeCorrection() { this.setData({ showCorrection: false, correctTarget: null }); },
  onCorrReason(e) { this.setData({ corrReason: e.detail.value }); },
  onCorrContent(e) { this.setData({ corrContent: e.detail.value }); },

  async submitCorrection() {
    const d = this.data;
    if (!d.correctTarget || d.submitting) return;
    if (!d.corrContent.trim()) { wx.showToast({ title: '请填写更正说明', icon: 'none' }); return; }
    this.setData({ submitting: true });
    try {
      await companionApi.submitCorrection(d.id, d.correctTarget.id, {
        reason: d.corrReason || undefined,
        content: d.corrContent.trim(),
      });
      wx.showToast({ title: '已追加更正', icon: 'success' });
      this.setData({ showCorrection: false, correctTarget: null });
      this.load();
    } catch (e) { /* 提示已处理 */ } finally {
      this.setData({ submitting: false });
    }
  },
});
