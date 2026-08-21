/**
 * vtexSync.js — Dashboard Cupons Unificado
 * Sincroniza pedidos com cupom do OMS VTEX, armazenando dados enriquecidos
 * incluindo itens (nome, preço, categoria) para análise granular.
 *
 * Diferença principal do vtexSync dos projetos individuais:
 * - minifyOrder() preserva o array completo de items com additionalInfo
 * - Cache de categorias VTEX via Catalog API
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'vtex_orders_cache.json');
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
let progressPercent = 0;
let lastSyncTime = null;
let ordersCache = null;
let categoryMap = null;

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

/**
 * Resolve category IDs string (ex: "/3/15/27/") para nomes legíveis
 * via Catalog API GET /api/catalog_system/pub/category/tree/{levels}
 */
async function resolveCategoryName(categoryIdsStr) {
  if (!categoryIdsStr) return { group: '', category: '' };
  
  const map = loadCategoryMap();
  
  // Parse category IDs: "/3/15/27/" → [3, 15, 27]
  const ids = categoryIdsStr.split('/').filter(s => s).map(Number).filter(n => !isNaN(n));
  if (ids.length === 0) return { group: '', category: '' };

  // Primeiro ID é o grupo (root), último é a categoria mais específica
  const groupId = ids[0];
  const categoryId = ids[ids.length - 1];

  const groupName = map[groupId]?.name || `Grupo ${groupId}`;
  const catName = map[categoryId]?.name || `Categoria ${categoryId}`;

  return { group: groupName, category: catName, groupId, categoryId };
}

/**
 * Carrega a árvore de categorias do Catalog API para popular o mapa
 */
async function fetchCategoryTree() {
  const map = loadCategoryMap();
  if (Object.keys(map).length > 50) {
    // Já temos um mapa razoável, não precisa buscar novamente
    return;
  }
  
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

// ── Orders Cache ────────────────────────────────────────────────────────────
function loadOrdersCache() {
  if (ordersCache) return ordersCache;
  if (fs.existsSync(CACHE_FILE)) {
    try {
      ordersCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) || {};
      return ordersCache;
    } catch (e) {
      console.error('[VTEX Sync] Erro ao carregar cache:', e.message);
    }
  }
  ordersCache = {};
  return ordersCache;
}

async function saveCacheAsync(cacheObj, filePath) {
  const tempPath = filePath + '.tmp';
  try {
    const json = JSON.stringify(cacheObj);
    await fs.promises.writeFile(tempPath, json, 'utf-8');
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    await fs.promises.rename(tempPath, filePath);
  } catch (err) {
    console.error('[VTEX Sync] Erro ao salvar cache:', err.message);
  }
}

function pruneCache(cache) {
  const utcOffset = -3;
  const getBrtDateStr = (daysAgo) => {
    const d = new Date(Date.now() - daysAgo * 24 * 3600000);
    const localDate = new Date(d.getTime() + (utcOffset * 3600000));
    return localDate.toISOString().slice(0, 10);
  };
  const keepDates = new Set();
  for (let i = 0; i <= 15; i++) {
    keepDates.add(getBrtDateStr(i));
  }
  let count = 0;
  for (const id in cache) {
    const order = cache[id];
    if (order && order.creationDate) {
      const creation = new Date(order.creationDate);
      const localCreation = new Date(creation.getTime() + (utcOffset * 3600000));
      const brtDateStr = localCreation.toISOString().slice(0, 10);
      if (!keepDates.has(brtDateStr)) {
        delete cache[id];
        count++;
      }
    } else {
      delete cache[id];
      count++;
    }
  }
  if (count > 0) {
    console.log(`[VTEX Sync] Removidos ${count} pedidos antigos do cache.`);
  }
}

/**
 * minifyOrder ENRIQUECIDO — preserva dados de itens para análise
 */
function minifyOrder(order) {
  if (!order) return null;
  
  const items = (order.items || []).map(item => ({
    productId: item.productId,
    skuId: item.id,
    name: item.name,
    quantity: item.quantity || 0,
    price: item.price || 0,                    // preço tabela (centavos)
    sellingPrice: item.sellingPrice || 0,       // preço cobrado (centavos)
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
  const utcOffset = -3;
  const localDate = new Date(d.getTime() + (utcOffset * 3600000));
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
    { start: `${dateString}T03:00:00Z`, end: `${dateString}T04:59:59Z` }, // 00h-02h BRT
    { start: `${dateString}T05:00:00Z`, end: `${dateString}T06:59:59Z` }, // 02h-04h BRT
    { start: `${dateString}T07:00:00Z`, end: `${dateString}T08:59:59Z` }, // 04h-06h BRT
    { start: `${dateString}T09:00:00Z`, end: `${dateString}T10:59:59Z` }, // 06h-08h BRT
    { start: `${dateString}T11:00:00Z`, end: `${dateString}T12:59:59Z` }, // 08h-10h BRT
    { start: `${dateString}T13:00:00Z`, end: `${dateString}T14:59:59Z` }, // 10h-12h BRT
    { start: `${dateString}T15:00:00Z`, end: `${dateString}T16:59:59Z` }, // 12h-14h BRT (Window que estourou o limite de 3000 pedidos)
    { start: `${dateString}T17:00:00Z`, end: `${dateString}T18:59:59Z` }, // 14h-16h BRT
    { start: `${dateString}T19:00:00Z`, end: `${dateString}T20:59:59Z` }, // 16h-18h BRT
    { start: `${dateString}T21:00:00Z`, end: `${dateString}T22:59:59Z` }, // 18h-20h BRT
    { start: `${dateString}T23:00:00Z`, end: `${nextDayString}T00:59:59Z` }, // 20h-22h BRT
    { start: `${nextDayString}T01:00:00Z`, end: `${nextDayString}T02:59:59Z` }  // 22h-24h BRT
  ];
};

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

async function syncPeriod(daysAgo, cache, forceAllBlocks = true) {
  let startFromIso = null;
  const utcOffset = -3;
  const targetBrt = new Date(Date.now() + utcOffset * 3600000 - daysAgo * 86400000).toISOString().slice(0, 10);
  
  if (!forceAllBlocks) {
    const dayOnly = Object.values(cache).filter(o => {
      if (!o.creationDate) return false;
      const brt = new Date(new Date(o.creationDate).getTime() + utcOffset * 3600000);
      return brt.toISOString().slice(0, 10) === targetBrt;
    });
    
    if (dayOnly.length > 0) {
      const latestMs = Math.max(...dayOnly.map(o => new Date(o.creationDate).getTime()));
      const fromMs = latestMs - 10 * 60 * 1000;
      startFromIso = new Date(fromMs).toISOString().slice(0, 19) + 'Z';
      console.log(`[VTEX Sync] Sync incremental dia=${daysAgo} a partir de ${startFromIso}`);
    }
  } else {
    console.log(`[VTEX Sync] Varredura completa de todos os 4 blocos do dia=${daysAgo} (00h às 23h59 BRT)`);
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
      if (!cached.items || cached.items.length === 0) return true; // Re-fetch se sem itens
      return false;
    });

    if (toFetch.length > 0) {
      await fetchOrderDetails(toFetch, cache);
    }
  }
}

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
  
  // Carregar mapa de categorias primeiro
  loadCategoryMap();
  await fetchCategoryTree();
  
  const cache = loadOrdersCache();
  
  try {
    pruneCache(cache);
    const targetDays = (forceFull || !lastSyncTime) 
      ? Array.from({ length: 16 }, (_, i) => i) 
      : [0, 1];
      
    for (const d of targetDays) {
      console.log(`[VTEX Sync] Processando dia ${d}...`);
      await syncPeriod(d, cache, forceFull || d <= 2);
      await saveCacheAsync(cache, CACHE_FILE);
    }
    pruneCache(cache);
    await saveCacheAsync(cache, CACHE_FILE);
    lastSyncTime = new Date().toISOString();
    console.log(`[VTEX Sync] Concluído com sucesso às ${lastSyncTime}. ${Object.keys(cache).length} pedidos no cache.`);
  } catch (err) {
    console.error('[VTEX Sync] Falha geral:', err.message);
  } finally {
    isSyncing = false;
    progressPercent = 100;
  }
}

module.exports = {
  syncVtexData,
  getSyncState: () => ({ isSyncing, progressPercent, lastSyncTime }),
  getOrdersCache: () => loadOrdersCache(),
  getCategoryMap: () => loadCategoryMap(),
  resolveCategoryName,
};
