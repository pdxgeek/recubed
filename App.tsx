import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
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
} from './src/cube/solver/plan';
import { CubeScene } from './src/render/CubeScene';
import { CubeCanvas } from './src/components/CubeCanvas';
import { TopBar, CubeView, Mode } from './src/components/TopBar';
import { CubeNet } from './src/components/CubeNet';
import { PaintPanel } from './src/components/PaintPanel';
import { SolvePanel } from './src/components/SolvePanel';
import { StepBar } from './src/components/StepBar';
import { MoveStrip } from './src/components/MoveStrip';
import { WhySheet } from './src/components/WhySheet';
import {
  PractiseSession,
  Recall,
  record as recordRecall,
  startPractise,
  summarise,
} from './src/learn/session';
import { chunkNameAt } from './src/ui/notation';
import { TOP_BAR_H, netBlockHeight } from './src/ui/net';
import { tokens } from './src/ui/theme';
import {
  RUN_PANEL_MIN,
  STRIP_H_FALLBACK,
  listBottomInset,
  panelBudget,
  panelOverflow,
  runPanelHeight,
} from './src/ui/layout';
import {
  emptyLearnState,
  finishAttempt,
  masteryOf,
  watched as watchedAlgorithm,
} from './src/learn/progress';

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
   * Short screens give the cube the height instead of the step list: at 667 the
   * list is one row during a run, which is not worth 180pt of cube.
   */
  const short = height < 700;

  /**
   * The body's own measured height, and the panel's box inside it.
   *
   * Every layout number in this project was measured in Chromium through
   * react-native-web. The first screenshot from a real phone showed the step
   * bar drawn over the step list, which is what a panel whose box runs past the
   * bottom of the body looks like - and a browser would never have shown it,
   * because react-native-web clips a View by default and iOS does not. So the
   * overflow is measured at runtime rather than assumed to be zero: whatever it
   * turns out to be, the list reserves exactly that much and no more.
   */
  const [bodyBox, setBodyBox] = useState({ width: 0, height: 0 });
  const [panelBox, setPanelBox] = useState({ y: 0, height: 0 });
  const overflow = panelOverflow(bodyBox, panelBox);

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
  /** The step whose "why this works" sheet is open, over the panel. */
  const [explaining, setExplaining] = useState<PlanStep | null>(null);
  const [practising, setPractising] = useState(false);
  /**
   * One step's practise attempt. Session-scoped and thrown away when the step
   * closes: accumulating across steps is the learner model, which is round 5's
   * work and wants a store this component should not invent.
   */
  const [practice, setPractice] = useState<PractiseSession | null>(null);
  /**
   * What the learner knows, across steps. THIS SESSION only - there is no
   * store, and `src/learn/progress.ts` says why at length. Kept in a ref beside
   * the state so the callbacks that fold attempts into it do not have to be
   * rebuilt every time it changes.
   */
  const [learn, setLearn] = useState(emptyLearnState);
  const practiceRef = useRef<PractiseSession | null>(null);
  practiceRef.current = practice;
  /** Folded in whenever an attempt ends: the step closes, or a new one starts. */
  const bankAttempt = useCallback(() => {
    const attempt = practiceRef.current;
    if (attempt) setLearn((s) => finishAttempt(s, attempt));
  }, []);
  const masteryFor = useCallback(
    (algorithmId: string | undefined) => masteryOf(learn, algorithmId),
    [learn]
  );
  /** A move has been revealed and the learner has not yet said how they did. */
  const [awaitingReport, setAwaitingReport] = useState(false);
  /** Which move that was: `playback.index` has moved on by the time they answer. */
  const revealed = useRef(0);
  const [paintNudge, setPaintNudge] = useState<string | null>(null);
  /**
   * The move strip's measured height, so the canvas reserves exactly the room
   * the strip takes and the cube is fitted to what is left. It used to be a
   * constant 108 measured in a browser.
   */
  const [stripH, setStripH] = useState(STRIP_H_FALLBACK);

  const [plan, setPlan] = useState<SolvePlan | null>(null);
  const [shortest, setShortest] = useState<PlanMethod | null>(null);
  const [computing, setComputing] = useState(false);

  // -- derived -------------------------------------------------------------

  /**
   * In Flat view the net *is* the cube, so it gets the body and the panel is
   * sized from what is left rather than from a share of the window. The paint
   * panel collapses to two 44pt rows (`variant="compact"`); the step list has no
   * compact form, so it takes the smaller of its usual height and what the net
   * can spare, never going below a usable 200.
   */
  const flat = !wide && view === 'net';
  const flatPaint = flat && mode === 'paint';
  const netRoom = height - TOP_BAR_H - netBlockHeight();

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
  /** Paintable stickers filled in. The six centres are fixed and never counted. */
  const painted = useMemo(
    () => SLOTS.filter((sl) => !isCenter(sl.pos) && state.colors[sl.index] !== null).length,
    [state]
  );

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

  /**
   * A fresh attempt: the same step, from the top, with the previous attempt's
   * verdicts discarded rather than added to. Two attempts at one step are two
   * results, and averaging them would flatter the second one.
   */
  const restartPractise = useCallback(
    (p: Playback) => {
      // The attempt being replaced is banked first: two attempts at one step
      // are two results, and the second must not swallow the first.
      bankAttempt();
      setPractice(startPractise(p.step.id, p.step.moves.length, p.step.algorithmId));
      setAwaitingReport(false);
    },
    [bankAttempt]
  );

  const restoreBase = useCallback(() => {
    sceneRef.current?.cancelMove();
    setPlaying(false);
    setPlayback((p) => {
      if (p) restartPractise(p);
      return p ? playbackRestart(p) : p;
    });
  }, [restartPractise]);

  const startStep = useCallback((st: PlanStep) => {
    sceneRef.current?.cancelMove();
    setPlaying(false);
    setExplaining(null);
    bankAttempt();
    setPractice(startPractise(st.id, st.moves.length, st.algorithmId));
    setAwaitingReport(false);
    // `selectStep` reads the origin out of the session when there is one, so a
    // second step picked mid-run is measured from the cube the plan describes -
    // not from wherever the first step left off, which stacked two preludes.
    setPlayback((p) => selectStep(p, p?.origin ?? planOrigin.current ?? state, st));
  }, [bankAttempt, state]);

  const closeRun = useCallback(() => {
    sceneRef.current?.cancelMove();
    setPlaying(false);
    bankAttempt();
    setPractice(null);
    setAwaitingReport(false);
    setPlayback((p) => {
      if (!p) return null;
      const kept = playbackClose(p);
      setResting(kept);
      // The cube left behind is what the next plan - and so the next step's
      // prelude - is measured from.
      planOrigin.current = kept;
      return null;
    });
  }, [bankAttempt]);

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

  /**
   * The learner's own verdict on the move they just uncovered, recorded against
   * the trigger it belongs to rather than the letter - "what does the sexy move
   * expand to" is the thing being recalled.
   */
  const onReport = useCallback(
    (outcome: Recall) => {
      const pb = playback;
      if (!pb) return;
      const notation = pb.step.moves.map((m) => m.notation);
      const move = Math.min(revealed.current, notation.length - 1);
      setPractice((s) =>
        s ? recordRecall(s, move, outcome, chunkNameAt(notation, move)) : s
      );
      setAwaitingReport(false);
    },
    [playback]
  );

  /**
   * Turning practise on part-way through a step starts the attempt from here:
   * the moves already watched were not recalled, and counting them as known
   * would be the app flattering the learner.
   */
  const onPractise = useCallback(
    (on: boolean) => {
      setPractising(on);
      setAwaitingReport(false);
      // Turning practise off ends the attempt; turning it on starts a new one.
      bankAttempt();
      if (on && playback) {
        setPractice(startPractise(playback.step.id, playback.step.moves.length, playback.step.algorithmId));
      }
    },
    [bankAttempt, playback]
  );

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

  /**
   * How tall the panel is while a step is running.
   *
   * 38% of the body, as a real number once the body has been measured. The
   * clamp is what keeps a very tall or very short window sensible; the fallback
   * is only in play for the first frame.
   */
  /**
   * The body's division between the cube and the panel, as definite numbers in
   * every state.
   *
   * Not a percentage anywhere. `maxHeight: '56%'` resolves against a parent
   * whose height Yoga settles differently on the two platforms, and the canvas
   * was the only shrinkable thing in the column: if the percentage does not
   * take, the panel sizes itself to a step list that wants to be a thousand
   * points tall and the cube is what gives way. `panelBudget` puts a floor
   * under the cube that the panel yields to instead.
   */
  const wantedPanel = playback
    ? // A short screen gives the cube the height rather than the step list: at
      // 667 the list is one row during a run, which is not worth 180pt of cube.
      short
      ? RUN_PANEL_MIN
      : runPanelHeight(bodyBox.height, Math.min(200, sheetMin))
    : flat
      ? Math.max(200, Math.min(sheetMin, netRoom))
      : sheetMin;
  const budget = panelBudget(bodyBox.height, wantedPanel, playback ? stripH : 0);
  // During a run the panel is a definite height, because that is round 5's
  // finding: a percentage resolves differently on the two platforms. At rest a
  // panel whose content needs more - the paint panel grows a row of actions
  // once every sticker is in - may have it, up to the point where the cube's
  // floor starts.
  const panelBox2 = playback
    ? { minHeight: budget.panel, maxHeight: budget.panel }
    : { minHeight: budget.panel, maxHeight: budget.cap };

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
        variant={flatPaint ? 'compact' : 'full'}
        short={short}
      />
    ) : (
      <SolvePanel
        plan={plan ?? { ok: true, solved: false, methods: [] }}
        shortest={liveShortest}
        computing={computing}
        onComputeShortest={computeShortest}
        activeStepId={playback?.step.id ?? null}
        running={!!playback}
        practising={practising}
        onSelectStep={startStep}
        onExplain={(st) => {
          setExplaining(st);
          // Opening the sheet is "seen", never "known": `watched` cannot
          // promote anything past `learning`.
          setLearn((s) => watchedAlgorithm(s, st.algorithmId));
        }}
        masteryOf={masteryFor}
        onGoPaint={(focus) => {
          if (focus) setPaintColor(focus);
          onModeChange('paint');
        }}
        highlightMode={highlightMode}
        onHighlightMode={onHighlightMode}
        showPartner={showPartner}
        onShowPartner={setShowPartner}
        selectedName={selectedName}
        pair={pair}
        stepForSelection={stepForSelection}
        onClearSelection={() => setSelection(null)}
        bottomInset={listBottomInset(overflow)}
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
      <View
        style={[styles.body, wide ? styles.bodyRow : styles.bodyCol]}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setBodyBox((b) => (Math.abs(b.width - w) < 0.5 && Math.abs(b.height - h) < 0.5 ? b : { width: w, height: h }));
        }}
      >
        <View
          style={[
            styles.canvasWrap,
            // Room for the strip, measured rather than assumed, so the cube is
            // fitted above it instead of drawn behind it. And a floor, so that
            // whatever else in the column mis-measures itself, the canvas is
            // never the thing squeezed to nothing.
            playback && { paddingBottom: stripH },
            budget.canvas > 0 && { minHeight: budget.canvas },
          ]}
        >
          {/* The GL surface stays mounted while the net is showing: unmounting
              it tears the scene down (as it must on a real unmount), and every
              toggle would then pay for a full rebuild. */}
          <View
            style={view === 'net' ? styles.hidden : styles.fill}
            pointerEvents={view === 'net' ? 'none' : 'auto'}
            accessibilityElementsHidden={view === 'net'}
            importantForAccessibility={view === 'net' ? 'no-hide-descendants' : 'auto'}
          >
            <CubeCanvas
              paused={view === 'net'}
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
              status={mode === 'paint' ? `${painted} of 48 painted` : (selectedName ?? 'Nothing selected')}
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
              // Tapping the name is how solving reaches teaching. The step is
              // already open, so this is the same sheet the list's own name
              // button opens - one destination, two doorways, no third surface.
              onHeight={(h) =>
                setStripH((prev) => (Math.abs(prev - h) < 0.5 ? prev : Math.round(h)))
              }
              onExplain={() => {
                setExplaining(playback.step);
                setLearn((st) => watchedAlgorithm(st, playback.step.algorithmId));
              }}
              practising={practising}
              onPractise={onPractise}
              onReveal={() => {
                setPlaying(false);
                revealed.current = playback.index;
                setAwaitingReport(true);
                stepForward();
              }}
              onAgain={restoreBase}
              awaitingReport={awaitingReport}
              onReport={onReport}
              summary={summarise(practice, playback.step.moves.length)}
            />
          )}
        </View>
        <View
          onLayout={(e) => {
            const { y, height: h } = e.nativeEvent.layout;
            setPanelBox((b) => (Math.abs(b.y - y) < 0.5 && Math.abs(b.height - h) < 0.5 ? b : { y, height: h }));
          }}
          style={[
            styles.panel,
            wide
              ? [styles.panelSide, { width: Math.min(400, Math.max(300, width * 0.38)) }]
              : [
                  styles.panelBottom,
                  // Definite numbers in every state. `panelBudget` has already
                  // capped this at what the body can spare without taking the
                  // cube below its floor.
                  flatPaint ? styles.panelCompact : panelBox2,
                ],
          ]}
        >
          {/* The wide panel had ~700pt of air above and below its content. The
              net fills it with the one thing that helps: manipulate in 3D on
              the left, check the whole cube on the right. It also makes the net
              discoverable to the colour-blind users its letters are for. */}
          {wide && mode === 'paint' && view === '3d' && (
            <View style={styles.panelNet}>
              <CubeNet
                state={state}
                mode={mode}
                paintColor={paintColor ? COLOR_NAME[paintColor] : null}
                onPickSticker={onPickSticker}
                selectedSlots={selectionSlots}
                partnerSlots={partnerSlots}
                movingSlots={runTargetSlots}
                status={`${painted} of 48 painted`}
              />
            </View>
          )}
          {panel}
        </View>
        {explaining && (
          <>
            <Pressable
              style={styles.sheetScrim}
              onPress={() => setExplaining(null)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            />
            {/* The sheet fills the body rather than taking a share of the
                window. At 440pt the longest explanation overflowed its own
                scroller by 135pt with no affordance at rest - the cut line was
                the footnote that says which pieces move, which is the one thing
                the sheet exists to say. */}
            <View style={styles.sheetHolder} pointerEvents="box-none">
              <WhySheet
                step={explaining}
                // Only for the step actually being practised: the sheets of the
                // other rows are not the thing being tested and printing their
                // notation spoils nothing.
                practising={practising && explaining.id === playback?.step.id}
                wireframe={wireframe}
                onWireframe={setWireframe}
                onWatch={() => {
                  const st = explaining;
                  setExplaining(null);
                  setSpeedMs(1400);
                  startStep(st);
                }}
                onClose={() => setExplaining(null)}
              />
            </View>
          </>
        )}
      </View>
      {playback && (
        <StepBar
          atStart={playbackAtStart(playback)}
          atEnd={playbackAtEnd(playback)}
          playing={playing}
          speedMs={speedMs}
          onPrev={stepBack}
          onNext={
            practising
              ? null
              : () => {
                  setPlaying(false);
                  stepForward();
                }
          }
          onPlayPause={practising ? null : onPlayPause}
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
  // Kept at full size rather than shrunk to a pixel: a 1x1 surface makes the
  // scene rebuild its projection down and back up, and the frame loop is paused
  // while hidden so nothing is drawn either way.
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
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
  // `overflow: hidden` matters only on native: react-native-web clips a View
  // by default and iOS does not, so a child laid out taller than this box drew
  // straight over the step bar below it on a device and never once on the web
  // target the whole project was measured against.
  panel: { backgroundColor: surface.base, overflow: 'hidden' },
  panelNet: { flexShrink: 1, minHeight: 260 },
  // The sheet covers the body rather than the panel: during a run the panel is
  // 230pt, which is not enough to explain anything in.
  sheetScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: surface.scrim },
  // Anchored to the bottom of the body and capped by it: the sheet takes the
  // height its explanation needs and no more, so a short one leaves the cube
  // visible through the scrim - and the scrim tappable - while a long one gets
  // the whole body rather than cutting itself off.
  sheetHolder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  panelSide: {
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: line.hairline,
  },
  // The compact paint row measures itself; the panel must not stretch it.
  panelCompact: { flexGrow: 0, flexShrink: 0 },
  panelBottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: line.hairline,
  },
});
