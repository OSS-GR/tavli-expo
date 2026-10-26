// Babel config for the Expo app.
// The Unistyles plugin processes every file under `src/` (docs: unistyl.es/v3/start/getting-started).
// It does nothing when NODE_ENV is "test", so Jest uses the Unistyles mocks instead.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['react-native-unistyles/plugin', { root: 'src' }]],
  };
};
