import React, { useMemo } from 'react';
import { X, Store, Tag, ShoppingBag, DollarSign, Percent, MapPin, User, Users, Package, Calendar } from 'lucide-react';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v || 0);
const fmtInt = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v || 0);

export default function DetailDrawer({ storeName, data = [], onClose }) {
  if (!storeName) return null;

  // Filtrar todos os pedidos da loja selecionada
  const storeOrders = useMemo(() => {
    return data.filter(o => o.store === storeName);
  }, [data, storeName]);

  const storeInfo = useMemo(() => {
    if (storeOrders.length === 0) return { name: storeName };
    const first = storeOrders[0];
    return {
      name: storeName,
      diretoria: first.diretoria,
      distrital: first.distrital,
      coordenador: first.coordenador,
      municipio: first.municipio,
      uf: first.uf,
    };
  }, [storeOrders, storeName]);

  // Estatísticas agregadas da loja
  const stats = useMemo(() => {
    const pedidos = storeOrders.length;
    const valor = storeOrders.reduce((s, o) => s + o.value, 0);
    const itens = storeOrders.reduce((s, o) => s + o.itemsCount, 0);
    const desconto = storeOrders.reduce((s, o) => s + o.totalDiscount, 0);
    const ticket = pedidos > 0 ? valor / pedidos : 0;
    const descontoPct = valor > 0 ? (desconto / valor) * 100 : 0;

    // Cupons usados na loja
    const couponMap = {};
    for (const o of storeOrders) {
      const c = o.coupon;
      if (!couponMap[c]) couponMap[c] = { coupon: c, pedidos: 0, valor: 0, desconto: 0 };
      couponMap[c].pedidos++;
      couponMap[c].valor += o.value;
      couponMap[c].desconto += o.totalDiscount;
    }
    const topCoupons = Object.values(couponMap).sort((a, b) => b.pedidos - a.pedidos);

    // Itens vendidos na loja
    const itemMap = {};
    for (const o of storeOrders) {
      for (const it of (o.items || [])) {
        const key = it.name || 'Sem nome';
        if (!itemMap[key]) {
          itemMap[key] = {
            name: key,
            group: it.group,
            category: it.category,
            quantity: 0,
            price: it.price,
            sellingPrice: it.sellingPrice,
            discountTotal: 0,
            revenueTotal: 0,
          };
        }
        itemMap[key].quantity += it.quantity;
        itemMap[key].revenueTotal += it.sellingPrice * it.quantity;
        itemMap[key].discountTotal += it.discount * it.quantity;
      }
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.revenueTotal - a.revenueTotal);

    return {
      pedidos,
      valor,
      itens,
      desconto,
      ticket,
      descontoPct,
      topCoupons,
      topItems,
    };
  }, [storeOrders]);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-container fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className={`drawer-badge ${storeInfo.diretoria?.toLowerCase() || 'c'}`}>
              <Store size={18} />
            </div>
            <div>
              <div className="drawer-title">{storeInfo.name}</div>
              <div className="drawer-sub">
                {storeInfo.diretoria && (
                  <span className={`dir-tag ${storeInfo.diretoria.toLowerCase()}`} style={{ marginRight: 6 }}>
                    Diretoria {storeInfo.diretoria === 'C' ? 'Cintia' : 'Laerti'}
                  </span>
                )}
                {storeInfo.municipio && <span>{storeInfo.municipio} - {storeInfo.uf} · </span>}
                <span>Distrital: {storeInfo.distrital || 'N/A'} · Coord: {storeInfo.coordenador || 'N/A'}</span>
              </div>
            </div>
          </div>
          <button className="drawer-close-btn" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="drawer-body">
          {/* KPI Mini-grid */}
          <div className="drawer-kpi-grid">
            <div className="drawer-kpi-card">
              <div className="drawer-kpi-label">Pedidos com Cupom</div>
              <div className="drawer-kpi-val">{fmtInt(stats.pedidos)}</div>
              <div className="drawer-kpi-sub">{fmtInt(stats.itens)} itens comprados</div>
            </div>
            <div className="drawer-kpi-card highlight">
              <div className="drawer-kpi-label">Faturamento com Cupom</div>
              <div className="drawer-kpi-val">{fmt(stats.valor)}</div>
              <div className="drawer-kpi-sub">Ticket Médio: {fmt(stats.ticket)}</div>
            </div>
            <div className="drawer-kpi-card">
              <div className="drawer-kpi-label">Descontos Concedidos</div>
              <div className="drawer-kpi-val" style={{ color: 'var(--danger)' }}>{fmt(stats.desconto)}</div>
              <div className="drawer-kpi-sub">{stats.descontoPct.toFixed(1)}% do faturamento</div>
            </div>
            <div className="drawer-kpi-card">
              <div className="drawer-kpi-label">Cupons Diferentes</div>
              <div className="drawer-kpi-val">{stats.topCoupons.length}</div>
              <div className="drawer-kpi-sub">Top: {stats.topCoupons[0]?.coupon || 'Nenhum'}</div>
            </div>
          </div>

          {/* Seção Cupons Utilizados */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Tag size={15} /> Cupons Utilizados na Filial ({stats.topCoupons.length})
            </div>
            <div className="drawer-coupons-list">
              {stats.topCoupons.map((c, i) => (
                <div key={i} className="drawer-coupon-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="coupon-badge">{c.coupon}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.pedidos} pedidos</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmt(c.valor)}</div>
                    <div style={{ fontSize: 11, color: 'var(--danger)' }}>-{fmt(c.desconto)} desc.</div>
                  </div>
                </div>
              ))}
              {stats.topCoupons.length === 0 && (
                <div className="drawer-empty-msg">Nenhum cupom registrado nesta filial.</div>
              )}
            </div>
          </div>

          {/* Seção Produtos Comprados com Cupom */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Package size={15} /> Itens Comprados com Cupom ({stats.topItems.length})
            </div>
            <div className="drawer-table-wrapper">
              <table className="drawer-table">
                <thead>
                  <tr>
                    <th>Produto / Categoria</th>
                    <th className="num">Qtd</th>
                    <th className="num">Preço Unit.</th>
                    <th className="num">Venda Total</th>
                    <th className="num">Desconto Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topItems.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <div className="drawer-item-name" title={item.name}>{item.name}</div>
                        <div className="drawer-item-cat">{item.group} &rsaquo; {item.category}</div>
                      </td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">
                        {fmt(item.sellingPrice)}
                        {item.price > item.sellingPrice && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', textDecoration: 'line-through' }}>
                            {fmt(item.price)}
                          </div>
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 600, color: 'var(--accent-bright)' }}>{fmt(item.revenueTotal)}</td>
                      <td className="num" style={{ color: 'var(--danger)' }}>-{fmt(item.discountTotal)}</td>
                    </tr>
                  ))}
                  {stats.topItems.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>
                        Nenhum item registrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lista de Pedidos Recentes */}
          <div className="drawer-section">
            <div className="drawer-section-title">
              <Calendar size={15} /> Pedidos com Cupom ({storeOrders.length})
            </div>
            <div className="drawer-orders-list">
              {storeOrders.slice(0, 30).map((ord, idx) => (
                <div key={idx} className="drawer-order-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>#{ord.orderId}</div>
                    <span className="coupon-badge" style={{ fontSize: 10 }}>{ord.coupon}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{ord.date}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ord.itemsCount} itens</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>{fmt(ord.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
