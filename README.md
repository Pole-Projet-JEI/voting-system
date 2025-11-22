# Voting System

A real-time voting application built with React, Node.js, Express, and MongoDB. Supports live voting with Server-Sent Events (SSE) for real-time updates.

## Features

- 🗳️ Real-time voting system
- 👥 User registration and authentication
- 📊 Admin dashboard with live statistics
- 🔄 Server-Sent Events for live updates
- 🐳 Docker containerization
- 📱 Responsive design
- 🔒 Secure session management
- ⚖️ Load balancing with multiple backend instances
- 🧪 Comprehensive K6 load testing suite

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Replica Set
- **Real-time**: Server-Sent Events (SSE)
- **Containerization**: Docker & Docker Compose
- **Web Server**: Nginx

## Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for local development)

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd voting-system

# Install dependencies
npm run install:all

# Start development servers
cd client && npm run dev
cd server && npm run start:dev
```

### Production Deployment

For detailed deployment instructions, including setup for 600+ concurrent users, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

Quick deployment:

```bash
# Configure environment variables
cp server/.env.example server/.env
cp client/.env.example client/.env

# Edit .env files with your configuration

# Build and start services
docker-compose build
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

## Project Structure

```
voting-system/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── service/       # API service layer
│   │   └── shared/        # Shared components
│   ├── Dockerfile         # Frontend Docker image
│   └── default.conf       # Nginx configuration
│
├── server/                # Express backend application
│   ├── src/
│   │   ├── admin/         # Admin API routes
│   │   ├── check/         # Status check routes
│   │   ├── mongodb/       # Database schemas
│   │   ├── register/      # Registration routes
│   │   ├── vote/          # Voting routes
│   │   └── index.mjs      # Server entry point
│   └── Dockerfile         # Backend Docker image
│
├── k6-tests/              # K6 load testing suite
│   ├── k6-voter-flow.js   # Voter registration + voting test
│   ├── k6-sse-test.js     # SSE connection stress test
│   ├── k6-admin-test.js   # Admin operations test
│   ├── k6-mixed-workload.js  # Real-world mixed traffic
│   ├── extract-voter-codes.mjs  # Helper script
│   └── run-all-tests.sh   # Interactive test runner
│
├── docker-compose.yml     # Standard Docker Compose config
├── docker-compose.lb.yml  # Load-balanced configuration
├── nginx-lb.conf          # Nginx load balancer config
├── DEPLOYMENT.md          # Deployment and load balancing guide
└── LOAD_TESTING.md        # K6 load testing documentation
```

## Environment Variables

### Server (`server/.env`)

```env
NODE_ENV=production
PORT=3000
HOST=voting.jeinsat.com
MONGO_URI=mongodb://mongo:27017/votingsystem?replicaSet=rs0
SESSION_SECRET=your-secret-key
REDIS_URL=redis://redis:6379
```

### Client (`client/.env`)

```env
VITE_API_URL=https://voting.jeinsat.com/api
```

## API Endpoints

### Public Endpoints

- `GET /api/isconnected` - Check connection status
- `POST /api/register` - Register new voter
- `GET /api/currentteam` - Get currently presenting team
- `GET /api/sendvote` - SSE stream for live updates

### Protected Endpoints (Requires Authentication)

- `POST /api/vote/:id` - Submit vote for team
- `GET /api/hasvoted` - Check if user has voted

### Admin Endpoints (Requires Admin Authentication)

- `POST /api/admin/login` - Admin login
- `POST /api/admin/logout` - Admin logout
- `GET /api/admin/teams` - Get all teams
- `POST /api/admin/teams` - Create team
- `PUT /api/admin/teams/:id` - Update team
- `DELETE /api/admin/teams/:id` - Delete team
- `POST /api/admin/presenting/:id` - Set presenting team
- `GET /api/admin/visualization` - Get voting statistics

## Scaling for High Traffic

The application is designed to scale horizontally. For 600+ concurrent users:

1. **Multiple Backend Instances**: Run 2-4 backend instances behind Nginx load balancer
2. **MongoDB Session Store**: Use MongoDB for shared session storage
3. **Connection Pooling**: Optimize MongoDB connection pool
4. **Load Balancing**: Configure Nginx with least-connections algorithm
5. **SSE Optimization**: Handle 100+ concurrent SSE connections per instance

### Quick Load Balanced Deployment

```bash
# Deploy with load balancer (2 backend instances)
docker compose -f docker-compose.lb.yml up -d --build

# Verify load balancing
docker logs nginx-loadbalancer
docker stats backend1 backend2

# Test with k6
cd k6-tests
k6 run k6-mixed-workload.js
```

**Architecture:**

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

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for detailed scaling and load balancing instructions, and **[LOAD_TESTING.md](./LOAD_TESTING.md)** for comprehensive load testing guide.

## Development

### Running Locally

```bash
# Install dependencies
npm run install:all

# Start MongoDB (if not using Docker)
mongod --replSet rs0

# Start backend
cd server
npm run start:dev

# Start frontend (in another terminal)
cd client
npm run dev
```

### Building for Production

```bash
# Build frontend
cd client
npm run build

# Build Docker images
docker-compose build
```

## Testing

### Unit/Integration Tests

```bash
# Run tests (if available)
npm test

# Check health endpoint
curl http://localhost:3000/health
```

### Load Testing with K6

Comprehensive load testing suite to validate performance and scalability.

**Quick Start:**

```bash
# Install k6
brew install k6  # macOS
# OR
sudo apt install k6  # Ubuntu

# Extract voter codes
cd k6-tests
node extract-voter-codes.mjs

# Run voter flow test
k6 run k6-voter-flow.js

# Interactive test runner
./run-all-tests.sh
```

**Available Tests:**

| Test | Purpose | Duration |
|------|---------|----------|
| `k6-voter-flow.js` | Registration + voting flow | 7 min |
| `k6-sse-test.js` | SSE connection stress test | 8 min |
| `k6-admin-test.js` | Admin operations | 5 min |
| `k6-mixed-workload.js` | Real-world simulation (recommended) | 10 min |

**Load Balancing Setup:**

Deploy with multiple backend instances for testing:

```bash
# Deploy with 2 backend instances + nginx load balancer
docker compose -f docker-compose.lb.yml up -d --build

# Run load test
cd k6-tests
k6 run k6-mixed-workload.js

# Monitor load distribution
docker stats backend1 backend2
```

**Example Results:**

```
✓ registration status 200
✓ vote status 200

checks.........................: 98.45%  ✓ 1969 ✗ 31
http_req_duration..............: avg=456ms p(95)=1.2s p(99)=1.8s
http_reqs......................: 2000    66.66/s
vote_success_rate..............: 97.50%  ✓ 975 ✗ 25
```

For complete load testing documentation, benchmarks, and best practices, see **[LOAD_TESTING.md](./LOAD_TESTING.md)**.

## Monitoring

- Health check: `GET /health`
- View logs: `docker-compose logs -f`
- Check status: `docker-compose ps`

## Troubleshooting

Common issues and solutions are documented in **[DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting)**.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

[Add your license here]

## Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment guide with load balancing setup
- **[LOAD_TESTING.md](./LOAD_TESTING.md)** - K6 load testing guide with benchmarks

## Support

For deployment issues, refer to **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

For load testing and performance tuning, see **[LOAD_TESTING.md](./LOAD_TESTING.md)**.

For other issues, please open an issue in the repository.

---

**Quick Links:**
- [Deployment Guide](./DEPLOYMENT.md)
- [Load Testing Guide](./LOAD_TESTING.md)
- [K6 Tests](./k6-tests/)

