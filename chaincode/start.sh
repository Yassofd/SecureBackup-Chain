#!/bin/sh
set -e
cd /usr/local/src
npm install --prefer-offline 2>/dev/null || npm install
exec npm run start
