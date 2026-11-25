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
