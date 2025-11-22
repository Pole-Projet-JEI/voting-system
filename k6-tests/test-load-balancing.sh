#!/bin/bash

# ============================================
# Quick Load Balancing Test Runner
# Run this on your Mac to test production
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://voting.jeinsat.com}"

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Load Balancing Test - Quick Start ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Target: ${BASE_URL}${NC}"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}❌ k6 is not installed${NC}"
    echo -e "${YELLOW}Install with: brew install k6${NC}"
    exit 1
fi

# Check if voter codes exist
if [ ! -f "voter-codes.json" ]; then
    echo -e "${YELLOW}⚠️  Voter codes not found. Extracting...${NC}"
    node extract-voter-codes.mjs
    echo -e "${GREEN}✅ Codes extracted${NC}"
fi

# Check server is reachable
echo -e "${YELLOW}🔍 Checking server...${NC}"
if ! curl -s -f "${BASE_URL}/api/isconnected" > /dev/null; then
    echo -e "${RED}❌ Cannot reach ${BASE_URL}${NC}"
    echo -e "${YELLOW}Make sure the server is running!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Server is reachable${NC}"

# Check team is presenting
TEAM_RESPONSE=$(curl -s "${BASE_URL}/api/currentteam")
if echo "$TEAM_RESPONSE" | grep -q "\"teamID\":null"; then
    echo -e "${RED}❌ No team is currently presenting${NC}"
    echo -e "${YELLOW}Please set a team via admin panel first${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Team is presenting${NC}"

echo ""
echo -e "${BLUE}═════════════════════════════════════${NC}"
echo -e "${CYAN}Select Test:${NC}"
echo -e "${BLUE}═════════════════════════════════════${NC}"
echo -e "  ${GREEN}1${NC}) Quick Smoke Test (10 users, 1 min)"
echo -e "  ${GREEN}2${NC}) Light Load Test (25 users, 2 min)"
echo -e "  ${GREEN}3${NC}) Medium Load Test (50 users, 3 min)"
echo -e "  ${GREEN}4${NC}) Load Balancing Test (10→100 users, gradual) ${YELLOW}← Recommended${NC}"
echo -e "  ${GREEN}5${NC}) Heavy Load Test (100 users, 5 min)"
echo -e "  ${GREEN}6${NC}) Stress Test (200 users, 3 min) ${RED}⚠️  May cause errors${NC}"
echo -e "${BLUE}═════════════════════════════════════${NC}"
echo ""

read -p "$(echo -e ${CYAN}Enter choice [1-6]:${NC} )" choice

case $choice in
    1)
        echo -e "\n${BLUE}🚀 Running Quick Smoke Test...${NC}\n"
        k6 run --vus 10 --duration 1m \
            --env BASE_URL="${BASE_URL}" \
            k6-voter-flow.js
        ;;
    2)
        echo -e "\n${BLUE}🚀 Running Light Load Test...${NC}\n"
        k6 run --vus 25 --duration 2m \
            --env BASE_URL="${BASE_URL}" \
            k6-voter-flow.js
        ;;
    3)
        echo -e "\n${BLUE}🚀 Running Medium Load Test...${NC}\n"
        k6 run --vus 50 --duration 3m \
            --env BASE_URL="${BASE_URL}" \
            k6-voter-flow.js
        ;;
    4)
        echo -e "\n${BLUE}🚀 Running Load Balancing Test (Recommended)...${NC}\n"
        echo -e "${CYAN}This test gradually increases load from 10 to 100 users${NC}"
        echo -e "${CYAN}Perfect for finding your capacity and testing load balancing${NC}\n"
        k6 run --env BASE_URL="${BASE_URL}" k6-load-balancing-test.js
        ;;
    5)
        echo -e "\n${YELLOW}⚠️  Heavy Load Test - This may cause some errors${NC}"
        read -p "Continue? (y/n): " confirm
        if [ "$confirm" = "y" ]; then
            echo -e "\n${BLUE}🚀 Running Heavy Load Test...${NC}\n"
            k6 run --vus 100 --duration 5m \
                --env BASE_URL="${BASE_URL}" \
                k6-voter-flow.js
        else
            echo -e "${YELLOW}Test cancelled${NC}"
            exit 0
        fi
        ;;
    6)
        echo -e "\n${RED}⚠️  Stress Test - This WILL likely cause errors!${NC}"
        echo -e "${YELLOW}This is meant to find the breaking point${NC}"
        read -p "Continue? (y/n): " confirm
        if [ "$confirm" = "y" ]; then
            echo -e "\n${BLUE}🚀 Running Stress Test...${NC}\n"
            k6 run --vus 200 --duration 3m \
                --env BASE_URL="${BASE_URL}" \
                k6-voter-flow.js
        else
            echo -e "${YELLOW}Test cancelled${NC}"
            exit 0
        fi
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Test Completed               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}📊 Next Steps:${NC}"
echo -e "  1. Check the test summary above"
echo -e "  2. Verify load distribution on VPS:"
echo -e "     ${YELLOW}ssh ubuntu@51.210.255.109${NC}"
echo -e "     ${YELLOW}cd ~/apps/voting${NC}"
echo -e "     ${YELLOW}./verify-load-balancing.sh${NC}"
echo ""
echo -e "${GREEN}✅ All done!${NC}"

