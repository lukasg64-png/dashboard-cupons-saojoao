import React, { useMemo, useState } from 'react';
import { 
  Tag, TrendingUp, BarChart3, Search, X, Layers, Store, 
  Package, DollarSign, Percent, ArrowUpDown, ChevronDown, ChevronRight 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const fmtFloat = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v || 0);
const fmtN = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v || 0);

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

export default function CouponAnalysis({ data = [] }) {
  const [rankSort, setRankSort] = useState('pedidos'); // pedidos | valor | desconto
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCoupon, setExpandedCoupon] = useState(null);

  // Agrupamento completo por Cupom
  const couponsData = useMemo(() => {
    const map = {};
    for (const order of data) {
      const c = order.coupon;
      if (!map[c]) {
        map[c] = {
          nome: c,
          pedidos: 0,
          valor: 0,
          desconto: 0,
          itens: 0,
          lojasMap: {},
          dirsC: 0,
          dirsL: 0,
          itemsMap: {},
        };
      }
      map[c].pedidos++;
      map[c].valor += order.value;
      map[c].desconto += order.totalDiscount;
      map[c].itens += order.itemsCount;
      if (order.diretoria === 'C') map[c].dirsC++;
      else if (order.diretoria === 'L') map[c].dirsL++;

      // Agrupar lojas por este cupom
      const st = order.store || 'Loja Desconhecida';
      if (!map[c].lojasMap[st]) {
        map[c].lojasMap[st] = {
          store: st,
          diretoria: order.diretoria,
          distrital: order.distrital,
          coordenador: order.coordenador,
          pedidos: 0,
          valor: 0,
          desconto: 0,
        };
      }
      map[c].lojasMap[st].pedidos++;
      map[c].lojasMap[st].valor += order.value;
      map[c].lojasMap[st].desconto += order.totalDiscount;

      // Agrupar itens por este cupom
      for (const item of (order.items || [])) {
        const iKey = item.name || 'Sem nome';
        if (!map[c].itemsMap[iKey]) {
          map[c].itemsMap[iKey] = {
            name: iKey,
            group: item.group,
            category: item.category,
            quantity: 0,
            revenue: 0,
            discount: 0,
          };
        }
        map[c].itemsMap[iKey].quantity += item.quantity;
        map[c].itemsMap[iKey].revenue += item.sellingPrice * item.quantity;
        map[c].itemsMap[iKey].discount += item.discount * item.quantity;
      }
    }

    return Object.values(map).map(v => ({
      ...v,
      ticket: v.pedidos > 0 ? v.valor / v.pedidos : 0,
      descontoPct: v.valor > 0 ? (v.desconto / v.valor) * 100 : 0,
      lojasCount: Object.keys(v.lojasMap).length,
      topLojas: Object.values(v.lojasMap).sort((a, b) => b.valor - a.valor),
      topItems: Object.values(v.itemsMap).sort((a, b) => b.revenue - a.revenue),
    }));
  }, [data]);

  // Filtragem por busca
  const filteredCoupons = useMemo(() => {
    let list = couponsData;
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(c => c.nome.toLowerCase().includes(t));
    }
    return list.sort((a, b) => b[rankSort] - a[rankSort]);
  }, [couponsData, searchTerm, rankSort]);

  // Evolução diária
  const evolucao = useMemo(() => {
    const daily = {};
    for (const order of data) {
      if (!daily[order.date]) daily[order.date] = { date: order.date, pedidos: 0, valor: 0, dirC: 0, dirL: 0 };
      daily[order.date].pedidos++;
      daily[order.date].valor += order.value;
      if (order.diretoria === 'C') daily[order.date].dirC++;
      else daily[order.date].dirL++;
    }
    return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Distribuição de desconto
  const distDesc = useMemo(() => {
    const faixas = [
      { label: '0-5%', min: 0, max: 5, count: 0, valor: 0 },
      { label: '5-10%', min: 5, max: 10, count: 0, valor: 0 },
      { label: '10-20%', min: 10, max: 20, count: 0, valor: 0 },
      { label: '20-50%', min: 20, max: 50, count: 0, valor: 0 },
      { label: '50%+', min: 50, max: 999, count: 0, valor: 0 },
    ];
    for (const order of data) {
      const pct = order.discountPct || 0;
      for (const f of faixas) {
        if (pct >= f.min && pct < f.max) {
          f.count++;
          f.valor += order.value;
          break;
        }
      }
    }
    return faixas;
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏷️</div>
        <div className="empty-state-text">Nenhum cupom encontrado para o período selecionado.</div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* ─── CHARTS ROW ─────────────────────────────────────────────────── */}
      <div className="charts-row">
        {/* Evolução Diária */}
        <div className="chart-card">
          <div className="chart-title">
            <TrendingUp size={16} className="chart-title-icon" />
            Evolução Diária de Cupons (Cintia vs Laerti)
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={evolucao}>
              <defs>
                <linearGradient id="gradC2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0066cc" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#0066cc" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradL2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34c759" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#34c759" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#86868b' }} tickFormatter={v => v.slice(5).replace('-', '/')} stroke="#e0e0e0" />
              <YAxis tick={{ fontSize: 11, fill: '#86868b' }} stroke="#e0e0e0" />
              <Tooltip {...chartTooltipStyle} formatter={(v, name) => [fmtN(v), name === 'dirC' ? 'Cintia' : name === 'dirL' ? 'Laerti' : 'Total']} />
              <Area type="monotone" dataKey="dirC" stroke="#0066cc" fill="url(#gradC2)" name="dirC" strokeWidth={2} />
              <Area type="monotone" dataKey="dirL" stroke="#34c759" fill="url(#gradL2)" name="dirL" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Distribuição de Faixas de Desconto */}
        <div className="chart-card">
          <div className="chart-title">
            <BarChart3 size={16} className="chart-title-icon" />
            Faixas de Desconto Aplicadas
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={distDesc}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#1d1d1f' }} stroke="#e0e0e0" />
              <YAxis tick={{ fontSize: 11, fill: '#86868b' }} stroke="#e0e0e0" />
              <Tooltip {...chartTooltipStyle} formatter={(v, name) => [name === 'count' ? `${fmtN(v)} pedidos` : fmt(v), name === 'count' ? 'Pedidos' : 'Valor Total']} />
              <Bar dataKey="count" fill="#0066cc" radius={[4, 4, 0, 0]} name="count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── TABELA DE CUPONS COM RAIO-X EXPANSÍVEL ─────────────────────── */}
      <div className="table-card">
        <div className="table-header-rich">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="table-title" style={{ marginBottom: 0 }}>
              <Tag size={17} />
              Ranking e Detalhamento de Cupons
            </div>
            <span className="table-count">{filteredCoupons.length} cupons únicos</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="table-search-box">
              <Search size={13} style={{ opacity: 0.5, marginLeft: 8 }} />
              <input
                type="text"
                placeholder="Buscar código do cupom..."
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

            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Ordenar:</span>
              {[
                { key: 'pedidos', label: 'Pedidos' },
                { key: 'valor', label: 'Faturamento' },
                { key: 'desconto', label: 'Desconto' },
              ].map(s => (
                <button
                  key={s.key}
                  className={`date-btn ${rankSort === s.key ? 'active' : ''}`}
                  onClick={() => setRankSort(s.key)}
                  style={{ padding: '4px 8px', fontSize: 11 }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th style={{ width: 40 }}>#</th>
                <th>Cupom</th>
                <th className="num">Pedidos</th>
                <th className="num">Faturamento</th>
                <th className="num">Ticket Médio</th>
                <th className="num">Desconto Total</th>
                <th className="num">% Desc.</th>
                <th className="num">Itens</th>
                <th className="num">Lojas</th>
                <th>Split Diretoria</th>
              </tr>
            </thead>
            <tbody>
              {filteredCoupons.map((c, i) => {
                const isExpanded = expandedCoupon === c.nome;
                return (
                  <React.Fragment key={c.nome}>
                    <tr 
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedCoupon(isExpanded ? null : c.nome)}
                    >
                      <td style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '8px 4px' }}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td style={{ color: 'var(--text-dim)' }}>{i + 1}</td>
                      <td>
                        <span className="coupon-badge" style={{ fontSize: 12 }}>
                          {c.nome}
                        </span>
                      </td>
                      <td className="num">{fmtN(c.pedidos)}</td>
                      <td className="currency" style={{ color: 'var(--text)' }}>{fmt(c.valor)}</td>
                      <td className="num">{fmt(c.ticket)}</td>
                      <td className="num" style={{ color: 'var(--danger)' }}>{fmt(c.desconto)}</td>
                      <td className="num">{c.descontoPct.toFixed(1)}%</td>
                      <td className="num">{fmtN(c.itens)}</td>
                      <td className="num">{fmtN(c.lojasCount)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {c.dirsC > 0 && <span className="kpi-dir-tag c" style={{ fontSize: 10 }}>C: {fmtN(c.dirsC)}</span>}
                          {c.dirsL > 0 && <span className="kpi-dir-tag l" style={{ fontSize: 10 }}>L: {fmtN(c.dirsL)}</span>}
                        </div>
                      </td>
                    </tr>

                    {/* Linha de Detalhamento do Cupom (quando expandido) */}
                    {isExpanded && (
                      <tr className="coupon-expanded-row">
                        <td colSpan={11} style={{ padding: '16px 20px', background: 'rgba(15, 23, 42, 0.7)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            {/* Top Lojas que mais usaram */}
                            <div className="expanded-subcard">
                              <div className="expanded-subcard-title">
                                <Store size={14} /> Top Lojas com o cupom {c.nome}
                              </div>
                              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                                {c.topLojas.slice(0, 10).map((l, idx) => (
                                  <div key={idx} className="expanded-list-item">
                                    <div>
                                      <span className={`dir-tag ${l.diretoria?.toLowerCase() || 'c'}`} style={{ fontSize: 9 }}>{l.diretoria}</span>
                                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{l.store}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-bright)' }}>{fmt(l.valor)}</span>
                                      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>({l.pedidos} ped.)</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Top Itens comprados com o cupom */}
                            <div className="expanded-subcard">
                              <div className="expanded-subcard-title">
                                <Package size={14} /> Top Itens com o cupom {c.nome}
                              </div>
                              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                                {c.topItems.slice(0, 10).map((it, idx) => (
                                  <div key={idx} className="expanded-list-item">
                                    <div style={{ maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.name}>
                                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{it.name}</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>{fmt(it.revenue)}</span>
                                      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>({it.quantity} un.)</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
