#!/usr/bin/env fish

set BASE_URL "http://127.0.0.1:8000"
if test (count $argv) -ge 1
    set BASE_URL $argv[1]
end

function post_json
    set -l path $argv[1]
    set -l payload $argv[2]

    echo "\n==> POST $path"
    curl -sS -X POST "$BASE_URL$path" \
        -H "Content-Type: application/json" \
        -d "$payload"
    echo
end

echo "Seeding reroute-focused corridor conditions at $BASE_URL"

# High weather severity on higher-risk corridors to increase congestion odds.
# These are the main candidates to surface Reroute in the UI.
post_json /update/weather '{"corridor_id":1,"weather_severity_raw":0.99,"source":"reroute-seed","meta":{"scenario":"extreme weather band"}}'
post_json /update/weather '{"corridor_id":2,"weather_severity_raw":0.97,"source":"reroute-seed","meta":{"scenario":"severe monsoon lane"}}'
post_json /update/weather '{"corridor_id":3,"weather_severity_raw":0.96,"source":"reroute-seed","meta":{"scenario":"storm cluster"}}'
post_json /update/weather '{"corridor_id":7,"weather_severity_raw":0.98,"source":"reroute-seed","meta":{"scenario":"red sea disruption"}}'

# Keep remaining corridors mixed so dashboard does not fully homogenize.
post_json /update/weather '{"corridor_id":0,"weather_severity_raw":0.42,"source":"reroute-seed","meta":{"scenario":"moderate"}}'
post_json /update/weather '{"corridor_id":4,"weather_severity_raw":0.31,"source":"reroute-seed","meta":{"scenario":"calm"}}'
post_json /update/weather '{"corridor_id":5,"weather_severity_raw":0.36,"source":"reroute-seed","meta":{"scenario":"light rain"}}'
post_json /update/weather '{"corridor_id":6,"weather_severity_raw":0.64,"source":"reroute-seed","meta":{"scenario":"gusty"}}'

# Optional wind updates for consistency with weather widget visuals.
post_json /update/wind '{"corridor_id":1,"wind_kmh":58.0,"wind_direction":"NE","source":"reroute-seed"}'
post_json /update/wind '{"corridor_id":2,"wind_kmh":54.5,"wind_direction":"SW","source":"reroute-seed"}'
post_json /update/wind '{"corridor_id":3,"wind_kmh":52.1,"wind_direction":"WNW","source":"reroute-seed"}'
post_json /update/wind '{"corridor_id":7,"wind_kmh":56.8,"wind_direction":"NNW","source":"reroute-seed"}'

echo "\nSeed complete."
echo "Next: click Refresh in the frontend to reload metadata and inference results."
