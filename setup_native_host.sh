#!/bin/bash

# Configuration
MANIFEST_NAME="com.youtube_agent.native_manager.json"
PROJECT_DIR="/Users/pratyushkumar/.gemini/antigravity/youtube"
SOURCE_MANIFEST="$PROJECT_DIR/extension/$MANIFEST_NAME"
SOURCE_HOST="$PROJECT_DIR/extension/native_host.js"
TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

echo "🎯 ChannelLens: Native Host Setup"

# 1. Ask for Extension ID if placeholder exists
if grep -q "\[YOUR_EXTENSION_ID_HERE\]" "$SOURCE_MANIFEST"; then
    echo "Please enter your Extension ID (from chrome://extensions):"
    read EXT_ID
    if [ -z "$EXT_ID" ]; then
        echo "❌ Extension ID is required. Setup cancelled."
        exit 1
    fi
    # Use sed to replace the placeholder
    # Mac sed 'i' syntax is slightly different: sed -i ''
    sed -i '' "s/\[YOUR_EXTENSION_ID_HERE\]/$EXT_ID/g" "$SOURCE_MANIFEST"
    echo "✅ Manifest updated with Extension ID: $EXT_ID"
fi

# 2. Fix Permissions
chmod +x "$SOURCE_HOST"
echo "✅ Set executable permissions on native_host.js"

# 3. Create Target Directory if needed
mkdir -p "$TARGET_DIR"

# 4. Copy Manifest to Chrome's discovery location
cp "$SOURCE_MANIFEST" "$TARGET_DIR/$MANIFEST_NAME"
echo "✅ Registered manifest in: $TARGET_DIR"

echo "🎉 Setup complete! Please reload the extension in chrome://extensions."
