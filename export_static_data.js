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

  console.log('   Consultando histórico completo do SQLite...');
  const historyDB = require('./server/historyDB');
  const vtexSync = require('./server/vtexSync');
  
  // 0. Safeguard: verificar se o dia anterior (ontem) está devidamente consolidado no SQLite
  function getBrtDateStr(daysAgo = 0) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const brt = new Date(d.getTime() - 3 * 3600000);
    return brt.toISOString().slice(0, 10);
  }
  const yesterday = getBrtDateStr(1);
  if (!historyDB.hasDate(yesterday)) {
    console.log(`   ⚠️ Ontem (${yesterday}) não estava consolidado no SQLite! Consolidando agora...`);
    try {
      await axios.post(`http://localhost:3007/api/consolidate?date=${yesterday}`, {}, { timeout: 30000 });
      console.log(`   ✅ Consolidação de ${yesterday} disparada com sucesso.`);
      // Breve pausa para gravação no SQLite
      await new Promise(r => setTimeout(r, 4000));
    } catch (e) {
      console.log(`   ℹ️ Aviso na auto-consolidação de ontem: ${e.message}`);
    }
  } else {
    console.log(`   ✅ Dia anterior (${yesterday}) validado e consolidado no SQLite.`);
  }

  // 1. Histórico completo do SQLite (Agosto todo + dias fechados de Setembro)
  const allHistory = historyDB.queryByDateRange('2020-01-01', '2099-12-31');
  console.log(`   ✅ Obtidos ${allHistory.length} pedidos históricos do SQLite.`);

  // 2. Pedidos de hoje
  let todayOrders = [];
  try {
    const todayRes = await axios.get('http://localhost:3007/api/coupons?dateMode=hoje', { timeout: 10000 });
    if (todayRes.data && todayRes.data.data) {
      todayOrders = todayRes.data.data;
      console.log(`   ✅ Obtidos ${todayOrders.length} pedidos de hoje do servidor local.`);
    }
  } catch (e) {
    console.log('   ℹ️ Servidor HTTP não respondeu para hoje, prosseguindo com dados locais.');
    try {
      const todayMem = vtexSync.getTodayCache();
      const memVals = Object.values(todayMem || {});
      if (memVals.length > 0) {
        console.log(`   ✅ Recuperados ${memVals.length} pedidos de hoje diretamente da memória.`);
      }
    } catch (errMem) {}
  }

  // Combinar e deduplicar
  const orderMap = new Map();
  allHistory.forEach(o => orderMap.set(o.orderId, o));
  todayOrders.forEach(o => orderMap.set(o.orderId, o));
  const combinedOrders = Array.from(orderMap.values());
  console.log(`   📊 Total combinado para exportação: ${combinedOrders.length} pedidos (${todayOrders.length} de hoje).`);

  const now = new Date();
  const nextSync = new Date(now.getTime() + 60 * 60 * 1000); // Exatamente 1 hora

  couponsData = {
    status: 'ok',
    totalOrders: combinedOrders.length,
    todayOrdersCount: todayOrders.length,
    count: combinedOrders.length,
    data: combinedOrders,
    sync: { 
      isSyncing: false, 
      lastSyncTime: now.toISOString(),
      nextSyncTime: nextSync.toISOString(),
      intervalMinutes: 60,
      todayOrdersCount: todayOrders.length,
      totalOrdersCount: combinedOrders.length
    },
    historyStats: historyDB.getStats(),
  };

  const diretorias = Array.from(new Set(combinedOrders.map(o => o.diretoria).filter(Boolean))).sort();
  const distritais = Array.from(new Set(combinedOrders.map(o => o.distrital).filter(Boolean))).sort();
  const coordenadores = Array.from(new Set(combinedOrders.map(o => o.coordenador).filter(Boolean))).sort();
  const filiais = Array.from(new Set(combinedOrders.map(o => o.store).filter(Boolean))).sort();
  const cupons = Array.from(new Set(combinedOrders.map(o => o.coupon).filter(Boolean))).sort();

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