import os
import json
import time
import requests
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
CACHE_PATH = os.path.join(BASE_DIR, 'Dashboard desempenho Diretoria', 'dashboard-cupons-unificado', 'server', 'data', 'vtex_orders_cache.json')

def create_session():
    s = requests.Session()
    retries = Retry(total=3, backoff_factor=0.3, status_forcelist=[429, 500, 502, 503, 504])
    s.mount('https://', HTTPAdapter(pool_connections=70, pool_maxsize=70, max_retries=retries))
    return s

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
            time.sleep(0.3 * (attempt + 1))
    return None

def fetch_window(session, start_hour, end_hour):
    start_t = f'{start_hour:02d}:00:00.000Z'
    end_t = f'{end_hour:02d}:59:59.999Z'
    window_ids = []
    page = 1
    while True:
        url = f'https://{ACCOUNT}.vtexcommercestable.com.br/api/oms/pvt/orders?f_creationDate=creationDate:[2026-08-31T{start_t} TO 2026-08-31T{end_t}]&per_page=100&page={page}'
        try:
            r = session.get(url, headers=HEADERS, timeout=20)
            if r.status_code != 200: break
            data = r.json()
            lst = data.get('list', [])
            if not lst: break
            window_ids.extend([o['orderId'] for o in lst])
            if page >= data.get('paging', {}).get('pages', 1): break
            page += 1
        except Exception:
            break
    return window_ids

def main():
    print('[1/4] Carregando cache mestre...')
    with open(CACHE_PATH, 'r', encoding='utf-8') as f:
        cache = json.load(f)
    print(f'Total de pedidos no cache atual: {len(cache)}')

    session = create_session()
    print('[2/4] Listando pedidos de 31/08/2026 em paralelo...')
    t0 = time.time()
    all_ids = []
    with ThreadPoolExecutor(max_workers=24) as ex:
        futs = [ex.submit(fetch_window, session, h, h) for h in range(24)]
        for f in as_completed(futs):
            all_ids.extend(f.result())
    all_ids = list(dict.fromkeys(all_ids))
    print(f'Total de pedidos em 31/08: {len(all_ids)} (listados em {time.time()-t0:.2f}s)')

    to_fetch = [oid for oid in all_ids if oid not in cache or not cache[oid].get('sellers')]
    print(f'[3/4] Pedidos para baixar detalhes: {len(to_fetch)}')

    if to_fetch:
        t_fetch = time.time()
        completed = 0
        with ThreadPoolExecutor(max_workers=50) as executor:
            futures = {executor.submit(fetch_single_order, session, oid): oid for oid in to_fetch}
            for fut in as_completed(futures):
                res = fut.result()
                if res:
                    cache[res['orderId']] = res
                completed += 1
                if completed % 1000 == 0 or completed == len(to_fetch):
                    print(f'     Progresso 31/08: {completed}/{len(to_fetch)} ({completed/len(to_fetch)*100:.1f}%) - {completed/(time.time()-t_fetch):.1f} req/s')

        print(f'Detalhes baixados em {time.time()-t_fetch:.2f}s.')

    print('[4/4] Gravando cache atualizado...')
    with open(CACHE_PATH, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False)
    print(f'Cache salvo com sucesso! Novo total de pedidos: {len(cache)}')

if __name__ == '__main__':
    main()
