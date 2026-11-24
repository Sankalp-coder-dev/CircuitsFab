import type { ComponentType } from './types.ts';

export interface GlossaryEntry {
  plain: string;
  analogy: string;
  formulaHtml?: string;
}

export const GLOSSARY_INFO: Partial<Record<ComponentType, GlossaryEntry>> = {
  VDC: {
    plain: 'Pushes electricity steadily in one direction at a fixed voltage, like a battery or USB charger.',
    analogy: 'A water pump running at a constant pressure.',
    formulaHtml: 'ΔV = V<sub>+</sub> − V<sub>−</sub>',
  },
  VAC: {
    plain: 'Pushes electricity back and forth smoothly in a wave. Great for testing audio, filters, and amplifiers.',
    analogy: 'An ocean tide rolling in and out.',
    formulaHtml: 'V(t) = V<sub>p</sub> · sin(2π · f · t)',
  },
  GND: {
    plain: 'The 0V baseline for your entire circuit. Every voltage measurement is compared against Ground.',
    analogy: 'Sea level (0 ft) when measuring mountain heights.',
    formulaHtml: 'V<sub>GND</sub> = 0.00 V',
  },
  R: {
    plain: 'Slows down electric current so delicate parts like LEDs do not burn out.',
    analogy: 'A narrow section in a garden hose that limits water flow.',
    formulaHtml: 'V = I · R &nbsp;|&nbsp; P = I² · R',
  },
  C: {
    plain: 'Stores a small amount of electrical energy and releases it smoothly to filter out sudden spikes.',
    analogy: 'A small water tank that absorbs pressure surges.',
    formulaHtml: 'I = C · (dV / dt) &nbsp;|&nbsp; E = ½ · C · V²',
  },
  L: {
    plain: 'A coil of wire that stores energy in a magnetic field and resists sudden changes in current.',
    analogy: 'A heavy spinning flywheel that resists speeding up or stopping.',
    formulaHtml: 'V = L · (dI / dt)',
  },
  SW: {
    plain: 'A simple mechanical break in a wire. Click it to turn power on or off.',
    analogy: 'A drawbridge—closed lets cars cross, open stops them.',
  },
  LED: {
    plain: 'A tiny light bulb that only works in one direction (+ to −). Always pair it with a resistor.',
    analogy: 'A glowing one-way turnstile.',
    formulaHtml: 'I = I<sub>S</sub> · (e<sup>V / nV<sub>T</sub></sup> − 1)',
  },
  DIODE: {
    plain: 'Forces electricity to flow in only one direction, protecting circuits from backward batteries.',
    analogy: 'A one-way check valve in plumbing.',
    formulaHtml: 'V<sub>f</sub> ≈ 0.7 V',
  },
  NPN: {
    plain: 'Uses a tiny signal at the Base (B) to control a much larger current from Collector (C) to Emitter (E).',
    analogy: 'A light-touch power steering valve.',
    formulaHtml: 'I<sub>C</sub> = β · I<sub>B</sub>',
  },
  PNP: {
    plain: 'The opposite of an NPN transistor: it turns ON when you pull its Base (B) voltage down toward Ground.',
    analogy: 'A spring-loaded valve that opens when you release pressure.',
    formulaHtml: 'I<sub>C</sub> = β · I<sub>B</sub>',
  },
  NMOS: {
    plain: 'A fast electronic switch controlled purely by voltage at its Gate (G) pin, with almost zero wasted power.',
    analogy: 'A touch-sensitive light switch.',
    formulaHtml: 'I<sub>D</sub> = ½ · K<sub>p</sub> · (V<sub>GS</sub> − V<sub>th</sub>)²',
  },
  OPAMP: {
    plain: 'Measures the tiny difference between its + and − inputs and boosts it thousands of times.',
    analogy: 'A megaphone for tiny electrical signals.',
    formulaHtml: 'V<sub>out</sub> = A<sub>v</sub> · (V<sub>+</sub> − V<sub>−</sub>)',
  },
  LOGIC_IN: {
    plain: 'A clickable digital switch that outputs either 0 (0V / OFF) or 1 (5V / ON) for logic gates and FPGAs.',
    analogy: 'A single binary light switch.',
  },
  CLK: {
    plain: 'Ticks back and forth between 0 and 1 at a steady beat to keep digital chips synchronized.',
    analogy: 'A drummer keeping the tempo for a band.',
    formulaHtml: 'f = 1 / T',
  },
  AND: {
    plain: 'Outputs 1 only when BOTH input A and input B are 1.',
    analogy: 'A safe that needs two keys turned at the same time.',
    formulaHtml: 'Y = A · B',
  },
  OR: {
    plain: 'Outputs 1 if EITHER input A or input B (or both) is 1.',
    analogy: 'A hallway light controlled by two switches.',
    formulaHtml: 'Y = A + B',
  },
  NOT: {
    plain: 'Flips the signal: 1 becomes 0, and 0 becomes 1.',
    analogy: 'An opposite-day translator.',
    formulaHtml: 'Y = ¬A',
  },
  NAND: {
    plain: 'Outputs 0 only when both inputs are 1. You can build any digital computer out of NAND gates.',
    formulaHtml: 'Y = ¬(A · B)',
  },
  NOR: {
    plain: 'Outputs 1 only when both inputs are 0.',
    formulaHtml: 'Y = ¬(A + B)',
  },
  XOR: {
    plain: 'Outputs 1 when the two inputs are DIFFERENT from each other.',
    analogy: 'A tie-breaker that lights up when two people disagree.',
    formulaHtml: 'Y = A ⊕ B',
  },
  DFF: {
    plain: 'A 1-bit memory cell. Every time the Clock ticks up, it saves whatever is on D and holds it on Q.',
    analogy: 'A camera snapping a photo on each beat.',
    formulaHtml: 'Q<sub>next</sub> = D (on CLK ↑)',
  },
  SEG7: {
    plain: 'Reads a 4-bit binary number (1, 2, 4, 8) and lights up the matching hex digit (0–9, A–F).',
    analogy: 'A digital scoreboard.',
  },
  FPGA: {
    plain: 'A programmable silicon chip whose internal logic rewires itself using a 16-row Look-Up Table (LUT4).',
    analogy: 'Digital Lego bricks that snap into any hardware circuit you want.',
    formulaHtml: 'Addr = 8·I<sub>3</sub> + 4·I<sub>2</sub> + 2·I<sub>1</sub> + I<sub>0</sub>',
  },
  ARDUINO: {
    plain: 'A beginner-friendly microcontroller board that runs C/C++ code to blink LEDs, read sensors, and drive motors.',
    analogy: 'A tiny programmable brain for your circuit.',
  },
  IC555: {
    plain: 'One of the most famous chips ever made. It creates steady pulses, timers, and blinking lights.',
    analogy: 'An electronic metronome on a chip.',
    formulaHtml: 'V<sub>trg</sub> &lt; ⅓V<sub>CC</sub> &nbsp;|&nbsp; V<sub>thr</sub> &gt; ⅔V<sub>CC</sub>',
  },
};
