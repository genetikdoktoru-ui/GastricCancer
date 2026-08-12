const { onRequest } = require('firebase-functions/v2/https');
const { app } = require('./lib/app.cjs');

// Default v2 timeout (60s) is too short for long voice-dictation transcription
// requests, which can take several minutes for long recordings.
exports.api = onRequest({ timeoutSeconds: 300, memory: '512MiB' }, app);
