import { useRouter } from 'expo-router';

import { boardStepStore } from '@/features/welcome/boardStepStore';
import { WelcomeConsentScreen } from '@/features/welcome/WelcomeConsentScreen';

/**
 * First launch, step 2 of 3: usage data consent (#61).
 *
 * After the first answer the board step is due (#350), so the route opens
 * it. A player who passed the board step before (a new consent text asks
 * again) gets no board step: the answer flips the root layout's guard
 * (`Stack.Protected`), and the router itself drops the welcome routes and
 * opens Home, with nothing to go Back to (`welcomeFlow.test.tsx`).
 */
export default function WelcomePrivacyRoute() {
  const router = useRouter();
  return (
    <WelcomeConsentScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome/language'))}
      onAnswered={() => {
        if (boardStepStore.getState().status === 'due') router.push('/welcome/board');
      }}
    />
  );
}
