#!/bin/bash

# ============================================
# Voting System Load Test Script
# ============================================
# This script simulates concurrent users voting

# Auto-load .env.loadtest if it exists
if [ -f .env.loadtest ]; then
    echo "Loading configuration from .env.loadtest..."
    source .env.loadtest
fi

# Configuration - EDIT THESE or use .env.loadtest
BASE_URL="${BASE_URL:-http://localhost:3001}"
NUM_USERS="${NUM_USERS:-50}"
CONCURRENT_REQUESTS="${CONCURRENT_REQUESTS:-10}"
TEAM_ID="${TEAM_ID:-1}"
VOTE_CHOICE="${VOTE_CHOICE:-yes}"  # yes or no

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get voter codes from the seeded codes file
CODES_FILE="./server/src/seed/codes.mjs"

# Create temporary directory for results
TEMP_DIR=$(mktemp -d)
RESULTS_FILE="${TEMP_DIR}/results.txt"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Voting System Load Test${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Base URL: ${BASE_URL}"
echo -e "  Number of users: ${NUM_USERS}"
echo -e "  Concurrent requests: ${CONCURRENT_REQUESTS}"
echo -e "  Team ID: ${TEAM_ID}"
echo -e "  Vote choice: ${VOTE_CHOICE}"
echo -e "${BLUE}==========================================${NC}\n"

# Extract voter codes from the codes file
VOTER_CODES=($(grep -oP '"[A-Za-z0-9]{9}"' ${CODES_FILE} | tr -d '"' | head -n ${NUM_USERS}))

if [ ${#VOTER_CODES[@]} -eq 0 ]; then
    echo -e "${RED}Error: Could not extract voter codes from ${CODES_FILE}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Loaded ${#VOTER_CODES[@]} voter codes${NC}\n"

# Function to register and vote for a single user
simulate_user() {
    local code=$1
    local user_num=$2
    local start_time=$(date +%s%N)
    
    # Create a cookie jar for this user
    local cookie_file="${TEMP_DIR}/cookies_${user_num}.txt"
    
    # Step 1: Register user
    register_response=$(curl -s -w "\n%{http_code}" \
        -X POST "${BASE_URL}/api/register" \
        -H "Content-Type: application/json" \
        -d "{\"code\":\"${code}\"}" \
        -c "${cookie_file}")
    
    register_status=$(echo "${register_response}" | tail -n1)
    
    if [ "${register_status}" != "200" ] && [ "${register_status}" != "201" ]; then
        echo "User ${user_num} (${code}): Register failed (${register_status})" >> ${RESULTS_FILE}
        rm -f "${cookie_file}"
        return 1
    fi
    
    # Small delay to simulate user behavior
    sleep 0.1
    
    # Step 2: Vote for team
    vote_response=$(curl -s -w "\n%{http_code}" \
        -X POST "${BASE_URL}/api/vote/${TEAM_ID}" \
        -H "Content-Type: application/json" \
        -d "{\"vote\":\"${VOTE_CHOICE}\"}" \
        -b "${cookie_file}")
    
    vote_status=$(echo "${vote_response}" | tail -n1)
    
    local end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    if [ "${vote_status}" == "200" ] || [ "${vote_status}" == "201" ]; then
        echo -e "${GREEN}✓${NC} User ${user_num} (${code}): Success (${duration}ms)"
        echo "User ${user_num} (${code}): SUCCESS (${duration}ms)" >> ${RESULTS_FILE}
    else
        echo -e "${RED}✗${NC} User ${user_num} (${code}): Vote failed (${vote_status})"
        echo "User ${user_num} (${code}): FAILED (${vote_status})" >> ${RESULTS_FILE}
    fi
    
    # Cleanup
    rm -f "${cookie_file}"
}

export -f simulate_user
export BASE_URL TEAM_ID VOTE_CHOICE TEMP_DIR RESULTS_FILE GREEN RED NC

# Run the load test
echo -e "${YELLOW}Starting load test...${NC}\n"
test_start=$(date +%s)

# Use GNU parallel if available, otherwise fall back to background jobs
if command -v parallel &> /dev/null; then
    echo -e "${BLUE}Using GNU parallel for concurrent execution${NC}\n"
    export -f simulate_user
    for i in $(seq 0 $((${#VOTER_CODES[@]} - 1))); do
        echo "${VOTER_CODES[$i]} $i"
    done | parallel -j ${CONCURRENT_REQUESTS} --colsep ' ' simulate_user {1} {2}
else
    echo -e "${YELLOW}Using background jobs for concurrent execution${NC}\n"
    for i in $(seq 0 $((${#VOTER_CODES[@]} - 1))); do
        while [ $(jobs -r | wc -l) -ge ${CONCURRENT_REQUESTS} ]; do
            sleep 0.1
        done
        simulate_user "${VOTER_CODES[$i]}" "$i" &
    done
    wait
fi

test_end=$(date +%s)
total_duration=$((test_end - test_start))

# Calculate statistics
total_requests=$NUM_USERS
successful=$(grep -c "SUCCESS" ${RESULTS_FILE} 2>/dev/null || echo 0)
failed=$(grep -c "FAILED" ${RESULTS_FILE} 2>/dev/null || echo 0)
success_rate=$(awk "BEGIN {printf \"%.2f\", ($successful/$total_requests)*100}")

# Extract response times for successful requests
if [ $successful -gt 0 ]; then
    avg_time=$(grep "SUCCESS" ${RESULTS_FILE} | \
        grep -oP '\(\K[0-9]+' | \
        awk '{ sum += $1; n++ } END { if (n > 0) print sum / n; else print 0 }')
else
    avg_time=0
fi

# Print summary
echo -e "\n${BLUE}==========================================${NC}"
echo -e "${BLUE}  Test Results${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "  Total requests:    ${total_requests}"
echo -e "  ${GREEN}Successful:        ${successful}${NC}"
echo -e "  ${RED}Failed:            ${failed}${NC}"
echo -e "  Success rate:      ${success_rate}%"
echo -e "  Total duration:    ${total_duration}s"
echo -e "  Avg response time: ${avg_time}ms"
echo -e "  Requests/second:   $(awk "BEGIN {printf \"%.2f\", $total_requests/$total_duration}")"
echo -e "${BLUE}==========================================${NC}\n"

# Save detailed results
REPORT_FILE="load-test-report-$(date +%Y%m%d-%H%M%S).txt"
{
    echo "Voting System Load Test Report"
    echo "Generated: $(date)"
    echo "========================================"
    echo ""
    echo "Configuration:"
    echo "  Base URL: ${BASE_URL}"
    echo "  Number of users: ${NUM_USERS}"
    echo "  Concurrent requests: ${CONCURRENT_REQUESTS}"
    echo "  Team ID: ${TEAM_ID}"
    echo "  Vote choice: ${VOTE_CHOICE}"
    echo ""
    echo "Results:"
    echo "  Total requests: ${total_requests}"
    echo "  Successful: ${successful}"
    echo "  Failed: ${failed}"
    echo "  Success rate: ${success_rate}%"
    echo "  Total duration: ${total_duration}s"
    echo "  Average response time: ${avg_time}ms"
    echo "  Requests/second: $(awk "BEGIN {printf \"%.2f\", $total_requests/$total_duration}")"
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
