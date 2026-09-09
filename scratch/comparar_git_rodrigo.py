import subprocess
import json

def get_cadastro_at_commit(commit, cwd):
    cmd = ['git', 'show', f'{commit}:server/filiais_cadastro.json']
    out = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8')
    return json.loads(out.stdout)

cwd_c = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\projeto C\dashboard-diretoria-c'

old_cad = get_cadastro_at_commit('2e7ab7a', cwd_c)
new_cad = get_cadastro_at_commit('4ef2e44', cwd_c)

print(f"Total lojas no cadastro antigo: {len(old_cad)}")
print(f"Total lojas no cadastro novo (21.08): {len(new_cad)}")

# Rodrigo Ferreira specifically
rodrigo_old = {k: v for k, v in old_cad.items() if 'rodrigo' in str(v.get('distrital', '')).lower()}
rodrigo_new = {k: v for k, v in new_cad.items() if 'rodrigo' in str(v.get('distrital', '')).lower()}

print(f"\n--- Rodrigo Ferreira no Cadastro Anterior: {len(rodrigo_old)} lojas ---")
print(f"--- Rodrigo Ferreira no Cadastro Novo 21.08: {len(rodrigo_new)} lojas ---")

# Coordenadores
coords_old = {}
for k, v in rodrigo_old.items():
    c = v.get('coordenador', 'Sem Coord')
    coords_old[c] = coords_old.get(c, 0) + 1

coords_new = {}
for k, v in rodrigo_new.items():
    c = v.get('coordenador', 'Sem Coord')
    coords_new[c] = coords_new.get(c, 0) + 1

print("\nCoordenadores de Rodrigo no Cadastro Anterior:")
for c, cnt in sorted(coords_old.items()):
    print(f"  • {c}: {cnt} lojas")

print("\nCoordenadores de Rodrigo no Cadastro Novo 21.08:")
for c, cnt in sorted(coords_new.items()):
    print(f"  • {c}: {cnt} lojas")

# Lojas adicionadas/removidas
lojas_old_r = set(rodrigo_old.keys())
lojas_new_r = set(rodrigo_new.keys())

saiu_r = lojas_old_r - lojas_new_r
entrou_r = lojas_new_r - lojas_old_r

print(f"\nLojas que SAÍRAM do Rodrigo Ferreira ({len(saiu_r)}):")
for s in sorted(saiu_r):
    onde_esta = new_cad.get(s, {})
    print(f"  • {s} ➔ Distrital: {onde_esta.get('distrital')} | Coord: {onde_esta.get('coordenador')}")

print(f"\nLojas que ENTRARAM no Rodrigo Ferreira ({len(entrou_r)}):")
for s in sorted(entrou_r):
    onde_estava = old_cad.get(s, {})
    agora = rodrigo_new.get(s, {})
    print(f"  • {s} ➔ Veio de: Distrital {onde_estava.get('distrital')} (Coord: {onde_estava.get('coordenador')}) | Agora Coord: {agora.get('coordenador')}")

# Mudança de coordenador dentro do Rodrigo
troca_coord = []
for s in (lojas_old_r & lojas_new_r):
    c_ant = rodrigo_old[s].get('coordenador')
    c_novo = rodrigo_new[s].get('coordenador')
    if c_ant != c_novo:
        troca_coord.append((s, c_ant, c_novo))

print(f"\nTrocas de Coordenador dentro do Rodrigo Ferreira ({len(troca_coord)}):")
for s, c_ant, c_novo in sorted(troca_coord):
    print(f"  • {s}: de '{c_ant}' ➔ para '{c_novo}'")
