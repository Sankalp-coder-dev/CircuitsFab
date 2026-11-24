import { formatSI, getCatalogItem, getComponentPins, getPinWorldPos } from './catalog.ts';
import type { CircuitComponent, CustomChipDefinition, Wire } from './types.ts';

export interface Camera3D {
  yaw: number;   // radians around Z axis
  pitch: number; // radians tilt (0.3 to 1.35)
  zoom: number;  // scale factor
  panX: number;
  panY: number;
  xray: boolean; // show internal silicon die & bond wires inside chips
}

export interface HitTarget3D {
  compId: string;
  sx: number;
  sy: number;
  r: number;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Point2D {
  x: number;
  y: number;
  depth: number;
}

const DIGIT_COLOR_BANDS: string[] = [
  '#1F2328', // 0 Black
  '#7C3F00', // 1 Brown
  '#C74440', // 2 Red
  '#FA7E19', // 3 Orange
  '#EAB308', // 4 Yellow
  '#388C46', // 5 Green
  '#2D70B3', // 6 Blue
  '#6042A6', // 7 Violet
  '#8C959F', // 8 Grey
  '#FFFFFF', // 9 White
];

export function getResistorColorBands(ohms: number): [string, string, string, string] {
  const clean = Math.max(1, Math.round(ohms));
  const str = clean.toString();
  const d1 = parseInt(str[0] ?? '1', 10);
  const d2 = parseInt(str[1] ?? '0', 10);
  const mult = Math.max(0, Math.min(9, str.length - 2));
  return [
    DIGIT_COLOR_BANDS[d1] ?? '#7C3F00',
    DIGIT_COLOR_BANDS[d2] ?? '#1F2328',
    DIGIT_COLOR_BANDS[mult] ?? '#C74440',
    '#D4AF37', // 5% Gold tolerance band
  ];
}

// 7-Segment LED segment table
const SEG7_TABLE: number[][] = [
  [1, 1, 1, 1, 1, 1, 0], // 0
  [0, 1, 1, 0, 0, 0, 0], // 1
  [1, 1, 0, 1, 1, 0, 1], // 2
  [1, 1, 1, 1, 0, 0, 1], // 3
  [0, 1, 1, 0, 0, 1, 1], // 4
  [1, 0, 1, 1, 0, 1, 1], // 5
  [1, 0, 1, 1, 1, 1, 1], // 6
  [1, 1, 1, 0, 0, 0, 0], // 7
  [1, 1, 1, 1, 1, 1, 1], // 8
  [1, 1, 1, 1, 0, 1, 1], // 9
  [1, 1, 1, 0, 1, 1, 1], // A
  [0, 0, 1, 1, 1, 1, 1], // b
  [1, 0, 0, 1, 1, 1, 0], // C
  [0, 1, 1, 1, 1, 0, 1], // d
  [1, 0, 0, 1, 1, 1, 1], // E
  [1, 0, 0, 0, 1, 1, 1], // F
];

export function renderCircuit3D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  components: CircuitComponent[],
  wires: Wire[],
  customChips: CustomChipDefinition[],
  cam: Camera3D,
  gridSize: number,
  animPhase: number,
  selectedCompId: string | null
): HitTarget3D[] {
  const hitTargets: HitTarget3D[] = [];
  ctx.fillStyle = '#F0F2F5';
  ctx.fillRect(0, 0, width, height);

  // Center of board in world pixels
  let minX = 4 * gridSize;
  let maxX = 28 * gridSize;
  let minY = 3 * gridSize;
  let maxY = 20 * gridSize;

  if (components.length > 0) {
    minX = Math.min(...components.map((c) => (c.x - 5) * gridSize));
    maxX = Math.max(...components.map((c) => (c.x + 5) * gridSize));
    minY = Math.min(...components.map((c) => (c.y - 4) * gridSize));
    maxY = Math.max(...components.map((c) => (c.y + 4) * gridSize));
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const cosY = Math.cos(cam.yaw);
  const sinY = Math.sin(cam.yaw);
  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);

  const project = (p: Point3D): Point2D => {
    const dx = p.x - centerX;
    const dy = p.y - centerY;
    const dz = p.z;

    const rx = dx * cosY - dy * sinY;
    const ry = dx * sinY + dy * cosY;

    const sx = rx * cam.zoom + width / 2 + cam.panX;
    const sy = (ry * cosP - dz * sinP) * cam.zoom + height / 2 + cam.panY;
    const depth = ry * sinP + dz * cosP;
    return { x: sx, y: sy, depth };
  };

  const drawPolygon3D = (pts: Point3D[], fill: string, stroke = '#1F2328', lineWidth = 1.4) => {
    if (pts.length < 3) return;
    const p2 = pts.map(project);
    ctx.beginPath();
    ctx.moveTo(p2[0].x, p2[0].y);
    for (let i = 1; i < p2.length; i++) {
      ctx.lineTo(p2[i].x, p2[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (lineWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };

  const drawBox3D = (
    cx: number,
    cy: number,
    z0: number,
    hx: number,
    hy: number,
    hz: number,
    rotDeg: number,
    topColor: string,
    sideColor1: string,
    sideColor2: string,
    stroke = '#1F2328'
  ) => {
    const rad = (rotDeg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const corner = (lx: number, ly: number, z: number): Point3D => ({
      x: cx + (lx * c - ly * s),
      y: cy + (lx * s + ly * c),
      z,
    });

    const b0 = corner(-hx, -hy, z0);
    const b1 = corner(hx, -hy, z0);
    const b2 = corner(hx, hy, z0);
    const b3 = corner(-hx, hy, z0);

    const t0 = corner(-hx, -hy, z0 + hz);
    const t1 = corner(hx, -hy, z0 + hz);
    const t2 = corner(hx, hy, z0 + hz);
    const t3 = corner(-hx, hy, z0 + hz);

    const faces: { pts: Point3D[]; color: string; depth: number }[] = [
      { pts: [b0, b1, t1, t0], color: sideColor1, depth: 0 },
      { pts: [b1, b2, t2, t1], color: sideColor2, depth: 0 },
      { pts: [b2, b3, t3, t2], color: sideColor1, depth: 0 },
      { pts: [b3, b0, t0, t3], color: sideColor2, depth: 0 },
      { pts: [t0, t1, t2, t3], color: topColor, depth: 0 },
    ];

    for (const f of faces) {
      const avg =
        f.pts.reduce((acc, pt) => acc + project(pt).depth, 0) / f.pts.length;
      f.depth = avg;
    }
    faces.sort((a, b) => a.depth - b.depth);

    for (const f of faces) {
      drawPolygon3D(f.pts, f.color, stroke, 1.3);
    }
  };

  const drawCylinder3D = (
    cx: number,
    cy: number,
    z0: number,
    radius: number,
    heightZ: number,
    bodyColor: string,
    topColor: string,
    segments = 14
  ) => {
    const botPts: Point3D[] = [];
    const topPts: Point3D[] = [];
    for (let i = 0; i < segments; i++) {
      const ang = (i / segments) * Math.PI * 2;
      const px = cx + Math.cos(ang) * radius;
      const py = cy + Math.sin(ang) * radius;
      botPts.push({ x: px, y: py, z: z0 });
      topPts.push({ x: px, y: py, z: z0 + heightZ });
    }

    // Sort side quads by depth
    const quads: { pts: Point3D[]; depth: number }[] = [];
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const q = [botPts[i], botPts[next], topPts[next], topPts[i]];
      const d = q.reduce((acc, pt) => acc + project(pt).depth, 0) / 4;
      quads.push({ pts: q, depth: d });
    }
    quads.sort((a, b) => a.depth - b.depth);
    for (const q of quads) {
      drawPolygon3D(q.pts, bodyColor, bodyColor, 0.6);
    }
    drawPolygon3D(topPts, topColor, '#1F2328', 1.4);
  };

  // 1. Draw 3D FR-4 PCB Substrate Board
  const boardThickness = 10;
  drawBox3D(
    centerX,
    centerY,
    -boardThickness,
    (maxX - minX) / 2,
    (maxY - minY) / 2,
    boardThickness,
    0,
    '#1B4D3E', // Classic PCB solder-mask emerald green (flat solid)
    '#12352A',
    '#0E2920',
    '#1F2328'
  );

  // Draw PCB Grid Via Holes on Top Surface (z = 0)
  ctx.fillStyle = '#2A6B56';
  for (let gx = Math.ceil(minX / gridSize); gx <= Math.floor(maxX / gridSize); gx++) {
    for (let gy = Math.ceil(minY / gridSize); gy <= Math.floor(maxY / gridSize); gy++) {
      const p = project({ x: gx * gridSize, y: gy * gridSize, z: 0.2 });
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.2, 1.8 * cam.zoom), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. Draw 3D Copper Traces / Raised Jumper Wires & 3D Electron Spheres
  for (const w of wires) {
    const c1 = components.find((c) => c.id === w.fromCompId);
    const c2 = components.find((c) => c.id === w.toCompId);
    if (!c1 || !c2) continue;
    const p1 = getComponentPins(c1, customChips).find((p) => p.id === w.fromPinId);
    const p2 = getComponentPins(c2, customChips).find((p) => p.id === w.toPinId);
    if (!p1 || !p2) continue;

    const wPos1 = getPinWorldPos(c1, p1);
    const wPos2 = getPinWorldPos(c2, p2);
    const x1 = wPos1.x * gridSize;
    const y1 = wPos1.y * gridSize;
    const x2 = wPos2.x * gridSize;
    const y2 = wPos2.y * gridSize;
    const mx = x2;
    const my = y1;

    const traceZ = 2.5;
    const s1 = project({ x: x1, y: y1, z: traceZ });
    const sm = project({ x: mx, y: my, z: traceZ });
    const s2 = project({ x: x2, y: y2, z: traceZ });

    const traceColor =
      w.voltage > 0.35 ? '#58A6FF' : w.voltage < -0.35 ? '#FF7B72' : '#D29922';

    // Gold/Copper PCB Trace shadow + core
    ctx.strokeStyle = '#1F2328';
    ctx.lineWidth = 5.5 * cam.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(sm.x, sm.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();

    ctx.strokeStyle = traceColor;
    ctx.lineWidth = 3.4 * cam.zoom;
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(sm.x, sm.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();

    // 3D Electron Flow Spheres along the 3D trace
    const seg1 = Math.hypot(mx - x1, my - y1);
    const seg2 = Math.hypot(x2 - mx, y2 - my);
    const total = seg1 + seg2;
    if (total > 6 && Math.abs(w.current) >= 1e-6) {
      const spacing = 28;
      const count = Math.max(1, Math.floor(total / spacing));
      const dir = w.current >= 0 ? 1 : -1;
      const speedScale = Math.min(3.5, Math.max(0.25, Math.log10(Math.abs(w.current) * 1e4 + 1)));
      const offset = ((animPhase * dir * speedScale * 30) % spacing + spacing) % spacing;

      for (let i = 0; i < count; i++) {
        const d = i * spacing + offset;
        if (d > total) continue;
        let ex = x1;
        let ey = y1;
        if (d <= seg1 && seg1 > 0) {
          const t = d / seg1;
          ex = x1 + (mx - x1) * t;
          ey = y1 + (my - y1) * t;
        } else if (seg2 > 0) {
          const t = (d - seg1) / seg2;
          ex = mx + (x2 - mx) * t;
          ey = my + (y2 - my) * t;
        }
        const ep = project({ x: ex, y: ey, z: traceZ + 2 });
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#1F2328';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ep.x, ep.y, Math.max(2.5, 3.6 * cam.zoom), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  // 3. Sort components back-to-front by 3D camera depth (Painter's Algorithm)
  const sortedComps = [...components].sort((a, b) => {
    const da = project({ x: a.x * gridSize, y: a.y * gridSize, z: 12 }).depth;
    const db = project({ x: b.x * gridSize, y: b.y * gridSize, z: 12 }).depth;
    return da - db;
  });

  // 4. Render each 3D component body, pins, and silkscreen label
  for (const comp of sortedComps) {
    const cx = comp.x * gridSize;
    const cy = comp.y * gridSize;
    const pins = getComponentPins(comp, customChips);
    const cat = getCatalogItem(comp.type);

    // Draw 3D Silver Solder Pads & Leads for each Pin
    for (const pin of pins) {
      const wp = getPinWorldPos(comp, pin);
      const px = wp.x * gridSize;
      const py = wp.y * gridSize;
      drawCylinder3D(px, py, 0, 5, 4, '#9CA3AF', '#E5E7EB', 8);

      // Lead connecting pin pad to component body
      const pPad = project({ x: px, y: py, z: 6 });
      const pBody = project({ x: (px + cx) / 2, y: (py + cy) / 2, z: 10 });
      ctx.strokeStyle = '#D1D5DB';
      ctx.lineWidth = 2.6 * cam.zoom;
      ctx.beginPath();
      ctx.moveTo(pPad.x, pPad.y);
      ctx.lineTo(pBody.x, pBody.y);
      ctx.stroke();
    }

    // Highlight ring on PCB if selected
    if (selectedCompId === comp.id) {
      drawBox3D(cx, cy, 0.2, 46, 36, 1, comp.rotation, 'rgba(250, 126, 25, 0.25)', '#FA7E19', '#FA7E19', '#FA7E19');
    }

    // 3D Thermal Stress Warning Ring or Scorched Blast Crater on PCB Surface
    if (comp.blown) {
      drawCylinder3D(cx, cy, 0.3, 34, 0.6, '#1F140E', '#2B1B12', 14);
      drawCylinder3D(cx, cy, 0.9, 20, 0.5, '#0F0A07', '#18100C', 12);
    } else if ((comp.stressRatio ?? 0) > 0.75) {
      drawCylinder3D(cx, cy, 0.3, 30, 0.5, '#FA7E19', '#FEF3C7', 14);
    }

    // Component-Specific 3D Volumetric Models
    switch (comp.type) {
      case 'R': {
        // 3D Tan Carbon-Film Axial Resistor with 4 Real Color Bands
        drawBox3D(cx, cy, 8, 28, 9, 12, comp.rotation, '#E6C280', '#D4AC63', '#B89149');
        const bands = getResistorColorBands(comp.value);
        const offsets = [-14, -5, 4, 15];
        for (let b = 0; b < 4; b++) {
          const rad = (comp.rotation * Math.PI) / 180;
          const bx = cx + offsets[b] * Math.cos(rad);
          const by = cy + offsets[b] * Math.sin(rad);
          drawBox3D(bx, by, 7.5, 2.4, 9.6, 13, comp.rotation, bands[b], bands[b], bands[b], '#1F2328');
        }
        break;
      }
      case 'C': {
        // 3D Vertical Electrolytic Capacitor Cylinder with Aluminum Cap
        drawCylinder3D(cx, cy, 2, 16, 28, '#1E3A8A', '#D1D5DB', 16);
        break;
      }
      case 'L': {
        // 3D Toroidal Ferrite Core with Copper Windings
        drawCylinder3D(cx, cy, 2, 18, 16, '#374151', '#B45309', 16);
        drawCylinder3D(cx, cy, 2, 8, 17, '#1B4D3E', '#1B4D3E', 10);
        break;
      }
      case 'LED':
      case 'DIODE':
      case 'ZENER': {
        const isLit = !comp.blown && comp.type === 'LED' && comp.branchCurrent > 0.001;
        if (comp.type === 'LED') {
          if (isLit) {
            // 3D illuminated halo base ring
            drawCylinder3D(cx, cy, 1, 26, 2, '#FCA5A5', '#FEE2E2', 16);
          }
          // 5mm LED Bottom Flange Lip
          drawCylinder3D(
            cx,
            cy,
            3,
            15,
            4,
            isLit ? '#DC2626' : '#7F1D1D',
            isLit ? '#EF4444' : '#991B1B',
            16
          );
          // 5mm LED Main Lens Body
          drawCylinder3D(
            cx,
            cy,
            7,
            12.5,
            16,
            isLit ? '#EF4444' : '#991B1B',
            isLit ? '#F87171' : '#DC2626',
            16
          );
          // 5mm LED Rounded Dome Crown
          drawCylinder3D(
            cx,
            cy,
            23,
            9,
            5,
            isLit ? '#F87171' : '#B91C1C',
            isLit ? '#FEF2F2' : '#EF4444',
            14
          );
        } else {
          // 1N4148 / Glass Zener DO-35 Axial Diode with Cathode Band
          const bodyCol = comp.type === 'ZENER' ? '#B45309' : '#24292F';
          drawBox3D(cx, cy, 7, 24, 8, 11, comp.rotation, bodyCol, '#1F2328', '#1F2328');
          const rad = (comp.rotation * Math.PI) / 180;
          drawBox3D(
            cx + 12 * Math.cos(rad),
            cy + 12 * Math.sin(rad),
            6.8,
            3.5,
            8.5,
            11.5,
            comp.rotation,
            '#E5E7EB',
            '#D1D5DB',
            '#9CA3AF'
          );
        }
        break;
      }
      case 'POT': {
        // 3D Rotary Potentiometer Box with Brass Shaft & Wiper Slot
        drawBox3D(cx, cy, 2, 24, 24, 14, comp.rotation, '#1E3A8A', '#1E40AF', '#172554');
        drawCylinder3D(cx, cy, 16, 12, 12, '#D4AF37', '#FDE047', 14);
        break;
      }
      case 'FUSE': {
        // 3D Glass Cartridge Fuse with Metallic End-Caps
        drawBox3D(cx, cy, 7, 26, 9, 12, comp.rotation, comp.blown ? '#7F1D1D' : '#E0F2FE', '#9CA3AF', '#6B7280');
        break;
      }
      case 'BUZZER': {
        // 3D Cylindrical Black Piezo Buzzer Can with Sound Port Hole
        const buzzing = (comp.state?.buzzing ?? 0) > 0 && !comp.blown;
        drawCylinder3D(cx, cy, 2, 22, 18, '#1F2328', buzzing ? '#374151' : '#24292F', 18);
        drawCylinder3D(cx, cy, 20, 6, 1.5, '#111827', buzzing ? '#FA7E19' : '#111827', 12);
        break;
      }
      case 'NPN':
      case 'PNP':
      case 'NMOS': {
        // 3D TO-92 Transistor Package Standing on 3 Silver Leads
        drawBox3D(cx, cy, 12, 14, 12, 22, comp.rotation, '#24292F', '#1F2328', '#32383F');
        if (cam.xray) {
          drawBox3D(cx, cy, 18, 6, 6, 6, comp.rotation, '#F59E0B', '#D97706', '#B45309');
        }
        break;
      }
      case 'VDC':
      case 'VAC': {
        // 3D Bench Power / Signal Header Block
        drawBox3D(
          cx,
          cy,
          2,
          22,
          24,
          22,
          comp.rotation,
          comp.type === 'VDC' ? '#C74440' : '#2D70B3',
          '#1F2328',
          '#32383F'
        );
        break;
      }
      case 'SW':
      case 'LOGIC_IN': {
        // 3D Mechanical Slide/Tactile Toggle Switch with 3D Actuator Lever
        drawBox3D(cx, cy, 2, 22, 16, 12, comp.rotation, '#32383F', '#24292F', '#1F2328');
        const knobOffset = comp.switchClosed ? 7 : -7;
        const rad = (comp.rotation * Math.PI) / 180;
        drawBox3D(
          cx + knobOffset * Math.cos(rad),
          cy + knobOffset * Math.sin(rad),
          14,
          7,
          9,
          12,
          comp.rotation,
          comp.switchClosed ? '#388C46' : '#C74440',
          '#1F2328',
          '#1F2328'
        );
        break;
      }
      case 'SEG7': {
        // 3D 7-Segment LED Module with glowing extruded LED bars on top face
        drawBox3D(cx, cy, 2, 46, 58, 16, comp.rotation, '#1F2328', '#32383F', '#24292F');
        const segs = SEG7_TABLE[comp.state?.hexVal ?? 0] ?? SEG7_TABLE[0];
        const segCoords: [number, number, number, number][] = [
          [0, -32, 14, 3.5],  // a
          [16, -16, 3.5, 13], // b
          [16, 16, 3.5, 13],  // c
          [0, 32, 14, 3.5],   // d
          [-16, 16, 3.5, 13], // e
          [-16, -16, 3.5, 13],// f
          [0, 0, 14, 3.5],    // g
        ];
        for (let s = 0; s < 7; s++) {
          const [sx, sy, sw, sh] = segCoords[s];
          drawBox3D(
            cx + sx,
            cy + sy,
            18,
            sw,
            sh,
            2,
            comp.rotation,
            segs[s] ? '#EF4444' : '#32383F',
            segs[s] ? '#DC2626' : '#24292F',
            segs[s] ? '#B91C1C' : '#24292F',
            segs[s] ? '#FCA5A5' : '#1F2328'
          );
        }
        break;
      }
      case 'ARDUINO': {
        // 3D Open-Source Arduino Uno R3 Physical Board
        drawBox3D(cx, cy, 4, 88, 60, 8, comp.rotation, '#008184', '#006668', '#004D4F');
        const rad = (comp.rotation * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        const rotPt = (lx: number, ly: number) => ({
          x: cx + (lx * c - ly * s),
          y: cy + (lx * s + ly * c),
        });

        // 3D Metallic USB-B Connector
        const usb = rotPt(-74, -22);
        drawBox3D(usb.x, usb.y, 12, 16, 14, 18, comp.rotation, '#E5E7EB', '#9CA3AF', '#6B7280');

        // 3D Black DC Power Barrel Jack
        const dc = rotPt(-70, 24);
        drawBox3D(dc.x, dc.y, 12, 18, 12, 16, comp.rotation, '#24292F', '#1F2328', '#111827');

        // 3D ATmega328P DIP-28 Microcontroller Chip in Socket
        const mcu = rotPt(10, 16);
        drawBox3D(
          mcu.x,
          mcu.y,
          12,
          38,
          13,
          10,
          comp.rotation,
          cam.xray ? '#3B234A' : '#1F2328',
          '#111827',
          '#1F2328'
        );
        if (cam.xray) {
          // Internal ATmega328P Silicon Die
          drawBox3D(mcu.x, mcu.y, 18, 14, 8, 5, comp.rotation, '#F59E0B', '#D97706', '#B45309');
        }

        // 3D Pin Header Strips & Live Pin 13 LED
        const led13 = rotPt(48, -22);
        drawCylinder3D(
          led13.x,
          led13.y,
          12,
          6,
          6,
          comp.state?.d13 ? '#FACC15' : '#4B5563',
          comp.state?.d13 ? '#FEF08A' : '#6B7280',
          10
        );
        break;
      }
      case 'FPGA': {
        // 3D Quad-Flat-Pack (QFP) FPGA Chip with Optional X-Ray CLB LUT Matrix
        drawBox3D(
          cx,
          cy,
          4,
          56,
          58,
          14,
          comp.rotation,
          cam.xray ? '#2E1A47' : '#24292F',
          '#1F2328',
          '#6042A6',
          '#6042A6'
        );
        if (cam.xray) {
          // 4x4 3D Configurable Logic Block (CLB) Silicon Array inside FPGA
          const activeAddr = comp.state?.lutAddr ?? 0;
          for (let r = 0; r < 4; r++) {
            for (let col = 0; col < 4; col++) {
              const idx = r * 4 + col;
              const isBitOn = (((comp.fpgaLutY0 ?? 0) >> idx) & 1) === 1;
              const isCur = idx === activeAddr;
              drawBox3D(
                cx + (col - 1.5) * 18,
                cy + (r - 1.5) * 18,
                16,
                6,
                6,
                isCur ? 7 : 3,
                comp.rotation,
                isCur ? '#56D364' : isBitOn ? '#2D70B3' : '#4B5563',
                '#1F2328',
                '#1F2328'
              );
            }
          }
        } else {
          // Metallic FPGA Heat Spreader Cap
          drawBox3D(cx, cy, 18, 34, 36, 2, comp.rotation, '#D1D5DB', '#9CA3AF', '#6B7280');
        }
        break;
      }
      case 'IC555':
      case 'CUSTOM_IC':
      case 'AND':
      case 'NAND':
      case 'OR':
      case 'NOR':
      case 'XOR':
      case 'NOT':
      case 'DFF':
      case 'SR_LATCH':
      case 'COUNTER4':
      case 'SHIFT4':
      case 'OPAMP': {
        const isBigIc = comp.type === 'IC555' || comp.type === 'CUSTOM_IC' || comp.type === 'COUNTER4' || comp.type === 'SHIFT4';
        const hx = isBigIc ? 48 : 30;
        const hy = isBigIc ? 48 : 28;
        const chipAccent =
          comp.type === 'CUSTOM_IC'
            ? (customChips.find((c) => c.id === comp.customChipId)?.color ?? '#FA7E19')
            : '#1F2328';

        drawBox3D(
          cx,
          cy,
          4,
          hx,
          hy,
          14,
          comp.rotation,
          cam.xray ? '#32383F' : '#24292F',
          '#1F2328',
          '#111827',
          chipAccent
        );

        if (cam.xray) {
          // 3D Internal Silicon Wafer Die & Gold Bond Wires inside the IC!
          drawBox3D(cx, cy, 16, hx * 0.45, hy * 0.45, 4, comp.rotation, '#F59E0B', '#D97706', '#B45309');
          const dieCenter = project({ x: cx, y: cy, z: 20 });
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = 1.5 * cam.zoom;
          for (const pin of pins) {
            const wp = getPinWorldPos(comp, pin);
            const pp = project({ x: wp.x * gridSize, y: wp.y * gridSize, z: 12 });
            ctx.beginPath();
            ctx.moveTo(dieCenter.x, dieCenter.y);
            ctx.lineTo(pp.x, pp.y);
            ctx.stroke();
          }
        }
        break;
      }
      default: {
        drawBox3D(cx, cy, 2, 16, 16, 8, comp.rotation, '#57606A', '#32383F', '#24292F');
      }
    }

    // Floating 3D Component Label above component (Strictly Calibri 15px+ Bold)
    const labelPt = project({ x: cx, y: cy, z: 36 });
    ctx.font = '700 15.5px Calibri, Carlito, sans-serif';
    ctx.textAlign = 'center';
    const baseLabel =
      comp.type === 'R' || comp.type === 'C' || comp.type === 'L' || comp.type === 'VDC'
        ? `${comp.label} (${formatSI(comp.value, cat.shortUnit)})`
        : comp.label;
    const textStr = comp.blown ? `${comp.label} BLOWN` : baseLabel;

    ctx.lineWidth = 4;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(textStr, labelPt.x, labelPt.y);
    ctx.fillStyle = comp.blown ? '#C74440' : (comp.stressRatio ?? 0) > 0.8 ? '#FA7E19' : '#1F2328';
    ctx.fillText(textStr, labelPt.x, labelPt.y);

    const bodyPt = project({ x: cx, y: cy, z: 12 });
    const baseR =
      comp.type === 'ARDUINO' ? 62 : comp.type === 'FPGA' || comp.type === 'IC555' || comp.type === 'CUSTOM_IC' || comp.type === 'SEG7' ? 44 : 26;
    hitTargets.push({ compId: comp.id, sx: bodyPt.x, sy: bodyPt.y, r: baseR * cam.zoom });

    // 3D Animated Sparks & Rising Smoke Puffs when Component is Blown!
    if (comp.blown) {
      // Electric sparks shooting out in 3D
      for (let sp = 0; sp < 6; sp++) {
        const ang = sp * 1.05 + animPhase * 3.5;
        const life = (animPhase * 2.2 + sp * 0.37) % 1;
        const r0 = 8 + life * 18;
        const r1 = r0 + 10;
        const z0 = 12 + life * 26;
        const z1 = z0 + 8;
        const pA = project({ x: cx + Math.cos(ang) * r0, y: cy + Math.sin(ang) * r0, z: z0 });
        const pB = project({ x: cx + Math.cos(ang) * r1, y: cy + Math.sin(ang) * r1, z: z1 });
        ctx.strokeStyle = sp % 2 === 0 ? '#FACC15' : '#FA7E19';
        ctx.lineWidth = 2.4 * cam.zoom;
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }
      // Rising 3D smoke puffs
      for (let sm = 0; sm < 4; sm++) {
        const sLife = (animPhase * 0.65 + sm * 0.25) % 1;
        const sz = 18 + sLife * 52;
        const sxOff = Math.sin(animPhase * 2 + sm * 1.7) * 8;
        const spPt = project({ x: cx + sxOff, y: cy, z: sz });
        ctx.fillStyle = `rgba(113, 113, 122, ${(1 - sLife) * 0.65})`;
        ctx.beginPath();
        ctx.arc(spPt.x, spPt.y, (6 + sLife * 14) * cam.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return hitTargets;
}
