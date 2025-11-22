# K6 Load Testing

Quick guide to test your voting system.

## Quick Start

```bash
# 1. Extract voter codes (first time only)
node extract-voter-codes.mjs

# 2. Run interactive menu
./test-load-balancing.sh

# 3. Or run specific test
k6 run k6-voter-flow.js
```

## Test Scripts

| Script | What it tests | Duration |
|--------|--------------|----------|
| `k6-voter-flow.js` | Registration + voting | 7 min |
| `k6-sse-test.js` | SSE connections | 8 min |
| `k6-admin-test.js` | Admin operations | 5 min |
| `k6-load-balancing-test.js` | Load balancing (10→100 users) | 10 min |
| `k6-mixed-workload.js` | Mixed traffic | 10 min |

## Usage

```bash
# Basic test
k6 run k6-voter-flow.js

# Custom URL
k6 run --env BASE_URL=http://voting.jeinsat.com k6-voter-flow.js

# With admin key
k6 run --env ADMIN_KEY=your_key k6-admin-test.js

# Custom load
k6 run --vus 50 --duration 5m k6-voter-flow.js
```

## Verify Load Balancing

```bash
# On VPS
ssh ubuntu@51.210.255.109
cd ~/apps/voting
./verify-load-balancing.sh
```

## Expected Results

✅ **Good:**
- Error rate < 10%
- Success rate > 90%
- p(95) response < 2s
- Both backends get 40-60% traffic

❌ **Bad:**
- Error rate > 10% → Reduce VUs or increase rate limits
- Uneven distribution → Check nginx-lb config

## Troubleshooting

**503 Errors:** Server overloaded, reduce VUs  
**No team presenting:** Set team via admin panel  
**One backend only:** Run `docker compose -f docker-compose.lb.yml ps`

## Files

- `test-load-balancing.sh` - Interactive test runner
- `extract-voter-codes.mjs` - Extract codes from seed
- `voter-codes.json` - Generated codes (500)

See [../LOAD_TESTING.md](../LOAD_TESTING.md) for complete documentation.

