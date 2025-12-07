#!/bin/bash

set -e

echo "======================================"
echo "E-PPT Deployment Script"
echo "======================================"

echo ""
echo "Step 1: Stopping existing containers..."
docker compose down

echo ""
echo "Step 2: Building Docker image..."
docker compose build --no-cache

echo ""
echo "Step 3: Starting containers..."
docker compose up -d

echo ""
echo "Step 4: Checking container status..."
docker compose ps

echo ""
echo "======================================"
echo "Deployment completed successfully!"
echo "======================================"
echo ""
echo "Application is running at: http://localhost:4000"
echo ""
echo "Useful commands:"
echo "  - View logs:        docker compose logs -f"
echo "  - Stop containers:  docker compose down"
echo "  - Restart:          docker compose restart"
echo ""
