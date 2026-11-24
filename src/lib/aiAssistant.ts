import { CATALOG } from './catalog.ts';
import { GLOSSARY_INFO } from './glossary.ts';
import type { CircuitComponent } from './types.ts';

export type AiMode = 'explain' | 'brainstorm' | 'parts';

export interface AiTutorResponse {
  mode: AiMode;
  title: string;
  body: string;
}

/**
 * Educational AI Tutor (Does NOT overwrite your circuit):
 * 1. explain: Explains how your current circuit or an electronics concept works.
 * 2. brainstorm: Suggests cool electronics/FPGA/Arduino project ideas.
 * 3. parts: Explains what any specific component does and how its pins work.
 */
export function askAiTutor(
  prompt: string,
  mode: AiMode,
  components: CircuitComponent[]
): AiTutorResponse {
  const q = prompt.trim().toLowerCase();

  if (mode === 'parts') {
    const match = CATALOG.find(
      (c) =>
        q === c.label.toLowerCase() ||
        q.includes(c.label.toLowerCase()) ||
        q.includes(c.tooltipTitle.toLowerCase()) ||
        (c.type === 'R' && q.includes('resistor')) ||
        (c.type === 'C' && q.includes('capacitor')) ||
        (c.type === 'L' && q.includes('inductor')) ||
        (c.type === 'NPN' && (q.includes('transistor') || q.includes('npn'))) ||
        (c.type === 'NMOS' && (q.includes('mosfet') || q.includes('fet'))) ||
        (c.type === 'ARDUINO' && (q.includes('arduino') || q.includes('uno'))) ||
        (c.type === 'IC555' && q.includes('555'))
    );

    if (match) {
      const g = GLOSSARY_INFO[match.type];
      const pinList = match.pins.map((p) => `${p.label} (${p.description})`).join(' · ');
      return {
        mode,
        title: `${match.label} — ${match.tooltipTitle}`,
        body: `${g?.plain ?? match.tooltipPhysics}${g?.analogy ? ` Think of it like: ${g.analogy}` : ''} Pins: ${pinList}`,
      };
    }

    return {
      mode,
      title: 'Part Lookup',
      body: 'Type any part name like "resistor", "LED", "NPN", "NMOS", "FPGA", "555", or "Arduino" to see what it does and how to wire its pins.',
    };
  }

  if (mode === 'brainstorm') {
    if (q.includes('fpga') || q.includes('logic') || q.includes('digital')) {
      return {
        mode,
        title: 'FPGA & Digital Project Ideas',
        body: '1) 2-Bit Binary Counter: Wire an FPGA LUT4 to two D Flip-Flops and a 7-Segment Display. 2) Parity Checker: Use the FPGA PARITY-4 profile with 4 BIT switches to detect odd/even bits. 3) Reaction Timer: Clock a counter with CLK and freeze it with a switch.',
      };
    }
    if (q.includes('arduino') || q.includes('code') || q.includes('sensor')) {
      return {
        mode,
        title: 'Arduino & Mixed-Signal Ideas',
        body: '1) PWM LED Dimmer: Drive an NPN transistor from D13 and adjust DUTY% in Code IDE. 2) RC Analog Feedback: Filter D11 through R+C into A0 and watch ADC0 respond. 3) Over-Voltage Alarm: Use D9 comparator output to trigger a warning LED.',
      };
    }
    return {
      mode,
      title: 'Cool Circuit Ideas to Build',
      body: '1) Transistor Touch Switch: Use a high-value resistor + NPN (Q1) to light an LED with tiny current. 2) 555 LED Strobe: Wire NE555 with R1, R2, C1 and slide C1 to change flash speed. 3) Stress-Test Fuse Lab: Put a 220Ω resistor + LED in Stress Lab and crank voltage surge to 2.5x.',
    };
  }

  // Default: 'explain' mode (Educational, never builds/overwrites)
  if (q.includes('fpga')) {
    return {
      mode,
      title: 'How an FPGA Works',
      body: 'An FPGA is a reconfigurable chip. Instead of running software line-by-line, its 4-input Look-Up Table (LUT4) reads I0–I3 (0V or 5V) and instantly outputs Y0 and Y1 based on the truth table you program in the FPGA & CHIP tab.',
    };
  }
  if (q.includes('transistor') || q.includes('npn') || q.includes('mosfet')) {
    return {
      mode,
      title: 'How Transistors Work',
      body: 'A transistor is an electronic valve. In an NPN transistor, a tiny current into the Base (B) lets a much larger current flow from Collector (C) to Emitter (E). In an NMOS FET, voltage on the Gate (G) opens the channel.',
    };
  }
  if (q.includes('ohm') || q.includes('resistor') || q.includes('led')) {
    return {
      mode,
      title: 'Ohm’s Law & LEDs',
      body: 'Voltage (V) pushes current (I) through resistance (R): V = I × R. An LED only needs ~1.8V–2.2V, so a series resistor (like 220Ω on a 5V supply) absorbs the extra voltage and keeps current safe (~14mA).',
    };
  }

  // Explain the user's current circuit on the board
  if (components.length === 0) {
    return {
      mode,
      title: 'Empty Board',
      body: 'Your board is empty right now. Drop a Voltage Source (VDC), Resistor (R), LED, and Ground (GND) from the left palette, or ask me to explain any part!',
    };
  }

  const types = [...new Set(components.map((c) => c.type))];
  const hasArduino = types.includes('ARDUINO');
  const hasFpga = types.includes('FPGA');
  const hasNpn = types.includes('NPN') || types.includes('PNP') || types.includes('NMOS');
  const has555 = types.includes('IC555');

  if (hasFpga) {
    return {
      mode,
      title: 'Your Current FPGA Circuit',
      body: `You have ${components.length} parts on the board including an FPGA LUT4. Inputs I0–I3 feed the Look-Up Table, which drives Y0/Y1 in real time. Open the FPGA & CHIP tab to edit its truth table.`,
    };
  }
  if (hasArduino) {
    return {
      mode,
      title: 'Your Current Arduino Circuit',
      body: `You have ${components.length} parts wired to an Arduino Uno. Pin D13/D11 output 5V PWM pulses, and A0 reads analog voltage (0–1023). You can edit the C firmware in CODE IDE.`,
    };
  }
  if (has555) {
    return {
      mode,
      title: 'Your Current 555 Timer Circuit',
      body: `The NE555 charges and discharges capacitor C1 between ⅓Vcc and ⅔Vcc, toggling pin OUT between HIGH and LOW to blink the LED.`,
    };
  }
  if (hasNpn) {
    return {
      mode,
      title: 'Your Current Transistor Circuit',
      body: `You have ${components.length} parts including a transistor switch/amplifier. A small signal at the Base/Gate controls the main load current.`,
    };
  }

  return {
    mode,
    title: `Your Circuit (${components.length} parts)`,
    body: `Your board currently has ${types.join(', ')}. Hover over any part or pin to see its live voltage and current, or switch to PARTS mode to ask about a specific component.`,
  };
}
