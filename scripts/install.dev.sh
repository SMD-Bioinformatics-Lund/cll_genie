#!/usr/bin/env bash
# CLL Genie development installation: build, replace, verify, and roll back on failure.
set -Eeuo pipefail

# ------------------------------------------
# Resolve project directory
# ------------------------------------------

# Resolve paths from this script so it can be launched from any directory.

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

# ------------------------------------------
# Utilities
# ------------------------------------------

log() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

die() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

# ------------------------------------------
# Configuration
# ------------------------------------------

# Select the environment file and Docker build target for this installer.

env_file="$APP_DIR/.env_dev"
dockerfile=Dockerfile.dev
target=cll_genie_app_dev

# ------------------------------------------
# Parse arguments
# ------------------------------------------

while (($#)); do
  case "$1" in
    -e|--env-file) (($# >= 2)) || die 'Missing environment file'; env_file="$2"; shift 2 ;;
    -h|--help) printf 'Usage: install.dev.sh [-e ENV_FILE]\nRelative environment paths are resolved from the caller directory.\n'; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

# ------------------------------------------
# Resolve environment file
# ------------------------------------------

# Relative overrides are resolved from the caller directory.

log "Project directory: $APP_DIR"
[[ -f "$env_file" ]] || die "Environment file not found: $env_file"
log "Using environment file: $env_file"
# Environment files are trusted shell configuration. Never print their values.

# ------------------------------------------
# Load environment configuration
# ------------------------------------------

# Export assigned variables for forwarding to the container.

# Require deployment values in this file rather than inheriting a prior shell's settings.
unset SECRET_KEY DB_HOST DB_PORT DB_NAME PORT_NBR CONTAINER_NAME SCRIPT_NAME \
  RESULTS_DIR LOGS_DIR LYMPHOTRACK_RESULTS_DIR APP_DNS
set -a
source "$env_file"
set +a

# ------------------------------------------
# Validate environment configuration
# ------------------------------------------

# Fail before building or stopping containers if required settings are missing.

log "Validating environment configuration..."
for key in SECRET_KEY DB_HOST DB_PORT DB_NAME PORT_NBR CONTAINER_NAME RESULTS_DIR LOGS_DIR LYMPHOTRACK_RESULTS_DIR; do
  [[ -n "${!key:-}" ]] || die "Missing required variable: $key"
done
# SCRIPT_NAME and APP_DNS must be declared; empty values select root hosting
# and Docker's default DNS, respectively.
for key in SCRIPT_NAME APP_DNS; do
  [[ -v "$key" ]] || die "Missing required variable: $key (may be empty)"
done
container_name="$CONTAINER_NAME"
[[ "$container_name" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || die 'Invalid CONTAINER_NAME'
port="$PORT_NBR"
for number in "$port" "$DB_PORT"; do
  [[ "$number" =~ ^[0-9]{1,5}$ ]] || die 'Ports must be numeric'
  ((10#$number >= 1 && 10#$number <= 65535)) || die 'Port outside 1..65535'
done

# ------------------------------------------
# Development isolation
# ------------------------------------------

# Require a separate database and results directory for development.

[[ -n "${DB_NAME:-}" && "$DB_NAME" != cll_genie ]] || die 'Development requires an explicit DB_NAME other than cll_genie'
results_dir="$RESULTS_DIR"
[[ "$(realpath -m "$results_dir")" != /data/lymphotrack/cll_results ]] || die 'Development must not use production results'
logs_dir="$LOGS_DIR"
export FLASK_DEBUG=1
export SCRIPT_NAME
[[ -z "$SCRIPT_NAME" || "$SCRIPT_NAME" == /* ]] || die 'SCRIPT_NAME must be empty or start with /'

# ------------------------------------------
# Validate data and log directories
# ------------------------------------------

# Results and logs are writable; existing analysis input is mounted read-only.

log "Checking data and log directories..."
input_dir="$LYMPHOTRACK_RESULTS_DIR"
for directory in "$results_dir" "$logs_dir" "$input_dir"; do
  [[ "$directory" == /* && -d "$directory" ]] || die "Required absolute directory not found: $directory"
done
[[ -w "$results_dir" && -w "$logs_dir" ]] || die 'Results and log directories must be writable'

# ------------------------------------------
# Validate local dependencies
# ------------------------------------------

log "Checking local tools and Docker daemon..."
command -v python3 >/dev/null || die 'python3 is required'
command -v flock >/dev/null || die 'flock is required'
command -v docker >/dev/null || die 'Docker is required'
docker info >/dev/null 2>&1 || die 'Docker daemon unavailable'

# ------------------------------------------
# Resolve application version
# ------------------------------------------

# Read the literal version assignment without importing or starting the application.

log "Resolving application version..."
version="$(python3 - "$APP_DIR/version.py" <<'PY'
import ast, sys
module = ast.parse(open(sys.argv[1]).read())
for node in module.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == '__version__' for t in node.targets):
        print(ast.literal_eval(node.value))
        break
else:
    raise SystemExit('No __version__ assignment')
PY
)"
[[ "$version" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$ ]] || die 'Invalid image version'
export CLL_GENIE_VERSION="${version}-dev"
image_name="cll_genie:$CLL_GENIE_VERSION"

GIT_COMMIT="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || printf unknown)"
BUILD_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
printf '\n%s\n' '----------------------------------------'
printf '%s\n' 'CLL Genie Development Deployment'
printf '%s\n' '----------------------------------------'
printf 'Project:    %s\n' "$APP_DIR"
printf 'Env file:   %s\n' "$env_file"
printf 'Version:    %s\n' "$CLL_GENIE_VERSION"
printf 'Image:      %s\n' "$image_name"
printf 'Container:  %s\n' "$container_name"
printf 'Port:       %s\n' "$port"
printf 'Path:       %s\n' "$SCRIPT_NAME"
printf 'Commit:     %s\n' "$GIT_COMMIT"
printf 'Build time: %s\n' "$BUILD_TIME"
printf '%s\n\n' '----------------------------------------'

# ------------------------------------------
# Prevent simultaneous deployments
# ------------------------------------------

# Lock by configured container name to prevent competing replacements.

exec 9>"/tmp/${container_name}-deployment.lock"
flock -n 9 || die 'Another deployment of this environment is running'
# Pass exported variable names, not secret values, in Docker command arguments.

# ------------------------------------------
# Prepare container environment
# ------------------------------------------

# Forward variable names so secrets are not included in command arguments.

env_args=()
while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)= ]]; then
    env_args+=(-e "${BASH_REMATCH[2]}")
  fi
done < "$env_file"

# ------------------------------------------
# Build Docker image
# ------------------------------------------

# Finish the build before changing the currently running container.

log "Building Docker image: $image_name"
docker build --network host --target "$target" -t "$image_name" -f "$APP_DIR/$dockerfile" "$APP_DIR" \
  || die "Docker image build failed; existing container unchanged."
log "Docker image built successfully."

# ------------------------------------------
# Rollback handler
# ------------------------------------------

# Keep the previous container and its running state until the replacement passes verification.

backup=""; replacement=false; was_running=false
exists() { docker container inspect "$1" >/dev/null 2>&1; }
rollback() {
  code=$?
  trap - ERR INT TERM
  set +e
  warn "Deployment failed (exit code $code)."
  warn "Rolling back development deployment..."
  if [[ "$replacement" == true ]]; then
    log "Removing failed replacement container..."
    docker rm -f "$container_name" >/dev/null 2>&1 || warn "Could not remove failed container."
  fi
  if [[ -n "$backup" ]] && exists "$backup"; then
    log "Restoring previous container: $backup"
    if docker rename "$backup" "$container_name"; then
      if [[ "$was_running" == true ]]; then
        if docker start "$container_name"; then
          log "Previous development container restored."
        else
          warn "Previous container failed to start."
        fi
      else
        log "Previous stopped container restored."
      fi
    else
      warn "Could not restore previous container name; backup retained: $backup"
    fi
  else
    warn "No previous container available for rollback."
  fi
  exit "$code"
}
trap rollback ERR
trap 'false' INT TERM

# ------------------------------------------
# Preserve existing container
# ------------------------------------------

# Rename rather than delete the old container so it can be restored on failure.

if exists "$container_name"; then
  log "Preserving existing development container..."
  [[ "$(docker inspect -f '{{.State.Running}}' "$container_name")" != true ]] || was_running=true
  backup="${container_name}_backup_$(date -u +%Y%m%d%H%M%S)_$$"
  docker rename "$container_name" "$backup"
  if [[ "$was_running" == true ]]; then
    log "Stopping previous container after preserving it as $backup"
    docker stop "$backup"
  fi
else
  log "No existing container; installing a new deployment."
fi

# ------------------------------------------
# Configure container mounts and runtime
# ------------------------------------------

# Development also mounts local source read-only and enables Gunicorn reloading.

mounts=(-v "$results_dir:/cll_genie/results" -v "$logs_dir:/cll_genie/logs" -v "$input_dir:$input_dir:ro")
for path in cll_genie config.py wsgi.py version.py CHANGELOG.md; do
  mounts+=(-v "$APP_DIR/$path:/cll_genie/$path:ro")
done
dns_args=()
[[ -z "$APP_DNS" ]] || dns_args=(--dns "$APP_DNS")
command_args=(gunicorn --reload --workers 1 --bind "0.0.0.0:$port" wsgi:cll_genie_app)

# ------------------------------------------
# Start new container
# ------------------------------------------

# The rollback trap removes a failed replacement and restores the previous container.

log "Starting development container: $container_name"
replacement=true
docker run -d --name "$container_name" --restart unless-stopped \
  "${env_args[@]}" -e SECRET_KEY -e CLL_GENIE_VERSION -e PORT_NBR -e FLASK_DEBUG -e SCRIPT_NAME \
  -e TZ=Europe/Stockholm -p "$port:$port" "${dns_args[@]}" "${mounts[@]}" \
  "$image_name" "${command_args[@]}"

# ------------------------------------------
# Verify application startup
# ------------------------------------------

# Check HTTP readiness inside the container, including the configured application subpath.

log "Verifying application startup..."
ready=false
for ((attempt=0; attempt<15; attempt++)); do
  if docker exec "$container_name" python3 -c \
    'import os,urllib.request; urllib.request.urlopen("http://127.0.0.1:"+os.environ["PORT_NBR"]+os.environ["SCRIPT_NAME"]+"/", timeout=2).close()' >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  warn "Application did not pass its HTTP startup check."
  false
fi

# ------------------------------------------
# Deployment successful
# ------------------------------------------

# Disable rollback and remove the old container only after startup verification.

trap - ERR INT TERM
log "Application startup verified."
if [[ -n "$backup" ]]; then
  log "Removing previous Development container: $backup"
  docker rm "$backup" >/dev/null || warn "Previous stopped container retained: $backup"
fi
printf '\n%s\n' '----------------------------------------'
printf '%s\n' 'CLL Genie Development Deployment Complete'
printf '%s\n' '----------------------------------------'
printf 'Project:    %s\n' "$APP_DIR"
printf 'Version:    %s\n' "$CLL_GENIE_VERSION"
printf 'Image:      %s\n' "$image_name"
printf 'Container:  %s\n' "$container_name"
printf 'Port:       %s\n' "$port"
printf 'URL:        http://localhost:%s%s/\n' "$port" "$SCRIPT_NAME"
printf '%s\n' '----------------------------------------'
