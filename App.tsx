import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  ColorId,
  CubeState,
  Move,
  SLOTS,
  applyAlg,
  applyMove,
  blankState,
  cloneState,
  invertMove,
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
import { stepStartState } from './src/cube/run';
import {
  PlanMethod,
  PlanStep,
  SolvePlan,
  buildPlan,
  buildShortest,
  prepareShortest,
  relabelMethod,
} from './src/cube/solver/plan';
import { CubeScene } from './src/render/CubeScene';
import { CubeCanvas } from './src/components/CubeCanvas';
import { TopBar, Mode } from './src/components/TopBar';
import { PaintPanel } from './src/components/PaintPanel';
import { SolvePanel } from './src/components/SolvePanel';
import { StepBar } from './src/components/StepBar';
import { MoveStrip } from './src/components/MoveStrip';
import { tokens } from './src/ui/theme';

interface ActiveRun {
  id: string;
  title: string;
  moves: Move[];
  targetSlots: number[];
  /** Solve steps leave the cube where they finish; library previews undo. */
  commitOnClose: boolean;
}

/**
 * Whether the "drag to spin" nudge has already been shown. Module scope, so it
 * survives every mode change and remount for the life of the session - which is
 * the case that matters. It used to be a permanent caption over the canvas.
 */
let canvasNudgeSeen = false;

export default function App() {
  const sceneRef = useRef<CubeScene | null>(null);
  const baseState = useRef<CubeState | null>(null);
  const liveState = useRef<CubeState | null>(null);
  /**
   * The cube the current plan describes. Step preludes are absolute, measured
   * from here - not from wherever the last step happened to leave the cube.
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
  const [state, setState] = useState<CubeState>(() => blankState());
  const [paintColor, setPaintColor] = useState<ColorId | null>('W');
  /** One piece or slot at a time, held by identity rather than by position. */
  const [selection, setSelection] = useState<Selection | null>(null);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('piece');
  const [showPartner, setShowPartner] = useState(true);
  const [run, setRun] = useState<ActiveRun | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(850);
  const [wireframe, setWireframe] = useState(false);
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

  /** Pieces the running step is moving, followed as the cube turns. */
  const runTargetSlots = useMemo(() => {
    if (!run) return [];
    const homes = new Set(run.targetSlots);
    return SLOTS.filter((s) => homes.has(state.home[s.index])).map((s) => s.index);
  }, [run, state]);

  /** Everything worth keeping solid when the cube is stripped to a wireframe. */
  const focusSlots = useMemo(
    () => [...runTargetSlots, ...selectionSlots, ...partnerSlots],
    [runTargetSlots, selectionSlots, partnerSlots]
  );

  const targetKeys = useMemo(() => focusSlots.map((i) => vecKey(SLOTS[i].pos)), [focusSlots]);

  /** Where the running step sits in its method, for the transport bar. */
  const runPosition = useMemo(() => {
    if (!run || !plan?.ok) return null;
    for (const method of plan.methods) {
      const i = method.steps.findIndex((s) => s.id === run.id);
      if (i >= 0) return `Step ${i + 1} of ${method.steps.length}`;
    }
    return null;
  }, [run, plan]);

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

  // Work out what is left to do whenever the cube settles.
  useEffect(() => {
    if (mode !== 'solve' || run) return;
    planOrigin.current = state;
    setPlan(buildPlan(state));
  }, [mode, state, run]);

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
        setState((s) => {
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
    if (!scene || !current || run) return;
    const { down, front } = scene.viewFaces();
    const rot = rotationBringing(down, front);
    if (!rot || rot.alg === '') return;

    const next = applyAlg(current, rot.alg);
    liveState.current = next;
    scene.setColors(next);
    scene.absorbRotation(rot);
    setState(next);
    // The cube has not changed, only its labels - so the search result is
    // rewritten for the new labels rather than discarded.
    setShortest((prev) => (prev ? relabelMethod(prev, rot) : prev));
  }, [run]);

  const restoreBase = useCallback(() => {
    sceneRef.current?.cancelMove();
    if (baseState.current) setState(cloneState(baseState.current));
    setStep(0);
    setPlaying(false);
  }, []);

  const startRun = useCallback((next: ActiveRun, base: CubeState) => {
    sceneRef.current?.cancelMove();
    setPlaying(false);
    baseState.current = base;
    liveState.current = base;
    setState(cloneState(base));
    setStep(0);
    setRun(next);
  }, []);

  const closeRun = useCallback(() => {
    if (!run?.commitOnClose) restoreBase();
    else {
      sceneRef.current?.cancelMove();
      setPlaying(false);
      setStep(0);
      baseState.current = state;
      // The finished cube is what the next plan - and the next prelude - are
      // measured from.
      planOrigin.current = state;
    }
    setRun(null);
  }, [run, restoreBase, state]);

  const stepForward = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || !run || scene.isAnimating) return;
    const mv = run.moves[step];
    if (!mv) {
      setPlaying(false);
      return;
    }
    scene.playMove(mv, speedMs, () => {
      setState((s) => applyMove(s, mv));
      setStep((i) => i + 1);
    });
  }, [run, step, speedMs]);

  const stepBack = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene || !run || scene.isAnimating || step === 0) return;
    const mv = invertMove(run.moves[step - 1]);
    setPlaying(false);
    scene.playMove(mv, speedMs, () => {
      setState((s) => applyMove(s, mv));
      setStep((i) => i - 1);
    });
  }, [run, step, speedMs]);

  useEffect(() => {
    if (!playing || !run) return;
    if (step >= run.moves.length) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(stepForward, 140);
    return () => clearTimeout(id);
  }, [playing, step, run, stepForward]);

  const onPlayPause = useCallback(() => {
    if (!run) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (step >= run.moves.length) restoreBase();
    setPlaying(true);
  }, [run, playing, step, restoreBase]);

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
    setRun(null);
    setPlaying(false);
    setStep(0);
    setShortest(null);
    setSelection(null);
    baseState.current = next;
    planOrigin.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (!run) baseState.current = state;
  }, [state, run]);

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

  const startStep = useCallback(
    (st: PlanStep) => {
      const origin = planOrigin.current ?? state;
      startRun(
        {
          id: st.id,
          title: st.title,
          moves: st.moves,
          targetSlots: st.targetSlots,
          commitOnClose: true,
        },
        stepStartState(origin, st)
      );
    },
    [startRun, state]
  );

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
        shortest={shortest}
        computing={computing}
        onComputeShortest={computeShortest}
        activeStepId={run?.id ?? null}
        running={!!run}
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
        wireframe={wireframe}
        onWireframe={setWireframe}
        onResetView={() => sceneRef.current?.resetOrientation()}
      />
      <View style={[styles.body, wide ? styles.bodyRow : styles.bodyCol]}>
        <View style={styles.canvasWrap}>
          <CubeCanvas
            onReady={onSceneReady}
            onPickSticker={onPickSticker}
            onGestureEnd={anchorToView}
          />
          {nudgeVisible && !run && (
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
          {run && <MoveStrip title={run.title} moves={run.moves} step={step} />}
        </View>
        <View
          style={[
            styles.panel,
            wide
              ? [styles.panelSide, { width: Math.min(400, Math.max(300, width * 0.38)) }]
              : [styles.panelBottom, { minHeight: run ? Math.min(200, sheetMin) : sheetMin }],
          ]}
        >
          {panel}
        </View>
      </View>
      {run && (
        <StepBar
          atStart={step === 0}
          atEnd={step >= run.moves.length}
          playing={playing}
          speedMs={speedMs}
          position={runPosition}
          onPrev={stepBack}
          onNext={() => {
            setPlaying(false);
            stepForward();
          }}
          onPlayPause={onPlayPause}
          onRestart={restoreBase}
          onSpeed={setSpeedMs}
          closeLabel={run.commitOnClose ? 'Keep' : 'Undo'}
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
  canvasWrap: { flex: 1 },
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
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: line.hairline,
  },
  panelBottom: {
    maxHeight: '56%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: line.hairline,
  },
});
