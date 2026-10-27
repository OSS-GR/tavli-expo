/**
 * Preview of the dice throw spike (#183): one throw, drawn headless with the
 * same `planThrow` the dev screen plays. Writes to `docs/design/dice-throw/`:
 *
 * - `throw-strip.png`: five frames side by side (the throw, in flight, the
 *   first bounce, a second bounce, the rest pose). Faint ghosts show where each die just was.
 * - `throw.gif`: the whole throw at 30 fps, only if `ffmpeg` is installed.
 *
 * Run: `pnpm --filter @tavli/mobile screenshots`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  Fill,
  Group,
  Rect,
  Text,
  drawOffscreen,
  makeOffscreenSurface,
} from '@shopify/react-native-skia/lib/commonjs/headless';
import type { SkFont } from '@shopify/react-native-skia';
import { createSeededRng, rollDice } from '@tavli/engine';
import { getLayout, getTheme, type ThemeManifest } from '@tavli/themes';
import type { ReactElement } from 'react';
import { expect, it } from 'vitest';

import { layoutBoard } from '@/features/board/boardModel';
import { checkerRadius, fitBoardWithShadow, type BoardGeometry } from '@/features/board/geometry';
import { SAMPLE_DIRECTIONS, SAMPLE_POSITIONS } from '@/features/board/positions';
import { BoardScene, type BoardImages } from '@/features/board/skia/BoardScene';
import { DieBody, DiePips } from '@/features/board/skia/DieShape';
import { boardThrowBox, throwDieSize, throwField } from '@/features/dice-throw/throwField';
import { planThrow, sampleAt, swipeToThrow, type ThrowPlan } from '@/features/dice-throw/throwPath';

import { loadFont, loadSkia, loadThemeImages } from './render';

const OUT = path.resolve(__dirname, '../../../../docs/design/dice-throw');
/** The spike asks for files under 400 KB. */
const MAX_BYTES = 400 * 1024;

const BOARD = { width: 280, height: 459 };
/** Space for the label under each frame. */
const LABEL_H = 22;

interface Scene {
  theme: ThemeManifest;
  geo: BoardGeometry;
  images: BoardImages;
  font: SkFont | null;
  label: SkFont | null;
  plan: ThrowPlan;
  /** The part of the board we show: the field the dice roll in, and a bit more. */
  crop: { y: number; height: number };
}

function dice(scene: Scene, ms: number, opacity = 1): ReactElement[] {
  const size = throwDieSize(scene.geo);
  return scene.plan.dice.map((track, i) => {
    const p = sampleAt(track, scene.plan.sampleMs, ms);
    return (
      <Group
        key={`${i}-${ms}`}
        opacity={opacity}
        transform={[
          { translateX: p.x },
          { translateY: p.y },
          { rotate: p.angle },
          { scale: p.scale },
        ]}>
        <DieBody style={scene.theme.dice} size={size} />
        <DiePips style={scene.theme.dice} size={size} value={p.face} />
      </Group>
    );
  });
}

/** One frame: the cropped board, the dice at `ms`, ghosts, and a label. */
function frame(scene: Scene, ms: number, text: string | null, ghosts: boolean): ReactElement {
  const { theme, geo, images, font, label, crop, plan } = scene;
  const ghostTimes = ghosts
    ? [3, 6, 9].map((k) => ms - k * plan.sampleMs).filter((t) => t > 0)
    : [];
  return (
    <Group clip={{ x: 0, y: 0, width: BOARD.width, height: crop.height + LABEL_H }}>
      {/* A Rect, not a Fill: a Fill paints the whole strip and hides the frames before it. */}
      <Rect
        x={0}
        y={0}
        width={BOARD.width}
        height={crop.height + LABEL_H}
        color={theme.palette['ui.bg'] ?? theme.points.dark.fill}
      />
      <Group transform={[{ translateY: -crop.y }]}>
        <BoardScene
          theme={theme}
          geo={geo}
          images={images}
          picture={layoutBoard(geo, SAMPLE_POSITIONS.midgame, {
            viewer: 'white',
            direction: SAMPLE_DIRECTIONS.midgame,
          })}
          font={font}>
          {ghostTimes.map((t, i) => (
            <Group key={t}>{dice(scene, t, 0.22 - i * 0.06)}</Group>
          ))}
          {dice(scene, ms)}
        </BoardScene>
      </Group>
      {text && label ? (
        <>
          <Rect x={0} y={crop.height} width={BOARD.width} height={LABEL_H} color="#1b120c" />
          <Text x={8} y={crop.height + 15} text={text} font={label} color="#f2e6d0" />
        </>
      ) : null}
    </Group>
  );
}

async function png(width: number, height: number, element: ReactElement): Promise<Buffer> {
  const surface = makeOffscreenSurface(width, height);
  const image = await drawOffscreen(surface, element);
  return Buffer.from(image.encodeToBase64(), 'base64');
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

it('renders the dice throw preview', async () => {
  await loadSkia();
  const theme = getTheme('walnut-kafeneio');
  const layout = getLayout(theme, 'portrait-rotated');
  const geo = fitBoardWithShadow(layout, BOARD);
  const field = throwField(geo);
  const box = boardThrowBox(geo);

  // 1. The RNG rolls first. 2. The path is planned to land on that roll.
  const values = rollDice(createSeededRng(184));
  const start = swipeToThrow(
    { x: box.left + 30, y: box.bottom - 10 },
    { x: 1100, y: -1400 }, // a quick flick up and to the right, in pt/s
    { x: 0, y: 0 },
    box,
  );
  const tilt = layout.dice.tilt;
  const plan = planThrow({
    box,
    start,
    dieSize: throwDieSize(geo),
    values,
    tilts: [tilt[0], tilt[1]],
  });
  const crop = { y: Math.floor(field.y - 26), height: Math.ceil(field.height + 52) };
  const scene: Scene = {
    theme,
    geo,
    images: loadThemeImages(theme, 1),
    font: loadFont(theme.checkers.badge.fontSize * checkerRadius(geo)),
    label: loadFont(12),
    plan,
    crop,
  };

  // Frames: the throw, two in flight, the first bounce, the rest pose.
  const firstHit = plan.hits[0]?.atMs ?? plan.durationMs / 3;
  const secondHit = plan.hits.find((h) => h.atMs > firstHit + 120)?.atMs;
  const snap = (ms: number) => Math.round(ms / plan.sampleMs) * plan.sampleMs;
  const picks: [number, string][] = [
    [0, 'throw'],
    [snap(firstHit * 0.5), 'in flight'],
    [snap(firstHit), 'bounce'],
    [snap(secondHit ?? (firstHit + plan.durationMs) / 2), secondHit ? 'bounce 2' : 'rolling'],
    [plan.durationMs, `rest: ${values[0]} and ${values[1]}`],
  ];
  const frameH = crop.height + LABEL_H;
  fs.mkdirSync(OUT, { recursive: true });
  const strip = await png(
    BOARD.width * picks.length + (picks.length - 1) * 4,
    frameH,
    <>
      <Fill color="#1b120c" />
      {picks.map(([ms, name], i) => (
        <Group key={ms} transform={[{ translateX: i * (BOARD.width + 4) }]}>
          {frame(scene, ms, `${seconds(ms)}  ${name}`, i > 0 && i < picks.length - 1)}
        </Group>
      ))}
    </>,
  );
  const stripFile = path.join(OUT, 'throw-strip.png');
  fs.writeFileSync(stripFile, strip);
  console.log(
    `${stripFile}: ${Math.round(strip.length / 1024)} KB; dice ${values.join('-')}, ` +
      `${Math.round(plan.durationMs)} ms, hits at ${plan.hits.map((h) => Math.round(h.atMs)).join(', ')} ms`,
  );
  expect(strip.length).toBeLessThan(MAX_BYTES);

  // The GIF: every second sample (30 fps), then hold the rest pose for 1 s.
  let ffmpeg = true;
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    ffmpeg = false;
  }
  if (!ffmpeg) {
    console.log('ffmpeg not found: no GIF.');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tavli-throw-'));
  const step = plan.sampleMs * 2;
  const times: number[] = [];
  for (let ms = 0; ms < plan.durationMs; ms += step) times.push(ms);
  for (let k = 0; k < 30; k++) times.push(plan.durationMs);
  for (const [i, ms] of times.entries()) {
    const bytes = await png(BOARD.width, frameH, frame(scene, ms, null, false));
    fs.writeFileSync(path.join(tmp, `f${String(i).padStart(4, '0')}.png`), bytes);
  }
  const gifFile = path.join(OUT, 'throw.gif');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      '30',
      '-i',
      path.join(tmp, 'f%04d.png'),
      '-vf',
      `crop=${BOARD.width}:${crop.height}:0:0,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      gifFile,
    ],
    { stdio: 'inherit' },
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  const gifBytes = fs.statSync(gifFile).size;
  console.log(`${gifFile}: ${Math.round(gifBytes / 1024)} KB, ${times.length} frames`);
  expect(gifBytes).toBeLessThan(MAX_BYTES);
});
