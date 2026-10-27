import { useRouter } from 'expo-router';

import { WelcomeConsentScreen } from '@/features/welcome/WelcomeConsentScreen';

/**
 * First launch, step 2 of 2: usage data consent (#61).
 *
 * No navigation after the answer: it flips the root layout's guard
 * (`Stack.Protected`), and the router itself drops the welcome routes and
 * opens Home, with nothing to go Back to (`welcomeFlow.test.tsx`).
 */
export default function WelcomePrivacyRoute() {
  const router = useRouter();
  return (
    <WelcomeConsentScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome/language'))}
    />
  );
}
