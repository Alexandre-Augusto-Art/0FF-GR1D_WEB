#!/usr/bin/env node
/* Valida os feeds em data/ e procura segredos nos fluxos exportados do n8n.
 * Uso: node automation/validate.js
 * Sai com código 1 se houver erro (o GitHub Actions marca o push como falho e avisa por e-mail).
 */
const fs = require('fs');
const path = require('path');
const { FEEDS } = require('./validators.js');

const ROOT = path.resolve(__dirname, '..');
let failed = false;

for (const [file, validate] of Object.entries(FEEDS)) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    console.log(`-  ${file}: não existe (ignorado)`);
    continue;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    console.log(`✗  ${file}: JSON inválido - ${err.message}`);
    failed = true;
    continue;
  }
  const errors = validate(data);
  if (errors.length) {
    failed = true;
    console.log(`✗  ${file}: ${errors.length} erro(s)`);
    errors.slice(0, 30).forEach(e => console.log(`     ${e}`));
  } else {
    console.log(`✓  ${file}`);
  }
}

// Fluxos do n8n ficam num repositório público: não podem ter chaves coladas dentro.
const WF_DIR = path.join(ROOT, 'automation', 'n8n', 'workflows');
const SECRET_PATTERNS = [
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, 'token do GitHub'],
  [/sk-[A-Za-z0-9_-]{20,}/, 'chave de API (sk-...)'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'chave de API do Google'],
  [/gsk_[A-Za-z0-9]{30,}/, 'chave de API do Groq'],
  [/\d{8,10}:AA[0-9A-Za-z_-]{30,}/, 'token de bot do Telegram'],
  [/"(authorization|x-api-key|api[_-]?key|password|senha)"\s*:\s*"[^"={}$][^"]{7,}"/i, 'valor de cabeçalho/credencial']
];
if (fs.existsSync(WF_DIR)) {
  for (const name of fs.readdirSync(WF_DIR).filter(n => n.endsWith('.json'))) {
    const text = fs.readFileSync(path.join(WF_DIR, name), 'utf8');
    const hits = SECRET_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
    if (hits.length) {
      failed = true;
      console.log(`✗  automation/n8n/workflows/${name}: possível segredo exposto (${hits.join(', ')})`);
    } else {
      console.log(`✓  automation/n8n/workflows/${name}: sem segredos aparentes`);
    }
  }
}

process.exit(failed ? 1 : 0);
