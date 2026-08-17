#!/bin/bash
# deploy/deploy-vps.sh
# Triển khai AutoOrder API + Dashboard lên VPS 103.180.138.203
# Chạy từ Replit sau khi đã commit code lên GitHub

set -e

VPS_IP="103.180.138.203"
VPS_USER="root"
VPS_DIR="/root/autoorder"
DASHBOARD_PUBLIC="/var/www/autoorder/dashboard"
SYSTEMD_SERVICE="autoorder-api.service"

echo "=========================================="
echo " AutoOrder VPS Deploy"
echo "=========================================="

# Kiểm tra sshpass
if ! command -v sshpass &>/dev/null; then
  echo "ERROR: sshpass not found. Install it first."
  exit 1
fi

# Kiểm tra VPS_PASSWORD env var
if [ -z "$VPS_PASSWORD" ]; then
  echo "ERROR: VPS_PASSWORD env var chưa được set."
  echo "Chạy: VPS_PASSWORD='...' bash deploy/deploy-vps.sh"
  exit 1
fi

SSH="sshpass -p '$VPS_PASSWORD' ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_IP"
SCP="sshpass -p '$VPS_PASSWORD' scp -o StrictHostKeyChecking=no"

echo ""
echo ">>> Bước 1: Git pull trên VPS..."
eval "$SSH" "cd $VPS_DIR && git pull origin main"

echo ""
echo ">>> Bước 2: Cài dependencies..."
eval "$SSH" "cd $VPS_DIR && pnpm install --frozen-lockfile"

echo ""
echo ">>> Bước 3: Build API server..."
eval "$SSH" "cd $VPS_DIR && pnpm --filter @workspace/api-server build"

echo ""
echo ">>> Bước 4: Build Dashboard..."
eval "$SSH" "cd $VPS_DIR && BASE_PATH=/autoorder/ pnpm --filter @workspace/dashboard build"

echo ""
echo ">>> Bước 5: Copy dashboard lên /var/www/..."
eval "$SSH" "rm -rf $DASHBOARD_PUBLIC/* && cp -r $VPS_DIR/artifacts/dashboard/dist/public/. $DASHBOARD_PUBLIC/"

echo ""
echo ">>> Bước 6: Restart API service..."
eval "$SSH" "systemctl restart $SYSTEMD_SERVICE"
sleep 3

echo ""
echo ">>> Bước 7: Kiểm tra..."
eval "$SSH" "systemctl is-active $SYSTEMD_SERVICE && echo 'SERVICE: OK' || echo 'SERVICE: FAIL'"
eval "$SSH" "curl -sf http://127.0.0.1/autoorder/api/healthz && echo 'API: OK' || echo 'API: FAIL'"
eval "$SSH" "curl -sf http://127.0.0.1/autoorder/ | grep -q '<title>' && echo 'DASHBOARD: OK' || echo 'DASHBOARD: FAIL'"

echo ""
echo "=========================================="
echo " Deploy hoàn tất!"
echo " Dashboard: http://$VPS_IP/autoorder/"
echo " API:       http://$VPS_IP/autoorder/api/"
echo "=========================================="
