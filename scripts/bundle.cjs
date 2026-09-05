const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('[REQENC BUILD] dist directory does not exist.');
  process.exit(1);
}

// 1. Ensure ESM entrypoint: dist/index.mjs
const indexJsPath = path.join(distDir, 'index.js');
if (fs.existsSync(indexJsPath)) {
  const content = fs.readFileSync(indexJsPath, 'utf8');
  fs.writeFileSync(path.join(distDir, 'index.mjs'), content, 'utf8');

  // 2. Build CJS entrypoint: dist/index.cjs
  // Create a clean CommonJS wrapper that exports everything
  const cjsWrapper = `
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};

// Unified CJS Export
const client = require("./client.js");
const crypto = require("./crypto.js");
const types = require("./types.js");

__exportStar(client, exports);
__exportStar(crypto, exports);
__exportStar(types, exports);

const reqenc = new client.ReqencClient();
exports.reqenc = reqenc;
exports.Reqenc = client.ReqencClient;
exports.ReqencClient = client.ReqencClient;
exports.default = reqenc;
`;
  fs.writeFileSync(path.join(distDir, 'index.cjs'), cjsWrapper.trim(), 'utf8');
  console.log('[REQENC BUILD] Generated dist/index.mjs and dist/index.cjs successfully.');
}
