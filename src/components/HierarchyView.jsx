import React, { useState, useMemo } from 'react';
import { 
  ChevronRight, ChevronDown, Building2, Users, User, MapPin, 
  TrendingUp, BarChart3, Search, X, Maximize2, Minimize2, Eye, 
  ArrowUpDown, Sparkles, Filter, Download
} from 'lucide-react';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import DetailDrawer from './DetailDrawer';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const fmtFloat = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v || 0);
const fmtN = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v || 0);

function aggregate(orders) {
  const pedidos = orders.length;
  const valor = orders.reduce((s, o) => s + o.value, 0);
  const itens = orders.reduce((s, o) => s + o.itemsCount, 0);
  const desconto = orders.reduce((s, o) => s + o.totalDiscount, 0);
  const cuponsUnicos = new Set(orders.map(o => o.coupon)).size;
  const ticket = pedidos > 0 ? valor / pedidos : 0;
  const descontoPct = valor > 0 ? (desconto / valor) * 100 : 0;
  return { pedidos, valor, itens, desconto, cuponsUnicos, ticket, descontoPct };
}

const COLS = [
  { key: 'pedidos', label: 'Pedidos', fmt: fmtN },
  { key: 'valor', label: 'Faturamento', fmt: fmt },
  { key: 'ticket', label: 'Ticket Médio', fmt: v => fmt(v) },
  { key: 'itens', label: 'Itens', fmt: fmtN },
  { key: 'descontoPct', label: '% Desc.', fmt: v => `${v.toFixed(1)}%` },
  { key: 'cuponsUnicos', label: 'Cupons', fmt: fmtN },
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

export default function HierarchyView({ data = [] }) {
  const [openDirs, setOpenDirs] = useState(new Set(['C', 'L']));
  const [openDist, setOpenDist] = useState(new Set());
  const [openCoord, setOpenCoord] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [chartMetric, setChartMetric] = useState('valor'); // 'valor' ou 'pedidos'
  const [sortKey, setSortKey] = useState('valor');
  const [sortAsc, setSortAsc] = useState(false);

  // Toggle helpers
  const toggle = (set, setter, key) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  // Filtragem por busca
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return data.filter(o => {
      const matchFilial = (o.store || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
      const matchCoord = (o.coordenador || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
      const matchDist = (o.distrital || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
      const matchMun = (o.municipio || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
      const matchCupom = (o.coupon || '').toLowerCase().includes(term);
      return matchFilial || matchCoord || matchDist || matchMun || matchCupom;
    });
  }, [data, searchTerm]);

  // Árvore hierárquica
  const tree = useMemo(() => {
    const dirs = {};
    for (const order of filteredOrders) {
      const d = order.diretoria || 'N/A';
      const dist = order.distrital || 'N/A';
      const coord = order.coordenador || 'N/A';
      const fil = order.store || 'N/A';

      if (!dirs[d]) dirs[d] = { orders: [], distritais: {} };
      dirs[d].orders.push(order);

      if (!dirs[d].distritais[dist]) dirs[d].distritais[dist] = { orders: [], coordenadores: {} };
      dirs[d].distritais[dist].orders.push(order);

      if (!dirs[d].distritais[dist].coordenadores[coord]) dirs[d].distritais[dist].coordenadores[coord] = { orders: [], filiais: {} };
      dirs[d].distritais[dist].coordenadores[coord].orders.push(order);

      if (!dirs[d].distritais[dist].coordenadores[coord].filiais[fil]) dirs[d].distritais[dist].coordenadores[coord].filiais[fil] = { orders: [], info: order };
      dirs[d].distritais[dist].coordenadores[coord].filiais[fil].orders.push(order);
    }
    return dirs;
  }, [filteredOrders]);

  // Total Geral
  const totalGeral = useMemo(() => aggregate(filteredOrders), [filteredOrders]);

  // Auto-expand quando há termo de busca
  React.useEffect(() => {
    if (searchTerm.trim().length > 1) {
      const allDist = new Set();
      const allCoord = new Set();
      Object.values(tree).forEach(d => {
        Object.keys(d.distritais).forEach(dist => allDist.add(dist));
        Object.values(d.distritais).forEach(distObj => {
          Object.keys(distObj.coordenadores).forEach(c => allCoord.add(c));
        });
      });
      setOpenDirs(new Set(['C', 'L']));
      setOpenDist(allDist);
      setOpenCoord(allCoord);
    }
  }, [searchTerm, tree]);

  // Expandir / Recolher Tudo
  const expandAll = () => {
    const allDist = new Set();
    const allCoord = new Set();
    Object.values(tree).forEach(d => {
      Object.keys(d.distritais).forEach(dist => allDist.add(dist));
      Object.values(d.distritais).forEach(distObj => {
        Object.keys(distObj.coordenadores).forEach(c => allCoord.add(c));
      });
    });
    setOpenDirs(new Set(['C', 'L']));
    setOpenDist(allDist);
    setOpenCoord(allCoord);
  };

  const collapseAll = () => {
    setOpenDirs(new Set());
    setOpenDist(new Set());
    setOpenCoord(new Set());
  };

  const expandDiretoriasOnly = () => {
    setOpenDirs(new Set(['C', 'L']));
    setOpenDist(new Set());
    setOpenCoord(new Set());
  };

  const exportHierarchyToExcel = () => {
    try {
      const rows = [];
      rows.push([
        "Nível",
        "Diretoria",
        "Distrital",
        "Coordenador",
        "Filial / Loja",
        "Pedidos",
        "Faturamento (R$)",
        "Ticket Médio (R$)",
        "Itens",
        "% Desconto",
        "Total Desconto (R$)",
        "Cupons Únicos"
      ]);

      rows.push([
        "TOTAL GERAL",
        "-",
        "-",
        "-",
        "-",
        totalGeral.pedidos,
        totalGeral.valor,
        parseFloat(totalGeral.ticket.toFixed(2)),
        totalGeral.itens,
        parseFloat(totalGeral.descontoPct.toFixed(2)),
        totalGeral.desconto,
        totalGeral.cuponsUnicos
      ]);

      Object.entries(tree).forEach(([dirKey, dirObj]) => {
        const dirAgg = aggregate(dirObj.orders);
        rows.push([
          "DIRETORIA",
          `Diretoria ${dirKey}`,
          "-",
          "-",
          "-",
          dirAgg.pedidos,
          dirAgg.valor,
          parseFloat(dirAgg.ticket.toFixed(2)),
          dirAgg.itens,
          parseFloat(dirAgg.descontoPct.toFixed(2)),
          dirAgg.desconto,
          dirAgg.cuponsUnicos
        ]);

        Object.entries(dirObj.distritais).forEach(([distKey, distObj]) => {
          const distAgg = aggregate(distObj.orders);
          rows.push([
            "DISTRITAL",
            `Diretoria ${dirKey}`,
            distKey,
            "-",
            "-",
            distAgg.pedidos,
            distAgg.valor,
            parseFloat(distAgg.ticket.toFixed(2)),
            distAgg.itens,
            parseFloat(distAgg.descontoPct.toFixed(2)),
            distAgg.desconto,
            distAgg.cuponsUnicos
          ]);

          Object.entries(distObj.coordenadores).forEach(([coordKey, coordObj]) => {
            const coordAgg = aggregate(coordObj.orders);
            rows.push([
              "COORDENADOR",
              `Diretoria ${dirKey}`,
              distKey,
              coordKey,
              "-",
              coordAgg.pedidos,
              coordAgg.valor,
              parseFloat(coordAgg.ticket.toFixed(2)),
              coordAgg.itens,
              parseFloat(coordAgg.descontoPct.toFixed(2)),
              coordAgg.desconto,
              coordAgg.cuponsUnicos
            ]);

            Object.entries(coordObj.filiais).forEach(([filKey, filObj]) => {
              const filAgg = aggregate(filObj.orders);
              rows.push([
                "LOJA",
                `Diretoria ${dirKey}`,
                distKey,
                coordKey,
                filKey,
                filAgg.pedidos,
                filAgg.valor,
                parseFloat(filAgg.ticket.toFixed(2)),
                filAgg.itens,
                parseFloat(filAgg.descontoPct.toFixed(2)),
                filAgg.desconto,
                filAgg.cuponsUnicos
              ]);
            });
          });
        });
      });

      if (typeof window !== 'undefined') {
        import('xlsx').then(XLSX => {
          const ws = XLSX.utils.aoa_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Hierarquia");
          const dateStr = new Date().toISOString().slice(0, 10);
          XLSX.writeFile(wb, `Hierarquia_Cupons_Sao_Joao_${dateStr}.xlsx`);
        }).catch(() => {
          const csvContent = "\uFEFF" + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.setAttribute("download", `Hierarquia_Cupons_Sao_Joao_${new Date().toISOString().slice(0, 10)}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
      }
    } catch (err) {
      console.error('Erro ao exportar hierarquia:', err);
    }
  };

  const [rankingDimension, setRankingDimension] = useState('distritais'); // 'distritais' | 'coordenadores' | 'lojas'

  // Identificar se o filtro atual é de um único dia (ex: hoje ou ontem)
  const uniqueDates = useMemo(() => {
    return Array.from(new Set(data.map(d => d.date).filter(Boolean)));
  }, [data]);

  const isSingleDay = uniqueDates.length === 1;

  // Dados para o Gráfico de Evolução (Histórico Dia a Dia OU Hora a Hora)
  const timelineChartData = useMemo(() => {
    if (isSingleDay) {
      // Gerar 24 horas (00h a 23h) em horário de Brasília (BRT)
      const hourlyMap = {};
      for (let h = 0; h < 24; h++) {
        const hStr = String(h).padStart(2, '0');
        hourlyMap[hStr] = {
          key: `${hStr}h`,
          hour: hStr,
          valorTotal: 0,
          pedidosTotal: 0,
          valorC: 0,
          pedidosC: 0,
          valorL: 0,
          pedidosL: 0,
        };
      }

      for (const order of data) {
        let hStr = order.hour;
        if (!hStr && order.creationDate) {
          const d = new Date(order.creationDate);
          const brt = new Date(d.getTime() - 3 * 3600000);
          hStr = String(brt.getUTCHours()).padStart(2, '0');
        }
        if (!hStr) hStr = '00';
        if (!hourlyMap[hStr]) {
          hourlyMap[hStr] = { key: `${hStr}h`, hour: hStr, valorTotal: 0, pedidosTotal: 0, valorC: 0, pedidosC: 0, valorL: 0, pedidosL: 0 };
        }
        hourlyMap[hStr].valorTotal += order.value;
        hourlyMap[hStr].pedidosTotal++;
        if (order.diretoria === 'C') {
          hourlyMap[hStr].valorC += order.value;
          hourlyMap[hStr].pedidosC++;
        } else if (order.diretoria === 'L') {
          hourlyMap[hStr].valorL += order.value;
          hourlyMap[hStr].pedidosL++;
        }
      }

      return Object.values(hourlyMap).sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
    } else {
      // Evolução diária (histórico por dia)
      const dailyMap = {};
      for (const order of data) {
        const date = order.date;
        if (!date) continue;
        if (!dailyMap[date]) {
          dailyMap[date] = {
            key: date,
            date,
            valorTotal: 0,
            pedidosTotal: 0,
            valorC: 0,
            pedidosC: 0,
            valorL: 0,
            pedidosL: 0,
          };
        }
        dailyMap[date].valorTotal += order.value;
        dailyMap[date].pedidosTotal++;
        if (order.diretoria === 'C') {
          dailyMap[date].valorC += order.value;
          dailyMap[date].pedidosC++;
        } else if (order.diretoria === 'L') {
          dailyMap[date].valorL += order.value;
          dailyMap[date].pedidosL++;
        }
      }
      return Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    }
  }, [data, isSingleDay]);

  // Dados para o Gráfico de Ranking (Top Distritais / Coordenadores / Lojas)
  const topRankingChart = useMemo(() => {
    const map = {};
    for (const order of data) {
      let key = '';
      if (rankingDimension === 'distritais') key = order.distrital || 'Outros';
      else if (rankingDimension === 'coordenadores') key = order.coordenador || 'Outros';
      else if (rankingDimension === 'lojas') key = order.store || 'Outros';

      if (!map[key]) {
        map[key] = {
          name: key,
          diretoria: order.diretoria,
          valor: 0,
          pedidos: 0,
        };
      }
      map[key].valor += order.value;
      map[key].pedidos++;
    }
    return Object.values(map)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [data, rankingDimension]);

  const dirNames = { C: 'Cintia', L: 'Laerti' };
  const sortedDirs = Object.entries(tree).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="fade-in">
      {/* ─── SEÇÃO DE GRÁFICOS VISUAIS E HISTÓRICO ────────────────────────── */}
      <div className="charts-row">
        {/* Gráfico 1: Evolução Diária ou Horária por Diretoria */}
        <div className="chart-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="chart-title" style={{ marginBottom: 0 }}>
              <TrendingUp size={16} className="chart-title-icon" />
              {isSingleDay 
                ? `Evolução Hora a Hora — ${uniqueDates[0]?.slice(8,10)}/${uniqueDates[0]?.slice(5,7)} (C vs L)`
                : 'Histórico Diário com Cupons (Cintia vs Laerti)'
              }
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`date-btn ${chartMetric === 'valor' ? 'active' : ''}`}
                onClick={() => setChartMetric('valor')}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                Faturamento (R$)
              </button>
              <button
                className={`date-btn ${chartMetric === 'pedidos' ? 'active' : ''}`}
                onClick={() => setChartMetric('pedidos')}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                Qtd. Pedidos
              </button>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={timelineChartData}>
              <defs>
                <linearGradient id="gradDirC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0066cc" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#0066cc" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradDirL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34c759" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#34c759" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="key" 
                tick={{ fontSize: 11, fill: '#86868b' }} 
                tickFormatter={v => isSingleDay ? v : v.slice(5).replace('-', '/')} 
                stroke="#e0e0e0"
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#86868b' }} 
                tickFormatter={v => chartMetric === 'valor' ? (v >= 1000 ? `${(v/1000).toFixed(0)}k` : v) : v}
                stroke="#e0e0e0"
              />
              <Tooltip 
                {...chartTooltipStyle} 
                formatter={(v, name) => [
                  chartMetric === 'valor' ? fmt(v) : fmtN(v),
                  name === 'valorC' || name === 'pedidosC' ? 'Diretoria Cintia (C)' : 'Diretoria Laerti (L)'
                ]}
                labelFormatter={l => isSingleDay ? `Horário: ${l} (Horário de Brasília)` : `Data: ${l.slice(8, 10)}/${l.slice(5, 7)}/${l.slice(0, 4)}`}
              />
              <Legend 
                verticalAlign="top" 
                height={28}
                formatter={(v) => (
                  <span style={{ fontSize: 12, color: '#1d1d1f', marginRight: 12 }}>
                    {v === 'valorC' || v === 'pedidosC' ? '🔵 Cintia (C)' : '🟢 Laerti (L)'}
                  </span>
                )}
              />
              <Area 
                type="monotone" 
                dataKey={chartMetric === 'valor' ? 'valorC' : 'pedidosC'} 
                stroke="#0066cc" 
                fill="url(#gradDirC)" 
                strokeWidth={2}
                name={chartMetric === 'valor' ? 'valorC' : 'pedidosC'} 
              />
              <Area 
                type="monotone" 
                dataKey={chartMetric === 'valor' ? 'valorL' : 'pedidosL'} 
                stroke="#34c759" 
                fill="url(#gradDirL)" 
                strokeWidth={2}
                name={chartMetric === 'valor' ? 'valorL' : 'pedidosL'} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico 2: Top Ranking (com 3 Botões: Distritais, Coordenadores, Lojas) */}
        <div className="chart-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="chart-title" style={{ marginBottom: 0 }}>
              <BarChart3 size={16} className="chart-title-icon" />
              Top {rankingDimension === 'distritais' ? 'Distritais' : rankingDimension === 'coordenadores' ? 'Coordenadores' : 'Lojas'} com Cupons
            </div>
            
            {/* 3 Botões de Troca de Nível */}
            <div style={{ display: 'flex', gap: 3 }}>
              {[
                { key: 'distritais', label: 'Distritais' },
                { key: 'coordenadores', label: 'Coordenadores' },
                { key: 'lojas', label: 'Lojas' },
              ].map(btn => (
                <button
                  key={btn.key}
                  className={`date-btn ${rankingDimension === btn.key ? 'active' : ''}`}
                  onClick={() => setRankingDimension(btn.key)}
                  style={{ fontSize: 10, padding: '3px 8px' }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={210}>
            <BarChart 
              data={topRankingChart} 
              layout="vertical" 
              margin={{ top: 5, right: 20, left: 45, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                type="number" 
                tick={{ fontSize: 11, fill: '#86868b' }} 
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                stroke="#e0e0e0"
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                tick={{ fontSize: 11, fill: '#1d1d1f' }} 
                width={95}
                stroke="#e0e0e0"
              />
              <Tooltip 
                {...chartTooltipStyle} 
                formatter={(v, name, item) => [
                  fmt(v), 
                  `Faturamento (${item.payload.diretoria === 'C' ? 'Cintia' : 'Laerti'}) - ${item.payload.pedidos} pedidos`
                ]}
              />
              <Bar 
                dataKey="valor" 
                radius={[0, 4, 4, 0]}
                fill="#0066cc"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── TABELA HIERÁRQUICA E EXPLORER ───────────────────────────────── */}
      <div className="table-card">
        {/* Header da Tabela com Barra de Ações */}
        <div className="table-header-rich">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="table-title" style={{ marginBottom: 0 }}>
              <Building2 size={17} />
              Estrutura de Lojas (Diretor &rsaquo; Distrital &rsaquo; Coordenador &rsaquo; Filial)
            </div>
            <span className="table-count">
              {filteredOrders.length} pedidos · {new Set(filteredOrders.map(d => d.store)).size} lojas
            </span>
          </div>

          {/* Controles: Busca e Expansão */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Input de Busca */}
            <div className="table-search-box">
              <Search size={13} style={{ opacity: 0.5, marginLeft: 8 }} />
              <input
                type="text"
                placeholder="Buscar loja, coord, distrital..."
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

            {/* Botões de Ação Rápida */}
            <div className="btn-group-sm">
              <button onClick={expandAll} className="table-action-btn" title="Expandir toda a árvore">
                <Maximize2 size={11} /> Expandir Tudo
              </button>
              <button onClick={collapseAll} className="table-action-btn" title="Recolher toda a árvore">
                <Minimize2 size={11} /> Recolher Tudo
              </button>
              <button 
                onClick={exportHierarchyToExcel} 
                className="table-action-btn" 
                style={{ 
                  color: '#107c41', 
                  borderColor: 'rgba(16, 124, 65, 0.35)', 
                  background: 'rgba(16, 124, 65, 0.08)',
                  fontWeight: 600
                }} 
                title="Baixar Hierarquia completa em Excel (.xlsx)"
              >
                <Download size={11} /> Baixar Excel (.xlsx)
              </button>
            </div>
          </div>
        </div>

        {/* Cabeçalho das Colunas */}
        <div className="hier-header-row">
          <span style={{ width: 24 }} />
          <span className="hier-col-name">Estrutura / Loja</span>
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
          <span style={{ width: 36, textAlign: 'center', fontSize: 10, color: 'var(--text-dim)' }}>Detalhe</span>
        </div>

        {/* Mensagem quando não há resultados na busca */}
        {sortedDirs.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-text">Nenhuma loja ou pedido encontrado com o termo "{searchTerm}".</div>
          </div>
        )}

        {/* Linhas da Hierarquia */}
        {sortedDirs.map(([dirKey, dirData]) => {
          const dirAgg = aggregate(dirData.orders);
          const dirOpen = openDirs.has(dirKey);
          const sortedDists = Object.entries(dirData.distritais).sort((a, b) => {
            const aggA = aggregate(a[1].orders);
            const aggB = aggregate(b[1].orders);
            return sortAsc ? aggA[sortKey] - aggB[sortKey] : aggB[sortKey] - aggA[sortKey];
          });

          // % de participação no faturamento total
          const dirPartPct = totalGeral.valor > 0 ? (dirAgg.valor / totalGeral.valor) * 100 : 0;

          return (
            <div key={dirKey} className="hier-group">
              {/* NÍVEL 0: DIRETORIA */}
              <div 
                className={`hier-row level-0 ${dirKey.toLowerCase()}`} 
                onClick={() => toggle(openDirs, setOpenDirs, dirKey)}
              >
                <span className={`hier-expand ${dirOpen ? 'open' : ''}`}>
                  {dirOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
                <span className={`dir-tag ${dirKey.toLowerCase()}`}>{dirKey}</span>
                <Building2 size={15} style={{ marginRight: 6, color: dirKey === 'C' ? 'var(--dir-c)' : 'var(--dir-l)', flexShrink: 0 }} />
                
                <div className="hier-name-box">
                  <span className="hier-main-name">Diretoria {dirNames[dirKey] || dirKey}</span>
                  <span className="hier-badge-info">
                    {Object.keys(dirData.distritais).length} distritais · {new Set(dirData.orders.map(o => o.store)).size} lojas
                  </span>
                  <div className="hier-mini-bar-bg" title={`${dirPartPct.toFixed(1)}% do total`}>
                    <div 
                      className="hier-mini-bar-fill" 
                      style={{ 
                        width: `${Math.min(100, dirPartPct)}%`,
                        background: dirKey === 'C' ? 'var(--dir-c)' : 'var(--dir-l)'
                      }} 
                    />
                  </div>
                </div>

                {COLS.map(col => (
                  <span key={col.key} className={`hier-val ${col.key === 'valor' ? 'highlight' : ''}`}>
                    {col.fmt(dirAgg[col.key])}
                  </span>
                ))}
                <span style={{ width: 36 }} />
              </div>

              {/* NÍVEL 1: DISTRITAL */}
              {dirOpen && sortedDists.map(([distName, distData]) => {
                const distAgg = aggregate(distData.orders);
                const distOpen = openDist.has(distName);
                const sortedCoords = Object.entries(distData.coordenadores).sort((a, b) => {
                  const aggA = aggregate(a[1].orders);
                  const aggB = aggregate(b[1].orders);
                  return sortAsc ? aggA[sortKey] - aggB[sortKey] : aggB[sortKey] - aggA[sortKey];
                });

                return (
                  <div key={distName}>
                    <div 
                      className="hier-row level-1" 
                      onClick={() => toggle(openDist, setOpenDist, distName)}
                    >
                      <span className={`hier-expand ${distOpen ? 'open' : ''}`}>
                        {distOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <Users size={14} style={{ marginRight: 6, opacity: 0.6, flexShrink: 0 }} />
                      <div className="hier-name-box">
                        <span className="hier-main-name">{distName}</span>
                        <span className="hier-badge-info">
                          {Object.keys(distData.coordenadores).length} coord. · {new Set(distData.orders.map(o => o.store)).size} lojas
                        </span>
                      </div>

                      {COLS.map(col => (
                        <span key={col.key} className={`hier-val ${col.key === 'valor' ? 'highlight' : ''}`}>
                          {col.fmt(distAgg[col.key])}
                        </span>
                      ))}
                      <span style={{ width: 36 }} />
                    </div>

                    {/* NÍVEL 2: COORDENADOR */}
                    {distOpen && sortedCoords.map(([coordName, coordData]) => {
                      const coordAgg = aggregate(coordData.orders);
                      const coordOpen = openCoord.has(coordName);
                      const sortedFils = Object.entries(coordData.filiais).sort((a, b) => {
                        const aggA = aggregate(a[1].orders);
                        const aggB = aggregate(b[1].orders);
                        return sortAsc ? aggA[sortKey] - aggB[sortKey] : aggB[sortKey] - aggA[sortKey];
                      });

                      return (
                        <div key={coordName}>
                          <div 
                            className="hier-row level-2" 
                            onClick={() => toggle(openCoord, setOpenCoord, coordName)}
                          >
                            <span className={`hier-expand ${coordOpen ? 'open' : ''}`}>
                              {coordOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </span>
                            <User size={13} style={{ marginRight: 6, opacity: 0.5, flexShrink: 0 }} />
                            <div className="hier-name-box">
                              <span className="hier-main-name">{coordName}</span>
                              <span className="hier-badge-info">
                                {Object.keys(coordData.filiais).length} lojas ativas
                              </span>
                            </div>

                            {COLS.map(col => (
                              <span key={col.key} className={`hier-val ${col.key === 'valor' ? 'highlight' : ''}`}>
                                {col.fmt(coordAgg[col.key])}
                              </span>
                            ))}
                            <span style={{ width: 36 }} />
                          </div>

                          {/* NÍVEL 3: FILIAL (Clicável para Raio-X) */}
                          {coordOpen && sortedFils.map(([filName, filData]) => {
                            const filAgg = aggregate(filData.orders);
                            const filInfo = filData.info || {};
                            return (
                              <div 
                                key={filName} 
                                className="hier-row level-3 interactive"
                                onClick={() => setSelectedStore(filName)}
                                title="Clique para ver o Raio-X completo desta filial"
                              >
                                <span className="hier-expand" />
                                <MapPin size={12} style={{ marginRight: 6, color: 'var(--accent)', opacity: 0.8, flexShrink: 0 }} />
                                <div className="hier-name-box">
                                  <span className="hier-main-name" style={{ color: 'var(--text)' }}>
                                    {filName}
                                  </span>
                                  {filInfo.municipio && (
                                    <span className="hier-badge-info" style={{ color: 'var(--text-dim)' }}>
                                      {filInfo.municipio} - {filInfo.uf}
                                    </span>
                                  )}
                                </div>

                                {COLS.map(col => (
                                  <span key={col.key} className={`hier-val ${col.key === 'valor' ? 'highlight' : ''}`}>
                                    {col.fmt(filAgg[col.key])}
                                  </span>
                                ))}

                                <span style={{ width: 36, textAlign: 'center' }}>
                                  <button className="row-action-btn" title="Ver Raio-X">
                                    <Eye size={12} />
                                  </button>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ─── MODAL / DRAWER LATERAL DE RAIO-X DA FILIAL ──────────────────── */}
      {selectedStore && (
        <DetailDrawer
          storeName={selectedStore}
          data={data}
          onClose={() => setSelectedStore(null)}
        />
      )}
    </div>
  );
}
