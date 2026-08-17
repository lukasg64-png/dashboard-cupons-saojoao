import React from 'react';
import { Filter, RefreshCw, X } from 'lucide-react';

const DATE_MODES = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '3d', label: '3 dias' },
  { key: '7d', label: '7 dias' },
  { key: '15d', label: '15 dias' },
];

export default function FilterBar({
  filters,
  setFilter,
  options = {},
  relations = {},
  onRefresh,
  refreshing = false,
}) {
  const { 
    diretoria, distrital, coordenador, filial, cupom, dateMode,
    grupo = 'all', categoria = 'all', item = 'all'
  } = filters;

  // Cascade: filtrar opções hierárquicas de acordo com seleção superior
  let distritaisOpts = options.distritais || [];
  let coordOpts = options.coordenadores || [];
  let filiaisOpts = options.filiais || [];

  if (diretoria && diretoria !== 'all' && relations.diretorias?.[diretoria]) {
    distritaisOpts = relations.diretorias[diretoria].distritais || [];
  }
  if (distrital && distrital !== 'all' && relations.distritais?.[distrital]) {
    coordOpts = relations.distritais[distrital].coordenadores || [];
  }
  if (coordenador && coordenador !== 'all' && relations.coordenadores?.[coordenador]) {
    filiaisOpts = relations.coordenadores[coordenador].filiais || [];
  }

  // Cascade: filtrar opções de produtos
  let categoriasOpts = options.categorias || [];
  let itensOpts = options.itens || [];

  if (grupo && grupo !== 'all' && relations.grupoCategorias?.[grupo]) {
    categoriasOpts = relations.grupoCategorias[grupo] || [];
  }
  if (categoria && categoria !== 'all' && relations.categoriaItens?.[categoria]) {
    itensOpts = relations.categoriaItens[categoria] || [];
  }

  const hasActiveFilters = diretoria !== 'all' || distrital !== 'all' || coordenador !== 'all' || 
    filial !== 'all' || cupom !== 'all' || grupo !== 'all' || categoria !== 'all' || item !== 'all';

  const clearAllFilters = () => {
    setFilter('diretoria', 'all');
    setFilter('distrital', 'all');
    setFilter('coordenador', 'all');
    setFilter('filial', 'all');
    setFilter('cupom', 'all');
    setFilter('grupo', 'all');
    setFilter('categoria', 'all');
    setFilter('item', 'all');
  };

  return (
    <div className="filter-bar fade-in">
      {/* ─── LINHA 1: PERÍODO E HIERARQUIA ──────────────────────────────── */}
      {/* Período */}
      <div className="filter-group">
        <span className="filter-label">Período</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {DATE_MODES.map(dm => (
            <button
              key={dm.key}
              className={`date-btn ${dateMode === dm.key ? 'active' : ''}`}
              onClick={() => setFilter('dateMode', dm.key)}
            >
              {dm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Diretoria */}
      <div className="filter-group">
        <span className="filter-label">Diretoria</span>
        <select
          className="filter-select"
          value={diretoria}
          onChange={e => {
            setFilter('diretoria', e.target.value);
            setFilter('distrital', 'all');
            setFilter('coordenador', 'all');
            setFilter('filial', 'all');
          }}
          style={{ minWidth: 120 }}
        >
          <option value="all">Todas</option>
          <option value="C">Cintia (C)</option>
          <option value="L">Laerti (L)</option>
        </select>
      </div>

      {/* Distrital */}
      <div className="filter-group">
        <span className="filter-label">Distrital</span>
        <select
          className="filter-select"
          value={distrital}
          onChange={e => {
            setFilter('distrital', e.target.value);
            setFilter('coordenador', 'all');
            setFilter('filial', 'all');
          }}
          style={{ minWidth: 130 }}
        >
          <option value="all">Todas</option>
          {distritaisOpts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Coordenador */}
      <div className="filter-group">
        <span className="filter-label">Coordenador</span>
        <select
          className="filter-select"
          value={coordenador}
          onChange={e => {
            setFilter('coordenador', e.target.value);
            setFilter('filial', 'all');
          }}
          style={{ minWidth: 130 }}
        >
          <option value="all">Todos</option>
          {coordOpts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Filial */}
      <div className="filter-group">
        <span className="filter-label">Filial</span>
        <select
          className="filter-select"
          value={filial}
          onChange={e => setFilter('filial', e.target.value)}
          style={{ minWidth: 140 }}
        >
          <option value="all">Todas</option>
          {filiaisOpts.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Cupom */}
      <div className="filter-group">
        <span className="filter-label">Cupom</span>
        <select
          className="filter-select"
          value={cupom}
          onChange={e => setFilter('cupom', e.target.value)}
          style={{ minWidth: 120 }}
        >
          <option value="all">Todos</option>
          {(options.cupons || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* ─── FILTROS DE PRODUTO: GRUPO, CATEGORIA E ITEM ────────────────── */}
      {/* Grupo */}
      <div className="filter-group">
        <span className="filter-label">Grupo</span>
        <select
          className="filter-select"
          value={grupo}
          onChange={e => {
            setFilter('grupo', e.target.value);
            setFilter('categoria', 'all');
            setFilter('item', 'all');
          }}
          style={{ minWidth: 130 }}
        >
          <option value="all">Todos os Grupos</option>
          {(options.grupos || []).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Categoria */}
      <div className="filter-group">
        <span className="filter-label">Categoria</span>
        <select
          className="filter-select"
          value={categoria}
          onChange={e => {
            setFilter('categoria', e.target.value);
            setFilter('item', 'all');
          }}
          style={{ minWidth: 135 }}
        >
          <option value="all">Todas as Categorias</option>
          {categoriasOpts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Item */}
      <div className="filter-group">
        <span className="filter-label">Item / Produto</span>
        <select
          className="filter-select"
          value={item}
          onChange={e => setFilter('item', e.target.value)}
          style={{ minWidth: 140, maxWidth: 200 }}
        >
          <option value="all">Todos os Itens</option>
          {itensOpts.slice(0, 150).map(it => <option key={it} value={it}>{it}</option>)}
        </select>
      </div>

      {/* Botões de Ação (Limpar Filtros e Refresh) */}
      <div className="filter-group" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginLeft: 'auto' }}>
        {hasActiveFilters && (
          <button 
            className="date-btn" 
            onClick={clearAllFilters} 
            title="Limpar todos os filtros"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <X size={12} /> Limpar
          </button>
        )}
        <button className="filter-btn" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Sync...' : 'Atualizar'}
        </button>
      </div>
    </div>
  );
}
