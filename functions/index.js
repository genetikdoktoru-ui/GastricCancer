const { onRequest } = require('firebase-functions/v2/https');
const { app } = require('./lib/app.cjs');

exports.api = onRequest(app);
