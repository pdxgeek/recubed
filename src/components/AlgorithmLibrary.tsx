/**
 * What this solve teaches, as a list of lessons.
 *
 * ── THIS IS NOT COMMIT 806ced6's BROWSING TAB. ─────────────────────────────
 *
 * That commit dropped an algorithm-browsing tab, and its reasoning is the
 * standard this file has to meet:
 *
 *   "Filtering a library by which algorithms touch a piece never answered the
 *    question someone holding a cube actually has, which is how to get that
 *    piece where it goes. Picking a piece now names it, lights the slot it has
 *    to reach, and offers the step that places it."
 *
 * What made that tab worth dropping was that it was a **filter over the whole
 * catalogue**, keyed on `algorithmsForSelection(selected)` - "here are the
 * seventeen algorithms that happen to disturb this corner". A query result, not
 * an answer: no notion of this cube, no notion of this learner, no meaningful
 * order, and it competed with the step list, which does answer the question.
 *
 * Four things make this different, and each one is visible in the code below:
 *
 *  1. **The default scope is the plan, not the catalogue.** `inPlan` is what
 *     opens - the twelve to fifteen algorithms this cube is teaching you, in
 *     plan order. The rest are behind a collapsed disclosure.
 *  2. **Every row carries the learner model.** The mastery rail turns a list
 *     into a progress report, which is a thing worth coming back to. That did
 *     not exist when `806ced6` was written.
 *  3. **Every row opens a lesson**, not a filter result. `onOpen` goes to the
 *     teaching page: case position, animation, purpose, filmstrip. The old
 *     tab's rows led nowhere.
 *  4. **It is not on the top-level navigation.** It is reached from the
 *     teaching page or from the solve panel, so it cannot compete with the
 *     step list.
 *
 * The test, if anyone re-litigates this: does it ever try to answer "how do I
 * get this piece home"? It does not, and it must not. `stepFor(plan,
 * selection)` still owns that question, untouched. **This file must never
 * import `algorithmsForSelection`.**
 * ────────────────────────────────────────────────────────────────────────────
 *
 * It is built for two shapes at once: a phone list, and the tablet's side
 * panel, which is currently mostly empty air. Neither is a device class -
 * the side panel is narrower than the tablet - so the column count comes from
 * measured width via `libraryColumns`.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlgCategory, CATEGORY_ORDER } from '../cube/algorithms';
import { AlgorithmCase, CASES, caseForId } from '../cube/cases';
import { Mastery } from '../learn/progress';
import { MoveGlyphStub } from './MoveGlyphStub';
import {
  LIBRARY_COL_GAP,
  LIBRARY_RAIL_W,
  LIBRARY_ROW_H,
  MoveGlyphProps,
  PREVIEW_GAP,
  PREVIEW_TILE,
  TEACH_HEADER_H,
  groupByCategory,
  libraryColumns,
  masterySuffix,
  previewCount,
  railShare,
  rowSummary,
} from '../ui/teaching';
import { tokens } from '../ui/theme';

export interface AlgorithmLibraryProps {
  /**
   * The algorithm ids this solve teaches, in plan order. `algorithmIdsInPlan`.
   * This is the library's default scope and the whole answer to `806ced6`.
   */
  inPlan?: string[];
  onOpen: (c: AlgorithmCase) => void;
  onClose?: () => void;
  /** The learner's own progress, per algorithm id. */
  masteryOf?: (id: string) => Mastery;
  /**
   * Panel mode: no header, no disclosure, the plan's algorithms only. This is
   * what the tablet's side panel renders below the step list.
   */
  panel?: boolean;
  /** Measured, so the same component is right in a phone and in a side panel. */
  width?: number;
  /** SWAP: the real `MoveGlyph`. See `MoveGlyphStub.tsx`. */
  MoveGlyph?: React.ComponentType<MoveGlyphProps>;
}

const { surface, line, text, accent, status, space, radius, type, hit } = tokens;

export function AlgorithmLibrary({
  inPlan = [],
  onOpen,
  onClose,
  masteryOf,
  panel = false,
  width = 375,
  MoveGlyph = MoveGlyphStub,
}: AlgorithmLibraryProps) {
  const [openAll, setOpenAll] = useState(false);
  const cols = libraryColumns(width);
  const preview = previewCount(width / cols);

  const planCases = useMemo(
    () => inPlan.map((id) => caseForId(id)).filter((c): c is AlgorithmCase => !!c),
    [inPlan]
  );
  const planIds = useMemo(() => new Set(planCases.map((c) => c.id)), [planCases]);
  const rest = useMemo(() => CASES.filter((c) => !planIds.has(c.id)), [planIds]);
  const restGroups = useMemo(
    () => groupByCategory(rest, CATEGORY_ORDER as readonly AlgCategory[]),
    [rest]
  );

  const row = (c: AlgorithmCase) => (
    <Row
      key={c.id}
      algorithmCase={c}
      onOpen={onOpen}
      mastery={masteryOf?.(c.id) ?? 'unseen'}
      preview={preview}
      MoveGlyph={MoveGlyph}
      style={cols > 1 ? { width: `${100 / cols}%` } : undefined}
    />
  );

  const body = (
    <>
      {planCases.length > 0 ? (
        <>
          <View style={styles.groupRow}>
            <Text style={styles.group}>IN THIS SOLVE</Text>
            <Text style={[styles.count, tokens.numeric]}>{planCases.length}</Text>
          </View>
          <View style={styles.grid}>{planCases.map(row)}</View>
        </>
      ) : null}

      {/* The one part of this that resembles the dropped tab, and it is
          collapsed by default and scoped underneath the plan rather than
          instead of it. If a reviewer still reads it as that tab in a coat,
          delete this block: the rest of the file stands without it. */}
      {!panel ? (
        <>
          <Pressable
            onPress={() => setOpenAll((v) => !v)}
            style={styles.disclosure}
            accessibilityRole="button"
            accessibilityState={{ expanded: openAll }}
            aria-expanded={openAll}
            accessibilityLabel={`All ${CASES.length} algorithms`}
            accessibilityHint={openAll ? 'Hides the rest of the library' : 'Shows the rest of the library'}
          >
            <Text style={styles.disclosureText}>
              {openAll ? '▾' : '▸'}  All {CASES.length} algorithms
            </Text>
          </Pressable>

          {openAll
            ? restGroups.map((g) => (
                <View key={g.category}>
                  <View style={styles.groupRow}>
                    <Text style={styles.group}>{g.category.toUpperCase()}</Text>
                    <Text style={[styles.count, tokens.numeric]}>{g.items.length}</Text>
                  </View>
                  <View style={styles.grid}>{g.items.map(row)}</View>
                </View>
              ))
            : null}
        </>
      ) : null}
    </>
  );

  if (panel) {
    // In the side panel there is no header and no page: it is a section of the
    // panel it lives in, and the panel owns the scrolling.
    return <View style={styles.panel}>{body}</View>;
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText} maxFontSizeMultiplier={1.4}>
            ‹ Back
          </Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          Algorithms
        </Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
    </View>
  );
}

function Row({
  algorithmCase: c,
  onOpen,
  mastery,
  preview,
  MoveGlyph,
  style,
}: {
  algorithmCase: AlgorithmCase;
  onOpen: (c: AlgorithmCase) => void;
  mastery: Mastery;
  preview: number;
  MoveGlyph: React.ComponentType<MoveGlyphProps>;
  style?: object;
}) {
  const share = railShare(mastery);
  return (
    <Pressable
      onPress={() => onOpen(c)}
      style={[styles.row, style]}
      accessibilityRole="button"
      // `unseen` says nothing, which is the existing rule: an absence of
      // progress is not news, and saying it on every row is noise.
      accessibilityLabel={`${c.name}, ${c.moves.length} moves${masterySuffix(mastery)}`}
      accessibilityHint="Opens the algorithm's page"
    >
      {/* Rail length is the primary channel and the hue is the second, so the
          three states are told apart without colour. The word is in the label. */}
      <View style={styles.railTrack}>
        {share > 0 ? (
          <View
            style={[
              styles.rail,
              {
                height: `${share * 100}%`,
                backgroundColor: mastery === 'known' ? status.ok : status.warn,
              },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>
          {c.name}
        </Text>
        <Text style={styles.summary} numberOfLines={1}>
          {rowSummary(c.note, c.moves.length)}
        </Text>
      </View>

      {/* The glyph earning its second job. You recognise an algorithm by its
          shape, and building that recognition is what this whole page is for.
          A thumbnail, so it is hidden from the reader - reading four move
          names inside every row makes the list unlistenable. */}
      <View
        style={styles.preview}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {c.notation.slice(0, preview).map((n, i) => (
          <MoveGlyph key={i} notation={n} size={PREVIEW_TILE} state="future" />
        ))}
        {c.notation.length > preview ? <Text style={styles.more}>…</Text> : null}
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: surface.base },
  panel: { gap: space.xs },
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

  scroll: { paddingHorizontal: space.gutter, paddingBottom: space.xxl },
  groupRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, marginBottom: space.xs },
  group: { ...type.overline, color: text.tertiary, flex: 1 },
  count: { ...type.overline, color: text.tertiary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: LIBRARY_COL_GAP },

  row: {
    minHeight: LIBRARY_ROW_H,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingRight: space.sm,
    marginBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: surface.raised,
    borderWidth: 1,
    borderColor: line.outline,
    overflow: 'hidden',
  },
  railTrack: {
    width: LIBRARY_RAIL_W,
    alignSelf: 'stretch',
    backgroundColor: surface.sunken,
    justifyContent: 'flex-start',
  },
  rail: { width: LIBRARY_RAIL_W },
  rowBody: { flex: 1, paddingVertical: space.sm, gap: 1 },
  name: { ...type.body, color: text.primary },
  summary: { ...type.caption, color: text.tertiary },
  preview: { flexDirection: 'row', alignItems: 'center', gap: PREVIEW_GAP },
  more: { ...type.caption, color: text.tertiary },
  chevron: { ...type.heading, color: accent.base, marginLeft: space.xs },

  disclosure: {
    minHeight: hit.min,
    justifyContent: 'center',
    marginTop: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.outline,
  },
  disclosureText: { ...type.overline, color: text.secondary },
});
