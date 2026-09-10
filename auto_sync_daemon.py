#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DAEMON DE ATUALIZAÇÃO CONTÍNUA — DASHBOARD CUPONS FARMÁCIAS SÃO JOÃO
Sincroniza pedidos com cupom da VTEX a cada 30 minutos, atualiza o banco
SQLite, regera o snapshot estático e publica automaticamente no GitHub Pages.
"""

import os
import sys
import time
import subprocess
from datetime import datetime

# Garante suporte a UTF-8 no console Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INTERVAL_MINUTES = 60

def log(msg):
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    line = f"[{now_str}] {msg}"
    try:
        print(line)
    except UnicodeEncodeError:
        print(line.encode('ascii', 'replace').decode('ascii'))
    log_dir = os.path.join(BASE_DIR, "logs")
    os.makedirs(log_dir, exist_ok=True)
    with open(os.path.join(log_dir, "auto_sync.log"), "a", encoding="utf-8") as f:
        f.write(line + "\n")

def run_sync_cycle():
    log("=" * 65)
    log("🔄 INICIANDO CICLO DE ATUALIZAÇÃO — DASHBOARD CUPONS")
    log("=" * 65)

    # 1. Sincronizar dia atual da VTEX para memória
    log("[1/4] Sincronizando com VTEX OMS (dia atual)...")
    synced_via_api = False
    try:
        import urllib.request
        req = urllib.request.Request("http://localhost:3007/api/vtex-sync", data=b"{}")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                log("   ✅ Sync incremental disparado com sucesso via servidor local (porta 3007).")
                synced_via_api = True
                time.sleep(5)  # Breve pausa para o lote inicial
    except Exception:
        pass

    if not synced_via_api:
        try:
            res = subprocess.run(
                ["node", "-e", "require('./server/vtexSync').syncTodayOnly().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); })"],
                cwd=BASE_DIR, capture_output=True, text=True, timeout=120
            )
            if res.returncode != 0:
                log(f"   ⚠️ Aviso sync VTEX: {res.stderr.strip()[:200]}")
            else:
                log("   ✅ Sync VTEX concluído via CLI.")
        except Exception as e:
            log(f"   ℹ️ Sync VTEX em background: {e}")

    # 2. Exportar dados estáticos (Hoje + Histórico SQLite)
    log("[2/4] Exportando dados estáticos (SQLite + Hoje)...")
    try:
        res = subprocess.run(
            ["node", "export_static_data.js"],
            cwd=BASE_DIR, capture_output=True, text=True, timeout=60
        )
        if res.returncode != 0:
            log(f"   ❌ Erro na exportação estática: {res.stderr.strip()[:300]}")
            return False
        log("   ✅ Dados exportados.")
    except Exception as e:
        log(f"   ❌ Erro na exportação estática: {e}")
        return False

    # 3. Gerar bundle de produção com Vite
    log("[3/4] Compilando bundle Vite...")
    try:
        res = subprocess.run(
            ["npm.cmd", "run", "build"],
            cwd=BASE_DIR, capture_output=True, text=True, timeout=90
        )
        if res.returncode != 0:
            log(f"   ❌ Erro no build Vite (código {res.returncode}): {res.stderr.strip()[:300]}")
            return False
        log("   ✅ Build Vite concluído.")
    except Exception as e:
        log(f"   ❌ Erro no build Vite: {e}")
        return False

    # 4. Publicar na branch gh-pages
    log("[4/4] Publicando no GitHub Pages...")
    try:
        res = subprocess.run(
            [sys.executable, "deploy_pages.py"],
            cwd=BASE_DIR, capture_output=True, text=True, timeout=90
        )
        if res.returncode == 0:
            log("   ✅ Publicado com sucesso no GitHub Pages!")
            log("   🌐 Online: https://lukasg64-png.github.io/dashboard-cupons-saojoao/")
            return True
        else:
            log(f"   ❌ Falha no deploy: {res.stderr.strip()[:300]}")
            return False
    except Exception as e:
        log(f"   ❌ Erro ao publicar: {e}")
        return False

def main():
    # Se chamado com --once, executa apenas 1 ciclo e sai
    if "--once" in sys.argv:
        run_sync_cycle()
        return

    log("=" * 65)
    log("  DAEMON DE ATUALIZAÇÃO CONTÍNUA — CUPONS FARMÁCIAS SÃO JOÃO")
    log(f"  Frequência programada: a cada {INTERVAL_MINUTES} minutos")
    log("  Pressione Ctrl + C para encerrar a qualquer momento")
    log("=" * 65)

    iteration = 1
    while True:
        log(f"\n--- Ciclo #{iteration} ---")
        run_sync_cycle()
        iteration += 1
        sleep_secs = INTERVAL_MINUTES * 60
        log(f"⏳ Aguardando próximo ciclo em {INTERVAL_MINUTES} minutos...")
        time.sleep(sleep_secs)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("🛑 Daemon finalizado pelo usuário.")
