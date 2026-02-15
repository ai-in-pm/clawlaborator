#!/bin/bash

set -e

echo "🏢 OpenClaw Enterprise Setup"
echo "=========================="

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ Do not run this script as root"
   exit 1
fi

# Check system requirements
echo "🔍 Checking system requirements..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check minimum system resources
TOTAL_RAM=$(free -g | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM" -lt 8 ]; then
    echo "⚠️  Warning: System has less than 8GB RAM. Enterprise deployment may be slow."
fi

DISK_SPACE=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$DISK_SPACE" -lt 50 ]; then
    echo "⚠️  Warning: Less than 50GB disk space available."
fi

echo "✅ System requirements check passed"

# Create necessary directories
echo "📁 Creating directory structure..."
mkdir -p enterprise-config
mkdir -p nginx/ssl
mkdir -p monitoring/{prometheus,grafana/{dashboards,datasources}}
mkdir -p init-db
mkdir -p logs

# Generate SSL certificate if not exists
if [ ! -f "nginx/ssl/cert.pem" ] || [ ! -f "nginx/ssl/private.key" ]; then
    echo "🔐 Generating self-signed SSL certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/private.key \
        -out nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=Enterprise/CN=localhost"
fi

# Create nginx configuration
echo "🌐 Setting up reverse proxy configuration..."
cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream openclaw {
        server openclaw-enterprise:18789;
    }

    upstream dashboard {
        server openclaw-enterprise:3000;
    }

    server {
        listen 80;
        server_name _;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name _;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/private.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        client_max_body_size 50M;

        location /api/ {
            proxy_pass http://openclaw/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location / {
            proxy_pass http://dashboard/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF

# Create Prometheus configuration
echo "📊 Setting up monitoring configuration..."
cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"

scrape_configs:
  - job_name: 'openclaw'
    static_configs:
      - targets: ['openclaw-enterprise:18789']
    metrics_path: '/metrics'

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']
EOF

# Create Grafana datasource configuration
mkdir -p monitoring/grafana/datasources
cat > monitoring/grafana/datasources/prometheus.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

# Create database initialization script
echo "🗄️  Setting up database initialization..."
cat > init-db/01-init.sql << 'EOF'
-- Create enterprise database schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS enterprise_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'user', 'readonly')),
    mfa_enabled BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    failed_attempts INTEGER DEFAULT 0,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit events table
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES enterprise_users(id),
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    outcome VARCHAR(10) CHECK (outcome IN ('success', 'failure')),
    risk_level VARCHAR(10) CHECK (risk_level IN ('low', 'medium', 'high')),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Content policies table
CREATE TABLE IF NOT EXISTS content_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rules JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    severity VARCHAR(10) CHECK (severity IN ('low', 'medium', 'high')),
    action VARCHAR(20) CHECK (action IN ('warn', 'block', 'quarantine')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_enterprise_users_email ON enterprise_users(email);

-- Insert default admin user (password should be changed on first login)
INSERT INTO enterprise_users (email, name, department, role, mfa_enabled, is_active)
VALUES ('admin@enterprise.com', 'System Administrator', 'IT', 'admin', true, true)
ON CONFLICT (email) DO NOTHING;
EOF

# Setup environment file
if [ ! -f ".env" ]; then
    echo "📝 Creating environment configuration..."
    cp .env.enterprise .env
    echo "⚠️  Please edit .env file with your specific configuration before running the system"
else
    echo "✅ Environment file already exists"
fi

# Generate secure passwords for services
echo "🔑 Generating secure passwords..."
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
GRAFANA_PASSWORD=$(openssl rand -base64 16)

# Update environment file with generated passwords
if [ -f ".env" ]; then
    sed -i.bak "s/your_secure_postgres_password_here/$POSTGRES_PASSWORD/g" .env
    sed -i.bak "s/your_secure_redis_password_here/$REDIS_PASSWORD/g" .env
    sed -i.bak "s/your_grafana_admin_password_here/$GRAFANA_PASSWORD/g" .env
    rm .env.bak
fi

# Set permissions
chmod 600 .env
chmod 600 nginx/ssl/private.key

echo ""
echo "🎉 Enterprise setup completed!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your organization's settings"
echo "2. Configure your AI model API keys in .env"
echo "3. Run: docker-compose -f docker-compose.enterprise.yml up -d"
echo "4. Access the dashboard at: https://localhost"
echo "5. Monitor with Grafana at: https://localhost:3001"
echo ""
echo "Generated passwords:"
echo "- PostgreSQL: $POSTGRES_PASSWORD"
echo "- Redis: $REDIS_PASSWORD"
echo "- Grafana Admin: $GRAFANA_PASSWORD"
echo ""
echo "⚠️  Please save these passwords securely!"
echo ""
echo "For more information, see the enterprise documentation."