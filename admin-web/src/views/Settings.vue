<template>
  <div class="page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>系统设置</span>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </template>

      <el-alert
        class="mb"
        type="info"
        :closable="false"
        show-icon
        title="仅以下经营类设置可在此修改；微信支付、订单超时等参数通过服务端环境变量（.env）配置"
      />

      <el-form label-width="120px" style="max-width: 760px">
        <el-form-item label="服务公告">
          <el-input v-model="form.shop_notice" type="textarea" :rows="2" placeholder="展示在用户端首页" />
        </el-form-item>
        <el-form-item label="客服电话">
          <el-input v-model="form.service_phone" />
        </el-form-item>
        <el-form-item label="客服微信">
          <el-input v-model="form.service_wechat" />
        </el-form-item>
        <el-form-item label="服务时间">
          <el-input v-model="form.service_hours" placeholder="如 09:00-18:00" />
        </el-form-item>
        <el-form-item label="客服说明">
          <el-input v-model="form.service_note" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="常见问题">
          <el-input
            v-model="form.service_faq"
            type="textarea"
            :rows="3"
            placeholder='JSON 数组：[{"q":"问题","a":"答案"}]'
          />
        </el-form-item>
        <el-form-item label="隐私政策">
          <el-input v-model="form.privacy_policy" type="textarea" :rows="5" placeholder="用户端协议页优先展示此内容（留空用默认文本）" />
        </el-form-item>
        <el-form-item label="用户协议">
          <el-input v-model="form.user_agreement" type="textarea" :rows="5" placeholder="留空用默认文本" />
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchSettings, saveSettings } from '../api/admin';

const KEYS = ['shop_notice', 'service_phone', 'service_wechat', 'service_hours', 'service_note', 'service_faq', 'privacy_policy', 'user_agreement'];

const form = reactive({
  shop_notice: '', service_phone: '', service_wechat: '', service_hours: '',
  service_note: '', service_faq: '', privacy_policy: '', user_agreement: '',
});
const saving = ref(false);

async function load() {
  try {
    const rows = await fetchSettings();
    (rows || []).forEach((r) => {
      if (KEYS.includes(r.key)) form[r.key] = r.value || '';
    });
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  }
}

async function save() {
  saving.value = true;
  try {
    await saveSettings({ ...form });
    ElMessage.success('已保存');
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.page {
  padding: 4px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mb {
  margin-bottom: 16px;
}
</style>
