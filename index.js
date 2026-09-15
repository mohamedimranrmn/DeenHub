/**
 * index.js  (project root)
 *
 * Replaces the default "expo-router/entry" as package.json's "main".
 * We still boot Expo Router (the import below has that side effect), but
 * first we register the playback service so RNTP can dispatch remote
 * commands (lock screen / Control Center / Android notification) even
 * when the app is backgrounded.
 *
 * package.json change required:
 *   "main": "index.js"        (was: "expo-router/entry")
 */

import 'expo-router/entry';

