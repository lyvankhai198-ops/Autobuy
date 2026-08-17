# Deploy AutoOrder lên VPS

## Cấu trúc 3 dự án trên VPS

| Dự án | Thư mục | Service | Port | Nginx path |
|-------|---------|---------|------|------------|
| **AutoOrder** | `/root/autoorder` | `autoorder-api.service` | **3003** | `/autoorder/`, `/autoorder/api/` |
| **Bot-Qu-Tng** | `/root/Bot-Qu-Tng` | `bot-api.service` | 3002 | `/api/`, `/admin-panel/` |
| **CheckGPT** | `/opt/checkgpt` | pm2 `api-server` | 3001 | `/checkgpt-api/`, `/checkgpt-admin/` |

> ⚠️ **Quan trọng**: Mỗi dự án có service riêng biệt, port riêng biệt. Khi sửa dự án này KHÔNG ảnh hưởng dự án kia.

## Quy trình deploy AutoOrder

### Cách 1: Deploy script tự động (khuyên dùng)

```bash
VPS_PASSWORD='Khai123khai@' bash deploy/deploy-vps.sh
```

### Cách 2: Thủ công

```bash
# 1. Push code lên GitHub từ Replit
git push origin main

# 2. SSH vào VPS
ssh root@103.180.138.203

# 3. Trên VPS:
cd /root/autoorder
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server build
BASE_PATH=/autoorder/ pnpm --filter @workspace/dashboard build
cp -r artifacts/dashboard/dist/public/. /var/www/autoorder/dashboard/
systemctl restart autoorder-api.service
```

## Kiểm tra trạng thái

```bash
# Trên VPS:
systemctl status autoorder-api.service
journalctl -u autoorder-api.service -n 50 --no-pager

# Test API:
curl http://127.0.0.1/autoorder/api/healthz
curl http://127.0.0.1/autoorder/api/orders/stats
```

## Service file (tham khảo)

File service nằm tại `/etc/systemd/system/autoorder-api.service` trên VPS.
Nếu cần tạo lại:

```bash
cat > /etc/systemd/system/autoorder-api.service << 'EOF'
[Unit]
Description=AutoOrder API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/autoorder
Environment=PORT=3003
Environment=BASE_PATH=/api/
Environment=NODE_ENV=production
Environment=DATABASE_URL=postgresql://autoorder:...@localhost:5432/autoorder
Environment=SESSION_SECRET=...
Environment=CANBOSO_USERNAME=...
Environment=CANBOSO_PASSWORD=...
Environment=CANBOSO2_USERNAME=...
Environment=CANBOSO2_PASSWORD=...
Environment=CANBOSO2_BOT_TOKEN=...
ExecStart=/usr/bin/node --enable-source-maps /root/autoorder/artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable autoorder-api.service
systemctl start autoorder-api.service
```

## Nginx config (tham khảo)

File nginx tại `/etc/nginx/sites-enabled/botadmin`.
Phần quan trọng cho AutoOrder:

```nginx
# AutoOrder Dashboard (static files)
location /autoorder/ {
    alias /var/www/autoorder/dashboard/;
    try_files $uri $uri/ @autoorder_fallback;
}

# AutoOrder API (proxy to port 3003)
location /autoorder/api/ {
    rewrite ^/autoorder/api/(.*)$ /api/$1 break;
    proxy_pass http://127.0.0.1:3003;
}
```
