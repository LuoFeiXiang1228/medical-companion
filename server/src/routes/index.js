const Router = require('koa-router');
const auth = require('../features/auth/auth.controller');
const orders = require('../features/orders/order.controller');
const companion = require('../features/companion/companion.controller');
const patients = require('../features/patients/patient.controller');
const publicApi = require('../features/public/public.controller');
const serviceLogs = require('../features/service-logs/service-log.controller');
const admin = require('../features/admin/admin.controller');
const adminCatalog = require('../features/admin/admin-catalog.controller');
const adminCompliance = require('../features/admin/admin-compliance.controller');
const settings = require('../features/settings/settings.controller');
const upload = require('../features/upload/upload.controller');

const router = new Router({ prefix: '/api/v1' });

router.get('/health', (ctx) => { ctx.body = { code: 0, message: 'ok', data: { status: 'up' } }; });

auth.register(router);
orders.register(router);
companion.register(router);
patients.register(router);
publicApi.register(router);
serviceLogs.register(router);
admin.register(router);
adminCatalog.register(router);
adminCompliance.register(router);
settings.register(router);
upload.register(router);

module.exports = router;
