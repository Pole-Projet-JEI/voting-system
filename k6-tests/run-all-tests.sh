#!/bin/bash

# ============================================
# K6 Load Testing Suite Runner
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_KEY="${ADMIN_KEY}"
REPORT_DIR="./reports"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  K6 Load Testing Suite${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "  Base URL: ${BASE_URL}"
echo -e "  Report Dir: ${REPORT_DIR}"
echo -e "${BLUE}==========================================${NC}\n"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}❌ k6 is not installed${NC}"
    echo -e "${YELLOW}Install it from: https://k6.io/docs/getting-started/installation/${NC}"
    exit 1
fi

# Check if voter codes exist
if [ ! -f "./voter-codes.json" ]; then
    echo -e "${YELLOW}⚠️  voter-codes.json not found. Extracting codes...${NC}"
    node extract-voter-codes.mjs
fi

# Create reports directory
mkdir -p "${REPORT_DIR}"

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local report_file="${REPORT_DIR}/${test_name}-$(date +%Y%m%d-%H%M%S)"
    
    echo -e "\n${BLUE}===========================================${NC}"
    echo -e "${BLUE}  Running: ${test_name}${NC}"
    echo -e "${BLUE}===========================================${NC}\n"
    
    # Run k6 test
    if [ -n "${ADMIN_KEY}" ]; then
        k6 run \
            --env BASE_URL="${BASE_URL}" \
            --env ADMIN_KEY="${ADMIN_KEY}" \
            --summary-export="${report_file}.json" \
            "${test_file}" \
            2>&1 | tee "${report_file}.log"
    else
        k6 run \
            --env BASE_URL="${BASE_URL}" \
            --summary-export="${report_file}.json" \
            "${test_file}" \
            2>&1 | tee "${report_file}.log"
    fi
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo -e "\n${GREEN}✅ ${test_name} PASSED${NC}"
    else
        echo -e "\n${RED}❌ ${test_name} FAILED${NC}"
    fi
    
    return $exit_code
}

# Test selection
echo -e "${YELLOW}Select test to run:${NC}"
echo -e "  1) Voter Flow Test (registration + voting)"
echo -e "  2) SSE Connection Test (real-time updates)"
echo -e "  3) Admin Operations Test"
echo -e "  4) Mixed Workload Test (recommended)"
echo -e "  5) Run ALL tests"
echo -e "  6) Quick smoke test"
echo ""

read -p "Enter choice [1-6]: " choice

case $choice in
    1)
        run_test "voter-flow" "k6-voter-flow.js"
        ;;
    2)
        run_test "sse-test" "k6-sse-test.js"
        ;;
    3)
        if [ -z "${ADMIN_KEY}" ]; then
            echo -e "${RED}❌ ADMIN_KEY environment variable is required${NC}"
            exit 1
        fi
        run_test "admin-test" "k6-admin-test.js"
        ;;
    4)
        run_test "mixed-workload" "k6-mixed-workload.js"
        ;;
    5)
        echo -e "\n${BLUE}Running ALL tests...${NC}\n"
        run_test "voter-flow" "k6-voter-flow.js"
        run_test "sse-test" "k6-sse-test.js"
        if [ -n "${ADMIN_KEY}" ]; then
            run_test "admin-test" "k6-admin-test.js"
        fi
        run_test "mixed-workload" "k6-mixed-workload.js"
        ;;
    6)
        echo -e "\n${BLUE}Running quick smoke test...${NC}\n"
        k6 run --vus 10 --duration 30s --env BASE_URL="${BASE_URL}" k6-voter-flow.js
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo -e "\n${BLUE}==========================================${NC}"
echo -e "${GREEN}✅ Test execution completed${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "📊 Reports saved to: ${REPORT_DIR}"
echo ""

