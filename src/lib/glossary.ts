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
    plain: 'The shared 0.00V Common Ground return path for your entire circuit. Every GND symbol you place on the board is automatically connected together at 0V.',
    analogy: 'Sea level (0 ft) when measuring mountain heights.',
    formulaHtml: 'V<sub>GND</sub> = 0.00 V (Common Bus)',
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
    plain: 'Forces electricity to flow in only one direction, protecting circuits from backward batteries and flyback spikes.',
    analogy: 'A one-way check valve in plumbing.',
    formulaHtml: 'V<sub>f</sub> ≈ 0.70 V &nbsp;|&nbsp; I = I<sub>S</sub>(e<sup>V/nV<sub>T</sub></sup> − 1)',
  },
  ZENER: {
    plain: 'Acts like a normal diode forward (0.7V), but when wired backward it holds a rock-steady breakdown voltage Vz to regulate power rails.',
    analogy: 'A pressure-relief valve that opens at an exact psi threshold to keep pipe pressure constant.',
    formulaHtml: 'V<sub>K</sub> − V<sub>A</sub> = V<sub>Z</sub> (in reverse breakdown)',
  },
  POT: {
    plain: 'A 3-pin adjustable resistor with a rotating wiper knob. Wiring outer pins to 5V and GND gives a smooth 0V–5V output on the middle Wiper pin.',
    analogy: 'A hot/cold shower mixing valve that blends two pressures smoothly.',
    formulaHtml: 'V<sub>W</sub> = V<sub>B</sub> + (Wiper%) · (V<sub>A</sub> − V<sub>B</sub>)',
  },
  FUSE: {
    plain: 'A sacrificial safety link that carries current normally with almost zero drop, but melts open first if a short circuit draws dangerous current.',
    analogy: 'A weak shear-pin on a snowblower that snaps before the engine gears break.',
    formulaHtml: 'I &gt; I<sub>trip</sub> &rArr; Open Circuit',
  },
  BUZZER: {
    plain: 'A piezoelectric sound transducer that flexes a ceramic disc to emit an audible tone whenever voltage across (+ / −) exceeds 2V.',
    analogy: 'A tiny drumhead tapped by electricity.',
    formulaHtml: 'V<sub>+</sub> − V<sub>−</sub> &ge; 2.0 V &rArr; Acoustic Tone',
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
  SR_LATCH: {
    plain: 'A cross-coupled memory latch with Set (S) and Reset (R) pins. Pulsing S=1 locks Q=1 forever until R=1 clears it back to 0.',
    analogy: 'A start/stop wall switch with two separate pushbuttons.',
    formulaHtml: 'S=1 &rArr; Q=1 &nbsp;|&nbsp; R=1 &rArr; Q=0',
  },
  COUNTER4: {
    plain: 'Counts clock pulses in 4-bit binary (0000 to 1111, or 0 to 15 in decimal). Wire Q0–Q3 straight to a 7-Segment Display to watch it count.',
    analogy: 'A mechanical clicker counter at a stadium gate.',
    formulaHtml: 'Count<sub>next</sub> = (Count + 1) mod 16 (on CLK ↑)',
  },
  SHIFT4: {
    plain: 'Takes bits one at a time on IN and marches them sideways across 4 output pins (Q0 → Q1 → Q2 → Q3) on every clock tick.',
    analogy: 'A bucket brigade passing buckets down a line of four people.',
    formulaHtml: 'Q<sub>3..0</sub> &larr; {Q<sub>2..0</sub>, IN} (on CLK ↑)',
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
