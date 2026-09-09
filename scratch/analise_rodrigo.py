import pandas as pd
import json

p_old = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\projeto C\base Lojas Atualizado.xlsx'
p_new = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\projeto C\base lojas atualizada 21.08.xlsx'

df_old = pd.read_excel(p_old)
df_new = pd.read_excel(p_new)

# Standardize
for df in [df_old, df_new]:
    df['Desc_Filial'] = df['Desc_Filial'].astype(str).str.strip()
    df['Distrital'] = df['Distrital'].astype(str).str.strip()
    df['Coordenador'] = df['Coordenador'].astype(str).str.strip()
    df['Diretor'] = df['Diretor'].astype(str).str.strip()

# Check all stores where Distrital is Rodrigo Ferreira in old
old_rodrigo = df_old[df_old['Distrital'] == 'Rodrigo Ferreira'].copy()
new_rodrigo = df_new[df_new['Distrital'] == 'Rodrigo Ferreira'].copy()

print(f"Total lojas no Rodrigo (Base Antiga): {len(old_rodrigo)}")
print(f"Total lojas no Rodrigo (Base 21.08): {len(new_rodrigo)}")

print("\n--- Coordenadores no Rodrigo (Base Antiga) ---")
print(old_rodrigo.groupby('Coordenador')['Desc_Filial'].count().to_string())

print("\n--- Coordenadores no Rodrigo (Base 21.08) ---")
print(new_rodrigo.groupby('Coordenador')['Desc_Filial'].count().to_string())

old_stores = set(old_rodrigo['Desc_Filial'])
new_stores = set(new_rodrigo['Desc_Filial'])

removed_from_rodrigo = old_stores - new_stores
added_to_rodrigo = new_stores - old_stores

print(f"\n--- Lojas que SAÍRAM do Rodrigo Ferreira ({len(removed_from_rodrigo)}) ---")
for s in sorted(removed_from_rodrigo):
    where_new = df_new[df_new['Desc_Filial'] == s]
    if len(where_new) > 0:
        print(f"  • {s} -> Foi para Distrital: {where_new.iloc[0]['Distrital']} | Coord: {where_new.iloc[0]['Coordenador']}")
    else:
        print(f"  • {s} -> Não consta na base nova")

print(f"\n--- Lojas que ENTRARAM no Rodrigo Ferreira ({len(added_to_rodrigo)}) ---")
for s in sorted(added_to_rodrigo):
    where_old = df_old[df_old['Desc_Filial'] == s]
    if len(where_old) > 0:
        print(f"  • {s} <- Veio de Distrital: {where_old.iloc[0]['Distrital']} | Coord: {where_old.iloc[0]['Coordenador']} -> Agora com Coord: {new_rodrigo[new_rodrigo['Desc_Filial']==s].iloc[0]['Coordenador']}")
    else:
        print(f"  • {s} <- Loja nova na rede -> Coord: {new_rodrigo[new_rodrigo['Desc_Filial']==s].iloc[0]['Coordenador']}")

# Coordinator changes among common stores
common_stores = old_stores & new_stores
coord_changes = []
for s in common_stores:
    c_old = old_rodrigo[old_rodrigo['Desc_Filial'] == s].iloc[0]['Coordenador']
    c_new = new_rodrigo[new_rodrigo['Desc_Filial'] == s].iloc[0]['Coordenador']
    if c_old != c_new:
        coord_changes.append((s, c_old, c_new))

print(f"\n--- Trocas de Coordenador DENTRO do Rodrigo Ferreira ({len(coord_changes)}) ---")
for s, c_old, c_new in sorted(coord_changes):
    print(f"  • {s}: de '{c_old}' ➔ para '{c_new}'")
