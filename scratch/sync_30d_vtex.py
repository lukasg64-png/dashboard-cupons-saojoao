import os
import json
import time
import requests
import pandas as pd
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

ACCOUNT = 'sjdigital'
VTEX_APP_KEY = 'vtexappkey-sjdigital-NBIBYX'
VTEX_APP_TOKEN = 'ZWWMCOPAPYMWRDDFJXJASHHUYAHMNWFDLQKYEFYTGNOHDWBDBJGDWDRAQKGALTKTJZUTNMSEOSARVFCIQDNTEVGACYJBFYYKDFRYJTFSQJTOANANWPYYWISDULGXVMON'

HEADERS = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-VTEX-API-AppKey': VTEX_APP_KEY,
    'X-VTEX-API-AppToken': VTEX_APP_TOKEN,
    'User-Agent': 'Mozilla/5.0'
}

BASE_DIR = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI'
EXCEL_HIERARCHY_PATH = os.path.join(BASE_DIR, 'projeto C', 'base lojas atualizada 21.08.xlsx')
OUTPUT_DIR = os.path.join(BASE_DIR, 'Dashboard desempenho Diretoria', 'dashboard-cupons-unificado', 'server', 'data')
MASTER_CACHE_PATH = os.path.join(OUTPUT_DIR, 'vtex_orders_cache.json')
MEUCUIDADO_CACHE_PATH = os.path.join(OUTPUT_DIR, 'meucuidado_orders_30d.json')

os.makedirs(OUTPUT_DIR, exist_ok=True)

def create_session():
    s = requests.Session()
    retries = Retry(total=3, backoff_factor=0.3, status_forcelist=[429, 500, 502, 503, 504])
    s.mount('https://', HTTPAdapter(pool_connections=60, pool_maxsize=60, max_retries=retries))
    return s

def load_all_existing_caches():
    all_orders = {}
    cache_files = [
        os.path.join(BASE_DIR, 'Dashboard desempenho Diretoria', 'dashboard-cupons-unificado', 'server', 'data', 'vtex_orders_cache.json'),
        os.path.join(BASE_DIR, 'Dashboard desempenho Diretoria', 'dashboard-cupons-unificado', 'server', 'data', 'vtex_orders_seed.json'),
        os.path.join(BASE_DIR, 'projeto C', 'dashboard-diretoria-c', 'server', 'data', 'vtex_orders_cache.json'),
        os.path.join(BASE_DIR, 'projeto L', 'dashboard-diretoria-l', 'server', 'data', 'vtex_orders_cache.json'),
        os.path.join(BASE_DIR, 'monitor-offline-lojas', 'data', 'vtex_orders_cache.json'),
    ]
    for cp in cache_files:
        if os.path.exists(cp):
            try:
                with open(cp, 'r', encoding='utf-8') as f:
                    d = json.load(f)
                count = 0
                for k, v in d.items():
                    if isinstance(v, dict):
                        if k not in all_orders or (v.get('items') and not all_orders[k].get('items')):
                            all_orders[k] = v
                            count += 1
                print(f"[CACHE] Carregados {count} pedidos de {os.path.basename(os.path.dirname(cp))}/{os.path.basename(cp)}")
            except Exception as e:
                print(f"[CACHE] Erro lendo {cp}: {e}")
    print(f"[CACHE] Total acumulado único: {len(all_orders)} pedidos.")
    return all_orders

def get_day_order_ids(session, date_str):
    # 6 blocos de 4h UTC para cobrir o dia completo sem estourar limites VTEX
    blocks = [
        ('00:00:00.000Z', '03:59:59.999Z'),
        ('04:00:00.000Z', '07:59:59.999Z'),
        ('08:00:00.000Z', '11:59:59.999Z'),
        ('12:00:00.000Z', '15:59:59.999Z'),
        ('16:00:00.000Z', '19:59:59.999Z'),
        ('20:00:00.000Z', '23:59:59.999Z'),
    ]
    all_ids = []
    for start_t, end_t in blocks:
        page = 1
        while True:
            url = f'https://{ACCOUNT}.vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[{date_str}T{start_t} TO {date_str}T{end_t}]&per_page=100&page={page}'
            try:
                r = session.get(url, headers=HEADERS, timeout=20)
                if r.status_code != 200:
                    break
                data = r.json()
                lst = data.get('list', [])
                if not lst:
                    break
                all_ids.extend([o['orderId'] for o in lst])
                paging = data.get('paging', {})
                if page >= paging.get('pages', 1):
                    break
                page += 1
            except Exception as e:
                print(f"[LIST ERROR] {date_str} p.{page}: {e}")
                break
    return list(dict.fromkeys(all_ids))

def minify_order(order):
    if not order:
        return None
    items = []
    for item in order.get('items', []):
        add_info = item.get('additionalInfo') or {}
        items.append({
            'productId': item.get('productId'),
            'skuId': item.get('id'),
            'name': item.get('name'),
            'quantity': item.get('quantity', 0),
            'price': item.get('price', 0),
            'sellingPrice': item.get('sellingPrice', 0),
            'listPrice': item.get('listPrice', item.get('price', 0)),
            'brandName': add_info.get('brandName', ''),
            'categoriesIds': add_info.get('categoriesIds', ''),
            'categoryId': add_info.get('categoriesIds', '').split('/')[-2] if add_info.get('categoriesIds') else ''
        })
    
    marketing = order.get('marketingData') or {}
    coupon = marketing.get('coupon')
    
    # Se marketingData.coupon for vazio, tentar extrair de ratesAndBenefitsData
    if not coupon:
        rates = order.get('ratesAndBenefitsData') or {}
        for coupon_obj in rates.get('coupon', []):
            if coupon_obj:
                coupon = coupon_obj
                break

    return {
        'orderId': order.get('orderId'),
        'status': order.get('status'),
        'creationDate': order.get('creationDate'),
        'value': order.get('value', 0),
        'sellers': [{'id': s.get('id'), 'name': s.get('name')} for s in order.get('sellers', [])],
        'coupon': coupon,
        'items': items,
        'itemsCount': sum(item['quantity'] for item in items)
    }

def fetch_single_order(session, order_id):
    url = f'https://{ACCOUNT}.vtexcommercestable.com.br/api/oms/pvt/orders/{order_id}'
    for attempt in range(3):
        try:
            r = session.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                return minify_order(r.json())
            elif r.status_code == 404:
                return None
        except Exception:
            time.sleep(0.5 * (attempt + 1))
    return None

def sync_missing_days(master_cache):
    days_to_sync = [
        '2026-08-01', '2026-08-02', '2026-08-03',
        '2026-08-22', '2026-08-23', '2026-08-24',
        '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31'
    ]
    
    session = create_session()
    print(f"\n[SYNC] Iniciando sincronização dos {len(days_to_sync)} dias ausentes...")
    
    for date_str in days_to_sync:
        t0 = time.time()
        print(f"\n---> [DIA {date_str}] Listando pedidos na VTEX...")
        day_order_ids = get_day_order_ids(session, date_str)
        print(f"---> [DIA {date_str}] {len(day_order_ids)} pedidos encontrados no OMS.")
        
        # Filtra os que já temos completos
        to_fetch = [oid for oid in day_order_ids if oid not in master_cache or not master_cache[oid].get('sellers')]
        print(f"---> [DIA {date_str}] {len(to_fetch)} pedidos para buscar detalhes.")
        
        if to_fetch:
            completed_count = 0
            with ThreadPoolExecutor(max_workers=35) as executor:
                futures = {executor.submit(fetch_single_order, session, oid): oid for oid in to_fetch}
                for fut in as_completed(futures):
                    res = fut.result()
                    if res:
                        master_cache[res['orderId']] = res
                    completed_count += 1
                    if completed_count % 1000 == 0 or completed_count == len(to_fetch):
                        print(f"     Progresso {date_str}: {completed_count}/{len(to_fetch)} ({completed_count/len(to_fetch)*100:.1f}%)")
        
        t1 = time.time()
        print(f"---> [DIA {date_str}] Concluído em {t1-t0:.1f}s.")
        
        # Salva incrementalmente a cada dia
        try:
            with open(MASTER_CACHE_PATH, 'w', encoding='utf-8') as f:
                json.dump(master_cache, f, ensure_ascii=False)
            print(f"[CACHE] Salvo {MASTER_CACHE_PATH} ({len(master_cache)} pedidos)")
        except Exception as e:
            print(f"[CACHE ERROR] Erro ao salvar: {e}")

if __name__ == '__main__':
    cache = load_all_existing_caches()
    sync_missing_days(cache)
    print("\n[SYNC FINALIZADO] Todos os 30 dias sincronizados!")
