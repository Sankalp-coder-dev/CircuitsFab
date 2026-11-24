import { FPGA_PROFILES, getCatalogItem, getComponentPins } from './catalog.ts';
import type {
  CircuitComponent,
  CompiledArduinoProgram,
  CustomChipDefinition,
  StressConfig,
  Wire,
} from './types.ts';

interface FlatElement {
  id: string;
  parentCompId: string;
  type: string;
  pins: Record<string, number>;
  value: number;
  param2: number;
  switchClosed: boolean;
  blown: boolean;
  fpgaLutY0: number;
  fpgaLutY1: number;
  state: Record<string, number>;
}

const DEFAULT_STRESS: StressConfig = {
  ambientTempC: 25,
  voltageSurge: 1.0,
  emiNoiseV: 0.0,
  clockOverdrive: 1.0,
  burnoutEnabled: false,
};

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(M[row][col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
    }
    if (maxVal < 1e-14) {
      M[col][col] = 1e-9;
    } else if (maxRow !== col) {
      const tmp = M[col];
      M[col] = M[maxRow];
      M[maxRow] = tmp;
    }

    const pivot = M[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot;
      if (Math.abs(factor) < 1e-16) continue;
      for (let k = col; k <= n; k++) {
        M[row][k] -= factor * M[col][k];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    const diag = M[i][i];
    x[i] = Math.abs(diag) > 1e-14 ? sum / diag : 0;
    if (!Number.isFinite(x[i])) x[i] = 0;
    x[i] = Math.max(-80, Math.min(80, x[i]));
  }
  return x;
}

export function stepCircuitPhysics(
  components: CircuitComponent[],
  wires: Wire[],
  customChips: CustomChipDefinition[],
  simTime: number,
  dt: number,
  stress: StressConfig = DEFAULT_STRESS,
  arduinoProg?: CompiledArduinoProgram
): void {
  if (components.length === 0) return;

  // Temperature scaling factor for semiconductor physics: Vt = k*T/q
  const tempK = Math.max(200, stress.ambientTempC + 273.15);
  const Vt = (0.02585 * tempK) / 298.15;
  // Beta & saturation current rise with temperature
  const tempBetaScale = 1 + (stress.ambientTempC - 25) * 0.004;
  const surge = stress.voltageSurge;
  const clkMult = stress.clockOverdrive;

  const pinKeys: string[] = [];
  const keyToIndex = new Map<string, number>();

  const registerKey = (k: string): number => {
    let idx = keyToIndex.get(k);
    if (idx === undefined) {
      idx = pinKeys.length;
      pinKeys.push(k);
      keyToIndex.set(k, idx);
    }
    return idx;
  };

  for (const comp of components) {
    const pins = getComponentPins(comp, customChips);
    for (const p of pins) {
      registerKey(`${comp.id}:${p.id}`);
    }
  }

  const flatElements: FlatElement[] = [];

  for (const comp of components) {
    if (!comp.state) comp.state = {};
    if (comp.type === 'CUSTOM_IC' && comp.customChipId) {
      const chip = customChips.find((c) => c.id === comp.customChipId);
      if (chip) {
        const externalPins = new Set(chip.pins.map((p) => p.id));
        chip.subcircuit.forEach((sub, idx) => {
          for (const target of Object.values(sub.pins)) {
            if (!externalPins.has(target)) {
              registerKey(`${comp.id}__internal_${target}`);
            }
          }
          const subStateKey = `sub_${idx}_v`;
          if (comp.state![subStateKey] === undefined) comp.state![subStateKey] = 0;
        });
      }
    }
  }

  const parent = pinKeys.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (const w of wires) {
    const k1 = `${w.fromCompId}:${w.fromPinId}`;
    const k2 = `${w.toCompId}:${w.toPinId}`;
    const i1 = keyToIndex.get(k1);
    const i2 = keyToIndex.get(k2);
    if (i1 !== undefined && i2 !== undefined) {
      union(i1, i2);
    }
  }

  const gndRoots = new Set<number>();
  for (const comp of components) {
    if (comp.type === 'GND' || comp.type === 'ARDUINO' || comp.type === 'IC555') {
      const idx = keyToIndex.get(`${comp.id}:GND`);
      if (idx !== undefined) gndRoots.add(find(idx));
    }
  }
  if (gndRoots.size === 0) {
    const firstSrc = components.find((c) => c.type === 'VDC' || c.type === 'VAC');
    if (firstSrc) {
      const idx = keyToIndex.get(`${firstSrc.id}:NEG`);
      if (idx !== undefined) gndRoots.add(find(idx));
    }
  }

  const rootToNode = new Map<number, number>();
  let nodeCount = 0;
  for (let i = 0; i < pinKeys.length; i++) {
    const r = find(i);
    if (gndRoots.has(r)) {
      rootToNode.set(r, 0);
    } else if (!rootToNode.has(r)) {
      nodeCount++;
      rootToNode.set(r, nodeCount);
    }
  }

  const getNode = (key: string): number => {
    const idx = keyToIndex.get(key);
    if (idx === undefined) return 0;
    return rootToNode.get(find(idx)) ?? 0;
  };

  for (const comp of components) {
    if (comp.type === 'CUSTOM_IC' && comp.customChipId) {
      const chip = customChips.find((c) => c.id === comp.customChipId);
      if (!chip) continue;
      const externalPins = new Set(chip.pins.map((p) => p.id));
      chip.subcircuit.forEach((sub, idx) => {
        const pinMap: Record<string, number> = {};
        for (const [pId, target] of Object.entries(sub.pins)) {
          const fullKey = externalPins.has(target)
            ? `${comp.id}:${target}`
            : `${comp.id}__internal_${target}`;
          pinMap[pId] = getNode(fullKey);
        }
        flatElements.push({
          id: `${comp.id}_sub_${idx}`,
          parentCompId: comp.id,
          type: sub.type,
          pins: pinMap,
          value: sub.value,
          param2: sub.param2 ?? 0,
          switchClosed: true,
          blown: Boolean(comp.blown),
          fpgaLutY0: 0,
          fpgaLutY1: 0,
          state: comp.state!,
        });
      });
    } else {
      const pins = getComponentPins(comp, customChips);
      const pinMap: Record<string, number> = {};
      for (const p of pins) {
        pinMap[p.id] = getNode(`${comp.id}:${p.id}`);
      }
      flatElements.push({
        id: comp.id,
        parentCompId: comp.id,
        type: comp.type,
        pins: pinMap,
        value: comp.value,
        param2: comp.param2 ?? 0,
        switchClosed: comp.switchClosed !== false,
        blown: Boolean(comp.blown),
        fpgaLutY0: comp.fpgaLutY0 ?? FPGA_PROFILES['FULL-ADD'].lutY0,
        fpgaLutY1: comp.fpgaLutY1 ?? FPGA_PROFILES['FULL-ADD'].lutY1,
        state: comp.state!,
      });
    }
  }

  if (nodeCount === 0) return;

  let V = new Array(nodeCount + 1).fill(0);
  for (const comp of components) {
    const pins = getComponentPins(comp, customChips);
    for (const p of pins) {
      const n = getNode(`${comp.id}:${p.id}`);
      if (n > 0 && comp.pinVoltages[p.id] !== undefined) {
        V[n] = comp.pinVoltages[p.id];
      }
    }
  }

  const stampG = (G: number[][], nA: number, nB: number, g: number) => {
    if (nA > 0) G[nA - 1][nA - 1] += g;
    if (nB > 0) G[nB - 1][nB - 1] += g;
    if (nA > 0 && nB > 0) {
      G[nA - 1][nB - 1] -= g;
      G[nB - 1][nA - 1] -= g;
    }
  };

  const stampI = (rhs: number[], nA: number, nB: number, currentAtoB: number) => {
    if (nA > 0) rhs[nA - 1] -= currentAtoB;
    if (nB > 0) rhs[nB - 1] += currentAtoB;
  };

  const stampVoltageSource = (
    G: number[][],
    rhs: number[],
    nPos: number,
    nNeg: number,
    vTarget: number,
    rInt = 0.02
  ) => {
    const g = 1 / rInt;
    stampG(G, nPos, nNeg, g);
    stampI(rhs, nNeg, nPos, vTarget * g);
  };

  const evalDiodeCompanion = (vdRaw: number, vfNominal: number) => {
    const nVt = 1.75 * Vt * (vfNominal / 0.7);
    const Is = 1e-12;
    const vKnee = vfNominal * 1.42;
    const vdClamped = Math.max(-5, vdRaw);
    if (vdClamped <= vKnee) {
      const expTerm = Math.exp(vdClamped / nVt);
      const id = Is * (expTerm - 1);
      const gd = Math.max(1e-9, (Is / nVt) * expTerm);
      const ieq = id - gd * vdClamped;
      return { id, gd, ieq };
    } else {
      const expKnee = Math.exp(vKnee / nVt);
      const idKnee = Is * (expKnee - 1);
      const gd = Math.min(0.2, (Is / nVt) * expKnee); // ~5 Ohm series bulk resistance above knee
      const id = idKnee + gd * (vdClamped - vKnee);
      const ieq = id - gd * vdClamped;
      return { id, gd, ieq };
    }
  };

  const stampDiode = (
    G: number[][],
    rhs: number[],
    nA: number,
    nK: number,
    vGuess: number[],
    vfNominal: number
  ) => {
    const vdRaw = (vGuess[nA] ?? 0) - (vGuess[nK] ?? 0);
    const { gd, ieq } = evalDiodeCompanion(vdRaw, vfNominal);
    stampG(G, nA, nK, gd);
    stampI(rhs, nA, nK, ieq);
  };

  const emiInstant =
    stress.emiNoiseV > 0 ? stress.emiNoiseV * Math.sin(simTime * 190) * Math.cos(simTime * 73) : 0;

  const MAX_ITER = 8;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    const G: number[][] = Array.from({ length: nodeCount }, () =>
      new Array(nodeCount).fill(0)
    );
    const rhs = new Array(nodeCount).fill(0);

    for (let i = 0; i < nodeCount; i++) {
      G[i][i] += 1e-9;
    }

    for (const el of flatElements) {
      // If a component is blown/burned out from stress test, it acts as an open circuit (100MOhm)
      if (el.blown) {
        const pVals = Object.values(el.pins);
        if (pVals.length >= 2) {
          stampG(G, pVals[0], pVals[1], 1e-8);
        }
        continue;
      }

      switch (el.type) {
        case 'VDC': {
          stampVoltageSource(G, rhs, el.pins.POS, el.pins.NEG, el.value * surge + emiInstant, 0.01);
          break;
        }
        case 'VAC': {
          const freq = (el.param2 || 4) * clkMult;
          const vInst = el.value * surge * Math.sin(2 * Math.PI * freq * simTime) + emiInstant;
          stampVoltageSource(G, rhs, el.pins.POS, el.pins.NEG, vInst, 0.05);
          break;
        }
        case 'LOGIC_IN': {
          const vOut = el.switchClosed ? 5.0 * surge : 0.0;
          stampVoltageSource(G, rhs, el.pins.Y, 0, vOut, 25);
          break;
        }
        case 'CLK': {
          const freq = Math.max(0.2, (el.value || 2) * clkMult);
          const high = (simTime * freq) % 1 < 0.5;
          stampVoltageSource(G, rhs, el.pins.Y, 0, high ? 5.0 * surge : 0.0, 25);
          el.state.clkHigh = high ? 1 : 0;
          break;
        }
        case 'R': {
          // Positive temperature coefficient of resistance
          const tempFactor = 1 + (stress.ambientTempC - 25) * 0.001;
          const r = Math.max(0.1, el.value * tempFactor);
          stampG(G, el.pins.A, el.pins.B, 1 / r);
          break;
        }
        case 'SW': {
          const r = el.switchClosed ? 0.05 : 1e8;
          stampG(G, el.pins.A, el.pins.B, 1 / r);
          break;
        }
        case 'C': {
          const cap = Math.max(1e-12, el.value);
          const gEq = cap / dt;
          const vPrev = el.state[`${el.id}_vPrev`] ?? 0;
          stampG(G, el.pins.A, el.pins.B, gEq);
          stampI(rhs, el.pins.B, el.pins.A, gEq * vPrev);
          break;
        }
        case 'L': {
          const ind = Math.max(1e-6, el.value);
          const gEq = dt / ind;
          const iPrev = el.state[`${el.id}_iPrev`] ?? 0;
          stampG(G, el.pins.A, el.pins.B, gEq);
          stampI(rhs, el.pins.A, el.pins.B, iPrev);
          break;
        }
        case 'DIODE':
        case 'LED': {
          const vf = el.type === 'LED' ? Math.max(1.5, el.value) : 0.7;
          stampDiode(G, rhs, el.pins.A, el.pins.K, V, vf);
          break;
        }
        case 'NPN': {
          const nB = el.pins.B;
          const nC = el.pins.C;
          const nE = el.pins.E;
          const betaF = Math.max(10, (el.value || 100) * tempBetaScale);
          const betaR = 2;
          const alphaF = betaF / (betaF + 1);
          const alphaR = betaR / (betaR + 1);
          const Is = 1e-13;

          const vbe = Math.max(-2, Math.min(0.82, (V[nB] ?? 0) - (V[nE] ?? 0)));
          const vbc = Math.max(-2, Math.min(0.82, (V[nB] ?? 0) - (V[nC] ?? 0)));

          const expBE = Math.exp(vbe / Vt);
          const expBC = Math.exp(vbc / Vt);

          const iF = Is * (expBE - 1);
          const iR = Is * (expBC - 1);
          const gF = Math.max(1e-9, (Is / Vt) * expBE);
          const gR = Math.max(1e-9, (Is / Vt) * expBC);

          const iBE_eq = (1 - alphaF) * (iF - gF * vbe);
          stampG(G, nB, nE, (1 - alphaF) * gF);
          stampI(rhs, nB, nE, iBE_eq);

          const iBC_eq = (1 - alphaR) * (iR - gR * vbc);
          stampG(G, nB, nC, (1 - alphaR) * gR);
          stampI(rhs, nB, nC, iBC_eq);

          const gCE_F = alphaF * gF;
          if (nC > 0) {
            if (nB > 0) G[nC - 1][nB - 1] += gCE_F;
            if (nE > 0) G[nC - 1][nE - 1] -= gCE_F;
          }
          if (nE > 0) {
            if (nB > 0) G[nE - 1][nB - 1] -= gCE_F;
            if (nE > 0) G[nE - 1][nE - 1] += gCE_F;
          }
          const iTransEq = alphaF * (iF - gF * vbe) - alphaR * iR;
          stampI(rhs, nC, nE, iTransEq);
          stampG(G, nC, nE, 1 / 50000);
          break;
        }
        case 'PNP': {
          const nB = el.pins.B;
          const nE = el.pins.E;
          const nC = el.pins.C;
          const betaF = Math.max(10, (el.value || 100) * tempBetaScale);
          const alphaF = betaF / (betaF + 1);
          const Is = 1e-13;

          const veb = Math.max(-2, Math.min(0.82, (V[nE] ?? 0) - (V[nB] ?? 0)));
          const expEB = Math.exp(veb / Vt);
          const iF = Is * (expEB - 1);
          const gF = Math.max(1e-9, (Is / Vt) * expEB);

          stampG(G, nE, nB, (1 - alphaF) * gF);
          stampI(rhs, nE, nB, (1 - alphaF) * (iF - gF * veb));

          const gEC = alphaF * gF;
          if (nE > 0) {
            if (nE > 0) G[nE - 1][nE - 1] += gEC;
            if (nB > 0) G[nE - 1][nB - 1] -= gEC;
          }
          if (nC > 0) {
            if (nE > 0) G[nC - 1][nE - 1] -= gEC;
            if (nB > 0) G[nC - 1][nB - 1] += gEC;
          }
          stampI(rhs, nE, nC, alphaF * (iF - gF * veb));
          stampG(G, nE, nC, 1 / 50000);
          break;
        }
        case 'NMOS': {
          const nG = el.pins.G;
          const nD = el.pins.D;
          const nS = el.pins.S;
          const vth = el.value || 1.5;
          const Kp = 0.04;
          const vgs = (V[nG] ?? 0) - (V[nS] ?? 0);
          const vds = (V[nD] ?? 0) - (V[nS] ?? 0);

          let id = 0;
          let gm = 1e-9;
          let gds = 1e-7;

          if (vgs > vth) {
            const vov = vgs - vth;
            if (vds >= 0) {
              if (vds < vov) {
                id = Kp * (vov * vds - 0.5 * vds * vds);
                gm = Kp * vds;
                gds = Math.max(1e-6, Kp * (vov - vds));
              } else {
                id = 0.5 * Kp * vov * vov * (1 + 0.02 * vds);
                gm = Kp * vov * (1 + 0.02 * vds);
                gds = Math.max(1e-6, 0.5 * Kp * vov * vov * 0.02);
              }
            }
          }

          stampG(G, nD, nS, gds);
          if (nD > 0) {
            if (nG > 0) G[nD - 1][nG - 1] += gm;
            if (nS > 0) G[nD - 1][nS - 1] -= gm;
          }
          if (nS > 0) {
            if (nG > 0) G[nS - 1][nG - 1] -= gm;
            if (nS > 0) G[nS - 1][nS - 1] += gm;
          }
          const ieq = id - gm * vgs - gds * vds;
          stampI(rhs, nD, nS, ieq);
          break;
        }
        case 'OPAMP': {
          const nP = el.pins.INP;
          const nN = el.pins.INN;
          const nOut = el.pins.OUT;
          const gain = el.value || 1000;
          const vDiff = (V[nP] ?? 0) - (V[nN] ?? 0);
          const vTarget = Math.max(-12 * surge, Math.min(12 * surge, gain * vDiff));
          stampG(G, nP, nN, 1e-7);
          stampVoltageSource(G, rhs, nOut, 0, vTarget, 25);
          break;
        }
        case 'AND':
        case 'NAND':
        case 'OR':
        case 'NOR':
        case 'XOR':
        case 'NOT': {
          const vdd = (el.value || 5) * surge;
          const vA = V[el.pins.A] ?? 0;
          const vB = el.pins.B !== undefined ? (V[el.pins.B] ?? 0) : 0;
          const aHigh = vA >= 2.2;
          const bHigh = vB >= 2.2;
          let outHigh = false;
          if (el.type === 'AND') outHigh = aHigh && bHigh;
          else if (el.type === 'NAND') outHigh = !(aHigh && bHigh);
          else if (el.type === 'OR') outHigh = aHigh || bHigh;
          else if (el.type === 'NOR') outHigh = !(aHigh || bHigh);
          else if (el.type === 'XOR') outHigh = aHigh !== bHigh;
          else if (el.type === 'NOT') outHigh = !aHigh;

          stampVoltageSource(G, rhs, el.pins.Y, 0, outHigh ? vdd : 0, 35);
          break;
        }
        case 'DFF': {
          const vdd = (el.value || 5) * surge;
          const qState = el.state.q ?? 0;
          stampG(G, el.pins.D, 0, 1e-7);
          stampG(G, el.pins.CLK, 0, 1e-7);
          stampVoltageSource(G, rhs, el.pins.Q, 0, qState ? vdd : 0, 35);
          stampVoltageSource(G, rhs, el.pins.NQ, 0, qState ? 0 : vdd, 35);
          break;
        }
        case 'SEG7': {
          stampG(G, el.pins.B0, 0, 1e-6);
          stampG(G, el.pins.B1, 0, 1e-6);
          stampG(G, el.pins.B2, 0, 1e-6);
          stampG(G, el.pins.B3, 0, 1e-6);
          break;
        }
        case 'FPGA': {
          const vdd = (el.value || 5) * surge;
          const b0 = (V[el.pins.I0] ?? 0) >= 2.2 ? 1 : 0;
          const b1 = (V[el.pins.I1] ?? 0) >= 2.2 ? 1 : 0;
          const b2 = (V[el.pins.I2] ?? 0) >= 2.2 ? 1 : 0;
          const b3 = (V[el.pins.I3] ?? 0) >= 2.2 ? 1 : 0;
          const lutAddr = (b3 << 3) | (b2 << 2) | (b1 << 1) | b0;

          const y0High = ((el.fpgaLutY0 >> lutAddr) & 1) === 1;
          const y1High = ((el.fpgaLutY1 >> lutAddr) & 1) === 1;

          stampG(G, el.pins.I0, 0, 1e-7);
          stampG(G, el.pins.I1, 0, 1e-7);
          stampG(G, el.pins.I2, 0, 1e-7);
          stampG(G, el.pins.I3, 0, 1e-7);
          stampVoltageSource(G, rhs, el.pins.Y0, 0, y0High ? vdd : 0, 30);
          stampVoltageSource(G, rhs, el.pins.Y1, 0, y1High ? vdd : 0, 30);

          el.state.lutAddr = lutAddr;
          el.state.y0 = y0High ? 1 : 0;
          el.state.y1 = y1High ? 1 : 0;
          break;
        }
        case 'IC555': {
          const nVcc = el.pins.VCC;
          const nGnd = el.pins.GND;
          const nOut = el.pins.OUT;
          const nDis = el.pins.DIS;
          const nThr = el.pins.THR;
          const nTrg = el.pins.TRG;

          stampG(G, nVcc, nGnd, 1 / 15000);
          const vccSupply = (el.value || 5) * surge;
          const vccActual = (V[nVcc] ?? 0) > 1.5 ? V[nVcc] : vccSupply;
          stampVoltageSource(G, rhs, nVcc, nGnd, vccSupply, 0.5);

          const latchQ = el.state.ffQ ?? 1;
          const vOutTarget = latchQ > 0.5 ? vccActual : 0.05;
          stampVoltageSource(G, rhs, nOut, nGnd, vOutTarget, 15);

          const rDis = latchQ > 0.5 ? 1e7 : 12;
          stampG(G, nDis, nGnd, 1 / rDis);

          stampG(G, nThr, nGnd, 1e-7);
          stampG(G, nTrg, nGnd, 1e-7);
          break;
        }
        case 'ARDUINO': {
          const nVcc = el.pins.VCC;
          const nGnd = el.pins.GND;
          const nD13 = el.pins.D13;
          const nD11 = el.pins.D11;
          const nD9 = el.pins.D9;
          const nA0 = el.pins.A0;

          const railV = 5.0 * surge;
          stampVoltageSource(G, rhs, nVcc, nGnd, railV, 0.05);

          const baseFreq = arduinoProg ? arduinoProg.freqHz : el.value || 2.5;
          const freq = Math.max(0.2, baseFreq * clkMult);
          const dutyPct = arduinoProg ? arduinoProg.dutyCycle : el.param2 || 50;
          const duty = Math.max(5, Math.min(95, dutyPct)) / 100;
          const phase = (simTime * freq) % 1;

          const vA0 = (V[nA0] ?? 0) - (V[nGnd] ?? 0);
          const thresh = arduinoProg ? arduinoProg.d9ThresholdV : 2.2;

          let d13High = phase < duty;
          if (arduinoProg) {
            if (arduinoProg.d13Expr === 'HIGH') d13High = true;
            else if (arduinoProg.d13Expr === 'LOW') d13High = false;
            else if (arduinoProg.d13Expr === 'A0_INV') d13High = vA0 < thresh;
            else if (arduinoProg.d13Expr === 'BURST') d13High = ((simTime * freq * 3) % 1) < 0.5 && phase < duty;
          }

          let d11High = ((phase + 0.5) % 1) < duty;
          if (arduinoProg) {
            if (arduinoProg.d11Expr === 'HIGH') d11High = true;
            else if (arduinoProg.d11Expr === 'LOW') d11High = false;
          }

          const d9High = vA0 >= thresh;

          stampVoltageSource(G, rhs, nD13, nGnd, d13High ? railV : 0.0, 35);
          stampVoltageSource(G, rhs, nD11, nGnd, d11High ? railV : 0.0, 35);
          stampVoltageSource(G, rhs, nD9, nGnd, d9High ? railV : 0.0, 35);

          stampG(G, nA0, nGnd, 1e-8);

          el.state.d13 = d13High ? 1 : 0;
          el.state.d11 = d11High ? 1 : 0;
          el.state.d9 = d9High ? 1 : 0;
          el.state.adcA0 = Math.max(0, Math.min(1023, Math.round((vA0 / 5.0) * 1023)));
          break;
        }
      }
    }

    const sol = solveLinearSystem(G, rhs);
    let maxDiff = 0;
    for (let i = 1; i <= nodeCount; i++) {
      const nextV = sol[i - 1] ?? 0;
      const damped = iter < 2 ? nextV : 0.65 * nextV + 0.35 * V[i];
      maxDiff = Math.max(maxDiff, Math.abs(damped - V[i]));
      V[i] = damped;
    }
    if (maxDiff < 1e-4 && iter >= 1) break;
  }

  for (const el of flatElements) {
    if (el.blown) continue;
    if (el.type === 'C') {
      const va = V[el.pins.A] ?? 0;
      const vb = V[el.pins.B] ?? 0;
      const vNow = va - vb;
      const vPrev = el.state[`${el.id}_vPrev`] ?? 0;
      el.state[`${el.id}_iNow`] = (Math.max(1e-12, el.value) / dt) * (vNow - vPrev);
      el.state[`${el.id}_vPrev`] = vNow;
    } else if (el.type === 'L') {
      const va = V[el.pins.A] ?? 0;
      const vb = V[el.pins.B] ?? 0;
      const vNow = va - vb;
      const iPrev = el.state[`${el.id}_iPrev`] ?? 0;
      const iNow = iPrev + (dt / Math.max(1e-6, el.value)) * vNow;
      el.state[`${el.id}_iPrev`] = iNow;
      el.state[`${el.id}_iNow`] = iNow;
    } else if (el.type === 'IC555') {
      const vVcc = Math.max(3, (V[el.pins.VCC] ?? el.value) - (V[el.pins.GND] ?? 0));
      const vThr = (V[el.pins.THR] ?? 0) - (V[el.pins.GND] ?? 0);
      const vTrg = (V[el.pins.TRG] ?? 0) - (V[el.pins.GND] ?? 0);
      let ffQ = el.state.ffQ ?? 1;
      if (vTrg < vVcc / 3) ffQ = 1;
      else if (vThr > (2 * vVcc) / 3) ffQ = 0;
      el.state.ffQ = ffQ;
    } else if (el.type === 'DFF') {
      const clkNow = (V[el.pins.CLK] ?? 0) >= 2.2 ? 1 : 0;
      const clkPrev = el.state.clkPrev ?? 0;
      if (clkNow === 1 && clkPrev === 0) {
        el.state.q = (V[el.pins.D] ?? 0) >= 2.2 ? 1 : 0;
      }
      el.state.clkPrev = clkNow;
    } else if (el.type === 'SEG7') {
      const b0 = (V[el.pins.B0] ?? 0) >= 2.2 ? 1 : 0;
      const b1 = (V[el.pins.B1] ?? 0) >= 2.2 ? 1 : 0;
      const b2 = (V[el.pins.B2] ?? 0) >= 2.2 ? 1 : 0;
      const b3 = (V[el.pins.B3] ?? 0) >= 2.2 ? 1 : 0;
      el.state.hexVal = (b3 << 3) | (b2 << 2) | (b1 << 1) | b0;
    }
  }

  for (const comp of components) {
    const pins = getComponentPins(comp, customChips);
    for (const p of pins) {
      const n = getNode(`${comp.id}:${p.id}`);
      comp.pinVoltages[p.id] = V[n] ?? 0;
    }

    if (comp.blown) {
      comp.branchCurrent = 0;
      comp.power = 0;
      continue;
    }

    let current = 0;
    let vDrop = 0;

    switch (comp.type) {
      case 'R': {
        vDrop = (comp.pinVoltages.A ?? 0) - (comp.pinVoltages.B ?? 0);
        current = vDrop / Math.max(0.1, comp.value);
        break;
      }
      case 'SW': {
        vDrop = (comp.pinVoltages.A ?? 0) - (comp.pinVoltages.B ?? 0);
        current = comp.switchClosed !== false ? vDrop / 0.05 : 0;
        break;
      }
      case 'C': {
        vDrop = (comp.pinVoltages.A ?? 0) - (comp.pinVoltages.B ?? 0);
        current = comp.state?.[`${comp.id}_iNow`] ?? 0;
        break;
      }
      case 'L': {
        vDrop = (comp.pinVoltages.A ?? 0) - (comp.pinVoltages.B ?? 0);
        current = comp.state?.[`${comp.id}_iNow`] ?? 0;
        break;
      }
      case 'DIODE':
      case 'LED': {
        vDrop = (comp.pinVoltages.A ?? 0) - (comp.pinVoltages.K ?? 0);
        const vf = comp.type === 'LED' ? Math.max(1.5, comp.value) : 0.7;
        const { id } = evalDiodeCompanion(vDrop, vf);
        current = Math.max(0, id);
        break;
      }
      case 'NPN': {
        const vbe = Math.max(-2, Math.min(0.82, (comp.pinVoltages.B ?? 0) - (comp.pinVoltages.E ?? 0)));
        const vbc = Math.max(-2, Math.min(0.82, (comp.pinVoltages.B ?? 0) - (comp.pinVoltages.C ?? 0)));
        const vce = (comp.pinVoltages.C ?? 0) - (comp.pinVoltages.E ?? 0);
        vDrop = vce;
        const betaF = Math.max(10, (comp.value || 100) * tempBetaScale);
        const alphaF = betaF / (betaF + 1);
        const Is = 1e-13;
        const iF = Is * (Math.exp(vbe / Vt) - 1);
        const iR = Is * (Math.exp(vbc / Vt) - 1);
        current = alphaF * iF - iR + vce / 50000;
        break;
      }
      case 'PNP': {
        const veb = Math.max(-2, Math.min(0.82, (comp.pinVoltages.E ?? 0) - (comp.pinVoltages.B ?? 0)));
        const vec = (comp.pinVoltages.E ?? 0) - (comp.pinVoltages.C ?? 0);
        vDrop = vec;
        const betaF = Math.max(10, (comp.value || 100) * tempBetaScale);
        const alphaF = betaF / (betaF + 1);
        const Is = 1e-13;
        const iF = Is * (Math.exp(veb / Vt) - 1);
        current = alphaF * iF + vec / 50000;
        break;
      }
      case 'NMOS': {
        const vgs = (comp.pinVoltages.G ?? 0) - (comp.pinVoltages.S ?? 0);
        const vds = (comp.pinVoltages.D ?? 0) - (comp.pinVoltages.S ?? 0);
        vDrop = vds;
        const vth = comp.value || 1.5;
        if (vgs > vth && vds > 0) {
          const vov = vgs - vth;
          current = vds < vov ? 0.04 * (vov * vds - 0.5 * vds * vds) : 0.02 * vov * vov;
        }
        break;
      }
      case 'VDC':
      case 'VAC': {
        vDrop = (comp.pinVoltages.POS ?? 0) - (comp.pinVoltages.NEG ?? 0);
        const target =
          comp.type === 'VDC'
            ? comp.value * surge
            : comp.value * surge * Math.sin(2 * Math.PI * (comp.param2 || 4) * clkMult * simTime);
        const rInt = comp.type === 'VDC' ? 0.01 : 0.05;
        current = (target - vDrop) / rInt;
        break;
      }
      case 'ARDUINO': {
        vDrop = comp.pinVoltages.D13 ?? 0;
        const d13Target = comp.state?.d13 ? 5.0 * surge : 0.0;
        current = (d13Target - vDrop) / 35;
        break;
      }
      case 'IC555': {
        vDrop = comp.pinVoltages.OUT ?? 0;
        const outTarget = (comp.state?.ffQ ?? 1) > 0.5 ? (comp.value || 5) * surge : 0.05;
        current = (outTarget - vDrop) / 15;
        break;
      }
      default: {
        const vals = Object.values(comp.pinVoltages);
        vDrop = vals.length >= 2 ? vals[0] - vals[vals.length - 1] : vals[0] ?? 0;
        current = vDrop * 0.002;
      }
    }

    comp.branchCurrent = current;
    comp.power = Math.abs(vDrop * current);

    // Thermal & Electrical Stress Computation
    const cat = getCatalogItem(comp.type);
    const rThetaJA = comp.type === 'LED' ? 280 : comp.type === 'R' ? 220 : 160; // °C/W
    const targetTemp = stress.ambientTempC + comp.power * rThetaJA;
    comp.tempC = comp.tempC !== undefined ? comp.tempC * 0.9 + targetTemp * 0.1 : targetTemp;

    const pRatio = cat.maxPowerW > 0 ? comp.power / cat.maxPowerW : 0;
    const vRatio = cat.maxVoltageV > 0 ? Math.abs(vDrop) / cat.maxVoltageV : 0;
    const tRatio = comp.tempC > 125 ? (comp.tempC - 25) / 110 : 0;
    comp.stressRatio = Math.max(pRatio, vRatio, tRatio);

    if (stress.burnoutEnabled && comp.stressRatio > 1.25 && comp.type !== 'GND' && comp.type !== 'VDC' && comp.type !== 'VAC') {
      comp.blown = true;
      comp.failureReason =
        pRatio >= vRatio && pRatio >= tRatio
          ? `OVER-POWER (${(comp.power * 1000).toFixed(0)}mW > ${(cat.maxPowerW * 1000).toFixed(0)}mW)`
          : vRatio >= tRatio
            ? `OVERVOLTAGE BREAKDOWN (${Math.abs(vDrop).toFixed(1)}V > ${cat.maxVoltageV}V)`
            : `THERMAL MELTDOWN (${comp.tempC.toFixed(0)}°C > 135°C)`;
    }
  }

  for (const w of wires) {
    const n1 = getNode(`${w.fromCompId}:${w.fromPinId}`);
    w.voltage = V[n1] ?? 0;
    const fromComp = components.find((c) => c.id === w.fromCompId);
    const toComp = components.find((c) => c.id === w.toCompId);
    const c1 = fromComp ? Math.abs(fromComp.branchCurrent) : 0;
    const c2 = toComp ? Math.abs(toComp.branchCurrent) : 0;
    const sign = (fromComp?.branchCurrent ?? 0) >= 0 ? 1 : -1;
    w.current = sign * Math.max(c1, c2, 0.0005);
  }
}
