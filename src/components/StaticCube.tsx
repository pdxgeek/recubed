/**
 * The cube as three flat faces, with no GL and no motion.
 *
 * This is the teaching page's path when the animation is switched off -
 * `prefers-reduced-motion`, a screen reader, or simply no GL surface for the
 * page to borrow (see the note at the top of `TeachingPage.tsx`; the app has
 * exactly one and this page never creates a second).
 *
 * It is deliberately not a second renderer. It draws the three faces
 * `src/cube/cases.ts` calls `DEFAULT_VIEW_FACES` - the ones a solver has in
 * view holding the cube - as grids, updated at whatever the playhead is. That
 * is enough to read a case from and enough to watch a piece arrive, which is
 * all the still version has to do.
 *
 * Two accessibility properties it carries that the GL canvas cannot:
 *
 *  - **the colour letter is on every sticker.** Colour is never the only
 *    channel, and the letter is what a red/green-blind reader tells O from R
 *    by. `inkOn` picks the ink by comparing the two contrast ratios directly
 *    rather than thresholding on lightness, which is what keeps white off
 *    orange at 2.85:1.
 *  - **it has an accessible representation at all.** `CubeCanvas` sets
 *    `importantForAccessibility="no-hide-descendants"` on itself precisely
 *    because a GL surface carries none; the flat net is that representation on
 *    the solve screen, and this is it here.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLOR_HEX, COLOR_NAME, CubeState } from '../cube/core';
import {
  FACE_WORD,
  STATIC_FACE_GAP,
  STATIC_STICKER_GAP,
  VISIBLE_FACES,
  faceGrid,
  slotIndex,
  staticFaceSize,
} from '../ui/teaching';
import { inkOn, tokens } from '../ui/theme';

const { surface, line, text, cube, space, radius, type } = tokens;

export interface StaticCubeProps {
  state: CubeState;
  /** Slots the algorithm's cast occupies. Ringed, as the live cube rings them. */
  cast?: number[];
  width: number;
  height: number;
}

export function StaticCube({ state, cast = [], width, height }: StaticCubeProps) {
  const face = staticFaceSize(width, height);
  const sticker = Math.floor((face - STATIC_STICKER_GAP * 2) / 3);
  const lit = new Set(cast);

  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel={describe(state)}>
      {VISIBLE_FACES.map((f) => (
        <View key={f} style={[styles.face, { width: face }]}>
          <Text style={styles.faceLabel} numberOfLines={1}>
            {FACE_WORD[f]}
          </Text>
          <View style={{ width: face, height: face }}>
            {faceGrid(state, f).map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((colour, cix) => {
                  const slot = slotIndex(f, r, cix);
                  const hex = colour ? COLOR_HEX[colour] : cube.blank;
                  return (
                    <View
                      key={cix}
                      style={[
                        styles.sticker,
                        {
                          width: sticker,
                          height: sticker,
                          backgroundColor: hex,
                          // The cast's ring, in the same cyan the live cube
                          // uses and the same cyan the WATCH dot uses, so the
                          // three are one legend.
                          borderColor: lit.has(slot) ? cube.moving : surface.chipRim,
                          borderWidth: lit.has(slot) ? 3 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.letter, { color: inkOn(hex) }]}
                        maxFontSizeMultiplier={1.2}
                      >
                        {colour ?? ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * One sentence naming what the three faces show.
 *
 * Not fifty-four stickers read out: the flat net on the solve screen is the
 * surface for reading a cube sticker by sticker, and it is a better one. This
 * says which faces are drawn and which colours are on them, which is what
 * someone arriving at a still diagram needs to know it is there.
 */
function describe(state: CubeState): string {
  const parts = VISIBLE_FACES.map((f) => {
    const seen = new Set(
      faceGrid(state, f)
        .flat()
        .filter((c): c is NonNullable<typeof c> => c !== null)
    );
    const names = [...seen].map((c) => COLOR_NAME[c].toLowerCase());
    return `${FACE_WORD[f]}: ${names.join(', ')}`;
  });
  return `The cube, ${VISIBLE_FACES.length} faces shown. ${parts.join('. ')}.`;
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: STATIC_FACE_GAP,
    paddingTop: space.sm,
  },
  face: { alignItems: 'center', gap: space.xs },
  faceLabel: { ...type.overline, color: text.tertiary },
  row: { flexDirection: 'row', gap: STATIC_STICKER_GAP, marginBottom: STATIC_STICKER_GAP },
  sticker: {
    borderRadius: radius.sm / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: { ...type.overline, fontSize: 10, lineHeight: 12 },
});
