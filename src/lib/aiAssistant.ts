import { PRESETS } from './presets.ts';
import type { CircuitComponent, Wire } from './types.ts';

export interface AiCircuitResult {
  summary: string;
  components: CircuitComponent[];
  wires: Wire[];
}

/**
 * AI Circuit Assistant: parses natural-language circuit requests
 * (e.g. "build a 5V LED dimmer with a transistor", "fpga counter", "555 blinker", "rc filter")
 * and synthesizes ready-to-simulate components + wires.
 */
export function buildCircuitFromPrompt(prompt: string): AiCircuitResult {
  const q = prompt.toLowerCase();

  // 1. 5V LED Dimmer with Transistor (e.g. "build a 5V LED dimmer with a transistor")
  if (q.includes('dimmer') || (q.includes('led') && q.includes('transistor'))) {
    const baseV = q.includes('9v') ? 9 : q.includes('12v') ? 12 : 5;
    return {
      summary: `Built ${baseV}V NPN Transistor LED Dimmer (slide RB to dim LED1)`,
      components: [
        { id: 'V1', type: 'VDC', label: 'VCC', x: 8, y: 11, rotation: 0, value: baseV, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
        { id: 'RB', type: 'R', label: 'RB_DIM', x: 14, y: 11, rotation: 0, value: 10000, color: '#388C46', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
        { id: 'Q1', type: 'NPN', label: 'Q1', x: 20, y: 11, rotation: 0, value: 120, color: '#FA7E19', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
        { id: 'RL', type: 'R', label: 'RL', x: 21, y: 5, rotation: 90, value: 220, color: '#6042A6', pinVoltages: {}, branchCurrent: 0, power: 0 },
        { id: 'LED1', type: 'LED', label: 'LED1', x: 21, y: 8, rotation: 90, value: 1.9, color: '#C74440', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
        { id: 'GND1', type: 'GND', label: 'GND', x: 15, y: 16, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
      ],
      wires: [
        { id: 'aw1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'RB', toPinId: 'A', voltage: 0, current: 0 },
        { id: 'aw2', fromCompId: 'RB', fromPinId: 'B', toCompId: 'Q1', toPinId: 'B', voltage: 0, current: 0 },
        { id: 'aw3', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'RL', toPinId: 'A', voltage: 0, current: 0 },
        { id: 'aw4', fromCompId: 'RL', fromPinId: 'B', toCompId: 'LED1', toPinId: 'A', voltage: 0, current: 0 },
        { id: 'aw5', fromCompId: 'LED1', fromPinId: 'K', toCompId: 'Q1', toPinId: 'C', voltage: 0, current: 0 },
        { id: 'aw6', fromCompId: 'Q1', fromPinId: 'E', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
        { id: 'aw7', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
      ],
    };
  }

  // 2. FPGA / Counter / Adder
  if (q.includes('fpga') || q.includes('counter')) {
    const p = PRESETS.find((pr) => pr.id === 'fpga-counter') ?? PRESETS[1];
    return {
      summary: `Loaded ${p.label}: ${p.tooltip}`,
      components: structuredClone(p.components),
      wires: structuredClone(p.wires),
    };
  }

  // 3. Arduino
  if (q.includes('arduino') || q.includes('uno')) {
    const p = PRESETS[0];
    return {
      summary: `Loaded Arduino Uno R3 + NPN Transistor Driver`,
      components: structuredClone(p.components),
      wires: structuredClone(p.wires),
    };
  }

  // 4. 555 Timer / Blinker
  if (q.includes('555') || q.includes('blink') || q.includes('osc')) {
    const p = PRESETS.find((pr) => pr.id === '555-astable') ?? PRESETS[0];
    return {
      summary: `Loaded NE555 Astable Oscillator Blinker`,
      components: structuredClone(p.components),
      wires: structuredClone(p.wires),
    };
  }

  // 5. RC Low-Pass Filter
  if (q.includes('filter') || q.includes('rc')) {
    return {
      summary: `Built RC Low-Pass Analog Filter (AC input -> R1 -> C1)`,
      components: [
        { id: 'VIN', type: 'VAC', label: 'VIN', x: 8, y: 11, rotation: 0, value: 5, param2: 8, color: '#2D70B3', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
        { id: 'R1', type: 'R', label: 'R1', x: 14, y: 9, rotation: 0, value: 1000, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
        { id: 'C1', type: 'C', label: 'C1', x: 19, y: 11, rotation: 90, value: 0.000047, color: '#FA7E19', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
        { id: 'GND1', type: 'GND', label: 'GND', x: 14, y: 16, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
      ],
      wires: [
        { id: 'fw1', fromCompId: 'VIN', fromPinId: 'POS', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
        { id: 'fw2', fromCompId: 'R1', fromPinId: 'B', toCompId: 'C1', toPinId: 'A', voltage: 0, current: 0 },
        { id: 'fw3', fromCompId: 'C1', fromPinId: 'B', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
        { id: 'fw4', fromCompId: 'VIN', fromPinId: 'NEG', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
      ],
    };
  }

  // Default: Simple 5V LED + Resistor Circuit
  return {
    summary: `Built 5V LED Circuit for "${prompt}"`,
    components: [
      { id: 'V1', type: 'VDC', label: 'V1', x: 8, y: 11, rotation: 0, value: 5, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'R1', type: 'R', label: 'R1', x: 14, y: 8, rotation: 0, value: 220, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'LED1', type: 'LED', label: 'LED1', x: 20, y: 8, rotation: 0, value: 1.8, color: '#C74440', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'GND1', type: 'GND', label: 'GND', x: 14, y: 15, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    ],
    wires: [
      { id: 'dw1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'dw2', fromCompId: 'R1', fromPinId: 'B', toCompId: 'LED1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'dw3', fromCompId: 'LED1', fromPinId: 'K', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
      { id: 'dw4', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
    ],
  };
}
