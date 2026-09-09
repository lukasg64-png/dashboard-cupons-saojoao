import os
import json
import re
import unicodedata
import pandas as pd
import numpy as np
from datetime import datetime

BASE_DIR = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI'
EXCEL_HIERARCHY_PATH = os.path.join(BASE_DIR, 'projeto C', 'base lojas atualizada 21.08.xlsx')
CACHE_PATH = os.path.join(BASE_DIR, 'Dashboard desempenho Diretoria', 'dashboard-cupons-unificado', 'server', 'data', 'vtex_orders_cache.json')
EXCEL_REPORT_PATH = os.path.join(BASE_DIR, 'Relatorio_Executivo_Cupom_MEUCUIDADO_30Dias.xlsx')
HTML_REPORT_PATH = os.path.join(BASE_DIR, 'Relatorio_Executivo_Cupom_MEUCUIDADO_30Dias.html')

ABBREVIATION_MAP = {
    'baln': 'balneario', 'bal': 'balneario', 'floripa': 'florianopolis',
    'sta': 'santa', 'sto': 'santo', 'eng': 'engenheiro', 'mal': 'marechal',
    'dioni': 'dionisio', 'cnel': 'coronel', 'cel': 'coronel',
    'fco': 'francisco', 'franc': 'francisco', 'gal': 'galeria',
    'hosp': 'hospital', 'louren': 'lourenco', 'terez': 'terezinha',
    'ant': 'antonio', 's': 'sao', 'dr': 'doutor', 'av': 'avenida',
    'gen': 'general', 'v': 'vila', 'vl': 'vila', 'sn': 'santo',
    'st': 'santo', 'pt': 'ponto', 'pto': 'porto', 'distr': 'distrito',
    'pres': 'presidente',
}

CITY_SUFFIX_MAP = {
    'sapucaia': 'sapucaia sul', 'venancio': 'venancio aires',
    'rosario': 'rosario do sul', 'cachoeira': 'cachoeira do sul',
    'sao lourenco do sul': 'sao lourenco', 'sao lourenco oeste': 'sao lourenco do oeste',
    'sao lourenco do oeste': 'sao lourenco oeste', 'sao sebastiao cai': 'sao sebastiao',
    'julio castilhos': 'julio de castilhos', 'quedas iguacu': 'quedas do iguacu',
    'cruzeiro oeste': 'cruzeiro do oeste', 'sao miguel iguacu': 'sao miguel do iguacu',
    'encruzilhada sul': 'encruzilhada do sul', 'cerro grande sul': 'cerro grande',
    'cerro grande do sul': 'cerro grande', 'sao miguel oeste': 'sao miguel do oeste',
    'bela vista paraiso': 'bela vista do paraiso',
    'balneario arroio silva': 'balneario arroio do silva',
    'sao pedro sul': 'sao pedro do sul', 'sao francisco de assis': 'sao francisco assis',
    'sao francisco assis': 'sao francisco assis',
    'santana livramento': 'santana do livramento',
    'santa vitoria palmar': 'santa vitoria do palmar',
    'sao jose norte': 'sao jose do norte', 'sao joao do oeste': 'sao joao oeste',
    'sao luiz gonzaga': 'sao luiz', 'sao marcos': 'sao marcos',
    'herval d oeste': 'herval doeste', 'herval doeste': 'herval doeste',
}

SPECIAL_VTEX_TO_CSV = {
    'farmacias sao joao delivery': 'porto alegre dark store',
    'sjdigital1601': 'santo antonio das missoes',
    'pf': 'pf matriz', 'pf matriz': 'pf matriz', 'pf modelo': 'pf loja modelo',
    'pf uruguai': 'pf uruguai', 'pf shopping bella': 'pf shopping',
    'pf general netto': 'pf general neto', 'gruarapuava': 'guarapuava',
    'santo amaro': 'santo amaro imperatriz', 'sao francisco paula': 'sao fran paula',
    'sao francisco de paula': 'sao fran paula',
    'santa terezinha de itaipu': 'santa terezinha do itaipu',
    'santa terezinha itaipu': 'santa terezinha do itaipu',
    'sta terez de itaipu': 'santa terezinha do itaipu',
    'santo antonio missoes': 'santo antonio das missoes',
    'caxias 21': 'caxias 20',
}

def normalize_text(text):
    if not text: return ''
    s = str(text).lower()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def clean_vtex_seller(seller_name):
    if not seller_name: return ''
    cleaned = re.sub(r'\s*-\s*[\d\.\/\-]{11,25}\s*-\s*\d+\s*$', '', seller_name, flags=re.IGNORECASE).strip()
    if cleaned == seller_name and ' - ' in seller_name:
        parts = seller_name.split(' - ')
        if len(parts) >= 3 and re.match(r'^\d+$', parts[-1].strip()):
            cleaned = ' - '.join(parts[:-2]).strip()
        else:
            cleaned = parts[0].strip()
    return cleaned

def canonicalize(norm_name):
    res = str(norm_name).lower()
    if res in SPECIAL_VTEX_TO_CSV and SPECIAL_VTEX_TO_CSV[res] != res:
        return canonicalize(SPECIAL_VTEX_TO_CSV[res])
    res = re.sub(r'([a-z])(\d)', r'\1 \2', res)
    res = re.sub(r'\b0+(\d+)\b', r'\1', res)
    res = re.sub(r'\s+(rs|pr|sc)\s*$', '', res)
    res = re.sub(r'\s+(rs|pr|sc)\s+(\d)', r' \2', res)
    res = re.sub(r'\s*-\s*(nova|shop|gal|hosp|merc|pr|sc|rs)\b', '', res, flags=re.IGNORECASE)
    res = re.sub(r'\b(nova|shop|gal|hosp|merc)\b', '', res, flags=re.IGNORECASE)
    res = re.sub(r'\bnv\b|\bnov\b|\b1nov\b', '', res)
    res = re.sub(r'\s+', ' ', res).strip()

    words = res.split(' ')
    expanded = [ABBREVIATION_MAP.get(w, w) for w in words]
    res = ' '.join(expanded)
    res = re.sub(r'\bd\s+', 'd', res)
    res = re.sub(r"\bd'", 'd', res)

    m = re.match(r'^(.+?)\s+(\d+)$', res)
    if m:
        base_name, num = m.group(1).strip(), m.group(2)
        if base_name in CITY_SUFFIX_MAP:
            res = f"{CITY_SUFFIX_MAP[base_name]} {num}"
    else:
        if res in CITY_SUFFIX_MAP:
            res = CITY_SUFFIX_MAP[res]

    m_final = re.match(r'^(.+?)\s+(\d+)$', res)
    if m_final:
        b_name = m_final.group(1).strip()
        if b_name in SPECIAL_VTEX_TO_CSV and SPECIAL_VTEX_TO_CSV[b_name] != b_name:
            res = f"{SPECIAL_VTEX_TO_CSV[b_name]} {m_final.group(2)}"
    if res in SPECIAL_VTEX_TO_CSV and SPECIAL_VTEX_TO_CSV[res] != res:
        return canonicalize(SPECIAL_VTEX_TO_CSV[res])
    return re.sub(r'\s+', ' ', res).strip()

class StoreMatcher:
    def __init__(self, excel_path):
        self.df_stores = pd.read_excel(excel_path)
        self.stores_map = {}
        self.canon_map = {}
        self.base_no_num_map = {}

        for _, row in self.df_stores.iterrows():
            store_name = str(row['Desc_Filial']).strip()
            norm = normalize_text(store_name)
            canon = canonicalize(norm)
            
            info = {
                'Desc_Filial': store_name,
                'Diretor': str(row['Diretor']).strip(),
                'Distrital': str(row['Distrital']).strip(),
                'Coordenador': str(row['Coordenador']).strip()
            }
            self.stores_map[store_name] = info
            self.stores_map[norm] = info
            self.canon_map[canon] = info
            self.canon_map[norm] = info

            if not re.search(r'\b\d+\b', canon):
                self.base_no_num_map[canon] = info
                self.canon_map[canon + ' 1'] = info
            else:
                m1 = re.match(r'^(.+?)\s+1$', canon)
                if m1:
                    self.base_no_num_map[m1.group(1).strip()] = info

    def match(self, raw_seller_name):
        if not raw_seller_name:
            return None
        cleaned = clean_vtex_seller(raw_seller_name)
        norm = normalize_text(cleaned)

        if cleaned in self.stores_map:
            return self.stores_map[cleaned]
        if norm in self.stores_map:
            return self.stores_map[norm]
        if norm in self.canon_map:
            return self.canon_map[norm]

        canon = canonicalize(norm)
        if canon in self.canon_map:
            return self.canon_map[canon]

        if canon.endswith(' 1'):
            base = canon[:-2].strip()
            if base in self.base_no_num_map:
                return self.base_no_num_map[base]
            if base in self.canon_map:
                return self.canon_map[base]

        if not re.search(r'\b\d+\b', canon):
            with1 = canon + ' 1'
            if with1 in self.canon_map:
                return self.canon_map[with1]

        for s_canon, info in self.canon_map.items():
            if len(s_canon) > 4 and (s_canon in canon or canon in s_canon):
                return info

        return None

def analyze_meucuidado():
    print("[1/5] Carregando hierarquia de lojas do dia 21...")
    matcher = StoreMatcher(EXCEL_HIERARCHY_PATH)
    print(f"Hierarquia carregada com {len(matcher.df_stores)} lojas.")

    print("[2/5] Carregando cache de pedidos VTEX...")
    with open(CACHE_PATH, 'r', encoding='utf-8') as f:
        cache = json.load(f)
    print(f"Total de pedidos no cache: {len(cache)}")

    # Filtra período fechado dos últimos 30 dias: 01/08/2026 a 30/08/2026
    orders_30d = []
    meucuidado_orders = []

    for oid, o in cache.items():
        if not isinstance(o, dict): continue
        cd = o.get('creationDate')
        if not cd: continue
        dstr = cd[:10]
        if '2026-08-01' <= dstr <= '2026-08-30':
            seller_name = o.get('sellers', [{}])[0].get('name', '') if o.get('sellers') else ''
            matched_store = matcher.match(seller_name)
            
            val_brl = (o.get('value') or 0) / 100.0
            coupon = str(o.get('coupon') or '').strip().upper()
            
            order_info = {
                'orderId': o.get('orderId'),
                'creationDate': cd,
                'data': dstr,
                'hora': cd[11:19] if len(cd) >= 19 else '',
                'status': o.get('status'),
                'seller_raw': seller_name,
                'loja': matched_store['Desc_Filial'] if matched_store else (seller_name or 'Não Identificada'),
                'coordenador': matched_store['Coordenador'] if matched_store else 'Não Identificado',
                'distrital': matched_store['Distrital'] if matched_store else 'Não Identificado',
                'diretor': matched_store['Diretor'] if matched_store else 'Não Identificado',
                'coupon': coupon,
                'is_meucuidado': 'MEUCUIDADO' in coupon,
                'valor': val_brl,
                'itemsCount': o.get('itemsCount', 0),
                'items': o.get('items', [])
            }
            orders_30d.append(order_info)
            if order_info['is_meucuidado']:
                meucuidado_orders.append(order_info)

    print(f"Pedidos totais nos 30 dias (01 a 30/08): {len(orders_30d)}")
    print(f"Pedidos com cupom MEUCUIDADO: {len(meucuidado_orders)}")

    df_meu = pd.DataFrame(meucuidado_orders)
    df_all = pd.DataFrame(orders_30d)

    return df_meu, df_all, matcher

if __name__ == '__main__':
    df_meu, df_all, matcher = analyze_meucuidado()
    print("\n--- KPI GERAL ---")
    print(f"Total Pedidos com Cupom: {len(df_meu)}")
    print(f"Faturamento Total: R$ {df_meu['valor'].sum():,.2f}")
    print(f"Ticket Medio: R$ {df_meu['valor'].mean():,.2f}")
    print(f"Total Itens: {df_meu['itemsCount'].sum()}")
    print(f"Itens / Pedido: {df_meu['itemsCount'].mean():.2f}")
    print(f"Lojas Ativas: {df_meu['loja'].nunique()} de {len(matcher.df_stores)}")

    print("\n--- POR DIRETOR ---")
    print(df_meu.groupby('diretor').agg(pedidos=('orderId', 'count'), faturamento=('valor', 'sum'), ticket_medio=('valor', 'mean'), lojas=('loja', 'nunique')).to_string())

    print("\n--- POR DISTRITAL ---")
    print(df_meu.groupby(['diretor', 'distrital']).agg(pedidos=('orderId', 'count'), faturamento=('valor', 'sum'), ticket_medio=('valor', 'mean'), lojas=('loja', 'nunique')).sort_values(by='faturamento', ascending=False).to_string())

    print("\n--- POR COORDENADOR ---")
    print(df_meu.groupby(['diretor', 'distrital', 'coordenador']).agg(pedidos=('orderId', 'count'), faturamento=('valor', 'sum'), ticket_medio=('valor', 'mean'), lojas=('loja', 'nunique')).sort_values(by='faturamento', ascending=False).to_string())

    print("\n--- POR DIA ---")
    print(df_meu.groupby('data').agg(pedidos=('orderId', 'count'), faturamento=('valor', 'sum'), ticket_medio=('valor', 'mean'), lojas=('loja', 'nunique')).to_string())
