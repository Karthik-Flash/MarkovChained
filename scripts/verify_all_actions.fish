#!/usr/bin/env fish

set BASE_URL "http://127.0.0.1:8000"
if test (count $argv) -ge 1
    if test "$argv[1]" != "--seed"
        set BASE_URL $argv[1]
    end
end

set SCRIPT_DIR (dirname (status --current-filename))

if contains -- --seed $argv
    echo "Running seed script first..."
    fish "$SCRIPT_DIR/seed_all_actions.fish" "$BASE_URL"
end

function infer_row
    set -l corridor_name $argv[1]
    set -l expected $argv[2]

    set -l payload (string join '' \
        '{"corridor_name":"' $corridor_name '",' \
        '"transport_mode_enc":1,' \
        '"transport_weight_kg":5000}')

    set -l response (curl -sS -X POST "$BASE_URL/infer/route" \
        -H "Content-Type: application/json" \
        -d "$payload")

    set -l parsed (printf '%s' "$response" | python3.14 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    action = d.get("action", "")
    display = d.get("action_display", action)
    conf = d.get("confidence", 0)
    cp = d.get("congestion_probability", 0)
    print(f"{action}|{display}|{conf}|{cp}")
except Exception:
    print("ERROR|ERROR|0|0")
')

    set -l action (string split '|' "$parsed")[1]
    set -l display (string split '|' "$parsed")[2]
    set -l confidence (string split '|' "$parsed")[3]
    set -l congestion_prob (string split '|' "$parsed")[4]

    set -l row_state "OK"
    if test "$action" != "$expected"
        set row_state "DIFF"
    end

    printf "%-12s | %-15s | %-15s | %-15s | %6.2f%% | %6.2f%% | %s\n" \
        "$corridor_name" "$expected" "$action" "$display" \
        (math "$confidence * 100") (math "$congestion_prob * 100") "$row_state"

    if test "$row_state" = "OK"
        set -g ok_count (math "$ok_count + 1")
    else
        set -g diff_count (math "$diff_count + 1")
    end
end

echo "\nVerifying all 20 corridors at $BASE_URL"
echo "(Expected labels are the target action bands from seed_all_actions.fish)"
printf "%-12s | %-15s | %-15s | %-15s | %-7s | %-7s | %s\n" "Corridor" "Expected" "Action" "Display" "Conf" "Cong" "State"
printf "------------ | --------------- | --------------- | --------------- | ------- | ------- | -----\n"

set -g ok_count 0
set -g diff_count 0

# Maintain Course group (11)
infer_row "SIN→JEA" "Maintain Course"
infer_row "SIN→RTM" "Maintain Course"
infer_row "SIN→PUS" "Maintain Course"
infer_row "JEA→RTM" "Maintain Course"
infer_row "SHA→RTM" "Maintain Course"
infer_row "MUM→CMB" "Maintain Course"
infer_row "SIN→DKR" "Maintain Course"
infer_row "SIN→SYD" "Maintain Course"
infer_row "JEA→NYC" "Maintain Course"
infer_row "SHA→PUS" "Maintain Course"
infer_row "SHZ→RTM" "Maintain Course"

# Slow Steam group (4)
infer_row "HAM→NYC" "Slow Steam"
infer_row "MUM→FXT" "Slow Steam"
infer_row "SHA→LAX" "Slow Steam"
infer_row "TOK→SIN" "Slow Steam"

# Reroute group (5)
infer_row "SAN→SHA" "Reroute"
infer_row "SIN→CMB" "Reroute"
infer_row "SIN→MUN" "Reroute"
infer_row "SIN→NSA" "Reroute"
infer_row "MUM→JEA" "Reroute"

echo "\nSummary:"
echo "- Total corridors checked: 20"
echo "- Matches expected band: $ok_count"
echo "- Different from expected: $diff_count"

echo "\nTip: run with '--seed' to reseed before verification:"
echo "  scripts/verify_all_actions.fish --seed"
