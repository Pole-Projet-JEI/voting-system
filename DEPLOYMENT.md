# Deployment Guide - Using Host Nginx

Step-by-step guide to deploy the voting system using your existing host nginx.

## Architecture

```bash
Internet → Host Nginx (port 80/443) → Docker Frontend (port 3080) → Docker Backend (port 3000)
```

## Step 1: Update Docker Compose

The frontend container should use a different port (not 80) so host nginx can use port 80.

Edit `docker-compose.yml` - change frontend ports:

```yaml
  frontend:
    build:
      context: ./client
      dockerfile: Dockerfile
    networks:
      - app-network
    ports:
      - "3080:80"  # Change from "80:80" to "3080:80"
    volumes:
      - dist_data:/app/client/dist
    env_file:
      - ./client/.env
    depends_on:
      backend1:
        condition: service_started
```

## Step 2: Configure Host Nginx

Create nginx config for voting system on your server:

```bash
sudo nano /etc/nginx/sites-available/voting
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name voting.jeinsat.com 51.210.255.109;

    # Proxy to Docker frontend
    location / {
        proxy_pass http://localhost:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy API directly to backend (optional, for better performance)
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # SSE support
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
```

## Step 3: Enable Site and Reload Nginx

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/voting /etc/nginx/sites-enabled/

# Remove default site if it conflicts
sudo rm /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

## Step 4: Update Environment Files

### `client/.env`

```env
VITE_API_URL=http://voting.jeinsat.com/api
```

## Step 5: Deploy Docker Services

```bash
cd ~/apps/voting-system

# Stop services
docker-compose down

# Rebuild with new port configuration
docker-compose build

# Start services
docker-compose up -d

# Check services are running
docker-compose ps
```

## Step 6: Initialize MongoDB

```bash
# Connect to MongoDB
docker-compose exec mongo mongosh

# Initialize replica set
rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] })

# Verify
rs.status()

# Exit
exit
```

## Step 7: Verify Deployment

```bash
# Test Docker frontend directly
curl http://localhost:3080

# Test Docker backend directly
curl http://localhost:3000/api/isconnected

# Test via host nginx (should work!)
curl http://localhost/api/isconnected

# Test from outside
curl http://voting.jeinsat.com
```

## Troubleshooting

### Check host nginx is running

```bash
sudo systemctl status nginx
```

### Check Docker services

```bash
docker-compose ps
docker-compose logs frontend
docker-compose logs backend1
```

### Test nginx config

```bash
sudo nginx -t
```

### View nginx error logs

```bash
sudo tail -f /var/log/nginx/error.log
```

### Restart services

```bash
# Restart host nginx
sudo systemctl restart nginx

# Restart Docker services
docker-compose restart
```

## Port Reference

- **80**: Host Nginx (main entry point)
- **3080**: Docker Frontend Container
- **3000**: Docker Backend Container
- **27017**: MongoDB (internal only)

## Common Commands

```bash
# Reload host nginx after config changes
sudo nginx -t && sudo systemctl reload nginx

# Restart Docker services
docker-compose restart

# View all logs
docker-compose logs -f

# Check what's using port 80
sudo lsof -i :80

# Check what's using port 3080
sudo lsof -i :3080
```

---

# Load Balanced Deployment

For high traffic scenarios (600+ concurrent users), deploy with multiple backend instances behind an Nginx load balancer.

## Architecture

```
                     ┌──────────────┐
                     │   Frontend   │
                     │  (Port 3080) │
                     └──────┬───────┘
                            │
                     ┌──────▼───────┐
                     │ Nginx Load   │
                     │   Balancer   │
                     │  (Port 3000) │
                     └──────┬───────┘
                            │
                ┌───────────┴───────────┐
                │                       │
         ┌──────▼──────┐         ┌─────▼───────┐
         │  Backend 1  │         │  Backend 2  │
         │ (Port 3000) │         │ (Port 3001) │
         └──────┬──────┘         └─────┬───────┘
                │                      │
                └──────────┬───────────┘
                           │
                    ┌──────▼──────┐
                    │   MongoDB   │
                    │   Replica   │
                    └─────────────┘
```

## Step 1: Deploy with Load Balancer

Use the load-balanced Docker Compose configuration:

```bash
cd ~/apps/voting-system

# Stop standard deployment if running
docker-compose down

# Deploy with load balancer (2 backend instances)
docker compose -f docker-compose.lb.yml up -d --build

# Verify all services are running
docker compose -f docker-compose.lb.yml ps
```

## Step 2: Verify Load Balancing

```bash
# Check nginx load balancer logs
docker logs nginx-loadbalancer

# Monitor backend instances
docker stats backend1 backend2

# Test API through load balancer
curl http://localhost:3000/api/isconnected

# Check nginx status
curl http://localhost:3000/nginx_status
```

## Step 3: Configure Host Nginx for Load Balanced Setup

Update your host nginx configuration (`/etc/nginx/sites-available/voting`):

```nginx
server {
    listen 80;
    server_name voting.jeinsat.com 51.210.255.109;

    # Proxy to Docker load balancer (port 3000)
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # SSE support
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Reload host nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Load Balancer Configuration

The `nginx-lb.conf` provides:

- **Load Balancing Algorithm**: `least_conn` - routes to server with fewest active connections
- **Health Checks**: Automatic failover if backend becomes unhealthy (max_fails=3, fail_timeout=30s)
- **Connection Pooling**: Keeps 64 persistent connections to backends
- **SSE Support**: Optimized for long-lived Server-Sent Events connections
- **Rate Limiting**: 
  - API endpoints: 100 req/s per IP (burst: 50)
  - Voting endpoints: 10 req/s per IP (burst: 5)

## Scaling Backends

To add more backend instances, edit `docker-compose.lb.yml`:

```yaml
# Add backend3
backend3:
  build:
    context: ./server
    dockerfile: Dockerfile
  env_file:
    - ./server/.env
  environment:
    - PORT=3002
    - MONGO_URI=mongodb://mongo:27017/votingsystem?replicaSet=rs0
    - INSTANCE_NAME=backend3
  networks:
    - app-network
  expose:
    - "3002"
  volumes:
    - dist_data:/app/client/dist
  depends_on:
    mongo:
      condition: service_healthy
  restart: unless-stopped
```

Update `nginx-lb.conf`:

```nginx
upstream backend_servers {
    least_conn;
    
    server backend1:3000 max_fails=3 fail_timeout=30s weight=1;
    server backend2:3001 max_fails=3 fail_timeout=30s weight=1;
    server backend3:3002 max_fails=3 fail_timeout=30s weight=1;
    
    keepalive 64;
}
```

Redeploy:

```bash
docker compose -f docker-compose.lb.yml up -d --build
```

## Performance Tuning

### MongoDB Connection Pooling

Each backend should optimize connection pooling. In `server/.env`:

```env
MONGO_POOL_SIZE=50
MONGO_MAX_IDLE_TIME=30000
```

### Nginx Worker Processes

For high concurrency, tune `nginx-lb.conf`:

```nginx
events {
    worker_connections 4096;  # Increase for more connections
    use epoll;  # Efficient on Linux
}
```

### Backend Instances

General rule: **1-2 backend instances per CPU core**

For 4-core server:
- 2-4 backend instances for balanced performance
- 4-8 backend instances for maximum throughput

## Monitoring Load Distribution

```bash
# Real-time stats
docker stats backend1 backend2

# Request logs
docker logs -f nginx-loadbalancer

# Backend logs
docker logs -f backend1
docker logs -f backend2

# Check which backend handled request
curl -v http://localhost:3000/api/isconnected
```

## Load Testing

Validate your load-balanced setup with K6:

```bash
cd k6-tests

# Extract voter codes
node extract-voter-codes.mjs

# Run mixed workload test (recommended)
k6 run k6-mixed-workload.js

# Monitor during test
docker stats backend1 backend2
```

See [LOAD_TESTING.md](./LOAD_TESTING.md) for complete load testing documentation.

## Troubleshooting Load Balanced Setup

### Backend not receiving traffic

```bash
# Check nginx upstream status
docker exec nginx-loadbalancer cat /var/log/nginx/error.log

# Test backend directly
curl http://localhost:3000/api/isconnected  # Through load balancer
docker exec backend1 curl http://localhost:3000/api/isconnected  # Direct
docker exec backend2 curl http://localhost:3001/api/isconnected  # Direct
```

### Uneven load distribution

```bash
# Check connection counts
docker exec nginx-loadbalancer wget -q -O - http://localhost/nginx_status

# Verify least_conn algorithm is active
docker exec nginx-loadbalancer cat /etc/nginx/nginx.conf | grep least_conn
```

### SSE connections dropping

For sticky sessions (same client to same backend), enable `ip_hash` in `nginx-lb.conf`:

```nginx
upstream backend_servers {
    ip_hash;  # Enable sticky sessions
    
    server backend1:3000;
    server backend2:3001;
    
    keepalive 64;
}
```

Restart nginx-lb:

```bash
docker compose -f docker-compose.lb.yml restart nginx-lb
```

## Production Recommendations

For optimal performance with 600+ concurrent users:

1. **2-4 backend instances** behind load balancer
2. **MongoDB replica set** (already configured)
3. **Connection pooling** optimized (50+ connections per backend)
4. **Rate limiting** enabled (prevents abuse)
5. **Health checks** active (automatic failover)
6. **Monitoring** in place (docker stats, logs)

## Common Commands

```bash
# Deploy load balanced
docker compose -f docker-compose.lb.yml up -d --build

# Stop load balanced
docker compose -f docker-compose.lb.yml down

# View logs
docker compose -f docker-compose.lb.yml logs -f

# Restart single backend
docker compose -f docker-compose.lb.yml restart backend1

# Scale backends (if using replicas)
docker compose -f docker-compose.lb.yml up -d --scale backend=4

# Monitor
docker stats backend1 backend2 nginx-loadbalancer mongodb
```

---

Your voting system should now be accessible at http://voting.jeinsat.com
