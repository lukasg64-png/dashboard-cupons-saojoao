import React from 'react';
import { Tag, DollarSign, ShoppingBag, Hash, Percent, Store } from 'lucide-react';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const fmtN = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v || 0);

export default function KPICards({ data = [], loading = false }) {
  if (loading) return null;

  const total = data.length;
  const valor = data.reduce((s, d) => s + d.value, 0);
  const itens = data.reduce((s, d) => s + d.itemsCount, 0);
  const desconto = data.reduce((s, d) => s + d.totalDiscount, 0);
  const cuponsUnicos = new Set(data.map(d => d.coupon)).size;
  const ticket = total > 0 ? valor / total : 0;
  const descontoPct = valor > 0 ? (desconto / valor) * 100 : 0;

  const dirC = data.filter(d => d.diretoria === 'C');
  const dirL = data.filter(d => d.diretoria === 'L');

  const cards = [
    {
      icon: <ShoppingBag size={18} />, iconClass: 'purple',
      value: fmtN(total), label: 'Pedidos com Cupom',
      sub: `${fmtN(dirC.length)} Cintia · ${fmtN(dirL.length)} Laerti`,
      dirC: dirC.length, dirL: dirL.length,
    },
    {
      icon: <DollarSign size={18} />, iconClass: 'green',
      value: fmt(valor), label: 'Faturamento com Cupom',
      sub: `${fmt(dirC.reduce((s, d) => s + d.value, 0))} C · ${fmt(dirL.reduce((s, d) => s + d.value, 0))} L`,
    },
    {
      icon: <Tag size={18} />, iconClass: 'yellow',
      value: fmt(ticket), label: 'Ticket Médio',
      sub: `${fmtN(itens)} itens vendidos`,
    },
    {
      icon: <Percent size={18} />, iconClass: 'red',
      value: `${descontoPct.toFixed(1)}%`, label: 'Desconto Médio',
      sub: `${fmt(desconto)} em descontos`,
    },
    {
      icon: <Hash size={18} />, iconClass: 'blue',
      value: fmtN(cuponsUnicos), label: 'Cupons Únicos',
      sub: `${fmtN(new Set(data.map(d => d.store)).size)} lojas atendidas`,
    },
  ];

  return (
    <div className="kpi-grid fade-in">
      {cards.map((card, i) => (
        <div className="kpi-card" key={i}>
          <div className={`kpi-icon ${card.iconClass}`}>{card.icon}</div>
          <div className="kpi-value">{card.value}</div>
          <div className="kpi-label">{card.label}</div>
          {card.sub && <div className="kpi-sub">{card.sub}</div>}
          {card.dirC !== undefined && (
            <div className="kpi-dir-split">
              <span className="kpi-dir-tag c">C {fmtN(card.dirC)}</span>
              <span className="kpi-dir-tag l">L {fmtN(card.dirL)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
