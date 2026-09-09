/**
 * sync-to-cloud.js — Sincroniza pedidos da VTEX localmente e envia para o Render
 * 
 * A API VTEX OMS bloqueia IPs de datacenters como o Render (erro 401).
 * Este script roda localmente:
 *  1. Busca os pedidos diretamente da VTEX OMS (com credenciais válidas)
 *  2. Filtra e enriquece os pedidos com cupons dos últimos 15 dias
 *  3. Atualiza o vtex_orders_seed.json local
 *  4. Envia os pedidos para o Render via POST /api/admin/seed
 * 
 * Uso:
 *   node sync-to-cloud.js              → Sincroniza dias 0 e 1 (recente) e envia para a nuvem
 *   node sync-to-cloud.js --full       → Sincroniza todos os 16 dias e envia para a nuvem
 *   node sync-to-cloud.js --skip-vtex  → Envia apenas o cache atual para o Render (sem chamar VTEX)
 *   node sync-to-cloud.js --daemon     → Roda a cada 30 minutos em loop contínuo
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const vtexSync = require('./server/vtexSync');

const RENDER_URL = process.env.RENDER_URL || 'https://dashboard-cupons-saojoao.onrender.com';
const ADMIN_TOKEN = 'sjdigital-sync-2026';
const CACHE_FILE = path.join(__dirname, 'server', 'data', 'vtex_orders_cache.json');
const SEED_FILE = path.join(__dirname, 'server', 'data', 'vtex_orders_seed.json');
const UTC_OFFSET = -3;

function getBrtDate(dateStr) {
  const d = new Date(dateStr);
  const brt = new Date(d.getTime() + UTC_OFFSET * 3600000);
  return brt.toISOString().slice(0, 10);
}

function getTodayBrt() {
  return getBrtDate(new Date().toISOString());
}

function getCutoffDate(daysBack = 15) {
  const d = new Date(Date.now() - daysBack * 24 * 3600000);
  const brt = new Date(d.getTime() + UTC_OFFSET * 3600000);
  return brt.toISOString().slice(0, 10);
}

async function runSync(forceFull = false, skipVtex = false) {
  console.log(`\n======================================================`);
  console.log(`[${new Date().toLocaleString('pt-BR')}] Iniciando ciclo de sincronização...`);
  console.log(`======================================================`);

  if (!skipVtex) {
    console.log(`[1/3] Sincronizando com VTEX OMS (forceFull=${forceFull})...`);
    try {
      await vtexSync.syncVtexData(forceFull);
    } catch (err) {
      console.error('[ERRO VTEX Sync]', err.message);
    }
  } else {
    console.log('[1/3] VTEX Sync ignorado (--skip-vtex). Usando cache local.');
  }

  console.log('[2/3] Processando pedidos com cupom dos últimos 15 dias...');
  const cache = vtexSync.getOrdersCache();
  const cutoff = getCutoffDate(15);
  const today = getTodayBrt();

  const filtered = {};
  const dateCounts = {};

  Object.values(cache).forEach(o => {
    if (o.coupon && o.coupon !== 'null' && String(o.coupon).trim() !== '' && o.creationDate) {
      const d = getBrtDate(o.creationDate);
      if (d >= cutoff) {
        filtered[o.orderId] = o;
        dateCounts[d] = (dateCounts[d] || 0) + 1;
      }
    }
  });

  const totalOrders = Object.keys(filtered).length;
  console.log(`\n📊 Resumo por data (pedidos com cupom):`);
  Object.keys(dateCounts).sort().forEach(d => {
    console.log(`   ${d}: ${dateCounts[d]} pedidos ${d === today ? '⬅️ HOJE' : ''}`);
  });
  console.log(`\nTotal com cupom no período: ${totalOrders} pedidos.`);

  // Salvar seed local
  try {
    fs.writeFileSync(SEED_FILE, JSON.stringify(filtered), 'utf-8');
    console.log(`💾 Seed local atualizado: ${SEED_FILE} (${(fs.statSync(SEED_FILE).size / (1024 * 1024)).toFixed(2)} MB)`);
  } catch (e) {
    console.error('Erro ao salvar seed local:', e.message);
  }

  if (totalOrders === 0) {
    console.log('⚠️ Nenhum pedido para enviar.');
    return false;
  }

  // Enviar para nuvem
  console.log(`\n[3/3] Enviando ${totalOrders} pedidos para ${RENDER_URL}/api/admin/seed ...`);
  try {
    const res = await axios.post(`${RENDER_URL}/api/admin/seed`, {
      token: ADMIN_TOKEN,
      orders: filtered
    }, {
      headers: { 'Content-Type': 'application/json' },
      maxBodyLength: 100 * 1024 * 1024,
      timeout: 120000
    });

    console.log(`✅ Render respondeu: ${res.data.message || JSON.stringify(res.data)}`);

    const health = await axios.get(`${RENDER_URL}/api/health`, { timeout: 10000 });
    console.log(`🚀 Render status: OK | ${health.data.orders_cached} pedidos em cache | ${health.data.cadastro_count} filiais no cadastro`);
    return true;
  } catch (err) {
    console.error(`❌ Falha ao enviar para Render:`, err.response?.status, err.response?.data || err.message);
    return false;
  }
}

// Flags CLI
const isDaemon = process.argv.includes('--daemon');
const forceFull = process.argv.includes('--full');
const skipVtex = process.argv.includes('--skip-vtex');

if (isDaemon) {
  const INTERVAL_MIN = 30;
  const INTERVAL_MS = INTERVAL_MIN * 60 * 1000;
  console.log(`🔄 Modo Daemon Ativado: executando agora e a cada ${INTERVAL_MIN} minutos.`);

  runSync(forceFull, skipVtex);
  setInterval(() => {
    runSync(false, false);
  }, INTERVAL_MS);
} else {
  runSync(forceFull, skipVtex).then(ok => {
    process.exit(ok ? 0 : 1);
  });
}
