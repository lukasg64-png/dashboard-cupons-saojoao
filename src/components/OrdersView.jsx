import React, { useState, useMemo } from 'react';
import { 
  ShoppingCart, Search, X, ChevronDown, ChevronRight, Calendar, 
  Clock, MapPin, Store, Tag, DollarSign, Package, Percent, Download, 
  ArrowUpDown, ExternalLink, User, Users, Check
} from 'lucide-react';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v || 0);
const fmtInt = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v || 0);

export default function OrdersView({ data = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('datetime'); // 'datetime' | 'value' | 'items' | 'discount'
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState(null);
  const pageSize = 25;

  // Toggle order expansion
  const toggleOrder = (orderId) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedOrders(new Set(paginatedOrders.map(o => o.orderId)));
  };

  const collapseAll = () => {
    setExpandedOrders(new Set());
  };

  // Copy order ID helper
  const handleCopyId = (e, orderId) => {
    e.stopPropagation();
    navigator.clipboard.writeText(orderId);
    setCopiedId(orderId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtragem
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    return data.filter(order => {
      const mId = (order.orderId || '').toLowerCase().includes(term);
      const mStore = (order.store || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
      const mCoord = (order.coordenador || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
      const mDist = (order.distrital || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
      const mMun = (order.municipio || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
      const mCupom = (order.coupon || '').toLowerCase().includes(term);
      
      // Busca em itens dentro da cesta
      const mItem = (order.items || []).some(it => 
        (it.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term) ||
        (it.category || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term) ||
        (it.brandName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)
      );

      return mId || mStore || mCoord || mDist || mMun || mCupom || mItem;
    });
  }, [data, searchTerm]);

  // Ordenação
  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      let valA, valB;
      if (sortField === 'datetime') {
        valA = a.creationDate || a.date;
        valB = b.creationDate || b.date;
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortField === 'value') {
        valA = a.value || 0;
        valB = b.value || 0;
      } else if (sortField === 'items') {
        valA = a.itemsCount || 0;
        valB = b.itemsCount || 0;
      } else if (sortField === 'discount') {
        valA = a.totalDiscount || 0;
        valB = b.totalDiscount || 0;
      }
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [filteredOrders, sortField, sortAsc]);

  // Paginação
  const totalPages = Math.ceil(sortedOrders.length / pageSize) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedOrders.slice(start, start + pageSize);
  }, [sortedOrders, currentPage]);

  // Reset page when search or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, data]);

  // KPIs da tela de Pedidos
  const stats = useMemo(() => {
    const totalPeds = filteredOrders.length;
    const totalVal = filteredOrders.reduce((s, o) => s + (o.value || 0), 0);
    const totalDesc = filteredOrders.reduce((s, o) => s + (o.totalDiscount || 0), 0);
    const totalItens = filteredOrders.reduce((s, o) => s + (o.itemsCount || 0), 0);
    const avgTicket = totalPeds > 0 ? totalVal / totalPeds : 0;
    const avgBasket = totalPeds > 0 ? totalItens / totalPeds : 0;
    const avgDescPct = totalVal > 0 ? (totalDesc / totalVal) * 100 : 0;

    return { totalPeds, totalVal, totalDesc, totalItens, avgTicket, avgBasket, avgDescPct };
  }, [filteredOrders]);

  // Exportar CSV
  const handleExportCSV = () => {
    const rows = [
      ['ID Pedido', 'Data', 'Hora', 'Diretoria', 'Distrital', 'Coordenador', 'Filial', 'Municipio', 'UF', 'Cupom', 'Valor Pedido (R$)', 'Desconto (R$)', 'Qtd Itens', 'Itens na Cesta']
    ];

    filteredOrders.forEach(o => {
      const itemsSummary = (o.items || []).map(it => `${it.quantity}x ${it.name} (${it.group})`).join(' | ');
      rows.push([
        o.orderId,
        o.date,
        o.time || o.hour || '',
        o.diretoria,
        o.distrital,
        o.coordenador,
        o.store,
        o.municipio,
        o.uf,
        o.coupon,
        o.value.toFixed(2),
        o.totalDiscount.toFixed(2),
        o.itemsCount,
        itemsSummary,
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pedidos_cupons_sao_joao_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fade-in">
      {/* ─── KPIS DE PEDIDOS E CESTAS ─────────────────────────────────────── */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon purple">
            <ShoppingCart size={18} />
          </div>
          <div className="kpi-value">{fmtInt(stats.totalPeds)}</div>
          <div className="kpi-label">Pedidos com Cupom</div>
          <div className="kpi-sub">{fmtInt(stats.totalItens)} produtos vendidos</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon blue">
            <DollarSign size={18} />
          </div>
          <div className="kpi-value">{fmt(stats.totalVal)}</div>
          <div className="kpi-label">Faturamento Total</div>
          <div className="kpi-sub">Ticket Médio: {fmt(stats.avgTicket)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon yellow">
            <Package size={18} />
          </div>
          <div className="kpi-value">{stats.avgBasket.toFixed(1)} un.</div>
          <div className="kpi-label">Cesta Média por Pedido</div>
          <div className="kpi-sub">Média de itens por carrinho</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon red">
            <Percent size={18} />
          </div>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{fmt(stats.totalDesc)}</div>
          <div className="kpi-label">Descontos Concedidos</div>
          <div className="kpi-sub">{stats.avgDescPct.toFixed(1)}% do faturamento total</div>
        </div>
      </div>

      {/* ─── TABELA DE PEDIDOS COM CESTA EXPANSÍVEL ──────────────────────── */}
      <div className="table-card">
        <div className="table-header-rich">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="table-title" style={{ marginBottom: 0 }}>
              <ShoppingCart size={17} />
              Cestas e Pedidos com Cupom
            </div>
            <span className="table-count">
              {filteredOrders.length} pedidos encontrados
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Campo de Busca Geral do Pedido / Cesta */}
            <div className="table-search-box">
              <Search size={13} style={{ opacity: 0.5, marginLeft: 8 }} />
              <input
                type="text"
                placeholder="Buscar pedido, loja, produto, cupom..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="table-search-input"
                style={{ minWidth: 260 }}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="table-search-clear">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Ordenação */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--ink-muted-48)' }}>Ordenar:</span>
              {[
                { key: 'datetime', label: 'Mais Recentes' },
                { key: 'value', label: 'Maior Valor' },
                { key: 'items', label: 'Mais Itens' },
                { key: 'discount', label: 'Maior Desconto' },
              ].map(s => (
                <button
                  key={s.key}
                  className={`date-btn ${sortField === s.key ? 'active' : ''}`}
                  onClick={() => {
                    if (sortField === s.key) setSortAsc(!sortAsc);
                    else { setSortField(s.key); setSortAsc(false); }
                  }}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                >
                  {s.label} {sortField === s.key ? (sortAsc ? '↑' : '↓') : ''}
                </button>
              ))}
            </div>

            {/* Botões de Ação */}
            <div className="btn-group-sm">
              <button onClick={expandAll} className="table-action-btn" title="Expandir todas as cestas">
                Expandir Cestas
              </button>
              <button onClick={collapseAll} className="table-action-btn" title="Recolher todas as cestas">
                Recolher
              </button>
              <button onClick={handleExportCSV} className="filter-btn" style={{ padding: '6px 12px', fontSize: 11 }}>
                <Download size={12} /> Exportar CSV
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Pedidos */}
        {sortedOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🛒</div>
            <div className="empty-state-text">Nenhum pedido encontrado com os filtros aplicados.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table className="data-table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}></th>
                  <th style={{ width: 140 }}>ID Pedido</th>
                  <th style={{ width: 130 }}>Data / Horário (BRT)</th>
                  <th style={{ width: 180 }}>Diretoria / Loja</th>
                  <th style={{ minWidth: 160 }}>Localização / Coordenação</th>
                  <th style={{ width: 110 }}>Cupom</th>
                  <th className="num" style={{ width: 90 }}>Qtd. Itens</th>
                  <th className="num" style={{ width: 110 }}>Valor Pedido</th>
                  <th className="num" style={{ width: 100 }}>Desconto</th>
                  <th className="num" style={{ width: 80 }}>% Desc.</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.map(order => {
                  const isExpanded = expandedOrders.has(order.orderId);
                  const isCopied = copiedId === order.orderId;
                  const dateFormatted = order.date ? `${order.date.slice(8,10)}/${order.date.slice(5,7)}/${order.date.slice(0,4)}` : 'N/A';

                  return (
                    <React.Fragment key={order.orderId}>
                      {/* Linha do Pedido */}
                      <tr 
                        style={{ cursor: 'pointer', background: isExpanded ? 'rgba(0, 102, 204, 0.04)' : 'transparent' }}
                        onClick={() => toggleOrder(order.orderId)}
                      >
                        <td style={{ textAlign: 'center', color: 'var(--ink-muted-48)', padding: '10px 4px' }}>
                          {isExpanded ? <ChevronDown size={15} color="var(--primary)" /> : <ChevronRight size={15} />}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink)', fontFamily: 'monospace', fontSize: 12 }}>
                              #{order.orderId}
                            </span>
                            <button
                              onClick={(e) => handleCopyId(e, order.orderId)}
                              className="row-action-btn"
                              title="Copiar ID do Pedido"
                              style={{ padding: 2 }}
                            >
                              {isCopied ? <Check size={11} color="var(--dir-l)" /> : <ExternalLink size={11} />}
                            </button>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{dateFormatted}</span>
                            <span style={{ fontSize: 11, color: 'var(--ink-muted-48)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Clock size={10} /> {order.time || `${order.hour}h00`} (BRT)
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={`dir-tag ${order.diretoria?.toLowerCase() || 'c'}`}>
                              {order.diretoria}
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{order.store}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {order.municipio && (
                              <span style={{ fontSize: 12, color: 'var(--ink)' }}>
                                {order.municipio} - {order.uf}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: 'var(--ink-muted-48)' }}>
                              Coord: {order.coordenador || 'N/A'} · Dist: {order.distrital || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="coupon-badge" style={{ fontSize: 11 }}>
                            {order.coupon}
                          </span>
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>{order.itemsCount} un.</td>
                        <td className="currency" style={{ color: 'var(--primary)' }}>{fmt(order.value)}</td>
                        <td className="num" style={{ color: 'var(--danger)', fontWeight: 600 }}>-{fmt(order.totalDiscount)}</td>
                        <td className="num">{order.discountPct.toFixed(1)}%</td>
                      </tr>

                      {/* ── Cesta de Produtos do Pedido (quando expandido) ── */}
                      {isExpanded && (
                        <tr className="coupon-expanded-row">
                          <td colSpan={10} style={{ padding: '14px 16px', background: 'var(--surface-pearl)' }}>
                            <div className="basket-card">
                              <div className="basket-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <Package size={16} color="var(--primary)" />
                                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
                                    Itens na Cesta do Pedido #{order.orderId}
                                  </span>
                                  <span style={{ fontSize: 12, color: 'var(--ink-muted-48)' }}>
                                    ({(order.items || []).length} produtos diferentes · {order.itemsCount} unidades totais)
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--ink-muted-48)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  Cupom Aplicado: <span className="coupon-badge" style={{ fontSize: 11 }}>{order.coupon}</span>
                                </div>
                              </div>

                              <div className="basket-table-wrapper">
                                <table className="basket-table" style={{ minWidth: 780 }}>
                                  <thead>
                                    <tr>
                                      <th style={{ minWidth: 240, maxWidth: 340 }}>Produto</th>
                                      <th style={{ minWidth: 160 }}>Grupo &rsaquo; Categoria</th>
                                      <th className="num" style={{ minWidth: 50 }}>Qtd</th>
                                      <th className="num" style={{ minWidth: 90 }}>Preço Tabela</th>
                                      <th className="num" style={{ minWidth: 90 }}>Preço Pago</th>
                                      <th className="num" style={{ minWidth: 110 }}>Desconto Unit.</th>
                                      <th className="num" style={{ minWidth: 100 }}>Subtotal Item</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(order.items || []).map((it, iIdx) => {
                                      const subtotal = it.sellingPrice * it.quantity;
                                      return (
                                        <tr key={iIdx}>
                                          <td style={{ whiteSpace: 'normal', maxWidth: 340 }}>
                                            <div style={{ fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35, wordBreak: 'break-word' }} title={it.name}>
                                              {it.name}
                                            </div>
                                            {it.brandName && (
                                              <div style={{ fontSize: 11, color: 'var(--ink-muted-48)', marginTop: 3 }}>
                                                Marca: {it.brandName}
                                              </div>
                                            )}
                                          </td>
                                          <td>
                                            <span style={{ fontSize: 12, color: 'var(--ink-muted-80)' }}>
                                              {it.group} &rsaquo; {it.category}
                                            </span>
                                          </td>
                                          <td className="num" style={{ fontWeight: 600 }}>{it.quantity}</td>
                                          <td className="num" style={{ color: 'var(--ink-muted-48)', textDecoration: it.price > it.sellingPrice ? 'line-through' : 'none' }}>
                                            {fmt(it.price)}
                                          </td>
                                          <td className="num" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                            {fmt(it.sellingPrice)}
                                          </td>
                                          <td className="num" style={{ color: 'var(--danger)' }}>
                                            {it.discount > 0 ? `-${fmt(it.discount)} (${it.discountPct.toFixed(0)}%)` : 'R$ 0,00'}
                                          </td>
                                          <td className="num" style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                            {fmt(subtotal)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    {(order.items || []).length === 0 && (
                                      <tr>
                                        <td colSpan={7} style={{ textAlign: 'center', padding: '16px', color: 'var(--ink-muted-48)' }}>
                                          Detalhes dos itens não disponíveis para este pedido no cache.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
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
        )}

        {/* ─── CONTROLE DE PAGINAÇÃO ───────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--hairline)', background: 'var(--surface-pearl)' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-muted-48)' }}>
            Mostrando <strong>{Math.min(filteredOrders.length, (currentPage - 1) * pageSize + 1)}</strong> - <strong>{Math.min(filteredOrders.length, currentPage * pageSize)}</strong> de <strong>{filteredOrders.length}</strong> pedidos
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="date-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              style={{ opacity: currentPage <= 1 ? 0.4 : 1 }}
            >
              &larr; Anterior
            </button>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', padding: '0 6px' }}>
              Página {currentPage} de {totalPages}
            </span>
            <button
              className="date-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              style={{ opacity: currentPage >= totalPages ? 0.4 : 1 }}
            >
              Próxima &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
