import { quietly } from './quietly';

describe('quietly', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls the function and returns its result', () => {
    const send = jest.fn(() => 42);
    expect(quietly(send)).toBe(42);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('swallows a thrown error and logs it', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = new Error('analytics down');
    expect(
      quietly(() => {
        throw error;
      }),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('analytics failed', error);
  });

  it('logs nothing when the function works', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    quietly(() => undefined);
    expect(warn).not.toHaveBeenCalled();
  });
});
