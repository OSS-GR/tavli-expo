import { runCrashReporterContract } from '@tavli/contracts/testing';

import { createSentryCrashReporter } from './sentry.web';

runCrashReporterContract('the browser twin of the Sentry adapter', createSentryCrashReporter);
