import { useRouter } from 'expo-router';

import { boardStepStore } from '@/features/welcome/boardStepStore';
import { WelcomeBoardScreen } from '@/features/welcome/WelcomeBoardScreen';

/**
 * First launch, step 3 of 3: the board (#350). The consent route opens it
 * after the first answer.
 *
 * Continue saves the step as done. That flips the root layout's guard
 * (`Stack.Protected`): the router drops the welcome routes and opens Home
 * (or a waiting invite link), with nothing to go Back to.
 */
export default function WelcomeBoardRoute() {
  const router = useRouter();
  return (
    <WelcomeBoardScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome/privacy'))}
      onContinue={() => boardStepStore.getState().finish()}
    />
  );
}
