/**
 * export_static_data.js
 * 
 * Gera os arquivos JSON estaticos (public/data/coupons_data.json e filters.json)
 * a partir do banco SQLite local + pedidos de hoje em memoria.
 * Permite que o frontend rode de forma 100% autonoma no GitHub Pages!
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PUBLIC_DATA_DIR = path.join(__dirname, 'public', 'data');
const DIST_DATA_DIR = path.join(__dirname, 'dist', 'data');

async function exportStaticData() {
  console.log('\n[Export Static] Iniciando exportacao para GitHub Pages...');
  
  [PUBLIC_DATA_DIR, DIST_DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  let couponsData = null;
  let filtersData = null;

  try {
    console.log('   Tentando obter dados do servidor local (localhost:3007)...');
    const [cRes, fRes] = await Promise.all([
      axios.get('http://localhost:3007/api/coupons', { timeout: 15000 }),
      axios.get('http://localhost:3007/api/filters', { timeout: 15000 }),
    ]);

    if (cRes.data && cRes.data.status === 'ok') {
      couponsData = cRes.data;
      filtersData = fRes.data;
      console.log('   Obtidos ' + (couponsData.data ? couponsData.data.length : 0) + ' pedidos do servidor local.');
    }
  } catch (err) {
    console.log('   Servidor local nao respondeu. Lendo diretamente do SQLite...');
  }

  if (!couponsData) {
    try {
      const historyDB = require('./server/historyDB');
      const allHistory = historyDB.queryByDateRange('2020-01-01', '2099-12-31');
      couponsData = {
        status: 'ok',
        totalOrders: allHistory.length,
        count: allHistory.length,
        data: allHistory,
        sync: { isSyncing: false, lastSyncTime: new Date().toISOString() },
        historyStats: historyDB.getStats(),
      };

      const diretorias = Array.from(new Set(allHistory.map(o => o.diretoria).filter(Boolean))).sort();
      const distritais = Array.from(new Set(allHistory.map(o => o.distrital).filter(Boolean))).sort();
      const coordenadores = Array.from(new Set(allHistory.map(o => o.coordenador).filter(Boolean))).sort();
      const filiais = Array.from(new Set(allHistory.map(o => o.store).filter(Boolean))).sort();
      const cupons = Array.from(new Set(allHistory.map(o => o.coupon).filter(Boolean))).sort();

      filtersData = {
        status: 'ok',
        diretorias,
        distritais,
        coordenadores,
        filiais,
        cupons,
        grupos: [],
        categorias: [],
      };
      console.log('   Extraidos ' + allHistory.length + ' pedidos do SQLite.');
    } catch (e) {
      console.error('Falha ao extrair do SQLite:', e.message);
      process.exit(1);
    }
  }

  const couponsJson = JSON.stringify(couponsData);
  const filtersJson = JSON.stringify(filtersData);

  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'coupons_data.json'), couponsJson, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'filters.json'), filtersJson, 'utf8');
  console.log('Salvo em public/data/ (' + (couponsJson.length / (1024 * 1024)).toFixed(2) + ' MB)');

  if (fs.existsSync(path.join(__dirname, 'dist'))) {
    fs.writeFileSync(path.join(DIST_DATA_DIR, 'coupons_data.json'), couponsJson, 'utf8');
    fs.writeFileSync(path.join(DIST_DATA_DIR, 'filters.json'), filtersJson, 'utf8');
    console.log('Salvo em dist/data/ (' + (couponsJson.length / (1024 * 1024)).toFixed(2) + ' MB)');
  }

  console.log('Exportacao estatica concluida com sucesso!\n');
}

if (require.main === module) {
  exportStaticData();
}

module.exports = { exportStaticData };