#!/bin/bash

# ============================================
# Load Balancing Verification Script
# Run this on your VPS to verify load distribution
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Load Balancing Verification${NC}"
echo -e "${BLUE}==========================================${NC}\n"

# Check if load balancer is running
echo -e "${YELLOW}1. Checking services...${NC}"

if docker ps | grep -q "nginx-loadbalancer"; then
    echo -e "${GREEN}✓ Nginx load balancer is running${NC}"
else
    echo -e "${RED}✗ Nginx load balancer is NOT running${NC}"
    echo -e "${YELLOW}  Start it with: docker compose -f docker-compose.lb.yml up -d${NC}"
    exit 1
fi

BACKEND1_RUNNING=$(docker ps | grep -c "voting-backend1-1" || echo 0)
BACKEND2_RUNNING=$(docker ps | grep -c "voting-backend2-1" || echo 0)

if [ "$BACKEND1_RUNNING" -gt 0 ]; then
    echo -e "${GREEN}✓ Backend 1 is running${NC}"
else
    echo -e "${RED}✗ Backend 1 is NOT running${NC}"
fi

if [ "$BACKEND2_RUNNING" -gt 0 ]; then
    echo -e "${GREEN}✓ Backend 2 is running${NC}"
else
    echo -e "${RED}✗ Backend 2 is NOT running${NC}"
fi

if [ "$BACKEND1_RUNNING" -eq 0 ] || [ "$BACKEND2_RUNNING" -eq 0 ]; then
    echo -e "${RED}Both backends must be running for load balancing!${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}2. Clearing logs to measure fresh distribution...${NC}"
docker compose -f docker-compose.lb.yml restart backend1 backend2
sleep 5
echo -e "${GREEN}✓ Logs cleared${NC}"

echo ""
echo -e "${YELLOW}3. Sending 100 test requests...${NC}"

for i in {1..100}; do
    curl -s http://localhost:3000/api/isconnected > /dev/null 2>&1
    [ $((i % 20)) -eq 0 ] && echo -e "${CYAN}  Sent $i requests...${NC}"
done

echo -e "${GREEN}✓ Sent 100 requests${NC}"

echo ""
echo -e "${YELLOW}4. Analyzing distribution...${NC}"
sleep 2

B1_REGISTER=$(docker logs voting-backend1-1 2>&1 | grep -c "GET /api/isconnected" || echo 0)
B2_REGISTER=$(docker logs voting-backend2-1 2>&1 | grep -c "GET /api/isconnected" || echo 0)

TOTAL=$((B1_REGISTER + B2_REGISTER))

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Distribution Results${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "  Backend 1: ${GREEN}$B1_REGISTER${NC} requests"
echo -e "  Backend 2: ${GREEN}$B2_REGISTER${NC} requests"
echo -e "  Total:     ${CYAN}$TOTAL${NC} requests"
echo ""

if [ "$TOTAL" -eq 0 ]; then
    echo -e "${RED}✗ No requests logged! Check nginx-lb configuration${NC}"
    exit 1
fi

B1_PERCENT=$((B1_REGISTER * 100 / TOTAL))
B2_PERCENT=$((B2_REGISTER * 100 / TOTAL))

echo -e "  Backend 1: ${CYAN}${B1_PERCENT}%${NC}"
echo -e "  Backend 2: ${CYAN}${B2_PERCENT}%${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Evaluate balance
if [ "$B1_REGISTER" -gt 0 ] && [ "$B2_REGISTER" -gt 0 ]; then
    echo -e "${GREEN}✅ Load balancing is WORKING!${NC}"
    echo -e "${GREEN}   Both backends are receiving traffic${NC}"
    
    # Check if distribution is reasonable (30-70% range)
    if [ "$B1_PERCENT" -ge 30 ] && [ "$B1_PERCENT" -le 70 ]; then
        echo -e "${GREEN}✅ Distribution is well balanced (within 30-70%)${NC}"
    else
        echo -e "${YELLOW}⚠️  Distribution is uneven but both backends are active${NC}"
        echo -e "${YELLOW}   This may be normal with least_conn algorithm${NC}"
    fi
else
    echo -e "${RED}❌ Load balancing NOT working!${NC}"
    echo -e "${RED}   Only one backend is receiving traffic${NC}"
    
    echo ""
    echo -e "${YELLOW}Troubleshooting steps:${NC}"
    echo -e "  1. Check nginx-lb config:"
    echo -e "     ${CYAN}docker exec nginx-loadbalancer cat /etc/nginx/nginx.conf | grep -A 10 'upstream'${NC}"
    echo -e "  2. Check if backends are reachable from nginx-lb:"
    echo -e "     ${CYAN}docker exec nginx-loadbalancer wget -qO- http://backend1:3000/api/isconnected${NC}"
    echo -e "     ${CYAN}docker exec nginx-loadbalancer wget -qO- http://backend2:3001/api/isconnected${NC}"
    echo -e "  3. Check nginx-lb logs:"
    echo -e "     ${CYAN}docker logs nginx-loadbalancer | tail -50${NC}"
fi

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  System Status${NC}"
echo -e "${BLUE}==========================================${NC}"

# Show resource usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
  nginx-loadbalancer voting-backend1-1 voting-backend2-1

echo ""
echo -e "${YELLOW}Ready to run full k6 test!${NC}"
echo -e "${CYAN}On your Mac, run: k6 run k6-load-balancing-test.js${NC}"

