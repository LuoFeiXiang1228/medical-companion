<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filters">
        <el-select v-model="filters.status" placeholder="订单状态" clearable style="width: 150px" @change="load">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-select v-model="filters.stage" placeholder="国标阶段" clearable style="width: 160px" @change="load">
          <el-option label="① 服务信息提供" :value="1" />
          <el-option label="② 委托与受理" :value="2" />
          <el-option label="③ 服务交付" :value="3" />
        </el-select>
        <el-select v-model="filters.payStatus" placeholder="支付状态" clearable style="width: 130px" @change="load">
          <el-option label="未支付" :value="0" />
          <el-option label="已支付" :value="1" />
        </el-select>
        <el-input v-model="filters.keyword" placeholder="单号 / 就医人" style="width: 190px" clearable @keyup.enter="load" />
        <el-button type="primary" @click="load">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="order_no" label="订单号" width="175" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="plain" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="阶段" width="120">
          <template #default="{ row }">{{ stageText(row.stage) }}</template>
        </el-table-column>
        <el-table-column prop="service_date" label="服务日期" width="105" />
        <el-table-column prop="hospital_name" label="医院" min-width="130" />
        <el-table-column prop="department_name" label="科室" width="100" />
        <el-table-column prop="patient_name" label="就医人" width="90" />
        <el-table-column label="陪诊员" width="95">
          <template #default="{ row }">{{ row.companion_name || '待指派' }}</template>
        </el-table-column>
        <el-table-column prop="total_amount" label="金额" width="90" />
        <el-table-column label="留痕" width="75">
          <template #default="{ row }">{{ row.log_count }} 条</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">详情</el-button>
            <el-button
              size="small"
              type="primary"
              v-if="row.status === 10 && row.pay_status === 1"
              @click="onAccept(row)"
            >受理</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer v-model="detailVisible" title="订单详情" size="580px">
      <template v-if="detail">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="订单号">{{ detail.order.order_no }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ statusText(detail.order.status) }}（{{ stageText(detail.order.stage) }}）
          </el-descriptions-item>
          <el-descriptions-item label="服务项目">{{ (detail.items[0] || {}).name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="医院 / 科室">
            {{ detail.order.hospital_name || '-' }} / {{ detail.order.department_name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="就医人">
            {{ detail.order.patient_name || '-' }}（{{ detail.order.patient_phone || '无电话' }}）
          </el-descriptions-item>
          <el-descriptions-item label="就诊时间">
            {{ String(detail.order.service_date || '').slice(0, 10) }} {{ detail.order.time_label || '' }}
          </el-descriptions-item>
          <el-descriptions-item label="备注">{{ detail.order.remark || '-' }}</el-descriptions-item>
          <el-descriptions-item label="陪诊员">
            {{ detail.order.companion_name || '待指派' }}
          </el-descriptions-item>
          <el-descriptions-item label="协议签署">
            {{ detail.consent && detail.consent.sign_status === 1 ? '已签署' : '未签署' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="sub-title">服务留痕（{{ (detail.logs || []).length }} 条）</div>
        <el-empty v-if="!(detail.logs || []).length" description="暂无留痕" :image-size="60" />
        <div v-for="l in detail.logs" :key="l.id" class="log-item">
          <div class="log-head">
            <span class="log-node">{{ l.node_name || l.node_code }}</span>
            <span class="log-time">{{ l.occurred_at }}</span>
          </div>
          <div v-if="l.location_text" class="log-line">📍 {{ l.location_text }}</div>
          <div v-if="l.remark" class="log-line">{{ l.remark }}</div>
          <el-tag v-if="l.is_flagged" type="warning" size="small" effect="plain">⚠ 待复核</el-tag>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchOrders, fetchOrderDetail, acceptOrder } from '../api/admin';

const filters = reactive({ status: '', stage: '', payStatus: '', keyword: '' });
const list = ref([]);
const loading = ref(false);
const detailVisible = ref(false);
const detail = ref(null);

const statusOptions = [
  { value: 10, label: '待受理' },
  { value: 20, label: '已受理 · 待派单' },
  { value: 30, label: '已派单 · 待服务' },
  { value: 40, label: '服务中' },
  { value: 50, label: '已完成' },
  { value: 0, label: '已取消' },
  { value: 60, label: '纠纷中' },
];

function statusText(s) {
  const x = statusOptions.find((o) => o.value === s);
  return x ? x.label : String(s);
}
function statusTagType(s) {
  if (s === 50) return 'success';
  if (s === 0) return 'info';
  if (s === 60) return 'danger';
  if (s === 10) return 'warning';
  return 'primary';
}
function stageText(s) {
  return { 1: '① 信息提供', 2: '② 委托受理', 3: '③ 服务交付' }[s] || '-';
}

async function load() {
  loading.value = true;
  try {
    const params = {};
    Object.keys(filters).forEach((k) => {
      if (filters[k] !== '' && filters[k] !== null && filters[k] !== undefined) params[k] = filters[k];
    });
    list.value = await fetchOrders(params);
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function openDetail(row) {
  try {
    detail.value = await fetchOrderDetail(row.id);
    detailVisible.value = true;
  } catch (e) {
    ElMessage.error(e.message || '加载详情失败');
  }
}

async function onAccept(row) {
  try {
    await ElMessageBox.confirm(`确认受理订单 ${row.order_no}？受理后订单进入派单流程。`, '受理确认', { type: 'warning' });
  } catch (e) {
    return;
  }
  try {
    await acceptOrder(row.id);
    ElMessage.success('已受理');
    load();
  } catch (e) {
    ElMessage.error(e.message || '受理失败');
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
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.sub-title {
  margin: 18px 0 10px;
  font-weight: 600;
  font-size: 14px;
}
.log-item {
  background: #f8f9fb;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.log-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.log-node {
  font-weight: 600;
}
.log-time {
  color: #909399;
  font-size: 12px;
}
.log-line {
  margin-top: 4px;
  font-size: 12px;
  color: #606266;
}
</style>
