// The parts of React Native and Expo that `@better-auth/expo/client` uses,
// for `legacySession.test.ts`. Node cannot load the real modules.
export const Platform = { OS: 'ios' };
export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => {} }),
};
export function createURL(path: string): string {
  return `tavlaki://${path}`;
}
export function addNetworkStateListener() {
  return { remove: () => {} };
}
export default { expoConfig: { scheme: 'tavlaki' } };
