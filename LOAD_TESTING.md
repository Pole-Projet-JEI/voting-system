# K6 Load Testing Suite

Comprehensive load testing guide for the voting system.

## Quick Start

```bash
# 1. Extract voter codes (first time only)
cd k6-tests
node extract-voter-codes.mjs

# 2. Run interactive test menu
./run-all-tests.sh

# 3. Or run specific test
k6 run k6-voter-flow.js
```

## Test Scripts

| Script | What it tests | Duration | VUs |
|--------|--------------|----------|-----|
| `k6-voter-flow.js` | Registration → Voting flow | 7 min | 50-200 |
| `k6-sse-test.js` | SSE connections | 8 min | 50-150 |
| `k6-admin-test.js` | Admin operations | 5 min | 5-10 |
| `k6-mixed-workload.js` | **Real-world mix** ⭐ | 10 min | 100-300 |

## Prerequisites

### Install K6

```bash
# macOS
brew install k6

# Ubuntu/Debian
sudo apt install k6

# Windows
choco install k6

# Or download from https://k6.io/docs/getting-started/installation/
```

### Prepare Test Data

Extract voter codes from the seed file:

```bash
cd k6-tests
node extract-voter-codes.mjs
```

This generates `voter-codes.json` with 500 voter codes for testing.

## Usage Examples

### Basic Test

```bash
cd k6-tests
k6 run k6-voter-flow.js
```

### Custom URL

```bash
k6 run --env BASE_URL=http://voting.jeinsat.com k6-voter-flow.js
```

### With Admin Key

```bash
k6 run --env ADMIN_KEY=your_secret_key k6-admin-test.js
```

### Quick Smoke Test

```bash
k6 run --vus 10 --duration 30s k6-voter-flow.js
```

### Load Balanced Testing

Deploy with load balancer and test distribution:

```bash
# Deploy with load balancer
cd ..
docker compose -f docker-compose.lb.yml up -d --build

# Run mixed workload test
cd k6-tests
k6 run k6-mixed-workload.js

# Monitor distribution across backends
docker stats backend1 backend2
```

## Understanding Results

### Key Metrics

```
✓ checks........................: 98.45%  ← Pass rate
  http_req_duration.............: avg=456ms p(95)=1.2s  ← Response times
  http_reqs....................: 2000 (66.66/s)  ← Request rate
  vote_success_rate............: 97.50%  ← Custom metric
  sse_connections...............: 150  ← Active SSE connections
```

### What the Metrics Mean

- **checks**: Percentage of validation assertions that passed
- **http_req_duration**: Response time statistics
  - `avg`: Average response time
  - `p(95)`: 95th percentile (95% of requests faster than this)
  - `p(99)`: 99th percentile
- **http_reqs**: Total requests and requests per second
- **vote_success_rate**: Custom metric tracking successful votes
- **sse_connections**: Number of active Server-Sent Events connections

### Thresholds

Tests pass if all thresholds are met:
- ✅ p(95) response time < 2s
- ✅ Error rate < 5%
- ✅ Success rate > 95%
- ✅ SSE connections stable > 90%

### Interpreting Results

**Good Performance:**
```
✓ checks........................: 98.45%
  http_req_duration.............: avg=456ms p(95)=1.2s
  vote_success_rate............: 97.50%
```

**Degraded Performance:**
```
✗ checks........................: 85.32%  ← Below 95% threshold
  http_req_duration.............: avg=2.1s p(95)=5.2s  ← Above 2s threshold
  vote_success_rate............: 88.12%  ← Below 95% threshold
```

## Test Descriptions

### k6-voter-flow.js - Core Voter Journey

Tests the complete voter experience:
1. Register with voter code
2. Check presenting team
3. Submit vote
4. Verify vote recorded

**Load Profile:**
- Ramp up: 50 → 200 VUs over 2 minutes
- Sustained: 200 VUs for 3 minutes
- Ramp down: 200 → 50 VUs over 2 minutes

**When to use:** Validate basic voting functionality under load.

### k6-sse-test.js - SSE Connection Stress

Tests Server-Sent Events connection handling:
1. Establish SSE connection
2. Maintain connection for extended period
3. Verify real-time updates received
4. Test reconnection logic

**Load Profile:**
- Ramp up: 50 → 150 VUs over 2 minutes
- Sustained: 150 concurrent SSE connections for 4 minutes
- Ramp down: 150 → 50 VUs over 2 minutes

**When to use:** Validate real-time updates and SSE scalability.

### k6-admin-test.js - Admin Operations

Tests administrative functionality:
1. Admin login
2. Team management (CRUD operations)
3. Set presenting team
4. View visualization data
5. Admin logout

**Load Profile:**
- 5-10 concurrent admin users
- 5 minutes of sustained operations

**When to use:** Validate admin panel performance and security.

### k6-mixed-workload.js - Real-World Simulation ⭐

**RECOMMENDED** - Simulates realistic production traffic:
- 60% voters (register + vote)
- 30% SSE connections (real-time updates)
- 10% admin operations

**Load Profile:**
- Ramp up: 100 → 300 VUs over 3 minutes
- Sustained: 300 VUs for 4 minutes
- Ramp down: 300 → 100 VUs over 3 minutes

**When to use:** 
- Pre-production validation
- Capacity planning
- Performance regression testing

## Load Testing Strategy

### 1. Baseline Testing

Establish baseline performance:

```bash
cd k6-tests

# Smoke test (10 VUs, 30s)
k6 run --vus 10 --duration 30s k6-voter-flow.js

# Record baseline metrics
```

### 2. Load Testing

Test expected production load:

```bash
# Expected load: 200 concurrent voters
k6 run --vus 200 --duration 5m k6-voter-flow.js

# SSE connections: 100 concurrent
k6 run --vus 100 --duration 5m k6-sse-test.js
```

### 3. Stress Testing

Find breaking points:

```bash
# Gradually increase load
k6 run --vus 500 --duration 5m k6-voter-flow.js

# Monitor for:
# - Increased error rates
# - Slow response times
# - Backend crashes
```

### 4. Spike Testing

Test sudden traffic spikes:

```bash
# Rapid ramp-up
k6 run --stage 10s:500 --stage 2m:500 --stage 10s:0 k6-voter-flow.js
```

### 5. Endurance Testing

Validate long-term stability:

```bash
# Run for extended period
k6 run --vus 150 --duration 30m k6-mixed-workload.js

# Monitor for:
# - Memory leaks
# - Connection pool exhaustion
# - Database performance degradation
```

## Environment Variables

Configure tests with environment variables:

```bash
# Base URL (default: http://localhost:3000)
export BASE_URL=http://voting.jeinsat.com

# Admin secret key
export ADMIN_KEY=your_secret_key

# Custom thresholds
export MAX_RESPONSE_TIME=2000  # ms
export MIN_SUCCESS_RATE=0.95   # 95%

# Run test
k6 run k6-mixed-workload.js
```

## Advanced Configuration

### Custom Test Scenarios

Edit test files to customize load profiles:

```javascript
export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 VUs
    { duration: '5m', target: 100 },  // Stay at 100 VUs
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% < 2s
    'checks': ['rate>0.95'],            // 95% pass rate
  },
};
```

### Export Results

Save test results for analysis:

```bash
# Export JSON summary
k6 run --summary-export=results.json k6-voter-flow.js

# Export detailed metrics to InfluxDB (if available)
k6 run --out influxdb=http://localhost:8086/k6 k6-voter-flow.js

# Export to CSV
k6 run --out csv=results.csv k6-voter-flow.js
```

## Monitoring During Tests

### Real-Time Monitoring

```bash
# Docker container stats
docker stats backend1 backend2 mongodb nginx-loadbalancer

# Backend logs
docker logs -f backend1

# Database queries
docker exec mongodb mongosh --eval "db.currentOp()"

# Nginx status
curl http://localhost:3000/nginx_status
```

### System Metrics

```bash
# CPU and memory
top
htop

# Network connections
netstat -an | grep ESTABLISHED | wc -l

# Disk I/O
iostat -x 1

# MongoDB stats
docker exec mongodb mongosh --eval "db.serverStatus()"
```

## Complete Test Campaign

Run all tests in sequence for comprehensive validation:

```bash
cd k6-tests

# 1. Extract codes (if not done)
node extract-voter-codes.mjs

# 2. Smoke test (quick validation)
echo "Running smoke test..."
k6 run --vus 10 --duration 30s k6-voter-flow.js

# 3. Voter flow test
echo "Testing voter flow..."
k6 run k6-voter-flow.js

# 4. SSE connections test
echo "Testing SSE connections..."
k6 run k6-sse-test.js

# 5. Admin operations test
echo "Testing admin operations..."
k6 run --env ADMIN_KEY=$ADMIN_KEY k6-admin-test.js

# 6. Mixed workload (real-world simulation)
echo "Running mixed workload..."
k6 run --env ADMIN_KEY=$ADMIN_KEY k6-mixed-workload.js

echo "Test campaign complete!"
```

Or use the interactive runner:

```bash
./run-all-tests.sh
```

## Test Files

- `k6-voter-flow.js` - Main voter test (register + vote)
- `k6-sse-test.js` - SSE connection stress test
- `k6-admin-test.js` - Admin operations test
- `k6-mixed-workload.js` - Mixed traffic simulation
- `extract-voter-codes.mjs` - Extract codes from seed file
- `run-all-tests.sh` - Interactive test runner
- `voter-codes.json` - Generated voter codes (500 codes)

## Troubleshooting

### "No voter codes found"

**Solution:**
```bash
cd k6-tests
node extract-voter-codes.mjs
```

Verify `voter-codes.json` was created with codes.

### "No team is currently presenting"

**Solution:** Set a presenting team via admin panel or API:

```bash
# Get admin token first
ADMIN_TOKEN=$(curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"key": "YOUR_ADMIN_KEY"}' \
  -c - | grep adminToken | awk '{print $7}')

# Get team ID
TEAM_ID=$(curl http://localhost:3000/api/admin/teams \
  -H "Cookie: adminToken=$ADMIN_TOKEN" | jq -r '.[0]._id')

# Set presenting
curl -X POST http://localhost:3000/api/admin/presenting/$TEAM_ID \
  -H "Cookie: adminToken=$ADMIN_TOKEN"
```

### High error rate (>5%)

**Possible causes:**
- Backend overloaded
- Database connection pool exhausted
- Network congestion
- Rate limiting triggered

**Solutions:**
```bash
# 1. Check backend logs
docker logs backend1

# 2. Check database
docker logs mongodb

# 3. Reduce load
k6 run --vus 50 --duration 2m k6-voter-flow.js

# 4. Deploy with load balancer
docker compose -f docker-compose.lb.yml up -d --build
```

### Slow response times (p95 > 2s)

**Optimization steps:**
1. Enable load balancing (2-4 backend instances)
2. Optimize MongoDB connection pool
3. Enable MongoDB indexes
4. Increase backend resources
5. Use Redis for session storage

```bash
# Deploy load balanced
docker compose -f docker-compose.lb.yml up -d --build

# Monitor improvements
k6 run k6-mixed-workload.js
```

### SSE connections dropping

**Solution:** Increase timeouts in nginx configuration:

```nginx
proxy_read_timeout 86400s;  # 24 hours
proxy_send_timeout 86400s;
```

Or enable sticky sessions (ip_hash) in load balancer.

### Out of memory

**Solution:** Increase Docker memory limits:

```yaml
# docker-compose.yml
backend1:
  deploy:
    resources:
      limits:
        memory: 2G
```

## Performance Benchmarks

### Expected Performance (2 Backend Instances)

| Metric | Target | Acceptable | Critical |
|--------|--------|------------|----------|
| p(95) Response Time | <1s | <2s | >3s |
| Error Rate | <1% | <5% | >10% |
| Concurrent Users | 300+ | 200+ | <150 |
| SSE Connections | 200+ | 150+ | <100 |
| Requests/sec | 100+ | 50+ | <30 |

### Resource Usage (300 Concurrent VUs)

| Service | CPU | Memory | Network |
|---------|-----|--------|---------|
| backend1 | 40-60% | 400-600 MB | 10-20 Mbps |
| backend2 | 40-60% | 400-600 MB | 10-20 Mbps |
| mongodb | 20-30% | 300-400 MB | 5-10 Mbps |
| nginx-lb | 5-10% | 50-100 MB | 20-30 Mbps |

## Best Practices

1. **Always extract codes first:** `node extract-voter-codes.mjs`
2. **Start with smoke tests:** Validate basic functionality before load testing
3. **Use realistic load profiles:** Ramp up gradually, sustain, then ramp down
4. **Monitor during tests:** Watch logs and metrics in real-time
5. **Test with load balancer:** Validates production configuration
6. **Set presenting team:** Required for voting tests to work
7. **Clean data between runs:** Reset database if testing registration
8. **Export results:** Keep records for comparison and analysis
9. **Test in isolation:** Run one test at a time for accurate results
10. **Validate thresholds:** Adjust based on your requirements

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Load Testing

on:
  push:
    branches: [ main ]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy application
        run: |
          docker compose -f docker-compose.lb.yml up -d --build
          sleep 30  # Wait for services
      
      - name: Install K6
        run: |
          sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      
      - name: Extract voter codes
        run: |
          cd k6-tests
          node extract-voter-codes.mjs
      
      - name: Run load tests
        run: |
          cd k6-tests
          k6 run --summary-export=results.json k6-mixed-workload.js
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: k6-tests/results.json
```

## Support

For deployment issues, refer to [DEPLOYMENT.md](./DEPLOYMENT.md).

For general documentation, see [README.md](./README.md).

For issues, please open an issue in the repository.

---

**Quick Reference:**
- [README.md](./README.md) - Project overview
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide
- [k6-tests/](./k6-tests/) - Test scripts
