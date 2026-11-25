import { CATALOG, formatElec, formatSI, getCatalogItem } from './catalog.ts';
import { GLOSSARY_INFO } from './glossary.ts';
import type { CircuitComponent, Wire } from './types.ts';

export type AiMode = 'explain' | 'brainstorm' | 'parts';

export interface AiTutorResponse {
  mode: AiMode;
  title: string;
  body: string;
  source?: 'llm' | 'local';
}

export function buildWorkspaceContext(
  components: CircuitComponent[],
  wires: Wire[]
): string {
  if (components.length === 0) return 'Workspace is empty (0 components, 0 wires).';
  const compLines = components.map((c) => {
    const cat = getCatalogItem(c.type);
    const pins = Object.entries(c.pinVoltages)
      .map(([k, v]) => `${k}=${v.toFixed(2)}V`)
      .join(', ');
    const status = c.blown ? `BLOWN (${c.failureReason})` : c.failureReason ? `WARNING (${c.failureReason})` : 'OK';
    return `- ${c.label} [${c.type}] val=${formatSI(c.value, cat.shortUnit)} I=${formatElec(c.branchCurrent, 'A')} P=${formatElec(c.power, 'W')} T=${(c.tempC ?? 25).toFixed(0)}C status=${status} pins={${pins}}`;
  });
  const wireLines = wires.map((w) => {
    const c1 = components.find((c) => c.id === w.fromCompId)?.label ?? w.fromCompId;
    const c2 = components.find((c) => c.id === w.toCompId)?.label ?? w.toCompId;
    return `- ${c1}.${w.fromPinId} <-> ${c2}.${w.toPinId} (${formatElec(w.voltage, 'V')}, ${formatElec(w.current, 'A')})`;
  });
  return `Components (${components.length}):\n${compLines.join('\n')}\nWires (${wires.length}):\n${wireLines.join('\n')}`;
}

export async function askAiTutorAsync(
  mode: AiMode,
  prompt: string,
  components: CircuitComponent[],
  wires: Wire[] = []
): Promise<AiTutorResponse> {
  try {
    const workspaceContext = buildWorkspaceContext(components, wires);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, prompt, workspaceContext }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.reply) {
        const title =
          mode === 'explain'
            ? 'CircuitFab AI (Gemini LLM)'
            : mode === 'brainstorm'
              ? 'Project Ideas (Gemini LLM)'
              : 'Part Inspector (Gemini LLM)';
        return { mode, title, body: data.reply, source: 'llm' };
      }
    }
  } catch {
    // Fallback to deterministic local workspace analyzer when offline or without GEMINI_API_KEY
  }
  const local = askAiTutor(mode, prompt, components, wires);
  return { ...local, source: 'local' };
}

/**
 * Deep Workspace-Aware Educational AI Tutor (Never overwrites the user's circuit):
 * 1. explain: Analyzes the exact components, wiring netlist, node voltages, branch currents,
 *    blown/overload status, and unconnected pins on the live workspace, plus answers physics questions.
 * 2. brainstorm: Suggests actionable project ideas tailored to the parts currently on the user's board.
 * 3. parts: Provides thorough electrical engineering explanations, formulas, ratings, and live instance telemetry.
 */
export function askAiTutor(
  mode: AiMode,
  prompt: string,
  components: CircuitComponent[],
  wires: Wire[] = []
): AiTutorResponse {
  const q = prompt.trim().toLowerCase();

  // Helper: summarize live workspace netlist and telemetry
  const analyzeWorkspace = (): {
    partSummary: string;
    connectionSummary: string;
    diagnosticSummary: string;
    physicsBreakdown: string;
  } => {
    if (components.length === 0) {
      return {
        partSummary: 'The workspace currently has 0 components.',
        connectionSummary: 'No wires placed yet.',
        diagnosticSummary: 'Drop a power source (VDC or UNO), a load (LED, Buzzer, or Chip), and a Ground (GND) to start.',
        physicsBreakdown: '',
      };
    }

    const partList = components
      .map((c) => {
        const cat = getCatalogItem(c.type);
        const valStr =
          c.type === 'GND' || c.type === 'CUSTOM_IC' || c.type === 'SEG7' || c.type === 'COUNTER4' || c.type === 'SHIFT4'
            ? ''
            : `=${formatSI(c.value, cat.shortUnit)}`;
        const statusStr = c.blown
          ? ` [BLOWN: ${c.failureReason}]`
          : c.failureReason
            ? ` [${c.failureReason}]`
            : '';
        return `${c.label} (${c.type}${valStr}, I=${formatElec(c.branchCurrent, 'A')}, P=${formatElec(c.power, 'W')}${statusStr})`;
      })
      .join('; ');

    // Check which components have wires attached
    const connectedCompIds = new Set<string>();
    const wireDescriptions: string[] = [];
    for (const w of wires) {
      connectedCompIds.add(w.fromCompId);
      connectedCompIds.add(w.toCompId);
      const c1 = components.find((c) => c.id === w.fromCompId);
      const c2 = components.find((c) => c.id === w.toCompId);
      if (c1 && c2) {
        wireDescriptions.push(`${c1.label}.${w.fromPinId} -> ${c2.label}.${w.toPinId} (${formatElec(w.voltage, 'V')}, ${formatElec(w.current, 'A')})`);
      }
    }

    const floatingComps = components.filter((c) => !connectedCompIds.has(c.id));
    const blownComps = components.filter((c) => c.blown);
    const overloadedComps = components.filter((c) => !c.blown && c.failureReason);
    const hasGnd = components.some((c) => c.type === 'GND' || c.type === 'ARDUINO' || c.type === 'IC555');

    const diagnostics: string[] = [];
    if (!hasGnd) {
      diagnostics.push('Missing Ground reference (GND): add a GND symbol so the nodal solver has a 0.00V baseline.');
    }
    if (floatingComps.length > 0) {
      diagnostics.push(
        `Unwired components on board: ${floatingComps.map((c) => c.label).join(', ')} (select one and click AUTO-WIRE or drag between pins).`
      );
    }
    if (blownComps.length > 0) {
      for (const bc of blownComps) {
        diagnostics.push(
          `${bc.label} burned out due to ${bc.failureReason}. Click REPAIR in the top bar—CircuitFab will restore the part and automatically upgrade under-sized series resistors to safe values (e.g. 220Ω).`
        );
      }
    }
    if (overloadedComps.length > 0) {
      for (const oc of overloadedComps) {
        diagnostics.push(`${oc.label} is running above datasheet limits (${oc.failureReason}). Increase series resistance or lower supply voltage.`);
      }
    }

    // Specific KVL / Ohm's law breakdown for LEDs, Resistors, Transistors, Arduino, FPGA
    const breakdowns: string[] = [];
    const leds = components.filter((c) => c.type === 'LED');
    const resistors = components.filter((c) => c.type === 'R');
    const arduinos = components.filter((c) => c.type === 'ARDUINO');
    const fpgas = components.filter((c) => c.type === 'FPGA');
    const bjts = components.filter((c) => c.type === 'NPN' || c.type === 'PNP');

    for (const led of leds) {
      const vA = led.pinVoltages.A ?? 0;
      const vK = led.pinVoltages.K ?? 0;
      const vd = vA - vK;
      if (connectedCompIds.has(led.id)) {
        breakdowns.push(
          `${led.label}: Anode=${vA.toFixed(2)}V, Cathode=${vK.toFixed(2)}V (Vd=${vd.toFixed(2)}V vs Vf=${led.value}V), Current=${formatElec(led.branchCurrent, 'A')} (30mA max rating).`
        );
      }
    }
    for (const r of resistors) {
      if (connectedCompIds.has(r.id)) {
        const vDrop = Math.abs((r.pinVoltages.A ?? 0) - (r.pinVoltages.B ?? 0));
        breakdowns.push(
          `${r.label} (${formatSI(r.value, 'Ω')}): dropping ${vDrop.toFixed(2)}V at I = V/R = ${formatElec(r.branchCurrent, 'A')}, dissipating P = I²R = ${formatElec(r.power, 'W')} (250mW max rating).`
        );
      }
    }
    for (const uno of arduinos) {
      breakdowns.push(
        `${uno.label} (ATmega328P): D13=${(uno.pinVoltages.D13 ?? 0).toFixed(2)}V, D11=${(uno.pinVoltages.D11 ?? 0).toFixed(2)}V, D9=${(uno.pinVoltages.D9 ?? 0).toFixed(2)}V, A0=${(uno.pinVoltages.A0 ?? 0).toFixed(2)}V (ADC=${uno.state?.adcA0 ?? 0}/1023), peak GPIO pin current=${formatElec(uno.branchCurrent, 'A')} (40mA datasheet limit).`
      );
    }
    for (const fpga of fpgas) {
      const addr = fpga.state?.lutAddr ?? 0;
      breakdowns.push(
        `${fpga.label} (${fpga.fpgaProfile ?? 'LUT4'}): reading 4-bit input address ${addr.toString(2).padStart(4, '0')} (row ${addr}) -> driving Y0=${(fpga.pinVoltages.Y0 ?? 0).toFixed(1)}V, Y1=${(fpga.pinVoltages.Y1 ?? 0).toFixed(1)}V.`
      );
    }
    for (const qComp of bjts) {
      const vbe = Math.abs((qComp.pinVoltages.B ?? 0) - (qComp.pinVoltages.E ?? 0));
      const vce = Math.abs((qComp.pinVoltages.C ?? 0) - (qComp.pinVoltages.E ?? 0));
      const region = vbe < 0.55 ? 'CUTOFF (OFF)' : vce < 0.35 ? 'SATURATION (FULLY ON)' : 'FORWARD-ACTIVE (AMPLIFYING)';
      breakdowns.push(
        `${qComp.label} (${qComp.type}, β=${qComp.value}): |Vbe|=${vbe.toFixed(2)}V, |Vce|=${vce.toFixed(2)}V, Ic=${formatElec(qComp.branchCurrent, 'A')} [${region}].`
      );
    }

    return {
      partSummary: `Workspace has ${components.length} components and ${wires.length} wires: ${partList}.`,
      connectionSummary:
        wireDescriptions.length > 0
          ? `Active Nets: ${wireDescriptions.slice(0, 6).join(' | ')}${wireDescriptions.length > 6 ? ` (+${wireDescriptions.length - 6} more)` : ''}.`
          : 'No wires connecting pins yet.',
      diagnosticSummary:
        diagnostics.length > 0 ? `Diagnostics: ${diagnostics.join(' ')}` : 'Diagnostics: All wired components are operating within safe datasheet limits.',
      physicsBreakdown: breakdowns.join(' '),
    };
  };

  if (mode === 'parts') {
    const match = CATALOG.find(
      (c) =>
        q === c.label.toLowerCase() ||
        q === c.type.toLowerCase() ||
        (q.length >= 2 && c.label.toLowerCase().includes(q)) ||
        (q.length >= 3 && c.tooltipTitle.toLowerCase().includes(q)) ||
        (c.type === 'R' && q.includes('resistor')) ||
        (c.type === 'POT' && (q.includes('pot') || q.includes('wiper') || q.includes('divider'))) ||
        (c.type === 'C' && q.includes('capacitor')) ||
        (c.type === 'L' && q.includes('inductor')) ||
        (c.type === 'ZENER' && q.includes('zener')) ||
        (c.type === 'FUSE' && q.includes('fuse')) ||
        (c.type === 'BUZZER' && (q.includes('buzz') || q.includes('speaker') || q.includes('piezo'))) ||
        (c.type === 'NPN' && (q.includes('transistor') || q.includes('npn') || q.includes('bjt'))) ||
        (c.type === 'PNP' && q.includes('pnp')) ||
        (c.type === 'NMOS' && (q.includes('mosfet') || q.includes('fet') || q.includes('nmos'))) ||
        (c.type === 'COUNTER4' && q.includes('counter')) ||
        (c.type === 'SHIFT4' && q.includes('shift')) ||
        (c.type === 'SR_LATCH' && (q.includes('latch') || q.includes('sr'))) ||
        (c.type === 'ARDUINO' && (q.includes('arduino') || q.includes('uno'))) ||
        (c.type === 'IC555' && q.includes('555'))
    );

    const targetItem =
      match ??
      (components.length > 0 ? getCatalogItem(components[0].type) : undefined);

    if (targetItem && (match || !q)) {
      const g = GLOSSARY_INFO[targetItem.type];
      const pinList = targetItem.pins.map((p) => `${p.label}: ${p.description}`).join(' · ');
      const ratings = `Max Power: ${formatElec(targetItem.maxPowerW, 'W')}${targetItem.maxCurrentA ? ` · Max Current: ${formatElec(targetItem.maxCurrentA, 'A')}` : ''} · Max Voltage: ${targetItem.maxVoltageV}V`;
      const onBoard = components.filter((c) => c.type === targetItem.type);
      const liveNote =
        onBoard.length > 0
          ? ` On your board right now: ${onBoard.map((c) => `${c.label} (I=${formatElec(c.branchCurrent, 'A')}, P=${formatElec(c.power, 'W')}${c.blown ? ', BLOWN' : ''})`).join(', ')}.`
          : '';
      return {
        mode,
        title: `${targetItem.label} — ${targetItem.tooltipTitle}`,
        body: `${g?.plain ?? targetItem.tooltipPhysics} ${g?.analogy ? `Analogy: ${g.analogy}` : ''} | Physics: ${targetItem.tooltipPhysics} | Datasheet Limits: ${ratings} | Pins: [${pinList}].${liveNote}`,
      };
    }

    return {
      mode,
      title: 'Component Encyclopedia & Live Part Inspector',
      body: 'Type any component name—such as "Resistor", "Potentiometer", "Zener", "Fuse", "Buzzer", "LED", "NPN", "NMOS", "OpAmp", "SR-FF", "CNT-4B", "SIPO-4", "FPGA", "555", or "Arduino"—or leave blank and click ASK to inspect the selected component on your board.',
    };
  }

  if (mode === 'brainstorm') {
    const ws = analyzeWorkspace();
    const types = new Set(components.map((c) => c.type));
    if (q.includes('fpga') || q.includes('digital') || types.has('FPGA') || types.has('COUNTER4')) {
      return {
        mode,
        title: 'Tailored Digital & FPGA Project Ideas for Your Board',
        body: `Based on your workspace (${components.length} parts): 1) 4-Bit Automatic Hex Scoreboard: Drop a CNT-4B binary counter driven by CLK and wire Q0..Q3 into a 7-SEG display + FPGA parity checker. 2) Serial Bit Chaser: Feed a CLK + BIT 0/1 into a SIPO-4 shift register to march bits across 4 LEDs. 3) Custom ALU in Verilog: Open CODE IDE, write a 4-input Verilog expression, flash it to the FPGA LUT4, and test all 16 truth-table rows.`,
      };
    }
    if (q.includes('arduino') || types.has('ARDUINO')) {
      return {
        mode,
        title: 'Arduino Uno & Mixed-Signal Project Ideas',
        body: `Based on your Arduino workspace: 1) Protected High-Current Buzzer & LED Alarm: Wire UNO D13 through a 50mA FUSE and 220Ω resistor to an LED + Piezo BUZZER, or drive a 2N3904 NPN transistor so the GPIO pin only supplies ~1.9mA base current. 2) Potentiometer ADC Threshold Controller: Wire a 10kΩ POT between UNO 5V, GND, and A0—watch ADC0 (0–1023) cross the D9 comparator threshold in real time. ${ws.diagnosticSummary}`,
      };
    }
    return {
      mode,
      title: 'Interactive Circuit Experiments to Try Next',
      body: `1) Zener Over-Voltage Protector: Wire a 12V VDC source through a 220Ω resistor to a 5.1V ZENER diode (reverse-biased) in parallel with a load—watch the Zener clamp the output rail to ~5.1V. 2) Resettable Fuse Trip Test: Place a 50mA FUSE in series with a 25Ω resistor and 5V supply in Realistic mode to watch the fuse sacrifice itself before the LED blows. 3) 555 Piezo Siren: Connect an NE555 astable oscillator output to a Piezo BUZZER and sweep the POT wiper.`,
    };
  }

  // Mode: 'explain' — Thorough, workspace-aware electrical engineering analysis
  const ws = analyzeWorkspace();

  if (q.includes('blow') || q.includes('burn') || q.includes('repair') || q.includes('overload') || q.includes('why')) {
    return {
      mode,
      title: 'Live Failure & Burnout Analysis of Your Workspace',
      body: `${ws.partSummary} ${ws.physicsBreakdown} ${ws.diagnosticSummary} Tip: In Realistic mode, a 5V source through a 25Ω resistor into a 1.8V LED pushes (5V − 1.8V)/25Ω = 124.5mA (blowing the 30mA LED, 40mA Arduino pin, and 250mW resistor at 398mW). Clicking REPAIR fixes blown parts and safely upgrades overloaded series resistors to 220Ω (14.5mA).`,
    };
  }

  if (q.includes('fpga') || q.includes('lut')) {
    return {
      mode,
      title: 'How Your FPGA LUT4 Circuit Works',
      body: `An FPGA Configurable Logic Block (CLB) contains a 16×2 SRAM Look-Up Table (LUT4). Instead of executing sequential CPU instructions, the 4 input pins (I3, I2, I1, I0) form a 4-bit binary address (0000 to 1111) that multiplexes the programmed truth-table bits directly to outputs Y0 and Y1 with sub-nanosecond gate delay. ${ws.physicsBreakdown}`,
    };
  }

  return {
    mode,
    title: `Circuit Summary (${components.length} Parts)`,
    body: `${ws.diagnosticSummary} ${ws.physicsBreakdown || 'Click any part or pin to inspect its live voltage and current, or switch to PARTS mode to learn what each component does.'}`,
  };
}
