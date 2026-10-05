#!/usr/bin/env bash

# Kill processes listening on specified ports (default: 3000 5173)
TARGET_PORTS=("$@")
if [ ${#TARGET_PORTS[@]} -eq 0 ]; then
  TARGET_PORTS=(3000 5173)
fi

echo "🔍 Checking for processes blocking Novi ports: ${TARGET_PORTS[*]}..."

for PORT in "${TARGET_PORTS[@]}"; do
  # Find PIDs listening on TCP port
  PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null)

  if [ -n "$PIDS" ]; then
    echo "⚠️  Found process(es) listening on port $PORT: $PIDS"
    for PID in $PIDS; do
      PROC_NAME=$(ps -p "$PID" -o comm= 2>/dev/null || echo "process")
      echo "   → Terminating PID $PID ($PROC_NAME)..."
      kill -9 "$PID" 2>/dev/null || true
    done

    sleep 0.5
    STILL_ALIVE=$(lsof -ti tcp:"$PORT" 2>/dev/null)
    if [ -z "$STILL_ALIVE" ]; then
      echo "✅ Successfully freed port $PORT."
    else
      echo "⚠️  Forcing termination on remaining PID(s): $STILL_ALIVE..."
      kill -9 $STILL_ALIVE 2>/dev/null || true
      echo "✅ Port $PORT is now cleared."
    fi
  else
    echo "✨ Port $PORT is already free."
  fi
done

echo "🎉 Done! You can now start Novi without port conflicts."
