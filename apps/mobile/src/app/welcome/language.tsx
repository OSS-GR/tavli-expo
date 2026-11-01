import { useRouter } from 'expo-router';

import { WelcomeLanguageScreen } from '@/features/welcome/WelcomeLanguageScreen';

/** First launch, step 1 of 3. The root layout sends new users here (#61). */
export default function WelcomeLanguageRoute() {
  const router = useRouter();
  return <WelcomeLanguageScreen onContinue={() => router.push('/welcome/privacy')} />;
}
