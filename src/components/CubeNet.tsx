import React from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLOR_HEX, COLOR_NAME, CubeState, Face, SLOTS, isCenter } from '../cube/core';
import { Mode } from './TopBar';
import {
  CELL,
  CELL_GAP,
  FACE_GAP,
  FACE_SIZE,
  FACE_WORD,
  LABEL_H,
  NET_PAD,
  NET_ROWS,
  NetLayout,
  layoutFor,
  slotIndex,
} from '../ui/net';
import { inkOn, tokens } from '../ui/theme';

/**
 * The cube unfolded.
 *
 * Two jobs, and the second is not a consolation prize for the first:
 *
 *  1. It is the only accessible representation of the cube. The 3D view is a
 *     `PanResponder` over a GL surface: a screen-reader user cannot paint a
 *     sticker or select a piece through it at all. Here every sticker is a
 *     labelled 44pt button.
 *  2. Every sticker carries its colour's letter, so a colour-blind user can
 *     check what they painted - and the net is how a learner is taught to read
 *     a cube on paper.
 *
 * It renders from the same state and the same highlight sets as the 3D view and
 * calls the same `onPickSticker`. Two views of one state, never two states.
 *
 * The geometry lives in `src/ui/net.ts`, which imports no react-native, so the
 * mapping from a cell to a sticker can be asserted by `verify-net.ts`.
 */

interface Props {
  state: CubeState;
  mode: Mode;
  /** The colour the next paint tap would apply, for the press hint. */
  paintColor: string | null;
  onPickSticker: (slot: number | null) => void;
  selectedSlots: number[];
  partnerSlots: number[];
  movingSlots: number[];
  /** Announced without moving focus after an edit or a selection. */
  status: string;
}

export function CubeNet({
  state,
  mode,
  paintColor,
  onPickSticker,
  selectedSlots,
  partnerSlots,
  movingSlots,
  status,
}: Props) {
  // Chosen by measured width, not by device class: the cross is four faces
  // across and does not fit a phone at an honest 44pt pitch.
  const [layout, setLayout] = React.useState<NetLayout>('pairs');
  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    setLayout(layoutFor(e.nativeEvent.layout.width));
  }, []);

  const selected = new Set(selectedSlots);
  const partner = new Set(partnerSlots);
  const moving = new Set(movingSlots);

  const cell = (face: Face, row: number, col: number) => {
    const slot = slotIndex(face, row, col);
    const colour = state.colors[slot];
    const centre = isCenter(SLOTS[slot].pos);
    const hex = colour ? COLOR_HEX[colour] : null;

    const where = centre
      ? `${FACE_WORD[face]} face, centre.`
      : `${FACE_WORD[face]} face, row ${row + 1} of 3, column ${col + 1} of 3.`;
    const what = colour ? `${COLOR_NAME[colour]}.` : 'Not painted.';
    const role = centre
      ? ' Fixed.'
      : selected.has(slot)
        ? mode === 'solve'
          ? ' Selected piece.'
          : ' Selected.'
        : partner.has(slot)
          ? ' Where it goes.'
          : moving.has(slot)
            ? ' Moving in this step.'
            : '';

    return (
      <Pressable
        key={slot}
        onPress={() => onPickSticker(slot)}
        disabled={centre}
        // The 4pt gutter is inside the 44pt pitch, so a couple of points of
        // slop only softens the rounded corners. It is never load-bearing:
        // a target has to be carried by the pitch, or neighbouring targets
        // overlap and a tap paints the wrong sticker.
        hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
        accessibilityRole="button"
        accessibilityState={{ selected: selected.has(slot), disabled: centre }}
        aria-selected={selected.has(slot)}
        aria-disabled={centre}
        accessibilityLabel={`${where} ${what}${role}`}
        accessibilityHint={
          centre
            ? undefined
            : mode === 'paint'
              ? `Paints this sticker ${paintColor ?? 'blank'}`
              : 'Selects this piece'
        }
        style={[
          styles.cell,
          hex ? { backgroundColor: hex } : styles.blank,
          centre && styles.centre,
          selected.has(slot) && styles.selected,
          !selected.has(slot) && partner.has(slot) && styles.partner,
          !selected.has(slot) && !partner.has(slot) && moving.has(slot) && styles.moving,
        ]}
      >
        {colour && hex ? (
          <Text style={[styles.letter, { color: inkOn(hex) }]} maxFontSizeMultiplier={1.3}>
            {colour}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  // The label sits directly on the grid and the grid owns the gaps between its
  // rows, so a face block is exactly LABEL_H + FACE_SIZE - the number `net.ts`
  // budgets with. A gap here, or a margin under the last row, is 48pt of net
  // that no measurement in the app knows about.
  const faceBlock = (face: Face) => (
    <View key={face} style={styles.face}>
      <Text style={styles.faceLabel}>{FACE_WORD[face].toUpperCase()}</Text>
      <View style={styles.faceGrid}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.faceRow}>
            {[0, 1, 2].map((col) => cell(face, row, col))}
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {/* Vertical only. The two-up layout is 268pt wide, narrower than any
          phone, so no face is ever split across the horizontal axis and there
          is no sideways scroll to discover. */}
      <ScrollView contentContainerStyle={styles.vertical}>
        <View style={styles.rows} accessibilityRole="list" accessibilityLabel="Cube net, 54 stickers">
          {NET_ROWS[layout].map((row, i) => (
            <View key={i} style={styles.netRow}>
              {row.map((face, j) =>
                face ? faceBlock(face) : <View key={`gap${j}`} style={styles.spacer} />
              )}
            </View>
          ))}
        </View>
      </ScrollView>
      {/* An announcement, not a caption: the panel below already prints the
          same words. */}
      <Text style={styles.status} accessibilityLiveRegion="polite">
        {status}
      </Text>
    </View>
  );
}

const { surface, line, text, cube, type, radius } = tokens;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  vertical: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: NET_PAD },
  rows: { gap: FACE_GAP },
  netRow: { flexDirection: 'row', gap: FACE_GAP },
  spacer: { width: FACE_SIZE },
  face: { width: FACE_SIZE },
  faceGrid: { gap: CELL_GAP },
  faceLabel: {
    ...type.overline,
    height: LABEL_H,
    lineHeight: LABEL_H,
    color: text.tertiary,
    textAlign: 'center',
  },
  faceRow: { flexDirection: 'row', gap: CELL_GAP },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: radius.sm - 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: surface.chipRim,
  },
  blank: { backgroundColor: cube.blank, borderStyle: 'dashed', borderColor: line.outline },
  centre: { borderWidth: 3, borderColor: surface.chipRim },
  selected: { borderWidth: 3, borderColor: cube.selected },
  partner: { borderWidth: 3, borderColor: cube.target },
  moving: { borderWidth: 3, borderColor: cube.moving },
  letter: { ...type.overline, textAlign: 'center' },
  // Visually hidden: it is announced, not printed. The paint panel's progress
  // line and the selection card already say the same thing on screen.
  status: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
});
