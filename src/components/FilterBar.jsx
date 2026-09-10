import React from 'react';
import { Filter, RefreshCw, X } from 'lucide-react';

const DATE_MODES = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '3d', label: '3 dias' },
  { key: '7d', label: '7 dias' },
  { key: '15d', label: '15 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes_anterior', label: 'Mês Anterior' },
];

function getBrtDateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const brt = new Date(d.getTime() - 3 * 3600000);
  return brt.toISOString().slice(0, 10);
}

export default function FilterBar({
  filters,
  setFilter,
  options = {},
  relations = {},
  onRefresh,
  refreshing = false,
  lastSyncStr = '',
  nextSyncStr = '',
}) {
  const { 
    diretoria, distrital, coordenador, filial, cupom, dateMode,
    startDate, endDate,
    grupo = 'all', categoria = 'all', item = 'all'
  } = filters;

  const handlePresetClick = (key) => {
    let sDate, eDate;
    const today = getBrtDateStr(0);
    switch (key) {
      case 'hoje':   sDate = eDate = today; break;
      case 'ontem':  sDate = eDate = getBrtDateStr(1); break;
      case '3d':     sDate = getBrtDateStr(2); eDate = today; break;
      case '7d':     sDate = getBrtDateStr(6); eDate = today; break;
      case '15d':    sDate = getBrtDateStr(14); eDate = today; break;
      case '30d':    sDate = getBrtDateStr(29); eDate = today; break;
      case 'mes_anterior': {
        const now = new Date();
        const brt = new Date(now.getTime() - 3 * 3600000);
        const year = brt.getUTCFullYear();
        const month = brt.getUTCMonth();
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        sDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate();
        eDate = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        break;
      }
      default: sDate = getBrtDateStr(14); eDate = today; break;
    }
    setFilter({ dateMode: key, startDate: sDate, endDate: eDate });
  };

  const handleCustomDateChange = (field, val) => {
    if (!val) return;
    setFilter({
      dateMode: 'custom',
      [field]: val
    });
  };

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
    filial !== 'all' || cupom !== 'all' || grupo !== 'all' || categoria !== 'all' || item !== 'all' ||
    dateMode !== '15d';

  const clearAllFilters = () => {
    const today = getBrtDateStr(0);
    const fifteenAgo = getBrtDateStr(14);
    setFilter({
      dateMode: '15d',
      startDate: fifteenAgo,
      endDate: today,
      diretoria: 'all',
      distrital: 'all',
      coordenador: 'all',
      filial: 'all',
      cupom: 'all',
      grupo: 'all',
      categoria: 'all',
      item: 'all',
    });
  };

  return (
    <div className="filter-bar fade-in">
      {/* ─── LINHA 1: PERÍODO E HIERARQUIA ──────────────────────────────── */}
      {/* Período */}
      <div className="filter-group">
        <span className="filter-label">Período</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {DATE_MODES.map(dm => (
              <button
                key={dm.key}
                className={`date-btn ${dateMode === dm.key ? 'active' : ''}`}
                onClick={() => handlePresetClick(dm.key)}
              >
                {dm.label}
              </button>
            ))}
            {dateMode === 'custom' && (
              <button className="date-btn active" style={{ cursor: 'default', background: '#0066cc', color: '#fff' }}>
                Personalizado
              </button>
            )}
          </div>

          {/* Filtro de Data (Inputs De / Até idênticos à imagem) */}
          <div className="filter-date-range-container">
            <input
              type="date"
              className="filter-date-input"
              value={startDate || ''}
              onChange={e => handleCustomDateChange('startDate', e.target.value)}
              onClick={e => { if (e.target.showPicker) e.target.showPicker(); }}
              title="Data Inicial"
            />
            <input
              type="date"
              className="filter-date-input"
              value={endDate || ''}
              onChange={e => handleCustomDateChange('endDate', e.target.value)}
              onClick={e => { if (e.target.showPicker) e.target.showPicker(); }}
              title="Data Final"
            />
          </div>
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

      {/* Botões de Ação (Status de Sincronismo, Limpar Filtros e Refresh) */}
      <div className="filter-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto', alignSelf: 'flex-end', paddingBottom: 2 }}>
        {lastSyncStr && (
          <div className="filter-sync-notice" title="Rotina de atualização automática a cada 1 hora">
            <span>🕒 Atualizado: <strong>{lastSyncStr}</strong></span>
            <span style={{ opacity: 0.35 }}>•</span>
            <span>Próxima carga: <strong>{nextSyncStr}</strong></span>
          </div>
        )}
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
        <button className="filter-btn" onClick={onRefresh} disabled={refreshing} title="Atualizar agora sob demanda">
          <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Sync...' : 'Atualizar'}
        </button>
      </div>
    </div>
  );
}
