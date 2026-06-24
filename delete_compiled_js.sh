#!/bin/bash
# Run this ONCE from the Final-Project/ directory to remove stale compiled JS files
# that shadow your TypeScript sources when using ts-node.
#
# Usage: cd test/Final-Project && bash ../../delete_compiled_js.sh

set -e

JS_FILES=(
  src/server.js
  src/middleware/auth.js
  src/middleware/upload.js
  src/middleware/errorHandler.js
  src/config/database.js
  src/utils/jwt.js
  src/controllers/workflowController.js
  src/controllers/jobController.js
  src/controllers/resumeController.js
  src/controllers/profileController.js
  src/controllers/authController.js
  src/routes/resumeRoutes.js
  src/routes/jobRoutes.js
  src/routes/authRoutes.js
  src/routes/workflowRoutes.js
  src/routes/profileRoutes.js
  src/services/aiSuggestionService.js
  src/services/fitScoreService.js
  src/services/parserService.js
)

DELETED=0
for f in "${JS_FILES[@]}"; do
  if [ -f "$f" ]; then
    rm "$f"
    echo "  deleted: $f"
    DELETED=$((DELETED + 1))
  fi
done

echo ""
echo "Done — deleted $DELETED stale .js file(s)."
echo "ts-node will now always load the .ts sources directly."
