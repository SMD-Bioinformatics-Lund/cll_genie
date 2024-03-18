#!/bin/bash

# Subpath at which cll_genie_app is hosted:
SCRIPT_NAME='/cll_genie' # For production use only


# Build CDM docker image and start on lennart
SCRIPT_PATH=$(realpath "$0")
APP_DIR=$(dirname "$(dirname "$SCRIPT_PATH")")
version=$( cat "$APP_DIR/version.py" | grep __version__ | awk -F"\"" '{print $2}' )
# version=$( python -c "from version import __version__; print(__version__)" )
# version=$(python -c "import cll_genie_app.__version__; print(__version__.__version__)")

# Get the latest tag for the main branch (assuming the main branch is checked out)
latest_tag=$(git describe --tags --abbrev=0 2>/dev/null)

# Check if the variable is empty (no tags found)
if [ -z "$latest_tag" ]; then
    echo "No tags found on the main branch."
else
    echo "Latest tag on the main branch: $latest_tag"
    export CLL_GENIE_VERSION="$latest_tag"
fi

docker build --no-cache --network host --target cll_genie_app -t cll_genie:$version -f Dockerfile .

set -o allexport; source .env; set +o allexport

docker run \
    -e DB_HOST=$DB_HOST \
    -e DB_PORT=$DB_PORT \
    -e FLASK_DEBUG=0 \
    -e SCRIPT_NAME=$SCRIPT_NAME \
    -e LOG_LEVEL="INFO" \
    -p 5813:5000 \
    --dns "10.212.226.10" \
    --name cll_genie_app \
    -v /data/lymphotrack/cll_results/:/cll_genie/results/ \
    -v /data/lymphotrack/cll_results_dev/:/cll_genie/results_dev/ \
    -v /data/lymphotrack/results/lymphotrack_dx/:/data/lymphotrack/results/lymphotrack_dx/ \
    -v /data/lymphotrack/logs:/cll_genie/logs \
    -d \
    "cll_genie:$version"


#docker run -e DB_HOST='172.17.0.1' -e CLARITY_USER=$CLARITY_USER -e CLARITY_PASSWORD=$CLARITY_PASSWORD -e CLARITY_HOST=$CLARITY_HOST -e DB_HOST=$DB_HOST -e DB_PORT=$DB_PORT -e FLASK_DEBUG=1 -e SCRIPT_NAME=$SCRIPT_NAME -e LOG_LEVEL="DEBUG" -p 5813:5000 --name cll_genie_app -v /data/lymphotrack/cll_results/:/cll_genie/results/  -v /data/lymphotrack/cll_results_dev/:/cll_genie/results_dev/ -v /data/lymphotrack/results/lymphotrack_dx/:/data/lymphotrack/results/lymphotrack_dx/ -v /data/lymphotrack/logs:/cll_genie/logs "cll_genie:1.0.0"