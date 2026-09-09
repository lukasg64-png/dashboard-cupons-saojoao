/**
 * vtexSync.js — Dashboard Cupons Unificado (v2 — SQLite + Memória)
 * 
 * Sincroniza pedidos com cupom do OMS VTEX.
 * 
 * NOVA ARQUITETURA:
 *  - Cache em memória: APENAS pedidos do dia atual
 *  - SQLite (historyDB): pedidos de dias anteriores (consolidados)
 *  - syncTodayOnly(): sync incremental rápido (a cada 30min)
 *  - backfillDays(n): carga histórica de N dias
 *  - consolidateDay(dateStr): move dia da memória/VTEX para SQLite
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const historyDB = require('./historyDB');

const DATA_DIR = path.join(__dirname, 'data');
const CATEGORY_MAP_FILE = path.join(DATA_DIR, 'category_map.json');

const account = process.env.VTEX_ACCOUNT || 'sjdigital';
const headers = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'X-VTEX-API-AppKey': process.env.VTEX_APP_KEY,
  'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// ── Sync state ──────────────────────────────────────────────────────────────
let isSyncing = false;
let isBackfilling = false;
let progressPercent = 0;
let backfillProgress = { current: 0, total: 0, phase: '' };
let lastSyncTime = null;

// Cache em memória: APENAS pedidos do dia atual (com detalhes completos)
let todayCache = {};
let categoryMap = null;

// ── BRT Date Helpers ────────────────────────────────────────────────────────
const UTC_OFFSET = -3;

function getBrtDateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const brt = new Date(d.getTime() + UTC_OFFSET * 3600000);
  return brt.toISOString().slice(0, 10);
}

function getOrderBrtDate(creationDate) {
  if (!creationDate) return '';
  const d = new Date(creationDate);
  const brt = new Date(d.getTime() + UTC_OFFSET * 3600000);
  return brt.toISOString().slice(0, 10);
}

// ── Category Map (VTEX Catalog) ─────────────────────────────────────────────
function loadCategoryMap() {
  if (categoryMap) return categoryMap;
  if (fs.existsSync(CATEGORY_MAP_FILE)) {
    try {
      categoryMap = JSON.parse(fs.readFileSync(CATEGORY_MAP_FILE, 'utf-8')) || {};
      return categoryMap;
    } catch (e) {
      console.error('[Category Map] Erro ao carregar:', e.message);
    }
  }
  categoryMap = {};
  return categoryMap;
}

async function saveCategoryMap() {
  if (!categoryMap) return;
  try {
    await fs.promises.writeFile(CATEGORY_MAP_FILE, JSON.stringify(categoryMap), 'utf-8');
  } catch (err) {
    console.error('[Category Map] Erro ao salvar:', err.message);
  }
}

async function fetchCategoryTree() {
  const map = loadCategoryMap();
  if (Object.keys(map).length > 50) return;
  
  try {
    console.log('[Category Map] Buscando árvore de categorias da VTEX...');
    const res = await axios.get(
      `https://${account}.vtexcommercestable.com.br/api/catalog_system/pub/category/tree/3`,
      { headers, timeout: 30000 }
    );
    
    function walkTree(nodes, parentGroup) {
      for (const node of nodes) {
        map[node.id] = {
          name: node.name,
          parentId: parentGroup || null
        };
        if (node.children && node.children.length > 0) {
          walkTree(node.children, parentGroup || node.id);
        }
      }
    }
    
    walkTree(res.data, null);
    categoryMap = map;
    await saveCategoryMap();
    console.log(`[Category Map] ${Object.keys(map).length} categorias mapeadas.`);
  } catch (err) {
    console.error('[Category Map] Erro ao buscar árvore de categorias:', err.message);
  }
}

// ── Minify Order ────────────────────────────────────────────────────────────
function minifyOrder(order) {
  if (!order) return null;
  
  const items = (order.items || []).map(item => ({
    productId: item.productId,
    skuId: item.id,
    name: item.name,
    quantity: item.quantity || 0,
    price: item.price || 0,
    sellingPrice: item.sellingPrice || 0,
    listPrice: item.listPrice || item.price || 0,
    brandName: item.additionalInfo?.brandName || '',
    categoriesIds: item.additionalInfo?.categoriesIds || '',
    categoryId: item.additionalInfo?.categoriesIds 
      ? item.additionalInfo.categoriesIds.split('/').filter(s => s).pop() || ''
      : ''
  }));

  return {
    orderId: order.orderId,
    status: order.status,
    creationDate: order.creationDate,
    value: order.value,
    sellers: (order.sellers || []).map(s => ({ id: s.id, name: s.name })),
    coupon: order.marketingData?.coupon || null,
    items,
    itemsCount: items.reduce((sum, item) => sum + (item.quantity || 0), 0)
  };
}

// ── Fetching ────────────────────────────────────────────────────────────────
const getDayRange = (daysAgo, startFromIso = null) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const localDate = new Date(d.getTime() + (UTC_OFFSET * 3600000));
  const dateString = localDate.toISOString().slice(0, 10);
  const nextDay = new Date(localDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayString = nextDay.toISOString().slice(0, 10);

  if (startFromIso) {
    return [{
      start: startFromIso,
      end: `${nextDayString}T02:59:59Z`
    }];
  }

  return [
    { start: `${dateString}T03:00:00Z`, end: `${dateString}T04:59:59Z` },
    { start: `${dateString}T05:00:00Z`, end: `${dateString}T06:59:59Z` },
    { start: `${dateString}T07:00:00Z`, end: `${dateString}T08:59:59Z` },
    { start: `${dateString}T09:00:00Z`, end: `${dateString}T10:59:59Z` },
    { start: `${dateString}T11:00:00Z`, end: `${dateString}T12:59:59Z` },
    { start: `${dateString}T13:00:00Z`, end: `${dateString}T14:59:59Z` },
    { start: `${dateString}T15:00:00Z`, end: `${dateString}T16:59:59Z` },
    { start: `${dateString}T17:00:00Z`, end: `${dateString}T18:59:59Z` },
    { start: `${dateString}T19:00:00Z`, end: `${dateString}T20:59:59Z` },
    { start: `${dateString}T21:00:00Z`, end: `${dateString}T22:59:59Z` },
    { start: `${dateString}T23:00:00Z`, end: `${nextDayString}T00:59:59Z` },
    { start: `${nextDayString}T01:00:00Z`, end: `${nextDayString}T02:59:59Z` }
  ];
};

/**
 * Gera range de blocos para uma data específica (YYYY-MM-DD)
 */
function getDateRange(dateStr) {
  const nextDay = new Date(dateStr + 'T00:00:00Z');
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  return [
    { start: `${dateStr}T03:00:00Z`, end: `${dateStr}T04:59:59Z` },
    { start: `${dateStr}T05:00:00Z`, end: `${dateStr}T06:59:59Z` },
    { start: `${dateStr}T07:00:00Z`, end: `${dateStr}T08:59:59Z` },
    { start: `${dateStr}T09:00:00Z`, end: `${dateStr}T10:59:59Z` },
    { start: `${dateStr}T11:00:00Z`, end: `${dateStr}T12:59:59Z` },
    { start: `${dateStr}T13:00:00Z`, end: `${dateStr}T14:59:59Z` },
    { start: `${dateStr}T15:00:00Z`, end: `${dateStr}T16:59:59Z` },
    { start: `${dateStr}T17:00:00Z`, end: `${dateStr}T18:59:59Z` },
    { start: `${dateStr}T19:00:00Z`, end: `${dateStr}T20:59:59Z` },
    { start: `${dateStr}T21:00:00Z`, end: `${dateStr}T22:59:59Z` },
    { start: `${dateStr}T23:00:00Z`, end: `${nextDayStr}T00:59:59Z` },
    { start: `${nextDayStr}T01:00:00Z`, end: `${nextDayStr}T02:59:59Z` }
  ];
}

async function fetchOrderDetails(orderIds, cache) {
  const chunkSize = 25;
  const totalChunks = Math.ceil(orderIds.length / chunkSize);

  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunkIdx = Math.floor(i / chunkSize) + 1;
    progressPercent = Math.round((chunkIdx / totalChunks) * 100);
    
    if (chunkIdx % 10 === 0 || chunkIdx === 1 || chunkIdx === totalChunks) {
      console.log(`[VTEX Sync] Buscando detalhes: lote ${chunkIdx}/${totalChunks}...`);
    }
    
    const chunk = orderIds.slice(i, i + chunkSize);
    const promises = chunk.map(async id => {
      let retries = 3;
      let delay = 1000;
      while (retries > 0) {
        try {
          const res = await axios.get(
            `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders/${id}`,
            { headers, timeout: 15000 }
          );
          return res.data;
        } catch (err) {
          retries--;
          if (retries > 0) {
            await new Promise(r => setTimeout(r, delay));
            delay += 1000;
          }
        }
      }
      return null;
    });

    const results = await Promise.all(promises);
    for (const order of results.filter(r => r !== null)) {
      const minified = minifyOrder(order);
      if (minified) {
        cache[minified.orderId] = minified;
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }
}

/**
 * Busca pedidos de um período específico da VTEX e popula o cache.
 */
async function syncPeriod(daysAgo, cache, forceAllBlocks = true) {
  const targetBrt = getBrtDateStr(daysAgo);
  let startFromIso = null;
  
  if (!forceAllBlocks) {
    // Incremental: buscar a partir do último pedido em cache desse dia
    const dayOnly = Object.values(cache).filter(o => {
      if (!o.creationDate) return false;
      return getOrderBrtDate(o.creationDate) === targetBrt;
    });
    
    if (dayOnly.length > 0) {
      const latestMs = Math.max(...dayOnly.map(o => new Date(o.creationDate).getTime()));
      const fromMs = latestMs - 10 * 60 * 1000;
      startFromIso = new Date(fromMs).toISOString().slice(0, 19) + 'Z';
      console.log(`[VTEX Sync] Sync incremental dia=${daysAgo} a partir de ${startFromIso}`);
    }
  } else {
    console.log(`[VTEX Sync] Varredura completa dia=${daysAgo} (${targetBrt})`);
  }

  const blocks = getDayRange(daysAgo, startFromIso);
  let allListItems = [];

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 30) {
      try {
        const url = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[${block.start} TO ${block.end}]&per_page=100&page=${page}`;
        const res = await axios.get(url, { headers, timeout: 20000 });
        const list = res.data.list || [];
        const paging = res.data.paging;

        if (list.length > 0) {
          allListItems.push(...list);
          list.forEach(o => {
            if (cache[o.orderId]) {
              cache[o.orderId].status = o.status;
            }
          });

          if (paging && paging.pages && page >= paging.pages) {
            hasMore = false;
          }
          page++;
        } else {
          hasMore = false;
        }
      } catch (e) {
        console.error(`[VTEX Sync] Erro página ${page} bloco ${b+1} dia=${daysAgo}:`, e.message);
        hasMore = false;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const orderIds = Array.from(new Set(allListItems.map(o => o.orderId)));
  if (orderIds.length > 0) {
    const toFetch = orderIds.filter(id => {
      const cached = cache[id];
      if (!cached) return true;
      if (!cached.sellers || cached.sellers.length === 0) return true;
      if (!cached.items || cached.items.length === 0) return true;
      return false;
    });

    if (toFetch.length > 0) {
      await fetchOrderDetails(toFetch, cache);
    }
  }
  
  return orderIds.length;
}

/**
 * Busca pedidos de uma data específica da VTEX (para backfill).
 */
async function fetchDayFromVtex(dateStr) {
  const tempCache = {};
  const blocks = getDateRange(dateStr);
  let allListItems = [];

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 30) {
      try {
        const url = `https://${account}.vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[${block.start} TO ${block.end}]&per_page=100&page=${page}`;
        const res = await axios.get(url, { headers, timeout: 20000 });
        const list = res.data.list || [];
        const paging = res.data.paging;

        if (list.length > 0) {
          allListItems.push(...list);
          if (paging && paging.pages && page >= paging.pages) hasMore = false;
          page++;
        } else {
          hasMore = false;
        }
      } catch (e) {
        console.error(`[VTEX Backfill] Erro página ${page} bloco ${b+1} data=${dateStr}:`, e.message);
        hasMore = false;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const orderIds = Array.from(new Set(allListItems.map(o => o.orderId)));
  if (orderIds.length > 0) {
    await fetchOrderDetails(orderIds, tempCache);
  }

  return tempCache;
}

// ── SYNC: Apenas dia atual → Memória ────────────────────────────────────────

/**
 * Sync incremental: busca apenas pedidos do dia atual da VTEX.
 * Usado a cada 30 minutos.
 */
async function syncTodayOnly() {
  if (!process.env.VTEX_APP_KEY || !process.env.VTEX_APP_TOKEN) {
    console.log('[VTEX Sync] Chaves VTEX não configuradas. Ignorando.');
    return;
  }
  if (isSyncing) {
    console.log('[VTEX Sync] Já em execução, ignorando.');
    return;
  }
  
  isSyncing = true;
  progressPercent = 0;
  console.log(`[VTEX Sync] Sync incremental — dia atual (${getBrtDateStr(0)})...`);
  
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  
  loadCategoryMap();
  await fetchCategoryTree();
  
  try {
    // Limpar pedidos de dias anteriores da memória
    const today = getBrtDateStr(0);
    const todayKeys = Object.keys(todayCache);
    let purged = 0;
    for (const key of todayKeys) {
      const order = todayCache[key];
      if (order && order.creationDate) {
        const orderDate = getOrderBrtDate(order.creationDate);
        if (orderDate !== today) {
          delete todayCache[key];
          purged++;
        }
      }
    }
    if (purged > 0) {
      console.log(`[VTEX Sync] Removidos ${purged} pedidos antigos da memória.`);
    }
    
    // Sync dia atual (incremental: não refaz todos os blocos se já tem dados)
    const hasExisting = Object.keys(todayCache).length > 0;
    await syncPeriod(0, todayCache, !hasExisting);
    
    lastSyncTime = new Date().toISOString();
    console.log(`[VTEX Sync] Concluído — ${Object.keys(todayCache).length} pedidos do dia atual em memória.`);
  } catch (err) {
    console.error('[VTEX Sync] Falha:', err.message);
  } finally {
    isSyncing = false;
    progressPercent = 100;
  }
}

// ── BACKFILL: Carregar histórico → SQLite ───────────────────────────────────

/**
 * Carrega N dias de histórico da VTEX e salva diretamente no SQLite.
 * Pula datas que já existem no banco.
 * Roda em background, não bloqueia o server.
 * 
 * @param {number} days - Número de dias para trás (padrão: 30)
 * @param {Function} enrichFn - Função de enriquecimento (buildCouponData style)
 */
async function backfillDays(days = 30, enrichFn = null) {
  if (!process.env.VTEX_APP_KEY || !process.env.VTEX_APP_TOKEN) {
    console.log('[VTEX Backfill] Chaves VTEX não configuradas. Ignorando.');
    return;
  }
  if (isBackfilling) {
    console.log('[VTEX Backfill] Já em execução, ignorando.');
    return;
  }

  isBackfilling = true;
  const startTime = Date.now();
  
  // Gerar lista de datas a processar (do dia 1 até N dias atrás, excluindo hoje)
  const datesToProcess = [];
  for (let i = 1; i <= days; i++) {
    const dateStr = getBrtDateStr(i);
    if (!historyDB.hasDate(dateStr)) {
      datesToProcess.push({ daysAgo: i, date: dateStr });
    }
  }

  if (datesToProcess.length === 0) {
    console.log(`[VTEX Backfill] Todos os ${days} dias já estão no banco. Nada a fazer.`);
    isBackfilling = false;
    return;
  }

  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`[VTEX Backfill] Iniciando carga de ${datesToProcess.length} dias...`);
  console.log(`════════════════════════════════════════════════════════\n`);

  backfillProgress = { current: 0, total: datesToProcess.length, phase: 'backfill' };

  loadCategoryMap();
  await fetchCategoryTree();

  for (let idx = 0; idx < datesToProcess.length; idx++) {
    const { daysAgo, date } = datesToProcess[idx];
    backfillProgress.current = idx + 1;
    
    console.log(`[VTEX Backfill] [${idx + 1}/${datesToProcess.length}] Processando ${date}...`);

    try {
      // Buscar pedidos desse dia da VTEX
      const rawCache = await fetchDayFromVtex(date);
      const orderCount = Object.keys(rawCache).length;

      if (orderCount > 0 && enrichFn) {
        // Enriquecer e salvar no SQLite
        const enriched = enrichFn(rawCache);
        if (enriched.length > 0) {
          historyDB.insertOrders(enriched);
          console.log(`[VTEX Backfill]   ✅ ${date}: ${enriched.length} pedidos com cupom salvos no SQLite.`);
        } else {
          console.log(`[VTEX Backfill]   ⚪ ${date}: ${orderCount} pedidos, 0 com cupom/match.`);
        }
      } else if (orderCount > 0) {
        console.log(`[VTEX Backfill]   ℹ️ ${date}: ${orderCount} pedidos (sem enrichFn, não salvos).`);
      } else {
        console.log(`[VTEX Backfill]   ⚪ ${date}: 0 pedidos.`);
      }

      // Rate limiting entre dias
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[VTEX Backfill]   ❌ ${date}: Erro — ${err.message}`);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n[VTEX Backfill] ✅ Concluído em ${Math.floor(elapsed/60)}min ${elapsed%60}s.`);
  console.log(`[VTEX Backfill] Stats: ${JSON.stringify(historyDB.getStats())}\n`);

  historyDB.setMeta('lastBackfill', new Date().toISOString());
  historyDB.setMeta('backfillDays', String(days));
  
  isBackfilling = false;
  backfillProgress = { current: 0, total: 0, phase: '' };
}

// ── CONSOLIDAÇÃO: Dia anterior → SQLite ─────────────────────────────────────

/**
 * Consolida os pedidos de ontem (ou de uma data específica) no SQLite.
 * Se enrichFn é fornecida, processa os pedidos da VTEX e enriquece antes de salvar.
 * 
 * @param {string} dateStr - Data a consolidar (YYYY-MM-DD). Padrão: ontem.
 * @param {Function} enrichFn - Função de enriquecimento
 */
async function consolidateDay(dateStr = null, enrichFn = null) {
  const targetDate = dateStr || getBrtDateStr(1);
  const today = getBrtDateStr(0);
  
  if (targetDate >= today) {
    console.log(`[Consolidate] Data ${targetDate} é hoje ou futuro. Ignorando.`);
    return 0;
  }

  console.log(`[Consolidate] Consolidando ${targetDate} no SQLite...`);

  // 1. Verificar se já tem dados da memória (pedidos que estavam no todayCache ontem)
  const memOrders = Object.values(todayCache).filter(o => {
    return o.creationDate && getOrderBrtDate(o.creationDate) === targetDate;
  });

  let rawCache;
  
  if (memOrders.length > 0) {
    console.log(`[Consolidate] Encontrados ${memOrders.length} pedidos na memória para ${targetDate}.`);
    rawCache = {};
    memOrders.forEach(o => { rawCache[o.orderId] = o; });
    
    // Fazer uma passagem extra na VTEX para pegar pedidos que possam ter sido perdidos
    try {
      const vtexCache = await fetchDayFromVtex(targetDate);
      Object.assign(rawCache, vtexCache); // Merge (VTEX tem prioridade em caso de overlap)
      console.log(`[Consolidate] Merge VTEX: ${Object.keys(vtexCache).length} pedidos adicionais.`);
    } catch (err) {
      console.error(`[Consolidate] Erro ao buscar VTEX (usando apenas memória):`, err.message);
    }
  } else {
    // Buscar direto da VTEX
    console.log(`[Consolidate] Sem dados na memória. Buscando da VTEX...`);
    rawCache = await fetchDayFromVtex(targetDate);
  }

  const orderCount = Object.keys(rawCache).length;
  if (orderCount === 0) {
    console.log(`[Consolidate] Nenhum pedido para ${targetDate}.`);
    return 0;
  }

  if (enrichFn) {
    const enriched = enrichFn(rawCache);
    if (enriched.length > 0) {
      // Remover dados antigos dessa data (re-consolidar)
      if (historyDB.hasDate(targetDate)) {
        historyDB.purgeDate(targetDate);
      }
      historyDB.insertOrders(enriched);
      console.log(`[Consolidate] ✅ ${targetDate}: ${enriched.length} pedidos com cupom salvos no SQLite.`);
      
      historyDB.setMeta(`consolidated_${targetDate}`, new Date().toISOString());
      
      // Limpar esses pedidos da memória
      for (const order of memOrders) {
        delete todayCache[order.orderId];
      }
      
      return enriched.length;
    }
  }

  console.log(`[Consolidate] ${targetDate}: ${orderCount} pedidos (sem enrichFn).`);
  return 0;
}

// ── Compatibilidade: syncVtexData (startup + manual) ────────────────────────

/**
 * Sync completa para startup ou trigger manual.
 * Combina sync do dia atual + consolidação de ontem.
 */
async function syncVtexData(forceFull = false) {
  if (!process.env.VTEX_APP_KEY || !process.env.VTEX_APP_TOKEN) {
    console.log('[VTEX Sync] Chaves VTEX não configuradas. Ignorando.');
    return;
  }
  if (isSyncing) return;
  
  isSyncing = true;
  progressPercent = 0;
  console.log(`[VTEX Sync] Iniciando sincronização (forceFull=${forceFull})...`);
  
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  
  loadCategoryMap();
  await fetchCategoryTree();
  
  try {
    // Sync dia atual
    await syncPeriod(0, todayCache, true);
    
    // Sync de ontem (para memória temporária, será consolidado)
    if (forceFull || !lastSyncTime) {
      await syncPeriod(1, todayCache, true);
    }
    
    lastSyncTime = new Date().toISOString();
    console.log(`[VTEX Sync] Concluído — ${Object.keys(todayCache).length} pedidos em memória.`);
  } catch (err) {
    console.error('[VTEX Sync] Falha geral:', err.message);
  } finally {
    isSyncing = false;
    progressPercent = 100;
  }
}

// ── Seed: carga via API ─────────────────────────────────────────────────────

/**
 * Recebe pedidos de uma fonte externa e salva no SQLite + memória.
 * Usado pelo endpoint POST /api/admin/seed e pelo sync-to-cloud.js
 */
function setOrdersSeed(orders, enrichFn = null) {
  if (!orders || typeof orders !== 'object') return 0;

  const today = getBrtDateStr(0);
  let todayCount = 0;
  let historyCount = 0;

  const historyOrders = [];

  Object.values(orders).forEach(order => {
    if (!order || !order.orderId) return;
    const orderDate = getOrderBrtDate(order.creationDate);
    
    if (orderDate === today) {
      todayCache[order.orderId] = order;
      todayCount++;
    } else {
      // Vai pro histórico
      todayCache[order.orderId] = order; // Temporário, até enrichFn ser chamada
      historyCount++;
    }
  });

  console.log(`[Seed] Recebidos: ${todayCount} hoje + ${historyCount} histórico = ${todayCount + historyCount} total.`);
  return todayCount + historyCount;
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Sync
  syncVtexData,
  syncTodayOnly,
  backfillDays,
  consolidateDay,
  fetchDayFromVtex,
  
  // State
  getSyncState: () => ({ 
    isSyncing, 
    isBackfilling,
    progressPercent, 
    lastSyncTime,
    backfillProgress,
    todayCacheSize: Object.keys(todayCache).length,
  }),
  
  // Data access
  getTodayCache: () => todayCache,
  getCategoryMap: () => loadCategoryMap(),
  
  // Legacy compat
  getOrdersCache: () => todayCache,
  setOrdersSeed,
  
  // Helpers
  getBrtDateStr,
  getOrderBrtDate,
};
