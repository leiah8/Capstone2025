#!/bin/bash
# Setup and start Docker services for Peer.io backend

set -e

echo "🐳 Peer.io Docker Setup"
echo "=" | head -c 60
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo ""
    echo "📥 Install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    echo ""
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker Desktop is not running!"
    echo ""
    echo "👉 Please start Docker Desktop and try again"
    echo ""
    echo "macOS: Open Docker Desktop from Applications"
    echo "Windows: Start Docker Desktop from Start Menu"
    echo "Linux: sudo systemctl start docker"
    echo ""
    exit 1
fi

echo "✅ Docker is installed and running"
echo ""

# Clean up any existing containers
echo "🧹 Cleaning up old containers..."
docker-compose down 2>/dev/null || true
echo ""

# Build and start services
echo "🔨 Building Docker images..."
echo "   This may take 3-5 minutes on first run (downloading dependencies)"
echo ""
docker-compose build

echo ""
echo "🚀 Starting services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Wait for health checks
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    matching_health=$(docker inspect --format='{{.State.Health.Status}}' peer-matching-api 2>/dev/null || echo "starting")
    parser_health=$(docker inspect --format='{{.State.Health.Status}}' peer-resume-parser 2>/dev/null || echo "starting")
    
    if [ "$matching_health" = "healthy" ] && [ "$parser_health" = "healthy" ]; then
        echo ""
        echo "✅ All services are healthy!"
        break
    fi
    
    echo "   Matching API: $matching_health | Resume Parser: $parser_health"
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo ""
    echo "⚠️  Services took longer than expected to start"
    echo "   Check logs with: docker-compose logs"
fi

echo ""
echo "=" | head -c 60
echo ""
echo "🎉 Docker services are running!"
echo ""
echo "📡 Service URLs:"
echo "   • Matching API:     http://localhost:8000"
echo "   • Matching Docs:    http://localhost:8000/docs"
echo "   • Matching Health:  http://localhost:8000/match/health"
echo ""
echo "   • Resume Parser:    http://localhost:8001"
echo "   • Parser Docs:      http://localhost:8001/docs"
echo "   • Parser Health:    http://localhost:8001/health"
echo ""
echo "📊 Useful Commands:"
echo "   • View logs:        docker-compose logs -f"
echo "   • Stop services:    docker-compose down"
echo "   • Restart:          docker-compose restart"
echo "   • Test services:    python test_services.py"
echo ""
echo "=" | head -c 60
echo ""
