#!/usr/bin/env fish

set BASE_URL "http://127.0.0.1:8000"
set VERBOSE 0

for arg in $argv
    if test "$arg" = "--verbose"
        set VERBOSE 1
    else
        set BASE_URL $arg
    end
end

set -g ok_count 0
set -g diff_count 0
set -g error_count 0

function check_backend
    curl -fsS -m 3 "$BASE_URL/health" > /dev/null
    if test $status -ne 0
        echo "Unable to reach backend at $BASE_URL"
        return 1
    end

    return 0
end

function post_json
    set -l path $argv[1]
    set -l payload $argv[2]

    set -l raw (curl -sS -X POST "$BASE_URL$path" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        -w "__HTTP_STATUS__%{http_code}")

    set -l parts (string split "__HTTP_STATUS__" "$raw")
    if test (count $parts) -lt 2
        echo "000|$raw"
        return
    end

    set -l body $parts[1]
    set -l http_code $parts[2]
    echo "$http_code|$body"
end

function parse_infer
    set -l response_body $argv[1]
    printf '%s' "$response_body" | python3.14 -c '
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
end

function apply_update
    set -l path $argv[1]
    set -l payload $argv[2]

    set -l result (post_json $path "$payload")
    set -l code (string split '|' "$result")[1]
    set -l body (string split -m1 '|' "$result")[2]

    if test "$code" != "200"
        echo "ERR  $path (HTTP $code)"
        if test $VERBOSE -eq 1
            echo "$body"
        end
        return 1
    end

    if test $VERBOSE -eq 1
        echo "OK   $path"
    end

    return 0
end

function seed_and_check
    set -l corridor_name $argv[1]
    set -l weather_raw $argv[2]
    set -l geopolitical_risk $argv[3]
    set -l lead_time $argv[4]
    set -l disruption_type $argv[5]
    set -l inflation_rate $argv[6]
    set -l transport_weight_kg $argv[7]
    set -l expected_action $argv[8]

    if test $VERBOSE -eq 1
        echo ""
        echo "Seeding $corridor_name"
    end

    apply_update /update/weather "{\"corridor_name\":\"$corridor_name\",\"weather_severity_raw\":$weather_raw,\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"expected_action\":\"$expected_action\"}}"; or begin
        set -g error_count (math "$error_count + 1")
        return
    end
    apply_update /update/geopolitical-risk "{\"corridor_name\":\"$corridor_name\",\"geopolitical_risk\":$geopolitical_risk,\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"expected_action\":\"$expected_action\"}}"; or begin
        set -g error_count (math "$error_count + 1")
        return
    end
    apply_update /update/lead-time "{\"corridor_name\":\"$corridor_name\",\"base_lead_time\":$lead_time,\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"expected_action\":\"$expected_action\"}}"; or begin
        set -g error_count (math "$error_count + 1")
        return
    end
    apply_update /update/disruption "{\"corridor_name\":\"$corridor_name\",\"disruption_type\":\"$disruption_type\",\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"expected_action\":\"$expected_action\"}}"; or begin
        set -g error_count (math "$error_count + 1")
        return
    end
    apply_update /update/inflation "{\"inflation_rate\":$inflation_rate,\"currency\":\"USD\",\"source\":\"mode2-seed\",\"meta\":{\"script\":\"seed_mode2_routes\",\"corridor_name\":\"$corridor_name\"}}"; or begin
        set -g error_count (math "$error_count + 1")
        return
    end

    set -l infer_payload (string join '' \
        '{"corridor_name":"' $corridor_name '",' \
        '"transport_mode_enc":1,' \
        '"transport_weight_kg":' $transport_weight_kg \
        '}')

    set -l infer_result (post_json /infer/route "$infer_payload")
    set -l infer_code (string split '|' "$infer_result")[1]
    set -l infer_body (string split -m1 '|' "$infer_result")[2]

    if test "$infer_code" != "200"
        printf "%-10s | %-15s | %-15s | %-7s | %-7s | %s\n" \
            "ERR" "$corridor_name" "n/a" "n/a" "n/a" "infer failed HTTP $infer_code"
        if test $VERBOSE -eq 1
            echo "$infer_body"
        end
        set -g error_count (math "$error_count + 1")
        return
    end

    set -l parsed (parse_infer "$infer_body")

    set -l got_action (string split '|' "$parsed")[1]
    set -l confidence (string split '|' "$parsed")[2]
    set -l cong_prob (string split '|' "$parsed")[3]

    set -l row_state "OK"
    if test "$got_action" != "$expected_action"
        set row_state "DIFF"
    end

    printf "%-10s | %-15s | %-15s | %6.2f%% | %6.2f%% | %s\n" \
        "$row_state" "$corridor_name" "$got_action" (math "$confidence * 100") (math "$cong_prob * 100") \
        "expected=$expected_action risk=$geopolitical_risk disruption=$disruption_type"

    if test "$row_state" = "OK"
        set -g ok_count (math "$ok_count + 1")
    else
        set -g diff_count (math "$diff_count + 1")
    end
end

echo "Seeding Mode-2 six-route notebook scenarios at $BASE_URL"
if test $VERBOSE -eq 1
    echo "Verbose mode: ON"
end

check_backend; or begin
    echo "Start the API first, then rerun this script."
    exit 1
end

echo "Values mirror MODE2_DEMO_ROUTES in ML/DPWorldConcise.ipynb"
printf "%-10s | %-15s | %-15s | %-7s | %-7s | %s\n" "State" "Corridor" "Action" "Conf" "Cong" "Notes"
printf "---------- | --------------- | --------------- | ------- | ------- | ----------------------------------------------\n"

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

echo ""
echo "Summary:"
echo "- OK:   $ok_count"
echo "- DIFF: $diff_count"
echo "- ERR:  $error_count"

if test $diff_count -eq 0; and test $error_count -eq 0
    echo "All six routes match notebook expected actions."
else
    echo "Some routes did not match or failed; rerun with --verbose for detailed payload-level logs."
end