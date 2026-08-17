import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './App.css';
import API from './api';
import KPICards from './components/KPICards';
import FilterBar from './components/FilterBar';
import HierarchyView from './components/HierarchyView';
import OrdersView from './components/OrdersView';
import CategoryView from './components/CategoryView';
import CouponAnalysis from './components/CouponAnalysis';
import { Building2, ShoppingCart, Package, Tag, RefreshCw } from 'lucide-react';

const TABS = [
  { key: 'lojas', label: 'Estrutura & Lojas', icon: Building2 },
  { key: 'pedidos', label: 'Pedidos & Cestas', icon: ShoppingCart },
  { key: 'produtos', label: 'Produtos & Categorias', icon: Package },
  { key: 'cupons', label: 'Análise de Cupons', icon: Tag },
];

function getBrtDateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const brt = new Date(d.getTime() - 3 * 3600000);
  return brt.toISOString().slice(0, 10);
}

function filterByDate(orders, dateMode) {
  let startDate, endDate;
  const today = getBrtDateStr(0);
  switch (dateMode) {
    case 'hoje':   startDate = endDate = today; break;
    case 'ontem':  startDate = endDate = getBrtDateStr(1); break;
    case '3d':     startDate = getBrtDateStr(2); endDate = today; break;
    case '7d':     startDate = getBrtDateStr(6); endDate = today; break;
    case '15d':
    default:       startDate = getBrtDateStr(14); endDate = today; break;
  }
  return orders.filter(o => o.date >= startDate && o.date <= endDate);
}

export default function App() {
  const [activeTab, setActiveTab] = useState('lojas');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncState, setSyncState] = useState(null);
  const [totalOrders, setTotalOrders] = useState(0);
  const [filterOpts, setFilterOpts] = useState({});
  const [relations, setRelations] = useState({});

  const [filters, setFilters] = useState({
    dateMode: '15d',
    diretoria: 'all',
    distrital: 'all',
    coordenador: 'all',
    filial: 'all',
    cupom: 'all',
    grupo: 'all',
    categoria: 'all',
    item: 'all',
  });

  const setFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Fetch data
  const loadData = useCallback(async () => {
    try {
      const [couponsRes, filtersRes] = await Promise.all([
        API.getCoupons(),
        API.getFilters(),
      ]);
      if (couponsRes.status === 'ok') {
        setRawData(couponsRes.data || []);
        setSyncState(couponsRes.sync);
        setTotalOrders(couponsRes.totalOrders || 0);
      }
      if (filtersRes.status === 'ok') {
        setFilterOpts({
          diretorias: filtersRes.diretorias || [],
          distritais: filtersRes.distritais || [],
          coordenadores: filtersRes.coordenadores || [],
          filiais: filtersRes.filiais || [],
          cupons: filtersRes.cupons || [],
          grupos: filtersRes.grupos || [],
          categorias: filtersRes.categorias || [],
          itens: filtersRes.itens || [],
        });
        setRelations(filtersRes.relations || {});
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh a cada 5 minutos
  useEffect(() => {
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await API.triggerSync();
      await new Promise(r => setTimeout(r, 3000));
      await loadData();
    } catch (err) {
      console.error('Erro ao sincronizar:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Filter data client-side
  const filteredData = useMemo(() => {
    let d = rawData;
    d = filterByDate(d, filters.dateMode);
    if (filters.diretoria !== 'all') d = d.filter(o => o.diretoria === filters.diretoria);
    if (filters.distrital !== 'all') d = d.filter(o => o.distrital === filters.distrital);
    if (filters.coordenador !== 'all') d = d.filter(o => o.coordenador === filters.coordenador);
    if (filters.filial !== 'all') d = d.filter(o => o.store === filters.filial);
    if (filters.cupom !== 'all') d = d.filter(o => o.coupon === filters.cupom);

    // Filtros de produto
    if (filters.grupo !== 'all' || filters.categoria !== 'all' || filters.item !== 'all') {
      d = d.map(order => {
        const matchingItems = (order.items || []).filter(it => {
          if (filters.grupo !== 'all' && it.group !== filters.grupo) return false;
          if (filters.categoria !== 'all' && it.category !== filters.categoria) return false;
          if (filters.item !== 'all' && it.name !== filters.item) return false;
          return true;
        });
        if (matchingItems.length === 0) return null;
        const matchingValue = matchingItems.reduce((s, it) => s + (it.sellingPrice * it.quantity), 0);
        const matchingDiscount = matchingItems.reduce((s, it) => s + (it.discount * it.quantity), 0);
        const matchingCount = matchingItems.reduce((s, it) => s + it.quantity, 0);
        return {
          ...order,
          items: matchingItems,
          value: matchingValue,
          totalDiscount: matchingDiscount,
          itemsCount: matchingCount,
        };
      }).filter(Boolean);
    }

    return d;
  }, [rawData, filters]);

  return (
    <div className="app-layout">
      {/* ── Apple Global Nav (44px, Pure Black) ───────────────────────────── */}
      <nav className="global-nav">
        <div className="global-nav-left">
          <div className="global-nav-brand">
            <span>🎟️</span>
            <span>Farmácias São João</span>
          </div>
          <span className="global-nav-tag">Diretorias Cintia &amp; Laerti</span>
        </div>
        <div className="global-nav-right">
          <div className="global-nav-badge">
            <span className={`global-nav-dot ${syncState?.isSyncing ? 'syncing' : ''}`} />
            {syncState?.isSyncing
              ? `Sincronizando ${syncState.progressPercent}%`
              : `${new Intl.NumberFormat('pt-BR').format(totalOrders)} pedidos em cache`
            }
          </div>
          {syncState?.lastSyncTime && (
            <span style={{ color: '#86868b', fontSize: 11 }}>
              Sync: {new Date(syncState.lastSyncTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </nav>

      {/* ── Apple Sub-Nav Frosted (52px, Glass) ────────────────────────────── */}
      <div className="sub-nav-frosted">
        <div className="sub-nav-title">
          Painel de Cupons
        </div>
        <div className="sub-nav-tabs">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={`sub-nav-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Content Canvas ────────────────────────────────────────────── */}
      <main className="main-content">
        {/* Apple Filter Bar */}
        <FilterBar
          filters={filters}
          setFilter={setFilter}
          options={filterOpts}
          relations={relations}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />

        {/* Loading state */}
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner" />
            <div className="loading-text">Carregando dados de cupons da VTEX...</div>
          </div>
        ) : (
          <>
            {/* 🏢 Estrutura & Lojas (Unificada) */}
            {activeTab === 'lojas' && (
              <div className="fade-in">
                <KPICards data={filteredData} />
                <HierarchyView data={filteredData} />
              </div>
            )}

            {/* 🛒 Pedidos & Cestas (Nova Página) */}
            {activeTab === 'pedidos' && (
              <OrdersView data={filteredData} />
            )}

            {/* 📦 Produtos & Categorias */}
            {activeTab === 'produtos' && (
              <CategoryView data={filteredData} />
            )}

            {/* 🏷️ Análise de Cupons */}
            {activeTab === 'cupons' && (
              <CouponAnalysis data={filteredData} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
