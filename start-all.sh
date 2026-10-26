#!/usr/bin/env bash
cd "$(dirname "$0")"
bash start-backend.sh &
sleep 6
bash start-frontend.sh
