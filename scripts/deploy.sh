#!/usr/bin/env bash
# PayRecord 部署运维脚本
# 用法:
#   ./scripts/deploy.sh check    # 环境体检:git/pm2/node/tz/db/服务在线
#   ./scripts/deploy.sh status   # pm2 状态 + 最近日志
#   ./scripts/deploy.sh backup   # 冷备 dev.db + .env 到 backups/(不停服务)
#   ./scripts/deploy.sh start    # pm2 start(若已停止)
#   ./scripts/deploy.sh start    # pm2 start(若已停止)
#   ./scripts/deploy.sh restart  # pm2 restart --update-env
#   ./scripts/deploy.sh upgrade  # 备份->fetch->checkout REF->install->db push->build->restart->冒烟(全自动,升级前自动备份)
#   ./scripts/deploy.sh rollback # 回滚到 backups/ 里最近一次代码回滚点(不动数据库)
#   ./scripts/deploy.sh genkey <username>  # 生成/轮换 API key(明文只显示一次)
#
# 可调参数(环境变量覆盖):
#   PR_REF       要部署的分支/commit,默认 feat/api-key-auth
#   PR_PM2_NAME  pm2 进程名,默认 payrecord
#   PR_BACKUP_DIR 备份目录,默认 <repo>/backups
#   PR_SKIP_SMOKE=1  跳过升级后冒烟(调试用)
set -euo pipefail

# ---------- 配置 ----------
PR_REF="${PR_REF:-feat/api-key-auth}"
PR_PM2_NAME="${PR_PM2_NAME:-payrecord}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PR_BACKUP_DIR="${PR_BACKUP_DIR:-$REPO_ROOT/backups}"
DB_PATH="$REPO_ROOT/prisma/dev.db"
ENV_PATH="$REPO_ROOT/.env"
SMOKE_URL_PATH="/api/auth/login"

c_red() { printf '\033[31m%s\033[0m\n' "$*"; }
c_grn() { printf '\033[32m%s\033[0m\n' "$*"; }
c_ylw() { printf '\033[33m%s\033[0m\n' "$*"; }
step() { c_ylw "==> $*"; }
die()  { c_red "ERROR: $*"; exit 1; }

need_confirm() { # $1=描述
    if [[ "${PR_YES:-0}" == "1" ]]; then c_ylw "PR_YES=1,跳过确认: $1"; return 0; fi
    local ans=""
    read -r -p "$1 确认执行? [y/N] " ans || ans=""
    [[ "$ans" == "y" || "$ans" == "Y" ]] || die "用户取消"
}

# ---------- 子命令 ----------
cmd_check() {
    step "环境体检"
    [[ -d "$REPO_ROOT/.git" ]] || die "不在 git 仓库: $REPO_ROOT"
    echo "repo:       $REPO_ROOT"
    echo "branch:     $(git -C "$REPO_ROOT" branch --show-current)  @ $(git -C "$REPO_ROOT" log --oneline -1)"
    command -v pm2 >/dev/null || die "pm2 未安装/不在 PATH"
    echo "pm2:        $(pm2 --version)"
    echo "node:       $(node -v) ($(command -v node))"
    command -v sqlite3 >/dev/null && echo "sqlite3:    $(sqlite3 --version | cut -d' ' -f1)" || c_ylw "sqlite3 未安装(备份验证退化为大小检查)"
    echo "TZ:         $(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo unknown)"
    [[ "${TZ:-}" == "Asia/Shanghai" ]] || grep -q '^Timezone=Asia/Shanghai' <(timedatectl show -p Timezone 2>/dev/null) || c_ylw "注意: 时区不是 Asia/Shanghai,按月查询边界可能偏移"
    [[ -f "$DB_PATH" ]] || die "数据库不存在: $DB_PATH"
    echo "db:         $DB_PATH ($(du -h "$DB_PATH" | cut -f1))"
    [[ -f "$ENV_PATH" ]] || die ".env 不存在: $ENV_PATH"
    if grep -q '^JWT_SECRET="default-secret-key-change-it"' "$ENV_PATH" || ! grep -q '^JWT_SECRET=' "$ENV_PATH"; then
        c_red ".env 的 JWT_SECRET 是默认值或缺失! 生产必须改成强随机值"
    else
        echo "JWT_SECRET: 已设置(值不显示)"
    fi
    if pm2 describe "$PR_PM2_NAME" >/dev/null 2>&1; then
        echo "pm2 进程:   $PR_PM2_NAME 在管; 状态: $(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);const p=a.find(x=>x.name===process.argv[1]);console.log(p?p.pm2_env.status:"not-found")})' "$PR_PM2_NAME" 2>/dev/null || echo unknown)"
    else
        c_ylw "pm2 里没有进程 $PR_PM2_NAME(首次部署? 用 PR_PM2_NAME=<名> ./scripts/deploy.sh start 初始化)"
    fi
    curl -s -o /dev/null -w '服务探活:   %{http_code}\n' --max-time 5 "http://localhost:8082$SMOKE_URL_PATH" || c_ylw "8082 未响应(服务未启动?)"
    c_grn "体检完成"
}

cmd_status() {
    step "pm2 状态"
    pm2 describe "$PR_PM2_NAME" 2>/dev/null || c_ylw "无 $PR_PM2_NAME 进程"
    echo; step "最近 25 行日志"
    pm2 logs "$PR_PM2_NAME" --lines 25 --nostream
}

do_backup() { # $1=标签
    step "备份(标签: $1)"
    mkdir -p "$PR_BACKUP_DIR"
    local ts tag; ts="$(date +%Y%m%d-%H%M%S)"; tag="$1"
    local dbbak="$PR_BACKUP_DIR/dev.db.$tag.$ts"
    local envbak="$PR_BACKUP_DIR/env.$tag.$ts"
    pm2 stop "$PR_PM2_NAME" >/dev/null 2>&1 || true
    sleep 1
    cp "$DB_PATH" "$dbbak"
    cp "$ENV_PATH" "$envbak"
    pm2 start "$PR_PM2_NAME" >/dev/null 2>&1 || true
    if command -v sqlite3 >/dev/null; then
        local n; n="$(sqlite3 "$dbbak" 'SELECT COUNT(*) FROM Bill;' 2>/dev/null)" || n=""
        [[ "$n" =~ ^[0-9]+$ ]] || die "备份文件无法读取: $dbbak"
        echo "  备份OK: $dbbak (Bill 数=$n)"
    else
        local sz; sz=$(stat -c%s "$dbbak")
        [[ "$sz" -gt 0 ]] || die "备份文件为空: $dbbak"
        echo "  备份OK: $dbbak (大小=$sz B,无 sqlite3 未做行数验证)"
    fi
    echo "  备份OK: $envbak"
    echo "$dbbak" > "$PR_BACKUP_DIR/last_db_backup"
    # 只保留最近 10 份
    ls -1t "$PR_BACKUP_DIR"/dev.db.* 2>/dev/null | tail -n +11 | xargs -r rm -f
    ls -1t "$PR_BACKUP_DIR"/env.* 2>/dev/null | tail -n +11 | xargs -r rm -f
}

cmd_backup() { need_confirm "backup(会短暂 stop/start 服务)"; do_backup manual; c_grn "备份完成"; }

restore_db() { # $1=备份文件
    step "恢复数据库: $1"
    [[ -f "$1" ]] || die "备份文件不存在"
    need_confirm "用 $1 覆盖当前数据库(当前数据将丢失)"
    pm2 stop "$PR_PM2_NAME" >/dev/null 2>&1 || true
    cp "$1" "$DB_PATH"
    pm2 start "$PR_PM2_NAME" >/dev/null 2>&1 || true
    c_grn "数据库已恢复,服务已启动"
}

cmd_restore() {
    step "可用备份(新->旧)"
    ls -1t "$PR_BACKUP_DIR"/dev.db.* 2>/dev/null || die "无备份"
    local f; f="$(ls -1t "$PR_BACKUP_DIR"/dev.db.* | head -1)"
    c_ylw "将恢复最新: $f (restore-db <file> 可指定)"
    restore_db "$f"
}

cmd_restore_db() { restore_db "$1"; }

smoke() {
    step "冒烟: POST $SMOKE_URL_PATH 期望 401"
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "http://localhost:8082$SMOKE_URL_PATH" \
        -H 'Content-Type: application/json' -d '{"username":"x","password":"x"}')" || code="000"
    if [[ "$code" == "401" ]]; then c_grn "冒烟通过(401)"; return 0; fi
    c_red "冒烟失败: HTTP $code"
    pm2 logs "$PR_PM2_NAME" --lines 30 --nostream || true
    return 1
}

cmd_upgrade() {
    step "升级到: $PR_REF"
    local old; old="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
    echo "  当前: $old -> 目标: $PR_REF"
    need_confirm "升级(自动备份 -> checkout $PR_REF -> install/db push/build -> restart)"
    do_backup pre-upgrade
    step "fetch"
    git -C "$REPO_ROOT" fetch origin || die "git fetch 失败(网络/凭证)"
    step "checkout $PR_REF"
    git -C "$REPO_ROOT" checkout "$PR_REF" || die "checkout 失败(有未提交改动? 先 git status)"
    git -C "$REPO_ROOT" log --oneline -1
    step "npm install"
    npm --prefix "$REPO_ROOT" install --no-audit --no-fund || die "npm install 失败"
    step "prisma db push"
    (cd "$REPO_ROOT" && npx prisma db push) || die "prisma db push 失败"
    step "npm run build"
    npm --prefix "$REPO_ROOT" run build || { c_red "build 失败"; hint_rollback "$old"; die; }
    step "restart"
    pm2 restart "$PR_PM2_NAME" --update-env || die "pm2 restart 失败"
    sleep 3
    if [[ "${PR_SKIP_SMOKE:-0}" != "1" ]]; then
        smoke || { hint_rollback "$old"; die "冒烟未过,建议回滚"; }
    fi
    c_grn "升级完成: $old -> $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
    c_ylw "网页回归清单(API.md/部署待办里有):登录/翻月/编辑/金额0/克隆/日历"
}

hint_rollback() { c_ylw "回滚: git -C $REPO_ROOT checkout $1 && npm --prefix $REPO_ROOT install && npm --prefix $REPO_ROOT run build && pm2 restart $PR_PM2_NAME"; }

cmd_rollback() {
    step "代码回滚(不动数据库)"
    local cur; cur="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
    local cur_name; cur_name="$(git -C "$REPO_ROOT" branch --show-current || true)"
    [[ -n "$cur_name" ]] || cur_name="$cur"
    local prev; prev="$(git -C "$REPO_ROOT" reflog -30 2>/dev/null \
        | awk '/checkout: moving from/ {for(i=1;i<NF;i++) if($i=="from") print $(i+1)}' \
        | grep -vxF "$cur_name" | head -1 || true)"
    [[ -n "$prev" ]] || die "无法从 reflog 推断回滚点;手动执行: git checkout <旧commit> && npm install && npm run build && pm2 restart $PR_PM2_NAME"
    echo "  当前: $cur  回滚点(reflog): $prev"
    need_confirm "回滚代码到 $prev 并 rebuild/restart"
    git -C "$REPO_ROOT" checkout "$prev" || die "checkout 失败"
    npm --prefix "$REPO_ROOT" install --no-audit --no-fund || die "npm install 失败"
    npm --prefix "$REPO_ROOT" run build || die "build 失败"
    pm2 restart "$PR_PM2_NAME" --update-env || die "pm2 restart 失败"
    sleep 2
    c_grn "已回滚到 $prev(数据库未动;如需恢复数据: ./scripts/deploy.sh restore-db <file>)"
}

cmd_genkey() {
    local u="${1:-}"
    [[ -n "$u" ]] || die "用法: deploy.sh genkey <username>"
    step "生成 API key: $u"
    (cd "$REPO_ROOT" && node scripts/generate-api-key.js "$u")
    c_ylw "明文只显示这一次,立即保存!"
}

cmd_start()   { step "start"; pm2 start "$PR_PM2_NAME" >/dev/null 2>&1 && c_grn "已启动" || die "pm2 start 失败(进程不在管? 先 pm2 start npm --name $PR_PM2_NAME -- start)"; }
cmd_stop()    { need_confirm "stop $PR_PM2_NAME"; step "stop"; pm2 stop "$PR_PM2_NAME" && c_grn "已停止"; }
cmd_restart() { step "restart"; pm2 restart "$PR_PM2_NAME" --update-env && c_grn "已重启"; }

usage() { sed -n '2,20p' "${BASH_SOURCE[0]}"; }

case "${1:-}" in
    check) cmd_check ;;
    status) cmd_status ;;
    backup) cmd_backup ;;
    restore) cmd_restore ;;
    restore-db) [[ -n "${2:-}" ]] || die "用法: deploy.sh restore-db <备份文件>"; cmd_restore_db "$2" ;;
    upgrade) cmd_upgrade ;;
    rollback) cmd_rollback ;;
    genkey) shift; cmd_genkey "$@" ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    *) usage; exit 1 ;;
esac
