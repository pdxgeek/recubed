import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  COLOR_NAME,
  ColorId,
  CubeState,
  SLOTS,
  applyAlg,
  blankState,
  isCenter,
  solvedState,
  vecKey,
} from './src/cube/core';
import { rotationBringing } from './src/cube/orientation';
import { HighlightMode } from './src/cube/pieces';
import {
  Selection,
  partnerSlots as partnerSlotsFor,
  reanchor,
  sameSelection,
  selectAt,
  selectionName as nameOfSelection,
  selectionPair,
  selectionSlots as slotsOfSelection,
  stepForSelection as stepFor,
} from './src/cube/selection';
import {
  Playback,
  atEnd as playbackAtEnd,
  atStart as playbackAtStart,
  back as playbackBack,
  close as playbackClose,
  forward as playbackForward,
  nextMove,
  prevMove,
  restart as playbackRestart,
  selectStep,
} from './src/cube/run';
import {
  PlanMethod,
  PlanStep,
  SolvePlan,
  buildPlan,
  buildShortest,
  cubeKey,
  currentShortest,
  prepareShortest,
  relabelMethod,
  stageProgress,
} from './src/cube/solver/plan';
import { CubeScene } from './src/render/CubeScene';
import { CubeCanvas } from './src/components/CubeCanvas';
import { TopBar, CubeView, Mode } from './src/components/TopBar';
import { CubeNet } from './src/components/CubeNet';
import { PaintPanel } from './src/components/PaintPanel';
import { SolvePanel } from './src/components/SolvePanel';
import { StepBar } from './src/components/StepBar';
import { MoveStrip } from './src/components/MoveStrip';
import { tokens } from './src/ui/theme';

/**
 * Whether the "drag to spin" nudge has already been shown. Module scope, so it
 * survives every mode change and remount for the life of the session - which is
 * the case that matters. It used to be a permanent caption over the canvas.
 */
let canvasNudgeSeen = false;

export default function App() {
  const sceneRef = useRef<CubeScene | null>(null);
  const liveState = useRef<CubeState | null>(null);
  /**
   * The cube the current plan describes, used only to open the first step of a
   * session. Once a session is open, `selectStep` reads the origin out of the
   * session itself, so there is no second cube for this component to get wrong.
   */
  const planOrigin = useRef<CubeState | null>(null);
  const { width, height } = useWindowDimensions();
  // A portrait iPad keeps the bottom sheet: a side panel there would leave the
  // canvas pinched without giving the panel anything useful to do. A landscape
  // window gets the side panel whatever its size - a sheet across the bottom of
  // a short window leaves the cube nowhere to live.
  const wide = width >= 900 || (width > height && width >= 640);
  /** The sheet may never be taller than the window can spare. */
  const sheetMin = Math.min(360, Math.round(height * 0.42));

  /**
   * Bumped every time a new scene is built, so the effects below re-apply the
   * colours, highlights and wireframe to it. A boolean would not do: the canvas
   * can be rebuilt while the flag is already true, leaving the fresh scene
   * blank and ignoring the wireframe.
   */
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const [mode, setMode] = useState<Mode>('paint');
  /** The cube when no step is open. While one is, `playback.live` is the cube. */
  const [resting, setResting] = useState<CubeState>(() => blankState());
  /**
   * The step being stepped through, if any. This is `src/cube/run.ts`'s state,
   * held whole: the app moves it with that module's functions rather than
   * keeping a second copy of the arithmetic.
   */
  const [playback, setPlayback] = useState<Playback | null>(null);
  const state = playback ? playback.live : resting;
  const step = playback?.index ?? 0;
  const [paintColor, setPaintColor] = useState<ColorId | null>('W');
  /** One piece or slot at a time, held by identity rather than by position. */
  const [selection, setSelection] = useState<Selection | null>(null);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('piece');
  const [showPartner, setShowPartner] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(850);
  const [wireframe, setWireframe] = useState(false);
  const [view, setView] = useState<CubeView>('3d');
  const [paintNudge, setPaintNudge] = useState<string | null>(null);

  const [plan, setPlan] = useState<SolvePlan | null>(null);
  const [shortest, setShortest] = useState<PlanMethod | null>(null);
  const [computing, setComputing] = useState(false);

  // -- derived -------------------------------------------------------------

  const pair = useMemo(() => selectionPair(state, selection), [state, selection]);
  const selectionSlots = useMemo(() => slotsOfSelection(state, selection), [state, selection]);
  const partnerSlots = useMemo(
    () => partnerSlotsFor(state, selection, showPartner),
    [state, selection, showPartner]
  );
  const selectedName = useMemo(() => nameOfSelection(state, selection), [state, selection]);
  const stepForSelection = useMemo(() => stepFor(plan, selection), [plan, selection]);
  /** A search result is worth showing only while it still describes this cube. */
  const liveShortest = useMemo(() => currentShortest(shortest, state), [shortest, state]);

  /** Pieces the running step is moving, followed as the cube turns. */
  const runTargetSlots = useMemo(() => {
    if (!playback) return [];
    const homes = new Set(playback.step.targetSlots);
    return SLOTS.filter((s) => homes.has(state.home[s.index])).map((s) => s.index);
  }, [playback, state]);

  /** Everything worth keeping solid when the cube is stripped to a wireframe. */
  const focusSlots = useMemo(
    () => [...runTargetSlots, ...selectionSlots, ...partnerSlots],
    [runTargetSlots, selectionSlots, partnerSlots]
  );

  const targetKeys = useMemo(() => focusSlots.map((i) => vecKey(SLOTS[i].pos)), [focusSlots]);

  /** Where the running step sits in the method's stages, for the transport bar. */
  const runStage = useMemo(
    () => stageProgress(plan, playback?.step.id ?? null),
    [plan, playback]
  );

  // -- scene sync ----------------------------------------------------------

  const onSceneReady = useCallback((scene: CubeScene) => {
    sceneRef.current = scene;
    setSceneEpoch((n) => n + 1);
  }, []);

  useEffect(() => {
    liveState.current = state;
    sceneRef.current?.setColors(state);
  }, [state, sceneEpoch]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setTargets(targetKeys);
    scene.setWireframe(wireframe);
    // A piece the user has picked stays lit even while a step is playing.
    scene.setHighlights({
      selected: selectionSlots,
      partner: partnerSlots,
      target: runTargetSlots,
    });
  }, [targetKeys, wireframe, selectionSlots, partnerSlots, runTargetSlots, sceneEpoch]);

  /**
   * Work out what is left to do whenever the cube settles. Guarded on the cube
   * itself rather than on the state object, so a re-render that hands over an
   * equal cube does not pay for a fresh solve.
   */
  const planKey = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'solve' || playback) {
      planKey.current = null;
      return;
    }
    const key = cubeKey(state);
    planOrigin.current = state;
    if (planKey.current === key) return;
    planKey.current = key;
    setPlan(buildPlan(state));
  }, [mode, state, playback]);

  /**
   * A screen-reader user gets the net by default: the 3D view is a gesture
   * surface with nothing in the accessibility tree, so on that path it is not a
   * view of the cube at all. Both views stay available to everyone.
   *
   * Native only. The web platform cannot detect a screen reader, and
   * react-native-web's `isScreenReaderEnabled` answers `true` unconditionally -
   * so honouring it there would put every browser visitor in the net view. On
   * web the Net tab is one labelled stop away instead.
   */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (!cancelled && on) setView('net');
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
      if (on) setView('net');
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // -- the one-shot canvas nudge -------------------------------------------

  const [nudgeVisible, setNudgeVisible] = useState(!canvasNudgeSeen);
  const nudgeOpacity = useRef(new Animated.Value(canvasNudgeSeen ? 0 : 1)).current;
  useEffect(() => {
    if (!nudgeVisible) return;
    const id = setTimeout(() => {
      canvasNudgeSeen = true;
      Animated.timing(nudgeOpacity, {
        toValue: 0,
        duration: tokens.motion.slow,
        useNativeDriver: true,
      }).start(() => setNudgeVisible(false));
    }, tokens.motion.nudgeHold);
    return () => clearTimeout(id);
  }, [nudgeVisible, nudgeOpacity]);

  // Paint-mode nudges say their piece and then get out of the way.
  useEffect(() => {
    if (!paintNudge) return;
    const id = setTimeout(() => setPaintNudge(null), tokens.motion.toastHold);
    return () => clearTimeout(id);
  }, [paintNudge]);

  // -- interaction ---------------------------------------------------------

  const onPickSticker = useCallback(
    (slot: number | null) => {
      if (slot === null) {
        if (mode === 'solve') setSelection(null);
        return;
      }
      const pos = SLOTS[slot].pos;
      if (isCenter(pos)) {
        // The one rule about centres, said at the moment it is needed rather
        // than printed permanently above the colour picker.
        if (mode === 'paint') setPaintNudge('Centres never move — they set the colour scheme.');
        return;
      }
      if (mode === 'paint') {
        setResting((s) => {
          const colors = s.colors.slice();
          colors[slot] = paintColor;
          return { ...s, colors };
        });
        return;
      }
      // Always the whole piece, never a single sticker, and only one at a time.
      setSelection((prev) => {
        const next = selectAt(liveState.current ?? state, pos, highlightMode);
        return sameSelection(prev, next) ? null : next;
      });
    },
    [mode, paintColor, highlightMode, state]
  );

  const onHighlightMode = useCallback(
    (m: HighlightMode) => {
      setHighlightMode(m);
      // Keep the ring where it is on screen and read it the other way round.
      setSelection((prev) => (prev ? reanchor(liveState.current ?? state, prev, m) : prev));
    },
    [state]
  );

  /**
   * Once a drag settles, re-label the cube so the face at the bottom of the
   * screen really is D. The colours are permuted and the view is counter-turned
   * in the same tick, so nothing appears to move - but from here on the solver
   * and the move notation talk about the cube the way the user is holding it.
   *
   * The selection needs no help here: it is held by colour, and colours do not
   * care what the faces are called.
   */
  const anchorToView = useCallback(() => {
    const scene = sceneRef.current;
    const current = liveState.current;
    if (!scene || !current || playback) return;
    const { down, front } = scene.viewFaces();
    const rot = rotationBringing(down, front);
    if (!rot || rot.alg === '') return;

    const next = applyAlg(current, rot.alg);
    liveState.current = next;
    scene.setColors(next);
    scene.absorbRotation(rot);
    setResting(next);
    // The cube has not changed, only its labels - so the search result is
    // rewritten for the new labels, and re-stamped with the re-labelled cube so
    // it still matches. Anything that changes the cube for real fails the stamp.
    setShortest((prev) => (prev ? relabelMethod(prev, rot, next) : prev));
  }, [playback]);

  const restoreBase = useCallback(() => {
    sceneRef.current?.cancelMove();
    setPlaying(false);
    setPlayback((p) => (p ? playbackRestart(p) : p));
  }, []);

  const startStep = useCallback((st: PlanStep) => {
    sceneRef.current?.cancelMove();
    setPlaying(false);
    // `selectStep` reads the origin out of the session when there is one, so a
    // second step picked mid-run is measured from the cube the plan describes -
    // not from wherever the first step left off, which stacked two preludes.
    setPlayback((p) => selectStep(p, p?.origin ?? planOrigin.current ?? state, st));
  }, [state]);

  const closeRun = useCallback(() => {
    sceneRef.current?.cancelMove();
    setPlaying(false);
    setPlayback((p) => {
      if (!p) return null;
      const kept = playbackClose(p);
      setResting(kept);
      // The cube left behind is what the next plan - and so the next step's
      // prelude - is measured from.
      planOrigin.current = kept;
      return null;
    });
  }, []);

  const stepForward = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || !playback || scene.isAnimating) return;
    const mv = nextMove(playback);
    if (!mv) {
      setPlaying(false);
      return;
    }
    scene.playMove(mv, speedMs, () => setPlayback((p) => (p ? playbackForward(p) : p)));
  }, [playback, speedMs]);

  const stepBack = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || !playback || scene.isAnimating) return;
    const mv = prevMove(playback);
    if (!mv) return;
    setPlaying(false);
    scene.playMove(mv, speedMs, () => setPlayback((p) => (p ? playbackBack(p) : p)));
  }, [playback, speedMs]);

  useEffect(() => {
    if (!playing || !playback) return;
    if (playbackAtEnd(playback)) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(stepForward, 140);
    return () => clearTimeout(id);
  }, [playing, playback, stepForward]);

  const onPlayPause = useCallback(() => {
    if (!playback) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (playbackAtEnd(playback)) restoreBase();
    setPlaying(true);
  }, [playback, playing, restoreBase]);

  const onModeChange = useCallback(
    (m: Mode) => {
      if (m === mode) return;
      closeRun();
      setSelection(null);
      setMode(m);
    },
    [mode, closeRun]
  );

  const setCubeState = useCallback((next: CubeState) => {
    sceneRef.current?.cancelMove();
    setPlayback(null);
    setPlaying(false);
    setSelection(null);
    planOrigin.current = next;
    setResting(next);
  }, []);

  const scramble = useCallback(() => {
    const faces = ['U', 'D', 'R', 'L', 'F', 'B'];
    const suffix = ['', "'", '2'];
    const moves: string[] = [];
    let last = '';
    while (moves.length < 25) {
      const f = faces[Math.floor(Math.random() * 6)];
      if (f === last) continue;
      last = f;
      moves.push(f + suffix[Math.floor(Math.random() * 3)]);
    }
    setCubeState(applyAlg(solvedState(), moves.join(' ')));
  }, [setCubeState]);

  const computeShortest = useCallback(() => {
    setComputing(true);
    // Two ticks, not one. Building the tables is about a second on its own, so
    // it gets its own frame and the search gets another - otherwise the spinner
    // never paints and the whole thing looks like a hang.
    setTimeout(() => {
      prepareShortest();
      setTimeout(() => {
        setShortest(buildShortest(liveState.current ?? state));
        setComputing(false);
      }, 16);
    }, 32);
  }, [state]);

  // -- panels --------------------------------------------------------------

  const panel =
    mode === 'paint' ? (
      <PaintPanel
        state={state}
        active={paintColor}
        onActive={setPaintColor}
        onFillSolved={() => setCubeState(solvedState())}
        onScramble={scramble}
        onClear={() => setCubeState(blankState())}
        onSolveThis={() => onModeChange('solve')}
        nudge={paintNudge}
      />
    ) : (
      <SolvePanel
        plan={plan ?? { ok: true, solved: false, methods: [] }}
        shortest={liveShortest}
        computing={computing}
        onComputeShortest={computeShortest}
        activeStepId={playback?.step.id ?? null}
        running={!!playback}
        onSelectStep={startStep}
        onGoPaint={() => onModeChange('paint')}
        highlightMode={highlightMode}
        onHighlightMode={onHighlightMode}
        showPartner={showPartner}
        onShowPartner={setShowPartner}
        selectedName={selectedName}
        pair={pair}
        stepForSelection={stepForSelection}
        onClearSelection={() => setSelection(null)}
      />
    );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <TopBar
        mode={mode}
        onMode={onModeChange}
        view={view}
        onView={setView}
        wireframe={wireframe}
        onWireframe={setWireframe}
        onResetView={() => sceneRef.current?.resetOrientation()}
      />
      <View style={[styles.body, wide ? styles.bodyRow : styles.bodyCol]}>
        <View style={[styles.canvasWrap, playback && styles.canvasWrapRunning]}>
          {/* The GL surface stays mounted while the net is showing: unmounting
              it tears the scene down (as it must on a real unmount), and every
              toggle would then pay for a full rebuild. */}
          <View style={view === 'net' ? styles.hidden : styles.fill}>
            <CubeCanvas
              onReady={onSceneReady}
              onPickSticker={onPickSticker}
              onGestureEnd={anchorToView}
            />
          </View>
          {view === 'net' && (
            <CubeNet
              state={state}
              mode={mode}
              paintColor={paintColor ? COLOR_NAME[paintColor] : null}
              onPickSticker={onPickSticker}
              selectedSlots={selectionSlots}
              partnerSlots={partnerSlots}
              movingSlots={runTargetSlots}
              status={
                mode === 'paint'
                  ? `${state.colors.filter((c) => c !== null).length - 6} of 48 painted`
                  : (selectedName ?? 'Nothing selected')
              }
            />
          )}
          {nudgeVisible && !playback && view === '3d' && (
            <Animated.View
              style={[styles.overlay, { opacity: nudgeOpacity }]}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.overlayText}>
                {mode === 'paint' ? 'Drag to spin' : 'Tap a piece'}
              </Text>
            </Animated.View>
          )}
          {playback && (
            <MoveStrip
              title={playback.step.title}
              moves={playback.step.moves}
              step={step}
              wireframe={wireframe}
              onWireframe={setWireframe}
            />
          )}
        </View>
        <View
          style={[
            styles.panel,
            wide
              ? [styles.panelSide, { width: Math.min(400, Math.max(300, width * 0.38)) }]
              : [
                  styles.panelBottom,
                  playback
                    ? { minHeight: Math.min(200, sheetMin), maxHeight: '38%' as const }
                    : { minHeight: sheetMin },
                ],
          ]}
        >
          {panel}
        </View>
      </View>
      {playback && (
        <StepBar
          atStart={playbackAtStart(playback)}
          atEnd={playbackAtEnd(playback)}
          playing={playing}
          speedMs={speedMs}
          stage={runStage}
          onPrev={stepBack}
          onNext={() => {
            setPlaying(false);
            stepForward();
          }}
          onPlayPause={onPlayPause}
          onRestart={restoreBase}
          onSpeed={setSpeedMs}
          closeLabel={playback.commit ? 'Keep' : 'Undo'}
          onClose={closeRun}
        />
      )}
    </SafeAreaView>
  );
}

const { surface, line, text, space, radius } = tokens;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.canvas },
  body: { flex: 1 },
  bodyRow: { flexDirection: 'row' },
  bodyCol: { flexDirection: 'column' },
  fill: { flex: 1 },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999 },
  canvasWrap: { flex: 1 },
  // Room for the MoveStrip, so the cube is fitted above it rather than drawn
  // behind it. Without this the strip's scrim hides the whole bottom layer -
  // during playback, which is exactly when it matters.
  canvasWrapRunning: { paddingBottom: 108 },
  overlay: { position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center' },
  overlayText: {
    ...tokens.type.caption,
    color: text.secondary,
    backgroundColor: surface.scrim,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  panel: { backgroundColor: surface.base },
  panelSide: {
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: line.hairline,
  },
  panelBottom: {
    maxHeight: '56%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: line.hairline,
  },
});
