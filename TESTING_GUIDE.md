# Load Testing Guide

Quick guide to test load balancing with k6.

## Setup

### 1. On VPS

```bash
ssh ubuntu@51.210.255.109
cd ~/apps/voting
git pull

# Deploy with load balancer
sudo docker compose down
sudo docker compose -f docker-compose.lb.yml up -d --build

# Verify
chmod +x verify-load-balancing.sh
./verify-load-balancing.sh
```

### 2. On Your Mac

```bash
cd k6-tests

# Extract codes (first time)
node extract-voter-codes.mjs

# Run interactive menu
./test-load-balancing.sh
```

## Test Options

| Option | VUs | Duration | Purpose |
|--------|-----|----------|---------|
| 1. Smoke | 10 | 1m | Quick check |
| 2. Light | 25 | 2m | Basic load |
| 3. Medium | 50 | 3m | Standard load |
| 4. **Load Balancing** | 10→100 | 10m | **Recommended** |
| 5. Heavy | 100 | 5m | High load |
| 6. Stress | 200 | 3m | Breaking point |

## Verify Results

After test, on VPS:

```bash
./verify-load-balancing.sh
```

Expected:
```
Backend 1: ~50% of requests
Backend 2: ~50% of requests
✅ Load balancing is WORKING!
```

## Good vs Bad Results

**✅ Good:**
- Error rate < 10%
- Success rate > 90%
- p(95) < 2s
- Both backends 40-60%

**❌ Bad:**
- Error rate > 10% → Reduce VUs
- One backend only → Check `docker ps`
- 503 errors → Server overloaded

## Quick Commands

```bash
# Test from Mac
cd k6-tests && ./test-load-balancing.sh

# Verify on VPS
ssh ubuntu@51.210.255.109 "cd ~/apps/voting && ./verify-load-balancing.sh"

# Check distribution
ssh ubuntu@51.210.255.109 '
echo "B1:" && sudo docker logs voting-backend1-1 2>&1 | grep -c POST
echo "B2:" && sudo docker logs voting-backend2-1 2>&1 | grep -c POST
'
```

## Troubleshooting

**High errors (>10%):** Reduce VUs or check `docker stats`  
**No team:** Set team via admin panel  
**One backend only:** Run `docker compose -f docker-compose.lb.yml ps`

## Files

- `k6-tests/` - Test scripts
- `nginx-lb.conf` - Rate limits increased to 500r/s
- `verify-load-balancing.sh` - VPS verification script

See [LOAD_TESTING.md](./LOAD_TESTING.md) for complete docs.
