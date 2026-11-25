import type { CatalogItem, CircuitComponent, ComponentType, CustomChipDefinition, PinDef } from './types.ts';

export const TRACE_COLORS = [
  '#2D70B3',
  '#C74440',
  '#388C46',
  '#FA7E19',
  '#6042A6',
  '#008184',
];

export const FPGA_PROFILES: Record<string, { label: string; desc: string; lutY0: number; lutY1: number; verilog: string }> = {
  'FULL-ADD': {
    label: 'FULL-ADD',
    desc: '1-Bit Full Adder CLB: Y0 = I0 ^ I1 ^ I2 (Sum), Y1 = Majority(I0, I1, I2) (Carry Out)',
    lutY0: 0b1001011010010110,
    lutY1: 0b1110100011101000,
    verilog: `// Open-Source iCE40 FPGA LUT4 Full Adder
module fpga_clb (
  input  I0, I1, I2, I3,
  output Y0, Y1
);
  assign Y0 = I0 ^ I1 ^ I2;
  assign Y1 = (I0 & I1) | (I1 & I2) | (I0 & I2);
endmodule`,
  },
  'PARITY-4': {
    label: 'PARITY-4',
    desc: '4-Input Even/Odd Parity Generator: Y0 = Odd Parity, Y1 = Even Parity',
    lutY0: 0b0110100110010110,
    lutY1: 0b1001011001101001,
    verilog: `// 4-Bit Parity Generator & Checker
module fpga_clb (
  input  I0, I1, I2, I3,
  output Y0, Y1
);
  assign Y0 = I0 ^ I1 ^ I2 ^ I3;
  assign Y1 = ~(I0 ^ I1 ^ I2 ^ I3);
endmodule`,
  },
  'MUX-2TO1': {
    label: 'MUX-2:1',
    desc: '2-to-1 Multiplexer: I2 selects between I0 (when I2=0) and I1 (when I2=1)',
    lutY0: 0b1100101011001010,
    lutY1: 0b0011010100110101,
    verilog: `// 2-to-1 Digital Multiplexer
module fpga_clb (
  input  I0, I1, I2, I3,
  output Y0, Y1
);
  assign Y0 = (~I2 & I0) | (I2 & I1);
  assign Y1 = ~((~I2 & I0) | (I2 & I1));
endmodule`,
  },
  'ALU-LOGIC': {
    label: 'ALU-SLICE',
    desc: 'Programmable ALU Slice: Y0 = (I0 & I1) ^ I2, Y1 = (I0 | I1) & ~I3',
    lutY0: 0b0111100001111000,
    lutY1: 0b0000000011101110,
    verilog: `// Bit-Slice Logic ALU
module fpga_clb (
  input  I0, I1, I2, I3,
  output Y0, Y1
);
  assign Y0 = (I0 & I1) ^ I2;
  assign Y1 = (I0 | I1) & ~I3;
endmodule`,
  },
};

export const INITIAL_CUSTOM_CHIPS: CustomChipDefinition[] = [
  {
    id: 'chip-darlington',
    name: 'DARL-NPN',
    description: 'Darlington Pair Super-Transistor IC (β² ≈ 10,000) with internal stabilization resistor',
    color: '#FA7E19',
    pins: [
      { id: 'B', label: 'B', dx: -3, dy: 0, description: 'Base Input' },
      { id: 'C', label: 'C', dx: 3, dy: -1, description: 'Collector Output' },
      { id: 'E', label: 'E', dx: 3, dy: 1, description: 'Emitter Return' },
    ],
    subcircuit: [
      { type: 'NPN', pins: { B: 'B', C: 'C', E: 'N_MID' }, value: 100 },
      { type: 'NPN', pins: { B: 'N_MID', C: 'C', E: 'E' }, value: 100 },
      { type: 'R', pins: { A: 'N_MID', B: 'E' }, value: 10000 },
    ],
  },
  {
    id: 'chip-rc-filter',
    name: 'LPF-2ND',
    description: '2-Stage Cascaded RC Low-Pass Filter IC',
    color: '#008184',
    pins: [
      { id: 'IN', label: 'IN', dx: -3, dy: -1, description: 'Signal Input' },
      { id: 'GND', label: 'GND', dx: -3, dy: 1, description: 'Ground Reference' },
      { id: 'OUT', label: 'OUT', dx: 3, dy: 0, description: 'Filtered Output' },
    ],
    subcircuit: [
      { type: 'R', pins: { A: 'IN', B: 'N1' }, value: 1000 },
      { type: 'C', pins: { A: 'N1', B: 'GND' }, value: 0.00001 },
      { type: 'R', pins: { A: 'N1', B: 'OUT' }, value: 1000 },
      { type: 'C', pins: { A: 'OUT', B: 'GND' }, value: 0.00001 },
    ],
  },
];

export const CATALOG: CatalogItem[] = [
  // ANALOG (Sources, RLC Passives, Semiconductors)
  {
    type: 'VDC',
    label: 'VDC',
    shortUnit: 'V',
    category: 'analog',
    defaultValue: 5,
    minVal: -15,
    maxVal: 15,
    stepVal: 0.5,
    maxPowerW: 10,
    maxVoltageV: 50,
    tooltipTitle: 'DC Voltage Source',
    tooltipPhysics: 'Constant voltage potential ΔV = V+ − V−',
    pins: [
      { id: 'POS', label: '+', dx: 0, dy: -2, description: 'Positive Terminal (+V)' },
      { id: 'NEG', label: '−', dx: 0, dy: 2, description: 'Negative Terminal (−V)' },
    ],
  },
  {
    type: 'VAC',
    label: 'AC',
    shortUnit: 'V',
    category: 'analog',
    defaultValue: 5,
    minVal: 0.5,
    maxVal: 15,
    stepVal: 0.5,
    param2Label: 'Hz',
    defaultParam2: 4,
    minParam2: 0.5,
    maxParam2: 25,
    stepParam2: 0.5,
    maxPowerW: 10,
    maxVoltageV: 50,
    tooltipTitle: 'AC Sine Generator',
    tooltipPhysics: 'Sinusoidal source V(t) = Vp · sin(2π·f·t)',
    pins: [
      { id: 'POS', label: '~', dx: 0, dy: -2, description: 'AC Output' },
      { id: 'NEG', label: '−', dx: 0, dy: 2, description: 'AC Return' },
    ],
  },
  {
    type: 'GND',
    label: 'GND',
    shortUnit: '0V',
    category: 'digital',
    defaultValue: 0,
    minVal: 0,
    maxVal: 0,
    stepVal: 0,
    maxPowerW: 100,
    maxVoltageV: 100,
    tooltipTitle: 'Common Ground (0V Bus)',
    tooltipPhysics: '0.00V Common Ground — all GND pins on the board are automatically tied together',
    pins: [
      { id: 'GND', label: '0V', dx: 0, dy: -1, description: 'Common 0V Ground Pin' },
    ],
  },
  {
    type: 'R',
    label: 'R',
    shortUnit: 'Ω',
    category: 'analog',
    defaultValue: 1000,
    minVal: 10,
    maxVal: 100000,
    stepVal: 10,
    logScale: true,
    maxPowerW: 0.25, // 1/4 Watt resistor rating
    maxVoltageV: 200,
    tooltipTitle: 'Resistor (0.25W Rated)',
    tooltipPhysics: 'Ohm’s Law: I = (Va − Vb) / R; burns out if power P = I²R exceeds 250mW',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: 0, description: 'Terminal A' },
      { id: 'B', label: 'B', dx: 2, dy: 0, description: 'Terminal B' },
    ],
  },
  {
    type: 'C',
    label: 'C',
    shortUnit: 'F',
    category: 'analog',
    defaultValue: 0.000047,
    minVal: 0.000001,
    maxVal: 0.001,
    stepVal: 0.000001,
    logScale: true,
    maxPowerW: 1.0,
    maxVoltageV: 16, // 16V Electrolytic rating
    tooltipTitle: 'Electrolytic Capacitor (16V Rated)',
    tooltipPhysics: 'Electric field storage: I = C · dV/dt; dielectric breakdown if |V| > 16V',
    pins: [
      { id: 'A', label: '+', dx: -2, dy: 0, description: 'Plate A' },
      { id: 'B', label: '−', dx: 2, dy: 0, description: 'Plate B' },
    ],
  },
  {
    type: 'L',
    label: 'L',
    shortUnit: 'H',
    category: 'analog',
    defaultValue: 0.5,
    minVal: 0.01,
    maxVal: 5,
    stepVal: 0.05,
    maxPowerW: 0.5,
    maxVoltageV: 40,
    tooltipTitle: 'Inductor',
    tooltipPhysics: 'Magnetic flux coil: V = L · dI/dt',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: 0, description: 'Coil A' },
      { id: 'B', label: 'B', dx: 2, dy: 0, description: 'Coil B' },
    ],
  },
  {
    type: 'SW',
    label: 'SW',
    shortUnit: '',
    category: 'analog',
    defaultValue: 1,
    minVal: 0,
    maxVal: 1,
    stepVal: 1,
    maxPowerW: 2.0,
    maxVoltageV: 30,
    tooltipTitle: 'Toggle Switch',
    tooltipPhysics: 'Click to toggle Open / Closed contact',
    pins: [
      { id: 'A', label: '1', dx: -2, dy: 0, description: 'Terminal 1' },
      { id: 'B', label: '2', dx: 2, dy: 0, description: 'Terminal 2' },
    ],
  },
  {
    type: 'LED',
    label: 'LED',
    shortUnit: 'V',
    category: 'analog',
    defaultValue: 1.8,
    minVal: 1.6,
    maxVal: 3.4,
    stepVal: 0.1,
    maxPowerW: 0.065,
    maxCurrentA: 0.03, // 30mA continuous max (20mA nominal, >35mA blows)
    maxVoltageV: 5.0,
    tooltipTitle: 'Light-Emitting Diode (20mA Nominal, 30mA Max)',
    tooltipPhysics: 'Shockley PN junction calibrated to Vf; requires a series current-limiting resistor (e.g. 220Ω on 5V)',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: 0, description: 'Anode (+)' },
      { id: 'K', label: 'K', dx: 2, dy: 0, description: 'Cathode (−)' },
    ],
  },
  {
    type: 'DIODE',
    label: 'DIODE',
    shortUnit: 'V',
    category: 'analog',
    defaultValue: 0.7,
    minVal: 0.3,
    maxVal: 1.0,
    stepVal: 0.05,
    maxPowerW: 0.3,
    maxCurrentA: 0.2,
    maxVoltageV: 35,
    tooltipTitle: 'Silicon Diode (1N4148, 200mA Max)',
    tooltipPhysics: 'One-way current valve (Vf ≈ 0.7V)',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: 0, description: 'Anode (+)' },
      { id: 'K', label: 'K', dx: 2, dy: 0, description: 'Cathode (−)' },
    ],
  },
  {
    type: 'ZENER',
    label: 'ZENER',
    shortUnit: 'Vz',
    category: 'analog',
    defaultValue: 5.1,
    minVal: 2.4,
    maxVal: 12.0,
    stepVal: 0.3,
    maxPowerW: 0.5,
    maxCurrentA: 0.09,
    maxVoltageV: 15,
    tooltipTitle: 'Zener Voltage Regulator Diode (0.5W Rated)',
    tooltipPhysics: 'Conducts forward at 0.7V and clamps reverse voltage precisely at Vz (2.4V–12V)',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: 0, description: 'Anode (+)' },
      { id: 'K', label: 'K', dx: 2, dy: 0, description: 'Cathode (Clamped Vz)' },
    ],
  },
  {
    type: 'POT',
    label: 'POT',
    shortUnit: 'Ω',
    category: 'analog',
    defaultValue: 10000,
    minVal: 100,
    maxVal: 100000,
    stepVal: 100,
    logScale: true,
    param2Label: 'WIPER',
    defaultParam2: 50,
    minParam2: 1,
    maxParam2: 99,
    stepParam2: 1,
    maxPowerW: 0.25,
    maxVoltageV: 50,
    tooltipTitle: '3-Pin Variable Potentiometer (Voltage Divider)',
    tooltipPhysics: 'Splits resistance R between Top (A→W) and Bottom (W→B) by Wiper %',
    pins: [
      { id: 'A', label: '1', dx: -2, dy: -1, description: 'Terminal 1 (High)' },
      { id: 'B', label: '3', dx: -2, dy: 1, description: 'Terminal 3 (Low)' },
      { id: 'W', label: 'W', dx: 2, dy: 0, description: 'Variable Wiper Output' },
    ],
  },
  {
    type: 'FUSE',
    label: 'FUSE',
    shortUnit: 'A',
    category: 'analog',
    defaultValue: 0.05,
    minVal: 0.01,
    maxVal: 0.5,
    stepVal: 0.01,
    maxPowerW: 2.0,
    maxVoltageV: 60,
    tooltipTitle: 'Resettable Over-Current Protection Fuse',
    tooltipPhysics: 'Low-resistance sacrificial link (0.1Ω) that trips open when current exceeds its trip rating',
    pins: [
      { id: 'A', label: 'IN', dx: -2, dy: 0, description: 'Fuse Input' },
      { id: 'B', label: 'OUT', dx: 2, dy: 0, description: 'Protected Output' },
    ],
  },
  {
    type: 'BUZZER',
    label: 'BUZZ',
    shortUnit: 'V',
    category: 'analog',
    defaultValue: 5,
    minVal: 3,
    maxVal: 12,
    stepVal: 1,
    maxPowerW: 0.3,
    maxCurrentA: 0.05,
    maxVoltageV: 15,
    tooltipTitle: 'Piezo Audio Buzzer / Tone Indicator',
    tooltipPhysics: 'Vibrates piezoelectric diaphragm when voltage across (+ / −) exceeds 2.0V',
    pins: [
      { id: 'A', label: '+', dx: -2, dy: 0, description: 'Positive Drive (+)' },
      { id: 'K', label: '−', dx: 2, dy: 0, description: 'Negative Return (−)' },
    ],
  },
  {
    type: 'NPN',
    label: 'NPN',
    shortUnit: 'β',
    category: 'analog',
    defaultValue: 100,
    minVal: 20,
    maxVal: 400,
    stepVal: 10,
    maxPowerW: 0.35, // 350mW TO-92 limit
    maxVoltageV: 30,
    tooltipTitle: 'NPN Transistor (2N3904, 350mW Max)',
    tooltipPhysics: 'Ebers-Moll BJT: Base current Ib amplifies Collector current Ic = β · Ib',
    pins: [
      { id: 'B', label: 'B', dx: -2, dy: 0, description: 'Base (Control)' },
      { id: 'C', label: 'C', dx: 1, dy: -2, description: 'Collector (Current In)' },
      { id: 'E', label: 'E', dx: 1, dy: 2, description: 'Emitter (Current Out)' },
    ],
  },
  {
    type: 'PNP',
    label: 'PNP',
    shortUnit: 'β',
    category: 'analog',
    defaultValue: 100,
    minVal: 20,
    maxVal: 400,
    stepVal: 10,
    maxPowerW: 0.35,
    maxVoltageV: 30,
    tooltipTitle: 'PNP Transistor (2N3906)',
    tooltipPhysics: 'Conducts Emitter-to-Collector when Base is pulled below Emitter',
    pins: [
      { id: 'B', label: 'B', dx: -2, dy: 0, description: 'Base (Active-Low)' },
      { id: 'E', label: 'E', dx: 1, dy: -2, description: 'Emitter (Current In)' },
      { id: 'C', label: 'C', dx: 1, dy: 2, description: 'Collector (Current Out)' },
    ],
  },
  {
    type: 'NMOS',
    label: 'NMOS',
    shortUnit: 'Vth',
    category: 'analog',
    defaultValue: 1.5,
    minVal: 0.5,
    maxVal: 3.5,
    stepVal: 0.1,
    maxPowerW: 0.4,
    maxVoltageV: 25,
    tooltipTitle: 'N-Channel MOSFET (2N7000)',
    tooltipPhysics: 'Voltage-controlled FET: conducts Drain-to-Source when Vgs > Vth',
    pins: [
      { id: 'G', label: 'G', dx: -2, dy: 0, description: 'Gate' },
      { id: 'D', label: 'D', dx: 1, dy: -2, description: 'Drain' },
      { id: 'S', label: 'S', dx: 1, dy: 2, description: 'Source' },
    ],
  },
  {
    type: 'OPAMP',
    label: 'OPAMP',
    shortUnit: 'Av',
    category: 'analog',
    defaultValue: 1000,
    minVal: 10,
    maxVal: 10000,
    stepVal: 50,
    logScale: true,
    maxPowerW: 0.5,
    maxVoltageV: 24,
    tooltipTitle: 'Operational Amplifier',
    tooltipPhysics: 'Differential Amplifier Vout = Av · (V+ − V−)',
    pins: [
      { id: 'INP', label: '+', dx: -2, dy: -1, description: 'Non-Inverting (+)' },
      { id: 'INN', label: '−', dx: -2, dy: 1, description: 'Inverting (−)' },
      { id: 'OUT', label: 'OUT', dx: 2, dy: 0, description: 'Amplified Output' },
    ],
  },

  // DIGITAL GATES & FPGA
  {
    type: 'LOGIC_IN',
    label: 'BIT 0/1',
    shortUnit: '',
    category: 'digital',
    defaultValue: 1,
    minVal: 0,
    maxVal: 1,
    stepVal: 1,
    maxPowerW: 0.5,
    maxVoltageV: 15,
    tooltipTitle: 'Interactive Digital Bit (0 / 1)',
    tooltipPhysics: 'Click on canvas or sidebar to toggle logic 0 (0V) and logic 1 (+5V)',
    pins: [
      { id: 'Y', label: 'OUT', dx: 2, dy: 0, description: 'Digital Bit Output (0V / 5V)' },
    ],
  },
  {
    type: 'CLK',
    label: 'CLK',
    shortUnit: 'Hz',
    category: 'digital',
    defaultValue: 2,
    minVal: 0.5,
    maxVal: 15,
    stepVal: 0.5,
    maxPowerW: 0.5,
    maxVoltageV: 15,
    tooltipTitle: 'Digital Clock Oscillator',
    tooltipPhysics: 'Generates 0V / 5V square wave clock signal',
    pins: [
      { id: 'Y', label: 'CLK', dx: 2, dy: 0, description: '5V Square Wave Clock Output' },
    ],
  },
  {
    type: 'AND',
    label: 'AND',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.25,
    maxVoltageV: 14,
    tooltipTitle: 'AND Logic Gate',
    tooltipPhysics: 'Output Y = 1 only when both A = 1 and B = 1',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: -1, description: 'Input A' },
      { id: 'B', label: 'B', dx: -2, dy: 1, description: 'Input B' },
      { id: 'Y', label: 'Y', dx: 2, dy: 0, description: 'Output Y = A · B' },
    ],
  },
  {
    type: 'OR',
    label: 'OR',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.25,
    maxVoltageV: 14,
    tooltipTitle: 'OR Logic Gate',
    tooltipPhysics: 'Output Y = 1 when A = 1 or B = 1',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: -1, description: 'Input A' },
      { id: 'B', label: 'B', dx: -2, dy: 1, description: 'Input B' },
      { id: 'Y', label: 'Y', dx: 2, dy: 0, description: 'Output Y = A + B' },
    ],
  },
  {
    type: 'NOT',
    label: 'NOT',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.25,
    maxVoltageV: 14,
    tooltipTitle: 'NOT Inverter Gate',
    tooltipPhysics: 'Inverts digital state: Y = ¬A',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: 0, description: 'Input A' },
      { id: 'Y', label: 'Y', dx: 2, dy: 0, description: 'Output Y = ¬A' },
    ],
  },
  {
    type: 'NAND',
    label: 'NAND',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.25,
    maxVoltageV: 14,
    tooltipTitle: 'NAND Universal Gate',
    tooltipPhysics: 'Output Y = ¬(A · B)',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: -1, description: 'Input A' },
      { id: 'B', label: 'B', dx: -2, dy: 1, description: 'Input B' },
      { id: 'Y', label: 'Y', dx: 2, dy: 0, description: 'Output Y = ¬(A · B)' },
    ],
  },
  {
    type: 'NOR',
    label: 'NOR',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.25,
    maxVoltageV: 14,
    tooltipTitle: 'NOR Universal Gate',
    tooltipPhysics: 'Output Y = ¬(A + B)',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: -1, description: 'Input A' },
      { id: 'B', label: 'B', dx: -2, dy: 1, description: 'Input B' },
      { id: 'Y', label: 'Y', dx: 2, dy: 0, description: 'Output Y = ¬(A + B)' },
    ],
  },
  {
    type: 'XOR',
    label: 'XOR',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.25,
    maxVoltageV: 14,
    tooltipTitle: 'XOR Exclusive-OR Gate',
    tooltipPhysics: 'Output Y = 1 when inputs A and B differ (A ⊕ B)',
    pins: [
      { id: 'A', label: 'A', dx: -2, dy: -1, description: 'Input A' },
      { id: 'B', label: 'B', dx: -2, dy: 1, description: 'Input B' },
      { id: 'Y', label: 'Y', dx: 2, dy: 0, description: 'Output Y = A ⊕ B' },
    ],
  },
  {
    type: 'DFF',
    label: 'D-FF',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.25,
    maxVoltageV: 14,
    tooltipTitle: 'Rising-Edge D Flip-Flop',
    tooltipPhysics: 'Captures Data (D) on rising Clock (CLK ↑) edge and holds state on Q and ~Q',
    pins: [
      { id: 'D', label: 'D', dx: -2, dy: -1, description: 'Data Input D' },
      { id: 'CLK', label: '>', dx: -2, dy: 1, description: 'Rising-Edge Clock Input' },
      { id: 'Q', label: 'Q', dx: 2, dy: -1, description: 'Latched Output Q' },
      { id: 'NQ', label: '~Q', dx: 2, dy: 1, description: 'Inverted Output ~Q' },
    ],
  },
  {
    type: 'SR_LATCH',
    label: 'SR-FF',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.25,
    maxVoltageV: 14,
    tooltipTitle: 'Set-Reset (SR) Bistable Memory Latch',
    tooltipPhysics: 'S = 1 latches Q = 1; R = 1 resets Q = 0; S = R = 0 holds previous memory state',
    pins: [
      { id: 'S', label: 'S', dx: -2, dy: -1, description: 'Set Input (Latches Q=1)' },
      { id: 'R', label: 'R', dx: -2, dy: 1, description: 'Reset Input (Clears Q=0)' },
      { id: 'Q', label: 'Q', dx: 2, dy: -1, description: 'Latched Output Q' },
      { id: 'NQ', label: '~Q', dx: 2, dy: 1, description: 'Inverted Output ~Q' },
    ],
  },
  {
    type: 'COUNTER4',
    label: 'CNT-4B',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.3,
    maxVoltageV: 14,
    tooltipTitle: '4-Bit Synchronous Binary Counter (0–15)',
    tooltipPhysics: 'Increments 4-bit binary output (Q3 Q2 Q1 Q0) on each rising CLK edge; RST=1 clears to 0',
    pins: [
      { id: 'CLK', label: 'CLK', dx: -3, dy: -1, description: 'Rising-Edge Clock Input' },
      { id: 'RST', label: 'RST', dx: -3, dy: 1, description: 'Active-High Reset to 0' },
      { id: 'Q0', label: 'Q0', dx: 3, dy: -2, description: 'Bit 0 Output (Weight 1)' },
      { id: 'Q1', label: 'Q1', dx: 3, dy: -1, description: 'Bit 1 Output (Weight 2)' },
      { id: 'Q2', label: 'Q2', dx: 3, dy: 1, description: 'Bit 2 Output (Weight 4)' },
      { id: 'Q3', label: 'Q3', dx: 3, dy: 2, description: 'Bit 3 Output (Weight 8)' },
    ],
  },
  {
    type: 'SHIFT4',
    label: 'SIPO-4',
    shortUnit: 'V',
    category: 'digital',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 12,
    stepVal: 0.1,
    maxPowerW: 0.3,
    maxVoltageV: 14,
    tooltipTitle: '4-Bit Serial-In Parallel-Out Shift Register (74HC164)',
    tooltipPhysics: 'Shifts serial bit DIN across Q0 → Q1 → Q2 → Q3 on each rising CLK edge',
    pins: [
      { id: 'DIN', label: 'IN', dx: -3, dy: -1, description: 'Serial Data Input' },
      { id: 'CLK', label: 'CLK', dx: -3, dy: 1, description: 'Rising-Edge Shift Clock' },
      { id: 'Q0', label: 'Q0', dx: 3, dy: -2, description: 'Stage 0 Output' },
      { id: 'Q1', label: 'Q1', dx: 3, dy: -1, description: 'Stage 1 Output' },
      { id: 'Q2', label: 'Q2', dx: 3, dy: 1, description: 'Stage 2 Output' },
      { id: 'Q3', label: 'Q3', dx: 3, dy: 2, description: 'Stage 3 Output' },
    ],
  },
  {
    type: 'SEG7',
    label: '7-SEG',
    shortUnit: 'HEX',
    category: 'digital',
    defaultValue: 5,
    minVal: 5,
    maxVal: 5,
    stepVal: 1,
    maxPowerW: 0.4,
    maxVoltageV: 12,
    tooltipTitle: '7-Segment Hex LED Display',
    tooltipPhysics: 'Decodes 4-bit binary nibble (B3 B2 B1 B0) into illuminated hexadecimal glyph (0–F)',
    pins: [
      { id: 'B0', label: '1', dx: -3, dy: -2, description: 'Bit 0 (LSB = 1)' },
      { id: 'B1', label: '2', dx: -3, dy: -1, description: 'Bit 1 (Weight = 2)' },
      { id: 'B2', label: '4', dx: -3, dy: 1, description: 'Bit 2 (Weight = 4)' },
      { id: 'B3', label: '8', dx: -3, dy: 2, description: 'Bit 3 (MSB = 8)' },
    ],
  },

  // CHIPS & MICROCONTROLLERS
  {
    type: 'FPGA',
    label: 'FPGA',
    shortUnit: 'LUT4',
    category: 'chips',
    defaultValue: 5,
    minVal: 3.3,
    maxVal: 5,
    stepVal: 0.1,
    maxPowerW: 0.45,
    maxVoltageV: 6.5,
    tooltipTitle: 'FPGA Configurable Logic Block (Dual 4-Input LUT)',
    tooltipPhysics: 'Programmable silicon Look-Up Table array mapping 4 digital inputs (I0..I3) to 2 synthesized outputs (Y0, Y1)',
    pins: [
      { id: 'I0', label: 'I0', dx: -3, dy: -2, description: 'FPGA LUT Input 0 (LSB)' },
      { id: 'I1', label: 'I1', dx: -3, dy: -1, description: 'FPGA LUT Input 1' },
      { id: 'I2', label: 'I2', dx: -3, dy: 1, description: 'FPGA LUT Input 2' },
      { id: 'I3', label: 'I3', dx: -3, dy: 2, description: 'FPGA LUT Input 3 (MSB)' },
      { id: 'Y0', label: 'Y0', dx: 3, dy: -1, description: 'Synthesized Logic Output Y0' },
      { id: 'Y1', label: 'Y1', dx: 3, dy: 1, description: 'Synthesized Logic Output Y1' },
    ],
  },
  {
    type: 'ARDUINO',
    label: 'UNO',
    shortUnit: 'Hz',
    category: 'chips',
    defaultValue: 2.5,
    minVal: 0.5,
    maxVal: 15,
    stepVal: 0.5,
    param2Label: 'DUTY',
    defaultParam2: 50,
    minParam2: 10,
    maxParam2: 90,
    stepParam2: 5,
    maxPowerW: 0.2,
    maxCurrentA: 0.04, // 40mA absolute max per ATmega328P GPIO pin
    maxVoltageV: 6.0,
    tooltipTitle: 'Arduino Uno R3 (ATmega328P, 40mA Max/Pin)',
    tooltipPhysics: '5V/GND rails, Digital PWM outputs (D13/D11/D9, max 40mA per pin), and 10-bit Analog ADC input (A0)',
    pins: [
      { id: 'VCC', label: '5V', dx: -4, dy: -2, description: '+5.0V Regulated Supply' },
      { id: 'GND', label: 'GND', dx: -4, dy: 0, description: '0V Ground Reference' },
      { id: 'A0', label: 'A0', dx: -4, dy: 2, description: 'Analog ADC Input A0 (0–5V)' },
      { id: 'D13', label: 'D13', dx: 4, dy: -2, description: 'Digital Pin 13 (PWM / Clock Output)' },
      { id: 'D11', label: 'D11', dx: 4, dy: 0, description: 'Digital Pin 11 (Inverted Phase Output)' },
      { id: 'D9', label: 'D9', dx: 4, dy: 2, description: 'Digital Pin 9 (A0 Threshold Output)' },
    ],
  },
  {
    type: 'IC555',
    label: '555',
    shortUnit: 'V',
    category: 'chips',
    defaultValue: 5,
    minVal: 3,
    maxVal: 15,
    stepVal: 0.5,
    maxPowerW: 0.6,
    maxVoltageV: 18,
    tooltipTitle: 'NE555 Timer IC',
    tooltipPhysics: 'Dual comparator (⅓Vcc & ⅔Vcc) + SR Flip-Flop + Discharge transistor',
    pins: [
      { id: 'VCC', label: 'VCC', dx: -3, dy: -2, description: 'Pin 8: Supply Voltage' },
      { id: 'DIS', label: 'DIS', dx: -3, dy: 0, description: 'Pin 7: Open-Collector Discharge' },
      { id: 'GND', label: 'GND', dx: -3, dy: 2, description: 'Pin 1: Ground' },
      { id: 'OUT', label: 'OUT', dx: 3, dy: -2, description: 'Pin 3: Timer Output' },
      { id: 'THR', label: 'THR', dx: 3, dy: 0, description: 'Pin 6: Threshold (> ⅔Vcc)' },
      { id: 'TRG', label: 'TRG', dx: 3, dy: 2, description: 'Pin 2: Trigger (< ⅓Vcc)' },
    ],
  },
];

export function getCatalogItem(type: ComponentType): CatalogItem {
  return CATALOG.find((c) => c.type === type) ?? CATALOG[0];
}

export function getComponentPins(
  comp: CircuitComponent,
  customChips: CustomChipDefinition[]
): PinDef[] {
  if (comp.type === 'CUSTOM_IC' && comp.customChipId) {
    const chip = customChips.find((c) => c.id === comp.customChipId);
    if (chip) return chip.pins;
  }
  return getCatalogItem(comp.type).pins;
}

export function getPinWorldPos(
  comp: CircuitComponent,
  pin: PinDef
): { x: number; y: number } {
  const rad = (comp.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  const rx = pin.dx * cos - pin.dy * sin;
  const ry = pin.dx * sin + pin.dy * cos;
  return {
    x: comp.x + rx,
    y: comp.y + ry,
  };
}

export function formatSI(val: number, unit: string): string {
  if (unit === '0V' || unit === '' || unit === 'LUT4' || unit === 'HEX') return unit;
  const abs = Math.abs(val);
  if (abs === 0) return `0${unit}`;
  if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M${unit}`;
  if (abs >= 1e3) return `${(val / 1e3).toFixed(1)}k${unit}`;
  if (abs >= 1) return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}${unit}`;
  if (abs >= 1e-3) return `${(val * 1e3).toFixed(1)}m${unit}`;
  if (abs >= 1e-6) return `${(val * 1e6).toFixed(0)}μ${unit}`;
  if (abs >= 1e-9) return `${(val * 1e9).toFixed(0)}n${unit}`;
  return `${val.toExponential(1)}${unit}`;
}

export function formatElec(val: number, unit: 'V' | 'A' | 'W'): string {
  const abs = Math.abs(val);
  if (abs < 1e-7) return `0.0${unit}`;
  if (abs >= 1) return `${val.toFixed(2)}${unit}`;
  if (abs >= 1e-3) return `${(val * 1e3).toFixed(1)}m${unit}`;
  return `${(val * 1e6).toFixed(0)}μ${unit}`;
}
