// 就医人管理：服务对象档案（可与下单人不同；替代原收货地址簿）
const patients = require('../../services/patients');

const RELATIONS = [
  { value: 'self', label: '本人' },
  { value: 'parent', label: '父母' },
  { value: 'child', label: '子女' },
  { value: 'other', label: '其他' },
];
const MOBILITY = [
  { value: 1, label: '可自理' },
  { value: 2, label: '需搀扶' },
  { value: 3, label: '轮椅' },
  { value: 4, label: '卧床' },
];

Page({
  data: {
    list: [],
    loading: false,
    showForm: false,
    relations: RELATIONS,
    mobilityOptions: MOBILITY,
    form: { name: '', phone: '', relation: 'parent', mobility: 0, healthNote: '', isDefault: 0 },
  },

  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true });
    try {
      const list = await patients.list();
      const withLabel = (list || []).map((p) => ({
        ...p,
        relationLabel: (RELATIONS.find((r) => r.value === p.relation) || {}).label || '',
      }));
      this.setData({ list: withLabel });
    } catch (e) { /* 统一提示已在请求层处理 */ } finally {
      this.setData({ loading: false });
    }
  },

  openForm() { this.setData({ showForm: true }); },
  closeForm() { this.setData({ showForm: false }); },

  onField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['form.' + key]: e.detail.value });
  },
  pickRelation(e) { this.setData({ 'form.relation': e.currentTarget.dataset.value }); },
  pickMobility(e) { this.setData({ 'form.mobility': Number(e.currentTarget.dataset.value) }); },
  toggleDefault(e) { this.setData({ 'form.isDefault': e.detail.value ? 1 : 0 }); },

  async submit() {
    const f = this.data.form;
    if (!f.name || !String(f.name).trim()) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return; }
    if (f.phone && !/^1\d{10}$/.test(f.phone)) { wx.showToast({ title: '手机号格式不正确', icon: 'none' }); return; }
    this.setData({ loading: true });
    try {
      await patients.create({
        name: String(f.name).trim(),
        phone: f.phone || undefined,
        relation: f.relation || undefined,
        mobility: f.mobility || undefined,
        healthNote: f.healthNote || undefined,
        isDefault: f.isDefault ? 1 : 0,
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({
        showForm: false,
        form: { name: '', phone: '', relation: 'parent', mobility: 0, healthNote: '', isDefault: 0 },
      });
      this.load();
    } catch (e) { /* 提示已处理 */ } finally {
      this.setData({ loading: false });
    }
  },

  async remove(e) {
    const id = e.currentTarget.dataset.id;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '删除就医人',
        content: '确定删除该就医人档案？',
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    try {
      await patients.remove(id);
      wx.showToast({ title: '已删除', icon: 'success' });
      this.load();
    } catch (e2) { /* 提示已处理 */ }
  },
});
