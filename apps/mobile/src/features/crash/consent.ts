/**
 * May the app send crash reports? This is the one place that decides.
 *
 * Crash reports carry no personal data (see the `CrashReporter` port), but
 * the player can still opt out of usage data. When they do, this returns
 * `false` and the reporter stops sending.
 */
import type { SettingsState } from '@/features/settings/settings';

export function crashReportingAllowed(settings: SettingsState): boolean {
  // TODO(#61): there is no usage-data setting yet. When the analytics
  // consent lands, read its flag here, e.g. `return settings.usageData;`.
  // Until then crash reports are on by default.
  void settings;
  return true;
}
