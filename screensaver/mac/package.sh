#!/bin/sh
# Builds dist-screensaver/ReshapeXKnowledgeGraph.saver (arm64, ad-hoc signed, not distributable).
set -eu
cd "$(dirname "$0")/../.."
pnpm build:screensaver
B=dist-screensaver/ReshapeXKnowledgeGraph.saver
rm -rf "$B"
mkdir -p "$B/Contents/MacOS" "$B/Contents/Resources"
swiftc -O -emit-library -Xlinker -bundle -module-name ReshapeXKnowledgeGraph -target arm64-apple-macosx14.0 \
  -framework ScreenSaver -framework WebKit \
  -o "$B/Contents/MacOS/ReshapeXKnowledgeGraph" screensaver/mac/KGScreenSaverView.swift
cp screensaver/mac/Info.plist "$B/Contents/Info.plist"
cp -R dist-screensaver/web "$B/Contents/Resources/web"
# Apple Silicon will not load an unsigned bundle; ad-hoc is enough for internal testing.
codesign --force --sign - "$B"
echo "built $B"
echo "install: cp -R $B ~/Library/Screen\\ Savers/ && killall legacyScreenSaver"
