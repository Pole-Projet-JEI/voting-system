#!/bin/bash

# ============================================
# True Parallel Stress Test - All requests launch simultaneously
# ============================================

# Auto-load .env.loadtest if it exists
if [ -f .env.loadtest ]; then
    echo "Loading configuration from .env.loadtest..."
    source .env.loadtest
fi

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3001}"
NUM_USERS="${NUM_USERS:-50}"
VOTE_CHOICE="${VOTE_CHOICE:-yes}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  TRUE PARALLEL Stress Test${NC}"
echo -e "${BLUE}==========================================${NC}"

# Fetch the currently presenting team ID
echo -e "${YELLOW}Fetching currently presenting team...${NC}"
PRESENTING_RESPONSE=$(curl -s "${BASE_URL}/api/currentteam")
TEAM_ID=$(echo "$PRESENTING_RESPONSE" | grep -o '"teamID":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TEAM_ID" ] || [ "$TEAM_ID" == "null" ]; then
    echo -e "${RED}Error: No team is currently presenting${NC}"
    echo -e "${YELLOW}Please set a team to presenting status first${NC}"
    exit 1
fi

TEAM_NAME=$(echo "$PRESENTING_RESPONSE" | grep -o '"teamName":"[^"]*"' | cut -d'"' -f4)

echo -e "${GREEN}✓ Found presenting team: ${TEAM_NAME} (${TEAM_ID})${NC}\n"

echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Base URL: ${BASE_URL}"
echo -e "  Number of users: ${NUM_USERS}"
echo -e "  ALL LAUNCHING SIMULTANEOUSLY"
echo -e "  Team ID: ${TEAM_ID}"
echo -e "  Team Name: ${TEAM_NAME}"
echo -e "  Vote distribution: 50% yes, 50% no"
echo -e "${BLUE}==========================================${NC}\n"

# Get voter codes
CODES_FILE="./server/src/seed/codes.mjs"
TEMP_DIR=$(mktemp -d)
RESULTS_FILE="${TEMP_DIR}/results.txt"

# Extract voter codes
VOTER_CODES=($(grep -oP '"[A-Za-z0-9]{9}"' ${CODES_FILE} | tr -d '"' | head -n ${NUM_USERS}))

if [ ${#VOTER_CODES[@]} -eq 0 ]; then
    echo -e "${RED}Error: Could not extract voter codes${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Loaded ${#VOTER_CODES[@]} voter codes${NC}\n"

# Function to register and vote for a single user
vote_user() {
    local code=$1
    local user_num=$2
    local start_time=$(date +%s%N)
    
    local cookie_file="${TEMP_DIR}/cookies_${user_num}.txt"
    
    # Determine vote choice: 50% yes, 50% no
    local vote_choice
    if [ $((user_num % 2)) -eq 0 ]; then
        vote_choice="yes"
    else
        vote_choice="no"
    fi
    
    # Register
    register_response=$(curl -s -w "\n%{http_code}" \
        -X POST "${BASE_URL}/api/register" \
        -H "Content-Type: application/json" \
        -d "{\"code\":\"${code}\"}" \
        -c "${cookie_file}" 2>/dev/null)
    
    register_status=$(echo "${register_response}" | tail -n1)
    
    if [ "${register_status}" != "200" ] && [ "${register_status}" != "201" ]; then
        echo "User ${user_num} (${code}): Register FAILED (${register_status})" >> ${RESULTS_FILE}
        rm -f "${cookie_file}"
        return 1
    fi
    
    # Vote
    vote_response=$(curl -s -w "\n%{http_code}" \
        -X POST "${BASE_URL}/api/vote/${TEAM_ID}" \
        -H "Content-Type: application/json" \
        -d "{\"vote\":\"${vote_choice}\"}" \
        -b "${cookie_file}" 2>/dev/null)
    
    vote_status=$(echo "${vote_response}" | tail -n1)
    
    local end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 ))
    
    if [ "${vote_status}" == "200" ] || [ "${vote_status}" == "201" ]; then
        echo -e "${GREEN}✓${NC} User ${user_num} (${code}): Success (${duration}ms)"
        echo "User ${user_num} (${code}): SUCCESS (${duration}ms)" >> ${RESULTS_FILE}
    else
        echo -e "${RED}✗${NC} User ${user_num} (${code}): Vote FAILED (${vote_status})"
        echo "User ${user_num} (${code}): FAILED (${vote_status})" >> ${RESULTS_FILE}
    fi
    
    rm -f "${cookie_file}"
}

export -f vote_user
export BASE_URL TEAM_ID TEMP_DIR RESULTS_FILE GREEN RED NC

echo -e "${YELLOW}Launching ${NUM_USERS} requests SIMULTANEOUSLY...${NC}\n"
test_start=$(date +%s%N)

# Launch ALL requests at the EXACT same time using child processes
pids=()
for i in $(seq 0 $((${#VOTER_CODES[@]} - 1))); do
    (vote_user "${VOTER_CODES[$i]}" "$i") &
    pids+=($!)
done

# Wait for ALL to complete
for pid in "${pids[@]}"; do
    wait $pid
done

test_end=$(date +%s%N)
total_duration_ms=$(( (test_end - test_start) / 1000000 ))
total_duration_s=$(awk "BEGIN {printf \"%.2f\", $total_duration_ms/1000}")

# Calculate statistics
total_requests=$NUM_USERS
successful=$(grep -c "SUCCESS" ${RESULTS_FILE} 2>/dev/null || echo 0)
failed=$(grep -c "FAILED" ${RESULTS_FILE} 2>/dev/null || echo 0)

if [ $total_requests -gt 0 ]; then
    success_rate=$(awk "BEGIN {printf \"%.2f\", ($successful/$total_requests)*100}")
else
    success_rate="0.00"
fi

if [ $successful -gt 0 ]; then
    avg_time=$(grep "SUCCESS" ${RESULTS_FILE} | \
        grep -oP '\(\K[0-9]+' | \
        awk '{ sum += $1; n++ } END { if (n > 0) print sum / n; else print 0 }')
else
    avg_time=0
fi

# Print summary
echo -e "\n${BLUE}==========================================${NC}"
echo -e "${BLUE}  Stress Test Results${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "  Total requests:    ${total_requests}"
echo -e "  ${GREEN}Successful:        ${successful}${NC}"
echo -e "  ${RED}Failed:            ${failed}${NC}"
echo -e "  Success rate:      ${success_rate}%"
echo -e "  Total duration:    ${total_duration_s}s"
echo -e "  Avg response time: ${avg_time}ms"
if [ $(echo "$total_duration_s > 0" | bc) -eq 1 ]; then
    echo -e "  Requests/second:   $(awk "BEGIN {printf \"%.2f\", $total_requests/$total_duration_s}")"
fi
echo -e "${BLUE}==========================================${NC}\n"

# Save detailed results
REPORT_FILE="performance-testing/stress-test-report-$(date +%Y%m%d-%H%M%S).txt"
{
    echo "TRUE PARALLEL Stress Test Report"
    echo "Generated: $(date)"
    echo "========================================"
    echo ""
    echo "Configuration:"
    echo "  Base URL: ${BASE_URL}"
    echo "  Number of users: ${NUM_USERS}"
    echo "  Concurrency: ALL SIMULTANEOUS"
    echo "  Team ID: ${TEAM_ID}"
    echo "  Vote distribution: 50% yes, 50% no"
    echo ""
    echo "Results:"
    echo "  Total requests: ${total_requests}"
    echo "  Successful: ${successful}"
    echo "  Failed: ${failed}"
    echo "  Success rate: ${success_rate}%"
    echo "  Total duration: ${total_duration_s}s"
    echo "  Average response time: ${avg_time}ms"
    if [ $(echo "$total_duration_s > 0" | bc) -eq 1 ]; then
        echo "  Requests/second: $(awk "BEGIN {printf \"%.2f\", $total_requests/$total_duration_s}")"
    fi
    echo ""
    echo "Detailed Results:"
    echo "========================================"
    cat ${RESULTS_FILE}
} > ${REPORT_FILE}

echo -e "${GREEN}✓ Detailed report saved to: ${REPORT_FILE}${NC}"

# Cleanup
rm -rf ${TEMP_DIR}

# Exit with error if any tests failed
if [ $failed -gt 0 ]; then
    exit 1
fi
