# Pulseo — Guide de déploiement

Ce guide couvre le déploiement complet de Pulseo en production sur un VPS avec Docker PostgreSQL, Git hooks, PM2, Nginx, SSL, pare-feu, et monitoring.

## Table des matières

1. [Infrastructure PostgreSQL](#infrastructure-postgresql)
2. [Déploiement Git](#déploiement-git)
3. [PM2 Process Manager](#pm2-process-manager)
4. [Configuration Nginx](#configuration-nginx)
5. [SSL Let's Encrypt](#ssl-lets-encrypt)
6. [Pare-feu UFW](#pare-feu-ufw)
7. [Fail2ban](#fail2ban)
8. [Sauvegarde](#sauvegarde)
9. [Monitoring et logs](#monitoring-et-logs)

---

## Infrastructure PostgreSQL

### Docker PostgreSQL avec persistance

**Installation Docker** :
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
```

### Démarrer PostgreSQL

```bash
# Créer un volume persistant
docker volume create pulseo_db_data

# Lancer le container
docker run -d \
  --name pulseo-postgres \
  -e POSTGRES_DB=pulseo \
  -e POSTGRES_USER=pulseo_admin \
  -e POSTGRES_PASSWORD=$(openssl rand -base64 32) \
  -p 5433:5432 \
  -v pulseo_db_data:/var/lib/postgresql/data \
  -v /opt/postgres-backup:/backup \
  --restart=always \
  postgres:16-alpine
```

### Stockage du mot de passe

```bash
# Sauvegarder le mot de passe en sécurité
sudo touch /opt/pulseo-secrets.env
sudo chmod 600 /opt/pulseo-secrets.env
echo "POSTGRES_PASSWORD=$(docker inspect pulseo-postgres | grep -i password)" | sudo tee /opt/pulseo-secrets.env
```

### Vérification de la connexion

```bash
# Tester la connexion
docker exec pulseo-postgres psql -U pulseo_admin -d pulseo -c "SELECT 1"

# Ou depuis le VPS
psql -h localhost -p 5433 -U pulseo_admin -d pulseo
```

---

## Déploiement Git

### Créer le repository bare sur le VPS

```bash
# En tant que root sur le VPS
sudo mkdir -p /opt/pulseo.git
sudo chown -R deploy:deploy /opt/pulseo.git
cd /opt/pulseo.git
git init --bare
```

### Post-receive hook

**Fichier** : `/opt/pulseo.git/hooks/post-receive`

```bash
#!/bin/bash
set -e

REPO_PATH="/opt/pulseo.git"
WORK_PATH="/opt/pulseo"
ENV_FILE="$WORK_PATH/.env.production"
PM2_APP_NAME="pulseo"
LOG_FILE="/var/log/pulseo-deploy.log"

# Log des opérations
exec >> "$LOG_FILE" 2>&1
echo "=== Début du déploiement à $(date) ==="

# 1. Créer le répertoire de travail s'il n'existe pas
if [ ! -d "$WORK_PATH" ]; then
    mkdir -p "$WORK_PATH"
    git clone "$REPO_PATH" "$WORK_PATH"
fi

# 2. Mettre à jour le repository
cd "$WORK_PATH"
git fetch origin
git reset --hard origin/main

# 3. Copier les fichiers d'environnement
if [ -f "/opt/pulseo-secrets.env" ]; then
    source /opt/pulseo-secrets.env

    cat > "$ENV_FILE" << EOF
# Base de données
DB_HOST=localhost
DB_PORT=5433
DB_USER=pulseo_admin
DB_PASSWORD=$POSTGRES_PASSWORD
DB_NAME=pulseo

# Next.js
NODE_ENV=production
NEXT_PUBLIC_URL=https://your-domain.tld

# Authentication
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=https://your-domain.tld

# Resend (emails)
RESEND_API_KEY=$RESEND_API_KEY

# Sentry (error tracking)
SENTRY_DSN=$SENTRY_DSN
EOF
    chmod 600 "$ENV_FILE"
fi

# 4. Installer les dépendances
npm ci --production

# 5. Appliquer les migrations
npm run drizzle:migrate || echo "Migrations échouées, mais continuant..."

# 6. Construire l'application
npm run build

# 7. Redémarrer PM2
pm2 restart "$PM2_APP_NAME" --update-env || pm2 start ecosystem.config.js

# 8. Vérifier le statut
pm2 status

echo "=== Fin du déploiement à $(date) ==="
```

### Rendre le hook exécutable

```bash
chmod +x /opt/pulseo.git/hooks/post-receive
```

### Configurer le repository local

Sur votre machine de développement :

```bash
# Ajouter le remote
git remote add production deploy@votre-vps.com:/opt/pulseo.git

# Déployer
git push production main
```

---

## PM2 Process Manager

### Installation globale

```bash
sudo npm install -g pm2
pm2 startup
pm2 install pm2-logrotate
```

### Fichier de configuration

**Fichier** : `/opt/pulseo/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: "pulseo",
      script: ".next/standalone/server.js",
      cwd: "/opt/pulseo",
      instances: 2,
      exec_mode: "cluster",

      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      max_memory_restart: "500M",
      max_restarts: 10,
      min_uptime: "10s",

      error_file: "/var/log/pulseo-error.log",
      out_file: "/var/log/pulseo-out.log",
      log_file: "/var/log/pulseo-combined.log",
      time: true,

      // Redémarrage automatique
      watch: false,
      ignore_watch: ["node_modules", ".git", "public"],

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,

      // Hooks
      events: {
        restart: "pm2 notify restart",
        exit: "pm2 notify exit",
      },
    },
  ],
};
```

### Commandes PM2 utiles

```bash
# Démarrer l'application
pm2 start ecosystem.config.js

# Redémarrer
pm2 restart pulseo

# Arrêter
pm2 stop pulseo

# Voir les logs
pm2 logs pulseo

# Statistiques en temps réel
pm2 monit

# Sauvegarder la configuration
pm2 save
pm2 startup
```

---

## Configuration Nginx

### Installer Nginx

```bash
sudo apt-get install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Fichier de configuration

**Fichier** : `/etc/nginx/sites-available/pulseo`

```nginx
# Upstream vers PM2
upstream pulseo_backend {
    server localhost:3000;
    server localhost:3000;
    keepalive 32;
}

# Redirection HTTP vers HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.tld;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS avec Let's Encrypt
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.tld;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/your-domain.tld/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.tld/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

    # Client body size
    client_max_body_size 100M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/x-javascript application/xml+rss
               application/json;

    # Logs
    access_log /var/log/nginx/pulseo-access.log combined;
    error_log /var/log/nginx/pulseo-error.log warn;

    # Root directory
    root /opt/pulseo/public;

    # Static files (cache)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Public directory
    location /public/ {
        alias /opt/pulseo-storage/;
        expires 7d;
    }

    # API rate limiting
    location /api/ {
        limit_req zone=api_limit burst=50 nodelay;
        proxy_pass http://pulseo_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Login endpoint rate limiting
    location /api/auth/sign-in {
        limit_req zone=login_limit burst=5 nodelay;
        proxy_pass http://pulseo_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Application (Next.js)
    location / {
        proxy_pass http://pulseo_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check (PM2)
    location /health {
        access_log off;
        proxy_pass http://pulseo_backend;
    }

    # Deny hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

### Activer la configuration

```bash
sudo ln -s /etc/nginx/sites-available/pulseo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL Let's Encrypt

### Installation Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### Créer le certificat

```bash
sudo certbot certonly --nginx \
  -d your-domain.tld \
  --non-interactive \
  --agree-tos \
  --email admin@your-domain.tld \
  --preferred-challenges http
```

### Auto-renouvellement

```bash
# Vérifier que le renouvellement fonctionne
sudo certbot renew --dry-run

# Ajouter la cron (généralement déjà configurée)
sudo crontab -e

# Ajouter cette ligne :
# 0 12 * * * /usr/bin/certbot renew --quiet && /usr/sbin/systemctl reload nginx
```

---

## Pare-feu UFW

### Activer UFW

```bash
sudo apt-get install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

### Ajouter les règles

```bash
# SSH (utiliser un port custom)
sudo ufw allow 22/tcp
# Ou si port custom
sudo ufw allow 2222/tcp

# HTTP
sudo ufw allow 80/tcp

# HTTPS
sudo ufw allow 443/tcp

# PostgreSQL (local uniquement)
sudo ufw allow from 127.0.0.1 to 127.0.0.1 port 5433

# Activer
sudo ufw enable

# Vérifier
sudo ufw status verbose
```

### Changer le port SSH (optionnel)

```bash
sudo sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
sudo systemctl reload ssh
# Puis autoriser le nouveau port dans UFW
```

---

## Fail2ban

### Installation

```bash
sudo apt-get install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Configuration SSH

**Fichier** : `/etc/fail2ban/jail.local`

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = admin@your-domain.tld
sendername = Fail2Ban Pulseo

[sshd]
enabled = true
port = ssh,2222
filter = sshd
logpath = /var/log/auth.log

[recidive]
enabled = true
filter = recidive
logpath = /var/log/fail2ban.log
action = iptables-multiport[name=recidive, port="http,https,ssh,2222", protocol=tcp]
bantime = 604800
findtime = 86400
maxretry = 5

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/pulseo-error.log

[nginx-noscript]
enabled = true
port = http,https
filter = nginx-noscript
logpath = /var/log/nginx/pulseo-access.log
maxretry = 6

[nginx-badbots]
enabled = true
port = http,https
filter = nginx-badbots
logpath = /var/log/nginx/pulseo-access.log
maxretry = 2

[nginx-noproxy]
enabled = true
port = http,https
filter = nginx-noproxy
logpath = /var/log/nginx/pulseo-access.log
maxretry = 2

[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/pulseo-error.log
maxretry = 5

[pulseo-login]
enabled = true
port = http,https
filter = pulseo-login
logpath = /var/log/nginx/pulseo-access.log
maxretry = 5
findtime = 300
bantime = 1800
action = iptables-multiport[name=pulseo-login, port="http,https"]
```

### Filtre personnalisé pour Pulseo

**Fichier** : `/etc/fail2ban/filter.d/pulseo-login.conf`

```ini
[Definition]
failregex = ^<HOST> - .* "\w+ /api/auth/sign-in HTTP.*" (401|403)
ignoreregex =
```

### Redémarrer Fail2ban

```bash
sudo systemctl restart fail2ban

# Vérifier les jails actives
sudo fail2ban-client status

# Vérifier une jail spécifique
sudo fail2ban-client status sshd
```

---

## Sauvegarde

### Script de sauvegarde

**Fichier** : `/opt/pulseo-backup.sh`

```bash
#!/bin/bash

BACKUP_DIR="/opt/backups"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
DB_BACKUP="$BACKUP_DIR/pulseo_db_$DATE.sql.gz"
APP_BACKUP="$BACKUP_DIR/pulseo_app_$DATE.tar.gz"
LOG_FILE="/var/log/pulseo-backup.log"

echo "=== Début de sauvegarde à $(date) ===" >> "$LOG_FILE"

# Créer le répertoire s'il n'existe pas
mkdir -p "$BACKUP_DIR"

# 1. Sauvegarder la base de données
echo "Sauvegarde de la base de données..." >> "$LOG_FILE"
docker exec pulseo-postgres pg_dump -U pulseo_admin pulseo | gzip > "$DB_BACKUP"

if [ $? -eq 0 ]; then
    echo "✓ Sauvegarde DB réussie : $DB_BACKUP" >> "$LOG_FILE"
else
    echo "✗ Erreur sauvegarde DB" >> "$LOG_FILE"
    exit 1
fi

# 2. Sauvegarder l'application
echo "Sauvegarde de l'application..." >> "$LOG_FILE"
tar -czf "$APP_BACKUP" \
    -C /opt pulseo/.env.production \
    -C /opt pulseo/public \
    -C /opt pulseo-storage \
    2>> "$LOG_FILE"

if [ $? -eq 0 ]; then
    echo "✓ Sauvegarde APP réussie : $APP_BACKUP" >> "$LOG_FILE"
else
    echo "✗ Erreur sauvegarde APP" >> "$LOG_FILE"
fi

# 3. Nettoyer les anciennes sauvegardes
echo "Nettoyage des sauvegardes anciennes (> $RETENTION_DAYS jours)..." >> "$LOG_FILE"
find "$BACKUP_DIR" -name "pulseo_*" -mtime +$RETENTION_DAYS -delete

# 4. Vérifier l'espace disque
USAGE=$(df "$BACKUP_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
echo "Utilisation disque : $USAGE%" >> "$LOG_FILE"

if [ "$USAGE" -gt 90 ]; then
    echo "⚠ Alerte : espace disque faible" >> "$LOG_FILE"
fi

echo "=== Fin de sauvegarde à $(date) ===" >> "$LOG_FILE"
```

### Planifier les sauvegardes

```bash
chmod +x /opt/pulseo-backup.sh

# Ajouter la cron
sudo crontab -e

# Ajouter cette ligne (sauvegarde quotidienne à 2h du matin)
# 0 2 * * * /opt/pulseo-backup.sh
```

---

## Monitoring et logs

### Logs PM2

```bash
# Voir les logs
pm2 logs pulseo

# Voir seulement les erreurs
pm2 logs pulseo --err

# Nombre de lignes
pm2 logs pulseo --lines 100

# JSON format
pm2 logs pulseo --json
```

### Logs Nginx

```bash
# Accès
tail -f /var/log/nginx/pulseo-access.log

# Erreurs
tail -f /var/log/nginx/pulseo-error.log

# Filtrer les erreurs 5xx
grep " 5[0-9][0-9] " /var/log/nginx/pulseo-access.log

# Adresses IP avec plus de 100 requêtes
awk '{print $1}' /var/log/nginx/pulseo-access.log | sort | uniq -c | sort -rn | head
```

### Health check

```bash
# Vérifier l'application
curl -s https://your-domain.tld/health

# Vérifier Nginx
sudo systemctl status nginx

# Vérifier PM2
pm2 status

# Vérifier PostgreSQL
docker ps | grep pulseo-postgres
```

### Monitoring avancé

```bash
# Installer Telegraf (monitoring)
sudo apt-get install -y telegraf

# Configurer les métriques de l'application
pm2 web  # Port 9615 par défaut
```

---

## Checklist de déploiement

- [ ] VPS SSH clé configurée
- [ ] Docker PostgreSQL en cours d'exécution
- [ ] Repository Git bare créé
- [ ] Post-receive hook configuré
- [ ] PM2 avec ecosystem.config.js
- [ ] Nginx configuré et redémarré
- [ ] Let's Encrypt certificats installés
- [ ] UFW pare-feu activé
- [ ] Fail2ban configuré
- [ ] Sauvegarde cron planifiée
- [ ] Logs configurés et testés
- [ ] Premier déploiement : `git push production main`

---

## Ressources

- [Docker Documentation](https://docs.docker.com)
- [PM2 Ecosystem](https://pm2.keymetrics.io)
- [Nginx Proxy](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Let's Encrypt](https://letsencrypt.org)
- [UFW Firewall](https://help.ubuntu.com/community/UFW)
- [Fail2ban](https://www.fail2ban.org)
