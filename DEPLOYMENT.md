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

Your voting system should now be accessible at http://voting.jeinsat.com
