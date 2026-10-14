<template>
  <div ref="el" :style="{ width, height }"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as echarts from 'echarts';

const props = defineProps({
  option: { type: Object, required: true },
  width: { type: String, default: '100%' },
  height: { type: String, default: '320px' },
});

const el = ref(null);
let chart = null;

function render() {
  if (!chart) return;
  chart.setOption(props.option, true);
}

function resize() {
  if (chart) chart.resize();
}

onMounted(() => {
  chart = echarts.init(el.value);
  render();
  window.addEventListener('resize', resize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  if (chart) {
    chart.dispose();
    chart = null;
  }
});

watch(
  () => props.option,
  () => render(),
  { deep: true }
);

defineExpose({ resize });
</script>
