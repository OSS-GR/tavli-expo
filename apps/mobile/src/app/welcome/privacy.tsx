import { useRouter } from 'expo-router';

import { WelcomeConsentScreen } from '@/features/welcome/WelcomeConsentScreen';

/** First launch, step 2 of 2: usage data consent (#61). Goes Home after the answer. */
export default function WelcomePrivacyRoute() {
  const router = useRouter();
  return (
    <WelcomeConsentScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome/language'))}
      onDone={() => router.replace('/')}
    />
  );
}
