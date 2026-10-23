#!/bin/sh
# Container entrypoint: make sure the writable dir exists, print one JSON startup line, start Next.
mkdir -p "$DATA_RW_DIR" 2>/dev/null
W=false
if touch "$DATA_RW_DIR/.w" 2>/dev/null; then rm -f "$DATA_RW_DIR/.w"; W=true; fi
SZ=$(stat -c %s "$SQLITE_PATH" 2>/dev/null || echo 0)
echo "{\"msg\":\"startup\",\"dataSource\":\"${DATA_SOURCE:-fixtures}\",\"llmMode\":\"${LLM_MODE:-auto}\",\"sqliteBytes\":$SZ,\"rwDir\":\"$DATA_RW_DIR\",\"rwWritable\":$W,\"autoReply\":\"${AUTO_REPLY:-1}\",\"version\":\"${APP_VERSION:-dev}\"}"
exec node server.js
