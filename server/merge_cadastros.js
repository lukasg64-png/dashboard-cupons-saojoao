/**
 * merge_cadastros.js
 * Script utilitário para gerar o filiais_cadastro.json unificado
 * combinando os cadastros de Diretoria C e Diretoria L.
 */
const fs = require('fs');
const path = require('path');

const cadastroC = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'projeto C', 'dashboard-diretoria-c', 'server', 'filiais_cadastro.json'),
  'utf8'
));

const cadastroL = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'projeto L', 'dashboard-diretoria-l', 'server', 'filiais_cadastro.json'),
  'utf8'
));

const merged = {};

for (const [key, val] of Object.entries(cadastroC)) {
  merged[key] = { diretoria: 'C', ...val };
}

for (const [key, val] of Object.entries(cadastroL)) {
  if (merged[key]) {
    console.warn(`⚠️ Chave duplicada entre C e L: "${key}" — mantendo da Diretoria C`);
    continue;
  }
  merged[key] = { diretoria: 'L', ...val };
}

const outputPath = path.join(__dirname, 'filiais_cadastro.json');
fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2), 'utf8');

console.log(`✅ Cadastro unificado gerado com ${Object.keys(merged).length} filiais.`);
console.log(`   Diretoria C: ${Object.values(merged).filter(f => f.diretoria === 'C').length}`);
console.log(`   Diretoria L: ${Object.values(merged).filter(f => f.diretoria === 'L').length}`);
console.log(`   Salvo em: ${outputPath}`);
