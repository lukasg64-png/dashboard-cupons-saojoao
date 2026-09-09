import pandas as pd

p_old = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\projeto C\base Lojas Atualizado.xlsx'
p_new = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\projeto C\base lojas atualizada 21.08.xlsx'

df_old = pd.read_excel(p_old)
df_new = pd.read_excel(p_new)

for df in [df_old, df_new]:
    df['Desc_Filial'] = df['Desc_Filial'].astype(str).str.strip()
    df['Distrital'] = df['Distrital'].astype(str).str.strip()
    df['Coordenador'] = df['Coordenador'].astype(str).str.strip()
    df['Diretor'] = df['Diretor'].astype(str).str.strip()

# Check all changes across all distritais
mismatches = []
for _, row in df_new.iterrows():
    store = row['Desc_Filial']
    old_row = df_old[df_old['Desc_Filial'] == store]
    if len(old_row) == 0:
        mismatches.append({'loja': store, 'tipo': 'LOJA_NOVA', 'de': 'N/A', 'para': f"{row['Diretor']} | {row['Distrital']} | {row['Coordenador']}"})
    else:
        o = old_row.iloc[0]
        if o['Distrital'] != row['Distrital'] or o['Coordenador'] != row['Coordenador'] or o['Diretor'] != row['Diretor']:
            mismatches.append({
                'loja': store,
                'tipo': 'ALTERACAO',
                'de': f"{o['Diretor']} | {o['Distrital']} | {o['Coordenador']}",
                'para': f"{row['Diretor']} | {row['Distrital']} | {row['Coordenador']}"
            })

print(f"Total de alterações gerais na base: {len(mismatches)}")
for m in mismatches:
    print(f"  • [{m['tipo']}] {m['loja']}: {m['de']} ➔ {m['para']}")
