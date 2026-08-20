import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  CUBIE_BY_KEY,
  ColorId,
  CubeState,
  Move,
  SLOTS,
  SLOTS_BY_CUBIE,
  applyAlg,
  applyMove,
  blankState,
  cloneState,
  invertMove,
  isCenter,
  resetTracking,
  solvedState,
  vecKey,
} from './src/cube/core';
import { rotateCubie, rotationBringing } from './src/cube/orientation';
import { HighlightMode, pairFor } from './src/cube/pieces';
import {
  PlanMethod,
  PlanStep,
  SolvePlan,
  buildPlan,
  buildShortest,
  colorKeyOfCubie,
  describeCubie,
  titleCase,
} from './src/cube/solver/plan';
import { CubeScene } from './src/render/CubeScene';
import { CubeCanvas } from './src/components/CubeCanvas';
import { TopBar, Mode } from './src/components/TopBar';
import { PaintPanel } from './src/components/PaintPanel';
import { SolvePanel } from './src/components/SolvePanel';
import { StepBar } from './src/components/StepBar';
import { MoveStrip } from './src/components/MoveStrip';
import { theme } from './src/ui/theme';

interface ActiveRun {
  id: string;
  title: string;
  moves: Move[];
  targetSlots: number[];
  /** Solve steps leave the cube where they finish; library previews undo. */
  commitOnClose: boolean;
}

export default function App() {
  const sceneRef = useRef<CubeScene | null>(null);
  const baseState = useRef<CubeState | null>(null);
  const liveState = useRef<CubeState | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 720;

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
  /** One piece or slot at a time, so nothing unrelated is lit up at once. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('piece');
  const [showPartner, setShowPartner] = useState(true);
  const [run, setRun] = useState<ActiveRun | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(850);
  const [wireframe, setWireframe] = useState(false);

  const [plan, setPlan] = useState<SolvePlan | null>(null);
  const [shortest, setShortest] = useState<PlanMethod | null>(null);
  const [computing, setComputing] = useState(false);

  // -- derived -------------------------------------------------------------

  /** The piece the user picked, and its opposite number. */
  const pair = useMemo(
    () => (selectedKey ? pairFor(state, CUBIE_BY_KEY.get(selectedKey)!, highlightMode) : null),
    [selectedKey, state, highlightMode]
  );

  const selectionSlots = useMemo(
    () => (selectedKey ? SLOTS_BY_CUBIE.get(selectedKey) ?? [] : []),
    [selectedKey]
  );

  const partnerSlots = useMemo(() => {
    if (!showPartner || !pair?.partner || pair.atHome) return [];
    return SLOTS_BY_CUBIE.get(vecKey(pair.partner)) ?? [];
  }, [pair, showPartner]);

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

  /**
   * The step in the plan that puts the selected piece where it belongs. Pieces
   * are matched by their colours, which survive the cube being re-labelled.
   */
  const selectedName = useMemo(
    () => (selectedKey ? describeCubie(state, CUBIE_BY_KEY.get(selectedKey)!) : null),
    [selectedKey, state]
  );

  const stepForSelection = useMemo(() => {
    if (!selectedKey || !plan?.ok) return null;
    const wanted = colorKeyOfCubie(state, CUBIE_BY_KEY.get(selectedKey)!);
    for (const method of plan.methods) {
      const found = method.steps.find((st) => st.pieceColors === wanted);
      if (found) return found;
    }
    return null;
  }, [selectedKey, state, plan]);

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
    setPlan(buildPlan(state));
  }, [mode, state, run]);

  // A different cube means the old search result no longer applies.
  useEffect(() => {
    if (!run) setShortest(null);
  }, [state, run]);

  // -- interaction ---------------------------------------------------------

  const onPickSticker = useCallback(
    (slot: number | null) => {
      if (slot === null) {
        if (mode === 'solve') setSelectedKey(null);
        return;
      }
      // Centres never move, so they are neither paintable nor lookup-able.
      if (isCenter(SLOTS[slot].pos)) return;
      if (mode === 'paint') {
        setState((s) => {
          const colors = s.colors.slice();
          colors[slot] = paintColor;
          return { ...s, colors };
        });
        return;
      }
      // Always the whole piece, never a single sticker, and only one at a time.
      const key = vecKey(SLOTS[slot].pos);
      setSelectedKey((prev) => (prev === key ? null : key));
    },
    [mode, paintColor]
  );

  /**
   * Once a drag settles, re-label the cube so the face at the bottom of the
   * screen really is D. The colours are permuted and the view is counter-turned
   * in the same tick, so nothing appears to move - but from here on the solver
   * and the move notation talk about the cube the way the user is holding it.
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
    setSelectedKey((k) => {
      const pos = k ? CUBIE_BY_KEY.get(k) : null;
      return pos ? vecKey(rotateCubie(rot, pos)) : k;
    });
  }, [run]);

  const restoreBase = useCallback(() => {
    sceneRef.current?.cancelMove();
    if (baseState.current) setState(cloneState(baseState.current));
    setStep(0);
    setPlaying(false);
  }, []);

  const startRun = useCallback(
    (next: ActiveRun, prelude: Move[] = []) => {
      sceneRef.current?.cancelMove();
      setPlaying(false);
      // Everything before this step is applied at once, so any step in the list
      // can be picked out and practised without doing the ones before it first.
      const from = prelude.length
        ? applyAlg(baseState.current ?? state, prelude)
        : baseState.current ?? state;
      const base = resetTracking(from);
      baseState.current = base;
      liveState.current = base;
      setState(cloneState(base));
      setStep(0);
      setRun(next);
    },
    [state]
  );

  const closeRun = useCallback(() => {
    if (!run?.commitOnClose) restoreBase();
    else {
      sceneRef.current?.cancelMove();
      setPlaying(false);
      setStep(0);
      baseState.current = state;
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
      setSelectedKey(null);
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
    baseState.current = next;
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
    // Let the spinner paint before the search takes over the thread.
    setTimeout(() => {
      setShortest(buildShortest(state));
      setComputing(false);
    }, 60);
  }, [state]);

  // -- panels --------------------------------------------------------------

  const startStep = useCallback(
    (st: PlanStep) =>
      startRun(
        {
          id: st.id,
          title: st.title,
          moves: st.moves,
          targetSlots: st.targetSlots,
          commitOnClose: true,
        },
        st.prelude
      ),
    [startRun]
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
      />
    ) : (
      <SolvePanel
        plan={plan ?? { ok: true, solved: false, methods: [] }}
        shortest={shortest}
        computing={computing}
        onComputeShortest={computeShortest}
        activeStepId={run?.id ?? null}
        onSelectStep={startStep}
        onGoPaint={() => onModeChange('paint')}
        highlightMode={highlightMode}
        onHighlightMode={setHighlightMode}
        showPartner={showPartner}
        onShowPartner={setShowPartner}
        selectedName={selectedName ? titleCase(selectedName) : null}
        pair={pair}
        stepForSelection={stepForSelection}
        onClearSelection={() => setSelectedKey(null)}
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
          {mode === 'solve' && !selectedKey && !run && (
            <View style={styles.overlay} pointerEvents="none">
              <Text style={styles.overlayText}>Drag to spin · tap a piece to look it up</Text>
            </View>
          )}
          {run && <MoveStrip title={run.title} moves={run.moves} step={step} />}
        </View>
        <View
          style={[
            styles.panel,
            wide ? styles.panelSide : styles.panelBottom,
            !wide && run ? styles.panelBottomCompact : null,
          ]}
        >
          {panel}
        </View>
      </View>
      {run && (
        <StepBar
          runId={run.id}
          atStart={step === 0}
          atEnd={step >= run.moves.length}
          playing={playing}
          speedMs={speedMs}
          onPrev={stepBack}
          onNext={() => {
            setPlaying(false);
            stepForward();
          }}
          onPlayPause={onPlayPause}
          onRestart={restoreBase}
          onSpeed={setSpeedMs}
          closeLabel={run.commitOnClose ? 'Done' : 'Close'}
          onClose={closeRun}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  body: { flex: 1 },
  bodyRow: { flexDirection: 'row' },
  bodyCol: { flexDirection: 'column' },
  canvasWrap: { flex: 1 },
  overlay: { position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center' },
  overlayText: {
    color: theme.textDim,
    fontSize: 12,
    backgroundColor: '#00000088',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  panel: { backgroundColor: theme.panel },
  panelSide: {
    width: 340,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: theme.border,
  },
  panelBottomCompact: { height: 230 },
  panelBottom: {
    height: 320,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
});
