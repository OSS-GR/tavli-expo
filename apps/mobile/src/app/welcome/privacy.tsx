import { useRouter } from 'expo-router';

import { WelcomeConsentScreen } from '@/features/welcome/WelcomeConsentScreen';

/** First launch, step 2 of 2: usage data consent (#61). Goes Home after the answer. */
export default function WelcomePrivacyRoute() {
  const router = useRouter();
  return (
    <WelcomeConsentScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome/language'))}
      onDone={() => {
        // The answer flips the root layout's guard, and the router drops the
        // welcome routes. Pop and swap for Home here too, so Back can never
        // return to the welcome flow, whatever order those updates run in.
        if (router.canDismiss()) router.dismissAll();
        router.replace('/');
      }}
    />
  );
}
