import { FPGA_PROFILES } from './catalog.ts';
import type { CircuitComponent, Wire } from './types.ts';

export interface CircuitPreset {
  id: string;
  label: string;
  tooltip: string;
  components: CircuitComponent[];
  wires: Wire[];
}

export interface TutorialStep {
  badge: string;
  instruction: string;
  targetCompId?: string;
  targetPinId?: string;
  toCompId?: string;
  toPinId?: string;
  highlightPaletteType?: string;
  check: (comps: CircuitComponent[], wires: Wire[]) => boolean;
  autoDo: (comps: CircuitComponent[], wires: Wire[]) => {
    components: CircuitComponent[];
    wires: Wire[];
  };
}

export interface GuidedTutorial {
  id: string;
  label: string;
  tooltip: string;
  initialComponents: CircuitComponent[];
  initialWires: Wire[];
  steps: TutorialStep[];
}

export const PRESETS: CircuitPreset[] = [
  {
    id: 'arduino-npn',
    label: 'UNO + NPN',
    tooltip: 'Open-Source Arduino Uno R3 driving an NPN BJT transistor switch, LED indicator, and RC filter into A0 ADC',
    components: [
      {
        id: 'U1',
        type: 'ARDUINO',
        label: 'UNO',
        x: 9,
        y: 11,
        rotation: 0,
        value: 2.5,
        param2: 50,
        color: '#008184',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'R1',
        type: 'R',
        label: 'R1',
        x: 17,
        y: 9,
        rotation: 0,
        value: 2200,
        color: '#2D70B3',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'Q1',
        type: 'NPN',
        label: 'Q1',
        x: 23,
        y: 11,
        rotation: 0,
        value: 120,
        color: '#FA7E19',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'R2',
        type: 'R',
        label: 'R2',
        x: 24,
        y: 4,
        rotation: 90,
        value: 220,
        color: '#388C46',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'D1',
        type: 'LED',
        label: 'LED1',
        x: 24,
        y: 7,
        rotation: 90,
        value: 1.9,
        color: '#C74440',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'R3',
        type: 'R',
        label: 'R3',
        x: 17,
        y: 15,
        rotation: 0,
        value: 4700,
        color: '#6042A6',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'C1',
        type: 'C',
        label: 'C1',
        x: 13,
        y: 17,
        rotation: 90,
        value: 0.000047,
        color: '#2D70B3',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
    ],
    wires: [
      { id: 'w1', fromCompId: 'U1', fromPinId: 'D13', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w2', fromCompId: 'R1', fromPinId: 'B', toCompId: 'Q1', toPinId: 'B', voltage: 0, current: 0 },
      { id: 'w3', fromCompId: 'U1', fromPinId: 'VCC', toCompId: 'R2', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w4', fromCompId: 'R2', fromPinId: 'B', toCompId: 'D1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w5', fromCompId: 'D1', fromPinId: 'K', toCompId: 'Q1', toPinId: 'C', voltage: 0, current: 0 },
      { id: 'w6', fromCompId: 'Q1', fromPinId: 'E', toCompId: 'U1', toPinId: 'GND', voltage: 0, current: 0 },
      { id: 'w7', fromCompId: 'U1', fromPinId: 'D11', toCompId: 'R3', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w8', fromCompId: 'R3', fromPinId: 'B', toCompId: 'C1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w9', fromCompId: 'C1', fromPinId: 'A', toCompId: 'U1', toPinId: 'A0', voltage: 0, current: 0 },
      { id: 'w10', fromCompId: 'C1', fromPinId: 'B', toCompId: 'U1', toPinId: 'GND', voltage: 0, current: 0 },
    ],
  },
  {
    id: 'fpga-adder',
    label: 'FPGA ALU',
    tooltip: 'Programmable FPGA LUT4 Look-Up Table configured as a 1-Bit Full Adder with 7-Segment Hex Output & Interactive Bits',
    components: [
      {
        id: 'B0',
        type: 'LOGIC_IN',
        label: 'A',
        x: 7,
        y: 7,
        rotation: 0,
        value: 1,
        switchClosed: true,
        color: '#2D70B3',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'B1',
        type: 'LOGIC_IN',
        label: 'B',
        x: 7,
        y: 10,
        rotation: 0,
        value: 1,
        switchClosed: true,
        color: '#388C46',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'B2',
        type: 'CLK',
        label: 'CIN',
        x: 7,
        y: 14,
        rotation: 0,
        value: 1.5,
        color: '#FA7E19',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'U_FPGA',
        type: 'FPGA',
        label: 'FPGA-1',
        x: 15,
        y: 11,
        rotation: 0,
        value: 5,
        fpgaProfile: 'FULL-ADD',
        fpgaLutY0: FPGA_PROFILES['FULL-ADD'].lutY0,
        fpgaLutY1: FPGA_PROFILES['FULL-ADD'].lutY1,
        color: '#6042A6',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'DISP1',
        type: 'SEG7',
        label: 'HEX',
        x: 24,
        y: 11,
        rotation: 0,
        value: 5,
        color: '#C74440',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
    ],
    wires: [
      { id: 'w1', fromCompId: 'B0', fromPinId: 'Y', toCompId: 'U_FPGA', toPinId: 'I0', voltage: 0, current: 0 },
      { id: 'w2', fromCompId: 'B1', fromPinId: 'Y', toCompId: 'U_FPGA', toPinId: 'I1', voltage: 0, current: 0 },
      { id: 'w3', fromCompId: 'B2', fromPinId: 'Y', toCompId: 'U_FPGA', toPinId: 'I2', voltage: 0, current: 0 },
      { id: 'w4', fromCompId: 'U_FPGA', fromPinId: 'Y0', toCompId: 'DISP1', toPinId: 'B0', voltage: 0, current: 0 },
      { id: 'w5', fromCompId: 'U_FPGA', fromPinId: 'Y1', toCompId: 'DISP1', toPinId: 'B1', voltage: 0, current: 0 },
    ],
  },
  {
    id: 'fpga-counter',
    label: 'FPGA COUNTER',
    tooltip: 'Multi-Block FPGA Routing: Two FPGA LUT4 blocks wired with D Flip-Flops to form a 2-bit binary counter on 7-Seg',
    components: [
      { id: 'CLK1', type: 'CLK', label: 'CLK', x: 6, y: 11, rotation: 0, value: 1.5, color: '#FA7E19', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'FF0', type: 'DFF', label: 'FF0', x: 12, y: 8, rotation: 0, value: 5, color: '#2D70B3', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'FF1', type: 'DFF', label: 'FF1', x: 12, y: 14, rotation: 0, value: 5, color: '#388C46', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'FPGA_NEXT', type: 'FPGA', label: 'FPGA_LUT', x: 20, y: 11, rotation: 0, value: 5, fpgaProfile: 'FULL-ADD', fpgaLutY0: 0b0101010101010101, fpgaLutY1: 0b0110011001100110, color: '#6042A6', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'HEX_CNT', type: 'SEG7', label: 'COUNT', x: 27, y: 11, rotation: 0, value: 5, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
    ],
    wires: [
      { id: 'fc1', fromCompId: 'CLK1', fromPinId: 'Y', toCompId: 'FF0', toPinId: 'CLK', voltage: 0, current: 0 },
      { id: 'fc2', fromCompId: 'CLK1', fromPinId: 'Y', toCompId: 'FF1', toPinId: 'CLK', voltage: 0, current: 0 },
      { id: 'fc3', fromCompId: 'FF0', fromPinId: 'Q', toCompId: 'FPGA_NEXT', toPinId: 'I0', voltage: 0, current: 0 },
      { id: 'fc4', fromCompId: 'FF1', fromPinId: 'Q', toCompId: 'FPGA_NEXT', toPinId: 'I1', voltage: 0, current: 0 },
      { id: 'fc5', fromCompId: 'FPGA_NEXT', fromPinId: 'Y0', toCompId: 'FF0', toPinId: 'D', voltage: 0, current: 0 },
      { id: 'fc6', fromCompId: 'FPGA_NEXT', fromPinId: 'Y1', toCompId: 'FF1', toPinId: 'D', voltage: 0, current: 0 },
      { id: 'fc7', fromCompId: 'FF0', fromPinId: 'Q', toCompId: 'HEX_CNT', toPinId: 'B0', voltage: 0, current: 0 },
      { id: 'fc8', fromCompId: 'FF1', fromPinId: 'Q', toCompId: 'HEX_CNT', toPinId: 'B1', voltage: 0, current: 0 },
    ],
  },
  {
    id: 'digital-gates',
    label: 'GATES + FF',
    tooltip: 'Digital XOR + AND Half-Adder feeding a Rising-Edge D Flip-Flop and 7-Segment Hex Display',
    components: [
      {
        id: 'IN_A',
        type: 'LOGIC_IN',
        label: 'IN_A',
        x: 7,
        y: 8,
        rotation: 0,
        value: 1,
        switchClosed: true,
        color: '#2D70B3',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'IN_B',
        type: 'CLK',
        label: 'CLK',
        x: 7,
        y: 14,
        rotation: 0,
        value: 2,
        color: '#FA7E19',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'G_XOR',
        type: 'XOR',
        label: 'XOR1',
        x: 14,
        y: 9,
        rotation: 0,
        value: 5,
        color: '#388C46',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'G_AND',
        type: 'AND',
        label: 'AND1',
        x: 14,
        y: 15,
        rotation: 0,
        value: 5,
        color: '#C74440',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'FF1',
        type: 'DFF',
        label: 'DFF1',
        x: 20,
        y: 10,
        rotation: 0,
        value: 5,
        color: '#6042A6',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'SEG1',
        type: 'SEG7',
        label: 'HEX',
        x: 26,
        y: 12,
        rotation: 0,
        value: 5,
        color: '#C74440',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
    ],
    wires: [
      { id: 'w1', fromCompId: 'IN_A', fromPinId: 'Y', toCompId: 'G_XOR', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w2', fromCompId: 'IN_B', fromPinId: 'Y', toCompId: 'G_XOR', toPinId: 'B', voltage: 0, current: 0 },
      { id: 'w3', fromCompId: 'IN_A', fromPinId: 'Y', toCompId: 'G_AND', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w4', fromCompId: 'IN_B', fromPinId: 'Y', toCompId: 'G_AND', toPinId: 'B', voltage: 0, current: 0 },
      { id: 'w5', fromCompId: 'G_XOR', fromPinId: 'Y', toCompId: 'FF1', toPinId: 'D', voltage: 0, current: 0 },
      { id: 'w6', fromCompId: 'IN_B', fromPinId: 'Y', toCompId: 'FF1', toPinId: 'CLK', voltage: 0, current: 0 },
      { id: 'w7', fromCompId: 'G_XOR', fromPinId: 'Y', toCompId: 'SEG1', toPinId: 'B0', voltage: 0, current: 0 },
      { id: 'w8', fromCompId: 'G_AND', fromPinId: 'Y', toCompId: 'SEG1', toPinId: 'B1', voltage: 0, current: 0 },
      { id: 'w9', fromCompId: 'FF1', fromPinId: 'Q', toCompId: 'SEG1', toPinId: 'B2', voltage: 0, current: 0 },
    ],
  },
  {
    id: 'bjt-amp',
    label: 'BJT AMP',
    tooltip: 'Common-Emitter NPN Transistor AC Voltage Amplifier with Coupling Capacitor',
    components: [
      {
        id: 'V1',
        type: 'VDC',
        label: 'VCC',
        x: 8,
        y: 7,
        rotation: 0,
        value: 9,
        color: '#C74440',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'VIN',
        type: 'VAC',
        label: 'VIN',
        x: 7,
        y: 15,
        rotation: 0,
        value: 0.04,
        param2: 5,
        color: '#2D70B3',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'CC',
        type: 'C',
        label: 'CC',
        x: 12,
        y: 13,
        rotation: 0,
        value: 0.0001,
        color: '#008184',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'R1',
        type: 'R',
        label: 'RB',
        x: 15,
        y: 8,
        rotation: 90,
        value: 330000,
        color: '#388C46',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'RC',
        type: 'R',
        label: 'RC',
        x: 21,
        y: 7,
        rotation: 90,
        value: 2200,
        color: '#FA7E19',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'Q1',
        type: 'NPN',
        label: 'Q1',
        x: 20,
        y: 13,
        rotation: 0,
        value: 150,
        color: '#6042A6',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'GND1',
        type: 'GND',
        label: 'GND',
        x: 21,
        y: 18,
        rotation: 0,
        value: 0,
        color: '#388C46',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
    ],
    wires: [
      { id: 'w1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w2', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'RC', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w3', fromCompId: 'R1', fromPinId: 'B', toCompId: 'Q1', toPinId: 'B', voltage: 0, current: 0 },
      { id: 'w4', fromCompId: 'VIN', fromPinId: 'POS', toCompId: 'CC', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w4b', fromCompId: 'CC', fromPinId: 'B', toCompId: 'Q1', toPinId: 'B', voltage: 0, current: 0 },
      { id: 'w5', fromCompId: 'RC', fromPinId: 'B', toCompId: 'Q1', toPinId: 'C', voltage: 0, current: 0 },
      { id: 'w6', fromCompId: 'Q1', fromPinId: 'E', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
      { id: 'w7', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
      { id: 'w8', fromCompId: 'VIN', fromPinId: 'NEG', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
    ],
  },
  {
    id: '555-astable',
    label: '555 OSC',
    tooltip: 'NE555 Timer IC Astable Oscillator charging & discharging C1 between ⅓Vcc and ⅔Vcc',
    components: [
      {
        id: 'U555',
        type: 'IC555',
        label: 'NE555',
        x: 16,
        y: 11,
        rotation: 0,
        value: 9,
        color: '#FA7E19',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'R1',
        type: 'R',
        label: 'R1',
        x: 10,
        y: 8,
        rotation: 90,
        value: 3300,
        color: '#2D70B3',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'R2',
        type: 'R',
        label: 'R2',
        x: 10,
        y: 13,
        rotation: 90,
        value: 6800,
        color: '#388C46',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'C1',
        type: 'C',
        label: 'C1',
        x: 10,
        y: 17,
        rotation: 90,
        value: 0.000033,
        color: '#C74440',
        probed: true,
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'R3',
        type: 'R',
        label: 'R3',
        x: 23,
        y: 9,
        rotation: 0,
        value: 330,
        color: '#6042A6',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'LED1',
        type: 'LED',
        label: 'LED1',
        x: 26,
        y: 12,
        rotation: 90,
        value: 2.0,
        color: '#C74440',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
      {
        id: 'GND1',
        type: 'GND',
        label: 'GND',
        x: 16,
        y: 19,
        rotation: 0,
        value: 0,
        color: '#388C46',
        pinVoltages: {},
        branchCurrent: 0,
        power: 0,
      },
    ],
    wires: [
      { id: 'w1', fromCompId: 'U555', fromPinId: 'VCC', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w2', fromCompId: 'R1', fromPinId: 'B', toCompId: 'U555', toPinId: 'DIS', voltage: 0, current: 0 },
      { id: 'w3', fromCompId: 'R1', fromPinId: 'B', toCompId: 'R2', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w4', fromCompId: 'R2', fromPinId: 'B', toCompId: 'C1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w5', fromCompId: 'R2', fromPinId: 'B', toCompId: 'U555', toPinId: 'THR', voltage: 0, current: 0 },
      { id: 'w6', fromCompId: 'R2', fromPinId: 'B', toCompId: 'U555', toPinId: 'TRG', voltage: 0, current: 0 },
      { id: 'w7', fromCompId: 'C1', fromPinId: 'B', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
      { id: 'w8', fromCompId: 'U555', fromPinId: 'OUT', toCompId: 'R3', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w9', fromCompId: 'R3', fromPinId: 'B', toCompId: 'LED1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w10', fromCompId: 'LED1', fromPinId: 'K', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
    ],
  },
  {
    id: 'zener-reg',
    label: 'ZENER + FUSE',
    tooltip: '5.1V Zener Diode Voltage Regulator with 50mA Protective Fuse, Potentiometer Divider, and LED Load',
    components: [
      { id: 'V1', type: 'VDC', label: 'VIN', x: 7, y: 11, rotation: 0, value: 9, color: '#C74440', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'F1', type: 'FUSE', label: 'F1', x: 11, y: 8, rotation: 0, value: 0.05, color: '#FA7E19', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'RS', type: 'R', label: 'RS', x: 16, y: 8, rotation: 0, value: 220, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'DZ1', type: 'ZENER', label: 'Z1', x: 20, y: 12, rotation: 270, value: 5.1, color: '#6042A6', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'RL', type: 'R', label: 'RL', x: 25, y: 8, rotation: 0, value: 330, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'LED1', type: 'LED', label: 'LED1', x: 28, y: 12, rotation: 90, value: 1.8, color: '#C74440', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'GND1', type: 'GND', label: 'GND', x: 20, y: 17, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    ],
    wires: [
      { id: 'zw1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'F1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'zw2', fromCompId: 'F1', fromPinId: 'B', toCompId: 'RS', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'zw3', fromCompId: 'RS', fromPinId: 'B', toCompId: 'DZ1', toPinId: 'K', voltage: 0, current: 0 },
      { id: 'zw4', fromCompId: 'DZ1', fromPinId: 'A', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
      { id: 'zw5', fromCompId: 'RS', fromPinId: 'B', toCompId: 'RL', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'zw6', fromCompId: 'RL', fromPinId: 'B', toCompId: 'LED1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'zw7', fromCompId: 'LED1', fromPinId: 'K', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
      { id: 'zw8', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
    ],
  },
  {
    id: 'counter-hex',
    label: '4B COUNTER',
    tooltip: '4-Bit Synchronous Binary Counter IC (CNT-4B) driven by a Clock Oscillator into a 7-Segment Hex Display',
    components: [
      { id: 'CLK1', type: 'CLK', label: 'CLK', x: 8, y: 10, rotation: 0, value: 2, color: '#FA7E19', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'RST1', type: 'LOGIC_IN', label: 'RST', x: 8, y: 13, rotation: 0, value: 1, switchClosed: false, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'CNT1', type: 'COUNTER4', label: 'CNT1', x: 16, y: 11, rotation: 0, value: 5, color: '#008184', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'HEX1', type: 'SEG7', label: 'HEX', x: 25, y: 11, rotation: 0, value: 5, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
    ],
    wires: [
      { id: 'cw1', fromCompId: 'CLK1', fromPinId: 'Y', toCompId: 'CNT1', toPinId: 'CLK', voltage: 0, current: 0 },
      { id: 'cw2', fromCompId: 'RST1', fromPinId: 'Y', toCompId: 'CNT1', toPinId: 'RST', voltage: 0, current: 0 },
      { id: 'cw3', fromCompId: 'CNT1', fromPinId: 'Q0', toCompId: 'HEX1', toPinId: 'B0', voltage: 0, current: 0 },
      { id: 'cw4', fromCompId: 'CNT1', fromPinId: 'Q1', toCompId: 'HEX1', toPinId: 'B1', voltage: 0, current: 0 },
      { id: 'cw5', fromCompId: 'CNT1', fromPinId: 'Q2', toCompId: 'HEX1', toPinId: 'B2', voltage: 0, current: 0 },
      { id: 'cw6', fromCompId: 'CNT1', fromPinId: 'Q3', toCompId: 'HEX1', toPinId: 'B3', voltage: 0, current: 0 },
    ],
  },
];

function connectPins(
  wires: Wire[],
  fromCompId: string,
  fromPinId: string,
  toCompId: string,
  toPinId: string
): Wire[] {
  const exists = wires.some(
    (w) =>
      (w.fromCompId === fromCompId && w.fromPinId === fromPinId && w.toCompId === toCompId && w.toPinId === toPinId) ||
      (w.toCompId === fromCompId && w.toPinId === fromPinId && w.fromCompId === toCompId && w.fromPinId === toPinId)
  );
  if (exists) return wires;
  return [
    ...wires,
    {
      id: `w_auto_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      fromCompId,
      fromPinId,
      toCompId,
      toPinId,
      voltage: 0,
      current: 0,
    },
  ];
}

// Strengthened Beginner-Friendly Interactive Tutorials with Auto-Do Step Support
export const TUTORIALS: GuidedTutorial[] = [
  {
    id: 'tut-led',
    label: '1. LED BASICS',
    tooltip: 'Build a complete 5V Arduino Uno LED circuit from scratch and tune brightness',
    initialComponents: [
      { id: 'U1', type: 'ARDUINO', label: 'UNO', x: 8, y: 11, rotation: 0, value: 2.5, param2: 50, color: '#008184', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'R1', type: 'R', label: 'R1', x: 16, y: 7, rotation: 0, value: 330, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'LED1', type: 'LED', label: 'LED1', x: 22, y: 7, rotation: 0, value: 1.8, color: '#C74440', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
    ],
    initialWires: [
      { id: 'tw2', fromCompId: 'LED1', fromPinId: 'K', toCompId: 'U1', toPinId: 'GND', voltage: 0, current: 0 },
    ],
    steps: [
      {
        badge: 'STEP 1/3: CONNECT 5V POWER TO R1',
        instruction: 'Drag from the 5V pin on UNO to the left pin of resistor R1 (this limits current so the LED stays safe!).',
        targetCompId: 'U1',
        targetPinId: 'VCC',
        toCompId: 'R1',
        toPinId: 'A',
        check: (_c, wires) =>
          wires.some(
            (w) =>
              (w.fromCompId === 'U1' && w.toCompId === 'R1') ||
              (w.fromCompId === 'R1' && w.toCompId === 'U1')
          ),
        autoDo: (comps, wires) => ({
          components: comps,
          wires: connectPins(wires, 'U1', 'VCC', 'R1', 'A'),
        }),
      },
      {
        badge: 'STEP 2/3: WIRE R1 → LED1 (+)',
        instruction: 'Drag from the right pin of R1 to the + (Anode) pin on LED1 to complete the loop and light it up!',
        targetCompId: 'R1',
        targetPinId: 'B',
        toCompId: 'LED1',
        toPinId: 'A',
        check: (comps) => {
          const led = comps.find((c) => c.id === 'LED1');
          return (led?.branchCurrent ?? 0) > 0.001;
        },
        autoDo: (comps, wires) => ({
          components: comps,
          wires: connectPins(wires, 'R1', 'B', 'LED1', 'A'),
        }),
      },
      {
        badge: 'STEP 3/3: TUNE BRIGHTNESS (220Ω)',
        instruction: 'Slide R1 down to 220Ω in the left panel—watch the current rise to ~14.5mA and the LED glow brighter!',
        targetCompId: 'R1',
        check: (comps) => {
          const r1 = comps.find((c) => c.id === 'R1');
          const led = comps.find((c) => c.id === 'LED1');
          return (r1?.value ?? 330) <= 240 && (led?.branchCurrent ?? 0) > 0.012;
        },
        autoDo: (comps, wires) => ({
          components: comps.map((c) => (c.id === 'R1' ? { ...c, value: 220 } : c)),
          wires,
        }),
      },
    ],
  },
  {
    id: 'tut-npn',
    label: '2. NPN SWITCH',
    tooltip: 'Use a small base current into an NPN Transistor (Q1) to switch on an LED load',
    initialComponents: [
      { id: 'BIT1', type: 'LOGIC_IN', label: 'TRIG', x: 7, y: 10, rotation: 0, value: 1, switchClosed: false, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'RB', type: 'R', label: 'RB', x: 13, y: 10, rotation: 0, value: 2200, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'Q1', type: 'NPN', label: 'Q1', x: 19, y: 12, rotation: 0, value: 120, color: '#FA7E19', probed: true, pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'VCC', type: 'VDC', label: 'VCC', x: 26, y: 8, rotation: 0, value: 5, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'RC', type: 'R', label: 'RC', x: 20, y: 4, rotation: 90, value: 220, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'LED1', type: 'LED', label: 'LED1', x: 20, y: 8, rotation: 90, value: 1.8, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'GND1', type: 'GND', label: 'GND', x: 20, y: 17, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    ],
    initialWires: [
      { id: 'nw1', fromCompId: 'BIT1', fromPinId: 'Y', toCompId: 'RB', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'nw2', fromCompId: 'VCC', fromPinId: 'POS', toCompId: 'RC', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'nw2b', fromCompId: 'RC', fromPinId: 'B', toCompId: 'LED1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'nw3', fromCompId: 'LED1', fromPinId: 'K', toCompId: 'Q1', toPinId: 'C', voltage: 0, current: 0 },
      { id: 'nw4', fromCompId: 'Q1', fromPinId: 'E', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
      { id: 'nw5', fromCompId: 'VCC', fromPinId: 'NEG', toCompId: 'GND1', toPinId: 'GND', voltage: 0, current: 0 },
    ],
    steps: [
      {
        badge: 'STEP 1/2: WIRE RB → Q1 BASE',
        instruction: 'Connect the right pin of resistor RB to the Base (B) pin on the left of transistor Q1.',
        targetCompId: 'RB',
        targetPinId: 'B',
        toCompId: 'Q1',
        toPinId: 'B',
        check: (_c, wires) =>
          wires.some(
            (w) =>
              (w.fromCompId === 'RB' && w.toCompId === 'Q1') ||
              (w.fromCompId === 'Q1' && w.toCompId === 'RB')
          ),
        autoDo: (comps, wires) => ({
          components: comps,
          wires: connectPins(wires, 'RB', 'B', 'Q1', 'B'),
        }),
      },
      {
        badge: 'STEP 2/2: CLICK TRIG TO TURN ON (1)',
        instruction: 'Click the TRIG digital bit block on the board to switch it from 0 to 1 (+5V) and turn on Q1!',
        targetCompId: 'BIT1',
        check: (comps) => {
          const led = comps.find((c) => c.id === 'LED1');
          return (led?.branchCurrent ?? 0) > 0.005;
        },
        autoDo: (comps, wires) => ({
          components: comps.map((c) => (c.id === 'BIT1' ? { ...c, switchClosed: true } : c)),
          wires,
        }),
      },
    ],
  },
  {
    id: 'tut-fpga',
    label: '3. FPGA ADDER',
    tooltip: 'Wire a synthesized FPGA Full-Adder output to a 7-Segment Hex Display',
    initialComponents: [
      { id: 'B0', type: 'LOGIC_IN', label: 'BIT0', x: 7, y: 8, rotation: 0, value: 1, switchClosed: false, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'B1', type: 'LOGIC_IN', label: 'BIT1', x: 7, y: 11, rotation: 0, value: 1, switchClosed: true, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'FPGA1', type: 'FPGA', label: 'FPGA1', x: 15, y: 10, rotation: 0, value: 5, fpgaProfile: 'FULL-ADD', fpgaLutY0: FPGA_PROFILES['FULL-ADD'].lutY0, fpgaLutY1: FPGA_PROFILES['FULL-ADD'].lutY1, color: '#6042A6', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'HEX1', type: 'SEG7', label: 'HEX1', x: 23, y: 10, rotation: 0, value: 5, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
    ],
    initialWires: [
      { id: 'fw1', fromCompId: 'B0', fromPinId: 'Y', toCompId: 'FPGA1', toPinId: 'I0', voltage: 0, current: 0 },
      { id: 'fw2', fromCompId: 'B1', fromPinId: 'Y', toCompId: 'FPGA1', toPinId: 'I1', voltage: 0, current: 0 },
      { id: 'fw3', fromCompId: 'FPGA1', fromPinId: 'Y0', toCompId: 'HEX1', toPinId: 'B0', voltage: 0, current: 0 },
    ],
    steps: [
      {
        badge: 'STEP 1/2: WIRE FPGA(Y1) → HEX1(2)',
        instruction: 'Connect Carry Output Y1 on the right of FPGA1 to Pin 2 on the left of the 7-Segment Display.',
        targetCompId: 'FPGA1',
        targetPinId: 'Y1',
        toCompId: 'HEX1',
        toPinId: 'B1',
        check: (_c, wires) =>
          wires.some(
            (w) =>
              (w.fromCompId === 'FPGA1' && w.fromPinId === 'Y1' && w.toCompId === 'HEX1' && w.toPinId === 'B1') ||
              (w.toCompId === 'FPGA1' && w.toPinId === 'Y1' && w.fromCompId === 'HEX1' && w.fromPinId === 'B1')
          ),
        autoDo: (comps, wires) => ({
          components: comps,
          wires: connectPins(wires, 'FPGA1', 'Y1', 'HEX1', 'B1'),
        }),
      },
      {
        badge: 'STEP 2/2: CLICK BIT0 → 1 (1+1=2)',
        instruction: 'Click BIT0 on the canvas so both inputs are 1, making the 7-Segment Display show 2!',
        targetCompId: 'B0',
        check: (comps) => {
          const hex = comps.find((c) => c.id === 'HEX1');
          return (hex?.state?.hexVal ?? 0) === 2;
        },
        autoDo: (comps, wires) => ({
          components: comps.map((c) => (c.id === 'B0' ? { ...c, switchClosed: true } : c)),
          wires,
        }),
      },
    ],
  },
];
