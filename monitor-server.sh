#!/bin/bash

# Server health monitoring script

BASE_URL="${1:-http://voting.jeinsat.com}"

echo "Monitoring server: $BASE_URL"
echo "Press Ctrl+C to stop"
echo ""

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Check if server is responding
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/currentteam" 2>/dev/null)
    
    if [ "$HTTP_CODE" = "200" ]; then
        # Get current team
        TEAM_DATA=$(curl -s "$BASE_URL/api/currentteam" 2>/dev/null)
        TEAM_NAME=$(echo "$TEAM_DATA" | jq -r '.teamName' 2>/dev/null || echo "N/A")
        
        # Check response time
        RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BASE_URL/api/currentteam" 2>/dev/null)
        
        echo "[$TIMESTAMP] ✓ Server UP | Team: $TEAM_NAME | Response: ${RESPONSE_TIME}s"
    else
        echo "[$TIMESTAMP] ✗ Server DOWN or ERROR | HTTP: $HTTP_CODE"
    fi
    
    sleep 2
done
