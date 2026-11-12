#!/usr/bin/env node
/* Junta um rascunho aprovado (uma entrada W4K3) a data/reflections.json.
 * Uso: node automation/publish-entry.js <rascunho.json> [caminho/do/reflections.json]
 * A entrada recebe a data de hoje (Brasília): é o dia em que ela vai para o site.
 * Valida com validateW4K3 e só grava se estiver tudo certo (sai com código 1 caso contrário).
 */
const fs = require('fs');
const path = require('path');
const { validateW4K3, addEntry } = require('./validators.js');

const draftFile = process.argv[2];
if (!draftFile) { console.error('uso: node automation/publish-entry.js <rascunho.json>'); process.exit(2); }

const file = process.argv[3] || path.resolve(__dirname, '..', 'data', 'reflections.json');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const entry = read(draftFile);
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
entry.id = today;
entry.date = today;

const list = addEntry(read(file), entry);
const errors = validateW4K3(list);
if (errors.length) {
  console.error('Conteúdo inválido, nada foi publicado:\n' + errors.join('\n'));
  process.exit(1);
}
fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
console.log(`RESULTADO|${today}|${entry.reflection.title}`);
