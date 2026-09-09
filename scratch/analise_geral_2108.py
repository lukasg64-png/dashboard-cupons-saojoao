import subprocess
import json

def compare_commits(commit_old, commit_new, cwd, label):
    cmd_old = ['git', 'show', f'{commit_old}:server/filiais_cadastro.json']
    out_old = subprocess.run(cmd_old, cwd=cwd, capture_output=True, text=True, encoding='utf-8')
    old_cad = json.loads(out_old.stdout)

    cmd_new = ['git', 'show', f'{commit_new}:server/filiais_cadastro.json']
    out_new = subprocess.run(cmd_new, cwd=cwd, capture_output=True, text=True, encoding='utf-8')
    new_cad = json.loads(out_new.stdout)

    print(f"\n=================== {label} ===================")
    changes = []
    for k, v_new in new_cad.items():
        if k not in old_cad:
            changes.append({'loja': k, 'tipo': 'LOJA_NOVA', 'de': 'N/A', 'para': f"{v_new.get('distrital')} | {v_new.get('coordenador')}"})
        else:
            v_old = old_cad[k]
            if v_old.get('distrital') != v_new.get('distrital') or v_old.get('coordenador') != v_new.get('coordenador'):
                changes.append({
                    'loja': k,
                    'tipo': 'MUDANCA',
                    'de': f"Distrital: {v_old.get('distrital')} | Coord: {v_old.get('coordenador')}",
                    'para': f"Distrital: {v_new.get('distrital')} | Coord: {v_new.get('coordenador')}"
                })
    for k, v_old in old_cad.items():
        if k not in new_cad:
            changes.append({'loja': k, 'tipo': 'REMOVIDA', 'de': f"{v_old.get('distrital')} | {v_old.get('coordenador')}", 'para': 'N/A'})

    print(f"Total de alterações em {label}: {len(changes)}")
    for c in changes:
        print(f"  * [{c['tipo']}] {c['loja']}: {c['de']} -> {c['para']}")

cwd_c = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\projeto C\dashboard-diretoria-c'
compare_commits('2e7ab7a', '4ef2e44', cwd_c, 'DIRETORIA C')

cwd_l = r'c:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\projeto L\dashboard-diretoria-l'
compare_commits('0483bf9', 'c48d031', cwd_l, 'DIRETORIA L')
