import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  COLOR_HEX,
  COLOR_NAME,
  CubeState,
  FACES,
  Face,
  SLOTS,
  isCenter,
} from '../cube/core';
import { Mode } from './TopBar';
import { inkOn, tokens } from '../ui/theme';

/**
 * The cube unfolded, as every printed guide draws it.
 *
 * Two jobs, and it is worth being clear that the second is not a consolation
 * prize for the first:
 *
 *  1. It is the only accessible representation of the cube. The 3D view is a
 *     `PanResponder` over a GL surface: a screen-reader user cannot paint a
 *     sticker or select a piece through it at all. Here every sticker is a
 *     labelled button.
 *  2. Every sticker carries its colour's letter, so a colour-blind user can
 *     check what they painted - and the net is how a learner is taught to read
 *     a cube on paper, so it teaches the mapping between the object and the
 *     notation.
 *
 * It renders from the same state and the same highlight sets as the 3D view and
 * calls the same `onPickSticker`. Two views of one state, never two states.
 */

/** `SLOTS` is face-major: face index × 9, then row × 3, then column. */
export const slotIndex = (face: Face, row: number, col: number) =>
  FACES.indexOf(face) * 9 + row * 3 + col;

const FACE_WORD: Record<Face, string> = {
  U: 'Up',
  R: 'Right',
  F: 'Front',
  D: 'Down',
  L: 'Left',
  B: 'Back',
};

/**
 * Reading order of the unfolded cross, which is also the focus order. Not
 * `SLOTS` order: a screen-reader user should walk the net the way it is drawn.
 */
const ROWS: Face[][] = [['U'], ['L', 'F', 'R', 'B'], ['D']];
export const FOCUS_ORDER: Face[] = ['U', 'L', 'F', 'R', 'B', 'D'];

const CELL = 34;
const CELL_GAP = 3;
const FACE_SIZE = CELL * 3 + CELL_GAP * 2; // 108
const FACE_GAP = 10;
const LABEL_H = 14;
export const NET_W = FACE_SIZE * 4 + FACE_GAP * 3; // 462
export const NET_H = (FACE_SIZE + LABEL_H) * 3 + FACE_GAP * 2; // 386

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
        // 34pt cells with 5pt of slop are 44pt targets. A literal 44pt grid is
        // 594pt wide and stops being a readable net, so the slop carries it -
        // the 3pt gutter means neighbouring slop regions meet, never overlap.
        hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
        accessibilityRole="button"
        accessibilityState={{ selected: selected.has(slot), disabled: centre }}
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

  const faceBlock = (face: Face) => (
    <View key={face} style={styles.face}>
      <Text style={styles.faceLabel}>{FACE_WORD[face].toUpperCase()}</Text>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.faceRow}>
          {[0, 1, 2].map((col) => cell(face, row, col))}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {/* Two scrollers, one per axis: the net is 462 × 386 and the canvas area
          is smaller than that in both directions on a phone. Scaling it down
          instead would put the cells under the 34pt the hit slop is sized for. */}
      <ScrollView contentContainerStyle={styles.vertical}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.scroll}
        >
        {/* RN's AccessibilityRole union has no "grid"; "list" is the closest
            role it does carry and reads sensibly for a set of 54 cells. */}
        <View accessibilityRole="list" accessibilityLabel="Cube net, 54 stickers">
          {ROWS.map((row, i) => (
            <View key={i} style={styles.netRow}>
              {i !== 1 && <View style={styles.spacer} />}
              {row.map(faceBlock)}
            </View>
          ))}
          </View>
        </ScrollView>
      </ScrollView>
      <Text style={styles.status} accessibilityLiveRegion="polite">
        {status}
      </Text>
    </View>
  );
}

const { surface, line, text, cube, space, type, radius } = tokens;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  vertical: { flexGrow: 1, justifyContent: 'center' },
  scroll: { padding: space.gutter, alignItems: 'center' },
  netRow: { flexDirection: 'row', gap: FACE_GAP, marginBottom: FACE_GAP },
  spacer: { width: FACE_SIZE },
  face: { width: FACE_SIZE, gap: CELL_GAP },
  faceLabel: {
    ...type.overline,
    height: LABEL_H,
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
  status: {
    ...type.caption,
    color: text.tertiary,
    textAlign: 'center',
    paddingBottom: space.sm,
  },
});
