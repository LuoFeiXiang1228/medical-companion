<template>
  <div class="page">
    <el-card shadow="never">
      <el-tabs v-model="tab" @tab-change="load">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="待审核" name="0" />
        <el-tab-pane label="已通过" name="1" />
        <el-tab-pane label="已驳回" name="2" />
        <el-tab-pane label="30 天内证件到期" name="expiring" />
      </el-tabs>

      <div class="filters">
        <el-input v-model="keyword" placeholder="姓名 / 手机号 / 账号" style="width: 220px" clearable @keyup.enter="load" />
        <el-button type="primary" @click="load">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="real_name" label="姓名" width="90" />
        <el-table-column prop="phone" label="手机号" width="120" />
        <el-table-column prop="username" label="登录账号" width="110" />
        <el-table-column label="资质审核" width="100">
          <template #default="{ row }">
            <el-tag :type="auditTag(row.audit_status)" size="small" effect="plain">{{ auditText(row.audit_status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="职业能力证书" min-width="150">
          <template #default="{ row }">{{ row.cert_no || '未登记' }}</template>
        </el-table-column>
        <el-table-column label="健康证" min-width="140">
          <template #default="{ row }">{{ row.health_cert_no || '未登记' }}</template>
        </el-table-column>
        <el-table-column label="健康证到期" width="110">
          <template #default="{ row }">{{ fmtDate(row.health_cert_expire) }}</template>
        </el-table-column>
        <el-table-column label="培训" width="85">
          <template #default="{ row }">{{ trainText(row.train_status) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">详情</el-button>
            <el-button size="small" type="success" plain v-if="row.audit_status === 0" @click="openAudit(row, 'APPROVE')">通过</el-button>
            <el-button size="small" type="danger" plain v-if="row.audit_status === 0" @click="openAudit(row, 'REJECT')">驳回</el-button>
            <el-button size="small" @click="openCert(row)">录入证件</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="auditVisible" :title="auditForm.result === 'APPROVE' ? '通过资质审核' : '驳回资质审核'" width="420px">
      <el-form label-width="80px">
        <el-form-item label="审核对象">{{ auditRow ? auditRow.real_name : '' }}</el-form-item>
        <el-form-item label="审核意见">
          <el-input v-model="auditForm.comment" type="textarea" :rows="3" placeholder="驳回时建议填写原因（将展示给陪诊员）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="auditVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitAudit">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="certVisible" title="录入 / 更新证件" width="480px">
      <el-form label-width="95px">
        <el-form-item label="证件类型">
          <el-radio-group v-model="certForm.type">
            <el-radio label="cert">职业能力证书</el-radio>
            <el-radio label="health">健康证</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="证书名称" v-if="certForm.type === 'cert'">
          <el-input v-model="certForm.certType" placeholder="如：陪诊服务专项职业能力证书" />
        </el-form-item>
        <el-form-item label="证件编号">
          <el-input v-model="certForm.no" />
        </el-form-item>
        <el-form-item label="发证机构" v-if="certForm.type === 'cert'">
          <el-input v-model="certForm.issuer" />
        </el-form-item>
        <el-form-item label="有效期至">
          <el-date-picker v-model="certForm.validTo" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="certVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCert">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="陪诊员详情" size="500px">
      <template v-if="detail">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="姓名">{{ detail.real_name }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ detail.phone }}</el-descriptions-item>
          <el-descriptions-item label="登录账号">{{ detail.username || '-' }}</el-descriptions-item>
          <el-descriptions-item label="审核状态">{{ auditText(detail.audit_status) }}</el-descriptions-item>
          <el-descriptions-item label="审核意见">{{ detail.audit_remark || '-' }}</el-descriptions-item>
          <el-descriptions-item label="岗前培训">{{ trainText(detail.train_status) }}</el-descriptions-item>
          <el-descriptions-item label="职业能力证书">
            {{ detail.cert_no || '未登记' }}（{{ fmtDate(detail.cert_expire) }} 到期）
          </el-descriptions-item>
          <el-descriptions-item label="健康证">
            {{ detail.health_cert_no || '未登记' }}（{{ fmtDate(detail.health_cert_expire) }} 到期）
          </el-descriptions-item>
          <el-descriptions-item label="可服务范围">{{ detail.hospital_scope || '未设置' }}</el-descriptions-item>
          <el-descriptions-item label="接单状态">{{ detail.work_status === 1 ? '接单中' : '歇业' }}</el-descriptions-item>
        </el-descriptions>

        <div class="sub-title">证书核验</div>
        <el-alert type="info" :closable="false" show-icon title="外部核验通道未接入，当前为人工核验模式（触发后请线下核验并录入结论）" />
        <el-button class="mt" size="small" :loading="verifying" @click="onVerify">触发核验</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  fetchCompanions,
  fetchCompanion,
  auditCompanion,
  saveCompanionCert,
  verifyCompanionCert,
} from '../api/admin';

const tab = ref('all');
const keyword = ref('');
const list = ref([]);
const loading = ref(false);
const saving = ref(false);
const verifying = ref(false);

const auditVisible = ref(false);
const auditRow = ref(null);
const auditForm = reactive({ result: 'APPROVE', comment: '' });

const certVisible = ref(false);
const certRow = ref(null);
const certForm = reactive({ type: 'cert', certType: '', no: '', issuer: '', validTo: '' });

const detailVisible = ref(false);
const detail = ref(null);

function auditText(s) {
  return { 0: '待审核', 1: '已通过', 2: '已驳回' }[s] || '-';
}
function auditTag(s) {
  return { 0: 'warning', 1: 'success', 2: 'danger' }[s] || 'info';
}
function trainText(s) {
  return { 0: '未培训', 1: '培训中', 2: '已完成' }[s] || '-';
}
function fmtDate(v) {
  return v ? String(v).slice(0, 10) : '-';
}

async function load() {
  loading.value = true;
  try {
    const params = {};
    if (tab.value === 'expiring') params.expiring = 1;
    else if (tab.value !== 'all') params.auditStatus = Number(tab.value);
    if (keyword.value) params.keyword = keyword.value;
    list.value = await fetchCompanions(params);
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openAudit(row, result) {
  auditRow.value = row;
  auditForm.result = result;
  auditForm.comment = '';
  auditVisible.value = true;
}

async function submitAudit() {
  if (auditForm.result === 'REJECT' && !auditForm.comment.trim()) {
    try {
      await ElMessageBox.confirm('未填写驳回原因，确定直接驳回？', '提示', { type: 'warning' });
    } catch (e) {
      return;
    }
  }
  saving.value = true;
  try {
    await auditCompanion(auditRow.value.id, auditForm.result, auditForm.comment.trim() || undefined);
    ElMessage.success('审核完成');
    auditVisible.value = false;
    load();
  } catch (e) {
    ElMessage.error(e.message || '审核失败');
  } finally {
    saving.value = false;
  }
}

function openCert(row) {
  certRow.value = row;
  certForm.type = 'cert';
  certForm.certType = row.cert_type || '';
  certForm.no = row.cert_no || row.health_cert_no || '';
  certForm.issuer = '';
  certForm.validTo = '';
  certVisible.value = true;
}

async function submitCert() {
  if (!certForm.no.trim()) {
    ElMessage.warning('请填写证件编号');
    return;
  }
  saving.value = true;
  try {
    await saveCompanionCert(certRow.value.id, {
      type: certForm.type,
      certType: certForm.certType || undefined,
      no: certForm.no.trim(),
      issuer: certForm.issuer || undefined,
      validTo: certForm.validTo || undefined,
    });
    ElMessage.success('已保存');
    certVisible.value = false;
    load();
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function openDetail(row) {
  try {
    detail.value = await fetchCompanion(row.id);
    detailVisible.value = true;
  } catch (e) {
    ElMessage.error(e.message || '加载详情失败');
  }
}

async function onVerify() {
  verifying.value = true;
  try {
    const res = await verifyCompanionCert(detail.value.id);
    ElMessage.info((res && res.message) || '已记录核验请求');
  } catch (e) {
    ElMessage.error(e.message || '操作失败');
  } finally {
    verifying.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page {
  padding: 4px;
}
.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.sub-title {
  margin: 18px 0 10px;
  font-weight: 600;
  font-size: 14px;
}
.mt {
  margin-top: 12px;
}
</style>
