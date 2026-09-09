/**
 * storeEnricher.js — Módulo unificado de resolução de lojas, diretorias e enriquecimento de pedidos VTEX.
 */

const path = require('path');
const fs = require('fs');

const CADASTRO_PATH = path.join(__dirname, 'filiais_cadastro.json');
let filiaisCadastro = {};
const lookupCache = new Map();
const canonKeysMap = new Map();
const cityNumKeysMap = new Map();
const baseNoNumKeysMap = new Map();

function normalizeStoreName(str) {
  if (!str) return '';
  return str
    .replace(/\u0430/g, 'a')
    .replace(/\u0441/g, 'c')
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
  'caxias 49': 'caxias 49 - neobus',
};

function cleanVtexSeller(sellerName) {
  if (!sellerName) return '';
  if (filiaisCadastro[sellerName]) return sellerName;
  let cleaned = sellerName.replace(/\s*-\s*[\d\.\/\-]{11,25}\s*-\s*\d+\s*$/i, '').trim();
  if (filiaisCadastro[cleaned]) return cleaned;
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
    } catch (err) {
      console.error('Erro ao ler filiais_cadastro.json:', err.message);
    }
  }
}

loadFiliaisCadastro();

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

function enrichOrders(rawCache, catMap = {}) {
  const list = [];
  const orders = Array.isArray(rawCache) ? rawCache : Object.values(rawCache);

  orders.forEach(order => {
    if (!order.coupon || order.coupon === 'null' || order.status === 'canceled') return;
    
    const seller = order.sellers?.[0]?.name || '';
    const storeInfo = lookupStore(seller);
    
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

    const items = (order.items || []).map(item => {
      const catIds = item.categoriesIds ? item.categoriesIds.split('/').filter(Boolean) : [];
      const groupId = catIds[0] || '';
      const categoryId = catIds[catIds.length - 1] || item.categoryId || '';
      const price = item.price ? item.price / 100 : 0;
      const sellingPrice = item.sellingPrice ? item.sellingPrice / 100 : 0;
      const discount = Math.max(0, price - sellingPrice);
      
      return {
        name: item.name || '',
        productId: item.productId || '',
        quantity: item.quantity || 1,
        price,
        sellingPrice,
        listPrice: item.listPrice ? item.listPrice / 100 : price,
        discount,
        discountPct: price > 0 ? Math.round((discount / price) * 10000) / 100 : 0,
        brandName: item.brandName || '',
        group: catMap[groupId]?.name || (groupId ? `Grupo ${groupId}` : 'Sem Grupo'),
        category: catMap[categoryId]?.name || (categoryId ? `Cat ${categoryId}` : 'Sem Categoria'),
        groupId,
        categoryId,
      };
    });

    const totalValue = order.value ? order.value / 100 : 0;
    const totalItems = items.reduce((s, i) => s + i.quantity, 0);
    const totalDiscount = order.discountsTotal ? order.discountsTotal / 100 : items.reduce((s, i) => s + (i.discount * i.quantity), 0);

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
      store: storeInfo ? (storeInfo.matchedKey || storeInfo.filial || cleanVtexSeller(seller)) : cleanVtexSeller(seller),
      diretoria: storeInfo?.diretoria || 'Sem Diretoria',
      distrital: storeInfo?.distrital || 'Sem Distrital',
      coordenador: storeInfo?.coordenador || 'Sem Coordenador',
      municipio: storeInfo?.municipio || '',
      uf: storeInfo?.uf || '',
      items,
    });
  });

  return list;
}

module.exports = {
  lookupStore,
  cleanVtexSeller,
  normalizeStoreName,
  enrichOrders,
  getFiliaisCadastro: () => filiaisCadastro,
};
