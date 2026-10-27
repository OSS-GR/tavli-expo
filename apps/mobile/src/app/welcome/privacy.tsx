import { useRouter } from 'expo-router';

import { WelcomeConsentScreen } from '@/features/welcome/WelcomeConsentScreen';

/** First launch, step 2 of 2: usage data consent (#61). Goes Home after the answer. */
export default function WelcomePrivacyRoute() {
  const router = useRouter();
  return (
    <WelcomeConsentScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome/language'))}
      onDone={() => {
        // Home's redirect left the language step at the bottom of the stack.
        // Pop to it, then swap it for Home, so Back cannot return to the welcome flow.
        if (router.canDismiss()) router.dismissAll();
        router.replace('/');
      }}
    />
  );
}
