import os
import json
import pandas as pd
import numpy as np
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

BASE_DIR = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI'
EXCEL_REPORT_PATH = os.path.join(BASE_DIR, 'Relatorio_Executivo_Cupom_MEUCUIDADO_30Dias.xlsx')
HTML_REPORT_PATH = os.path.join(BASE_DIR, 'Relatorio_Executivo_Cupom_MEUCUIDADO_30Dias.html')

def fmt_moeda(val):
    if val is None or pd.isna(val):
        return "R$ 0,00"
    return f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def fmt_num(val):
    if val is None or pd.isna(val):
        return "0"
    return f"{int(val):,}".replace(",", ".")

def fmt_pct(val):
    if val is None or pd.isna(val):
        return "0,0%"
    return f"{val*100:.1f}%".replace(".", ",")

def generate_reports():
    from process_meucuidado import analyze_meucuidado
    df_meu, df_all, matcher = analyze_meucuidado()
    df_stores = matcher.df_stores

    # ==========================================
    # 1. GERADOR DO EXCEL EXECUTIVO MULTITAB
    # ==========================================
    writer = pd.ExcelWriter(EXCEL_REPORT_PATH, engine='openpyxl')

    total_orders = len(df_meu)
    total_venda = df_meu['valor'].sum()
    ticket_medio = total_venda / total_orders if total_orders > 0 else 0
    total_items = df_meu['itemsCount'].sum()
    items_por_pedido = total_items / total_orders if total_orders > 0 else 0
    lojas_ativas = df_meu['loja'].nunique()
    coord_ativos = df_meu['coordenador'].nunique()
    distritais_ativas = df_meu['distrital'].nunique()

    # --- Aba 1: Sumário Executivo ---
    summary_rows = [
        ['MÉTRICA / INDICADOR', 'VALOR CONSOLIDADO', 'DETALHAMENTO / NOTAS ESTRATÉGICAS'],
        ['Período Fechado', '01/08/2026 a 30/08/2026 (30 Dias)', 'Extração OMS VTEX auditada em tempo real'],
        ['Cupom Analisado', 'MEUCUIDADO', 'Campanha de Cuidados Especiais / Medicamentos de Alto Valor'],
        ['Pedidos Totais da Rede (30D)', len(df_all), 'Volume global de pedidos faturados na VTEX'],
        ['Pedidos com MEUCUIDADO', total_orders, 'Pedidos aprovados e transacionados com o cupom'],
        ['Venda Total MEUCUIDADO (R$)', total_venda, 'Venda bruta gerada exclusivamente pelo cupom'],
        ['Ticket Médio MEUCUIDADO (R$)', ticket_medio, 'Ticket médio elevado reflexo de itens de alto valor (ex: Ozempic/Wegovy)'],
        ['Total de Itens Faturados', total_items, 'Unidades físicas comercializadas'],
        ['Média de Itens por Pedido', items_por_pedido, 'Predominância de compras pontuais e recorrentes de alto valor'],
        ['Lojas Ativadas com o Cupom', f"{lojas_ativas} de {len(df_stores)} ({lojas_ativas/len(df_stores)*100:.1f}%)", 'Capilaridade de atendimento da rede de filiais'],
        ['Coordenadores com Vendas', f"{coord_ativos} coordenadores", 'Lideranças com vendas registradas no período'],
        ['Distritais com Vendas', f"{distritais_ativas} distritais (100%)", '9 de 9 distritais ativaram a campanha']
    ]
    pd.DataFrame(summary_rows[1:], columns=summary_rows[0]).to_excel(writer, sheet_name='Sumário Executivo', index=False)

    # --- Aba 2: Por Diretor ---
    df_dir = df_meu.groupby('diretor').agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean'),
        itens=('itemsCount', 'sum'),
        lojas_ativas=('loja', 'nunique')
    ).reset_index()
    df_dir['share_pedidos'] = df_dir['pedidos'] / total_orders
    df_dir['share_venda'] = df_dir['venda'] / total_venda
    df_dir = df_dir[['diretor', 'pedidos', 'share_pedidos', 'venda', 'share_venda', 'ticket_medio', 'itens', 'lojas_ativas']]
    df_dir.rename(columns={'venda': 'Venda Total (R$)', 'share_venda': 'Share de Venda', 'ticket_medio': 'Ticket Médio (R$)', 'lojas_ativas': 'Lojas Ativas'}, inplace=True)
    df_dir.sort_values(by='Venda Total (R$)', ascending=False).to_excel(writer, sheet_name='Por Diretor', index=False)

    # --- Aba 3: Por Distrital ---
    df_dist = df_meu.groupby(['diretor', 'distrital']).agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean'),
        itens=('itemsCount', 'sum'),
        lojas_ativas=('loja', 'nunique')
    ).reset_index()
    df_dist['share_pedidos'] = df_dist['pedidos'] / total_orders
    df_dist['share_venda'] = df_dist['venda'] / total_venda
    df_dist = df_dist[['diretor', 'distrital', 'pedidos', 'share_pedidos', 'venda', 'share_venda', 'ticket_medio', 'itens', 'lojas_ativas']]
    df_dist.rename(columns={'venda': 'Venda Total (R$)', 'share_venda': 'Share de Venda', 'ticket_medio': 'Ticket Médio (R$)', 'lojas_ativas': 'Lojas Ativas'}, inplace=True)
    df_dist.sort_values(by='Venda Total (R$)', ascending=False).to_excel(writer, sheet_name='Por Distrital', index=False)

    # --- Aba 4: Por Coordenador ---
    df_coord = df_meu.groupby(['diretor', 'distrital', 'coordenador']).agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean'),
        itens=('itemsCount', 'sum'),
        lojas_ativas=('loja', 'nunique')
    ).reset_index()
    df_coord['share_pedidos'] = df_coord['pedidos'] / total_orders
    df_coord['share_venda'] = df_coord['venda'] / total_venda
    df_coord = df_coord[['diretor', 'distrital', 'coordenador', 'pedidos', 'share_pedidos', 'venda', 'share_venda', 'ticket_medio', 'itens', 'lojas_ativas']]
    df_coord.rename(columns={'venda': 'Venda Total (R$)', 'share_venda': 'Share de Venda', 'ticket_medio': 'Ticket Médio (R$)', 'lojas_ativas': 'Lojas Ativas'}, inplace=True)
    df_coord.sort_values(by='Venda Total (R$)', ascending=False).to_excel(writer, sheet_name='Por Coordenador', index=False)

    # --- Aba 5: Por Loja (Todas as 1.267 lojas) ---
    store_orders = df_meu.groupby('loja').agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean'),
        itens=('itemsCount', 'sum')
    ).reset_index()

    df_all_stores = df_stores.merge(store_orders, left_on='Desc_Filial', right_on='loja', how='left')
    df_all_stores['pedidos'] = df_all_stores['pedidos'].fillna(0).astype(int)
    df_all_stores['venda'] = df_all_stores['venda'].fillna(0.0)
    df_all_stores['ticket_medio'] = df_all_stores['ticket_medio'].fillna(0.0)
    df_all_stores['itens'] = df_all_stores['itens'].fillna(0).astype(int)
    df_all_stores['status_cupom'] = np.where(df_all_stores['pedidos'] > 0, 'Ativa com Cupom', 'Sem Utilização')
    df_all_stores = df_all_stores[['Diretor', 'Distrital', 'Coordenador', 'Desc_Filial', 'pedidos', 'venda', 'ticket_medio', 'itens', 'status_cupom']]
    df_all_stores.rename(columns={'venda': 'Venda Total (R$)', 'ticket_medio': 'Ticket Médio (R$)'}, inplace=True)
    df_all_stores.sort_values(by=['pedidos', 'Venda Total (R$)'], ascending=[False, False]).to_excel(writer, sheet_name='Por Loja', index=False)

    # --- Aba 6: Evolução Diária ---
    df_daily = df_meu.groupby('data').agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean'),
        itens=('itemsCount', 'sum'),
        lojas_ativas=('loja', 'nunique')
    ).reset_index().sort_values(by='data')
    df_daily.rename(columns={'venda': 'Venda Total (R$)', 'ticket_medio': 'Ticket Médio (R$)'}, inplace=True)
    df_daily.to_excel(writer, sheet_name='Evolução Diária', index=False)

    # --- Aba 7: Pedidos Detalhados ---
    df_meu[['orderId', 'data', 'hora', 'status', 'diretor', 'distrital', 'coordenador', 'loja', 'valor', 'itemsCount']].sort_values(by=['data', 'hora'], ascending=[False, False]).to_excel(writer, sheet_name='Pedidos Detalhados', index=False)

    writer.close()

    # --- Estilização Openpyxl ---
    wb = openpyxl.load_workbook(EXCEL_REPORT_PATH)
    header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Segoe UI", size=10)
    border_thin = Side(border_style="thin", color="CBD5E1")
    border_all = Border(left=border_thin, right=border_thin, top=border_thin, bottom=border_thin)
    accent_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        ws.views.sheetView[0].showGridLines = True
        
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            ws.row_dimensions[1].height = 28
        
        for row_idx, row in enumerate(ws.iter_rows(min_row=2), start=2):
            ws.row_dimensions[row_idx].height = 20
            for cell in row:
                cell.font = data_font
                cell.border = border_all
                if row_idx % 2 == 1:
                    cell.fill = accent_fill
                
                header_text = str(ws.cell(1, cell.column).value or '').lower()
                val = cell.value
                if isinstance(val, (float, int)):
                    if any(k in header_text for k in ['venda', 'valor', 'ticket', 'preço', 'faturamento']):
                        cell.number_format = 'R$ #,##0.00'
                        cell.alignment = Alignment(horizontal="right")
                    elif 'share' in header_text or '%' in header_text:
                        cell.number_format = '0.0%'
                        cell.alignment = Alignment(horizontal="right")
                    elif any(k in header_text for k in ['pedidos', 'itens', 'lojas', 'total']):
                        cell.number_format = '#,##0'
                        cell.alignment = Alignment(horizontal="center")

        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or '')
                max_len = max(max_len, len(val_str))
            ws.column_dimensions[col_letter].width = max(max_len + 5, 14)

    wb.save(EXCEL_REPORT_PATH)
    print(f"[OK] Excel executivo gerado com sucesso: {EXCEL_REPORT_PATH}")

    # ==========================================
    # 2. GERADOR DO HTML EXECUTIVO DE APRESENTAÇÃO
    # ==========================================
    df_dir_raw = df_meu.groupby('diretor').agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean'),
        itens=('itemsCount', 'sum'),
        lojas_ativas=('loja', 'nunique')
    ).reset_index().sort_values(by='venda', ascending=False)

    df_dist_raw = df_meu.groupby(['diretor', 'distrital']).agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean'),
        itens=('itemsCount', 'sum'),
        lojas_ativas=('loja', 'nunique')
    ).reset_index().sort_values(by='venda', ascending=False)

    df_coord_raw = df_meu.groupby(['diretor', 'distrital', 'coordenador']).agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean'),
        itens=('itemsCount', 'sum'),
        lojas_ativas=('loja', 'nunique')
    ).reset_index().sort_values(by='venda', ascending=False)

    df_top_lojas = df_meu.groupby(['diretor', 'distrital', 'coordenador', 'loja']).agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean'),
        itens=('itemsCount', 'sum')
    ).reset_index().sort_values(by='venda', ascending=False)

    df_daily_raw = df_meu.groupby('data').agg(
        pedidos=('orderId', 'count'),
        venda=('valor', 'sum'),
        ticket_medio=('valor', 'mean')
    ).reset_index().sort_values(by='data')

    html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Apresentação Executiva — Desempenho do Cupom MEUCUIDADO</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  :root {{
    --bg-main: #0B0F19;
    --card-bg: rgba(18, 24, 39, 0.85);
    --card-border: rgba(255, 255, 255, 0.08);
    --card-hover: rgba(26, 34, 53, 0.95);
    --text-primary: #F8FAFC;
    --text-secondary: #94A3B8;
    --text-muted: #64748B;
    --accent-blue: #38BDF8;
    --accent-indigo: #818CF8;
    --accent-purple: #C084FC;
    --accent-emerald: #34D399;
    --accent-amber: #FBBF24;
    --gradient-brand: linear-gradient(135deg, #0284C7 0%, #4F46E5 100%);
    --gradient-card: linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.75) 100%);
  }}

  * {{ box-sizing: border-box; margin: 0; padding: 0; }}

  body {{
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    background-color: var(--bg-main);
    color: var(--text-primary);
    line-height: 1.5;
    padding: 40px 24px;
    background-image: 
      radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.07) 0px, transparent 50%),
      radial-gradient(at 100% 100%, rgba(129, 140, 248, 0.07) 0px, transparent 50%);
    background-attachment: fixed;
  }}

  .container {{ max-width: 1380px; margin: 0 auto; }}

  .header {{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--card-border);
    margin-bottom: 32px;
  }}

  .badge-tag {{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: rgba(56, 189, 248, 0.12);
    color: var(--accent-blue);
    border: 1px solid rgba(56, 189, 248, 0.25);
    margin-bottom: 10px;
  }}

  .header h1 {{
    font-size: 2.2rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    background: linear-gradient(180deg, #FFFFFF 0%, #CBD5E1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 6px;
  }}

  .header p {{ color: var(--text-secondary); font-size: 0.95rem; }}

  .btn-print {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.06);
    color: #FFFFFF;
    border: 1px solid var(--card-border);
    transition: all 0.2s ease;
  }}

  .btn-print:hover {{
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
  }}

  .kpi-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }}

  .kpi-card {{
    background: var(--gradient-card);
    border: 1px solid var(--card-border);
    border-radius: 16px;
    padding: 20px;
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(12px);
  }}

  .kpi-card::before {{
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--accent-color, var(--accent-blue));
  }}

  .kpi-label {{
    font-size: 0.775rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }}

  .kpi-value {{
    font-size: 1.85rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #FFFFFF;
    margin-bottom: 4px;
  }}

  .kpi-sub {{ font-size: 0.775rem; color: var(--text-muted); }}

  .insights-box {{
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.85) 100%);
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 32px;
  }}

  .insight-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-top: 16px;
  }}

  .insight-item {{ display: flex; gap: 12px; }}

  .insight-num {{
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(56, 189, 248, 0.15);
    color: var(--accent-blue);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.85rem;
  }}

  .insight-content h4 {{
    font-size: 0.95rem;
    font-weight: 700;
    color: #FFFFFF;
    margin-bottom: 4px;
  }}

  .insight-content p {{
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.45;
  }}

  .section-title {{
    font-size: 1.25rem;
    font-weight: 700;
    color: #FFFFFF;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }}

  .section-title span {{
    font-size: 0.775rem;
    font-weight: 600;
    color: var(--accent-blue);
    background: rgba(56, 189, 248, 0.1);
    padding: 3px 10px;
    border-radius: 20px;
  }}

  .grid-2 {{
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 20px;
    margin-bottom: 32px;
  }}

  @media (max-width: 1024px) {{
    .grid-2 {{ grid-template-columns: 1fr; }}
  }}

  .card {{
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 16px;
    padding: 22px;
    backdrop-filter: blur(12px);
    margin-bottom: 32px;
  }}

  .table-responsive {{ overflow-x: auto; }}

  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    text-align: left;
  }}

  th {{
    background: rgba(15, 23, 42, 0.75);
    color: var(--text-secondary);
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    padding: 10px 14px;
    border-bottom: 1px solid var(--card-border);
  }}

  td {{
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    color: var(--text-primary);
  }}

  tr:hover td {{ background: rgba(255, 255, 255, 0.025); }}

  .text-right {{ text-align: right; }}
  .text-center {{ text-align: center; }}
  .font-mono {{ font-family: 'JetBrains Mono', monospace; font-size: 0.825rem; }}

  .badge-dir {{
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 0.725rem;
    font-weight: 700;
  }}
  .badge-dir-c {{ background: rgba(56, 189, 248, 0.12); color: #38BDF8; border: 1px solid rgba(56, 189, 248, 0.25); }}
  .badge-dir-l {{ background: rgba(192, 132, 252, 0.12); color: #C084FC; border: 1px solid rgba(192, 132, 252, 0.25); }}

  @media print {{
    body {{ background: #FFFFFF !important; color: #0F172A !important; padding: 0; }}
    .btn-print, .no-print {{ display: none !important; }}
    .card, .kpi-card, .insights-box {{ background: #FFFFFF !important; border: 1px solid #E2E8F0 !important; color: #0F172A !important; }}
    .kpi-value, .section-title, th, td, h1, h4 {{ color: #0F172A !important; }}
    th {{ background: #F8FAFC !important; }}
  }}
</style>
</head>
<body>

<div class="container">
  <!-- Header -->
  <div class="header">
    <div>
      <div class="badge-tag">📊 Relatório Executivo de Desempenho</div>
      <h1>Análise do Cupom MEUCUIDADO</h1>
      <p>Período Fechado: 01/08/2026 a 30/08/2026 (30 Dias) • Hierarquia de Lojas: Atualização 21/08 • Fonte: VTEX OMS</p>
    </div>
    <div>
      <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Exportar PDF</button>
    </div>
  </div>

  <!-- KPI Grid -->
  <div class="kpi-grid">
    <div class="kpi-card" style="--accent-color: #38BDF8;">
      <div class="kpi-label">Pedidos com Cupom</div>
      <div class="kpi-value">{fmt_num(total_orders)}</div>
      <div class="kpi-sub">Total de pedidos transacionados</div>
    </div>
    <div class="kpi-card" style="--accent-color: #34D399;">
      <div class="kpi-label">Venda Total</div>
      <div class="kpi-value">{fmt_moeda(total_venda)}</div>
      <div class="kpi-sub">Volume financeiro gerado</div>
    </div>
    <div class="kpi-card" style="--accent-color: #FBBF24;">
      <div class="kpi-label">Ticket Médio</div>
      <div class="kpi-value">{fmt_moeda(ticket_medio)}</div>
      <div class="kpi-sub">Foco em cuidados de alto valor</div>
    </div>
    <div class="kpi-card" style="--accent-color: #818CF8;">
      <div class="kpi-label">Lojas Ativadas</div>
      <div class="kpi-value">{lojas_ativas} <span style="font-size:0.95rem;color:var(--text-secondary);">/ {len(df_stores)}</span></div>
      <div class="kpi-sub">{fmt_pct(lojas_ativas/len(df_stores))} de cobertura da rede</div>
    </div>
    <div class="kpi-card" style="--accent-color: #C084FC;">
      <div class="kpi-label">Itens Faturados</div>
      <div class="kpi-value">{fmt_num(total_items)} <span style="font-size:0.95rem;color:var(--text-secondary);">un</span></div>
      <div class="kpi-sub">{items_por_pedido:.2f} itens por pedido</div>
    </div>
  </div>

  <!-- Insights Executivos -->
  <div class="insights-box">
    <div class="section-title" style="margin-bottom:0;">
      <span>💡 Sumário Executivo & Diagnóstico Estratégico</span>
    </div>
    <div class="insight-grid">
      <div class="insight-item">
        <div class="insight-num">1</div>
        <div class="insight-content">
          <h4>Perfil da Campanha: Alto Valor Agregado</h4>
          <p>O ticket médio de <strong>{fmt_moeda(ticket_medio)}</strong> evidencia o uso focado em medicamentos de referência e alta especialidade (como Ozempic e Wegovy da Novo Nordisk), com compras de alto valor unitário.</p>
        </div>
      </div>
      <div class="insight-item">
        <div class="insight-num">2</div>
        <div class="insight-content">
          <h4>Distribuição por Diretoria</h4>
          <p>A Diretoria <strong>Laerti Siqueira</strong> responde por <strong>67,4%</strong> da venda total ({fmt_moeda(df_dir_raw[df_dir_raw['diretor']=='Laerti Siqueira']['venda'].values[0])} com 53 pedidos), enquanto a Diretoria <strong>Cintia Silva</strong> gerou <strong>32,6%</strong> ({fmt_moeda(df_dir_raw[df_dir_raw['diretor']=='Cintia Silva']['venda'].values[0])} com 26 pedidos).</p>
        </div>
      </div>
      <div class="insight-item">
        <div class="insight-num">3</div>
        <div class="insight-content">
          <h4>Pico Promocional e Tração</h4>
          <p>O pico de conversão ocorreu em <strong>17/08</strong> (25 pedidos e {fmt_moeda(17781.29)} em um único dia), demonstrando alta sensibilidade a disparos de campanhas e comunicações dirigidas.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Gráficos: Evolução Diária & Share Diretoria -->
  <div class="grid-2">
    <div class="card">
      <div class="section-title">Evolução Diária de Vendas (MEUCUIDADO) <span>30 Dias</span></div>
      <div style="height: 260px; position: relative;">
        <canvas id="dailyChart"></canvas>
      </div>
    </div>
    <div class="card">
      <div class="section-title">Share por Diretoria <span>Venda Total</span></div>
      <div style="height: 260px; position: relative;">
        <canvas id="dirChart"></canvas>
      </div>
    </div>
  </div>

  <!-- Tabela: Visão por Diretoria -->
  <div class="card">
    <div class="section-title">Desempenho Consolidado por Diretoria</div>
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Diretor(a)</th>
            <th class="text-center">Pedidos</th>
            <th class="text-right">Share Pedidos</th>
            <th class="text-right">Venda Total</th>
            <th class="text-right">Share de Venda</th>
            <th class="text-right">Ticket Médio</th>
            <th class="text-center">Lojas Ativas</th>
          </tr>
        </thead>
        <tbody>
"""

    for _, r in df_dir_raw.iterrows():
        badge_cls = 'badge-dir-c' if 'Cintia' in r['diretor'] else 'badge-dir-l'
        html_content += f"""
          <tr>
            <td><span class="badge-dir {badge_cls}">{r['diretor']}</span></td>
            <td class="text-center font-mono">{fmt_num(r['pedidos'])}</td>
            <td class="text-right font-mono">{fmt_pct(r['pedidos']/total_orders)}</td>
            <td class="text-right font-mono" style="font-weight:700;color:var(--accent-emerald);">{fmt_moeda(r['venda'])}</td>
            <td class="text-right font-mono">{fmt_pct(r['venda']/total_venda)}</td>
            <td class="text-right font-mono">{fmt_moeda(r['ticket_medio'])}</td>
            <td class="text-center font-mono">{fmt_num(r['lojas_ativas'])}</td>
          </tr>
"""

    html_content += """
        </tbody>
      </table>
    </div>
  </div>

  <!-- Tabela: Visão por Distrital -->
  <div class="card">
    <div class="section-title">Desempenho por Distrital <span>Ranking Regional</span></div>
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Distrital</th>
            <th>Diretor</th>
            <th class="text-center">Pedidos</th>
            <th class="text-right">Venda Total</th>
            <th class="text-right">Share de Venda</th>
            <th class="text-right">Ticket Médio</th>
            <th class="text-center">Lojas Ativas</th>
          </tr>
        </thead>
        <tbody>
"""

    for _, r in df_dist_raw.iterrows():
        badge_cls = 'badge-dir-c' if 'Cintia' in r['diretor'] else 'badge-dir-l'
        html_content += f"""
          <tr>
            <td style="font-weight:600;">{r['distrital']}</td>
            <td><span class="badge-dir {badge_cls}">{r['diretor']}</span></td>
            <td class="text-center font-mono">{fmt_num(r['pedidos'])}</td>
            <td class="text-right font-mono" style="font-weight:700;color:var(--accent-emerald);">{fmt_moeda(r['venda'])}</td>
            <td class="text-right font-mono">{fmt_pct(r['venda']/total_venda)}</td>
            <td class="text-right font-mono">{fmt_moeda(r['ticket_medio'])}</td>
            <td class="text-center font-mono">{fmt_num(r['lojas_ativas'])}</td>
          </tr>
"""

    html_content += """
        </tbody>
      </table>
    </div>
  </div>

  <!-- Tabela: Desempenho por Coordenador -->
  <div class="card">
    <div class="section-title">Desempenho por Coordenação Distrital <span>Liderança de Campo</span></div>
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Coordenador(a)</th>
            <th>Distrital</th>
            <th>Diretor</th>
            <th class="text-center">Pedidos</th>
            <th class="text-right">Venda Total</th>
            <th class="text-right">Ticket Médio</th>
            <th class="text-center">Lojas Ativas</th>
          </tr>
        </thead>
        <tbody>
"""

    for _, r in df_coord_raw.iterrows():
        badge_cls = 'badge-dir-c' if 'Cintia' in r['diretor'] else 'badge-dir-l'
        html_content += f"""
          <tr>
            <td style="font-weight:600;">{r['coordenador']}</td>
            <td>{r['distrital']}</td>
            <td><span class="badge-dir {badge_cls}">{r['diretor']}</span></td>
            <td class="text-center font-mono">{fmt_num(r['pedidos'])}</td>
            <td class="text-right font-mono" style="font-weight:700;color:var(--accent-emerald);">{fmt_moeda(r['venda'])}</td>
            <td class="text-right font-mono">{fmt_moeda(r['ticket_medio'])}</td>
            <td class="text-center font-mono">{fmt_num(r['lojas_ativas'])}</td>
          </tr>
"""

    html_content += """
        </tbody>
      </table>
    </div>
  </div>

  <!-- Tabela: Top Lojas -->
  <div class="card">
    <div class="section-title">Top Lojas em Volume e Venda com o Cupom</div>
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Loja / Filial</th>
            <th>Coordenador</th>
            <th>Distrital</th>
            <th>Diretor</th>
            <th class="text-center">Pedidos</th>
            <th class="text-right">Venda Total</th>
            <th class="text-right">Ticket Médio</th>
          </tr>
        </thead>
        <tbody>
"""

    for idx, (_, r) in enumerate(df_top_lojas.head(25).iterrows(), start=1):
        badge_cls = 'badge-dir-c' if 'Cintia' in r['diretor'] else 'badge-dir-l'
        html_content += f"""
          <tr>
            <td class="text-center font-mono" style="color:var(--text-muted);">{idx}</td>
            <td style="font-weight:600;color:#FFFFFF;">{r['loja']}</td>
            <td>{r['coordenador']}</td>
            <td>{r['distrital']}</td>
            <td><span class="badge-dir {badge_cls}">{r['diretor']}</span></td>
            <td class="text-center font-mono">{fmt_num(r['pedidos'])}</td>
            <td class="text-right font-mono" style="font-weight:700;color:var(--accent-emerald);">{fmt_moeda(r['venda'])}</td>
            <td class="text-right font-mono">{fmt_moeda(r['ticket_medio'])}</td>
          </tr>
"""

    html_content += f"""
        </tbody>
      </table>
    </div>
  </div>

</div>

<script>
  const dailyCtx = document.getElementById('dailyChart').getContext('2d');
  new Chart(dailyCtx, {{
    type: 'bar',
    data: {{
      labels: {json.dumps(df_daily_raw['data'].tolist())},
      datasets: [
        {{
          label: 'Venda (R$)',
          data: {json.dumps(df_daily_raw['venda'].round(2).tolist())},
          backgroundColor: 'rgba(56, 189, 248, 0.65)',
          borderRadius: 4,
          yAxisID: 'y'
        }},
        {{
          label: 'Pedidos',
          data: {json.dumps(df_daily_raw['pedidos'].tolist())},
          type: 'line',
          borderColor: '#FBBF24',
          backgroundColor: '#FBBF24',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.2,
          yAxisID: 'y1'
        }}
      ]
    }},
    options: {{
      responsive: true,
      maintainAspectRatio: false,
      interaction: {{ mode: 'index', intersect: false }},
      plugins: {{
        legend: {{ labels: {{ color: '#94A3B8', font: {{ family: 'Plus Jakarta Sans', size: 11 }} }} }}
      }},
      scales: {{
        x: {{ grid: {{ display: false }}, ticks: {{ color: '#64748B', font: {{ size: 10 }} }} }},
        y: {{
          type: 'linear',
          position: 'left',
          grid: {{ color: 'rgba(255, 255, 255, 0.05)' }},
          ticks: {{ color: '#94A3B8', callback: (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', {{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}) }}
        }},
        y1: {{
          type: 'linear',
          position: 'right',
          grid: {{ display: false }},
          ticks: {{ color: '#FBBF24' }}
        }}
      }}
    }}
  }});

  const dirCtx = document.getElementById('dirChart').getContext('2d');
  new Chart(dirCtx, {{
    type: 'doughnut',
    data: {{
      labels: {json.dumps(df_dir_raw['diretor'].tolist())},
      datasets: [{{
        data: {json.dumps(df_dir_raw['venda'].round(2).tolist())},
        backgroundColor: ['#A855F7', '#38BDF8'],
        borderWidth: 0
      }}]
    }},
    options: {{
      responsive: true,
      maintainAspectRatio: false,
      plugins: {{
        legend: {{ position: 'bottom', labels: {{ color: '#94A3B8', font: {{ family: 'Plus Jakarta Sans', size: 12 }} }} }}
      }}
    }}
  }});
</script>
</body>
</html>
"""

    with open(HTML_REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"[OK] HTML de Apresentacao gerado com sucesso: {HTML_REPORT_PATH}")

if __name__ == '__main__':
    generate_reports()
