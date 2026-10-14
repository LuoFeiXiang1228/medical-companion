// 国标规则检测（最小版）：按规则库 detect_pattern 对文本做关键词 / 正则匹配
// 说明：关键词库（detect_pattern）待细化；本函数供「服务留痕提交」等场景调用，
//       完整合规引擎（规则维护 / 自测 / 体检报告）在后续批次接入。
const pool = require('../db/mysql');

/**
 * 对文本执行禁止类规则检测（rule_type=1，即国标第 8.2 条「不应开展的服务」）
 * @param {string} text
 * @returns {Promise<Array<{code:string,title:string,severity:number}>>} 命中的规则
 */
async function detectViolations(text) {
  if (!text || !String(text).trim()) return [];
  const [rules] = await pool.query(
    `SELECT rule_code, title, detect_pattern, severity
     FROM compliance_rules
     WHERE status = 1 AND rule_type = 1
       AND detect_pattern IS NOT NULL AND detect_pattern <> ''`,
  );
  const hits = [];
  for (const r of rules) {
    try {
      const re = new RegExp(r.detect_pattern, 'i');
      if (re.test(text)) hits.push({ code: r.rule_code, title: r.title, severity: r.severity });
    } catch (e) {
      // 无效规则（正则不合法）跳过，不影响主流程
    }
  }
  return hits;
}

module.exports = { detectViolations };
