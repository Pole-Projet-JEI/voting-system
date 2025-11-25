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
├── docker-compose.yml     # Docker Compose configuration
└── DEPLOYMENT.md          # Comprehensive deployment guide
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

1. **Multiple Backend Instances**: Run 3-4 backend instances behind Nginx
2. **MongoDB Session Store**: Use MongoDB for shared session storage
3. **Redis Pub/Sub**: Use Redis for cross-instance SSE broadcasting
4. **Connection Pooling**: Optimize MongoDB connection pool
5. **Load Balancing**: Configure Nginx with least-connections algorithm

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for detailed scaling instructions.

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

```bash
# Run tests (if available)
npm test

# Check health endpoint
curl http://localhost:3000/health
```

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

## Support

For deployment issues, refer to **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

For other issues, please open an issue in the repository.

---

**For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)**

