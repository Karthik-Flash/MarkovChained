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

echo "Seeding update endpoints at $BASE_URL"

# Weather updates for all 8 corridors
post_json /update/weather '{"corridor_name":"SIN→Colombo","weather_severity_raw":0.39,"source":"seed-script","meta":{"scenario":"moderate swell"}}'
post_json /update/weather '{"corridor_name":"SIN→JebelAli","weather_severity_raw":0.87,"source":"seed-script","meta":{"scenario":"cyclone band"}}'
post_json /update/weather '{"corridor_name":"SIN→Mundra","weather_severity_raw":0.44,"source":"seed-script","meta":{"scenario":"stable monsoon"}}'
post_json /update/weather '{"corridor_name":"SIN→NhavaSheva","weather_severity_raw":0.71,"source":"seed-script","meta":{"scenario":"storm front"}}'
post_json /update/weather '{"corridor_name":"SIN→Rotterdam","weather_severity_raw":0.29,"source":"seed-script","meta":{"scenario":"calm atlantic"}}'
post_json /update/weather '{"corridor_name":"SIN→Busan","weather_severity_raw":0.35,"source":"seed-script","meta":{"scenario":"light rain"}}'
post_json /update/weather '{"corridor_name":"SIN→Shanghai","weather_severity_raw":0.58,"source":"seed-script","meta":{"scenario":"gusty conditions"}}'
post_json /update/weather '{"corridor_name":"JEA→Rotterdam","weather_severity_raw":0.53,"source":"seed-script","meta":{"scenario":"red sea pressure"}}'

# Wind updates
post_json /update/wind '{"corridor_name":"SIN→Colombo","wind_kmh":26.4,"wind_direction":"WSW","source":"seed-script"}'
post_json /update/wind '{"corridor_name":"SIN→JebelAli","wind_kmh":49.2,"wind_direction":"NE","source":"seed-script"}'
post_json /update/wind '{"corridor_name":"SIN→Mundra","wind_kmh":28.1,"wind_direction":"SW","source":"seed-script"}'
post_json /update/wind '{"corridor_name":"SIN→NhavaSheva","wind_kmh":42.6,"wind_direction":"WNW","source":"seed-script"}'
post_json /update/wind '{"corridor_name":"SIN→Rotterdam","wind_kmh":17.9,"wind_direction":"W","source":"seed-script"}'
post_json /update/wind '{"corridor_name":"SIN→Busan","wind_kmh":21.2,"wind_direction":"SE","source":"seed-script"}'
post_json /update/wind '{"corridor_name":"SIN→Shanghai","wind_kmh":34.8,"wind_direction":"E","source":"seed-script"}'
post_json /update/wind '{"corridor_name":"JEA→Rotterdam","wind_kmh":31.5,"wind_direction":"NNW","source":"seed-script"}'

# Headlines updates
post_json /update/headlines '{"corridor_name":"SIN→JebelAli","source":"seed-script","headlines":[{"title":"Cyclone watch extended over Arabian Sea shipping lane","source":"Maritime Watch","url":"https://example.com/news/cyclone-arabian-sea","risk_score":0.92},{"title":"Port congestion rises at Gulf transshipment hubs","source":"Port Intel","url":"https://example.com/news/gulf-congestion","risk_score":0.81},{"title":"Carriers announce contingency schedules for westbound routes","source":"Logistics Daily","url":"https://example.com/news/contingency-schedules","risk_score":0.73}]}'
post_json /update/headlines '{"corridor_name":"SIN→NhavaSheva","source":"seed-script","headlines":[{"title":"Monsoon surge disrupts vessel timing near western India","source":"Ocean Brief","url":"https://example.com/news/monsoon-surge","risk_score":0.78},{"title":"Nhava Sheva terminal throughput slows after heavy rainfall","source":"Trade Desk","url":"https://example.com/news/terminal-throughput","risk_score":0.69}]}'
post_json /update/headlines '{"corridor_name":"SIN→Rotterdam","source":"seed-script","headlines":[{"title":"Suez transit times normalize after backlog clearance","source":"Freight Lens","url":"https://example.com/news/suez-normalize","risk_score":0.31}]}'

# Macro updates
post_json /update/inflation '{"inflation_rate":3.4,"currency":"USD","source":"seed-script","meta":{"note":"test baseline"}}'

# Lead-time updates
post_json /update/lead-time '{"corridor_name":"SIN→JebelAli","base_lead_time":14,"source":"seed-script"}'
post_json /update/lead-time '{"corridor_name":"SIN→Rotterdam","distance_nm":8300,"source":"seed-script"}'

# Corridor profile sample
post_json /update/corridor-profile '{"origin_locode":"SGSIN","dest_locode":"INNSA","dest_country":"IN","distance_nm":3430,"commodity":"AutoParts"}'

echo "\nSeeding complete."
