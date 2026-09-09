import React, { useState, useMemo } from 'react';
import { 
  ChevronRight, ChevronDown, Package, Layers, Box, 
  Search, X, Maximize2, Minimize2, BarChart3, TrendingUp, DollarSign, Percent, Tag
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const fmtFloat = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v || 0);
const fmtN = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v || 0);

const COLS = [
  { key: 'qtd', label: 'Qtd.', fmt: fmtN },
  { key: 'valorVenda', label: 'Valor Venda', fmt: fmt },
  { key: 'valorTabela', label: 'Valor Tabela', fmt: fmt },
  { key: 'desconto', label: 'Desconto', fmt: fmt },
  { key: 'descontoPct', label: '% Desc.', fmt: v => `${(v || 0).toFixed(1)}%` },
  { key: 'pedidos', label: 'Pedidos', fmt: fmtN },
];

const chartTooltipStyle = {
  contentStyle: {
    background: '#ffffff',
    border: '1px solid #e0e0e0',
    borderRadius: 12,
    fontSize: 12,
    color: '#1d1d1f',
    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
    padding: '10px 14px',
  },
  labelStyle: { color: '#86868b', fontWeight: 600, marginBottom: 4 },
};

const COLORS = ['#0066cc', '#34c759', '#ff9500', '#af52de', '#5ac8fa', '#ff2d55', '#5856d6', '#0071e3'];

export default function CategoryView({ data = [] }) {
  const [openGroups, setOpenGroups] = useState(new Set());
  const [openCats, setOpenCats] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('valorVenda');
  const [sortAsc, setSortAsc] = useState(false);

  const toggle = (set, setter, key) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  // Filtragem de itens por busca
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    return data.map(order => {
      const matchingItems = (order.items || []).filter(item => {
        const mName = (item.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
        const mGroup = (item.group || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
        const mCat = (item.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
        const mBrand = (item.brandName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
        return mName || mGroup || mCat || mBrand;
      });
      if (matchingItems.length === 0) return null;
      return { ...order, items: matchingItems };
    }).filter(Boolean);
  }, [data, searchTerm]);

  // Árvore de produtos
  const tree = useMemo(() => {
    const groups = {};
    for (const order of filteredData) {
      for (const item of (order.items || [])) {
        const g = item.group || 'Sem Grupo';
        const c = item.category || 'Sem Categoria';
        const itemName = item.name || 'Sem Nome';

        if (!groups[g]) groups[g] = { qtd: 0, valorTabela: 0, valorVenda: 0, desconto: 0, pedidos: new Set(), categorias: {} };
        groups[g].qtd += item.quantity;
        groups[g].valorTabela += item.price * item.quantity;
        groups[g].valorVenda += item.sellingPrice * item.quantity;
        groups[g].desconto += item.discount * item.quantity;
        groups[g].pedidos.add(order.orderId);

        if (!groups[g].categorias[c]) groups[g].categorias[c] = { qtd: 0, valorTabela: 0, valorVenda: 0, desconto: 0, pedidos: new Set(), itens: {} };
        groups[g].categorias[c].qtd += item.quantity;
        groups[g].categorias[c].valorTabela += item.price * item.quantity;
        groups[g].categorias[c].valorVenda += item.sellingPrice * item.quantity;
        groups[g].categorias[c].desconto += item.discount * item.quantity;
        groups[g].categorias[c].pedidos.add(order.orderId);

        if (!groups[g].categorias[c].itens[itemName]) {
          groups[g].categorias[c].itens[itemName] = { 
            qtd: 0, 
            valorTabela: 0, 
            valorVenda: 0, 
            desconto: 0, 
            pedidos: new Set(),
            brandName: item.brandName,
            price: item.price,
            sellingPrice: item.sellingPrice
          };
        }
        groups[g].categorias[c].itens[itemName].qtd += item.quantity;
        groups[g].categorias[c].itens[itemName].valorTabela += item.price * item.quantity;
        groups[g].categorias[c].itens[itemName].valorVenda += item.sellingPrice * item.quantity;
        groups[g].categorias[c].itens[itemName].desconto += item.discount * item.quantity;
        groups[g].categorias[c].itens[itemName].pedidos.add(order.orderId);
      }
    }
    return groups;
  }, [filteredData]);

  const finalize = (obj) => ({
    ...obj,
    pedidos: obj.pedidos instanceof Set ? obj.pedidos.size : obj.pedidos,
    descontoPct: obj.valorTabela > 0 ? (obj.desconto / obj.valorTabela) * 100 : 0,
  });

  // Estatísticas para os Gráficos
  const topGruposChart = useMemo(() => {
    return Object.entries(tree).map(([name, d]) => ({
      name,
      valor: Math.round(d.valorVenda),
      qtd: d.qtd,
      descontoPct: d.valorTabela > 0 ? Math.round((d.desconto / d.valorTabela) * 100) : 0,
    })).sort((a, b) => b.valor - a.valor).slice(0, 8);
  }, [tree]);

  const topCategoriasChart = useMemo(() => {
    const list = [];
    Object.entries(tree).forEach(([gName, g]) => {
      Object.entries(g.categorias).forEach(([cName, c]) => {
        list.push({
          name: cName,
          group: gName,
          valor: Math.round(c.valorVenda),
          desconto: Math.round(c.desconto),
          descontoPct: c.valorTabela > 0 ? Math.round((c.desconto / c.valorTabela) * 100) : 0,
        });
      });
    });
    return list.sort((a, b) => b.valor - a.valor).slice(0, 8);
  }, [tree]);

  // Expand / Collapse
  const expandAll = () => {
    const allG = new Set(Object.keys(tree));
    const allC = new Set();
    Object.entries(tree).forEach(([gName, g]) => {
      Object.keys(g.categorias).forEach(cName => allC.add(`${gName}||${cName}`));
    });
    setOpenGroups(allG);
    setOpenCats(allC);
  };

  const collapseAll = () => {
    setOpenGroups(new Set());
    setOpenCats(new Set());
  };

  // Auto-expand on search
  React.useEffect(() => {
    if (searchTerm.trim().length > 1) {
      expandAll();
    }
  }, [searchTerm]);

  const sortedGroups = Object.entries(tree)
    .map(([name, d]) => ({ name, ...finalize(d), categorias: d.categorias }))
    .sort((a, b) => sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]);

  const totalItens = Object.values(tree).reduce((s, g) => {
    return s + Object.values(g.categorias).reduce((s2, c) => s2 + Object.keys(c.itens).length, 0);
  }, 0);

  const totalGeralVenda = sortedGroups.reduce((s, g) => s + g.valorVenda, 0);
  const totalGeralDesc = sortedGroups.reduce((s, g) => s + g.desconto, 0);
  const totalGeralQtd = sortedGroups.reduce((s, g) => s + g.qtd, 0);

  if (data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📦</div>
        <div className="empty-state-text">Nenhum dado de itens encontrado para o período selecionado.</div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* ─── GRÁFICOS DE PRODUTOS & CATEGORIAS ────────────────────────────── */}
      <div className="charts-row">
        {/* Gráfico 1: Top Grupos por Faturamento com Cupom */}
        <div className="chart-card">
          <div className="chart-title">
            <Layers size={16} className="chart-title-icon" />
            Top Grupos de Produtos (Faturamento com Cupom)
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={topGruposChart} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: '#1d1d1f' }} 
                angle={-18}
                textAnchor="end"
                interval={0}
                stroke="#e0e0e0"
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#86868b' }} 
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                stroke="#e0e0e0"
              />
              <Tooltip 
                {...chartTooltipStyle} 
                formatter={(v, name, item) => [
                  fmt(v), 
                  `Venda (${item.payload.descontoPct}% desconto médio)`
                ]}
              />
              <Bar dataKey="valor" fill="#0066cc" radius={[4, 4, 0, 0]}>
                {topGruposChart.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico 2: Top Categorias por Desconto e Faturamento */}
        <div className="chart-card">
          <div className="chart-title">
            <Package size={16} className="chart-title-icon" />
            Top Categorias com Cupons
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={topCategoriasChart} layout="vertical" margin={{ top: 5, right: 20, left: 35, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                type="number" 
                tick={{ fontSize: 11, fill: '#86868b' }} 
                stroke="#e0e0e0"
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                tick={{ fontSize: 11, fill: '#1d1d1f' }} 
                width={85}
                stroke="#e0e0e0"
              />
              <Tooltip 
                {...chartTooltipStyle} 
                formatter={(v, name, item) => [
                  fmt(v), 
                  `Faturamento em ${item.payload.group}`
                ]}
              />
              <Bar dataKey="valor" fill="#34c759" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── TABELA HIERÁRQUICA DE PRODUTOS ───────────────────────────────── */}
      <div className="table-card">
        <div className="table-header-rich">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="table-title" style={{ marginBottom: 0 }}>
              <Package size={17} />
              Estrutura de Produtos (Grupo &rsaquo; Categoria &rsaquo; Item)
            </div>
            <span className="table-count">
              {sortedGroups.length} grupos · {totalItens} itens únicos
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="table-search-box">
              <Search size={13} style={{ opacity: 0.5, marginLeft: 8 }} />
              <input
                type="text"
                placeholder="Buscar item, categoria ou marca..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="table-search-input"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="table-search-clear">
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="btn-group-sm">
              <button onClick={expandAll} className="table-action-btn">
                <Maximize2 size={11} /> Expandir
              </button>
              <button onClick={collapseAll} className="table-action-btn">
                <Minimize2 size={11} /> Recolher
              </button>
            </div>
          </div>
        </div>

        {/* Column Headers */}
        <div className="hier-header-row">
          <span style={{ width: 24 }} />
          <span className="hier-col-name">Grupo / Categoria / Item</span>
          {COLS.map(col => (
            <span
              key={col.key}
              className={`hier-col-val ${sortKey === col.key ? 'active-sort' : ''}`}
              onClick={() => {
                if (sortKey === col.key) setSortAsc(!sortAsc);
                else { setSortKey(col.key); setSortAsc(false); }
              }}
            >
              {col.label} {sortKey === col.key ? (sortAsc ? '↑' : '↓') : ''}
            </span>
          ))}
          <span style={{ width: 16 }} />
        </div>

        {sortedGroups.map(group => {
          const gOpen = openGroups.has(group.name);
          const sortedCats = Object.entries(group.categorias)
            .map(([name, d]) => ({ name, ...finalize(d), itens: d.itens }))
            .sort((a, b) => sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]);

          const groupPartPct = totalGeralVenda > 0 ? (group.valorVenda / totalGeralVenda) * 100 : 0;

          return (
            <div key={group.name} className="hier-group">
              {/* NÍVEL 0: GRUPO */}
              <div 
                className="hier-row level-0" 
                onClick={() => toggle(openGroups, setOpenGroups, group.name)}
              >
                <span className={`hier-expand ${gOpen ? 'open' : ''}`}>
                  {gOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <Layers size={15} style={{ marginRight: 6, color: 'var(--accent)', flexShrink: 0 }} />
                
                <div className="hier-name-box">
                  <span className="hier-main-name">{group.name}</span>
                  <span className="hier-badge-info">
                    {Object.keys(group.categorias).length} categorias · {Object.values(group.categorias).reduce((s, c) => s + Object.keys(c.itens).length, 0)} itens
                  </span>
                  <div className="hier-mini-bar-bg">
                    <div 
                      className="hier-mini-bar-fill" 
                      style={{ 
                        width: `${Math.min(100, groupPartPct)}%`,
                        background: 'var(--accent)'
                      }} 
                    />
                  </div>
                </div>

                {COLS.map(col => (
                  <span key={col.key} className={`hier-val ${col.key === 'valorVenda' ? 'highlight' : ''}`}>
                    {col.fmt(group[col.key])}
                  </span>
                ))}
                <span style={{ width: 16 }} />
              </div>

              {/* NÍVEL 1: CATEGORIA */}
              {gOpen && sortedCats.map(cat => {
                const catKey = `${group.name}||${cat.name}`;
                const cOpen = openCats.has(catKey);
                const sortedItems = Object.entries(cat.itens)
                  .map(([name, d]) => ({ name, ...finalize(d) }))
                  .sort((a, b) => sortAsc ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]);

                return (
                  <div key={catKey}>
                    <div 
                      className="hier-row level-1" 
                      onClick={() => toggle(openCats, setOpenCats, catKey)}
                    >
                      <span className={`hier-expand ${cOpen ? 'open' : ''}`}>
                        {cOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </span>
                      <Package size={14} style={{ marginRight: 6, opacity: 0.6, flexShrink: 0 }} />
                      
                      <div className="hier-name-box">
                        <span className="hier-main-name">{cat.name}</span>
                        <span className="hier-badge-info">
                          {sortedItems.length} itens
                        </span>
                      </div>

                      {COLS.map(col => (
                        <span key={col.key} className={`hier-val ${col.key === 'valorVenda' ? 'highlight' : ''}`}>
                          {col.fmt(cat[col.key])}
                        </span>
                      ))}
                      <span style={{ width: 16 }} />
                    </div>

                    {/* NÍVEL 2: ITEM */}
                    {cOpen && sortedItems.map(item => (
                      <div key={item.name} className="hier-row level-2" style={{ cursor: 'default' }}>
                        <span className="hier-expand" />
                        <Box size={13} style={{ marginRight: 6, color: 'var(--success)', opacity: 0.7, flexShrink: 0 }} />
                        
                        <div className="hier-name-box">
                          <span className="hier-main-name" style={{ color: 'var(--text)' }} title={item.name}>
                            {item.name}
                          </span>
                          {item.brandName && (
                            <span className="hier-badge-info" style={{ color: 'var(--text-dim)' }}>
                              Marca: {item.brandName}
                            </span>
                          )}
                        </div>

                        {COLS.map(col => (
                          <span key={col.key} className={`hier-val ${col.key === 'valorVenda' ? 'highlight' : ''}`}>
                            {col.fmt(item[col.key])}
                          </span>
                        ))}
                        <span style={{ width: 16 }} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
