#!/usr/bin/env bash
# The only command CI's SSH key may run on the server. It is a forced command in ~/.ssh/authorized_keys:
#   restrict,command="bash /home/ubuntu/apps/voting-system/deploy/ci-deploy.sh" ssh-ed25519 AAAA... github-actions
# so a leaked key can redeploy a commit of the deploy branch, nothing else.
#
# CI sends:  deploy <commit sha>
# The deploy branch is DEPLOY_BRANCH in the root .env on the server (default main), not something CI chooses.
#
# Everything sits inside { } so bash reads the whole file before running it:
# "git reset" may rewrite this very file.
{
    set -euo pipefail
    read -r verb sha extra <<<"${SSH_ORIGINAL_COMMAND:-}"
    if [[ $verb != deploy || ! $sha =~ ^[0-9a-f]{40}$ || -n ${extra:-} ]]; then
        echo "refused: '${SSH_ORIGINAL_COMMAND:-}'" >&2
        exit 1
    fi

    cd "$(dirname "$0")/.."
    branch=main
    if [ -f .env ]; then
        branch=$(sed -n 's/^DEPLOY_BRANCH=//p' .env | tail -1)
        branch=${branch:-main}
    fi
    git fetch -q origin "$branch"
    git merge-base --is-ancestor "$sha" "origin/$branch" || { echo "refused: $sha is not on $branch" >&2; exit 1; }
    git reset -q --hard "$sha"

    # Rebuilds what changed. A new backend drops the live connections; pages reconnect on their own.
    docker compose up -d --build --remove-orphans
    for _ in $(seq 60); do
        if curl -fsS -o /dev/null http://127.0.0.1:3000/api/isconnected && curl -fsS -o /dev/null http://127.0.0.1:3080/; then
            docker image prune -f >/dev/null
            echo "deployed $sha"
            exit 0
        fi
        sleep 2
    done
    echo "health check failed after 2 minutes" >&2
    docker compose ps >&2
    docker compose logs --tail 40 backend1 >&2
    exit 1
}
