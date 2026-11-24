#!/usr/bin/env bash
# Check of deploy/ci-deploy.sh: it must refuse everything but "deploy <commit on main>".
#   bash deploy/ci-deploy.test.sh
# Works in a throw-away repo with stub docker and curl; touches nothing else.
set -euo pipefail
WRAPPER=$(cd "$(dirname "$0")" && pwd)/ci-deploy.sh
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

mkdir "$W/bin"
printf '#!/bin/sh\necho "docker $*" >>"%s/calls"\n' "$W" >"$W/bin/docker"
printf '#!/bin/sh\nexit 0\n' >"$W/bin/curl"
chmod +x "$W/bin/docker" "$W/bin/curl"
export PATH="$W/bin:$PATH"

git init -q --bare "$W/origin.git"
git clone -q "$W/origin.git" "$W/app" 2>/dev/null
cd "$W/app"
git checkout -qb main
mkdir deploy && cp "$WRAPPER" deploy/ci-deploy.sh
git add . && git commit -qm one && git push -q origin main
ON_MAIN=$(git rev-parse HEAD)
git checkout -qb side && git commit -q --allow-empty -m side && git push -q origin side
OFF_MAIN=$(git rev-parse HEAD)
git checkout -q main

run() { rm -f "$W/calls"; SSH_ORIGINAL_COMMAND="$1" bash "$W/app/deploy/ci-deploy.sh" 2>&1; }
refused() {
    if out=$(run "$1"); then echo "FAIL, it ran: '$1' -> $out"; exit 1; fi
    if [ -e "$W/calls" ]; then echo "FAIL, docker was called for: '$1'"; exit 1; fi
    echo "ok refused:  $1"
}

refused ""
refused "bash"
refused "deploy abc"
refused "deploy $ON_MAIN; rm -rf ~"
refused "deploy $ON_MAIN \$(id)"
refused "deploy $ON_MAIN extra"
refused "deploy $OFF_MAIN"
out=$(run "deploy $ON_MAIN")
if [[ $out != *"deployed $ON_MAIN"* ]] || ! grep -q "docker compose up -d --build" "$W/calls"; then
    echo "FAIL: deploy -> $out"
    exit 1
fi
echo "ok deployed: deploy $ON_MAIN"
echo "all checks passed"
