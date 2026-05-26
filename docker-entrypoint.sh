#!/bin/sh
set -e

# Fix volume permissions (Docker named volumes are created as root)
chown -R nextjs:nodejs /app/data 2>/dev/null || true

# Drop privileges and run the server
exec su-exec nextjs "$@"
