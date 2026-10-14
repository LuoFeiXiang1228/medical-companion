// 预约下单：就医人 / 医院 / 科室 / 就诊日期 / 时段 / 备注 → 创建订单 → 支付（mock 通道）
const catalog = require('../../services/catalog');
const patientsApi = require('../../services/patients');
const ordersApi = require('../../services/orders');

function formatLocalDate(d = new Date()) {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

Page({
  data: {
    packageId: 0,
    pkg: null,
    patients: [],
    patientIndex: -1,
    hospitals: [],
    hospitalIndex: -1,
    departments: [],
    departmentIndex: -1,
    date: '',
    minDate: '',
    slots: [],
    slotId: 0,
    remark: '',
    boundary: null,
    boundaryAgreed: false,
    submitting: false,
  },

  onLoad(query) {
    const today = formatLocalDate();
    this.setData({ packageId: Number(query.packageId || 0), minDate: today, date: today });
    this.init();
  },

  onShow() { this.loadPatients(); },

  async init() {
    this.loadPatients();
    this.loadHospitals();
    this.loadSlots();
    this.loadBoundary();
    try {
      const pkg = await catalog.getPackageDetail(this.data.packageId);
      this.setData({ pkg });
    } catch (e) { /* 静默 */ }
  },

  async loadPatients() {
    try {
      const list = await patientsApi.list();
      const patients = list || [];
      let idx = patients.findIndex((p) => p.is_default);
      if (idx < 0 && patients.length) idx = 0;
      this.setData({ patients, patientIndex: patients.length ? idx : -1 });
    } catch (e) { /* 静默 */ }
  },

  async loadHospitals() {
    try { const list = await catalog.getHospitals(); this.setData({ hospitals: list || [] }); } catch (e) { /* 静默 */ }
  },

  async loadSlots() {
    try { const list = await catalog.getAppointSlots(); this.setData({ slots: list || [] }); } catch (e) { /* 静默 */ }
  },

  async loadBoundary() {
    try { const boundary = await catalog.getServiceBoundary(); this.setData({ boundary }); } catch (e) { /* 静默 */ }
  },

  onPatientChange(e) { this.setData({ patientIndex: Number(e.detail.value) }); },

  onHospitalChange(e) {
    const i = Number(e.detail.value);
    this.setData({ hospitalIndex: i, departments: [], departmentIndex: -1 });
    const h = this.data.hospitals[i];
    if (h) this.loadDepartments(h.id);
  },

  async loadDepartments(hospitalId) {
    try { const list = await catalog.getDepartments(hospitalId); this.setData({ departments: list || [] }); } catch (e) { /* 静默 */ }
  },

  onDepartmentChange(e) { this.setData({ departmentIndex: Number(e.detail.value) }); },
  onDateChange(e) { this.setData({ date: e.detail.value }); },
  onSlot(e) { this.setData({ slotId: Number(e.currentTarget.dataset.id) }); },
  onRemark(e) { this.setData({ remark: e.detail.value }); },
  toggleAgree() { this.setData({ boundaryAgreed: !this.data.boundaryAgreed }); },
  goPatients() { wx.navigateTo({ url: '/pages/patients/patients' }); },

  async submit() {
    const d = this.data;
    if (d.submitting) return;
    const patient = d.patients[d.patientIndex];
    if (!patient) { wx.showToast({ title: '请先选择就医人', icon: 'none' }); return; }
    const hospital = d.hospitals[d.hospitalIndex];
    if (!hospital) { wx.showToast({ title: '请选择医院', icon: 'none' }); return; }
    const department = d.departments[d.departmentIndex];
    if (!department) { wx.showToast({ title: '请选择科室', icon: 'none' }); return; }
    if (!d.boundaryAgreed) { wx.showToast({ title: '请先确认服务边界声明', icon: 'none' }); return; }

    this.setData({ submitting: true });
    try {
      const res = await ordersApi.createOrder({
        packageId: d.packageId,
        patientId: patient.id,
        hospitalId: hospital.id,
        departmentId: department.id,
        appointDate: d.date,
        appointSlot: d.slotId || undefined,
        remark: d.remark || undefined,
      });
      await this.pay(res.orderId, res.totalAmount);
    } catch (e) { /* 提示已处理 */ } finally {
      this.setData({ submitting: false });
    }
  },

  // 支付：mock 通道 → 弹窗确认 → mock-confirm；微信通道 → wx.requestPayment
  async pay(orderId, amount) {
    let paid = false;
    try {
      const prepay = await ordersApi.prepay(orderId);
      if (prepay && prepay.mock) {
        const confirmed = await new Promise((resolve) => {
          wx.showModal({
            title: '测试环境 · 模拟支付',
            content: `订单金额 ¥${amount}。当前为模拟支付环境，点击「确认支付」即视为支付成功。`,
            confirmText: '确认支付',
            success: (r) => resolve(!!r.confirm),
            fail: () => resolve(false),
          });
        });
        if (confirmed) {
          await ordersApi.mockConfirm(orderId);
          paid = true;
        }
      } else if (prepay && prepay.timeStamp) {
        await new Promise((resolve, reject) => {
          wx.requestPayment(Object.assign({}, prepay, { success: resolve, fail: reject }));
        });
        paid = true;
      }
    } catch (e) { /* 支付未完成 */ }
    wx.showToast({
      title: paid ? '支付成功' : '订单已提交，可在订单中继续支付',
      icon: paid ? 'success' : 'none',
      duration: 1200,
    });
    setTimeout(() => wx.redirectTo({ url: '/pages/order-detail/order-detail?id=' + orderId }), 1000);
  },
});
