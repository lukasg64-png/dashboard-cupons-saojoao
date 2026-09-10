import subprocess, os, shutil, tempfile

def deploy_gh_pages():
    dist_dir = os.path.abspath('dist')
    index_file = os.path.join(dist_dir, 'index.html')
    if not os.path.exists(dist_dir) or not os.path.exists(index_file):
        print('Erro: dist/index.html nao existe! O build Vite falhou ou nao foi executado.')
        return False
        
    temp_dir = tempfile.mkdtemp()
    try:
        print('[1/4] Copiando arquivos compilados de dist/ para diretorio temporario...')
        shutil.copytree(dist_dir, os.path.join(temp_dir, 'site'))
        site_dir = os.path.join(temp_dir, 'site')
        
        print('[2/4] Inicializando git na branch gh-pages...')
        subprocess.run(['git', 'init'], cwd=site_dir, check=True)
        subprocess.run(['git', 'remote', 'add', 'origin', 'https://github.com/lukasg64-png/dashboard-cupons-saojoao.git'], cwd=site_dir, check=True)
        subprocess.run(['git', 'checkout', '-b', 'gh-pages'], cwd=site_dir, check=True)
        
        # Criar .nojekyll para o GitHub Pages nao ignorar pastas com underline se houver
        with open(os.path.join(site_dir, '.nojekyll'), 'w') as f:
            f.write('')
            
        print('[3/4] Comitando arquivos estaticos...')
        subprocess.run(['git', 'add', '-A'], cwd=site_dir, check=True)
        subprocess.run(['git', 'commit', '-m', 'Deploy GitHub Pages - Full Static Dashboard'], cwd=site_dir, check=True)
        
        print('[4/4] Enviando para origin gh-pages...')
        res = subprocess.run(['git', 'push', '--force', 'origin', 'gh-pages'], cwd=site_dir, capture_output=True, text=True)
        if res.returncode == 0:
            print('Publicado com sucesso no GitHub Pages!')
            print('Dashboard Online: https://lukasg64-png.github.io/dashboard-cupons-saojoao/')
            return True
        else:
            print('Erro no push:', res.stderr)
            return False
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == '__main__':
    deploy_gh_pages()