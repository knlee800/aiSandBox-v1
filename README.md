# aiSandBox - AI-Powered Coding Sandbox Platform

An AI-powered coding sandbox where users can build applications through natural conversation with Claude AI.

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 20+
- npm 10+

### Setup

1. **Go to project directory:**
```bash
cd aiSandBox
```

2. **Initialize SQLite database:**
```bash
node database/test-sqlite.js
```

You should see: ✅ Database test PASSED!

**Note:** We're using SQLite for development in Vibecode sandbox. When deploying to QNAP, we'll use PostgreSQL with Docker (as per the original plan).

### Docker Commands

```bash
# Start all services
npm run dev

# Start and rebuild
npm run dev:build

# Stop all services
npm run down

# Reset database (delete all data)
npm run db:reset

# Clean everything (including volumes)
npm run clean
```

### Project Structure

```
aiSandBox/
├── services/           # Microservices (NestJS)
│   ├── api-gateway/
│   ├── ai-service/
│   ├── container-manager/
│   ├── billing-service/
│   └── queue-service/
├── packages/           # Shared packages
│   └── shared-types/
├── frontend/           # Next.js frontend
├── database/           # Database schema & migrations
│   ├── schema.sql
│   └── test-connection.js
├── docker-compose.yml  # Docker services
└── .env               # Environment variables
```

## 📋 Development Roadmap

- [x] Step 1: Basic infrastructure (PostgreSQL + Redis)
- [ ] Step 2: API Gateway service
- [ ] Step 3: Container Manager service
- [ ] Step 4: AI Service (Claude integration)
- [ ] Step 5: Frontend (Next.js)
- [ ] Step 6: Full integration

## 🔧 Troubleshooting

**Database won't start:**
```bash
npm run clean
npm run dev
```

**Port already in use:**
Check what's using port 5432 or 6379:
```bash
lsof -i :5432
lsof -i :6379
```

## 📖 Documentation

See `/docs` folder for detailed documentation (coming soon).

## 🤝 Contributing

This is a private project. Development plan: `/AI-SANDBOX-PLATFORM-PLAN.md`
