<template>
  <div class="page">
    <el-card shadow="never">
      <el-tabs v-model="tab">
        <el-tab-pane label="合规规则维护" name="rules">
          <el-alert
            class="mb"
            type="info"
            :closable="false"
            show-icon
            title="规则库来源：GB/T 47801—2026 第 8.1 条（可协助开展的活动）/ 第 8.2 条（不应开展的服务）；关键词库用于服务留痕提交时的自动预检"
          />
          <el-table :data="rules" v-loading="loading" stripe>
            <el-table-column prop="rule_code" label="编码" width="105" />
            <el-table-column label="类别" width="105">
              <template #default="{ row }">
                <el-tag :type="row.rule_type === 1 ? 'danger' : 'success'" size="small" effect="plain">
                  {{ row.rule_type === 1 ? '不应开展' : '可协助' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="title" label="规则" min-width="210" />
            <el-table-column label="严重级" width="85">
              <template #default="{ row }">{{ sevText(row.severity) }}</template>
            </el-table-column>
            <el-table-column label="关键词库" min-width="170">
              <template #default="{ row }">
                <span :class="{ muted: !row.detect_pattern }">{{ row.detect_pattern || '未配置' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="85">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small" effect="plain">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="185" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openRule(row)">配置</el-button>
                <el-button size="small" type="primary" plain @click="openTest(row)">规则自测</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="合规体检报告" name="report">
          <div class="filters">
            <el-date-picker
              v-model="period"
              type="daterange"
              value-format="YYYY-MM-DD"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
            />
            <el-button type="primary" :loading="reporting" @click="genReport">生成报告</el-button>
          </div>

          <el-alert v-if="report" class="mb" type="warning" :closable="false" show-icon :title="report.note" />

          <el-row :gutter="16" v-if="report">
            <el-col :span="12" v-for="a in report.aspects" :key="a.aspect" class="aspect-col">
              <el-card shadow="never">
                <template #header><b>{{ a.aspect }}</b></template>
                <template v-if="a.facts">
                  <div v-for="(v, k) in a.facts" :key="k" class="fact-line">
                    <span class="fk">{{ factLabel(k) }}</span>
                    <span class="fv">{{ v === null ? '-' : v }}</span>
                  </div>
                </template>
                <div v-else class="fact-note">{{ a.note || '无数据' }}</div>
              </el-card>
            </el-col>
          </el-row>
          <el-empty v-else description="选择时间段后点击「生成报告」（即时生成、不落库）" />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="ruleVisible" title="规则配置" width="500px">
      <el-form v-if="ruleForm.id" label-width="95px">
        <el-form-item label="规则">{{ ruleForm.rule_code }} {{ ruleForm.title }}</el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="ruleForm.enabled" />
        </el-form-item>
        <el-form-item label="预警动作">
          <el-radio-group v-model="ruleForm.action">
            <el-radio label="WARN">提示（WARN）</el-radio>
            <el-radio label="BLOCK">拦截（BLOCK）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关键词库">
          <el-input
            v-model="ruleForm.keywordsText"
            type="textarea"
            :rows="4"
            placeholder="每行一个关键词（或正则）；留空表示暂不启用自动检测"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitRule">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="testVisible" title="规则自测" width="540px">
      <div class="test-rule">{{ testRow ? testRow.rule_code + ' · ' + testRow.title : '' }}</div>
      <el-input
        v-model="testText"
        type="textarea"
        :rows="3"
        placeholder="输入一段文本，例如：帮我看下这个检查结果正常吗"
        class="mb"
      />
      <el-button type="primary" :loading="testing" @click="runTest">测试</el-button>
      <el-alert
        v-if="testResult"
        class="mt"
        :type="testResult.hit ? 'error' : (testResult.error ? 'warning' : 'success')"
        :closable="false"
        show-icon
        :title="testResult.hit ? '已触发该规则' : (testResult.error || '未触发该规则')"
      />
      <div v-if="testResult && testResult.hit" class="test-hit">
        命中：{{ testResult.ruleCode }} {{ testResult.title }}
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchRules, updateRule, testRule, genComplianceReport } from '../api/admin';

const tab = ref('rules');
const rules = ref([]);
const loading = ref(false);
const saving = ref(false);
const reporting = ref(false);

const period = ref([]);
const report = ref(null);

const ruleVisible = ref(false);
const ruleForm = reactive({ id: 0, rule_code: '', title: '', enabled: true, action: 'WARN', keywordsText: '' });

const testVisible = ref(false);
const testRow = ref(null);
const testText = ref('');
const testing = ref(false);
const testResult = ref(null);

function sevText(s) {
  return { 1: '提示', 2: '拦截', 3: '阻断' }[s] || '-';
}

const FACT_LABELS = {
  ordersTotal: '订单总数',
  ordersAccepted: '已受理',
  ordersDone: '已完成',
  companionsTotal: '陪诊员总数',
  approved: '审核通过',
  trained: '培训完成',
  withExpiredDocs: '证件已过期',
  allowedRules: '可协助规则',
  forbiddenRules: '不应开展规则',
  rulesWithKeywords: '已配置关键词',
  ordersWithLogs: '有留痕订单',
  checkinNodes: '打卡节点数',
  flaggedNodes: '触发标记数',
  consentsSigned: '协议签署数',
  reviewsTotal: '评价数',
  reviewsAvgScore: '平均分',
};
function factLabel(k) {
  return FACT_LABELS[k] || k;
}

async function load() {
  loading.value = true;
  try {
    rules.value = await fetchRules();
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openRule(row) {
  Object.assign(ruleForm, {
    id: row.id,
    rule_code: row.rule_code,
    title: row.title,
    enabled: row.status === 1,
    action: row.severity === 2 ? 'BLOCK' : 'WARN',
    keywordsText: (row.detect_pattern || '').split('|').filter(Boolean).join('\n'),
  });
  ruleVisible.value = true;
}

async function submitRule() {
  saving.value = true;
  try {
    const keywords = ruleForm.keywordsText.split('\n').map((k) => k.trim()).filter(Boolean);
    await updateRule(ruleForm.id, {
      enabled: ruleForm.enabled,
      action: ruleForm.action,
      keywords,
    });
    ElMessage.success('已保存');
    ruleVisible.value = false;
    load();
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function openTest(row) {
  testRow.value = row;
  testText.value = '';
  testResult.value = null;
  testVisible.value = true;
}

async function runTest() {
  if (!testText.value.trim()) { ElMessage.warning('请输入测试文本'); return; }
  testing.value = true;
  try {
    testResult.value = await testRule(testRow.value.id, testText.value.trim());
  } catch (e) {
    ElMessage.error(e.message || '测试失败');
  } finally {
    testing.value = false;
  }
}

async function genReport() {
  reporting.value = true;
  try {
    const payload = {};
    if (period.value && period.value.length === 2) {
      payload.periodFrom = period.value[0];
      payload.periodTo = period.value[1];
    }
    report.value = await genComplianceReport(payload);
  } catch (e) {
    ElMessage.error(e.message || '生成失败');
  } finally {
    reporting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page {
  padding: 4px;
}
.mb {
  margin-bottom: 14px;
}
.mt {
  margin-top: 12px;
}
.muted {
  color: #c0c4cc;
}
.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}
.aspect-col {
  margin-bottom: 16px;
}
.fact-line {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}
.fk {
  color: #909399;
}
.fv {
  font-weight: 600;
}
.fact-note {
  font-size: 13px;
  color: #909399;
}
.test-rule {
  font-weight: 600;
  margin-bottom: 10px;
}
.test-hit {
  margin-top: 10px;
  font-size: 13px;
  color: #f56c6c;
}
</style>
