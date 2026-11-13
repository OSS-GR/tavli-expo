import { screen } from '@testing-library/react-native';
import { fonts, themes } from '@tavli/ui';

import { renderWithRoot } from '../../test/render';
import { avatarWood } from './avatar';
import { CheckerAvatar } from './CheckerAvatar';

const { avatar } = themes['walnut-kafeneio'];

describe('<CheckerAvatar />', () => {
  it('draws the wood from the player id with the initials in Piazzolla', async () => {
    await renderWithRoot(<CheckerAvatar testID="avatar" playerKey="player-7" name="eleni.k" />);
    const wood = avatar[avatarWood('player-7')];
    const checker = screen.getByTestId('avatar', { includeHiddenElements: true });
    expect(checker).toHaveStyle({
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: wood.face,
      borderColor: wood.rim,
      borderWidth: 1,
    });
    expect(screen.getByText('EK', { includeHiddenElements: true })).toHaveStyle({
      color: wood.text,
      fontFamily: fonts.numerals,
      fontSize: 17,
    });
  });

  it('is hidden from screen readers: the name next to it is read', async () => {
    await renderWithRoot(<CheckerAvatar testID="avatar" playerKey="p" name="eleni.k" />);
    expect(screen.queryByTestId('avatar')).toBeNull();
    expect(screen.queryByText('EK')).toBeNull();
  });

  it('marks you with a brass ring', async () => {
    await renderWithRoot(<CheckerAvatar testID="avatar" playerKey="p" name="orestis_m" you />);
    expect(screen.getByTestId('avatar', { includeHiddenElements: true })).toHaveStyle({
      borderColor: avatar.you,
      borderWidth: 2,
    });
  });

  it('shows no initials below 32 pt or with no name', async () => {
    await renderWithRoot(
      <>
        <CheckerAvatar playerKey="a" name="eleni.k" size={24} />
        <CheckerAvatar playerKey="b" />
      </>,
    );
    expect(screen.queryByText('EK', { includeHiddenElements: true })).toBeNull();
  });

  it('takes a fixed wood for a side: the light checker for White (#515)', async () => {
    await renderWithRoot(<CheckerAvatar testID="avatar" wood="bone" size={18} />);
    expect(screen.getByTestId('avatar', { includeHiddenElements: true })).toHaveStyle({
      width: 18,
      backgroundColor: avatar.bone.face,
      borderColor: avatar.bone.rim,
    });
  });
});
