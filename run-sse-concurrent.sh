#!/bin/bash

# ============================================
# Concurrent SSE Load Test - Parallel Instances
# ============================================

# Auto-load .env.ssetest if it exists
if [ -f .env.ssetest ]; then
    echo "Loading configuration from .env.ssetest..."
    source .env.ssetest
fi

# Configuration - Override from environment if provided
BASE_URL="${BASE_URL:-http://voting.jeinsat.com}"
TOTAL_CLIENTS="${TOTAL_CLIENTS:-${NUM_CLIENTS:-600}}"  # Use TOTAL_CLIENTS or NUM_CLIENTS
NUM_INSTANCES="${NUM_INSTANCES:-10}"  # Number of parallel processes
DURATION_MS="${DURATION_MS:-60000}"
RECONNECT_DELAY="${RECONNECT_DELAY:-3000}"
STAGGER_DELAY="${STAGGER_DELAY:-100}"
INTERACTIVE_MODE="${INTERACTIVE_MODE:-true}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Concurrent SSE Load Test${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Base URL:          ${BASE_URL}"
echo -e "  Total Clients:     ${TOTAL_CLIENTS}"
echo -e "  Parallel Instances: ${CYAN}${NUM_INSTANCES}${NC}"
echo -e "  Clients per Instance: ${CYAN}$((TOTAL_CLIENTS / NUM_INSTANCES))${NC}"
echo -e "  Duration:          ${DURATION_MS}ms"
echo -e "  Interactive Mode:  ${INTERACTIVE_MODE}"
echo -e "${BLUE}==========================================${NC}\n"

# Calculate clients per instance
CLIENTS_PER_INSTANCE=$((TOTAL_CLIENTS / NUM_INSTANCES))
PIDS=()
TEST_RUN_ID="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="./performance-testing/sse-concurrent-${TEST_RUN_ID}"
mkdir -p "$LOG_DIR"

echo -e "${YELLOW}Creating $NUM_INSTANCES parallel processes...${NC}\n"

# Launch parallel instances
for i in $(seq 1 $NUM_INSTANCES); do
    START_INDEX=$(( (i - 1) * CLIENTS_PER_INSTANCE ))
    END_INDEX=$(( i * CLIENTS_PER_INSTANCE ))
    
    # Last instance gets any remaining clients
    if [ $i -eq $NUM_INSTANCES ]; then
        END_INDEX=$TOTAL_CLIENTS
        CLIENTS_PER_INSTANCE=$((END_INDEX - START_INDEX))
    fi
    
    LOG_FILE="$LOG_DIR/instance-$i.log"
    
    echo -e "${CYAN}Instance $i:${NC} Codes $START_INDEX-$((END_INDEX - 1)) ($CLIENTS_PER_INSTANCE clients) → $LOG_FILE"
    
    # Launch instance in background
    (
        BASE_URL="$BASE_URL" \
        NUM_CLIENTS="$CLIENTS_PER_INSTANCE" \
        CODE_START_INDEX="$START_INDEX" \
        CODE_END_INDEX="$END_INDEX" \
        INSTANCE_ID="$i" \
        DURATION_MS="$DURATION_MS" \
        RECONNECT_DELAY="$RECONNECT_DELAY" \
        STAGGER_DELAY="$STAGGER_DELAY" \
        INTERACTIVE_MODE="$INTERACTIVE_MODE" \
        node sse-load-test.js > "$LOG_FILE" 2>&1
    ) &
    
    PIDS+=($!)
    
    # Small delay between launches to avoid stampede
    sleep 0.2
done

echo -e "\n${GREEN}✓${NC} All $NUM_INSTANCES instances launched!"
echo -e "${YELLOW}Process IDs:${NC} ${PIDS[@]}"
echo -e "${YELLOW}Logs:${NC} $LOG_DIR/*.log\n"

echo -e "${CYAN}═════════════════════════════════════════════════${NC}"
echo -e "${CYAN}🎯 CONCURRENT TEST RUNNING${NC}"
echo -e "${CYAN}═════════════════════════════════════════════════${NC}"
echo -e "All ${TOTAL_CLIENTS} clients distributed across ${NUM_INSTANCES} parallel processes"
echo -e "Each instance handles ${CLIENTS_PER_INSTANCE} clients independently\n"

if [ "$INTERACTIVE_MODE" = "true" ]; then
    echo -e "${YELLOW}Instructions:${NC}"
    echo -e "  1. Go to admin dashboard: ${BASE_URL}/admin"
    echo -e "  2. Set a team as presenting"
    echo -e "  3. All ${TOTAL_CLIENTS} clients will auto-vote (50/50 YES/NO)"
    echo -e "  4. Change teams to trigger more vote cycles"
    echo -e "  5. Press Ctrl+C to stop all instances\n"
fi

echo -e "${YELLOW}Monitoring (live tail):${NC}"
echo -e "  tail -f $LOG_DIR/*.log\n"
echo -e "${YELLOW}Check individual instance:${NC}"
echo -e "  tail -f $LOG_DIR/instance-1.log\n"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Stopping all instances...${NC}"
    
    # Force kill all node processes running sse-load-test.js
    pkill -9 -f "node.*sse-load-test.js" 2>/dev/null
    
    # Kill all child processes
    for pid in "${PIDS[@]}"; do
        kill -9 $pid 2>/dev/null
        pkill -9 -P $pid 2>/dev/null
    done
    
    # Wait briefly for cleanup
    sleep 0.5
    
    echo -e "\n${GREEN}✓${NC} All instances stopped"
    echo -e "${YELLOW}Logs saved in:${NC} $LOG_DIR"
    
    # Generate summary report
    echo -e "\n${CYAN}Generating summary...${NC}"
    
    TOTAL_VOTES=0
    
    for log in "$LOG_DIR"/*.log; do
        if [ -f "$log" ]; then
            votes=$(grep -c "voted" "$log" 2>/dev/null || echo "0")
            if [ -n "$votes" ] && [ "$votes" != "0" ]; then
                TOTAL_VOTES=$((TOTAL_VOTES + votes))
            fi
        fi
    done
    
    echo -e "${BLUE}═════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Concurrent Test Summary${NC}"
    echo -e "${BLUE}═════════════════════════════════════════════════${NC}"
    echo -e "  Total Instances:   $NUM_INSTANCES"
    echo -e "  Total Clients:     $TOTAL_CLIENTS"
    echo -e "  Total Votes Cast:  ${GREEN}$TOTAL_VOTES${NC}"
    echo -e "  Logs Directory:    $LOG_DIR"
    echo -e "${BLUE}═════════════════════════════════════════════════${NC}\n"
    
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Wait for all instances (in interactive mode, this waits indefinitely)
if [ "$INTERACTIVE_MODE" = "true" ]; then
    # Wait forever until user presses Ctrl+C
    while true; do
        sleep 1
    done
else
    # Non-interactive: wait for all processes to complete
    echo -e "${YELLOW}Waiting for all instances to complete...${NC}"
    for pid in "${PIDS[@]}"; do
        wait $pid
    done
    
    cleanup
fi
