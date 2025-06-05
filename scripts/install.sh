#!/bin/bash

# ---------------------------------------
# Setup Script for CLL Genie App (Lennart)
# ---------------------------------------

set -euo pipefail

# -------- Logging Helpers --------
log_info() {
  echo -e "\e[32m[INFO - $(date '+%Y-%m-%d %H:%M:%S')]\e[0m $1"
}
log_error() {
  echo -e "\e[31m[ERROR - $(date '+%Y-%m-%d %H:%M:%S')]\e[0m $1" >&2
}
log_step() {
  echo -e "\n\e[34m=== $1 ===\e[0m"
}

log_info "Hello. Setting up CLL Genie app on Lennart..."

# -------- Configuration --------
SCRIPT_NAME='/cll_genie'  # For production use only
PORT_NUM=5813
container_name="cll_genie_app"

# -------- Determine Paths --------
SCRIPT_PATH=$(realpath "$0")
APP_DIR=$(dirname "$(dirname "$SCRIPT_PATH")")
VERSION_FILE="$APP_DIR/version.py"

# -------- Check for .env --------
log_step "Checking for .env file"
if [[ ! -f "$APP_DIR/.env" ]]; then
  log_error ".env file not found in $APP_DIR. Exiting setup!"
  exit 1
fi

log_info ".env found. Loading environment variables."
set -o allexport; source "$APP_DIR/.env"; set +o allexport

# -------- Determine Version --------
log_step "Determining application version"

# Priority 1: Use the latest Git tag if available and not already used
latest_tag=$(git -C "$APP_DIR" describe --tags --abbrev=0 2>/dev/null || true)

if [[ -n "$latest_tag" ]]; then
  image_name="cll_genie:$latest_tag"
  log_info "Using latest Git tag: $latest_tag"

  # Check if this image already exists
  if docker image inspect "$image_name" &>/dev/null; then
    log_info "Docker image with tag $latest_tag already exists."
  else
    export CLL_GENIE_VERSION="$latest_tag"
    log_info "Version set from Git tag: $CLL_GENIE_VERSION"
  fi
else
  # Fallback to version.py
  if [[ -f "$VERSION_FILE" ]]; then
    fallback_version=$(grep __version__ "$VERSION_FILE" | awk -F'"' '{print $2}')
    export CLL_GENIE_VERSION="$fallback_version"
    log_info "No Git tags found. Version set from version.py: $CLL_GENIE_VERSION"
  else
    log_error "No Git tags and no version.py found! Exiting."
    exit 1
  fi
fi

image_name="cll_genie:$CLL_GENIE_VERSION"

# -------- Docker Build --------
log_step "Building Docker image: $image_name"
docker build --no-cache --network host --target cll_genie_app -t "$image_name" -f "$APP_DIR/Dockerfile" "$APP_DIR"
log_info "Docker image built successfully."

# -------- Stop and Remove Existing Container --------
log_step "Removing existing container (if any)"
docker stop "$container_name" 2>/dev/null || true
docker rm "$container_name" 2>/dev/null || true

# -------- Docker Run --------
log_step "Starting container: $container_name"
docker run \
  -e DB_HOST="$DB_HOST" \
  -e DB_PORT="$DB_PORT" \
  -e FLASK_DEBUG=0 \
  -e FLASK_SECRET_KEY="${SECRET_KEY}" \
  -e TZ='Europe/Stockholm' \
  -e SCRIPT_NAME="${SCRIPT_NAME}" \
  -e LOG_LEVEL="INFO" \
  -p "${PORT_NUM}:8000" \
  -v /data/lymphotrack/cll_results/:/cll_genie/results/ \
  -v /data/lymphotrack/results/lymphotrack_dx/:/data/lymphotrack/results/lymphotrack_dx/ \
  -v /data/lymphotrack/logs:/cll_genie/logs \
  --dns "10.212.226.10" \
  --name "$container_name" \
  --restart=always \
  -d \
  "$image_name"

log_info "CLL Genie app successfully deployed on port ${PORT_NUM}!"
