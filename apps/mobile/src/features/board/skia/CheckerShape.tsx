/**
 * One round checker, drawn from a theme `CheckerStyle` (Skia).
 * Same layers as the theme preview renderer: shadow, fill, dome shading,
 * dish, grooves, bevel, ring and rim. Every length is in radius units.
 */
import {
  BlurMask,
  Circle,
  Group,
  Image,
  LinearGradient,
  RadialGradient,
} from '@shopify/react-native-skia';
import type { CheckerStyle, Groove, Shadow } from '@tavli/themes';
import type { ReactElement } from 'react';

import { linearProps, radialProps, rgba } from '../paint';
import { WEB_BOARD } from '../webBoard';

import { useCheckerSprite } from './checkerSprite';

export interface CheckerShapeProps {
  cx: number;
  cy: number;
  r: number;
  style: CheckerStyle;
  shadow: Shadow;
  opacity?: number;
}

function GrooveRing({ cx, cy, r, g }: { cx: number; cy: number; r: number; g: Groove }) {
  return (
    <>
      <Circle
        cx={cx}
        cy={cy}
        r={g.radius * r}
        style="stroke"
        strokeWidth={g.width * r}
        color={rgba(g.color, g.opacity)}
      />
      <Circle
        cx={cx + g.light.dx * r}
        cy={cy + g.light.dy * r}
        r={g.radius * r}
        style="stroke"
        strokeWidth={g.light.width * r}
        color={rgba('#FFFFFF', g.light.opacity)}
      />
    </>
  );
}

/** On the web: one ready image per look (`checkerSprite.ts`), the full art until it is made. */
function SpriteChecker(props: CheckerShapeProps) {
  const { cx, cy, r, style, shadow, opacity = 1 } = props;
  const sprite = useCheckerSprite(style, shadow, r, (c, px) => (
    <CheckerArt cx={c} cy={c} r={px} style={style} shadow={shadow} />
  ));
  if (!sprite) return <CheckerArt {...props} />;
  const half = sprite.reach * r;
  return (
    <Image
      image={sprite.image}
      x={cx - half}
      y={cy - half}
      width={2 * half}
      height={2 * half}
      fit="fill"
      opacity={opacity}
    />
  );
}

function CheckerArt({ cx, cy, r, style, shadow, opacity = 1 }: CheckerShapeProps) {
  const box = { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r };
  const dr = (style.dish?.radius ?? 0) * r;
  const dishBox = { x: cx - dr, y: cy - dr, width: 2 * dr, height: 2 * dr };
  return (
    <Group opacity={opacity}>
      <Circle
        cx={cx + shadow.dx * r}
        cy={cy + shadow.dy * r}
        r={r}
        color={rgba(shadow.color, shadow.opacity)}>
        <BlurMask blur={shadow.blur * r} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={r} color={style.fill} />
      <Circle cx={cx} cy={cy} r={r}>
        <RadialGradient {...radialProps(style.highlight, box)} />
      </Circle>
      {style.dish ? (
        <>
          <Circle cx={cx} cy={cy} r={dr}>
            <RadialGradient {...radialProps(style.dish.gradient, dishBox)} />
          </Circle>
          <GrooveRing cx={cx} cy={cy} r={r} g={style.dish.groove} />
        </>
      ) : null}
      {style.grooves.map((g, i) => (
        <GrooveRing key={i} cx={cx} cy={cy} r={r} g={g} />
      ))}
      <Circle
        cx={cx}
        cy={cy}
        r={r - style.bevel.inset * r}
        style="stroke"
        strokeWidth={style.bevel.width * r}
        opacity={style.bevel.opacity}>
        <LinearGradient {...linearProps(style.bevel.gradient, box)} />
      </Circle>
      {style.ring ? (
        <Circle
          cx={cx}
          cy={cy}
          r={r - style.ring.inset * r}
          style="stroke"
          strokeWidth={style.ring.width * r}
          color={style.ring.color}
        />
      ) : null}
      <Circle
        cx={cx}
        cy={cy}
        r={r - style.rim.inset * r}
        style="stroke"
        strokeWidth={style.rim.width * r}
        color={style.rim.color}
      />
    </Group>
  );
}

/** The checker: the full art on a phone, an image of it on the web (#679). */
export const CheckerShape: (props: CheckerShapeProps) => ReactElement = WEB_BOARD
  ? SpriteChecker
  : CheckerArt;
