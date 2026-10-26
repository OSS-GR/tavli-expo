/**
 * A small stand-in for react-native-reanimated in Jest.
 *
 * Shared values are plain boxes. Animations jump to their end value and
 * call their end callback at once, so a test sees the final state (a die
 * has landed, a checker has arrived). Add what you use from Reanimated here.
 */

type Callback = (finished: boolean) => void;

export interface MockSharedValue<T> {
  value: T;
  get: () => T;
  set: (next: T | ((old: T) => T)) => void;
}

export function makeMutable<T>(initial: T): MockSharedValue<T> {
  const box = {
    value: initial,
    get: () => box.value,
    set: (next: T | ((old: T) => T)) => {
      box.value = typeof next === 'function' ? (next as (old: T) => T)(box.value) : next;
    },
  };
  return box;
}

export const useSharedValue = makeMutable;

export function useDerivedValue<T>(processor: () => T): MockSharedValue<T> {
  return makeMutable(processor());
}

export function withTiming<T>(toValue: T, _config?: unknown, callback?: Callback): T {
  callback?.(true);
  return toValue;
}

export function withSpring<T>(toValue: T, _config?: unknown, callback?: Callback): T {
  callback?.(true);
  return toValue;
}

export function withDelay<T>(_ms: number, animation: T): T {
  return animation;
}

export function withSequence<T>(...animations: T[]): T | undefined {
  return animations[animations.length - 1];
}

export function cancelAnimation(): void {}

const linear = (t: number) => t;
export const Easing = {
  linear,
  quad: linear,
  cubic: linear,
  out: () => linear,
  in: () => linear,
  inOut: () => linear,
};

export function useReducedMotion(): boolean {
  return false;
}
