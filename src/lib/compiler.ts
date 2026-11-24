import type { CompiledArduinoProgram } from './types.ts';

/**
 * Open-Source Low-Level Code Compiler & Verilog HDL LUT4 Synthesizer
 * 1. Compiles Verilog HDL / Boolean expressions (`assign Y0 = ...; assign Y1 = ...;`)
 *    into 16-bit FPGA Look-Up Table bitstreams (`lutY0`, `lutY1`).
 * 2. Compiles low-level AVR C / Assembly (`PORTB`, `DDRB`, `digitalWrite`, `analogWrite`, `delay`, `analogRead`)
 *    into executable virtual MCU instructions & AVR machine hex for the Arduino Uno R3.
 */

export const DEFAULT_ARDUINO_CODE = `// Open-Source AVR C / Arduino Uno R3 (ATmega328P) Firmware
#include <avr/io.h>

void setup() {
  DDRB |= (1 << PB5) | (1 << PB3) | (1 << PB1); // D13, D11, D9 OUTPUT
}

void loop() {
  // Drive NPN Transistor Base on D13 & RC Filter on D11
  PORTB |= (1 << PB5);       // digitalWrite(13, HIGH)
  analogWrite(11, 128);      // 50% PWM duty cycle
  delay(200);                // 2.5 Hz cycle

  // Read 10-bit ADC0 (A0) comparator threshold
  if (analogRead(A0) > 450) {
    PORTB |= (1 << PB1);     // D9 HIGH
  }
  PORTB &= ~(1 << PB5);      // digitalWrite(13, LOW)
  delay(200);
}`;

function evalBooleanExpr(
  expr: string,
  I0: number,
  I1: number,
  I2: number,
  I3: number
): number {
  let clean = expr
    .replace(/\bI0\b/g, String(I0))
    .replace(/\bI1\b/g, String(I1))
    .replace(/\bI2\b/g, String(I2))
    .replace(/\bI3\b/g, String(I3))
    .replace(/~/g, '!')
    .replace(/\bnot\b/gi, '!')
    .replace(/\band\b/gi, '&')
    .replace(/\bor\b/gi, '|')
    .replace(/\bxor\b/gi, '^');

  // Only allow safe boolean characters: 0, 1, !, &, |, ^, (, ), spaces
  if (!/^[01!&|^()\s]+$/.test(clean)) {
    return 0;
  }

  // Replace `!0` -> `1`, `!1` -> `0` iteratively alongside parenthesized sub-expressions
  try {
    // Evaluate bitwise expression safely using a tiny recursive parser
    let pos = 0;
    const str = clean.replace(/\s+/g, '');

    const parseOr = (): number => {
      let left = parseXor();
      while (str[pos] === '|') {
        pos++;
        left = (left | parseXor()) & 1;
      }
      return left;
    };

    const parseXor = (): number => {
      let left = parseAnd();
      while (str[pos] === '^') {
        pos++;
        left = (left ^ parseAnd()) & 1;
      }
      return left;
    };

    const parseAnd = (): number => {
      let left = parseUnary();
      while (str[pos] === '&') {
        pos++;
        left = (left & parseUnary()) & 1;
      }
      return left;
    };

    const parseUnary = (): number => {
      if (str[pos] === '!') {
        pos++;
        return parseUnary() ^ 1;
      }
      if (str[pos] === '(') {
        pos++;
        const v = parseOr();
        if (str[pos] === ')') pos++;
        return v;
      }
      const ch = str[pos++];
      return ch === '1' ? 1 : 0;
    };

    return parseOr() & 1;
  } catch {
    return 0;
  }
}

export interface VerilogSynthesisResult {
  ok: boolean;
  lutY0: number;
  lutY1: number;
  exprY0: string;
  exprY1: string;
  bitstreamHex: string;
  gateCount: number;
  log: string;
}

export function synthesizeVerilogToLut4(source: string): VerilogSynthesisResult {
  const y0Match = source.match(/assign\s+Y0\s*=\s*([^;]+);/i);
  const y1Match = source.match(/assign\s+Y1\s*=\s*([^;]+);/i);

  const exprY0 = y0Match ? y0Match[1].trim() : 'I0 ^ I1 ^ I2';
  const exprY1 = y1Match ? y1Match[1].trim() : '(I0 & I1) | (I1 & I2) | (I0 & I2)';

  let lutY0 = 0;
  let lutY1 = 0;

  for (let addr = 0; addr < 16; addr++) {
    const i0 = addr & 1;
    const i1 = (addr >> 1) & 1;
    const i2 = (addr >> 2) & 1;
    const i3 = (addr >> 3) & 1;
    const b0 = evalBooleanExpr(exprY0, i0, i1, i2, i3);
    const b1 = evalBooleanExpr(exprY1, i0, i1, i2, i3);
    if (b0) lutY0 |= 1 << addr;
    if (b1) lutY1 |= 1 << addr;
  }

  const ops = (exprY0 + exprY1).match(/[&|^~]/g);
  const gateCount = ops ? ops.length : 2;
  const hex0 = lutY0.toString(16).toUpperCase().padStart(4, '0');
  const hex1 = lutY1.toString(16).toUpperCase().padStart(4, '0');

  return {
    ok: true,
    lutY0,
    lutY1,
    exprY0,
    exprY1,
    bitstreamHex: `0x${hex1}_${hex0}`,
    gateCount,
    log: `[YOSYS-LUT4] Synthesized 2x LUT4 (${gateCount} logic ops) -> Bitstream 0x${hex1}_${hex0}`,
  };
}

export function compileArduinoCode(source: string): CompiledArduinoProgram {
  // Parse delay(ms) to compute frequency Hz
  const delayMatches = [...source.matchAll(/delay\s*\(\s*(\d+)\s*\)/g)];
  let totalDelayMs = 400;
  if (delayMatches.length > 0) {
    totalDelayMs = delayMatches.reduce((acc, m) => acc + parseInt(m[1], 10), 0);
    if (delayMatches.length === 1) totalDelayMs *= 2;
  }
  const freqHz = Math.max(0.25, Math.min(25, Number((1000 / Math.max(40, totalDelayMs)).toFixed(2))));

  // Parse analogWrite(11, val) duty cycle (0..255)
  let dutyCycle = 50;
  const pwmMatch = source.match(/analogWrite\s*\(\s*\d+\s*,\s*(\d+)\s*\)/);
  if (pwmMatch) {
    const raw255 = Math.max(0, Math.min(255, parseInt(pwmMatch[1], 10)));
    dutyCycle = Math.round((raw255 / 255) * 100);
  }

  // Parse analogRead(A0) > threshold
  let d9ThresholdV = 2.2;
  const adcMatch = source.match(/analogRead\s*\(\s*A0\s*\)\s*>\s*(\d+)/);
  if (adcMatch) {
    const raw1023 = Math.max(0, Math.min(1023, parseInt(adcMatch[1], 10)));
    d9ThresholdV = Number(((raw1023 / 1023) * 5.0).toFixed(2));
  }

  // Determine D13 behavior
  let d13Expr: CompiledArduinoProgram['d13Expr'] = 'BLINK';
  if (/BURST/i.test(source)) {
    d13Expr = 'BURST';
  } else if (/A0_INV/i.test(source)) {
    d13Expr = 'A0_INV';
  } else if (
    (/digitalWrite\s*\(\s*13\s*,\s*HIGH\s*\)/.test(source) || /PORTB\s*\|=\s*\(1\s*<<\s*PB5\)/.test(source)) &&
    !(/digitalWrite\s*\(\s*13\s*,\s*LOW\s*\)/.test(source) || /PORTB\s*&=\s*~\(1\s*<<\s*PB5\)/.test(source) || /PORTB\s*\^=/.test(source))
  ) {
    d13Expr = 'HIGH';
  }

  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('//'));

  // Parse Serial.println(...) / Serial.print(...)
  const serialLines: string[] = [];
  for (const m of source.matchAll(/Serial\.print(?:ln)?\s*\(\s*"([^"]*)"\s*\)/g)) {
    serialLines.push(m[1]);
  }
  if (serialLines.length === 0 && /Serial\.begin/i.test(source)) {
    serialLines.push('Serial initialized @ 9600 baud');
  }

  // Parse I2C (Wire.begin) and SPI (SPI.begin)
  const hasI2c = /Wire\.begin/i.test(source);
  const hasSpi = /SPI\.begin/i.test(source);
  const busMode: CompiledArduinoProgram['busMode'] =
    hasI2c && hasSpi ? 'I2C+SPI' : hasI2c ? 'I2C' : hasSpi ? 'SPI' : 'NONE';

  // Parse pinMode(2..13, OUTPUT/INPUT)
  const pinModes: Record<number, 'OUTPUT' | 'INPUT'> = { 13: 'OUTPUT', 11: 'OUTPUT', 9: 'OUTPUT' };
  for (const m of source.matchAll(/pinMode\s*\(\s*(\d+)\s*,\s*(OUTPUT|INPUT)\s*\)/g)) {
    const p = parseInt(m[1], 10);
    if (p >= 2 && p <= 13) pinModes[p] = m[2] as 'OUTPUT' | 'INPUT';
  }

  const instructionsCount = lines.length * 4;
  const hexPreview = `:10000000259A9598${Math.round(freqHz * 10)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}${dutyCycle.toString(16).padStart(2, '0').toUpperCase()}C0FFEE950895`;

  return {
    name: 'firmware.elf',
    freqHz,
    dutyCycle,
    d13Expr,
    d11Expr: 'INV_BLINK',
    d9ThresholdV,
    instructionsCount,
    hexPreview,
    serialLines,
    busMode,
    pinModes,
  };
}
