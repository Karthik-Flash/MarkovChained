#!/usr/bin/env fish

set BASE_URL "http://127.0.0.1:8000"
if test (count $argv) -ge 1
    set BASE_URL $argv[1]
end

function post_json
    set -l path $argv[1]
    set -l payload $argv[2]

    echo "\n==> POST $path"
    set -l response (curl -sS -X POST "$BASE_URL$path" \
        -H "Content-Type: application/json" \
        -d "$payload")

    echo $response
end

function seed_corridor
    set -l corridor_name $argv[1]
    set -l target_action $argv[2]
    set -l weather_raw $argv[3]
    set -l wind_kmh $argv[4]
    set -l wind_direction $argv[5]
    set -l base_lead_time $argv[6]
    set -l origin_locode $argv[7]
    set -l dest_locode $argv[8]
    set -l dest_country $argv[9]
    set -l distance_nm $argv[10]
    set -l commodity $argv[11]

    post_json /update/weather "{\"corridor_name\":\"$corridor_name\",\"weather_severity_raw\":$weather_raw,\"source\":\"all-actions-seed\",\"meta\":{\"target_action\":\"$target_action\"}}"
    post_json /update/wind "{\"corridor_name\":\"$corridor_name\",\"wind_kmh\":$wind_kmh,\"wind_direction\":\"$wind_direction\",\"source\":\"all-actions-seed\",\"meta\":{\"target_action\":\"$target_action\"}}"
    post_json /update/lead-time "{\"corridor_name\":\"$corridor_name\",\"base_lead_time\":$base_lead_time,\"source\":\"all-actions-seed\",\"meta\":{\"target_action\":\"$target_action\"}}"
    post_json /update/corridor-profile "{\"origin_locode\":\"$origin_locode\",\"dest_locode\":\"$dest_locode\",\"dest_country\":\"$dest_country\",\"distance_nm\":$distance_nm,\"commodity\":\"$commodity\"}"
end

echo "Seeding all 20 corridors with model-validated grouped action targets at $BASE_URL"
echo "- Maintain Course: calibrated low-congestion values"
echo "- Slow Steam: calibrated low-weather states where policy prefers Slow Steam"
echo "- Reroute: calibrated threshold states that flip to high-congestion reroute"

post_json /update/inflation '{"inflation_rate":3.6,"currency":"USD","source":"all-actions-seed","meta":{"scenario":"model-validated-bands"}}'

# Maintain Course (11)
seed_corridor "SIN→JEA" "Maintain Course" 0.00 17.2 NE 6 SGSIN AEJEA AE 3650 Chemicals
seed_corridor "SIN→RTM" "Maintain Course" 0.00 18.4 WNW 6 SGSIN NLRTM NL 8300 Electronics
seed_corridor "SIN→PUS" "Maintain Course" 0.00 16.8 ESE 6 SGSIN KRPUS KR 4700 Electronics
seed_corridor "JEA→RTM" "Maintain Course" 0.00 19.1 NNW 6 AEJEA NLRTM NL 11200 Chemicals
seed_corridor "SHA→RTM" "Maintain Course" 0.00 18.9 W 6 CNSHA NLRTM NL 9800 Chemicals
seed_corridor "MUM→CMB" "Maintain Course" 0.10 15.6 SW 6 INMUM LKCMB LK 980 Food
seed_corridor "SIN→DKR" "Maintain Course" 0.00 14.6 WNW 6 SGSIN SNDKR SN 8900 AutoParts
seed_corridor "SIN→SYD" "Maintain Course" 0.00 15.9 SE 6 SGSIN AUSYD AU 5500 Food
seed_corridor "JEA→NYC" "Maintain Course" 0.00 17.8 NW 6 AEJEA USNYC US 9800 AutoParts
seed_corridor "SHA→PUS" "Maintain Course" 0.00 16.1 E 6 CNSHA KRPUS KR 1200 Electronics
seed_corridor "SHZ→RTM" "Maintain Course" 0.00 18.0 NNW 6 CNSHZ NLRTM NL 9200 Electronics

# Slow Steam (4)
seed_corridor "HAM→NYC" "Slow Steam" 0.00 20.8 ENE 6 DEHAM USNYC US 3750 Electronics
seed_corridor "MUM→FXT" "Slow Steam" 0.00 24.3 NNW 6 INMUM GBFXT GB 6200 Chemicals
seed_corridor "SHA→LAX" "Slow Steam" 0.00 22.6 ENE 6 CNSHA USLAX US 6400 AutoParts
seed_corridor "TOK→SIN" "Slow Steam" 0.00 21.4 ESE 6 JPTOK SGSIN SG 3300 Apparel

# Reroute (5)
seed_corridor "SAN→SHA" "Reroute" 0.33 41.2 WSW 6 BRSAN CNSHA CN 11500 Chemicals
seed_corridor "SIN→CMB" "Reroute" 0.33 39.8 E 6 SGSIN LKCMB LK 890 Food
seed_corridor "SIN→MUN" "Reroute" 0.33 42.4 SW 6 SGSIN INMUN IN 2530 AutoParts
seed_corridor "SIN→NSA" "Reroute" 0.33 43.1 WSW 6 SGSIN INNSA IN 2580 Chemicals
seed_corridor "MUM→JEA" "Reroute" 0.33 40.7 N 6 INMUM AEJEA AE 1650 Chemicals

echo "\n==> Verification calls (/infer/route representative corridors)"
post_json /infer/route '{"corridor_name":"TOK→SIN","transport_mode_enc":1,"transport_weight_kg":5000}'
post_json /infer/route '{"corridor_name":"SIN→JEA","transport_mode_enc":1,"transport_weight_kg":5000}'
post_json /infer/route '{"corridor_name":"SIN→MUN","transport_mode_enc":1,"transport_weight_kg":5000}'

echo "\nSeed complete for all corridors (20/20)."
echo "Next: run scripts/verify_all_actions.fish --seed to validate per-corridor action targets."
