// index.js — Firebase Cloud Function 'api' wrapping the Express app.
//
// exports: api
// used_by: firebase.json → hosting rewrite /api/**
// rules:   requires ./lib/app.cjs, which exists only after npm run build:functions (git-ignored)
// agent:   claude-code | anthropic | 2026-10-15 | codedna-init | initial CodeDNA annotation

const { onRequest } = require('firebase-functions/v2/https');
const { app } = require('./lib/app.cjs');

exports.api = onRequest(app);
