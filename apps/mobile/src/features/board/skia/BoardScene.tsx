/**
 * The board drawing (Skia), in the order the theme README gives:
 * shadow, image layers under the points, 24 vector points, image layers
 * over the points, pinned checkers (Plakoto, Asodio), checkers (frozen ones
 * with a quiet shade, Asodio) with count badges, trays, highlights, then the
 * lamp overlay.
 *
 * Everything comes from props: the theme, the geometry and a picture made
 * by `layoutBoard`. No hooks, no state and no React Native imports, so the
 * same scene renders in the app, in tests and headless (screenshots).
 */
import {
  BlurMask,
  Circle,
  DashPathEffect,
  Group,
  Image,
  ImageShader,
  LinearGradient,
  Path,
  RadialGradient,
  RoundedRect,
  Text,
  type SkFont,
  type SkImage,
} from '@shopify/react-native-skia';
import type { ThemeManifest } from '@tavli/themes';
import type { ReactNode } from 'react';

import { toneOf, type BoardPicture } from '../boardModel';
import { checkerRadius, pointPath, type BoardGeometry } from '../geometry';
import { linearProps, radialProps, rgba } from '../paint';

import { CheckerShape } from './CheckerShape';

/** Loaded theme images by manifest key. A missing image falls back to colors. */
export type BoardImages = Readonly<Record<string, SkImage | null | undefined>>;

/** A ring on the board, in points. `r` is the checker radius at that place. */
export interface Mark {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface BoardHighlights {
  /** The picked-up or selected checker. */
  readonly select: Mark | null;
  /** Where the selected checker may go. */
  readonly targets: readonly Mark[];
  /** Checkers to touch now (the tutorial's lit checkers). Drawn like the selected ring. */
  readonly cues?: readonly Mark[];
}

export interface BoardSceneProps {
  theme: ThemeManifest;
  geo: BoardGeometry;
  images: BoardImages;
  picture: BoardPicture;
  /** Font for the count badges. `null` draws the badge without the number. */
  font: SkFont | null;
  /** Checkers not to draw (keys from `layoutBoard`), e.g. one that is in the air. */
  hidden?: ReadonlySet<string>;
  highlights?: BoardHighlights;
  /** Drawn over the checkers and highlights, under the lamp (moving checkers). */
  children?: ReactNode;
}

const NO_HIGHLIGHTS: BoardHighlights = { select: null, targets: [] };

/** Width of the ring on a pinned checker, in checker radii. */
export const PIN_RING_WIDTH = 0.16;

/**
 * Asodio: a checker frozen by the quarter lock gets a soft shade and a thin
 * frost ring. Quiet on purpose: it says "waits", not "danger".
 */
export const FROZEN_MARK = {
  shade: { color: '#0E1A2A', opacity: 0.32 },
  ring: { color: '#DCEBFF', opacity: 0.55, radius: 0.62, width: 0.08 },
} as const;

export function BoardScene({
  theme,
  geo,
  images,
  picture,
  font,
  hidden,
  highlights = NO_HIGHLIGHTS,
  children,
}: BoardSceneProps) {
  const { layout } = geo;
  const W = geo.width;
  const R = checkerRadius(geo);
  const board = { x: geo.x, y: geo.y, width: geo.width, height: geo.height };
  const corner = W * 0.013;
  const ps = layout.pointShape;
  const tile = ps.tileSize * W;
  const badge = theme.checkers.badge;
  const hl = theme.highlights;

  const layers = (z: 'underPoints' | 'overPoints') =>
    layout.layers
      .filter((l) => l.z === z)
      .map((l) => {
        const image = images[l.image];
        return image ? (
          <Image key={l.id} image={image} {...board} fit="fill" blendMode={l.blend} />
        ) : null;
      });

  return (
    <Group>
      {/* 1. Board shadow on the table. */}
      <RoundedRect
        x={board.x + layout.shadow.dx * W}
        y={board.y + layout.shadow.dy * W}
        width={board.width}
        height={board.height}
        r={corner}
        color={rgba(layout.shadow.color, layout.shadow.opacity)}>
        <BlurMask blur={layout.shadow.blur * W} style="normal" />
      </RoundedRect>

      {/* 2. Frame, bar, trays and field. Without images: plain theme colors. */}
      {images[layout.layers[0]?.image ?? ''] ? null : (
        <>
          <RoundedRect
            {...board}
            r={corner}
            color={theme.palette['board.frame'] ?? theme.points.dark.fill}
          />
          {layout.fields.map((f, i) => (
            <RoundedRect
              key={i}
              x={geo.x + f.x * W}
              y={geo.y + f.y * geo.height}
              width={f.w * W}
              height={f.h * geo.height}
              r={corner / 2}
              color={theme.palette['board.field'] ?? theme.points.light.fill}
            />
          ))}
        </>
      )}
      {layers('underPoints')}

      {/* 3. Points: vector triangles, color first, then the wood tile. */}
      {layout.points.map((p) => {
        const style = theme.points[p.tone];
        const d = pointPath(geo, p.index);
        const texture = images[style.texture];
        return (
          <Group key={p.index}>
            <Path path={d} color={style.fill} />
            {texture ? (
              <Path path={d}>
                <ImageShader
                  image={texture}
                  tx="repeat"
                  ty="repeat"
                  fit="fill"
                  rect={{ x: geo.x, y: geo.y, width: tile, height: tile }}
                  {...(ps.tileRotation !== 0
                    ? {
                        origin: { x: geo.x, y: geo.y },
                        transform: [{ rotate: (ps.tileRotation * Math.PI) / 180 }],
                      }
                    : {})}
                />
              </Path>
            ) : null}
            <Path
              path={d}
              style="stroke"
              strokeWidth={ps.seam.width * W}
              strokeJoin="miter"
              color={rgba(ps.seam.color, ps.seam.opacity)}
            />
          </Group>
        );
      })}

      {/* 4. Wear and the frame's inner shadow. */}
      {layers('overPoints')}

      {/* 5. Pinned checkers (Plakoto) with a ring in the badge color, under the
          checkers that pin them. They peek out on the base side of the point. */}
      {picture.pins.map((p) => (
        <Group key={p.key}>
          <CheckerShape
            cx={p.x}
            cy={p.y}
            r={p.r}
            style={theme.checkers[toneOf(p.owner)]}
            shadow={theme.checkers.shadow}
          />
          {/* No ring while the pinner is still in the air (its key is hidden). */}
          <Circle
            opacity={hidden?.has(p.key.replace(/:pinned$/, ':0')) ? 0 : 1}
            cx={p.x}
            cy={p.y}
            r={p.r * (1 - PIN_RING_WIDTH / 2)}
            style="stroke"
            strokeWidth={PIN_RING_WIDTH * p.r}
            color={badge.fill}
          />
        </Group>
      ))}

      {/* 6. Checkers (frozen ones shaded, Asodio) and count badges. */}
      {picture.checkers.map((c) =>
        hidden?.has(c.key) ? null : c.frozen ? (
          <Group key={c.key}>
            <CheckerShape
              cx={c.x}
              cy={c.y}
              r={c.r}
              style={theme.checkers[toneOf(c.owner)]}
              shadow={theme.checkers.shadow}
            />
            <Circle
              cx={c.x}
              cy={c.y}
              r={c.r}
              color={rgba(FROZEN_MARK.shade.color, FROZEN_MARK.shade.opacity)}
            />
            <Circle
              cx={c.x}
              cy={c.y}
              r={c.r * FROZEN_MARK.ring.radius}
              style="stroke"
              strokeWidth={c.r * FROZEN_MARK.ring.width}
              color={rgba(FROZEN_MARK.ring.color, FROZEN_MARK.ring.opacity)}
            />
          </Group>
        ) : (
          <CheckerShape
            key={c.key}
            cx={c.x}
            cy={c.y}
            r={c.r}
            style={theme.checkers[toneOf(c.owner)]}
            shadow={theme.checkers.shadow}
          />
        ),
      )}
      {picture.badges.map((b) => {
        const br = badge.radius * b.r;
        const text = String(b.count);
        const width = font ? font.measureText(text).width : 0;
        return (
          <Group key={`badge:${b.key}`}>
            <Circle cx={b.x} cy={b.y} r={br} color={badge.fill} />
            <Circle
              cx={b.x}
              cy={b.y}
              r={br}
              style="stroke"
              strokeWidth={badge.borderWidth * b.r}
              color={badge.border}
            />
            {font ? (
              <Text
                x={b.x - width / 2}
                y={b.y + font.getSize() * 0.36}
                text={text}
                font={font}
                color={badge.text}
              />
            ) : null}
          </Group>
        );
      })}

      {/* 7. Borne-off checkers in the trays, seen from the edge. */}
      {picture.trays.map((tray) => {
        const style = theme.checkers[toneOf(tray.owner)];
        return (
          <Group key={tray.key}>
            {tray.rects.map((r, i) => {
              const round = Math.min(r.width, r.height) * 0.35;
              return (
                <Group key={i}>
                  <RoundedRect {...r} r={round} color={style.fill} />
                  <RoundedRect {...r} r={round} opacity={0.35 * style.bevel.opacity}>
                    <LinearGradient {...linearProps(style.bevel.gradient, r)} />
                  </RoundedRect>
                  <RoundedRect
                    {...r}
                    r={round}
                    style="stroke"
                    strokeWidth={style.rim.width * R}
                    color={(style.ring ?? style.rim).color}
                  />
                </Group>
              );
            })}
          </Group>
        );
      })}

      {/* 8. Highlights: legal targets, then the selected checker. */}
      {highlights.targets.map((t) => (
        <Group key={`target:${t.key}`}>
          <Circle
            cx={t.x}
            cy={t.y}
            r={hl.target.radius * t.r}
            color={rgba(hl.target.color, hl.target.fillOpacity)}
          />
          <Circle
            cx={t.x}
            cy={t.y}
            r={hl.target.radius * t.r}
            style="stroke"
            strokeWidth={hl.target.halo.width * t.r}
            color={rgba(hl.target.halo.color, hl.target.halo.opacity)}
          />
          <Circle
            cx={t.x}
            cy={t.y}
            r={hl.target.radius * t.r}
            style="stroke"
            strokeWidth={hl.target.width * t.r}
            color={hl.target.color}>
            <DashPathEffect intervals={[hl.target.dash[0] * t.r, hl.target.dash[1] * t.r]} />
          </Circle>
        </Group>
      ))}
      {[
        ...(highlights.cues ?? []),
        ...(highlights.select ? [{ ...highlights.select, key: 'select' }] : []),
      ].map((m) => (
        <Group key={`select:${m.key}`}>
          <Circle
            cx={m.x}
            cy={m.y}
            r={hl.select.radius * m.r}
            style="stroke"
            strokeWidth={hl.select.halo.width * m.r}
            color={rgba(hl.select.halo.color, hl.select.halo.opacity)}
          />
          <Circle
            cx={m.x}
            cy={m.y}
            r={hl.select.radius * m.r}
            style="stroke"
            strokeWidth={hl.select.width * m.r}
            color={hl.select.color}
          />
        </Group>
      ))}

      {children}

      {/* 9. The lamp: soft light over everything. */}
      {layout.overlay ? (
        <RoundedRect {...board} r={corner} blendMode={layout.overlay.blend}>
          <RadialGradient {...radialProps(layout.overlay.gradient, board)} />
        </RoundedRect>
      ) : null}
    </Group>
  );
}
