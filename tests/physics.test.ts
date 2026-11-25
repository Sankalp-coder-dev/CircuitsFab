import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_CUSTOM_CHIPS } from '../src/lib/catalog.ts';
import { stepCircuitPhysics } from '../src/lib/physics.ts';
import { PRESETS, TUTORIALS } from '../src/lib/presets.ts';
import type { CircuitComponent, StressConfig, Wire } from '../src/lib/types.ts';

const makeStress = (mode: 'realistic' | 'limited' | 'sandbox'): StressConfig => ({
  physicsMode: mode,
  ambientTempC: 25,
  voltageSurge: 1.0,
  emiNoiseV: 0,
  clockOverdrive: 1.0,
  burnoutEnabled: mode === 'realistic',
});

const runSteps = (comps: CircuitComponent[], wires: Wire[], stress: StressConfig, steps = 30) => {
  for (let i = 0; i < steps; i++) {
    stepCircuitPhysics(comps, wires, INITIAL_CUSTOM_CHIPS, i * 0.002, 0.002, stress);
  }
};

test('Ohm law & Shockley LED: 5V -> 220Ω -> 1.8V LED draws ~14.55mA safely', () => {
  const comps: CircuitComponent[] = [
    { id: 'V1', type: 'VDC', label: 'V1', x: 0, y: 0, rotation: 0, value: 5, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'R1', type: 'R', label: 'R1', x: 4, y: 0, rotation: 0, value: 220, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'D1', type: 'LED', label: 'LED1', x: 8, y: 0, rotation: 0, value: 1.8, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'G1', type: 'GND', label: 'GND', x: 8, y: 4, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
  ];
  const wires: Wire[] = [
    { id: 'w1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w2', fromCompId: 'R1', fromPinId: 'B', toCompId: 'D1', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w3', fromCompId: 'D1', fromPinId: 'K', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
    { id: 'w4', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
  ];
  runSteps(comps, wires, makeStress('realistic'));
  const led = comps.find((c) => c.id === 'D1')!;
  const r = comps.find((c) => c.id === 'R1')!;
  assert.ok(Math.abs(r.branchCurrent - 0.01455) < 0.001, `Expected ~14.55mA, got ${r.branchCurrent}`);
  assert.ok(!led.blown);
  assert.ok(!r.blown);
});

test('Overcurrent physics: 5V -> 25Ω -> 1.8V LED blows in Realistic, warns in Limited, ignores in Sandbox', () => {
  const build = (): [CircuitComponent[], Wire[]] => [
    [
      { id: 'V1', type: 'VDC', label: 'V1', x: 0, y: 0, rotation: 0, value: 5, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'R1', type: 'R', label: 'R1', x: 4, y: 0, rotation: 0, value: 25, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'D1', type: 'LED', label: 'LED1', x: 8, y: 0, rotation: 0, value: 1.8, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
      { id: 'G1', type: 'GND', label: 'GND', x: 8, y: 4, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    ],
    [
      { id: 'w1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w2', fromCompId: 'R1', fromPinId: 'B', toCompId: 'D1', toPinId: 'A', voltage: 0, current: 0 },
      { id: 'w3', fromCompId: 'D1', fromPinId: 'K', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
      { id: 'w4', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
    ],
  ];

  const [cReal, wReal] = build();
  runSteps(cReal, wReal, makeStress('realistic'));
  assert.equal(cReal.find((c) => c.id === 'D1')!.blown, true);

  const [cLim, wLim] = build();
  runSteps(cLim, wLim, makeStress('limited'));
  assert.ok(!cLim.find((c) => c.id === 'D1')!.blown);
  assert.ok(cLim.find((c) => c.id === 'D1')!.failureReason?.includes('OVERLOAD'));

  const [cSand, wSand] = build();
  runSteps(cSand, wSand, makeStress('sandbox'));
  assert.ok(!cSand.find((c) => c.id === 'D1')!.blown);
  assert.equal(cSand.find((c) => c.id === 'D1')!.failureReason, undefined);
});

test('Potentiometer voltage divider: 10V at 25% wiper outputs 2.50V', () => {
  const comps: CircuitComponent[] = [
    { id: 'V1', type: 'VDC', label: 'V1', x: 0, y: 0, rotation: 0, value: 10, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'P1', type: 'POT', label: 'RV1', x: 6, y: 0, rotation: 0, value: 10000, param2: 25, color: '#FA7E19', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'G1', type: 'GND', label: 'GND', x: 6, y: 4, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
  ];
  const wires: Wire[] = [
    { id: 'w1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'P1', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w2', fromCompId: 'P1', fromPinId: 'B', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
    { id: 'w3', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
  ];
  runSteps(comps, wires, makeStress('realistic'));
  const vw = comps.find((c) => c.id === 'P1')!.pinVoltages.W ?? 0;
  assert.ok(Math.abs(vw - 2.5) < 0.05, `Expected 2.50V at 25% wiper, got ${vw}`);
});

test('Resettable Fuse trips open when current exceeds rating', () => {
  const comps: CircuitComponent[] = [
    { id: 'V1', type: 'VDC', label: 'V1', x: 0, y: 0, rotation: 0, value: 5, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'F1', type: 'FUSE', label: 'F1', x: 4, y: 0, rotation: 0, value: 0.05, color: '#FA7E19', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'R1', type: 'R', label: 'R1', x: 8, y: 0, rotation: 0, value: 25, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'G1', type: 'GND', label: 'GND', x: 8, y: 4, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
  ];
  const wires: Wire[] = [
    { id: 'w1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'F1', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w2', fromCompId: 'F1', fromPinId: 'B', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w3', fromCompId: 'R1', fromPinId: 'B', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
    { id: 'w4', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
  ];
  runSteps(comps, wires, makeStress('realistic'));
  assert.equal(comps.find((c) => c.id === 'F1')!.blown, true);
});

test('All 8 presets and 3 tutorials run in Realistic mode with zero unintended burnouts', () => {
  const stress = makeStress('realistic');
  for (const p of PRESETS) {
    const comps = structuredClone(p.components);
    const wires = structuredClone(p.wires);
    runSteps(comps, wires, stress, 40);
    const blown = comps.filter((c) => c.blown);
    assert.equal(blown.length, 0, `Preset ${p.id} had blown parts: ${blown.map((b) => b.label).join(', ')}`);
  }
  for (const t of TUTORIALS) {
    let comps = structuredClone(t.initialComponents);
    let wires = structuredClone(t.initialWires);
    for (const step of t.steps) {
      const res = step.autoDo(comps, wires);
      comps = res.components;
      wires = res.wires;
      runSteps(comps, wires, stress, 30);
      assert.equal(step.check(comps, wires), true, `Tutorial ${t.id} step failed: ${step.badge}`);
      assert.equal(comps.filter((c) => c.blown).length, 0, `Tutorial ${t.id} blew a part`);
    }
  }
});

test('Zener diode regulator: 9V through 220Ω clamps reverse node near 5.1V', () => {
  const comps: CircuitComponent[] = [
    { id: 'V1', type: 'VDC', label: 'V1', x: 0, y: 0, rotation: 0, value: 9, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'R1', type: 'R', label: 'R1', x: 4, y: 0, rotation: 0, value: 220, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'Z1', type: 'ZENER', label: 'Z1', x: 8, y: 2, rotation: 0, value: 5.1, color: '#6042A6', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'G1', type: 'GND', label: 'GND', x: 8, y: 6, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
  ];
  const wires: Wire[] = [
    { id: 'w1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w2', fromCompId: 'R1', fromPinId: 'B', toCompId: 'Z1', toPinId: 'K', voltage: 0, current: 0 },
    { id: 'w3', fromCompId: 'Z1', fromPinId: 'A', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
    { id: 'w4', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
  ];
  runSteps(comps, wires, makeStress('realistic'));
  const vz = comps.find((c) => c.id === 'Z1')!.pinVoltages.K ?? 0;
  assert.ok(Math.abs(vz - 5.1) < 0.25, `Expected Zener clamp ~5.1V, got ${vz}`);
});

test('NPN transistor switch: saturates cleanly and drives 220Ω + LED load', () => {
  const comps: CircuitComponent[] = [
    { id: 'V1', type: 'VDC', label: 'V1', x: 0, y: 0, rotation: 0, value: 5, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'RB', type: 'R', label: 'RB', x: 4, y: 2, rotation: 0, value: 2200, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'RC', type: 'R', label: 'RC', x: 8, y: 0, rotation: 0, value: 220, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'D1', type: 'LED', label: 'LED1', x: 10, y: 0, rotation: 0, value: 1.8, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'Q1', type: 'NPN', label: 'Q1', x: 10, y: 4, rotation: 0, value: 120, color: '#FA7E19', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'G1', type: 'GND', label: 'GND', x: 10, y: 8, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
  ];
  const wires: Wire[] = [
    { id: 'w1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'RB', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w2', fromCompId: 'RB', fromPinId: 'B', toCompId: 'Q1', toPinId: 'B', voltage: 0, current: 0 },
    { id: 'w3', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'RC', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w4', fromCompId: 'RC', fromPinId: 'B', toCompId: 'D1', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w5', fromCompId: 'D1', fromPinId: 'K', toCompId: 'Q1', toPinId: 'C', voltage: 0, current: 0 },
    { id: 'w6', fromCompId: 'Q1', fromPinId: 'E', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
    { id: 'w7', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
  ];
  runSteps(comps, wires, makeStress('realistic'));
  const q1 = comps.find((c) => c.id === 'Q1')!;
  const led = comps.find((c) => c.id === 'D1')!;
  const vce = (q1.pinVoltages.C ?? 0) - (q1.pinVoltages.E ?? 0);
  assert.ok(vce < 0.35, `Expected Q1 in saturation (Vce < 0.35V), got ${vce}`);
  assert.ok(led.branchCurrent > 0.01, `Expected LED current > 10mA, got ${led.branchCurrent}`);
});

test('NMOS low-side switch: conducts Drain-to-Source when Vgs > Vth', () => {
  const comps: CircuitComponent[] = [
    { id: 'V1', type: 'VDC', label: 'V1', x: 0, y: 0, rotation: 0, value: 5, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'R1', type: 'R', label: 'R1', x: 4, y: 0, rotation: 0, value: 1000, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'M1', type: 'NMOS', label: 'M1', x: 8, y: 2, rotation: 0, value: 1.5, color: '#FA7E19', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'G1', type: 'GND', label: 'GND', x: 8, y: 6, rotation: 0, value: 0, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
  ];
  const wires: Wire[] = [
    { id: 'w1', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'M1', toPinId: 'G', voltage: 0, current: 0 },
    { id: 'w2', fromCompId: 'V1', fromPinId: 'POS', toCompId: 'R1', toPinId: 'A', voltage: 0, current: 0 },
    { id: 'w3', fromCompId: 'R1', fromPinId: 'B', toCompId: 'M1', toPinId: 'D', voltage: 0, current: 0 },
    { id: 'w4', fromCompId: 'M1', fromPinId: 'S', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
    { id: 'w5', fromCompId: 'V1', fromPinId: 'NEG', toCompId: 'G1', toPinId: 'GND', voltage: 0, current: 0 },
  ];
  runSteps(comps, wires, makeStress('realistic'));
  const m1 = comps.find((c) => c.id === 'M1')!;
  const vds = (m1.pinVoltages.D ?? 0) - (m1.pinVoltages.S ?? 0);
  assert.ok(vds < 0.5, `Expected NMOS ON (Vds < 0.5V), got ${vds}`);
});

test('4-Bit Counter + 7-Segment Display: counts rising clock edges accurately', () => {
  const comps: CircuitComponent[] = [
    { id: 'CLK1', type: 'LOGIC_IN', label: 'CLK', x: 0, y: 0, rotation: 0, value: 1, switchClosed: false, color: '#FA7E19', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'RST1', type: 'LOGIC_IN', label: 'RST', x: 0, y: 2, rotation: 0, value: 1, switchClosed: false, color: '#2D70B3', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'CNT1', type: 'COUNTER4', label: 'CNT1', x: 6, y: 0, rotation: 0, value: 5, color: '#008184', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'HEX1', type: 'SEG7', label: 'HEX', x: 12, y: 0, rotation: 0, value: 5, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
  ];
  const wires: Wire[] = [
    { id: 'w1', fromCompId: 'CLK1', fromPinId: 'Y', toCompId: 'CNT1', toPinId: 'CLK', voltage: 0, current: 0 },
    { id: 'w2', fromCompId: 'RST1', fromPinId: 'Y', toCompId: 'CNT1', toPinId: 'RST', voltage: 0, current: 0 },
    { id: 'w3', fromCompId: 'CNT1', fromPinId: 'Q0', toCompId: 'HEX1', toPinId: 'B0', voltage: 0, current: 0 },
    { id: 'w4', fromCompId: 'CNT1', fromPinId: 'Q1', toCompId: 'HEX1', toPinId: 'B1', voltage: 0, current: 0 },
    { id: 'w5', fromCompId: 'CNT1', fromPinId: 'Q2', toCompId: 'HEX1', toPinId: 'B2', voltage: 0, current: 0 },
    { id: 'w6', fromCompId: 'CNT1', fromPinId: 'Q3', toCompId: 'HEX1', toPinId: 'B3', voltage: 0, current: 0 },
  ];
  const stress = makeStress('realistic');
  for (let pulse = 0; pulse < 5; pulse++) {
    comps[0].switchClosed = true;
    runSteps(comps, wires, stress, 3);
    comps[0].switchClosed = false;
    runSteps(comps, wires, stress, 3);
  }
  assert.equal(comps.find((c) => c.id === 'CNT1')!.state?.cnt, 5);
  assert.equal(comps.find((c) => c.id === 'HEX1')!.state?.hexVal, 5);
});

test('SR Latch memory: Set latches Q=5V, Hold retains Q=5V, Reset clears Q=0V', () => {
  const comps: CircuitComponent[] = [
    { id: 'S1', type: 'LOGIC_IN', label: 'S', x: 0, y: 0, rotation: 0, value: 1, switchClosed: true, color: '#388C46', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'R1', type: 'LOGIC_IN', label: 'R', x: 0, y: 2, rotation: 0, value: 1, switchClosed: false, color: '#C74440', pinVoltages: {}, branchCurrent: 0, power: 0 },
    { id: 'L1', type: 'SR_LATCH', label: 'L1', x: 6, y: 0, rotation: 0, value: 5, color: '#6042A6', pinVoltages: {}, branchCurrent: 0, power: 0 },
  ];
  const wires: Wire[] = [
    { id: 'w1', fromCompId: 'S1', fromPinId: 'Y', toCompId: 'L1', toPinId: 'S', voltage: 0, current: 0 },
    { id: 'w2', fromCompId: 'R1', fromPinId: 'Y', toCompId: 'L1', toPinId: 'R', voltage: 0, current: 0 },
  ];
  const stress = makeStress('realistic');
  runSteps(comps, wires, stress, 5);
  assert.ok((comps[2].pinVoltages.Q ?? 0) > 4.5, 'Expected Q=5V after Set');

  comps[0].switchClosed = false;
  runSteps(comps, wires, stress, 5);
  assert.ok((comps[2].pinVoltages.Q ?? 0) > 4.5, 'Expected Q=5V held when S=0, R=0');

  comps[1].switchClosed = true;
  runSteps(comps, wires, stress, 5);
  assert.ok((comps[2].pinVoltages.Q ?? 0) < 0.5, 'Expected Q=0V after Reset');
});
