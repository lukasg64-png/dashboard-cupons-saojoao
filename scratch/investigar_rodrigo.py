import json
import re
import unicodedata

def normalizeStoreName(s):
    if not s: return ''
    s = s.lower()
    s = unicodedata.normalize('NFD', s)
    s = re.sub(r'[\u0300-\u036f]', '', s)
    s = re.sub(r'[^a-z0-9]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

# Load unificado cache and server
with open(r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\Dashboard desempenho Diretoria\dashboard-cupons-unificado\server\data\vtex_orders_cache.json', 'r', encoding='utf-8') as f:
    cache = json.load(f)

with open(r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\Dashboard desempenho Diretoria\dashboard-cupons-unificado\server\filiais_cadastro.json', 'r', encoding='utf-8') as f:
    cad = json.load(f)

# Analyze all orders for 2026-08-20
orders_20 = [o for o in cache.values() if o.get('creationDate') and (o.get('creationDate')[:10] in ('2026-08-20', '2026-08-21', '2026-08-19'))]

print(f"Total orders around 19-21 in cache: {len(orders_20)}")
