/**
 * server.js — Dashboard Cupons Unificado (Diretorias C + L)
 * 
 * Foco 100% em cupons VTEX com dados enriquecidos a nível de item.
 * Unifica ambas as diretorias em uma visão única.
 * 
 * Porta: 3007 (configurável via .env PORT=)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const vtexSync = require('./vtexSync');

const app = express();
const PORT = process.env.PORT || 3007;

// ── Cadastro de Filiais Unificado ───────────────────────────────────────────
const CADASTRO_PATH = path.join(__dirname, 'filiais_cadastro.json');
let filiaisCadastro = {};
const lookupCache = new Map();
const canonKeysMap = new Map();
const cityNumKeysMap = new Map();
const baseNoNumKeysMap = new Map();

function normalizeStoreName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ABBREVIATION_MAP = {
  'baln': 'balneario', 'bal': 'balneario', 'floripa': 'florianopolis',
  'sta': 'santa', 'sto': 'santo', 'eng': 'engenheiro', 'mal': 'marechal',
  'dioni': 'dionisio', 'cnel': 'coronel', 'cel': 'coronel',
  'fco': 'francisco', 'franc': 'francisco', 'gal': 'galeria',
  'hosp': 'hospital', 'louren': 'lourenco', 'terez': 'terezinha',
  'ant': 'antonio', 's': 'sao', 'dr': 'doutor', 'av': 'avenida',
  'gen': 'general', 'v': 'vila', 'vl': 'vila', 'sn': 'santo',
  'st': 'santo', 'pt': 'ponto', 'pto': 'porto', 'distr': 'distrito',
  'pres': 'presidente',
};

const CITY_SUFFIX_MAP = {
  'sapucaia': 'sapucaia sul', 'venancio': 'venancio aires',
  'rosario': 'rosario do sul', 'cachoeira': 'cachoeira do sul',
  'sao lourenco do sul': 'sao lourenco', 'sao lourenco oeste': 'sao lourenco do oeste',
  'sao lourenco do oeste': 'sao lourenco oeste', 'sao sebastiao cai': 'sao sebastiao',
  'julio castilhos': 'julio de castilhos', 'quedas iguacu': 'quedas do iguacu',
  'cruzeiro oeste': 'cruzeiro do oeste', 'sao miguel iguacu': 'sao miguel do iguacu',
  'encruzilhada sul': 'encruzilhada do sul', 'cerro grande sul': 'cerro grande',
  'cerro grande do sul': 'cerro grande', 'sao miguel oeste': 'sao miguel do oeste',
  'bela vista paraiso': 'bela vista do paraiso',
  'balneario arroio silva': 'balneario arroio do silva',
  'sao pedro sul': 'sao pedro do sul', 'sao francisco de assis': 'sao francisco assis',
  'sao francisco assis': 'sao francisco assis',
  'santana livramento': 'santana do livramento',
  'santa vitoria palmar': 'santa vitoria do palmar',
  'sao jose norte': 'sao jose do norte', 'sao joao do oeste': 'sao joao oeste',
  'sao luiz gonzaga': 'sao luiz', 'sao marcos': 'sao marcos',
  'herval d oeste': 'herval doeste', 'herval doeste': 'herval doeste',
};

const SPECIAL_VTEX_TO_CSV = {
  'farmacias sao joao delivery': 'porto alegre dark store',
  'sjdigital1601': 'santo antonio das missoes',
  'pf': 'pf matriz', 'pf matriz': 'pf matriz', 'pf modelo': 'pf loja modelo',
  'pf uruguai': 'pf uruguai', 'pf shopping bella': 'pf shopping',
  'pf general netto': 'pf general neto', 'gruarapuava': 'guarapuava',
  'santo amaro': 'santo amaro imperatriz', 'sao francisco paula': 'sao fran paula',
  'sao francisco de paula': 'sao fran paula',
  'santa terezinha de itaipu': 'santa terezinha do itaipu',
  'santa terezinha itaipu': 'santa terezinha do itaipu',
  'sta terez de itaipu': 'santa terezinha do itaipu',
  'santo antonio missoes': 'santo antonio das missoes',
  'caxias 21': 'caxias 20',
};

function cleanVtexSeller(sellerName) {
  if (!sellerName) return '';
  let cleaned = sellerName.replace(/\s*-\s*[\d\.\/\-]{11,25}\s*-\s*\d+\s*$/i, '').trim();
  if (cleaned === sellerName && sellerName.includes(' - ')) {
    const parts = sellerName.split(' - ');
    if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1].trim())) {
      cleaned = parts.slice(0, -2).join(' - ').trim();
    } else {
      cleaned = parts[0].trim();
    }
  }
  return cleaned;
}

function canonicalize(normName) {
  let res = String(normName).toLowerCase();
  if (SPECIAL_VTEX_TO_CSV[res] && SPECIAL_VTEX_TO_CSV[res] !== res) {
    return canonicalize(SPECIAL_VTEX_TO_CSV[res]);
  }
  res = res.replace(/([a-z])(\d)/g, '$1 $2');
  res = res.replace(/\b0+(\d+)\b/g, '$1');
  res = res.replace(/\s+(rs|pr|sc)\s*$/g, '');
  res = res.replace(/\s+(rs|pr|sc)\s+(\d)/g, ' $2');
  res = res
    .replace(/\s*-\s*(nova|shop|gal|hosp|merc|pr|sc|rs)\b/gi, '')
    .replace(/\b(nova|shop|gal|hosp|merc)\b/gi, '')
    .replace(/\bnv\b/g, '').replace(/\bnov\b/g, '').replace(/\b1nov\b/g, '')
    .replace(/\s+/g, ' ').trim();

  const words = res.split(' ');
  const expanded = words.map(w => ABBREVIATION_MAP[w] || w);
  res = expanded.join(' ');
  res = res.replace(/\bd\s+/g, 'd').replace(/\bd'/g, 'd');

  const numberMatch = res.match(/^(.+?)\s+(\d+)$/);
  if (numberMatch) {
    const baseName = numberMatch[1].trim();
    const num = numberMatch[2];
    if (CITY_SUFFIX_MAP[baseName]) {
      res = CITY_SUFFIX_MAP[baseName] + ' ' + num;
    }
  } else {
    if (CITY_SUFFIX_MAP[res]) {
      res = CITY_SUFFIX_MAP[res];
    }
  }

  const finalNumMatch = res.match(/^(.+?)\s+(\d+)$/);
  if (finalNumMatch) {
    const bName = finalNumMatch[1].trim();
    if (SPECIAL_VTEX_TO_CSV[bName] && SPECIAL_VTEX_TO_CSV[bName] !== bName) {
      res = SPECIAL_VTEX_TO_CSV[bName] + ' ' + finalNumMatch[2];
    }
  }
  if (SPECIAL_VTEX_TO_CSV[res] && SPECIAL_VTEX_TO_CSV[res] !== res) {
    return canonicalize(SPECIAL_VTEX_TO_CSV[res]);
  }
  return res.replace(/\s+/g, ' ').trim();
}

function buildLookupIndexes() {
  lookupCache.clear();
  canonKeysMap.clear();
  cityNumKeysMap.clear();
  baseNoNumKeysMap.clear();

  for (const key of Object.keys(filiaisCadastro)) {
    const normKey = normalizeStoreName(key);
    const canonKey = canonicalize(normKey);
    canonKeysMap.set(normKey, key);
    canonKeysMap.set(canonKey, key);

    if (!/\b\d+\b/.test(canonKey)) {
      baseNoNumKeysMap.set(canonKey, key);
      canonKeysMap.set(canonKey + ' 1', key);
    } else {
      const m1 = canonKey.match(/^(.+?)\s+1$/);
      if (m1) baseNoNumKeysMap.set(m1[1].trim(), key);
    }

    const item = filiaisCadastro[key];
    if (item && item.municipio) {
      const normCity = normalizeStoreName(item.municipio);
      const numMatch = key.match(/\b(\d+)\b/);
      const num = numMatch ? numMatch[1] : '';
      const cityKey = (normCity + ' ' + num).trim();
      cityNumKeysMap.set(cityKey, key);
      if (!num) cityNumKeysMap.set(normCity + ' 1', key);
    }
  }
}

function loadFiliaisCadastro() {
  if (fs.existsSync(CADASTRO_PATH)) {
    try {
      filiaisCadastro = JSON.parse(fs.readFileSync(CADASTRO_PATH, 'utf8'));
      buildLookupIndexes();
      console.log(`ℹ️ [cadastro] Carregado com ${Object.keys(filiaisCadastro).length} filiais (C+L).`);
    } catch (err) {
      console.error(`❌ Erro ao ler filiais_cadastro.json:`, err.message);
    }
  }
}

function lookupStore(vtexCleanName) {
  if (!vtexCleanName) return null;
  if (lookupCache.has(vtexCleanName)) return lookupCache.get(vtexCleanName);

  const cleanName = cleanVtexSeller(vtexCleanName);
  const normName = normalizeStoreName(cleanName);

  if (filiaisCadastro[cleanName]) {
    const res = { ...filiaisCadastro[cleanName], matchedKey: cleanName };
    lookupCache.set(vtexCleanName, res);
    return res;
  }
  if (filiaisCadastro[normName]) {
    const res = { ...filiaisCadastro[normName], matchedKey: normName };
    lookupCache.set(vtexCleanName, res);
    return res;
  }
  if (canonKeysMap.has(normName)) {
    const key = canonKeysMap.get(normName);
    const res = { ...filiaisCadastro[key], matchedKey: key };
    lookupCache.set(vtexCleanName, res);
    return res;
  }
  const canon = canonicalize(normName);
  if (canonKeysMap.has(canon)) {
    const key = canonKeysMap.get(canon);
    const res = { ...filiaisCadastro[key], matchedKey: key };
    lookupCache.set(vtexCleanName, res);
    return res;
  }
  if (canon.endsWith(' 1')) {
    const base = canon.slice(0, -2).trim();
    if (baseNoNumKeysMap.has(base)) {
      const key = baseNoNumKeysMap.get(base);
      const res = { ...filiaisCadastro[key], matchedKey: key };
      lookupCache.set(vtexCleanName, res);
      return res;
    }
    if (canonKeysMap.has(base)) {
      const key = canonKeysMap.get(base);
      const res = { ...filiaisCadastro[key], matchedKey: key };
      lookupCache.set(vtexCleanName, res);
      return res;
    }
  }
  if (!/\b\d+\b/.test(canon)) {
    const with1 = canon + ' 1';
    if (canonKeysMap.has(with1)) {
      const key = canonKeysMap.get(with1);
      const res = { ...filiaisCadastro[key], matchedKey: key };
      lookupCache.set(vtexCleanName, res);
      return res;
    }
  }
  const numMatch = canon.match(/^(.+?)\s+(\d+)$/);
  if (numMatch) {
    const cityKey = (numMatch[1].trim() + ' ' + numMatch[2]).trim();
    if (cityNumKeysMap.has(cityKey)) {
      const key = cityNumKeysMap.get(cityKey);
      const res = { ...filiaisCadastro[key], matchedKey: key };
      lookupCache.set(vtexCleanName, res);
      return res;
    }
  } else if (cityNumKeysMap.has(canon)) {
    const key = cityNumKeysMap.get(canon);
    const res = { ...filiaisCadastro[key], matchedKey: key };
    lookupCache.set(vtexCleanName, res);
    return res;
  }

  lookupCache.set(vtexCleanName, null);
  return null;
}

loadFiliaisCadastro();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// ── Helpers ─────────────────────────────────────────────────────────────────
function getBrtDateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const brt = new Date(d.getTime() - 3 * 3600000);
  return brt.toISOString().slice(0, 10);
}

function filterByDate(orders, dateMode, customStart, customEnd) {
  let startDate, endDate;
  const today = getBrtDateStr(0);

  switch (dateMode) {
    case 'hoje':   startDate = endDate = today; break;
    case 'ontem':  startDate = endDate = getBrtDateStr(1); break;
    case '3d':     startDate = getBrtDateStr(2); endDate = today; break;
    case '7d':     startDate = getBrtDateStr(6); endDate = today; break;
    case '15d':    startDate = getBrtDateStr(14); endDate = today; break;
    case 'custom':
      startDate = customStart || getBrtDateStr(14);
      endDate = customEnd || today;
      break;
    default:       startDate = getBrtDateStr(14); endDate = today;
  }

  return orders.filter(o => o.date >= startDate && o.date <= endDate);
}

/**
 * Processa o cache VTEX e retorna lista enriquecida de pedidos com cupom
 */
function buildCouponData() {
  const cache = vtexSync.getOrdersCache();
  const catMap = vtexSync.getCategoryMap();
  const list = [];

  Object.values(cache).forEach(order => {
    if (!order.coupon || order.status === 'canceled') return;
    
    const seller = order.sellers?.[0]?.name || '';
    const storeInfo = lookupStore(seller);
    if (!storeInfo) return; // Apenas lojas do cadastro (C + L)

    let dateStr = '';
    let hourStr = '00';
    let timeStr = '00:00';
    if (order.creationDate) {
      const d = new Date(order.creationDate);
      const brt = new Date(d.getTime() - 3 * 3600000);
      dateStr = brt.toISOString().slice(0, 10);
      hourStr = String(brt.getUTCHours()).padStart(2, '0');
      timeStr = `${hourStr}:${String(brt.getUTCMinutes()).padStart(2, '0')}`;
    }

    // Processar itens com nomes de categoria
    const items = (order.items || []).map(item => {
      const catIds = item.categoriesIds ? item.categoriesIds.split('/').filter(s => s) : [];
      const groupId = catIds[0] || '';
      const categoryId = catIds[catIds.length - 1] || item.categoryId || '';
      
      return {
        name: item.name || '',
        productId: item.productId || '',
        quantity: item.quantity || 0,
        price: item.price ? item.price / 100 : 0,
        sellingPrice: item.sellingPrice ? item.sellingPrice / 100 : 0,
        listPrice: item.listPrice ? item.listPrice / 100 : 0,
        discount: item.price && item.sellingPrice 
          ? Math.max(0, (item.price - item.sellingPrice) / 100) 
          : 0,
        discountPct: item.price && item.sellingPrice && item.price > 0
          ? Math.round(((item.price - item.sellingPrice) / item.price) * 10000) / 100
          : 0,
        brandName: item.brandName || '',
        group: catMap[groupId]?.name || (groupId ? `Grupo ${groupId}` : 'Sem Grupo'),
        category: catMap[categoryId]?.name || (categoryId ? `Cat ${categoryId}` : 'Sem Categoria'),
        groupId,
        categoryId,
      };
    });

    const totalValue = order.value ? order.value / 100 : 0;
    const totalItems = items.reduce((s, i) => s + i.quantity, 0);
    const totalDiscount = items.reduce((s, i) => s + (i.discount * i.quantity), 0);

    list.push({
      orderId: order.orderId,
      creationDate: order.creationDate,
      date: dateStr,
      hour: hourStr,
      time: timeStr,
      coupon: String(order.coupon).toUpperCase().trim(),
      value: totalValue,
      itemsCount: totalItems,
      totalDiscount,
      discountPct: totalValue > 0 ? Math.round((totalDiscount / totalValue) * 10000) / 100 : 0,
      store: storeInfo.matchedKey || cleanVtexSeller(seller),
      diretoria: storeInfo.diretoria || '',
      distrital: storeInfo.distrital || '',
      coordenador: storeInfo.coordenador || '',
      municipio: storeInfo.municipio || '',
      uf: storeInfo.uf || '',
      items,
    });
  });

  return list;
}

// ── ROTAS ───────────────────────────────────────────────────────────────────

/**
 * GET /api/coupons — Dados completos de cupons (com filtros)
 */
app.get('/api/coupons', (req, res) => {
  try {
    let data = buildCouponData();

    // Filtros
    const { diretoria, distrital, coordenador, filial, cupom, dateMode, dateStart, dateEnd } = req.query;

    if (dateMode) data = filterByDate(data, dateMode, dateStart, dateEnd);
    if (diretoria && diretoria !== 'all') data = data.filter(d => d.diretoria === diretoria);
    if (distrital && distrital !== 'all') data = data.filter(d => d.distrital === distrital);
    if (coordenador && coordenador !== 'all') data = data.filter(d => d.coordenador === coordenador);
    if (filial && filial !== 'all') data = data.filter(d => d.store === filial);
    if (cupom && cupom !== 'all') data = data.filter(d => d.coupon === cupom.toUpperCase().trim());

    res.json({
      status: 'ok',
      sync: vtexSync.getSyncState(),
      totalOrders: Object.keys(vtexSync.getOrdersCache()).length,
      count: data.length,
      data
    });
  } catch (err) {
    console.error('[/api/coupons]', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * GET /api/coupons/summary — Resumo hierárquico (Diretoria > Distrital > Coord > Filial)
 */
app.get('/api/coupons/summary', (req, res) => {
  try {
    let data = buildCouponData();
    const { dateMode, dateStart, dateEnd, diretoria, cupom } = req.query;
    if (dateMode) data = filterByDate(data, dateMode, dateStart, dateEnd);
    if (diretoria && diretoria !== 'all') data = data.filter(d => d.diretoria === diretoria);
    if (cupom && cupom !== 'all') data = data.filter(d => d.coupon === cupom.toUpperCase().trim());

    // Agregação por hierarquia
    const byDiretoria = {};
    const byDistrital = {};
    const byCoord = {};
    const byFilial = {};

    for (const order of data) {
      const d = order.diretoria || 'N/A';
      const dist = order.distrital || 'N/A';
      const coord = order.coordenador || 'N/A';
      const fil = order.store || 'N/A';

      for (const [map, key, parent] of [
        [byDiretoria, d, null],
        [byDistrital, dist, d],
        [byCoord, coord, dist],
        [byFilial, fil, coord],
      ]) {
        if (!map[key]) {
          map[key] = { nome: key, parent, pedidos: 0, valor: 0, itens: 0, desconto: 0, cuponsUnicos: new Set() };
        }
        map[key].pedidos++;
        map[key].valor += order.value;
        map[key].itens += order.itemsCount;
        map[key].desconto += order.totalDiscount;
        map[key].cuponsUnicos.add(order.coupon);
      }
    }

    const serialize = (map) => Object.values(map).map(v => ({
      ...v,
      ticketMedio: v.pedidos > 0 ? Math.round(v.valor / v.pedidos * 100) / 100 : 0,
      descontoPct: v.valor > 0 ? Math.round(v.desconto / v.valor * 10000) / 100 : 0,
      cuponsUnicos: v.cuponsUnicos.size,
    }));

    res.json({
      status: 'ok',
      totalPedidos: data.length,
      totalValor: Math.round(data.reduce((s, d) => s + d.value, 0) * 100) / 100,
      diretorias: serialize(byDiretoria),
      distritais: serialize(byDistrital),
      coordenadores: serialize(byCoord),
      filiais: serialize(byFilial),
    });
  } catch (err) {
    console.error('[/api/coupons/summary]', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * GET /api/coupons/categories — Agregação por Grupo > Categoria > Item
 */
app.get('/api/coupons/categories', (req, res) => {
  try {
    let data = buildCouponData();
    const { dateMode, dateStart, dateEnd, diretoria, distrital, coordenador, filial, cupom } = req.query;
    if (dateMode) data = filterByDate(data, dateMode, dateStart, dateEnd);
    if (diretoria && diretoria !== 'all') data = data.filter(d => d.diretoria === diretoria);
    if (distrital && distrital !== 'all') data = data.filter(d => d.distrital === distrital);
    if (coordenador && coordenador !== 'all') data = data.filter(d => d.coordenador === coordenador);
    if (filial && filial !== 'all') data = data.filter(d => d.store === filial);
    if (cupom && cupom !== 'all') data = data.filter(d => d.coupon === cupom.toUpperCase().trim());

    const byGroup = {};
    const byCategory = {};
    const byItem = {};

    for (const order of data) {
      for (const item of order.items) {
        const g = item.group || 'Sem Grupo';
        const c = item.category || 'Sem Categoria';
        const itemKey = item.name || 'Sem Nome';

        // Grupo
        if (!byGroup[g]) byGroup[g] = { nome: g, qtd: 0, valorTabela: 0, valorVenda: 0, desconto: 0, pedidos: new Set() };
        byGroup[g].qtd += item.quantity;
        byGroup[g].valorTabela += item.price * item.quantity;
        byGroup[g].valorVenda += item.sellingPrice * item.quantity;
        byGroup[g].desconto += item.discount * item.quantity;
        byGroup[g].pedidos.add(order.orderId);

        // Categoria
        const catKey = `${g}||${c}`;
        if (!byCategory[catKey]) byCategory[catKey] = { nome: c, grupo: g, qtd: 0, valorTabela: 0, valorVenda: 0, desconto: 0, pedidos: new Set() };
        byCategory[catKey].qtd += item.quantity;
        byCategory[catKey].valorTabela += item.price * item.quantity;
        byCategory[catKey].valorVenda += item.sellingPrice * item.quantity;
        byCategory[catKey].desconto += item.discount * item.quantity;
        byCategory[catKey].pedidos.add(order.orderId);

        // Item
        const iKey = `${g}||${c}||${itemKey}`;
        if (!byItem[iKey]) byItem[iKey] = { nome: itemKey, categoria: c, grupo: g, productId: item.productId, qtd: 0, valorTabela: 0, valorVenda: 0, desconto: 0, pedidos: new Set() };
        byItem[iKey].qtd += item.quantity;
        byItem[iKey].valorTabela += item.price * item.quantity;
        byItem[iKey].valorVenda += item.sellingPrice * item.quantity;
        byItem[iKey].desconto += item.discount * item.quantity;
        byItem[iKey].pedidos.add(order.orderId);
      }
    }

    const round2 = v => Math.round(v * 100) / 100;
    const serialize = (map) => Object.values(map).map(v => ({
      ...v,
      valorTabela: round2(v.valorTabela),
      valorVenda: round2(v.valorVenda),
      desconto: round2(v.desconto),
      descontoPct: v.valorTabela > 0 ? round2((v.desconto / v.valorTabela) * 100) : 0,
      ticketMedio: v.pedidos.size > 0 ? round2(v.valorVenda / v.pedidos.size) : 0,
      pedidos: v.pedidos.size,
    })).sort((a, b) => b.valorVenda - a.valorVenda);

    res.json({
      status: 'ok',
      grupos: serialize(byGroup),
      categorias: serialize(byCategory),
      itens: serialize(byItem),
    });
  } catch (err) {
    console.error('[/api/coupons/categories]', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * GET /api/coupons/top — Ranking de cupons
 */
app.get('/api/coupons/top', (req, res) => {
  try {
    let data = buildCouponData();
    const { dateMode, dateStart, dateEnd, diretoria } = req.query;
    if (dateMode) data = filterByDate(data, dateMode, dateStart, dateEnd);
    if (diretoria && diretoria !== 'all') data = data.filter(d => d.diretoria === diretoria);

    const byCoupon = {};
    for (const order of data) {
      const c = order.coupon;
      if (!byCoupon[c]) byCoupon[c] = { nome: c, pedidos: 0, valor: 0, itens: 0, desconto: 0, lojas: new Set(), diretorias: new Set() };
      byCoupon[c].pedidos++;
      byCoupon[c].valor += order.value;
      byCoupon[c].itens += order.itemsCount;
      byCoupon[c].desconto += order.totalDiscount;
      byCoupon[c].lojas.add(order.store);
      byCoupon[c].diretorias.add(order.diretoria);
    }

    const round2 = v => Math.round(v * 100) / 100;
    const ranking = Object.values(byCoupon)
      .map(v => ({
        ...v,
        valor: round2(v.valor),
        desconto: round2(v.desconto),
        ticketMedio: v.pedidos > 0 ? round2(v.valor / v.pedidos) : 0,
        descontoPct: v.valor > 0 ? round2((v.desconto / v.valor) * 100) : 0,
        lojas: v.lojas.size,
        diretorias: Array.from(v.diretorias),
      }))
      .sort((a, b) => b.pedidos - a.pedidos);

    // Evolução diária
    const daily = {};
    for (const order of data) {
      if (!daily[order.date]) daily[order.date] = { date: order.date, pedidos: 0, valor: 0 };
      daily[order.date].pedidos++;
      daily[order.date].valor += order.value;
    }
    const evolucao = Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      status: 'ok',
      ranking,
      evolucao,
      totalCuponsUnicos: ranking.length,
    });
  } catch (err) {
    console.error('[/api/coupons/top]', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * GET /api/filters — Opções de filtro disponíveis
 */
app.get('/api/filters', (req, res) => {
  try {
    const data = buildCouponData();
    const diretorias = [...new Set(data.map(d => d.diretoria).filter(Boolean))].sort();
    const distritais = [...new Set(data.map(d => d.distrital).filter(Boolean))].sort();
    const coordenadores = [...new Set(data.map(d => d.coordenador).filter(Boolean))].sort();
    const filiais = [...new Set(data.map(d => d.store).filter(Boolean))].sort();
    const cupons = [...new Set(data.map(d => d.coupon).filter(Boolean))].sort();

    // Grupos, Categorias e Itens
    const gruposSet = new Set();
    const categoriasSet = new Set();
    const itensSet = new Set();
    const grupoCategorias = {};
    const categoriaItens = {};

    data.forEach(order => {
      (order.items || []).forEach(item => {
        const g = item.group || 'Sem Grupo';
        const c = item.category || 'Sem Categoria';
        const i = item.name || 'Sem Nome';

        gruposSet.add(g);
        categoriasSet.add(c);
        itensSet.add(i);

        if (!grupoCategorias[g]) grupoCategorias[g] = new Set();
        grupoCategorias[g].add(c);

        if (!categoriaItens[c]) categoriaItens[c] = new Set();
        categoriaItens[c].add(i);
      });
    });

    const grupos = [...gruposSet].sort();
    const categorias = [...categoriasSet].sort();
    const itens = [...itensSet].sort();

    // Relações para cascade
    const relations = {};
    data.forEach(d => {
      if (!relations[d.diretoria]) relations[d.diretoria] = { distritais: new Set() };
      relations[d.diretoria].distritais.add(d.distrital);
    });

    const distCoord = {};
    data.forEach(d => {
      if (!distCoord[d.distrital]) distCoord[d.distrital] = { coordenadores: new Set(), diretoria: d.diretoria };
      distCoord[d.distrital].coordenadores.add(d.coordenador);
    });

    const coordFil = {};
    data.forEach(d => {
      if (!coordFil[d.coordenador]) coordFil[d.coordenador] = { filiais: new Set(), distrital: d.distrital };
      coordFil[d.coordenador].filiais.add(d.store);
    });

    res.json({
      status: 'ok',
      diretorias,
      distritais,
      coordenadores,
      filiais,
      cupons,
      grupos,
      categorias,
      itens,
      relations: {
        diretorias: Object.fromEntries(Object.entries(relations).map(([k, v]) => [k, { distritais: Array.from(v.distritais) }])),
        distritais: Object.fromEntries(Object.entries(distCoord).map(([k, v]) => [k, { coordenadores: Array.from(v.coordenadores), diretoria: v.diretoria }])),
        coordenadores: Object.fromEntries(Object.entries(coordFil).map(([k, v]) => [k, { filiais: Array.from(v.filiais), distrital: v.distrital }])),
        grupoCategorias: Object.fromEntries(Object.entries(grupoCategorias).map(([k, v]) => [k, Array.from(v)])),
        categoriaItens: Object.fromEntries(Object.entries(categoriaItens).map(([k, v]) => [k, Array.from(v)])),
      }
    });
  } catch (err) {
    console.error('[/api/filters]', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    cadastro_count: Object.keys(filiaisCadastro).length,
    sync: vtexSync.getSyncState(),
    orders_cached: Object.keys(vtexSync.getOrdersCache()).length,
    categories_mapped: Object.keys(vtexSync.getCategoryMap()).length,
  });
});

app.post('/api/vtex-sync', async (req, res) => {
  const forceFull = req.query.full === 'true';
  res.json({ status: 'started', forceFull });
  vtexSync.syncVtexData(forceFull).catch(err =>
    console.error('[Manual Sync] Falhou:', err.message)
  );
});

app.post('/api/admin/seed', (req, res) => {
  try {
    const { token, orders } = req.body;
    if (token !== 'sjdigital-sync-2026') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!orders || typeof orders !== 'object') {
      return res.status(400).json({ error: 'Invalid orders payload' });
    }
    const count = vtexSync.setOrdersSeed(orders);
    res.json({ status: 'ok', count, message: `Seed atualizado com ${count} pedidos.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Servir Frontend ─────────────────────────────────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  console.log(`🌐 Servindo frontend de: ${distPath}`);
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🚀 Dashboard Cupons Unificado — http://localhost:${PORT}`);
  console.log(`📊 Cadastro: ${Object.keys(filiaisCadastro).length} filiais (C+L)\n`);

  // Sync VTEX após 5s da inicialização
  setTimeout(() => {
    vtexSync.syncVtexData().catch(err => console.error('[Startup Sync]', err.message));
  }, 5000);

  // Re-sync a cada 60 minutos
  setInterval(() => {
    vtexSync.syncVtexData().catch(err => console.error('[Interval Sync]', err.message));
  }, 60 * 60 * 1000);
});
