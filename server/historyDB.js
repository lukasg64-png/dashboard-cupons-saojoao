/**
 * historyDB.js — Persistência histórica de cupons em SQLite
 * 
 * Duas tabelas principais:
 *  - orders: dados consolidados de pedidos com cupom
 *  - order_items: itens de cada pedido (detalhe de produto)
 *  - sync_meta: metadados de controle (datas consolidadas, etc.)
 * 
 * Fluxo:
 *  1. Startup: abre/cria o banco
 *  2. Backfill: carrega mês anterior completo (1x)
 *  3. Consolidamento diário: move dia anterior da memória para SQLite
 *  4. Query: busca dados históricos por range de datas
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'cupons_history.db');

let db = null;

// ── Inicialização ───────────────────────────────────────────────────────────

function getDB() {
  if (db) return db;
  
  const dbPath = process.env.DB_PATH 
    ? path.resolve(process.env.DB_PATH) 
    : DEFAULT_DB_PATH;
  
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(dbPath);
  
  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache
  db.pragma('temp_store = MEMORY');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      orderId TEXT PRIMARY KEY,
      creationDate TEXT,
      date TEXT NOT NULL,
      hour TEXT,
      time TEXT,
      coupon TEXT NOT NULL,
      value REAL DEFAULT 0,
      itemsCount INTEGER DEFAULT 0,
      totalDiscount REAL DEFAULT 0,
      discountPct REAL DEFAULT 0,
      store TEXT,
      diretoria TEXT,
      distrital TEXT,
      coordenador TEXT,
      municipio TEXT,
      uf TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      orderId TEXT NOT NULL,
      item_index INTEGER NOT NULL,
      name TEXT,
      productId TEXT,
      quantity INTEGER DEFAULT 0,
      price REAL DEFAULT 0,
      sellingPrice REAL DEFAULT 0,
      listPrice REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      discountPct REAL DEFAULT 0,
      brandName TEXT,
      groupName TEXT,
      category TEXT,
      groupId TEXT,
      categoryId TEXT,
      PRIMARY KEY (orderId, item_index),
      FOREIGN KEY (orderId) REFERENCES orders(orderId) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Índices para queries rápidas
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
    CREATE INDEX IF NOT EXISTS idx_orders_coupon ON orders(coupon);
    CREATE INDEX IF NOT EXISTS idx_orders_diretoria ON orders(diretoria);
    CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store);
    CREATE INDEX IF NOT EXISTS idx_orders_date_coupon ON orders(date, coupon);
    CREATE INDEX IF NOT EXISTS idx_order_items_orderId ON order_items(orderId);
  `);

  console.log(`📦 [HistoryDB] Banco aberto em: ${dbPath}`);
  return db;
}

// ── Meta ────────────────────────────────────────────────────────────────────

function getMeta(key) {
  const row = getDB().prepare('SELECT value FROM sync_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  getDB().prepare(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
  ).run(key, value, value);
}

// ── Insert / Upsert ─────────────────────────────────────────────────────────

/**
 * Insere um lote de pedidos enriquecidos (formato buildCouponData) no SQLite.
 * Usa transação para performance e atomicidade.
 * 
 * @param {Array} enrichedOrders - Array de pedidos no formato do buildCouponData()
 * @returns {number} Número de pedidos inseridos/atualizados
 */
function insertOrders(enrichedOrders) {
  if (!enrichedOrders || enrichedOrders.length === 0) return 0;

  const database = getDB();

  const insertOrder = database.prepare(`
    INSERT OR REPLACE INTO orders 
    (orderId, creationDate, date, hour, time, coupon, value, itemsCount, 
     totalDiscount, discountPct, store, diretoria, distrital, coordenador, municipio, uf)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteItems = database.prepare('DELETE FROM order_items WHERE orderId = ?');

  const insertItem = database.prepare(`
    INSERT INTO order_items 
    (orderId, item_index, name, productId, quantity, price, sellingPrice, 
     listPrice, discount, discountPct, brandName, groupName, category, groupId, categoryId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;

  const transaction = database.transaction((orders) => {
    for (const order of orders) {
      insertOrder.run(
        order.orderId,
        order.creationDate || '',
        order.date,
        order.hour || '00',
        order.time || '00:00',
        order.coupon,
        order.value || 0,
        order.itemsCount || 0,
        order.totalDiscount || 0,
        order.discountPct || 0,
        order.store || '',
        order.diretoria || '',
        order.distrital || '',
        order.coordenador || '',
        order.municipio || '',
        order.uf || ''
      );

      // Replace items
      deleteItems.run(order.orderId);
      if (order.items && order.items.length > 0) {
        order.items.forEach((item, idx) => {
          insertItem.run(
            order.orderId,
            idx,
            item.name || '',
            item.productId || '',
            item.quantity || 0,
            item.price || 0,
            item.sellingPrice || 0,
            item.listPrice || 0,
            item.discount || 0,
            item.discountPct || 0,
            item.brandName || '',
            item.group || '',
            item.category || '',
            item.groupId || '',
            item.categoryId || ''
          );
        });
      }
      count++;
    }
  });

  transaction(enrichedOrders);
  return count;
}

// ── Query ───────────────────────────────────────────────────────────────────

/**
 * Busca pedidos por range de datas, retornando no formato do buildCouponData().
 * Inclui itens completos para cada pedido.
 * 
 * @param {string} startDate - Data início (YYYY-MM-DD)
 * @param {string} endDate - Data fim (YYYY-MM-DD)
 * @param {Object} filters - Filtros opcionais { diretoria, distrital, coordenador, store, coupon }
 * @returns {Array} Lista de pedidos enriquecidos
 */
function queryByDateRange(startDate, endDate, filters = {}) {
  const database = getDB();

  let whereClause = 'WHERE o.date >= ? AND o.date <= ?';
  const params = [startDate, endDate];

  if (filters.diretoria && filters.diretoria !== 'all') {
    whereClause += ' AND o.diretoria = ?';
    params.push(filters.diretoria);
  }
  if (filters.distrital && filters.distrital !== 'all') {
    whereClause += ' AND o.distrital = ?';
    params.push(filters.distrital);
  }
  if (filters.coordenador && filters.coordenador !== 'all') {
    whereClause += ' AND o.coordenador = ?';
    params.push(filters.coordenador);
  }
  if (filters.store && filters.store !== 'all') {
    whereClause += ' AND o.store = ?';
    params.push(filters.store);
  }
  if (filters.coupon && filters.coupon !== 'all') {
    whereClause += ' AND o.coupon = ?';
    params.push(filters.coupon.toUpperCase().trim());
  }

  // Fetch orders
  const orders = database.prepare(`
    SELECT * FROM orders o ${whereClause} ORDER BY o.date DESC, o.time DESC
  `).all(...params);

  if (orders.length === 0) return [];

  // Fetch all items for these orders in one query
  const orderIds = orders.map(o => o.orderId);
  
  // Build items map in chunks (SQLite has a variable limit)
  const itemsMap = {};
  const CHUNK_SIZE = 500;
  
  for (let i = 0; i < orderIds.length; i += CHUNK_SIZE) {
    const chunk = orderIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const items = database.prepare(
      `SELECT * FROM order_items WHERE orderId IN (${placeholders}) ORDER BY item_index`
    ).all(...chunk);

    for (const item of items) {
      if (!itemsMap[item.orderId]) itemsMap[item.orderId] = [];
      itemsMap[item.orderId].push({
        name: item.name,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        sellingPrice: item.sellingPrice,
        listPrice: item.listPrice,
        discount: item.discount,
        discountPct: item.discountPct,
        brandName: item.brandName,
        group: item.groupName,
        category: item.category,
        groupId: item.groupId,
        categoryId: item.categoryId,
      });
    }
  }

  // Combine into enriched format
  return orders.map(o => ({
    orderId: o.orderId,
    creationDate: o.creationDate,
    date: o.date,
    hour: o.hour,
    time: o.time,
    coupon: o.coupon,
    value: o.value,
    itemsCount: o.itemsCount,
    totalDiscount: o.totalDiscount,
    discountPct: o.discountPct,
    store: o.store,
    diretoria: o.diretoria,
    distrital: o.distrital,
    coordenador: o.coordenador,
    municipio: o.municipio,
    uf: o.uf,
    items: itemsMap[o.orderId] || [],
  }));
}

// ── Consolidamento ──────────────────────────────────────────────────────────

/**
 * Retorna lista de datas que já foram consolidadas no banco.
 */
function getConsolidatedDates() {
  const rows = getDB().prepare(
    'SELECT DISTINCT date FROM orders ORDER BY date'
  ).all();
  return rows.map(r => r.date);
}

/**
 * Conta pedidos por data.
 */
function getDateCounts() {
  const rows = getDB().prepare(
    'SELECT date, COUNT(*) as count FROM orders GROUP BY date ORDER BY date'
  ).all();
  const result = {};
  for (const row of rows) {
    result[row.date] = row.count;
  }
  return result;
}

/**
 * Verifica se uma data específica já existe no banco.
 */
function hasDate(dateStr) {
  const row = getDB().prepare(
    'SELECT COUNT(*) as cnt FROM orders WHERE date = ?'
  ).get(dateStr);
  return row && row.cnt > 0;
}

/**
 * Remove pedidos de uma data específica (para re-consolidar).
 */
function purgeDate(dateStr) {
  const database = getDB();
  const transaction = database.transaction(() => {
    const orderIds = database.prepare(
      'SELECT orderId FROM orders WHERE date = ?'
    ).all(dateStr).map(r => r.orderId);

    if (orderIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < orderIds.length; i += CHUNK) {
        const chunk = orderIds.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => '?').join(',');
        database.prepare(`DELETE FROM order_items WHERE orderId IN (${placeholders})`).run(...chunk);
      }
    }

    database.prepare('DELETE FROM orders WHERE date = ?').run(dateStr);
    return orderIds.length;
  });

  const count = transaction();
  if (count > 0) {
    console.log(`🗑️ [HistoryDB] Removidos ${count} pedidos da data ${dateStr}`);
  }
  return count;
}

// ── Estatísticas ────────────────────────────────────────────────────────────

function getStats() {
  const database = getDB();
  const totalOrders = database.prepare('SELECT COUNT(*) as cnt FROM orders').get().cnt;
  const totalItems = database.prepare('SELECT COUNT(*) as cnt FROM order_items').get().cnt;
  const dates = getDateCounts();
  const firstDate = database.prepare('SELECT MIN(date) as d FROM orders').get()?.d || null;
  const lastDate = database.prepare('SELECT MAX(date) as d FROM orders').get()?.d || null;
  const dbPath = process.env.DB_PATH 
    ? path.resolve(process.env.DB_PATH) 
    : DEFAULT_DB_PATH;
  
  let dbSizeMB = 0;
  try {
    dbSizeMB = Math.round(fs.statSync(dbPath).size / (1024 * 1024) * 100) / 100;
  } catch (e) { /* file may not exist yet */ }

  return {
    totalOrders,
    totalItems,
    firstDate,
    lastDate,
    daysConsolidated: Object.keys(dates).length,
    dateCounts: dates,
    dbSizeMB,
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

function close() {
  if (db) {
    db.close();
    db = null;
    console.log('📦 [HistoryDB] Banco fechado.');
  }
}

// Cleanup on process exit
process.on('exit', close);
process.on('SIGINT', () => { close(); process.exit(0); });
process.on('SIGTERM', () => { close(); process.exit(0); });

module.exports = {
  getDB,
  getMeta,
  setMeta,
  insertOrders,
  queryByDateRange,
  getConsolidatedDates,
  getDateCounts,
  hasDate,
  purgeDate,
  getStats,
  close,
};
