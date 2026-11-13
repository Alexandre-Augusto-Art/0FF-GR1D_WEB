#!/usr/bin/env node
/* Junta um rascunho aprovado (uma entrada) ao arquivo do feed.
 * Uso: node automation/publish-entry.js <rascunho.json> [caminho/do/arquivo.json]
 *   - arquivo terminado em reflections.json (padrão) → W4K3 (validateW4K3)
 *   - arquivo terminado em motivations.json          → Motivação Diária (validateMotivacao)
 * A entrada recebe a data de hoje (Brasília): é o dia em que ela vai para o site.
 * Só grava se estiver tudo certo (sai com código 1 caso contrário).
 */
const fs = require('fs');
const path = require('path');
const { validateW4K3, validateMotivacao, addEntry } = require('./validators.js');

const draftFile = process.argv[2];
if (!draftFile) { console.error('uso: node automation/publish-entry.js <rascunho.json> [arquivo.json]'); process.exit(2); }

const file = process.argv[3] || path.resolve(__dirname, '..', 'data', 'reflections.json');
const isMotivacao = /motivations\.json$/i.test(file);
const read = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const draft = read(draftFile);
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

let entry, validate, label;
if (isMotivacao) {
  // Só os campos que vão para o site (a proposta traz também motivo, direcionamento etc.)
  entry = { date: today, content: String(draft.content || '').trim(), author: draft.author || 'DEDSEC' };
  for (const k of ['work', 'kind', 'bankId']) if (draft[k]) entry[k] = draft[k];
  validate = validateMotivacao;
  label = entry.content;
} else {
  entry = { ...draft, id: today, date: today };
  validate = validateW4K3;
  label = entry.reflection && entry.reflection.title;
}

const list = addEntry(read(file), entry);
const errors = validate(list);
if (errors.length) {
  console.error('Conteúdo inválido, nada foi publicado:\n' + errors.join('\n'));
  process.exit(1);
}
fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
console.log(`RESULTADO|${today}|${String(label).replace(/[|\r\n]+/g, ' ')}`);
