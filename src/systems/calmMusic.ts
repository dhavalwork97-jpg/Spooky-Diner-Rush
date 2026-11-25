/**
 * Calm background music, as plain data (no sound code here, so it can be tested).
 * A slow loop in A minor: soft chord pads, a low note under each chord and a few quiet melody notes.
 * AudioSystem plays it with WebAudio, so the game still ships no music files.
 */
export const BEAT = 1.0; // seconds per beat (60 bpm)
export const BEATS_PER_BAR = 4;
export const BAR = BEAT * BEATS_PER_BAR;

/** Note frequencies in Hz. */
const N = { A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25 } as const;

export interface Chord {
  /** The low note. */
  bass: number;
  /** The pad notes played together. */
  pad: number[];
}

/** Am - F - C - G, one chord per bar. Played twice per loop. */
export const CHORDS: Chord[] = [
  { bass: N.A2, pad: [N.A3, N.C4, N.E4] },
  { bass: N.F3 / 2, pad: [N.A3, N.C4, N.F4] },
  { bass: N.C3, pad: [N.G3, N.C4, N.E4] },
  { bass: N.G3 / 2, pad: [N.G3, N.B4 / 2, N.D4] },
];

export interface MelodyNote {
  /** Beat inside the bar (0 to 3.5). */
  beat: number;
  freq: number;
  /** Length in beats. */
  len: number;
}

/** Two 4-bar melody lines, slow and sparse. Bars with no entry are left to the pads. */
export const MELODY: MelodyNote[][][] = [
  [
    [{ beat: 1, freq: N.E5, len: 2 }, { beat: 3, freq: N.D5, len: 1 }],
    [{ beat: 0, freq: N.C5, len: 2 }, { beat: 2.5, freq: N.A4, len: 1.5 }],
    [{ beat: 1, freq: N.G4, len: 2 }, { beat: 3, freq: N.E4, len: 1 }],
    [{ beat: 0, freq: N.D5, len: 3 }],
  ],
  [
    [{ beat: 0, freq: N.A4, len: 2 }, { beat: 2, freq: N.C5, len: 2 }],
    [{ beat: 1, freq: N.A4, len: 1.5 }, { beat: 3, freq: N.F4, len: 1 }],
    [{ beat: 0, freq: N.E4, len: 2 }, { beat: 2, freq: N.G4, len: 2 }],
    [{ beat: 1, freq: N.B4, len: 2 }],
  ],
];

/** Bars in one full loop (two melody lines of four bars). */
export const LOOP_BARS = MELODY.length * CHORDS.length;
