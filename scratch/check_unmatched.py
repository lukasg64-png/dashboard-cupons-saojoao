import json

with open(r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\Dashboard desempenho Diretoria\dashboard-cupons-unificado\server\data\vtex_orders_cache.json', 'r', encoding='utf-8') as f:
    cache = json.load(f)

with open(r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\Dashboard desempenho Diretoria\dashboard-cupons-unificado\server\filiais_cadastro.json', 'r', encoding='utf-8') as f:
    cad = json.load(f)

# Look at 2026-08-20 orders with coupon
unmatched_sellers = {}
matched_rodrigo = []
matched_other = []

for o in cache.values():
    cd = o.get('creationDate')
    if cd and cd[:10] == '2026-08-20':
        coupon = o.get('coupon')
        if coupon and str(coupon).strip() not in ('null', ''):
            seller = o.get('sellers', [{}])[0].get('name', '')
            # check if seller matches Rodrigo stores in cad
            matched = False
            for s_name, s_info in cad.items():
                if s_name.lower() in seller.lower():
                    matched = True
                    if s_info.get('distrital') == 'Rodrigo Ferreira':
                        matched_rodrigo.append((o.get('orderId'), seller, s_name, s_info.get('coordenador'), coupon))
                    else:
                        matched_other.append((o.get('orderId'), seller, s_name, s_info.get('distrital'), coupon))
                    break
            if not matched:
                unmatched_sellers[seller] = unmatched_sellers.get(seller, 0) + 1

print(f"Matched Rodrigo: {len(matched_rodrigo)}")
print(f"Matched Other: {len(matched_other)}")
print(f"Unmatched Sellers count: {sum(unmatched_sellers.values())}")
print("Unmatched sellers list:", unmatched_sellers)
