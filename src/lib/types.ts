export type ComponentType =
  | 'VDC'
  | 'VAC'
  | 'GND'
  | 'R'
  | 'C'
  | 'L'
  | 'SW'
  | 'LED'
  | 'DIODE'
  | 'NPN'
  | 'PNP'
  | 'NMOS'
  | 'OPAMP'
  | 'LOGIC_IN'
  | 'CLK'
  | 'AND'
  | 'NAND'
  | 'OR'
  | 'NOR'
  | 'XOR'
  | 'NOT'
  | 'DFF'
  | 'SEG7'
  | 'FPGA'
  | 'IC555'
  | 'ARDUINO'
  | 'CUSTOM_IC';

export type ComponentCategory = 'analog' | 'digital' | 'chips';

export type AppSubpage = 'circuit' | 'fpga' | 'ide' | 'stress' | 'tutorial' | 'glossary' | 'about';

export interface PinDef {
  id: string;
  label: string;
  dx: number;
  dy: number;
  description: string;
}

export interface CustomChipSubNode {
  type: Exclude<ComponentType, 'CUSTOM_IC' | 'ARDUINO' | 'FPGA'>;
  pins: Record<string, string>;
  value: number;
  param2?: number;
}

export interface CustomChipDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
  pins: PinDef[];
  subcircuit: CustomChipSubNode[];
}

export interface StressConfig {
  ambientTempC: number;    // -40°C to +150°C (default 25°C)
  voltageSurge: number;    // 0.5x to 3.0x supply multiplier (default 1.0x)
  emiNoiseV: number;       // 0.0V to 2.5V random electromagnetic interference spike
  clockOverdrive: number;  // 0.5x to 4.0x frequency overdrive
  burnoutEnabled: boolean; // whether exceeding max rating blows the component
}

export interface CompiledArduinoProgram {
  name: string;
  freqHz: number;
  dutyCycle: number;
  d13Expr: 'BLINK' | 'HIGH' | 'LOW' | 'A0_INV' | 'BURST';
  d11Expr: 'INV_BLINK' | 'PWM' | 'HIGH' | 'LOW';
  d9ThresholdV: number;
  instructionsCount: number;
  hexPreview: string;
  serialLines: string[];
  busMode: 'NONE' | 'I2C' | 'SPI' | 'I2C+SPI';
  pinModes: Record<number, 'OUTPUT' | 'INPUT'>;
}

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  label: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  value: number;
  param2?: number;
  color: string;
  probed?: boolean;
  switchClosed?: boolean;
  customChipId?: string;
  // FPGA 16-entry 2-output Look-Up Table
  fpgaLutY0?: number;
  fpgaLutY1?: number;
  fpgaProfile?: string;
  // Live simulation readouts
  pinVoltages: Record<string, number>;
  branchCurrent: number;
  power: number;
  // Simulated Stress & Thermal Telemetry
  tempC?: number;
  stressRatio?: number; // 0.0 to 1.0+ (>1.0 = overload)
  blown?: boolean;
  failureReason?: string;
  state?: Record<string, number>;
}

export interface Wire {
  id: string;
  fromCompId: string;
  fromPinId: string;
  toCompId: string;
  toPinId: string;
  voltage: number;
  current: number;
}

export interface CatalogItem {
  type: ComponentType;
  label: string;
  shortUnit: string;
  category: ComponentCategory;
  defaultValue: number;
  minVal: number;
  maxVal: number;
  stepVal: number;
  logScale?: boolean;
  param2Label?: string;
  defaultParam2?: number;
  minParam2?: number;
  maxParam2?: number;
  stepParam2?: number;
  maxPowerW: number;
  maxVoltageV: number;
  tooltipTitle: string;
  tooltipPhysics: string;
  pins: PinDef[];
}

export interface ProbeSample {
  time: number;
  values: Record<string, number>;
}
