/**
 * One algorithm, on its own page.
 *
 *   "Maybe the algorithms are a library and they open a separate view… where
 *    you can show the purpose of the algorithm at the top, and show the moves
 *    of it on a full screen"
 *   "Imagine if we had that on a page with a cube we could wireframe and
 *    animate."
 *   "then in the solving part, we just show the name, and if they click the
 *    name we can open the 'teaching' page. Separate teaching from solving"
 *
 * Top to bottom: the NAME, the PURPOSE, a live CUBE that starts in the case
 * position and plays the algorithm with the X-ray on, the FILMSTRIP of glyphs
 * with the playhead, and the letters ONCE at the bottom. The solve screen says
 * where you are; this says what the thing is. Nothing appears on both.
 *
 * ── THE GL SURFACE. Read this before adding a `GLView` here. ────────────────
 *
 * **There is exactly one GL surface in this app and this page does not create
 * a second one.** `src/render/loop.ts` keeps a module-level `presenting` slot,
 * and `start()` calls `presenting.stop()` on whichever loop holds it - and
 * `stop()` calls `scene.dispose()`. So a second `CubeCanvas` mounted while the
 * solve screen's canvas is alive does not merely compete with it: it *destroys*
 * its scene, permanently. `CubeCanvas` only builds a scene inside
 * `onContextCreate`, which fires once per GL context, so nothing rebuilds it
 * when this page closes. The solve screen would come back black.
 *
 * Nor can this page simply mount the canvas after the solve screen unmounts
 * its own: that costs a fresh GL context and scene on every open and close,
 * loses the orientation the learner spun the cube to, and flashes.
 *
 * So the page **borrows** the surface instead of owning one. `renderCube` is a
 * slot: the host draws the app's single `CubeCanvas` into it, or positions it
 * over the rectangle this page reports through `onCubeFrame`. Everything the
 * page wants of the cube - which cube, which pieces lit, X-ray on - is scene
 * *state*, which is why borrowing works at all: `setColors`, `setHighlights`,
 * `setTargets` and `setWireframe` are the whole interface, and re-pointing them
 * is free.
 *
 * With no `renderCube` the page draws `StaticCube` below instead, which is also
 * the reduce-motion and screen-reader path. The page is fully usable that way -
 * see `usableWithoutMotion` in the props.
 * ────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlgorithmCase } from '../cube/cases';
import { CubeState, Move, applyAlg, movedSlots } from '../cube/core';
import { Filmstrip } from './Filmstrip';
import { StaticCube } from './StaticCube';
import {
  DEFAULT_SPEED,
  MoveGlyphProps,
  PROSE_MAX_W,
  SPEEDS,
  STRIP_GUTTER,
  TEACH_HEADER_H,
  WIREFRAME_DEFAULT,
  advance,
  castSlots,
  filmContentWidth,
  laneChunks,
  playheadLabel,
  restart,
  rewind,
  scrubKind,
  scrubTo,
  spokenSequence,
  teachRegions,
} from '../ui/teaching';
import { tokens } from '../ui/theme';

/** Everything the page wants painted on the one cube. */
export interface TeachingCubeView {
  /** The cube as it stands at the playhead. */
  state: CubeState;
  /** Slots the algorithm's cast currently occupies. Ringed cyan. */
  cast: number[];
  /** Slots the CURRENT move turns. Ringed amber, and it changes with the playhead. */
  turning: number[];
  /** X-ray. On by default - see `WIREFRAME_DEFAULT`. */
  wireframe: boolean;
  /** The move about to be played, or null when the run is finished. */
  move: Move | null;
  /** Milliseconds a move should take. 0 under reduce-motion: the cube cuts. */
  speedMs: number;
  /** The band's height, so the host can size a borrowed canvas. */
  height: number;
}

export interface TeachingPageProps {
  /** The algorithm as a case: position, travels, triggers. `src/cube/cases.ts`. */
  algorithmCase: AlgorithmCase;
  onClose: () => void;
  /** Opens the library. Hidden when absent, and below 360pt of width. */
  onOpenLibrary?: () => void;
  /**
   * Draws the app's single GL surface into the cube band. See the note above:
   * this page must never mount its own. With no renderer it draws `StaticCube`.
   */
  renderCube?: (view: TeachingCubeView) => React.ReactNode;
  /** The cube band's rectangle, for a host that positions the canvas over it. */
  onCubeFrame?: (rect: { x: number; y: number; width: number; height: number }) => void;
  /**
   * The situation this applies to: one sentence about the CUBE, not about the
   * algorithm. `AlgorithmDef.when` does not exist yet - see the follow-up - so
   * the line is omitted rather than guessed. A wrong case teaches a wrong case.
   */
  when?: string;
  /** Pieces to watch, the cyan legend under the cube. `piecesToWatch(step)`. */
  watching?: string[];
  /** The step's own footnote lines, when opened from a step. */
  footnote?: string[];
  /** Practise mode: moves at or past here are covered in the strip too. */
  hiddenFrom?: number | null;
  /** Masks move runs in the prose while a step is being practised. */
  veil?: (text: string) => string;
  /** Forces the static, motionless path. Tests and hosts that already know. */
  reduceMotion?: boolean;
  /** A screen reader is running: auto-play never starts. */
  screenReader?: boolean;
  /** SWAP: the real `MoveGlyph`. See `MoveGlyphStub.tsx`. */
  MoveGlyph?: React.ComponentType<MoveGlyphProps>;
}

const { surface, line, text, accent, status, cube, space, radius, type, hit } = tokens;

export function TeachingPage({
  algorithmCase: c,
  onClose,
  onOpenLibrary,
  renderCube,
  onCubeFrame,
  when,
  watching = [],
  footnote = [],
  hiddenFrom = null,
  veil = (t) => t,
  reduceMotion: forcedReduceMotion,
  screenReader = false,
  MoveGlyph,
}: TeachingPageProps) {
  const [size, setSize] = useState({ width: 375, height: 812 });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [xray, setXray] = useState(WIREFRAME_DEFAULT);
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  const reduceMotion = forcedReduceMotion ?? systemReduceMotion;
  const moves = c.moves;
  const count = moves.length;

  // The same channel App.tsx already uses for `screenReaderChanged`.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((on) => {
      if (alive) setSystemReduceMotion(!!on);
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (on) =>
      setSystemReduceMotion(!!on)
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  /**
   * Android's system back must close the page, not the app.
   *
   * A full-screen push loses the scrim-tap-to-dismiss a sheet had. `‹ Back` is
   * the replacement and it is where a back control belongs - but without this
   * listener, Android's back button exits the app from here, which is a much
   * worse failure than losing a scrim.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  /**
   * Plays once, then holds. It does not loop.
   *
   * WCAG 2.2.2: a 21-move algorithm at 1400ms is 29 seconds of motion, and the
   * transport is the mechanism that stops it. A loop would mean motion beside
   * prose for as long as the page is open, would erase the solved ending the
   * learner is meant to look at, and would compete with the paragraph below.
   *
   * With reduce-motion on, or a screen reader running, it never starts: an
   * animation nobody can see, generating a live-region announcement every
   * 1400ms, is actively hostile.
   */
  const autoplayed = useRef(false);
  useEffect(() => {
    if (autoplayed.current || reduceMotion || screenReader || count === 0) return;
    autoplayed.current = true;
    setPlaying(true);
  }, [reduceMotion, screenReader, count]);

  useEffect(() => {
    if (!playing) return;
    if (index >= count) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => advance({ index: i, playing: true }, count).index), SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [playing, index, count, speed]);

  // The cube at the playhead. A jump is `applyAlg` over at most 21 moves,
  // which is free - and it avoids a rewind animation that would have to play
  // twenty-one moves backwards to be honest.
  const live = useMemo(() => applyAlg(c.caseState, moves.slice(0, index)), [c, moves, index]);
  const cast = useMemo(() => castSlots(live, c.summary ? castHomes(c) : []), [live, c]);
  const turning = useMemo(
    () => (index < count ? movedSlots(moves[index]) : []),
    [moves, index, count]
  );
  const chunks = useMemo(() => laneChunks(c.triggers), [c]);

  const regions = useMemo(() => teachRegions(size.width, size.height), [size]);
  const stripWidth = regions.wide ? size.width : size.width;

  const onScrub = useCallback(
    (i: number) => {
      setPlaying(false);
      setIndex(scrubTo(i, count));
    },
    [count]
  );

  const cubeView: TeachingCubeView = {
    state: live,
    cast,
    turning,
    wireframe: xray,
    move: index < count ? moves[index] : null,
    speedMs: reduceMotion ? 0 : SPEEDS[speed].ms,
    height: regions.cube,
  };

  const onBandLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      onCubeFrame?.({ x, y, width, height });
    },
    [onCubeFrame]
  );

  const prose = (
    <View style={styles.prose}>
      {/* One word that does a heading's job and says which family this belongs
          to, so the page never opens with an unlabelled paragraph. */}
      <Text style={styles.overline}>{c.category.toUpperCase()}</Text>
      {when ? <Text style={styles.when}>{veil(when)}</Text> : null}

      {c.note ? (
        <>
          <Text style={[styles.overline, styles.spaced]}>WHAT IT DOES</Text>
          {/* Unbounded lines. This is the paragraph the user asked to have room
              to read, and it gets a page instead of six points of gap. */}
          <Text style={styles.note}>{veil(c.note)}</Text>
        </>
      ) : null}

      {watching.length > 0 ? (
        // Also the legend for the cube above: the cyan rings up there are
        // exactly these pieces, so the eye goes dot, then cube.
        <View style={styles.watchRow}>
          <View style={styles.watchDot} />
          <Text style={styles.watch}>{watching.join('  ·  ')}</Text>
        </View>
      ) : null}

      {footnote.map((linetext, i) => (
        <Text key={i} style={styles.footnote}>
          {linetext}
        </Text>
      ))}
    </View>
  );

  const strip = (
    <View style={styles.stripBlock}>
      <View style={styles.rule} />
      <Text style={styles.overline}>THE MOVES</Text>
      <Filmstrip
        moves={moves}
        index={index}
        onScrub={onScrub}
        chunks={chunks}
        contentWidth={filmContentWidth(stripWidth)}
        hiddenFrom={hiddenFrom}
        reduceMotion={reduceMotion}
        MoveGlyph={MoveGlyph}
      />

      {/* The letters, once, at the bottom of a page you chose to open - not in
          the path of someone learning. Selectable, because copying it to a
          timer or a forum post is the whole reason it is here. */}
      <Text style={[styles.overline, styles.spaced]}>IN STANDARD NOTATION</Text>
      <Text
        style={styles.mono}
        selectable
        accessibilityLabel={spokenSequence(c.notation)}
      >
        {c.notation.join(' ')}
      </Text>
    </View>
  );

  return (
    <View
      style={styles.page}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ width: Math.max(1, width), height: Math.max(1, height) });
      }}
    >
      {/* ── header, fixed, never scrolls ─────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back to the solve"
        >
          <Text style={styles.backText} maxFontSizeMultiplier={1.4}>
            ‹ Back
          </Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {c.name}
        </Text>
        {onOpenLibrary && size.width >= 360 ? (
          <Pressable
            onPress={onOpenLibrary}
            style={styles.libraryLink}
            accessibilityRole="button"
            accessibilityLabel="All algorithms"
            accessibilityHint="Opens the list of everything this solve teaches"
          >
            <Text style={styles.libraryText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              All algorithms ›
            </Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
      </View>

      <View style={regions.wide ? styles.wideBody : undefined}>
        {/* ── the cube: pinned, never scrolls ────────────────────────────── */}
        <View
          style={[
            styles.band,
            { height: regions.cube, width: regions.wide ? regions.cubeColumn : undefined },
          ]}
          onLayout={onBandLayout}
        >
          {renderCube ? (
            renderCube(cubeView)
          ) : (
            <StaticCube state={live} cast={cast} width={size.width} height={regions.cube} />
          )}

          <Transport
            index={index}
            count={count}
            playing={playing}
            reduceMotion={reduceMotion}
            speed={speed}
            xray={xray}
            onPlay={() => setPlaying((p) => !p)}
            onStep={(d) => {
              setPlaying(false);
              setIndex((i) =>
                d > 0 ? advance({ index: i, playing: false }, count).index : rewind({ index: i, playing: false }, count).index
              );
            }}
            onRestart={() => {
              setPlaying(false);
              setIndex((i) => restart({ index: i, playing: false }).index);
            }}
            onSpeed={() => setSpeed((s) => (s + 1) % SPEEDS.length)}
            onXray={() => setXray((x) => !x)}
          />
        </View>

        {/* ── everything else scrolls ────────────────────────────────────── */}
        <ScrollView
          style={regions.wide ? { width: regions.textColumn } : undefined}
          contentContainerStyle={styles.scrollBody}
          showsVerticalScrollIndicator={false}
        >
          {/* THE page's one live region. The strip's is off, so the playhead is
              announced once per move rather than by twenty-one tiles at once. */}
          <Text style={styles.playhead} accessibilityLiveRegion="polite">
            {playheadLabel(c.notation, index)}
          </Text>
          {prose}
          {regions.wide ? null : strip}
        </ScrollView>
      </View>

      {/* Wide: the filmstrip spans both columns underneath, at the full eight
          across. This is the reference photograph, on the one device that can
          afford it. */}
      {regions.wide ? (
        <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          {strip}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** The slots the cast starts in: every piece the algorithm displaces. */
function castHomes(c: AlgorithmCase): number[] {
  const out = new Set<number>();
  for (const t of c.travels) {
    for (const s of t.fromSlots) out.add(s);
    for (const s of t.toSlots) out.add(s);
  }
  return [...out];
}

/* ── the transport ───────────────────────────────────────────────────────── */

/**
 * Five controls on a scrim over the cube's bottom edge, so they cost the band
 * no height at all. The glyphs are `StepBar`'s, verbatim: a learner who has
 * used the solve screen already knows them.
 */
function Transport(props: {
  index: number;
  count: number;
  playing: boolean;
  reduceMotion: boolean;
  speed: number;
  xray: boolean;
  onPlay: () => void;
  onStep: (d: number) => void;
  onRestart: () => void;
  onSpeed: () => void;
  onXray: () => void;
}) {
  const { index, count, playing, reduceMotion, speed, xray } = props;
  return (
    <View style={styles.transport}>
      <Button label="↺" hint="Restart from the case" onPress={props.onRestart} />
      <Button
        label="‹"
        hint="Previous move"
        onPress={() => props.onStep(-1)}
        disabled={index === 0}
      />
      {/* Hidden under reduce-motion: auto-advance is precisely the thing being
          opted out of, and `‹` / `›` still walk the whole algorithm. */}
      {!reduceMotion && (
        <Button
          label={playing ? '❚❚' : '▶'}
          hint={playing ? 'Pause' : 'Play'}
          onPress={props.onPlay}
        />
      )}
      <Button
        label="›"
        hint="Next move"
        onPress={() => props.onStep(1)}
        disabled={index >= count}
      />
      {!reduceMotion && (
        <Button label={SPEEDS[speed].label} hint={`Speed: ${SPEEDS[speed].label}`} onPress={props.onSpeed} wide />
      )}
      <Pressable
        onPress={props.onXray}
        style={[styles.xray, xray && styles.xrayOn]}
        accessibilityRole="switch"
        accessibilityState={{ checked: xray }}
        aria-checked={xray}
        accessibilityLabel="X-ray view"
        accessibilityHint="Shows the pieces this algorithm moves through the cube"
      >
        <Text style={[styles.xrayText, xray && styles.xrayTextOn]} maxFontSizeMultiplier={1.4}>
          x-ray
        </Text>
      </Pressable>
    </View>
  );
}

function Button({
  label,
  hint,
  onPress,
  disabled,
  wide,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.tbtn, wide && styles.tbtnWide, disabled && styles.tbtnOff]}
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text
        style={[styles.tbtnText, disabled && styles.tbtnTextOff]}
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: surface.base },

  header: {
    height: TEACH_HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: line.hairline,
  },
  back: { minWidth: 72, minHeight: hit.min, justifyContent: 'center' },
  backText: { ...type.heading, color: accent.base },
  title: { ...type.title, color: text.primary, flex: 1, textAlign: 'center' },
  libraryLink: { minWidth: 72, minHeight: hit.min, justifyContent: 'center', alignItems: 'flex-end' },
  libraryText: { ...type.overline, color: accent.base },

  wideBody: { flexDirection: 'row', flex: 1 },
  band: { backgroundColor: surface.canvas, justifyContent: 'center' },

  // A heads-up row on the cube's bottom edge: it costs the band no height, the
  // same trick the strip and the stage rail already use.
  transport: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.gutter,
    paddingVertical: space.xs,
    backgroundColor: surface.scrim,
  },
  tbtn: {
    minWidth: hit.min,
    minHeight: hit.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  tbtnWide: { paddingHorizontal: space.sm },
  tbtnOff: { opacity: 0.4 },
  tbtnText: { ...type.heading, color: text.primary },
  tbtnTextOff: { color: text.disabled },
  xray: {
    marginLeft: 'auto',
    minHeight: hit.min,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: line.outline,
  },
  xrayOn: { borderColor: accent.base, borderWidth: 2, backgroundColor: accent.soft },
  xrayText: { ...type.overline, color: text.secondary },
  xrayTextOn: { color: text.primary },

  scrollBody: { paddingHorizontal: space.gutter, paddingBottom: space.xxl, gap: space.sm },
  playhead: { ...type.caption, color: text.secondary, marginTop: space.sm },

  // 520pt everywhere: at 15pt that averages about 72 characters, inside the
  // 45-75 band. The sheet this page replaces set 145 characters at 1024 wide.
  prose: { maxWidth: PROSE_MAX_W, alignSelf: 'center', width: '100%', gap: space.xs },
  overline: { ...type.overline, color: text.tertiary, marginTop: space.md },
  spaced: { marginTop: space.lg },
  when: { ...type.body, color: text.primary },
  note: { ...type.caption, color: text.secondary },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, flexWrap: 'wrap' },
  watchDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: cube.moving },
  watch: { ...type.caption, color: text.secondary, flexShrink: 1 },
  footnote: { ...type.caption, color: text.tertiary, marginTop: space.sm },

  stripBlock: { maxWidth: PROSE_MAX_W * 2, width: '100%', gap: space.xs },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: line.hairline, marginTop: space.lg },
  mono: { ...type.mono, color: text.secondary },
  solved: { ...type.caption, color: status.ok },
});

export { STRIP_GUTTER };
