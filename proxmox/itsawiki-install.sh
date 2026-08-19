#!/usr/bin/env bash
# ----------------------------------------------------------------------------------
# It's a Wiki! — In-Container Installation Script for Proxmox LXC (Debian/Ubuntu)
# ----------------------------------------------------------------------------------

set -euo pipefail

YW=$(echo "\033[33m")
BL=$(echo "\033[36m")
GN=$(echo "\033[1;92m")
RD=$(echo "\033[01;31m")
CL=$(echo "\033[m")

info() { echo -e "${BL}[INFO]${CL} $1"; }
ok() { echo -e "${GN}[OK]${CL} $1"; }
warn() { echo -e "${YW}[WARN]${CL} $1"; }
err() { echo -e "${RD}[ERR]${CL} $1"; exit 1; }

export DEBIAN_FRONTEND=noninteractive

info "Configuring passwordless root auto-login for Proxmox console..."
# Configure systemd agetty overrides for automatic root login in Proxmox console
mkdir -p /etc/systemd/system/container-getty@1.service.d
cat <<'EOF' > /etc/systemd/system/container-getty@1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 $TERM
EOF

mkdir -p /etc/systemd/system/container-getty@0.service.d
cat <<'EOF' > /etc/systemd/system/container-getty@0.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 $TERM
EOF

mkdir -p /etc/systemd/system/getty@tty1.service.d
cat <<'EOF' > /etc/systemd/system/getty@tty1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear %I 38400 linux
EOF

mkdir -p /etc/systemd/system/console-getty.service.d
cat <<'EOF' > /etc/systemd/system/console-getty.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud console 115200,38400,9600 $TERM
EOF

# Clear root password so auto-login and shell access works out of the box
passwd -d root >/dev/null 2>&1 || true

info "Updating package lists..."
apt-get update -y
apt-get install -y --no-install-recommends \
  curl \
  sudo \
  git \
  ca-certificates \
  gnupg

info "Installing Node.js 20 LTS..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1)" != "v20" ]; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi
ok "Node.js $(node -v) and npm $(npm -v) installed."

info "Creating itsawiki user..."
if ! id -u itsawiki >/dev/null 2>&1; then
  useradd -r -s /usr/sbin/nologin -d /opt/its_a_wiki -m itsawiki
fi

info "Setting up It's a Wiki! in /opt/its_a_wiki..."
INSTALL_DIR="/opt/its_a_wiki"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing repository..."
  cd "$INSTALL_DIR"
  git fetch --all
  git reset --hard origin/master || git reset --hard origin/main
else
  info "Cloning repository..."
  rm -rf "$INSTALL_DIR"
  git clone https://github.com/RedForged/its_a_wiki.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

info "Installing npm production dependencies..."
npm ci --omit=dev || npm install --omit=dev

mkdir -p "$INSTALL_DIR/data"
chown -R itsawiki:itsawiki "$INSTALL_DIR"
chmod -R 750 "$INSTALL_DIR"

info "Creating systemd service..."
cat <<'EOF' > /etc/systemd/system/itsawiki.service
[Unit]
Description=It's a Wiki! — Open Source Fandom-style Wiki Farm
After=network.target

[Service]
Type=simple
User=itsawiki
Group=itsawiki
WorkingDirectory=/opt/its_a_wiki
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATA_DIR=/opt/its_a_wiki/data
ExecStart=/usr/bin/node /opt/its_a_wiki/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=itsawiki

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now itsawiki.service
systemctl restart container-getty@1.service >/dev/null 2>&1 || true
systemctl restart getty@tty1.service >/dev/null 2>&1 || true

info "Creating update utility..."
cat <<'EOF' > /usr/local/bin/update-itsawiki
#!/usr/bin/env bash
set -euo pipefail
echo "Updating It's a Wiki!..."
git config --global --add safe.directory /opt/its_a_wiki
cd /opt/its_a_wiki
systemctl stop itsawiki
git fetch --all
git reset --hard origin/master || git reset --hard origin/main
npm install --omit=dev
chown -R itsawiki:itsawiki /opt/its_a_wiki
systemctl start itsawiki
echo "It's a Wiki! updated and restarted successfully."
EOF
chmod +x /usr/local/bin/update-itsawiki

# Set up MOTD
cat <<'EOF' > /etc/motd
  ___ _       _                     __        ___ _    _ _ 
 |_ _| |_( )___    __ _            \ \      / (_) | _(_) |
  | || __|/ ___|  / _` |            \ \ /\ / /| | |/ / | |
  | || |_ \__ \  | (_| |             \ V  V / | |   <| |_|
 |___|\__|___/    \__,_|              \_/\_/  |_|_|\_(_) 

 It's a Wiki! — Open Source Fandom-style Wiki Farm
 Service: itsawiki (Port 3000)

 Commands:
   Update:  update-itsawiki
   Logs:    journalctl -u itsawiki -f
   Restart: systemctl restart itsawiki

EOF

ok "Installation completed successfully!"
