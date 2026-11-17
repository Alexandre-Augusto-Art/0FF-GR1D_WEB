// Copia automation/n8n/code/escrever-espelho.js para dentro do fluxo w4k3-link.json.
// Na primeira vez, troca "Prepare Prompt → AI Agent (+ Ollama Chat Model) → Format and Save1"
// por um único nó de código que conversa com o Ollama em etapas. Uso: node automation/n8n/build-link.js
const fs = require('fs');
const path = require('path');

const arq = path.join(__dirname, 'workflows', 'w4k3-link.json');
const f = JSON.parse(fs.readFileSync(arq, 'utf8'));
const NOME = 'Escrever (espelho direto)';
const codigo = fs.readFileSync(path.join(__dirname, 'code', 'escrever-espelho.js'), 'utf8');

let no = f.nodes.find((x) => x.name === NOME);
if (!no) {
  const velhos = ['Prepare Prompt', 'AI Agent', 'Ollama Chat Model', 'Format and Save1'];
  const pos = (f.nodes.find((x) => x.name === 'Prepare Prompt') || { position: [1100, 300] }).position;
  f.nodes = f.nodes.filter((x) => !velhos.includes(x.name));
  for (const v of velhos) delete f.connections[v];
  no = { parameters: { jsCode: '' }, id: 'b7c2e3a4-0003-4000-8000-000000000031', name: NOME, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos };
  f.nodes.push(no);
  f.connections['Extrair notícia'] = { main: [[{ node: NOME, type: 'main', index: 0 }]] };
  f.connections[NOME] = { main: [[{ node: 'Validar rascunho', type: 'main', index: 0 }]] };
}
no.parameters.jsCode = codigo;
fs.writeFileSync(arq, JSON.stringify(f, null, 2) + '\n');
console.log('ok:', NOME, `(${codigo.length} caracteres)`);
