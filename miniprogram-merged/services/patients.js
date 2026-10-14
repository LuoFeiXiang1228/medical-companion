// 就医人档案接口（服务对象，可与下单人不同）
const { request } = require('../utils/request');

// 我的就医人列表
const list = () => request({ url: '/patients' });

// 新增就医人：{ name, phone, gender, birthDate, relation, mobility, healthNote, isDefault }
const create = (payload) => request({ url: '/patients', method: 'POST', data: payload });

// 删除就医人
const remove = (id) => request({ url: '/patients/' + id, method: 'DELETE' });

module.exports = { list, create, remove };
