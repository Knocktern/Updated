"""Simple entry point for Render deployment"""
import os
import sys

try:
    from run import app
except Exception as e:
    print(f"Error importing app: {e}", file=sys.stderr)
    sys.exit(1)

if __name__ == "__main__":
    # Get port from environment variable or default to 5000
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)