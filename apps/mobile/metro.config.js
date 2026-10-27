// Metro config. Sentry's version of Expo's default config adds a Debug ID
// to each bundle and source map, so Sentry can match crash stack traces to
// our source code (docs.sentry.io/platforms/react-native/manual-setup/expo/).
// This is build tooling, not app code, so it may use the Sentry package directly.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

module.exports = config;
