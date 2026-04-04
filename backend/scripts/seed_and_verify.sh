#!/usr/bin/env bash

set -u

BASE_URL="http://127.0.0.1:8000"
VERBOSE=0

for arg in "$@"; do
  if [ "$arg" = "--verbose" ]; then
    VERBOSE=1
  else
    BASE_URL="$arg"
  fi
done

ok_count=0
diff_count=0
error_count=0

check_backend() {
  if ! curl -fsS -m 3 "$BASE_URL/health" >/dev/null; then
    echo "Unable to reach backend at $BASE_URL"
    return 1
  fi
  return 0
}

post_json() {
  local path="$1"
  local payload="$2"

  local raw
  raw=$(curl -sS -X POST "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    -w "__HTTP_STATUS__%{http_code}")

  if [[ "$raw" != *"__HTTP_STATUS__"* ]]; then
    echo "000|$raw"
    return 0
  fi

  local body="${raw%__HTTP_STATUS__*}"
  local http_code="${raw##*__HTTP_STATUS__}"
  echo "$http_code|$body"
}

parse_infer() {
  local response_body="$1"
  printf '%s' "$response_body" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    action = d.get("action", "")
    conf = d.get("confidence", 0)
    prob = d.get("congestion_probability", 0)
    print(f"{action}|{conf}|{prob}")
except Exception:
    print("ERROR|0|0")
'
}

apply_update() {
  local path="$1"
  local payload="$2"

  local result code body
  result=$(post_json "$path" "$payload")
  code="${result%%|*}"
  body="${result#*|}"

  if [ "$code" != "200" ]; then
    echo "ERR  $path (HTTP $code)"
    if [ "$VERBOSE" -eq 1 ]; then
      echo "$body"
    fi
    return 1
  fi

  if [ "$VERBOSE" -eq 1 ]; then
    echo "OK   $path"
  fi

  return 0
}

seed_and_check() {
  local corridor_name="$1"
  local weather_raw="$2"
  local geopolitical_risk="$3"
  local lead_time="$4"
  local disruption_type="$5"
  local inflation_rate="$6"
  local transport_weight_kg="$7"
  local expected_action="$8"

  if [ "$VERBOSE" -eq 1 ]; then
    echo
    echo "Seeding $corridor_name"
  fi

  apply_update /update/weather "{\"corridor_name\":\"$corridor_name\",\"weather_severity_raw\":$weather_raw,\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"expected_action\":\"$expected_action\"}}" || { error_count=$((error_count + 1)); return; }
  apply_update /update/geopolitical-risk "{\"corridor_name\":\"$corridor_name\",\"geopolitical_risk\":$geopolitical_risk,\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"expected_action\":\"$expected_action\"}}" || { error_count=$((error_count + 1)); return; }
  apply_update /update/lead-time "{\"corridor_name\":\"$corridor_name\",\"base_lead_time\":$lead_time,\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"expected_action\":\"$expected_action\"}}" || { error_count=$((error_count + 1)); return; }
  apply_update /update/disruption "{\"corridor_name\":\"$corridor_name\",\"disruption_type\":\"$disruption_type\",\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"expected_action\":\"$expected_action\"}}" || { error_count=$((error_count + 1)); return; }
  apply_update /update/inflation "{\"inflation_rate\":$inflation_rate,\"currency\":\"USD\",\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"corridor_name\":\"$corridor_name\"}}" || { error_count=$((error_count + 1)); return; }

  local infer_payload
  infer_payload="{\"corridor_name\":\"$corridor_name\",\"transport_mode_enc\":1,\"transport_weight_kg\":$transport_weight_kg}"

  local infer_result infer_code infer_body parsed got_action confidence cong_prob row_state
  infer_result=$(post_json /infer/route "$infer_payload")
  infer_code="${infer_result%%|*}"
  infer_body="${infer_result#*|}"

  if [ "$infer_code" != "200" ]; then
    printf "%-10s | %-15s | %-15s | %-7s | %-7s | %s\n" \
      "ERR" "$corridor_name" "n/a" "n/a" "n/a" "infer failed HTTP $infer_code"
    if [ "$VERBOSE" -eq 1 ]; then
      echo "$infer_body"
    fi
    error_count=$((error_count + 1))
    return
  fi

  parsed=$(parse_infer "$infer_body")
  got_action="${parsed%%|*}"
  local rest="${parsed#*|}"
  confidence="${rest%%|*}"
  cong_prob="${rest##*|}"

  row_state="OK"
  if [ "$got_action" != "$expected_action" ]; then
    row_state="DIFF"
  fi

  printf "%-10s | %-15s | %-15s | %6.2f%% | %6.2f%% | %s\n" \
    "$row_state" "$corridor_name" "$got_action" \
    "$(awk "BEGIN {print $confidence * 100}")" \
    "$(awk "BEGIN {print $cong_prob * 100}")" \
    "expected=$expected_action risk=$geopolitical_risk disruption=$disruption_type"

  if [ "$row_state" = "OK" ]; then
    ok_count=$((ok_count + 1))
  else
    diff_count=$((diff_count + 1))
  fi
}

echo "Seeding Mode-2 six-route notebook scenarios at $BASE_URL"
if [ "$VERBOSE" -eq 1 ]; then
  echo "Verbose mode: ON"
fi

if ! check_backend; then
  echo "Start the API first, then rerun this script."
  exit 1
fi

echo "Values mirror MODE2_DEMO_ROUTES in ML/DPWorldConcise.ipynb"
printf "%-10s | %-15s | %-15s | %-7s | %-7s | %s\n" "State" "Corridor" "Action" "Conf" "Cong" "Notes"
printf "%s\n" "---------- | --------------- | --------------- | ------- | ------- | ----------------------------------------------"

# TOK_SIN
seed_and_check "TOK→SIN" 0.11 0.22 9 none 2.8 4200 "Maintain Course"

# SHA_PUS
seed_and_check "SHA→PUS" 0.35 0.28 4 none 2.5 3800 "Maintain Course"

# SIN_JEA
seed_and_check "SIN→JEA" 0.44 0.52 12 port_congestion 3.8 6800 "Slow Steam"

# MUM_JEA
seed_and_check "MUM→JEA" 0.42 0.48 6 port_congestion 4.1 5500 "Slow Steam"

# SHZ_RTM
seed_and_check "SHZ→RTM" 0.68 0.78 28 geopolitical 3.5 7200 "Reroute"

# SIN_SYD
seed_and_check "SIN→SYD" 0.74 0.58 16 severe_weather 3.9 5200 "Reroute"

echo
echo "Summary:"
echo "- OK:   $ok_count"
echo "- DIFF: $diff_count"
echo "- ERR:  $error_count"

if [ "$diff_count" -eq 0 ] && [ "$error_count" -eq 0 ]; then
  echo "All six routes match notebook expected actions."
else
  echo "Some routes did not match or failed; rerun with --verbose for detailed payload-level logs."
fi
