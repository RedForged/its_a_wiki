#!/usr/bin/env bash
# ----------------------------------------------------------------------------------
# It's a Wiki! — Proxmox VE Helper Script (LXC Container Creator)
# Run directly in the Proxmox VE Shell:
# bash -c "$(wget -qLO - https://raw.githubusercontent.com/RedForged/its_a_wiki/master/proxmox/itsawiki.sh)"
# ----------------------------------------------------------------------------------

set -euo pipefail

YW=$(echo "\033[33m")
BL=$(echo "\033[36m")
GN=$(echo "\033[1;92m")
RD=$(echo "\033[01;31m")
BGN=$(echo "\033[4;92m")
CL=$(echo "\033[m")

info() { echo -e "${BL}[INFO]${CL} $1"; }
ok() { echo -e "${GN}[OK]${CL} $1"; }
warn() { echo -e "${YW}[WARN]${CL} $1"; }
err() { echo -e "${RD}[ERR]${CL} $1"; exit 1; }

header() {
  clear
  cat <<'EOF'
  ___ _       _                     __        ___ _    _ _ 
 |_ _| |_( )___    __ _            \ \      / (_) | _(_) |
  | || __|/ ___|  / _` |            \ \ /\ / /| | |/ / | |
  | || |_ \__ \  | (_| |             \ V  V / | |   <| |_|
 |___|\__|___/    \__,_|              \_/\_/  |_|_|\_(_) 
 
 It's a Wiki! — Proxmox LXC Container Creator
EOF
  echo ""
}

header

# Ensure running on Proxmox VE host
if ! command -v pveversion >/dev/null 2>&1; then
  err "This script must be executed directly on a Proxmox VE host."
fi

# Detect default next free CT ID
NEXT_CTID=$(pvesh get /cluster/nextid)
read -r -p "Enter Container ID [${NEXT_CTID}]: " CTID
CTID=${CTID:-$NEXT_CTID}

# Hostname
DEFAULT_HN="its-a-wiki"
read -r -p "Enter Hostname [${DEFAULT_HN}]: " HN
HN=${HN:-$DEFAULT_HN}

# CPU Cores
DEFAULT_CORES=2
read -r -p "Enter CPU Cores [${DEFAULT_CORES}]: " CORES
CORES=${CORES:-$DEFAULT_CORES}

# RAM in MB
DEFAULT_RAM=512
read -r -p "Enter Memory in MB [${DEFAULT_RAM}]: " RAM
RAM=${RAM:-$DEFAULT_RAM}

# Disk Size in GB
DEFAULT_DISK=4
read -r -p "Enter Disk Size in GB [${DEFAULT_DISK}]: " DISK
DISK=${DISK:-$DEFAULT_DISK}

# Storage pool
DEFAULT_STORAGE=$(pvesm status -content rootdir | awk 'NR>1 {print $1; exit}')
DEFAULT_STORAGE=${DEFAULT_STORAGE:-local-lvm}
read -r -p "Enter Storage Pool [${DEFAULT_STORAGE}]: " STORAGE
STORAGE=${STORAGE:-$DEFAULT_STORAGE}

# Network Bridge
DEFAULT_BRIDGE="vmbr0"
read -r -p "Enter Network Bridge [${DEFAULT_BRIDGE}]: " BRIDGE
BRIDGE=${BRIDGE:-$DEFAULT_BRIDGE}

# Network IP
DEFAULT_NET="dhcp"
read -r -p "Enter IP Assignment (dhcp or 192.168.1.50/24) [${DEFAULT_NET}]: " NET
NET=${NET:-$DEFAULT_NET}

GW_ARG=""
if [ "$NET" != "dhcp" ]; then
  read -r -p "Enter Gateway IP (e.g. 192.168.1.1): " GW
  if [ -n "$GW" ]; then
    GW_ARG=",gw=${GW}"
  fi
  NET_ARG="ip=${NET}${GW_ARG}"
else
  NET_ARG="ip=dhcp"
fi

info "Fetching Debian 12 LXC template list..."
pveam update >/dev/null 2>&1 || true
TEMPLATE=$(pveam available -section system | awk '$2 ~ /debian-12-standard/ {print $2; exit}')
if [ -z "$TEMPLATE" ]; then
  TEMPLATE=$(pveam available -section system | awk '$2 ~ /debian/ {print $2; exit}')
fi

if [ -z "$TEMPLATE" ]; then
  err "Could not find a Debian template in Proxmox appliance repository."
fi

TEMPLATE_STORAGE=$(pvesm status -content vztmpl | awk 'NR>1 {print $1; exit}')
TEMPLATE_STORAGE=${TEMPLATE_STORAGE:-local}

if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
  info "Downloading template ${TEMPLATE} to ${TEMPLATE_STORAGE}..."
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

TEMPLATE_PATH="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"

info "Creating LXC Container ${CTID} (${HN})..."
pct create "$CTID" "$TEMPLATE_PATH" \
  -hostname "$HN" \
  -cores "$CORES" \
  -memory "$RAM" \
  -swap 512 \
  -rootfs "${STORAGE}:${DISK}" \
  -net0 "name=eth0,bridge=${BRIDGE},${NET_ARG},firewall=1" \
  -onboot 1 \
  -unprivileged 1 \
  -features nesting=1 \
  -ostype debian

info "Starting Container ${CTID}..."
pct start "$CTID"

info "Waiting for network connectivity..."
for i in {1..20}; do
  if pct exec "$CTID" -- ping -c 1 1.1.1.1 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

info "Running It's a Wiki! in-container installation..."
pct exec "$CTID" -- bash -c "$(wget -qLO - https://raw.githubusercontent.com/RedForged/its_a_wiki/master/proxmox/itsawiki-install.sh)"

# Determine IP address of container
CT_IP=$(pct exec "$CTID" -- ip -4 addr show eth0 | awk '/inet / {print $2}' | cut -d/ -f1 || echo "")

echo ""
ok "Container ${CTID} created and It's a Wiki! is active!"
echo ""
echo -e "${GN}Access your wiki farm at:${CL}"
if [ -n "$CT_IP" ]; then
  echo -e "  ${BGN}http://${CT_IP}:3000${CL}"
else
  echo -e "  ${BGN}http://<CONTAINER_IP>:3000${CL}"
fi
echo ""
echo -e "${BL}Useful Commands:${CL}"
echo -e "  Update:  ${YW}pct exec ${CTID} -- /usr/local/bin/update-itsawiki${CL}"
echo -e "  Console: ${YW}pct enter ${CTID}${CL}"
echo -e "  Logs:    ${YW}pct exec ${CTID} -- journalctl -u itsawiki -f${CL}"
echo ""
