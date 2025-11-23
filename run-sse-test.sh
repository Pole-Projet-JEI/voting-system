#!/bin/bash

# SSE Load Test Runner
# Optimized for production testing

set -e

# Colors
G='\033[0;32m'
R='\033[0;31m'
Y='\033[1;33m'
B='\033[0;34m'
NC='\033[0m'

echo -e "${B}========================================${NC}"
echo -e "${B}  SSE Load Test Runner${NC}"
echo -e "${B}========================================${NC}"

# Load env if exists
if [ -f .env.ssetest ]; then
    echo -e "${Y}Loading .env.ssetest...${NC}"
    export $(cat .env.ssetest | grep -v '^#' | xargs)
fi

# Defaults
BASE_URL="${BASE_URL:-http://voting.jeinsat.com}"
NUM_CLIENTS="${NUM_CLIENTS:-50}"
DURATION_MS="${DURATION_MS:-60000}"
RECONNECT_DELAY="${RECONNECT_DELAY:-3000}"
STAGGER_DELAY="${STAGGER_DELAY:-100}"

echo -e "${G}Configuration:${NC}"
echo -e "  Target:      ${BASE_URL}"
echo -e "  Clients:     ${NUM_CLIENTS}"
echo -e "  Duration:    $((DURATION_MS / 1000))s"
echo -e "  Reconnect:   ${RECONNECT_DELAY}ms"
echo -e "  Stagger:     ${STAGGER_DELAY}ms"
echo -e "${B}========================================${NC}\n"

# Check dependencies
if ! command -v node &> /dev/null; then
    echo -e "${R}Error: Node.js not found${NC}"
    exit 1
fi

# Check codes file
if [ ! -f "./server/src/seed/codes.mjs" ]; then
    echo -e "${R}Error: codes.mjs not found${NC}"
    exit 1
fi

# Run test
echo -e "${Y}Starting test...${NC}\n"

BASE_URL="$BASE_URL" \
NUM_CLIENTS="$NUM_CLIENTS" \
DURATION_MS="$DURATION_MS" \
RECONNECT_DELAY="$RECONNECT_DELAY" \
STAGGER_DELAY="$STAGGER_DELAY" \
node sse-load-test.js

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "\n${G}✓ Test completed successfully${NC}"
else
    echo -e "\n${R}✗ Test failed with code $EXIT_CODE${NC}"
fi

exit $EXIT_CODE
