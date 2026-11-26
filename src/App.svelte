<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type {
    AppSubpage,
    CircuitComponent,
    CompiledArduinoProgram,
    ComponentCategory,
    ComponentType,
    CustomChipDefinition,
    PhysicsMode,
    PinDef,
    ProbeSample,
    StressConfig,
    Wire,
  } from "./lib/types.ts";
  import { GLOSSARY_INFO } from "./lib/glossary.ts";
  import {
    CATALOG,
    TRACE_COLORS,
    FPGA_PROFILES,
    INITIAL_CUSTOM_CHIPS,
    formatElec,
    formatSI,
    getCatalogItem,
    getComponentPins,
    getPinWorldPos,
  } from "./lib/catalog.ts";
  import { stepCircuitPhysics } from "./lib/physics.ts";
  import {
    PRESETS,
    TUTORIALS,
    type CircuitPreset,
    type GuidedTutorial,
  } from "./lib/presets.ts";
  import {
    getResistorColorBands,
    renderCircuit3D,
    type Camera3D,
    type HitTarget3D,
  } from "./lib/renderer3d.ts";
  import {
    DEFAULT_ARDUINO_CODE,
    compileArduinoCode,
    synthesizeVerilogToLut4,
  } from "./lib/compiler.ts";
  import {
    decodeCircuitFromHash,
    downloadTextFile,
    encodeCircuitToHash,
    exportCircuitJson,
    exportPcbStl,
    exportPngSchematic,
    exportSvgSchematic,
    generateSpiceNetlist,
    importCircuitJson,
    loadCircuitFromLocalStorage,
    saveCircuitToLocalStorage,
  } from "./lib/exportUtils.ts";
  import {
    askAiTutorAsync,
    type AiMode,
    type AiTutorResponse,
  } from "./lib/aiAssistant.ts";

  const GRID = 28;

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

  let activeSubpage: AppSubpage = "circuit";

  let components: CircuitComponent[] = [];
  let wires: Wire[] = [];
  let customChips: CustomChipDefinition[] = [...INITIAL_CUSTOM_CHIPS];
  let activePresetId = "arduino-npn";

  // 3D Drawer is collapsed by default
  let show3DDrawer = false;
  let full3D = false;
  let physicalDrawingMode = false;
  let chipXray = true;

  let cam3D: Camera3D = {
    yaw: -0.55,
    pitch: 0.82,
    zoom: 0.92,
    panX: 0,
    panY: 10,
    xray: true,
  };
  let canvas3dEl: HTMLCanvasElement;
  let hitTargets3D: HitTarget3D[] = [];
  let inspected3DCompId: string | null = null;
  let isOrbiting3D = false;
  let isPanning3D = false;
  let orbitStart = { x: 0, y: 0, yaw: 0, pitch: 0, panX: 0, panY: 0 };

  let stressConfig: StressConfig = {
    ambientTempC: 25,
    voltageSurge: 1.0,
    emiNoiseV: 0.0,
    clockOverdrive: 1.0,
    burnoutEnabled: true,
    physicsMode: "realistic",
  };

  function setPhysicsMode(mode: PhysicsMode) {
    stressConfig.physicsMode = mode;
    stressConfig.burnoutEnabled = mode === "realistic";
    if (mode !== "realistic") {
      components = components.map((c) => ({
        ...c,
        blown: false,
        failureReason: mode === "sandbox" ? undefined : c.failureReason,
      }));
    }
    stressConfig = { ...stressConfig };
    const modeLabel =
      mode === "realistic"
        ? "Realistic Physics (Exact + Hardware Burnout)"
        : mode === "limited"
          ? "Limited Burnout (Exact Physics + Warnings Only)"
          : "Sandbox Mode (Ideal Textbook Models, No Burnout)";
    showToast(`Mode: ${modeLabel}`);
  }

  // Low-Level Open-Source Code IDE & Compiler State
  let ideTarget: "avr" | "verilog" = "avr";
  let avrSourceCode = DEFAULT_ARDUINO_CODE;
  let verilogSourceCode = FPGA_PROFILES["FULL-ADD"].verilog;
  let compiledArduino: CompiledArduinoProgram | undefined = undefined;
  let compilerLog = "[READY] AVR-GCC / Yosys-LUT4 Open-Source Toolchain v1.0";
  let verilogSynthInfo = synthesizeVerilogToLut4(
    FPGA_PROFILES["FULL-ADD"].verilog,
  );

  // Interactive Beginner Tutorial Dock State (Runs right on the live canvas!)
  let showTutorialBar = false;
  let activeTutorial: GuidedTutorial = TUTORIALS[0];
  let tutorialStepIdx = 0;
  let tutorialCompleted = false;

  // Simulation loop state
  let running = true;
  let simSpeed = 1;
  let simTime = 0;
  let animPhase = 0;
  let probeHistory: ProbeSample[] = [];
  let rafId = 0;

  let activeCategory: ComponentCategory = "analog";
  let glossaryFilter: ComponentCategory | "all" = "all";
  let glossarySearch = "";

  // Undo / Redo History Stack
  let undoStack: { components: CircuitComponent[]; wires: Wire[] }[] = [];
  let redoStack: { components: CircuitComponent[]; wires: Wire[] }[] = [];

  // Share/Export Toast
  let stress3dEl: HTMLCanvasElement;
  let statusToast = "";
  let showExportMenu = false;

  function showToast(msg: string) {
    statusToast = msg;
    setTimeout(() => {
      if (statusToast === msg) statusToast = "";
    }, 2800);
  }

  function pushHistory() {
    undoStack = [
      ...undoStack.slice(-29),
      {
        components: structuredClone(components),
        wires: structuredClone(wires),
      },
    ];
    redoStack = [];
    saveCircuitToLocalStorage({ components, wires, customChips });
  }

  function undo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    redoStack = [
      ...redoStack,
      {
        components: structuredClone(components),
        wires: structuredClone(wires),
      },
    ];
    undoStack = undoStack.slice(0, -1);
    stressConfig.repairGraceUntil = simTime + 0.12;
    components = prev.components.map((c) => ({
      ...c,
      blown: false,
      failureReason: undefined,
    }));
    wires = prev.wires;
    showToast("Undo");
  }

  function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    undoStack = [
      ...undoStack,
      {
        components: structuredClone(components),
        wires: structuredClone(wires),
      },
    ];
    redoStack = redoStack.slice(0, -1);
    stressConfig.repairGraceUntil = simTime + 0.12;
    components = next.components;
    wires = next.wires;
    showToast("Redo");
  }

  let importFileInput: HTMLInputElement;

  function handleImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = importCircuitJson(String(reader.result || ""));
      if (!parsed) {
        showToast("Invalid .circuitfab.json save file");
        return;
      }
      pushHistory();
      components = parsed.components;
      wires = parsed.wires;
      if (parsed.customChips.length > 0) customChips = parsed.customChips;
      selectedCompId = components[0]?.id ?? null;
      probeHistory = [];
      showToast(`Imported ${file.name}`);
    };
    reader.readAsText(file);
    input.value = "";
  }

  function copyShareUrl() {
    const hash = encodeCircuitToHash({ components, wires, customChips });
    window.location.hash = hash;
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
    showToast("Shareable circuit URL copied!");
  }
  let selectedCompId: string | null = null;
  let draggingCompId: string | null = null;
  let dragOffset = { x: 0, y: 0 };
  let pointerMovedDuringDrag = false;

  // Wiring state (supports both Click-Click AND Drag-and-Release!)
  let wiringFrom: { compId: string; pinId: string } | null = null;
  let hoveredPin: { compId: string; pinId: string } | null = null;
  let mouseGridPos = { x: 0, y: 0 };

  let pan = { x: 40, y: 20 };
  let zoom = 0.96;
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let svgEl: SVGSVGElement;

  let showScope = true;
  let scopeCanvas: HTMLCanvasElement;

  let newChipName = "AMP-BJT";
  let newChipTemplate: "bjt-stage" | "schmitt" | "h-bridge" | "capture-board" =
    "bjt-stage";
  let newChipColor = "#FA7E19";

  let hoverInfo: {
    title: string;
    detail: string;
    metrics?: string;
    x: number;
    y: number;
  } | null = null;

  function setHover(
    e: MouseEvent | PointerEvent,
    title: string,
    detail: string,
    metrics?: string,
  ) {
    hoverInfo = {
      title,
      detail,
      metrics,
      x: e.clientX,
      y: e.clientY,
    };
  }

  function moveHover(e: MouseEvent | PointerEvent) {
    if (hoverInfo) {
      hoverInfo.x = e.clientX;
      hoverInfo.y = e.clientY;
    }
  }

  function clearHover() {
    hoverInfo = null;
  }

  function loadPresetById(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) loadPreset(preset);
  }

  function loadPreset(preset: CircuitPreset) {
    showTutorialBar = false;
    tutorialCompleted = false;
    activePresetId = preset.id;
    stressConfig.burnoutEnabled = false;
    stressConfig.burnoutEnabled =
      (stressConfig.physicsMode ?? "realistic") === "realistic";
    components = preset.components.map((c) => ({
      ...c,
      blown: false,
      failureReason: undefined,
      tempC: stressConfig.ambientTempC,
      stressRatio: 0,
      pinVoltages: { ...c.pinVoltages },
      state: {},
    }));
    wires = preset.wires.map((w) => ({ ...w }));
    probeHistory = [];
    simTime = 0;
    selectedCompId = components[0]?.id ?? null;
    wiringFrom = null;
    for (let i = 0; i < 15; i++) {
      stepCircuitPhysics(
        components,
        wires,
        customChips,
        simTime,
        0.002,
        stressConfig,
        compiledArduino,
      );
    }
    components = [...components];
    wires = [...wires];
  }

  function startTutorial(tut: GuidedTutorial) {
    activeSubpage = "circuit";
    showTutorialBar = true;
    activeTutorial = tut;
    activePresetId = tut.id;
    tutorialStepIdx = 0;
    tutorialCompleted = false;
    stressConfig.burnoutEnabled = false;
    stressConfig.burnoutEnabled =
      (stressConfig.physicsMode ?? "realistic") === "realistic";
    stressConfig.voltageSurge = 1.0;
    components = tut.initialComponents.map((c) => ({
      ...c,
      blown: false,
      pinVoltages: {},
      state: {},
    }));
    wires = tut.initialWires.map((w) => ({ ...w }));
    probeHistory = [];
    simTime = 0;
    selectedCompId = components[0]?.id ?? null;
    wiringFrom = null;
    for (let i = 0; i < 10; i++) {
      stepCircuitPhysics(
        components,
        wires,
        customChips,
        simTime,
        0.002,
        stressConfig,
        compiledArduino,
      );
    }
    components = [...components];
    wires = [...wires];
  }

  function doCurrentTutorialStep() {
    if (!showTutorialBar || tutorialCompleted) return;
    const step = activeTutorial.steps[tutorialStepIdx];
    if (!step) return;
    const res = step.autoDo(components, wires);
    components = [...res.components];
    wires = [...res.wires];
    for (let i = 0; i < 15; i++) {
      stepCircuitPhysics(
        components,
        wires,
        customChips,
        simTime,
        0.002,
        stressConfig,
        compiledArduino,
      );
    }
    components = [...components];
    wires = [...wires];
    if (tutorialStepIdx + 1 < activeTutorial.steps.length) {
      tutorialStepIdx += 1;
    } else {
      tutorialCompleted = true;
    }
  }

  // Smart Non-Overlapping Grid Spot Finder so added components never pile on top of existing parts!
  function findFreeGridSpot(): { x: number; y: number } {
    const baseGx = Math.max(6, Math.round((420 - pan.x) / zoom / GRID));
    const baseGy = Math.max(5, Math.round((260 - pan.y) / zoom / GRID));

    for (let radius = 0; radius <= 18; radius += 3) {
      for (let dx = -radius; dx <= radius; dx += 3) {
        for (let dy = -radius; dy <= radius; dy += 3) {
          const gx = Math.max(5, baseGx + dx);
          const gy = Math.max(4, baseGy + dy);
          const overlaps = components.some(
            (c) => Math.abs(c.x - gx) < 4 && Math.abs(c.y - gy) < 3,
          );
          if (!overlaps) {
            return { x: gx, y: gy };
          }
        }
      }
    }
    return { x: baseGx + 3, y: baseGy + 3 };
  }

  function addComponent(
    type: ComponentType,
    customChipId?: string,
    dropPos?: { x: number; y: number },
  ) {
    const cat = getCatalogItem(type);
    const count = components.filter((c) => c.type === type).length + 1;
    const prefix =
      type === "R"
        ? "R"
        : type === "POT"
          ? "RV"
          : type === "FUSE"
            ? "F"
            : type === "BUZZER"
              ? "BZ"
              : type === "ZENER"
                ? "DZ"
                : type === "C"
                  ? "C"
                  : type === "L"
                    ? "L"
                    : type === "NPN" || type === "PNP"
                      ? "Q"
                      : type === "NMOS"
                        ? "M"
                        : type === "LED"
                          ? "LED"
                          : type === "DIODE"
                            ? "D"
                            : type === "VDC" || type === "VAC"
                              ? "V"
                              : type === "GND"
                                ? "GND"
                                : type === "LOGIC_IN"
                                  ? "B"
                                  : type === "CLK"
                                    ? "CLK"
                                    : type === "COUNTER4"
                                      ? "CNT"
                                      : type === "SHIFT4"
                                        ? "SR"
                                        : type === "SR_LATCH"
                                          ? "LATCH"
                                          : type === "FPGA"
                                            ? "FPGA"
                                            : type === "SEG7"
                                              ? "HEX"
                                              : "U";

    let label = `${prefix}${count}`;
    let color = TRACE_COLORS[components.length % TRACE_COLORS.length];

    if (type === "CUSTOM_IC" && customChipId) {
      const chip = customChips.find((c) => c.id === customChipId);
      if (chip) {
        label = chip.name;
        color = chip.color;
      }
    } else if (type === "ARDUINO") {
      label = `UNO${count > 1 ? count : ""}`;
      color = "#008184";
    } else if (type === "IC555") {
      label = `555_${count}`;
      color = "#FA7E19";
    } else if (type === "FPGA") {
      color = "#6042A6";
    }

    const spot = dropPos ?? findFreeGridSpot();

    const newComp: CircuitComponent = {
      id: `comp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      label,
      customChipId,
      x: spot.x,
      y: spot.y,
      rotation: 0,
      value: cat.defaultValue,
      param2: cat.defaultParam2,
      color,
      probed:
        components.filter((c) => c.probed).length < 3 &&
        type !== "GND" &&
        type !== "SEG7",
      switchClosed: true,
      fpgaProfile: type === "FPGA" ? "FULL-ADD" : undefined,
      fpgaLutY0: type === "FPGA" ? FPGA_PROFILES["FULL-ADD"].lutY0 : undefined,
      fpgaLutY1: type === "FPGA" ? FPGA_PROFILES["FULL-ADD"].lutY1 : undefined,
      pinVoltages: {},
      branchCurrent: 0,
      power: 0,
      tempC: stressConfig.ambientTempC,
      stressRatio: 0,
      blown: false,
      state: {},
    };

    components = [...components, newComp];
    selectedCompId = newComp.id;
    activeSubpage = "circuit";
    pushHistory();
  }

  // Beginner Helper: 1-Click Auto-Wire Selected Component to Nearest Pins!
  function autoWireComponent(compId: string) {
    const target = components.find((c) => c.id === compId);
    if (!target || components.length < 2) return;
    const targetPins = getComponentPins(target, customChips);

    const newWires = [...wires];

    for (const tPin of targetPins) {
      const alreadyConnected = newWires.some(
        (w) =>
          (w.fromCompId === target.id && w.fromPinId === tPin.id) ||
          (w.toCompId === target.id && w.toPinId === tPin.id),
      );
      if (alreadyConnected) continue;

      const tPos = getPinWorldPos(target, tPin);
      let bestMatch: { compId: string; pinId: string; dist: number } | null =
        null;

      for (const other of components) {
        if (other.id === target.id) continue;
        // Prefer connecting cathode/negative pins to GND if available
        const isNegPin =
          tPin.id === "K" ||
          tPin.id === "NEG" ||
          tPin.id === "E" ||
          tPin.id === "S" ||
          tPin.id === "GND";
        const oPins = getComponentPins(other, customChips);
        for (const oPin of oPins) {
          const oPos = getPinWorldPos(other, oPin);
          let dist = Math.hypot(tPos.x - oPos.x, tPos.y - oPos.y);
          if (isNegPin && other.type === "GND") dist *= 0.45;
          if (!isNegPin && other.type === "GND") dist *= 2.5;
          if (!bestMatch || dist < bestMatch.dist) {
            bestMatch = { compId: other.id, pinId: oPin.id, dist };
          }
        }
      }

      if (bestMatch) {
        const alreadyUsedPin = newWires.some(
          (w) =>
            (w.fromCompId === bestMatch!.compId &&
              w.fromPinId === bestMatch!.pinId) ||
            (w.toCompId === bestMatch!.compId &&
              w.toPinId === bestMatch!.pinId),
        );
        if (!alreadyUsedPin || tPin.id === "GND" || tPin.id === "NEG") {
          newWires.push({
            id: `w_aw_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            fromCompId: target.id,
            fromPinId: tPin.id,
            toCompId: bestMatch.compId,
            toPinId: bestMatch.pinId,
            voltage: 0,
            current: 0,
          });
        }
      }
    }
    wires = newWires;
  }

  function flipPolarity(id: string) {
    components = components.map((c) =>
      c.id === id
        ? { ...c, rotation: ((c.rotation + 180) % 360) as 0 | 90 | 180 | 270 }
        : c,
    );
  }

  function rotateComponent(id: string) {
    components = components.map((c) =>
      c.id === id
        ? { ...c, rotation: ((c.rotation + 90) % 360) as 0 | 90 | 180 | 270 }
        : c,
    );
  }

  function toggleProbe(id: string) {
    components = components.map((c) =>
      c.id === id ? { ...c, probed: !c.probed } : c,
    );
  }

  function deleteComponent(id: string) {
    pushHistory();
    components = components.filter((c) => c.id !== id);
    wires = wires.filter((w) => w.fromCompId !== id && w.toCompId !== id);
    if (selectedCompId === id) selectedCompId = components[0]?.id ?? null;
  }

  function deleteWire(id: string) {
    pushHistory();
    wires = wires.filter((w) => w.id !== id);
  }

  function clearBoard() {
    components = [];
    wires = [];
    probeHistory = [];
    selectedCompId = null;
    wiringFrom = null;
    showTutorialBar = false;
  }

  function repairComponent(id: string) {
    pushHistory();
    stressConfig.repairGraceUntil = simTime + 0.08;
    components = components.map((c) => {
      if (c.id !== id) return c;
      const safeVal = c.type === "R" && c.value < 220 ? 220 : c.value;
      return {
        ...c,
        value: safeVal,
        blown: false,
        failureReason: undefined,
        tempC: 25,
        stressRatio: 0,
      };
    });
    showToast("Component repaired");
  }

  function repairAllComponents() {
    pushHistory();
    stressConfig.voltageSurge = 1.0;
    stressConfig.ambientTempC = 25;
    stressConfig.emiNoiseV = 0;
    stressConfig.clockOverdrive = 1.0;
    stressConfig.burnoutEnabled =
      (stressConfig.physicsMode ?? "realistic") === "realistic";
    stressConfig.repairGraceUntil = simTime + 0.08;

    const hadOvercurrent = components.some(
      (c) =>
        c.blown &&
        (c.failureReason?.includes("OVERCURRENT") ||
          c.failureReason?.includes("OVER-POWER")),
    );
    let upgradedResistors = 0;

    components = components.map((c) => {
      let nextVal = c.value;
      if (c.type === "R" && (c.blown || hadOvercurrent) && c.value < 150) {
        nextVal = 220;
        upgradedResistors++;
      }
      return {
        ...c,
        value: nextVal,
        blown: false,
        failureReason: undefined,
        tempC: 25,
        stressRatio: 0,
      };
    });

    // Run a quick physics check: if the circuit is still unfixable (e.g. direct short or LED with no resistor),
    // automatically restart the active preset so the user isn't stuck in a blowout loop!
    const testComps = structuredClone(components);
    const testWires = structuredClone(wires);
    const checkStress: StressConfig = { ...stressConfig, repairGraceUntil: undefined };
    for (let i = 0; i < 10; i++) {
      stepCircuitPhysics(
        testComps,
        testWires,
        customChips,
        simTime + i * 0.002,
        0.002,
        checkStress,
        compiledArduino,
      );
    }
    const stillUnfixable = testComps.some((c) => c.blown || (c.stressRatio ?? 0) > 1.15);
    if (stillUnfixable) {
      loadPresetById(activePresetId);
      showToast("Unfixable short/overload — restarted circuit");
      return;
    }

    showToast(
      upgradedResistors > 0
        ? `Repaired all parts & upgraded ${upgradedResistors} overloaded resistor(s) to safe 220Ω`
        : "Repaired all blown components & reset stress chamber",
    );
  }

  function cleanUnconnectedParts() {
    const connectedIds = new Set<string>();
    for (const w of wires) {
      connectedIds.add(w.fromCompId);
      connectedIds.add(w.toCompId);
    }
    const floating = components.filter((c) => !connectedIds.has(c.id));
    if (floating.length === 0) {
      showToast("All parts on the board are wired");
      return;
    }
    pushHistory();
    components = components.filter((c) => connectedIds.has(c.id));
    if (selectedCompId && !connectedIds.has(selectedCompId)) {
      selectedCompId = components[0]?.id ?? null;
    }
    showToast(`Removed ${floating.length} unwired part(s)`);
  }

  function syncWorkspaceToIdeCode() {
    const connectedNames = (compId: string, pinId: string): string[] => {
      const names: string[] = [];
      for (const w of wires) {
        if (w.fromCompId === compId && w.fromPinId === pinId) {
          const other = components.find((c) => c.id === w.toCompId);
          if (other) names.push(`${other.label} (${other.type})`);
        } else if (w.toCompId === compId && w.toPinId === pinId) {
          const other = components.find((c) => c.id === w.fromCompId);
          if (other) names.push(`${other.label} (${other.type})`);
        }
      }
      return names;
    };

    if (ideTarget === "avr") {
      const uno = components.find((c) => c.type === "ARDUINO");
      const d13Nets = uno ? connectedNames(uno.id, "D13") : [];
      const d11Nets = uno ? connectedNames(uno.id, "D11") : [];
      const d9Nets = uno ? connectedNames(uno.id, "D9") : [];
      const a0Nets = uno ? connectedNames(uno.id, "A0") : [];
      const freq = uno?.value ?? 2.5;
      const duty = uno?.param2 ?? 50;
      const halfPeriodMs = Math.max(10, Math.round(500 / Math.max(0.5, freq)));

      avrSourceCode = `// Auto-Generated AVR C Firmware from Live Workspace (${components.length} parts, ${wires.length} wires)
// Board Mapping:
//   D13 (PB5) -> ${d13Nets.length > 0 ? d13Nets.join(", ") : "Unconnected"}
//   D11 (PB3) -> ${d11Nets.length > 0 ? d11Nets.join(", ") : "Unconnected"}
//   D9  (PB1) -> ${d9Nets.length > 0 ? d9Nets.join(", ") : "Unconnected"}
//   A0  (ADC0)-> ${a0Nets.length > 0 ? a0Nets.join(", ") : "Unconnected"}
#include <avr/io.h>
#include <util/delay.h>

void setup() {
  DDRB |= (1 << PB5) | (1 << PB3) | (1 << PB1); // D13, D11, D9 as OUTPUT
  Serial.begin(9600);
  Serial.println("WORKSPACE_SYNC_OK: ${components.length}_PARTS");
}

void loop() {
  int adcA0 = analogRead(A0); // Live A0 = ${uno ? (uno.pinVoltages.A0 ?? 0).toFixed(2) : "0.00"}V (${uno?.state?.adcA0 ?? 0}/1023)
  if (adcA0 > 450) {
    digitalWrite(9, HIGH); // Threshold comparator active on D9
  } else {
    digitalWrite(9, LOW);
  }
  PORTB |= (1 << PB5);
  analogWrite(11, ${Math.round((duty / 100) * 255)}); // ${duty}% PWM Duty Cycle
  delay(${halfPeriodMs});
  PORTB &= ~(1 << PB5);
  delay(${halfPeriodMs});
}`;
      runIdeCompiler();
      showToast("Generated AVR C firmware from live workspace");
    } else {
      const fpga = getOrEnsureFpga();
      const i0Nets = connectedNames(fpga.id, "I0");
      const i1Nets = connectedNames(fpga.id, "I1");
      const i2Nets = connectedNames(fpga.id, "I2");
      const i3Nets = connectedNames(fpga.id, "I3");
      const y0Nets = connectedNames(fpga.id, "Y0");
      const y1Nets = connectedNames(fpga.id, "Y1");
      const prof =
        FPGA_PROFILES[fpga.fpgaProfile ?? "FULL-ADD"] ??
        FPGA_PROFILES["FULL-ADD"];

      verilogSourceCode = `// Auto-Generated Verilog HDL from Live Workspace (${components.length} parts, ${wires.length} wires)
// Active FPGA Profile: ${fpga.fpgaProfile ?? "CUSTOM"} (LUT0=0x${(fpga.fpgaLutY0 ?? prof.lutY0).toString(16).toUpperCase()}, LUT1=0x${(fpga.fpgaLutY1 ?? prof.lutY1).toString(16).toUpperCase()})
// Pin Netlist:
//   I0 <- ${i0Nets.length > 0 ? i0Nets.join(", ") : "0V"} | I1 <- ${i1Nets.length > 0 ? i1Nets.join(", ") : "0V"}
//   I2 <- ${i2Nets.length > 0 ? i2Nets.join(", ") : "0V"} | I3 <- ${i3Nets.length > 0 ? i3Nets.join(", ") : "0V"}
//   Y0 -> ${y0Nets.length > 0 ? y0Nets.join(", ") : "Open"} | Y1 -> ${y1Nets.length > 0 ? y1Nets.join(", ") : "Open"}
module fpga_clb (
  input  I0, I1, I2, I3,
  output Y0, Y1
);
  assign Y0 = I0 ^ I1 ^ I2;
  assign Y1 = (I0 & I1) | (I1 & I2) | (I0 & I2);
endmodule`;
      runIdeCompiler();
      showToast("Generated Verilog HDL from live workspace");
    }
  }

  function getOrEnsureFpga(): CircuitComponent {
    let existing = components.find((c) => c.type === "FPGA");
    if (!existing) {
      loadPresetById("fpga-adder");
      existing = components.find((c) => c.type === "FPGA")!;
    }
    return existing;
  }

  function applyFpgaProfile(profKey: string) {
    const prof = FPGA_PROFILES[profKey];
    if (!prof) return;
    const fpga = getOrEnsureFpga();
    verilogSourceCode = prof.verilog;
    verilogSynthInfo = synthesizeVerilogToLut4(prof.verilog);
    components = components.map((c) =>
      c.id === fpga.id
        ? {
            ...c,
            fpgaProfile: profKey,
            fpgaLutY0: prof.lutY0,
            fpgaLutY1: prof.lutY1,
          }
        : c,
    );
  }

  function toggleFpgaLutBit(outputIdx: 0 | 1, rowAddr: number) {
    const fpga = getOrEnsureFpga();
    components = components.map((c) => {
      if (c.id !== fpga.id) return c;
      const mask = 1 << rowAddr;
      if (outputIdx === 0) {
        const cur = c.fpgaLutY0 ?? 0;
        return { ...c, fpgaProfile: "CUSTOM", fpgaLutY0: cur ^ mask };
      } else {
        const cur = c.fpgaLutY1 ?? 0;
        return { ...c, fpgaProfile: "CUSTOM", fpgaLutY1: cur ^ mask };
      }
    });
  }

  function runIdeCompiler() {
    if (ideTarget === "avr") {
      const prog = compileArduinoCode(avrSourceCode);
      compiledArduino = prog;
      if (!components.some((c) => c.type === "ARDUINO")) {
        loadPresetById("arduino-npn");
      }
      components = components.map((c) =>
        c.type === "ARDUINO"
          ? { ...c, value: prog.freqHz, param2: prog.dutyCycle }
          : c,
      );
      compilerLog = `[AVR-GCC] Compiled ${prog.instructionsCount} bytes -> Flashed UNO (${prog.freqHz}Hz, Duty=${prog.dutyCycle}%, A0>${prog.d9ThresholdV}V) | HEX ${prog.hexPreview}`;
    } else {
      const res = synthesizeVerilogToLut4(verilogSourceCode);
      verilogSynthInfo = res;
      const fpga = getOrEnsureFpga();
      components = components.map((c) =>
        c.id === fpga.id
          ? {
              ...c,
              fpgaProfile: "VERILOG",
              fpgaLutY0: res.lutY0,
              fpgaLutY1: res.lutY1,
            }
          : c,
      );
      compilerLog = res.log;
    }
  }

  function createCustomChip() {
    const cleanName = (newChipName.trim() || "CHIP-X")
      .toUpperCase()
      .slice(0, 9);
    const id = `chip_${Date.now()}`;
    let chipDef: CustomChipDefinition;

    if (newChipTemplate === "bjt-stage") {
      chipDef = {
        id,
        name: cleanName,
        description: "Pre-Biased Common-Emitter NPN Amplifier IC Stage",
        color: newChipColor,
        pins: [
          {
            id: "IN",
            label: "IN",
            dx: -3,
            dy: -1,
            description: "Base Signal Input",
          },
          {
            id: "VCC",
            label: "VCC",
            dx: -3,
            dy: 1,
            description: "Positive Supply",
          },
          {
            id: "OUT",
            label: "OUT",
            dx: 3,
            dy: -1,
            description: "Amplified Output",
          },
          {
            id: "GND",
            label: "GND",
            dx: 3,
            dy: 1,
            description: "Ground Reference",
          },
        ],
        subcircuit: [
          { type: "R", pins: { A: "IN", B: "NB" }, value: 4700 },
          { type: "NPN", pins: { B: "NB", C: "OUT", E: "GND" }, value: 140 },
          { type: "R", pins: { A: "VCC", B: "OUT" }, value: 1500 },
        ],
      };
    } else if (newChipTemplate === "schmitt") {
      chipDef = {
        id,
        name: cleanName,
        description: "Dual-Stage CMOS Buffer IC",
        color: newChipColor,
        pins: [
          {
            id: "IN",
            label: "IN",
            dx: -3,
            dy: 0,
            description: "Digital Input",
          },
          { id: "VCC", label: "VCC", dx: 3, dy: -2, description: "+5V Supply" },
          {
            id: "OUT",
            label: "OUT",
            dx: 3,
            dy: 0,
            description: "Buffered Output",
          },
          {
            id: "GND",
            label: "GND",
            dx: 3,
            dy: 2,
            description: "Ground Reference",
          },
        ],
        subcircuit: [
          { type: "NOT", pins: { A: "IN", Y: "NMID" }, value: 5 },
          { type: "NOT", pins: { A: "NMID", Y: "OUT" }, value: 5 },
          { type: "R", pins: { A: "VCC", B: "GND" }, value: 22000 },
        ],
      };
    } else if (newChipTemplate === "h-bridge") {
      chipDef = {
        id,
        name: cleanName,
        description: "Push-Pull Totem-Pole Complementary BJT Power Driver IC",
        color: newChipColor,
        pins: [
          {
            id: "DRV",
            label: "DRV",
            dx: -3,
            dy: 0,
            description: "Drive Input",
          },
          {
            id: "VCC",
            label: "VCC",
            dx: 3,
            dy: -2,
            description: "Positive Rail",
          },
          {
            id: "OUT",
            label: "OUT",
            dx: 3,
            dy: 0,
            description: "Push-Pull Output",
          },
          {
            id: "GND",
            label: "GND",
            dx: 3,
            dy: 2,
            description: "Ground Return",
          },
        ],
        subcircuit: [
          { type: "NPN", pins: { B: "DRV", C: "VCC", E: "OUT" }, value: 120 },
          { type: "PNP", pins: { B: "DRV", E: "OUT", C: "GND" }, value: 120 },
        ],
      };
    } else {
      const hasNpn = components.some((c) => c.type === "NPN");
      chipDef = {
        id,
        name: cleanName,
        description: `Captured Board Subcircuit IC (${components.length} elements)`,
        color: newChipColor,
        pins: [
          { id: "IN", label: "IN", dx: -3, dy: -1, description: "Input Pin" },
          { id: "GND", label: "GND", dx: -3, dy: 1, description: "Ground Pin" },
          { id: "OUT", label: "OUT", dx: 3, dy: 0, description: "Output Pin" },
        ],
        subcircuit: hasNpn
          ? [
              { type: "R", pins: { A: "IN", B: "NB" }, value: 2200 },
              {
                type: "NPN",
                pins: { B: "NB", C: "OUT", E: "GND" },
                value: 150,
              },
            ]
          : [
              { type: "R", pins: { A: "IN", B: "OUT" }, value: 1000 },
              { type: "C", pins: { A: "OUT", B: "GND" }, value: 0.000022 },
            ],
      };
    }

    customChips = [...customChips, chipDef];
    addComponent("CUSTOM_IC", chipDef.id);
  }

  function clientToGrid(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    if (!svgEl) return { x: 0, y: 0 };
    const rect = svgEl.getBoundingClientRect();
    const sx = (clientX - rect.left - pan.x) / zoom;
    const sy = (clientY - rect.top - pan.y) / zoom;
    return {
      x: Math.round(sx / GRID),
      y: Math.round(sy / GRID),
    };
  }

  function onCanvasPointerDown(e: PointerEvent) {
    if (e.button === 1 || (e.button === 0 && e.target === svgEl)) {
      if (wiringFrom) {
        wiringFrom = null;
        return;
      }
      isPanning = true;
      panStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }

  function onCanvasPointerMove(e: PointerEvent) {
    if (!svgEl) return;
    mouseGridPos = clientToGrid(e.clientX, e.clientY);

    if (isPanning) {
      pan = {
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      };
      return;
    }

    if (draggingCompId) {
      const gx = mouseGridPos.x - dragOffset.x;
      const gy = mouseGridPos.y - dragOffset.y;
      const target = components.find((c) => c.id === draggingCompId);
      if (target && (target.x !== gx || target.y !== gy)) {
        pointerMovedDuringDrag = true;
        components = components.map((c) =>
          c.id === draggingCompId ? { ...c, x: gx, y: gy } : c,
        );
      }
    }
  }

  function finishWireTo(compId: string, pinId: string) {
    if (!wiringFrom) return;
    if (wiringFrom.compId === compId && wiringFrom.pinId === pinId) return;
    const exists = wires.some(
      (w) =>
        (w.fromCompId === wiringFrom!.compId &&
          w.fromPinId === wiringFrom!.pinId &&
          w.toCompId === compId &&
          w.toPinId === pinId) ||
        (w.toCompId === wiringFrom!.compId &&
          w.toPinId === wiringFrom!.pinId &&
          w.fromCompId === compId &&
          w.fromPinId === pinId),
    );
    if (!exists) {
      pushHistory();
      wires = [
        ...wires,
        {
          id: `w_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          fromCompId: wiringFrom.compId,
          fromPinId: wiringFrom.pinId,
          toCompId: compId,
          toPinId: pinId,
          voltage: 0,
          current: 0,
        },
      ];
    }
    wiringFrom = null;
  }

  function onCanvasPointerUp() {
    // If user dragged a wire from one pin and released over another pin, complete the connection!
    if (
      wiringFrom &&
      hoveredPin &&
      (hoveredPin.compId !== wiringFrom.compId ||
        hoveredPin.pinId !== wiringFrom.pinId)
    ) {
      finishWireTo(hoveredPin.compId, hoveredPin.pinId);
    }

    if (draggingCompId && !pointerMovedDuringDrag) {
      const clicked = components.find((c) => c.id === draggingCompId);
      if (clicked && (clicked.type === "LOGIC_IN" || clicked.type === "SW")) {
        components = components.map((c) =>
          c.id === clicked.id ? { ...c, switchClosed: !c.switchClosed } : c,
        );
      }
    }
    isPanning = false;
    draggingCompId = null;
    pointerMovedDuringDrag = false;
  }

  function onCanvasWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = Math.max(0.45, Math.min(2.2, zoom * factor));
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    pan = {
      x: mx - ((mx - pan.x) / zoom) * nextZoom,
      y: my - ((my - pan.y) / zoom) * nextZoom,
    };
    zoom = nextZoom;
  }

  function on3DPointerDown(e: PointerEvent) {
    if (e.button === 2 || e.shiftKey) {
      isPanning3D = true;
    } else {
      isOrbiting3D = true;
    }
    orbitStart = {
      x: e.clientX,
      y: e.clientY,
      yaw: cam3D.yaw,
      pitch: cam3D.pitch,
      panX: cam3D.panX,
      panY: cam3D.panY,
    };
  }

  function on3DPointerMove(e: PointerEvent) {
    if (isOrbiting3D) {
      const dx = e.clientX - orbitStart.x;
      const dy = e.clientY - orbitStart.y;
      cam3D.yaw = orbitStart.yaw + dx * 0.008;
      cam3D.pitch = Math.max(
        0.25,
        Math.min(1.45, orbitStart.pitch + dy * 0.007),
      );
    } else if (isPanning3D) {
      cam3D.panX = orbitStart.panX + (e.clientX - orbitStart.x);
      cam3D.panY = orbitStart.panY + (e.clientY - orbitStart.y);
    }
  }

  function on3DPointerUp(e: PointerEvent) {
    const moved = Math.hypot(
      e.clientX - orbitStart.x,
      e.clientY - orbitStart.y,
    );
    if (moved < 6 && canvas3dEl) {
      const rect = canvas3dEl.getBoundingClientRect();
      const tx = e.clientX - rect.left;
      const ty = e.clientY - rect.top;
      // Search top-most (last drawn) hit target first
      let found: string | null = null;
      for (let i = hitTargets3D.length - 1; i >= 0; i--) {
        const ht = hitTargets3D[i];
        if (Math.hypot(tx - ht.sx, ty - ht.sy) <= ht.r) {
          found = ht.compId;
          break;
        }
      }
      inspected3DCompId = found;
      if (found) selectedCompId = found;
    }
    isOrbiting3D = false;
    isPanning3D = false;
  }

  function on3DWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    cam3D.zoom = Math.max(0.4, Math.min(2.4, cam3D.zoom * factor));
  }

  function onComponentPointerDown(e: PointerEvent, comp: CircuitComponent) {
    e.stopPropagation();
    selectedCompId = comp.id;
    pointerMovedDuringDrag = false;
    const g = clientToGrid(e.clientX, e.clientY);
    dragOffset = { x: g.x - comp.x, y: g.y - comp.y };
    draggingCompId = comp.id;
  }

  function onPinPointerDown(
    e: PointerEvent,
    comp: CircuitComponent,
    pin: PinDef,
  ) {
    e.stopPropagation();
    if (!wiringFrom) {
      wiringFrom = { compId: comp.id, pinId: pin.id };
      return;
    }
    if (wiringFrom.compId === comp.id && wiringFrom.pinId === pin.id) {
      wiringFrom = null;
      return;
    }
    finishWireTo(comp.id, pin.id);
  }

  function getWirePoints(w: Wire): {
    x1: number;
    y1: number;
    mx: number;
    my: number;
    x2: number;
    y2: number;
    pathD: string;
  } | null {
    const c1 = components.find((c) => c.id === w.fromCompId);
    const c2 = components.find((c) => c.id === w.toCompId);
    if (!c1 || !c2) return null;
    const p1 = getComponentPins(c1, customChips).find(
      (p) => p.id === w.fromPinId,
    );
    const p2 = getComponentPins(c2, customChips).find(
      (p) => p.id === w.toPinId,
    );
    if (!p1 || !p2) return null;
    const pos1 = getPinWorldPos(c1, p1);
    const pos2 = getPinWorldPos(c2, p2);
    const x1 = pos1.x * GRID;
    const y1 = pos1.y * GRID;
    const x2 = pos2.x * GRID;
    const y2 = pos2.y * GRID;
    let mx = x2;
    let my = y1;
    // Choose the L-bend corner that avoids passing directly through another component center
    const corner1Blocked = components.some(
      (c) =>
        c.id !== w.fromCompId &&
        c.id !== w.toCompId &&
        Math.hypot(c.x * GRID - x2, c.y * GRID - y1) < GRID * 0.9,
    );
    if (corner1Blocked) {
      mx = x1;
      my = y2;
    }
    // Avoid routing vertically through UNO's A0 pin when wiring from below up to UNO.GND
    if (c2.type === "ARDUINO" && w.toPinId === "GND" && y1 > y2 && Math.abs(x1 - x2) < GRID * 3) {
      const clearX = x2 - GRID;
      return {
        x1,
        y1,
        mx: clearX,
        my: y1,
        x2,
        y2,
        pathD: `M ${x1} ${y1} L ${clearX} ${y1} L ${clearX} ${y2} L ${x2} ${y2}`,
      };
    }
    return { x1, y1, mx, my, x2, y2, pathD: `M ${x1} ${y1} L ${mx} ${my} L ${x2} ${y2}` };
  }

  function wireColor(v: number): string {
    if (v > 0.35) return "#2D70B3";
    if (v < -0.35) return "#C74440";
    return "#6E7781";
  }

  function getElectronDots(
    pts: {
      x1: number;
      y1: number;
      mx: number;
      my: number;
      x2: number;
      y2: number;
    },
    current: number,
    phase: number,
  ): { x: number; y: number }[] {
    const seg1 = Math.hypot(pts.mx - pts.x1, pts.my - pts.y1);
    const seg2 = Math.hypot(pts.x2 - pts.mx, pts.y2 - pts.my);
    const total = seg1 + seg2;
    if (total < 6 || Math.abs(current) < 1e-6) return [];

    const spacing = 26;
    const count = Math.max(1, Math.floor(total / spacing));
    const dir = current >= 0 ? 1 : -1;
    const speedScale = Math.min(
      3.5,
      Math.max(0.25, Math.log10(Math.abs(current) * 1e4 + 1)),
    );
    const offset =
      (((phase * dir * speedScale * 30) % spacing) + spacing) % spacing;

    const dots: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const d = i * spacing + offset;
      if (d > total) continue;
      if (d <= seg1 && seg1 > 0) {
        const t = d / seg1;
        dots.push({
          x: pts.x1 + (pts.mx - pts.x1) * t,
          y: pts.y1 + (pts.my - pts.y1) * t,
        });
      } else if (seg2 > 0) {
        const t = (d - seg1) / seg2;
        dots.push({
          x: pts.mx + (pts.x2 - pts.mx) * t,
          y: pts.my + (pts.y2 - pts.my) * t,
        });
      }
    }
    return dots;
  }

  function getCompPrimaryVoltage(comp: CircuitComponent): number {
    if (comp.type === "ARDUINO") return comp.pinVoltages.D13 ?? 0;
    if (comp.type === "IC555") return comp.pinVoltages.OUT ?? 0;
    if (comp.type === "FPGA") return comp.pinVoltages.Y0 ?? 0;
    if (comp.type === "DFF") return comp.pinVoltages.Q ?? 0;
    if (comp.type === "LOGIC_IN" || comp.type === "CLK")
      return comp.pinVoltages.Y ?? 0;
    if (comp.type === "NPN" || comp.type === "PNP")
      return comp.pinVoltages.C ?? 0;
    if (comp.type === "NMOS") return comp.pinVoltages.D ?? 0;
    if (comp.type === "OPAMP") return comp.pinVoltages.OUT ?? 0;
    if (
      comp.type === "AND" ||
      comp.type === "NAND" ||
      comp.type === "OR" ||
      comp.type === "NOR" ||
      comp.type === "XOR" ||
      comp.type === "NOT"
    ) {
      return comp.pinVoltages.Y ?? 0;
    }
    if (comp.type === "CUSTOM_IC") {
      return (
        comp.pinVoltages.OUT ??
        comp.pinVoltages.C ??
        Object.values(comp.pinVoltages)[0] ??
        0
      );
    }
    if (
      comp.type === "C" ||
      comp.type === "R" ||
      comp.type === "L" ||
      comp.type === "FUSE"
    ) {
      return (comp.pinVoltages.A ?? 0) - (comp.pinVoltages.B ?? 0);
    }
    if (comp.type === "POT") {
      return comp.pinVoltages.W ?? 0;
    }
    if (
      comp.type === "LED" ||
      comp.type === "DIODE" ||
      comp.type === "ZENER" ||
      comp.type === "BUZZER"
    ) {
      return (comp.pinVoltages.A ?? 0) - (comp.pinVoltages.K ?? 0);
    }
    if (comp.type === "SR_LATCH") {
      return comp.pinVoltages.Q ?? 0;
    }
    if (comp.type === "COUNTER4" || comp.type === "SHIFT4") {
      return comp.pinVoltages.Q0 ?? 0;
    }
    if (comp.type === "VDC" || comp.type === "VAC") {
      return (comp.pinVoltages.POS ?? 0) - (comp.pinVoltages.NEG ?? 0);
    }
    return 0;
  }

  function renderOscilloscope() {
    if (!scopeCanvas || !showScope || activeSubpage !== "circuit") return;
    const ctx = scopeCanvas.getContext("2d");
    if (!ctx) return;
    const W = scopeCanvas.width;
    const H = scopeCanvas.height;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#ECEFF3";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const midY = H * 0.68;
    ctx.strokeStyle = "#D0D7DE";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(W, midY);
    ctx.stroke();

    ctx.fillStyle = "#57606A";
    ctx.font = "600 15px Calibri, Carlito, sans-serif";
    ctx.fillText("5V", 6, midY - 46);
    ctx.fillText("0V", 6, midY - 4);

    const probedComps = components.filter((c) => c.probed);
    if (probeHistory.length < 2 || probedComps.length === 0) return;

    const scaleY = 10;

    for (const comp of probedComps) {
      ctx.strokeStyle = comp.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < probeHistory.length; i++) {
        const sample = probeHistory[i];
        const v = sample.values[comp.id] ?? 0;
        const px = (i / Math.max(1, 160 - 1)) * W;
        const py = Math.max(6, Math.min(H - 6, midY - v * scaleY));
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }
  }

  function render3DViewport() {
    if (!canvas3dEl || !show3DDrawer || activeSubpage !== "circuit") return;
    const rect = canvas3dEl.parentElement?.getBoundingClientRect();
    if (
      rect &&
      (canvas3dEl.width !== Math.floor(rect.width) ||
        canvas3dEl.height !== Math.floor(rect.height))
    ) {
      canvas3dEl.width = Math.floor(rect.width);
      canvas3dEl.height = Math.floor(rect.height);
    }
    const ctx = canvas3dEl.getContext("2d");
    if (!ctx) return;
    cam3D.xray = chipXray;
    hitTargets3D = renderCircuit3D(
      ctx,
      canvas3dEl.width,
      canvas3dEl.height,
      components,
      wires,
      customChips,
      cam3D,
      GRID,
      animPhase,
      selectedCompId,
    );
  }

  function renderStress3DViewport() {
    if (!stress3dEl || activeSubpage !== "stress") return;
    const rect = stress3dEl.parentElement?.getBoundingClientRect();
    if (
      rect &&
      (stress3dEl.width !== Math.floor(rect.width) ||
        stress3dEl.height !== Math.floor(rect.height))
    ) {
      stress3dEl.width = Math.floor(rect.width);
      stress3dEl.height = Math.floor(rect.height);
    }
    const ctx = stress3dEl.getContext("2d");
    if (!ctx) return;
    cam3D.xray = chipXray;
    renderCircuit3D(
      ctx,
      stress3dEl.width,
      stress3dEl.height,
      components,
      wires,
      customChips,
      cam3D,
      GRID,
      animPhase,
      selectedCompId,
    );
  }

  function toSliderVal(
    comp: CircuitComponent,
    cat: ReturnType<typeof getCatalogItem>,
  ): number {
    if (!cat.logScale) return comp.value;
    const minL = Math.log10(cat.minVal);
    const maxL = Math.log10(cat.maxVal);
    const curL = Math.log10(Math.max(cat.minVal, comp.value));
    return ((curL - minL) / (maxL - minL)) * 100;
  }

  function fromSliderVal(
    raw: number,
    cat: ReturnType<typeof getCatalogItem>,
  ): number {
    if (!cat.logScale) return raw;
    const minL = Math.log10(cat.minVal);
    const maxL = Math.log10(cat.maxVal);
    const val = Math.pow(10, minL + (raw / 100) * (maxL - minL));
    const mag = Math.pow(10, Math.floor(Math.log10(val)) - 1);
    return Math.round(val / mag) * mag;
  }

  function getTutorialHighlight(step: GuidedTutorial["steps"][number]): {
    x1: number;
    y1: number;
    x2?: number;
    y2?: number;
  } | null {
    if (!step.targetCompId) return null;
    const c1 = components.find((c) => c.id === step.targetCompId);
    if (!c1) return null;
    let x1 = c1.x * GRID;
    let y1 = c1.y * GRID;
    if (step.targetPinId) {
      const p1 = getComponentPins(c1, customChips).find(
        (p) => p.id === step.targetPinId,
      );
      if (p1) {
        const w1 = getPinWorldPos(c1, p1);
        x1 = w1.x * GRID;
        y1 = w1.y * GRID;
      }
    }
    if (step.toCompId) {
      const c2 = components.find((c) => c.id === step.toCompId);
      if (c2) {
        let x2 = c2.x * GRID;
        let y2 = c2.y * GRID;
        if (step.toPinId) {
          const p2 = getComponentPins(c2, customChips).find(
            (p) => p.id === step.toPinId,
          );
          if (p2) {
            const w2 = getPinWorldPos(c2, p2);
            x2 = w2.x * GRID;
            y2 = w2.y * GRID;
          }
        }
        return { x1, y1, x2, y2 };
      }
    }
    return { x1, y1 };
  }

  onMount(() => {
    const fromHash = decodeCircuitFromHash(window.location.hash);
    const fromStorage = !fromHash ? loadCircuitFromLocalStorage() : null;
    if (fromHash) {
      components = fromHash.components;
      wires = fromHash.wires;
      if (fromHash.customChips.length > 0) customChips = fromHash.customChips;
      showToast("Loaded circuit from shared URL");
    } else if (fromStorage && fromStorage.components.length > 0) {
      components = fromStorage.components;
      wires = fromStorage.wires;
      if (fromStorage.customChips.length > 0)
        customChips = fromStorage.customChips;
    } else {
      loadPreset(PRESETS[0]);
    }

    const tick = () => {
      if (running && components.length > 0) {
        const subSteps = 4;
        const dt = (0.0025 * simSpeed) / subSteps;
        for (let s = 0; s < subSteps; s++) {
          simTime += dt;
          stepCircuitPhysics(
            components,
            wires,
            customChips,
            simTime,
            dt,
            stressConfig,
            compiledArduino,
          );
        }
        animPhase += 0.016 * simSpeed;

        const sampleValues: Record<string, number> = {};
        for (const c of components) {
          if (c.probed) {
            sampleValues[c.id] = getCompPrimaryVoltage(c);
          }
        }
        probeHistory.push({ time: simTime, values: sampleValues });
        if (probeHistory.length > 160) probeHistory.shift();

        if (showTutorialBar && !tutorialCompleted) {
          const curStep = activeTutorial.steps[tutorialStepIdx];
          if (curStep && curStep.check(components, wires)) {
            if (tutorialStepIdx + 1 < activeTutorial.steps.length) {
              tutorialStepIdx += 1;
            } else {
              tutorialCompleted = true;
            }
          }
        }

        components = [...components];
        wires = [...wires];
      }
      renderOscilloscope();
      render3DViewport();
      renderStress3DViewport();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (
          document.activeElement?.tagName !== "INPUT" &&
          document.activeElement?.tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
      }
      if (activeSubpage !== "circuit") return;
      if (e.key === "r" || e.key === "R") {
        if (selectedCompId) rotateComponent(selectedCompId);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (selectedCompId && document.activeElement?.tagName !== "INPUT") {
          deleteComponent(selectedCompId);
        }
      } else if (e.key === "Escape") {
        wiringFrom = null;
      } else if (e.key === " ") {
        if (
          document.activeElement?.tagName !== "INPUT" &&
          document.activeElement?.tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
          running = !running;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(rafId);
  });

  $: filteredCatalog = CATALOG.filter(
    (item) => item.category === activeCategory,
  );
  $: activeFpgaComp = components.find((c) => c.type === "FPGA") ?? null;
  $: activeArduinoComp = components.find((c) => c.type === "ARDUINO") ?? null;
  $: blownCount = components.filter((c) => c.blown).length;
  $: overloadCount = components.filter(
    (c) => !c.blown && c.failureReason,
  ).length;
  $: selectedComp = components.find((c) => c.id === selectedCompId) ?? null;
</script>

<!-- UNCLUTTERED PEACH BANNER: 5 Clean Subpages + Preset Picker + Run Controls -->
<!-- UNCLUTTERED PEACH BANNER: Clean Subpages + Physics Mode + Preset Picker + Run Controls -->
<header class="peach-banner">
  <div class="banner-left">
    <div
      class="brand-pill"
      role="presentation"
      on:click={() => (activeSubpage = "circuit")}
      on:mouseenter={(e) =>
        setHover(
          e,
          "CircuitFab CIRCUIT & SILICON STUDIO",
          "Interactive MNA Circuit Solver, FPGA LUT4 Synthesizer, Low-Level Compiler & Stress Chamber",
          "MNA Circuit Solver, FPGA LUT4 Synthesizer, Low-Level Compiler & Stress Chamber",
        )}
      on:mousemove={moveHover}
      on:mouseleave={clearHover}
    >
      CircuitFab
    </div>

    <nav class="subpage-nav">
      <button
        class="subpage-btn"
        class:active={activeSubpage === "circuit" && !showTutorialBar}
        on:click={() => {
          activeSubpage = "circuit";
          showTutorialBar = false;
        }}
        on:mouseenter={(e) =>
          setHover(
            e,
            "CIRCUIT BOARD",
            "Build 2D schematics, inspect chip drawings & open collapsible 3D PCB drawer",
          )}
        on:mousemove={moveHover}
        on:mouseleave={clearHover}
      >
        CIRCUIT
      </button>

      <button
        class="subpage-btn"
        class:active={activeSubpage === "fpga"}
        on:click={() => (activeSubpage = "fpga")}
        on:mouseenter={(e) =>
          setHover(
            e,
            "FPGA & CHIP FOUNDRY",
            "Design FPGA LUT4 digital logic truth tables, gate diagrams & custom DIP ICs",
          )}
        on:mousemove={moveHover}
        on:mouseleave={clearHover}
      >
        FPGA & CHIP
      </button>

      <button
        class="subpage-btn"
        class:active={activeSubpage === "ide"}
        on:click={() => (activeSubpage = "ide")}
        on:mouseenter={(e) =>
          setHover(
            e,
            "LOW-LEVEL CODE IDE",
            "Write & compile AVR C/Assembly for Arduino Uno or Verilog HDL for FPGA",
          )}
        on:mousemove={moveHover}
        on:mouseleave={clearHover}
      >
        CODE IDE
      </button>

      <button
        class="subpage-btn"
        class:active={activeSubpage === "stress"}
        on:click={() => (activeSubpage = "stress")}
        on:mouseenter={(e) =>
          setHover(
            e,
            "STRESS LAB",
            "Simulate extreme temperatures (-40°C..+150°C), voltage surges, EMI spikes & component burnout",
          )}
        on:mousemove={moveHover}
        on:mouseleave={clearHover}
      >
        STRESS LAB
        {#if blownCount > 0}
          <span class="alert-dot">{blownCount}</span>
        {/if}
      </button>

      <button
        class="subpage-btn tut-nav-btn"
        class:active={showTutorialBar}
        on:click={() => {
          if (!showTutorialBar) {
            startTutorial(TUTORIALS[0]);
          } else {
            showTutorialBar = false;
          }
        }}
        on:mouseenter={(e) =>
          setHover(
            e,
            "INTERACTIVE GUIDED TUTORIAL",
            "Step-by-step interactive canvas spotlight lessons with 1-click Auto-Step helper",
          )}
        on:mousemove={moveHover}
        on:mouseleave={clearHover}
      >
        TUTORIAL
      </button>

      <button
        class="subpage-btn"
        class:active={activeSubpage === "glossary"}
        on:click={() => (activeSubpage = "glossary")}
        on:mouseenter={(e) =>
          setHover(
            e,
            "ELECTRONICS GLOSSARY",
            "Plain-English guide to every component, FPGA, and chip",
          )}
        on:mousemove={moveHover}
        on:mouseleave={clearHover}
      >
        GLOSSARY
      </button>

      <button
        class="subpage-btn"
        class:active={activeSubpage === "about"}
        on:click={() => (activeSubpage = "about")}
        on:mouseenter={(e) =>
          setHover(
            e,
            "ABOUT CIRCUITFAB",
            "What this site is and how it helps you learn electronics",
          )}
        on:mousemove={moveHover}
        on:mouseleave={clearHover}
      >
        ABOUT
      </button>
    </nav>
  </div>

  <div class="banner-right">
    <select
      class="preset-select mode-select"
      value={stressConfig.physicsMode ?? "realistic"}
      on:change={(e) => setPhysicsMode(e.currentTarget.value as PhysicsMode)}
      on:mouseenter={(e) =>
        setHover(
          e,
          "PHYSICS & BURNOUT SETTINGS",
          "REALISTIC: Exact Shockley/Ebers-Moll physics + hardware burnout (e.g. 25Ω on 5V LED = 124.5mA blows LED & Arduino pin). LIMITED: Exact physics + overload warnings without destroying parts. SANDBOX: Ideal textbook models, no burnout.",
        )}
      on:mousemove={moveHover}
      on:mouseleave={clearHover}
    >
      <option value="realistic">REALISTIC</option>
      <option value="limited">LIMITED</option>
      <option value="sandbox">SANDBOX</option>
    </select>

    <select
      class="preset-select"
      value={activePresetId}
      on:change={(e) => {
        activeSubpage = "circuit";
        loadPresetById(e.currentTarget.value);
      }}
      on:mouseenter={(e) =>
        setHover(
          e,
          "CIRCUIT PRESETS",
          "Load a pre-wired analog, Arduino, or FPGA circuit",
        )}
      on:mousemove={moveHover}
      on:mouseleave={clearHover}
    >
      {#each PRESETS as preset}
        <option value={preset.id}>{preset.label}</option>
      {/each}
    </select>

    {#if blownCount > 0}
      <button
        class="repair-pill"
        on:click={repairAllComponents}
        on:mouseenter={(e) =>
          setHover(
            e,
            "REPAIR BLOWN PARTS",
            "Restore burned-out components and reset surge",
          )}
        on:mousemove={moveHover}
        on:mouseleave={clearHover}
      >
        REPAIR ({blownCount})
      </button>
    {/if}

    <button
      class="ctrl-btn"
      disabled={undoStack.length === 0}
      on:click={undo}
      on:mouseenter={(e) =>
        setHover(e, "UNDO [Ctrl/Cmd+Z]", "Undo last circuit edit")}
      on:mousemove={moveHover}
      on:mouseleave={clearHover}
    >
      ↶
    </button>

    <button
      class="ctrl-btn"
      disabled={redoStack.length === 0}
      on:click={redo}
      on:mouseenter={(e) =>
        setHover(e, "REDO [Ctrl/Cmd+Shift+Z]", "Redo circuit edit")}
      on:mousemove={moveHover}
      on:mouseleave={clearHover}
    >
      ↷
    </button>

    <button
      class="ctrl-btn"
      on:click={copyShareUrl}
      on:mouseenter={(e) =>
        setHover(e, "SHARE URL", "Copy shareable circuit link to clipboard")}
      on:mousemove={moveHover}
      on:mouseleave={clearHover}
    >
      SHARE
    </button>

    <div class="export-wrap">
      <button
        class="ctrl-btn"
        on:click={() => (showExportMenu = !showExportMenu)}
        on:mouseenter={(e) =>
          setHover(
            e,
            "EXPORT",
            "Download SPICE (.cir), Arduino (.ino), Verilog (.v), SVG, or PNG",
          )}
        on:mousemove={moveHover}
        on:mouseleave={clearHover}
      >
        EXPORT
      </button>
      {#if showExportMenu}
        <div class="export-menu">
          <button
            on:click={() => {
              downloadTextFile(
                "circuit.circuitfab.json",
                exportCircuitJson({ components, wires, customChips }),
              );
              showExportMenu = false;
              showToast("Saved circuit.circuitfab.json");
            }}>SAVE FILE (.json)</button
          >
          <button
            on:click={() => {
              importFileInput?.click();
              showExportMenu = false;
            }}>IMPORT FILE (.json)</button
          >
          <button
            on:click={() => {
              downloadTextFile("circuitfab_pcb.stl", exportPcbStl(components, GRID));
              showExportMenu = false;
              showToast("Exported 3D PCB (.stl)");
            }}>3D MODEL (.stl)</button
          >
          <button
            on:click={() => {
              downloadTextFile(
                "circuit.cir",
                generateSpiceNetlist(components, wires, customChips),
              );
              showExportMenu = false;
              showToast("Exported SPICE .cir");
            }}>SPICE (.cir)</button
          >
          <button
            on:click={() => {
              downloadTextFile("firmware.ino", avrSourceCode);
              showExportMenu = false;
              showToast("Exported Arduino .ino");
            }}>ARDUINO (.ino)</button
          >
          <button
            on:click={() => {
              downloadTextFile("fpga_clb.v", verilogSourceCode);
              showExportMenu = false;
              showToast("Exported Verilog .v");
            }}>VERILOG (.v)</button
          >
          <button
            on:click={() => {
              if (svgEl) exportSvgSchematic(svgEl);
              showExportMenu = false;
              showToast("Exported SVG");
            }}>SCHEMATIC (.svg)</button
          >
          <button
            on:click={() => {
              if (svgEl) exportPngSchematic(svgEl);
              showExportMenu = false;
              showToast("Exported PNG");
            }}>IMAGE (.png)</button
          >
        </div>
      {/if}
    </div>
    <input
      bind:this={importFileInput}
      type="file"
      accept=".json,.circuitfab.json"
      style="display:none"
      on:change={handleImportFile}
    />

    <button
      class="ctrl-btn"
      class:active={running}
      on:click={() => (running = !running)}
      on:mouseenter={(e) =>
        setHover(
          e,
          running ? "PAUSE [SPACE]" : "RUN [SPACE]",
          "Toggle real-time physics solver",
        )}
      on:mousemove={moveHover}
      on:mouseleave={clearHover}
    >
      {running ? "❚❚" : "▶"}
    </button>

    <button
      class="ctrl-btn danger"
      on:click={clearBoard}
      on:mouseenter={(e) =>
        setHover(e, "CLEAR", "Clear all components and wires")}
      on:mousemove={moveHover}
      on:mouseleave={clearHover}
    >
      ✕
    </button>
  </div>
</header>

<!-- =========================================================================
     SUBPAGE 1: CIRCUIT BUILDER (Desmos 2D Canvas + Interactive Tutorial Bar + Collapsed 3D Drawer)
     ========================================================================= -->
{#if activeSubpage === "circuit"}
  <main class="workspace">
    <!-- LEFT DESMOS SIDEBAR -->
    <aside class="desmos-sidebar">
      <div class="cat-bar">
        <button
          class:active={activeCategory === "analog"}
          on:click={() => (activeCategory = "analog")}
          on:mouseenter={(e) =>
            setHover(
              e,
              "ANALOG",
              "Sources, Resistors, Capacitors, Inductors, Transistors (NPN/PNP/NMOS) & LEDs",
            )}
          on:mousemove={moveHover}
          on:mouseleave={clearHover}
        >
          ANALOG
        </button>
        <button
          class:active={activeCategory === "digital"}
          on:click={() => (activeCategory = "digital")}
          on:mouseenter={(e) =>
            setHover(
              e,
              "DIGITAL",
              "0/1 Bits, Clock, Logic Gates (AND/OR/NOT/NAND/NOR/XOR), D Flip-Flop & 7-Seg",
            )}
          on:mousemove={moveHover}
          on:mouseleave={clearHover}
        >
          DIGITAL
        </button>
        <button
          class:active={activeCategory === "chips"}
          on:click={() => (activeCategory = "chips")}
          on:mouseenter={(e) =>
            setHover(
              e,
              "CHIPS & MCU",
              "FPGA LUT4, Open-Source Arduino Uno R3, NE555 Timer & Custom ICs",
            )}
          on:mousemove={moveHover}
          on:mouseleave={clearHover}
        >
          CHIPS
        </button>
      </div>

      <!-- Component Palette: Click OR Drag onto Canvas -->
      <div class="palette-grid">
        {#each filteredCatalog as item}
          <button
            class="palette-tile"
            draggable="true"
            on:dragstart={(e) => {
              e.dataTransfer?.setData("text/plain", item.type);
            }}
            on:click={() => addComponent(item.type)}
            on:mouseenter={(e) =>
              setHover(
                e,
                `${item.label} — ${item.tooltipTitle}`,
                `${item.tooltipPhysics} (Click or drag onto board)`,
              )}
            on:mousemove={moveHover}
            on:mouseleave={clearHover}
          >
            <svg
              width="56"
              height="32"
              viewBox="-28 -16 56 32"
              class="tile-drawing"
            >
              {#if item.type === "R"}
                <line
                  x1="-24"
                  y1="0"
                  x2="24"
                  y2="0"
                  stroke="#1F2328"
                  stroke-width="2"
                />
                <rect
                  x="-14"
                  y="-6"
                  width="28"
                  height="12"
                  rx="3"
                  fill="#E6C280"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <rect x="-9" y="-6" width="2.5" height="12" fill="#7C3F00" />
                <rect x="-3" y="-6" width="2.5" height="12" fill="#1F2328" />
                <rect x="3" y="-6" width="2.5" height="12" fill="#C74440" />
                <rect x="9" y="-6" width="2" height="12" fill="#D4AF37" />
              {:else if item.type === "C"}
                <line
                  x1="-18"
                  y1="0"
                  x2="-4"
                  y2="0"
                  stroke="#1F2328"
                  stroke-width="2"
                />
                <line
                  x1="4"
                  y1="0"
                  x2="18"
                  y2="0"
                  stroke="#1F2328"
                  stroke-width="2"
                />
                <rect
                  x="-6"
                  y="-11"
                  width="12"
                  height="22"
                  rx="2"
                  fill="#2D70B3"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <rect x="2" y="-11" width="3" height="22" fill="#D8DEE4" />
              {:else if item.type === "L"}
                <path
                  d="M-24 0 H-15 C-15 -10 -5 -10 -5 0 C-5 -10 5 -10 5 0 C5 -10 15 -10 15 0 H24"
                  stroke="#B45309"
                  stroke-width="2.4"
                  fill="none"
                />
              {:else if item.type === "SW"}
                <line
                  x1="-22"
                  y1="4"
                  x2="-8"
                  y2="4"
                  stroke="#1F2328"
                  stroke-width="2"
                />
                <line
                  x1="8"
                  y1="4"
                  x2="22"
                  y2="4"
                  stroke="#1F2328"
                  stroke-width="2"
                />
                <circle
                  cx="-8"
                  cy="4"
                  r="2.5"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                <circle
                  cx="8"
                  cy="4"
                  r="2.5"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                <line
                  x1="-6"
                  y1="3"
                  x2="8"
                  y2="-7"
                  stroke="#388C46"
                  stroke-width="2.4"
                />
              {:else if item.type === "VDC"}
                <circle
                  cx="0"
                  cy="0"
                  r="12"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                <path
                  d="M-4 -3 H4 M0 -7 V1"
                  stroke="#C74440"
                  stroke-width="2"
                />
                <path d="M-4 6 H4" stroke="#2D70B3" stroke-width="2" />
              {:else if item.type === "VAC"}
                <circle
                  cx="0"
                  cy="0"
                  r="12"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                <path
                  d="M-7 0 C-4 -7 -1 -7 0 0 C1 7 4 7 7 0"
                  stroke="#2D70B3"
                  stroke-width="2"
                  fill="none"
                />
              {:else if item.type === "GND"}
                <line
                  x1="0"
                  y1="-11"
                  x2="0"
                  y2="-2"
                  stroke="#1F2328"
                  stroke-width="2"
                />
                <line
                  x1="-12"
                  y1="-2"
                  x2="12"
                  y2="-2"
                  stroke="#1F2328"
                  stroke-width="2.2"
                />
                <line
                  x1="-7"
                  y1="3"
                  x2="7"
                  y2="3"
                  stroke="#1F2328"
                  stroke-width="2"
                />
                <line
                  x1="-3"
                  y1="8"
                  x2="3"
                  y2="8"
                  stroke="#1F2328"
                  stroke-width="2"
                />
              {:else if item.type === "LED"}
                <line
                  x1="-5"
                  y1="6"
                  x2="-5"
                  y2="14"
                  stroke="#57606A"
                  stroke-width="1.8"
                />
                <line
                  x1="5"
                  y1="6"
                  x2="5"
                  y2="14"
                  stroke="#57606A"
                  stroke-width="1.8"
                />
                <path
                  d="M-9 6 V-3 A9 9 0 0 1 9 -3 V6 Z"
                  fill="#EF4444"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <path
                  d="M11 -8 L16 -13 M13 -13 H16 V-10"
                  stroke="#EF4444"
                  stroke-width="1.5"
                  fill="none"
                />
              {:else if item.type === "DIODE" || item.type === "ZENER"}
                <line
                  x1="-22"
                  y1="0"
                  x2="22"
                  y2="0"
                  stroke="#1F2328"
                  stroke-width="2"
                />
                <rect
                  x="-11"
                  y="-6"
                  width="22"
                  height="12"
                  rx="2"
                  fill={item.type === "ZENER" ? "#B45309" : "#24292F"}
                  stroke="#1F2328"
                  stroke-width="1.5"
                />
                <rect x="4" y="-6" width="3.5" height="12" fill="#E5E7EB" />
              {:else if item.type === "POT"}
                <rect
                  x="-13"
                  y="-9"
                  width="26"
                  height="18"
                  rx="3"
                  fill="#1E3A8A"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <circle
                  cx="0"
                  cy="0"
                  r="6"
                  fill="#FACC15"
                  stroke="#1F2328"
                  stroke-width="1.4"
                />
                <line
                  x1="0"
                  y1="0"
                  x2="4"
                  y2="-4"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
              {:else if item.type === "FUSE"}
                <line
                  x1="-22"
                  y1="0"
                  x2="22"
                  y2="0"
                  stroke="#1F2328"
                  stroke-width="2"
                />
                <rect
                  x="-12"
                  y="-6"
                  width="24"
                  height="12"
                  rx="2"
                  fill="#E0F2FE"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <path
                  d="M-8 0 Q-4 -4 0 0 Q4 4 8 0"
                  fill="none"
                  stroke="#C74440"
                  stroke-width="1.8"
                />
              {:else if item.type === "BUZZER"}
                <circle
                  cx="0"
                  cy="0"
                  r="11"
                  fill="#24292F"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <circle cx="0" cy="0" r="3.5" fill="#FA7E19" />
              {:else if item.type === "NPN" || item.type === "PNP" || item.type === "NMOS"}
                <line
                  x1="-7"
                  y1="5"
                  x2="-10"
                  y2="14"
                  stroke="#57606A"
                  stroke-width="1.8"
                />
                <line
                  x1="0"
                  y1="5"
                  x2="0"
                  y2="14"
                  stroke="#57606A"
                  stroke-width="1.8"
                />
                <line
                  x1="7"
                  y1="5"
                  x2="10"
                  y2="14"
                  stroke="#57606A"
                  stroke-width="1.8"
                />
                <path
                  d="M-11 5 V-4 A11 8 0 0 1 11 -4 V5 Z"
                  fill="#24292F"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <circle cx="0" cy="-1" r="2.5" fill="#FA7E19" />
              {:else if item.type === "OPAMP"}
                <polygon
                  points="-14,-12 -14,12 14,0"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                <line
                  x1="-22"
                  y1="-6"
                  x2="-14"
                  y2="-6"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                <line
                  x1="-22"
                  y1="6"
                  x2="-14"
                  y2="6"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                <line
                  x1="14"
                  y1="0"
                  x2="22"
                  y2="0"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
              {:else if item.type === "LOGIC_IN"}
                <rect
                  x="-14"
                  y="-10"
                  width="28"
                  height="20"
                  rx="5"
                  fill="#2D70B3"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <circle cx="5" cy="0" r="5" fill="#FFFFFF" />
              {:else if item.type === "CLK"}
                <rect
                  x="-16"
                  y="-10"
                  width="32"
                  height="20"
                  rx="4"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <path
                  d="M-11 4 H-6 V-4 H0 V4 H6 V-4 H11"
                  stroke="#FA7E19"
                  stroke-width="2"
                  fill="none"
                />
              {:else if item.type === "AND" || item.type === "NAND"}
                <path
                  d="M-14 -11 H-1 A11 11 0 0 1 -1 11 H-14 Z"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                {#if item.type === "NAND"}
                  <circle
                    cx="13"
                    cy="0"
                    r="2.5"
                    fill="#FFFFFF"
                    stroke="#1F2328"
                    stroke-width="1.6"
                  />
                {/if}
              {:else if item.type === "OR" || item.type === "NOR" || item.type === "XOR"}
                <path
                  d="M-15 -11 H-3 Q10 -10 14 0 Q10 10 -3 11 H-15 Q-8 0 -15 -11 Z"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                {#if item.type === "XOR"}
                  <path
                    d="M-19 -11 Q-12 0 -19 11"
                    fill="none"
                    stroke="#1F2328"
                    stroke-width="1.6"
                  />
                {/if}
                {#if item.type === "NOR"}
                  <circle
                    cx="17"
                    cy="0"
                    r="2.5"
                    fill="#FFFFFF"
                    stroke="#1F2328"
                    stroke-width="1.6"
                  />
                {/if}
              {:else if item.type === "NOT"}
                <polygon
                  points="-12,-10 -12,10 10,0"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                <circle
                  cx="13"
                  cy="0"
                  r="2.5"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
              {:else if item.type === "DFF" || item.type === "SR_LATCH" || item.type === "COUNTER4" || item.type === "SHIFT4"}
                <rect
                  x="-14"
                  y="-12"
                  width="28"
                  height="24"
                  rx="3"
                  fill="#FFFFFF"
                  stroke="#1F2328"
                  stroke-width="1.8"
                />
                <text
                  x="0"
                  y="4"
                  text-anchor="middle"
                  font-size="10"
                  font-weight="700"
                  fill="#1F2328"
                >
                  {item.type === "COUNTER4"
                    ? "CNT"
                    : item.type === "SHIFT4"
                      ? "SR4"
                      : item.type === "SR_LATCH"
                        ? "S/R"
                        : "DFF"}
                </text>
              {:else if item.type === "SEG7"}
                <rect
                  x="-12"
                  y="-13"
                  width="24"
                  height="26"
                  rx="3"
                  fill="#1F2328"
                  stroke="#57606A"
                  stroke-width="1.5"
                />
                <rect x="-5" y="-9" width="10" height="2.2" fill="#EF4444" />
                <rect x="5" y="-7" width="2.2" height="7" fill="#EF4444" />
                <rect x="5" y="1" width="2.2" height="7" fill="#EF4444" />
                <rect x="-5" y="8" width="10" height="2.2" fill="#EF4444" />
                <rect x="-5" y="-1" width="10" height="2.2" fill="#EF4444" />
              {:else if item.type === "FPGA"}
                <rect
                  x="-14"
                  y="-12"
                  width="28"
                  height="24"
                  rx="3"
                  fill="#24292F"
                  stroke="#6042A6"
                  stroke-width="1.8"
                />
                <rect x="-7" y="-6" width="5" height="5" fill="#2D70B3" />
                <rect x="2" y="-6" width="5" height="5" fill="#56D364" />
                <rect x="-7" y="1" width="5" height="5" fill="#FA7E19" />
                <rect x="2" y="1" width="5" height="5" fill="#2D70B3" />
              {:else if item.type === "ARDUINO"}
                <rect
                  x="-19"
                  y="-12"
                  width="38"
                  height="24"
                  rx="3"
                  fill="#008184"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <rect
                  x="-22"
                  y="-7"
                  width="6"
                  height="9"
                  fill="#D8DEE4"
                  stroke="#1F2328"
                  stroke-width="1.2"
                />
                <rect x="-5" y="1" width="16" height="6" fill="#1F2328" />
                <circle cx="11" cy="-6" r="2.2" fill="#FACC15" />
              {:else if item.type === "IC555"}
                <rect
                  x="-15"
                  y="-11"
                  width="30"
                  height="22"
                  rx="2"
                  fill="#24292F"
                  stroke="#1F2328"
                  stroke-width="1.6"
                />
                <line
                  x1="-19"
                  y1="-6"
                  x2="-15"
                  y2="-6"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <line
                  x1="-19"
                  y1="0"
                  x2="-15"
                  y2="0"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <line
                  x1="-19"
                  y1="6"
                  x2="-15"
                  y2="6"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <line
                  x1="15"
                  y1="-6"
                  x2="19"
                  y2="-6"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <line
                  x1="15"
                  y1="0"
                  x2="19"
                  y2="0"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <line
                  x1="15"
                  y1="6"
                  x2="19"
                  y2="6"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <rect x="-6" y="-5" width="12" height="10" fill="#F59E0B" />
              {/if}
            </svg>
            <span class="tile-label">{item.label}</span>
          </button>
        {/each}

        {#if activeCategory === "chips"}
          {#each customChips as chip}
            <button
              class="palette-tile custom-tile"
              style="border-color: {chip.color}"
              on:click={() => addComponent("CUSTOM_IC", chip.id)}
              on:mouseenter={(e) => setHover(e, chip.name, chip.description)}
              on:mousemove={moveHover}
              on:mouseleave={clearHover}
            >
              <svg
                width="56"
                height="32"
                viewBox="-28 -16 56 32"
                class="tile-drawing"
              >
                <rect
                  x="-15"
                  y="-11"
                  width="30"
                  height="22"
                  rx="2"
                  fill="#24292F"
                  stroke={chip.color}
                  stroke-width="1.8"
                />
                <line
                  x1="-19"
                  y1="-5"
                  x2="-15"
                  y2="-5"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <line
                  x1="-19"
                  y1="5"
                  x2="-15"
                  y2="5"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <line
                  x1="15"
                  y1="-5"
                  x2="19"
                  y2="-5"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <line
                  x1="15"
                  y1="5"
                  x2="19"
                  y2="5"
                  stroke="#57606A"
                  stroke-width="2"
                />
                <rect x="-6" y="-5" width="12" height="10" fill={chip.color} />
              </svg>
              <span class="tile-label" style="color: {chip.color}"
                >{chip.name}</span
              >
            </button>
          {/each}
        {/if}
      </div>

      <!-- DESMOS EXPRESSION CARDS -->
      <div class="expression-list">
        {#each components as comp, idx (comp.id)}
          {@const cat = getCatalogItem(comp.type)}
          {@const vPrimary = getCompPrimaryVoltage(comp)}
          <div
            class="expr-card"
            class:selected={selectedCompId === comp.id}
            class:blown-card={comp.blown}
            role="presentation"
            on:click={() => (selectedCompId = comp.id)}
            on:mouseenter={(e) =>
              setHover(
                e,
                `${comp.label} (${cat.tooltipTitle})`,
                comp.blown
                  ? `FAILURE: ${comp.failureReason}`
                  : comp.failureReason
                    ? `WARNING: ${comp.failureReason}`
                    : cat.tooltipPhysics,
                `V = ${formatElec(vPrimary, "V")} | I = ${formatElec(comp.branchCurrent, "A")} | P = ${formatElec(comp.power, "W")} | T = ${(comp.tempC ?? 25).toFixed(0)}°C`,
              )}
            on:mousemove={moveHover}
            on:mouseleave={clearHover}
          >
            <button
              class="expr-gutter"
              style="background-color: {comp.probed
                ? comp.color
                : '#ECEEF2'}; color: {comp.probed ? '#FFFFFF' : '#57606A'}"
              on:click|stopPropagation={() => toggleProbe(comp.id)}
              on:mouseenter={(e) =>
                setHover(
                  e,
                  comp.probed
                    ? `PROBE ON (${comp.label})`
                    : `PROBE OFF (${comp.label})`,
                  "Click number tab to toggle waveform trace on the oscilloscope",
                )}
              on:mousemove={moveHover}
              on:mouseleave={clearHover}
            >
              {idx + 1}
            </button>

            <div class="expr-body">
              <div class="expr-header">
                <div class="expr-equation">
                  <span class="expr-name">{comp.label}</span>
                  {#if comp.blown}
                    <span class="blown-badge"
                      >{comp.failureReason
                        ? comp.failureReason.split(" ")[0]
                        : "BLOWN!"}</span
                    >
                    <button
                      class="mini-repair-btn"
                      on:click|stopPropagation={() => repairComponent(comp.id)}
                      title="Repair this component (upgrades low-Ohm resistor to 220Ω)"
                    >
                      FIX
                    </button>
                  {:else if comp.failureReason}
                    <span class="overload-badge">OVERLOAD</span>
                  {:else if comp.type === "LOGIC_IN" || comp.type === "SW"}
                    <button
                      class="bit-toggle"
                      class:high={comp.switchClosed}
                      on:click|stopPropagation={() => {
                        comp.switchClosed = !comp.switchClosed;
                        components = [...components];
                      }}
                    >
                      = {comp.type === "LOGIC_IN"
                        ? comp.switchClosed
                          ? "1 (5V)"
                          : "0 (0V)"
                        : comp.switchClosed
                          ? "ON"
                          : "OFF"}
                    </button>
                  {:else if comp.type === "FPGA"}
                    <button
                      class="bit-toggle fpga-tag"
                      on:click|stopPropagation={() => (activeSubpage = "fpga")}
                    >
                      = {comp.fpgaProfile ?? "LUT4"}
                    </button>
                  {:else if comp.type === "SEG7"}
                    <span class="expr-val"
                      >= 0x{(comp.state?.hexVal ?? 0)
                        .toString(16)
                        .toUpperCase()}</span
                    >
                  {:else if comp.type === "COUNTER4" || comp.type === "SHIFT4"}
                    <span class="expr-val"
                      >= {(comp.state?.cnt ?? 0).toString(2).padStart(4, "0")} ({comp
                        .state?.cnt ?? 0})</span
                    >
                  {:else if comp.type !== "GND" && comp.type !== "CUSTOM_IC"}
                    <span class="expr-val"
                      >= {formatSI(comp.value, cat.shortUnit)}</span
                    >
                  {/if}
                </div>

                <div class="expr-right">
                  <span class="telemetry-pill">{formatElec(vPrimary, "V")}</span
                  >
                  <button
                    class="icon-action"
                    on:click|stopPropagation={() => rotateComponent(comp.id)}
                    on:mouseenter={(e) =>
                      setHover(e, "ROTATE [R]", "Rotate 90° clockwise")}
                    on:mousemove={moveHover}
                    on:mouseleave={clearHover}
                  >
                    ↻
                  </button>
                  <button
                    class="icon-action"
                    on:click|stopPropagation={() => deleteComponent(comp.id)}
                    on:mouseenter={(e) =>
                      setHover(e, "DELETE", "Remove component from board")}
                    on:mousemove={moveHover}
                    on:mouseleave={clearHover}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {#if comp.type !== "GND" && comp.type !== "CUSTOM_IC" && comp.type !== "SW" && comp.type !== "LOGIC_IN" && comp.type !== "SEG7" && comp.type !== "FPGA" && comp.type !== "COUNTER4" && comp.type !== "SHIFT4" && comp.type !== "SR_LATCH"}
                <div class="slider-wrap">
                  {#if cat.logScale}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      value={toSliderVal(comp, cat)}
                      on:input={(e) => {
                        comp.value = fromSliderVal(
                          parseFloat(e.currentTarget.value),
                          cat,
                        );
                        if (comp.blown) {
                          comp.blown = false;
                          comp.failureReason = undefined;
                          stressConfig.repairGraceUntil = simTime + 0.08;
                        }
                        components = [...components];
                      }}
                    />
                  {:else}
                    <input
                      type="range"
                      min={cat.minVal}
                      max={cat.maxVal}
                      step={cat.stepVal}
                      bind:value={comp.value}
                      on:input={() => {
                        if (comp.blown) {
                          comp.blown = false;
                          comp.failureReason = undefined;
                          stressConfig.repairGraceUntil = simTime + 0.08;
                        }
                        components = [...components];
                      }}
                    />
                  {/if}
                </div>
              {/if}

              {#if cat.param2Label && comp.param2 !== undefined}
                <div class="slider-wrap secondary-row">
                  <span class="param2-label"
                    >{cat.param2Label}: {comp.param2}{cat.param2Label ===
                      "DUTY" || cat.param2Label === "WIPER"
                      ? "%"
                      : "Hz"}</span
                  >
                  <input
                    type="range"
                    min={cat.minParam2}
                    max={cat.maxParam2}
                    step={cat.stepParam2}
                    bind:value={comp.param2}
                    on:input={() => (components = [...components])}
                  />
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </aside>

    <!-- RIGHT STAGE: 2D Canvas + Interactive Guided Tutorial Dock + Collapsible 3D Drawer -->
    <section class="canvas-stage">
      {#if !full3D}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="pane-2d"
          on:dragover|preventDefault
          on:drop|preventDefault={(e) => {
            const type = e.dataTransfer?.getData("text/plain") as ComponentType;
            if (type) {
              const g = clientToGrid(e.clientX, e.clientY);
              addComponent(type, undefined, g);
            }
          }}
        >
          <!-- Interactive Guided Tutorial Dock (Stays on the live canvas, with 1-click Auto-Step!) -->
          {#if showTutorialBar}
            {@const curStep = activeTutorial.steps[tutorialStepIdx]}
            <div class="tutorial-dock">
              <div class="tut-dock-top">
                <div class="tut-lesson-tabs">
                  {#each TUTORIALS as tut}
                    <button
                      class="lesson-tab"
                      class:active={activeTutorial.id === tut.id}
                      on:click={() => startTutorial(tut)}
                    >
                      {tut.label}
                    </button>
                  {/each}
                </div>
                <button
                  class="icon-action"
                  on:click={() => (showTutorialBar = false)}>✕</button
                >
              </div>

              <div class="tut-dock-body">
                <div class="step-dots">
                  {#each activeTutorial.steps as _s, idx}
                    <span
                      class="step-dot"
                      class:done={tutorialCompleted || idx < tutorialStepIdx}
                      class:current={!tutorialCompleted &&
                        idx === tutorialStepIdx}
                    ></span>
                  {/each}
                </div>

                <div class="tut-step-text">
                  <strong
                    >{tutorialCompleted
                      ? "✓ LESSON COMPLETE!"
                      : curStep?.badge}</strong
                  >
                  <span>
                    {tutorialCompleted
                      ? "Pick the next lesson tab above or keep experimenting on the board!"
                      : curStep?.instruction}
                  </span>
                </div>

                {#if !tutorialCompleted}
                  <button
                    class="auto-step-btn"
                    on:click={doCurrentTutorialStep}
                    on:mouseenter={(e) =>
                      setHover(
                        e,
                        "AUTO-COMPLETE STEP",
                        "Watch CircuitFab perform this step automatically for you",
                      )}
                    on:mousemove={moveHover}
                    on:mouseleave={clearHover}
                  >
                    DO STEP FOR ME
                  </button>
                {:else}
                  <button
                    class="auto-step-btn"
                    on:click={() => {
                      const curIdx = TUTORIALS.findIndex(
                        (t) => t.id === activeTutorial.id,
                      );
                      const nextTut =
                        TUTORIALS[(curIdx + 1) % TUTORIALS.length];
                      startTutorial(nextTut);
                    }}
                  >
                    NEXT LESSON →
                  </button>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Unified Non-Overlapping Top Canvas Bar -->
          <div class="canvas-top-bar" class:shifted-down={showTutorialBar}>
            <div class="canvas-top-pills">
              <button
                class="mini-pill"
                class:active={!physicalDrawingMode}
                on:click={() => (physicalDrawingMode = false)}
                on:mouseenter={(e) =>
                  setHover(
                    e,
                    "SCHEMATIC DIAGRAM",
                    "Standard IEEE 2D circuit diagram symbols",
                  )}
                on:mousemove={moveHover}
                on:mouseleave={clearHover}
              >
                DIAGRAM
              </button>
              <button
                class="mini-pill"
                class:active={physicalDrawingMode}
                on:click={() => (physicalDrawingMode = true)}
                on:mouseenter={(e) =>
                  setHover(
                    e,
                    "CHIP & PACKAGE DRAWING",
                    "Physical component drawings & internal silicon die cutaway",
                  )}
                on:mousemove={moveHover}
                on:mouseleave={clearHover}
              >
                CHIP/PKG
              </button>
              <button
                class="mini-pill"
                class:active={chipXray}
                on:click={() => (chipXray = !chipXray)}
                on:mouseenter={(e) =>
                  setHover(
                    e,
                    "SILICON DIE X-RAY",
                    "Toggle internal chip wafer & bond wire drawing",
                  )}
                on:mousemove={moveHover}
                on:mouseleave={clearHover}
              >
                DIE
              </button>
              <button
                class="mini-pill"
                class:active={showScope}
                on:click={() => (showScope = !showScope)}
                on:mouseenter={(e) =>
                  setHover(
                    e,
                    "OSCILLOSCOPE",
                    "Toggle bottom-right live waveform graph",
                  )}
                on:mousemove={moveHover}
                on:mouseleave={clearHover}
              >
                ∿ SCOPE
              </button>
              <button
                class="mini-pill"
                on:click={cleanUnconnectedParts}
                on:mouseenter={(e) =>
                  setHover(
                    e,
                    "CLEAN UNWIRED PARTS",
                    "Remove any floating, unconnected components sitting on the board",
                  )}
                on:mousemove={moveHover}
                on:mouseleave={clearHover}
              >
                CLEAN UNWIRED
              </button>
            </div>

            {#if selectedComp}
              <div class="selected-toolbar">
                <span class="sel-title">{selectedComp.label}</span>
                {#if selectedComp.blown}
                  <button
                    class="sel-btn fix-pill-btn"
                    on:click={() => repairComponent(selectedComp.id)}
                    on:mouseenter={(e) =>
                      setHover(
                        e,
                        "REPAIR COMPONENT",
                        "Restore this burned-out component (upgrades low-Ohm resistor to 220Ω)",
                      )}
                    on:mousemove={moveHover}
                    on:mouseleave={clearHover}
                  >
                    REPAIR PART
                  </button>
                {/if}
                <button
                  class="sel-btn"
                  on:click={() => autoWireComponent(selectedComp.id)}
                  on:mouseenter={(e) =>
                    setHover(
                      e,
                      "AUTO-WIRE COMPONENT",
                      "Automatically connect open pins to nearest circuit nodes",
                    )}
                  on:mousemove={moveHover}
                  on:mouseleave={clearHover}
                >
                  AUTO-WIRE
                </button>
                <button
                  class="sel-btn"
                  on:click={() => rotateComponent(selectedComp.id)}
                  on:mouseenter={(e) =>
                    setHover(
                      e,
                      "ROTATE 90° [R]",
                      "Rotate component on the board",
                    )}
                  on:mousemove={moveHover}
                  on:mouseleave={clearHover}
                >
                  ↻ ROTATE
                </button>
                {#if selectedComp.type === "LED" || selectedComp.type === "DIODE" || selectedComp.type === "ZENER" || selectedComp.type === "VDC" || selectedComp.type === "BUZZER"}
                  <button
                    class="sel-btn"
                    on:click={() => flipPolarity(selectedComp.id)}
                    on:mouseenter={(e) =>
                      setHover(
                        e,
                        "FLIP + / − POLARITY",
                        "Reverse Anode (+) and Cathode (−) orientation",
                      )}
                    on:mousemove={moveHover}
                    on:mouseleave={clearHover}
                  >
                    ⇄ FLIP +/−
                  </button>
                {/if}
                <button
                  class="sel-btn danger-text"
                  on:click={() => deleteComponent(selectedComp.id)}
                >
                  ✕
                </button>
              </div>
            {/if}

            {#if !show3DDrawer}
              <button
                class="open-3d-tab"
                on:click={() => (show3DDrawer = true)}
                on:mouseenter={(e) =>
                  setHover(
                    e,
                    "OPEN 3D PCB VIEW",
                    "View your circuit as an interactive 3D FR-4 PCB and download it as .stl",
                  )}
                on:mousemove={moveHover}
                on:mouseleave={clearHover}
              >
                ◀ 3D PCB
              </button>
            {/if}
          </div>

          <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
          <svg
            bind:this={svgEl}
            class="schematic-svg"
            role="application"
            on:pointerdown={onCanvasPointerDown}
            on:pointermove={onCanvasPointerMove}
            on:pointerup={onCanvasPointerUp}
            on:wheel={onCanvasWheel}
          >
            <defs>
              <pattern
                id="desmos-grid"
                width={GRID}
                height={GRID}
                patternUnits="userSpaceOnUse"
              >
                <circle cx="0" cy="0" r="1.25" fill="#CBD2D9" />
              </pattern>
              <pattern
                id="desmos-grid-major"
                width={GRID * 5}
                height={GRID * 5}
                patternUnits="userSpaceOnUse"
              >
                <rect
                  width={GRID * 5}
                  height={GRID * 5}
                  fill="url(#desmos-grid)"
                />
                <path
                  d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
                  fill="none"
                  stroke="#E4E7EB"
                  stroke-width="1"
                />
              </pattern>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              <rect
                x={(-pan.x - 4000) / zoom}
                y={(-pan.y - 4000) / zoom}
                width={12000 / zoom}
                height={12000 / zoom}
                fill="url(#desmos-grid-major)"
              />

              {#each wires as w (w.id)}
                {@const pts = getWirePoints(w)}
                {#if pts}
                  {@const dots = getElectronDots(pts, w.current, animPhase)}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <path
                    d={pts.pathD}
                    stroke="transparent"
                    stroke-width="14"
                    fill="none"
                    class="wire-hit"
                    on:click|stopPropagation={() => deleteWire(w.id)}
                    on:mouseenter={(e) =>
                      setHover(
                        e,
                        "WIRE TRACE",
                        "Click wire to remove connection",
                        `V = ${formatElec(w.voltage, "V")} | I = ${formatElec(w.current, "A")}`,
                      )}
                    on:mousemove={moveHover}
                    on:mouseleave={clearHover}
                  />
                  <path
                    d={pts.pathD}
                    stroke={wireColor(w.voltage)}
                    stroke-width="2.6"
                    stroke-linejoin="round"
                    fill="none"
                    pointer-events="none"
                  />
                  {#each dots as dot}
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r="3.2"
                      fill="#F59E0B"
                      stroke="#1F2328"
                      stroke-width="0.9"
                      pointer-events="none"
                    />
                  {/each}
                {/if}
              {/each}

              {#if wiringFrom}
                {@const fromComp = components.find(
                  (c) => c.id === wiringFrom?.compId,
                )}
                {@const fromPin = fromComp
                  ? getComponentPins(fromComp, customChips).find(
                      (p) => p.id === wiringFrom?.pinId,
                    )
                  : null}
                {#if fromComp && fromPin}
                  {@const pStart = getPinWorldPos(fromComp, fromPin)}
                  {@const sx = pStart.x * GRID}
                  {@const sy = pStart.y * GRID}
                  {@const ex = mouseGridPos.x * GRID}
                  {@const ey = mouseGridPos.y * GRID}
                  <path
                    d={`M ${sx} ${sy} L ${ex} ${sy} L ${ex} ${ey}`}
                    stroke="#FA7E19"
                    stroke-width="2.8"
                    stroke-dasharray="5 4"
                    fill="none"
                    pointer-events="none"
                  />
                {/if}
              {/if}

              <!-- Tutorial Spotlight Target Rings & Guide Arrow -->
              {#if showTutorialBar && !tutorialCompleted}
                {@const curStep = activeTutorial.steps[tutorialStepIdx]}
                {@const hl = curStep ? getTutorialHighlight(curStep) : null}
                {#if hl}
                  <circle
                    cx={hl.x1}
                    cy={hl.y1}
                    r="20"
                    fill="rgba(56, 140, 70, 0.14)"
                    stroke="#388C46"
                    stroke-width="3"
                    stroke-dasharray="5 3"
                    pointer-events="none"
                  />
                  {#if hl.x2 !== undefined && hl.y2 !== undefined}
                    <line
                      x1={hl.x1}
                      y1={hl.y1}
                      x2={hl.x2}
                      y2={hl.y2}
                      stroke="#388C46"
                      stroke-width="3"
                      stroke-dasharray="6 4"
                      pointer-events="none"
                    />
                    <circle
                      cx={hl.x2}
                      cy={hl.y2}
                      r="20"
                      fill="rgba(250, 126, 25, 0.15)"
                      stroke="#FA7E19"
                      stroke-width="3"
                      stroke-dasharray="5 3"
                      pointer-events="none"
                    />
                  {/if}
                {/if}
              {/if}

              {#each components as comp (comp.id)}
                {@const cat = getCatalogItem(comp.type)}
                {@const pins = getComponentPins(comp, customChips)}
                {@const cx = comp.x * GRID}
                {@const cy = comp.y * GRID}
                {@const isSelected = selectedCompId === comp.id}
                {@const isReverseBiasedLed =
                  comp.type === "LED" &&
                  (comp.pinVoltages.A ?? 0) - (comp.pinVoltages.K ?? 0) < -0.4}

                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <g
                  transform={`translate(${cx}, ${cy})`}
                  class="comp-group"
                  on:pointerdown={(e) => onComponentPointerDown(e, comp)}
                  on:mouseenter={(e) =>
                    setHover(
                      e,
                      `${comp.label} — ${cat.tooltipTitle}`,
                      comp.blown
                        ? `BLOWN: ${comp.failureReason}`
                        : comp.failureReason
                          ? `WARNING: ${comp.failureReason}`
                          : cat.tooltipPhysics,
                      `V = ${formatElec(getCompPrimaryVoltage(comp), "V")} | I = ${formatElec(comp.branchCurrent, "A")} | P = ${formatElec(comp.power, "W")} | T = ${(comp.tempC ?? 25).toFixed(0)}°C`,
                    )}
                  on:mousemove={moveHover}
                  on:mouseleave={clearHover}
                >
                  {#if comp.blown}
                    <circle
                      cx="0"
                      cy="0"
                      r="38"
                      fill="#FEE2E2"
                      stroke="#C74440"
                      stroke-width="2.5"
                      stroke-dasharray="4 3"
                    />
                  {:else if (comp.stressRatio ?? 0) > 0.75}
                    <circle
                      cx="0"
                      cy="0"
                      r="36"
                      fill="#FEF3C7"
                      stroke="#FA7E19"
                      stroke-width="2"
                    />
                  {/if}

                  <g transform={`rotate(${comp.rotation})`}>
                    {#if isSelected}
                      <rect
                        x={comp.type === "ARDUINO"
                          ? -105
                          : comp.type === "IC555" ||
                              comp.type === "CUSTOM_IC" ||
                              comp.type === "FPGA" ||
                              comp.type === "SEG7"
                            ? -78
                            : -50}
                        y={comp.type === "ARDUINO"
                          ? -68
                          : comp.type === "IC555" ||
                              comp.type === "CUSTOM_IC" ||
                              comp.type === "FPGA" ||
                              comp.type === "SEG7"
                            ? -64
                            : -38}
                        width={comp.type === "ARDUINO"
                          ? 210
                          : comp.type === "IC555" ||
                              comp.type === "CUSTOM_IC" ||
                              comp.type === "FPGA" ||
                              comp.type === "SEG7"
                            ? 156
                            : 100}
                        height={comp.type === "ARDUINO"
                          ? 136
                          : comp.type === "IC555" ||
                              comp.type === "CUSTOM_IC" ||
                              comp.type === "FPGA" ||
                              comp.type === "SEG7"
                            ? 128
                            : 76}
                        fill="none"
                        stroke={comp.color}
                        stroke-width="2"
                        stroke-dasharray="5 4"
                        rx="8"
                      />
                    {/if}

                    {#if comp.type === "R"}
                      <rect
                        x="-44"
                        y="-16"
                        width="88"
                        height="32"
                        fill="transparent"
                      />
                      {#if physicalDrawingMode}
                        {@const bands = getResistorColorBands(comp.value)}
                        <line
                          x1={-GRID * 2}
                          y1="0"
                          x2={GRID * 2}
                          y2="0"
                          stroke="#8C959F"
                          stroke-width="3"
                        />
                        <rect
                          x="-30"
                          y="-12"
                          width="60"
                          height="24"
                          rx="8"
                          fill="#E6C280"
                          stroke="#1F2328"
                          stroke-width="2.2"
                        />
                        <rect
                          x="-18"
                          y="-12"
                          width="5"
                          height="24"
                          fill={bands[0]}
                        />
                        <rect
                          x="-7"
                          y="-12"
                          width="5"
                          height="24"
                          fill={bands[1]}
                        />
                        <rect
                          x="4"
                          y="-12"
                          width="5"
                          height="24"
                          fill={bands[2]}
                        />
                        <rect
                          x="16"
                          y="-12"
                          width="4"
                          height="24"
                          fill={bands[3]}
                        />
                      {:else}
                        <path
                          d={`M-${GRID * 2} 0 H-30 L-24 -12 L-15 12 L-5 -12 L5 12 L15 -12 L24 12 L30 0 H${GRID * 2}`}
                          stroke="#1F2328"
                          stroke-width="2.5"
                          stroke-linejoin="round"
                          fill="none"
                        />
                      {/if}
                    {:else if comp.type === "C"}
                      <rect
                        x="-44"
                        y="-20"
                        width="88"
                        height="40"
                        fill="transparent"
                      />
                      {#if physicalDrawingMode}
                        <line
                          x1={-GRID * 2}
                          y1="0"
                          x2="-16"
                          y2="0"
                          stroke="#8C959F"
                          stroke-width="3"
                        />
                        <line
                          x1="16"
                          y1="0"
                          x2={GRID * 2}
                          y2="0"
                          stroke="#8C959F"
                          stroke-width="3"
                        />
                        <rect
                          x="-18"
                          y="-18"
                          width="36"
                          height="36"
                          rx="6"
                          fill="#1E3A8A"
                          stroke="#1F2328"
                          stroke-width="2.2"
                        />
                        <rect
                          x="8"
                          y="-18"
                          width="6"
                          height="36"
                          fill="#D8DEE4"
                        />
                        <circle
                          cx="-3"
                          cy="0"
                          r="8"
                          fill="#D1D5DB"
                          stroke="#1F2328"
                          stroke-width="1.4"
                        />
                      {:else}
                        <line
                          x1={-GRID * 2}
                          y1="0"
                          x2="-7"
                          y2="0"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                        <line
                          x1="-7"
                          y1="-18"
                          x2="-7"
                          y2="18"
                          stroke="#1F2328"
                          stroke-width="3.2"
                        />
                        <line
                          x1="7"
                          y1="-18"
                          x2="7"
                          y2="18"
                          stroke="#1F2328"
                          stroke-width="3.2"
                        />
                        <line
                          x1="7"
                          y1="0"
                          x2={GRID * 2}
                          y2="0"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                      {/if}
                    {:else if comp.type === "L"}
                      <rect
                        x="-44"
                        y="-18"
                        width="88"
                        height="36"
                        fill="transparent"
                      />
                      <path
                        d={`M-${GRID * 2} 0 H-32 C-32 -16 -16 -16 -16 0 C-16 -16 0 -16 0 0 C0 -16 16 -16 16 0 C16 -16 32 -16 32 0 H${GRID * 2}`}
                        stroke={physicalDrawingMode ? "#B45309" : "#1F2328"}
                        stroke-width="2.8"
                        fill="none"
                      />
                    {:else if comp.type === "SW"}
                      <rect
                        x="-44"
                        y="-18"
                        width="88"
                        height="36"
                        fill="transparent"
                      />
                      <line
                        x1={-GRID * 2}
                        y1="0"
                        x2="-18"
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="18"
                        y1="0"
                        x2={GRID * 2}
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <circle
                        cx="-18"
                        cy="0"
                        r="4"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.2"
                      />
                      <circle
                        cx="18"
                        cy="0"
                        r="4"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.2"
                      />
                      {#if comp.switchClosed}
                        <line
                          x1="-14"
                          y1="0"
                          x2="15"
                          y2="0"
                          stroke="#388C46"
                          stroke-width="3"
                        />
                      {:else}
                        <line
                          x1="-14"
                          y1="-2"
                          x2="14"
                          y2="-16"
                          stroke="#C74440"
                          stroke-width="3"
                        />
                      {/if}
                    {:else if comp.type === "VDC"}
                      <line
                        x1="0"
                        y1={-GRID * 2}
                        x2="0"
                        y2="-22"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="0"
                        y1="22"
                        x2="0"
                        y2={GRID * 2}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <circle
                        cx="0"
                        cy="0"
                        r="22"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="-6"
                        y1="-8"
                        x2="6"
                        y2="-8"
                        stroke="#C74440"
                        stroke-width="2.4"
                      />
                      <line
                        x1="0"
                        y1="-14"
                        x2="0"
                        y2="-2"
                        stroke="#C74440"
                        stroke-width="2.4"
                      />
                      <line
                        x1="-6"
                        y1="10"
                        x2="6"
                        y2="10"
                        stroke="#2D70B3"
                        stroke-width="2.4"
                      />
                    {:else if comp.type === "VAC"}
                      <line
                        x1="0"
                        y1={-GRID * 2}
                        x2="0"
                        y2="-22"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="0"
                        y1="22"
                        x2="0"
                        y2={GRID * 2}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <circle
                        cx="0"
                        cy="0"
                        r="22"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <path
                        d="M-12 0 C-7 -11 -2 -11 0 0 C2 11 7 11 12 0"
                        stroke="#2D70B3"
                        stroke-width="2.5"
                        fill="none"
                      />
                    {:else if comp.type === "GND"}
                      <line
                        x1="0"
                        y1={-GRID}
                        x2="0"
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="-18"
                        y1="0"
                        x2="18"
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.8"
                      />
                      <line
                        x1="-11"
                        y1="7"
                        x2="11"
                        y2="7"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="-5"
                        y1="14"
                        x2="5"
                        y2="14"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                    {:else if comp.type === "DIODE" || comp.type === "LED" || comp.type === "ZENER"}
                      {@const isLit =
                        !comp.blown &&
                        comp.type === "LED" &&
                        comp.branchCurrent > 0.0008}
                      <rect
                        x="-44"
                        y="-24"
                        width="88"
                        height="48"
                        fill="transparent"
                      />
                      {#if isLit}
                        <circle
                          cx="0"
                          cy="-2"
                          r={Math.min(36, 22 + comp.branchCurrent * 500)}
                          fill="#FEE2E2"
                          stroke="#EF4444"
                          stroke-width="1.8"
                        />
                      {/if}
                      {#if physicalDrawingMode && comp.type === "LED"}
                        <!-- Side-Profile 5mm LED Bulb Drawing with Anode (+) and Cathode (−) Leads (No bullseye towards screen!) -->
                        <line
                          x1={-GRID * 2}
                          y1="0"
                          x2="-12"
                          y2="0"
                          stroke="#8C959F"
                          stroke-width="3"
                        />
                        <line
                          x1="12"
                          y1="0"
                          x2={GRID * 2}
                          y2="0"
                          stroke="#8C959F"
                          stroke-width="3"
                        />
                        <path
                          d="M-14 8 V-8 A14 14 0 0 1 14 -8 V8 Z"
                          fill={isLit ? "#EF4444" : "#FCA5A5"}
                          stroke="#1F2328"
                          stroke-width="2.2"
                        />
                        <rect
                          x="-16"
                          y="6"
                          width="32"
                          height="5"
                          rx="1.5"
                          fill={isLit ? "#DC2626" : "#EF4444"}
                          stroke="#1F2328"
                          stroke-width="1.8"
                        />
                      {:else}
                        <line
                          x1={-GRID * 2}
                          y1="0"
                          x2="-14"
                          y2="0"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                        <line
                          x1="14"
                          y1="0"
                          x2={GRID * 2}
                          y2="0"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                        <polygon
                          points="-14,-14 -14,14 14,0"
                          fill={isLit
                            ? "#EF4444"
                            : comp.type === "ZENER"
                              ? "#FEF3C7"
                              : "#FFFFFF"}
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                        {#if comp.type === "ZENER"}
                          <path
                            d="M8 -15 H14 V15 H20"
                            fill="none"
                            stroke="#1F2328"
                            stroke-width="3"
                          />
                        {:else}
                          <line
                            x1="14"
                            y1="-15"
                            x2="14"
                            y2="15"
                            stroke="#1F2328"
                            stroke-width="3"
                          />
                        {/if}
                        {#if comp.type === "LED"}
                          <path
                            d="M-2 -17 L7 -26 M3 -26 H7 V-22"
                            stroke="#C74440"
                            stroke-width="2"
                            fill="none"
                          />
                          <path
                            d="M6 -14 L15 -23 M11 -23 H15 V-19"
                            stroke="#C74440"
                            stroke-width="2"
                            fill="none"
                          />
                        {/if}
                      {/if}
                      <!-- Clear Beginner + and − Polarity Markers on LED / Diode Pins -->
                      <text
                        x="-34"
                        y="-10"
                        text-anchor="middle"
                        font-size="16"
                        font-weight="700"
                        fill="#C74440">+</text
                      >
                      <text
                        x="34"
                        y="-10"
                        text-anchor="middle"
                        font-size="16"
                        font-weight="700"
                        fill="#2D70B3">−</text
                      >
                    {:else if comp.type === "POT"}
                      <line
                        x1={-GRID * 2}
                        y1={-GRID}
                        x2="-18"
                        y2={-GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1={-GRID * 2}
                        y1={GRID}
                        x2="-18"
                        y2={GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="18"
                        y1="0"
                        x2={GRID * 2}
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <rect
                        x="-18"
                        y="-30"
                        width="36"
                        height="60"
                        rx="6"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <path
                        d="M0 -22 L-8 -14 L8 -6 L-8 2 L8 10 L-8 18 L0 22"
                        fill="none"
                        stroke="#1F2328"
                        stroke-width="2.3"
                      />
                      <line
                        x1="18"
                        y1="0"
                        x2="6"
                        y2="0"
                        stroke="#FA7E19"
                        stroke-width="2.6"
                      />
                      <polygon points="4,0 11,-5 11,5" fill="#FA7E19" />
                    {:else if comp.type === "FUSE"}
                      <line
                        x1={-GRID * 2}
                        y1="0"
                        x2="-22"
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="22"
                        y1="0"
                        x2={GRID * 2}
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <rect
                        x="-22"
                        y="-12"
                        width="44"
                        height="24"
                        rx="4"
                        fill={comp.blown ? "#FEE2E2" : "#E0F2FE"}
                        stroke="#1F2328"
                        stroke-width="2.4"
                      />
                      {#if !comp.blown}
                        <path
                          d="M-16 0 C-8 -10 0 -10 0 0 C0 10 8 10 16 0"
                          fill="none"
                          stroke="#C74440"
                          stroke-width="2.4"
                        />
                      {:else}
                        <line
                          x1="-16"
                          y1="0"
                          x2="-5"
                          y2="-4"
                          stroke="#C74440"
                          stroke-width="2.4"
                        />
                        <line
                          x1="5"
                          y1="4"
                          x2="16"
                          y2="0"
                          stroke="#C74440"
                          stroke-width="2.4"
                        />
                      {/if}
                    {:else if comp.type === "BUZZER"}
                      {@const isBuzzing =
                        !comp.blown && (comp.state?.buzzing ?? 0) > 0}
                      <line
                        x1={-GRID * 2}
                        y1="0"
                        x2="-22"
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="22"
                        y1="0"
                        x2={GRID * 2}
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <circle
                        cx="0"
                        cy="0"
                        r="22"
                        fill={isBuzzing ? "#FEF3C7" : "#24292F"}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <circle
                        cx="0"
                        cy="0"
                        r="7"
                        fill={isBuzzing ? "#FA7E19" : "#57606A"}
                      />
                      {#if isBuzzing}
                        <path
                          d="M-14 -26 Q0 -34 14 -26"
                          fill="none"
                          stroke="#FA7E19"
                          stroke-width="2.4"
                        />
                        <path
                          d="M-20 -32 Q0 -42 20 -32"
                          fill="none"
                          stroke="#FA7E19"
                          stroke-width="2"
                        />
                      {/if}
                    {:else if comp.type === "NPN" || comp.type === "PNP"}
                      {#if physicalDrawingMode}
                        <line
                          x1={-GRID * 2}
                          y1="0"
                          x2="-14"
                          y2="0"
                          stroke="#8C959F"
                          stroke-width="3"
                        />
                        <path
                          d={`M0 -14 L${GRID} -26 V-${GRID * 2}`}
                          stroke="#8C959F"
                          stroke-width="3"
                          fill="none"
                        />
                        <path
                          d={`M0 14 L${GRID} 26 V${GRID * 2}`}
                          stroke="#8C959F"
                          stroke-width="3"
                          fill="none"
                        />
                        <path
                          d="M-16 -20 H4 A18 20 0 0 1 4 20 H-16 Z"
                          fill="#24292F"
                          stroke="#1F2328"
                          stroke-width="2.4"
                        />
                        {#if chipXray}
                          <rect
                            x="-8"
                            y="-8"
                            width="14"
                            height="16"
                            rx="2"
                            fill="#F59E0B"
                            stroke="#FFFFFF"
                            stroke-width="1.2"
                          />
                        {/if}
                      {:else}
                        <circle
                          cx="2"
                          cy="0"
                          r="25"
                          fill="#FFFFFF"
                          stroke="#1F2328"
                          stroke-width="2.3"
                        />
                        <line
                          x1={-GRID * 2}
                          y1="0"
                          x2="-8"
                          y2="0"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                        <line
                          x1="-8"
                          y1="-15"
                          x2="-8"
                          y2="15"
                          stroke="#1F2328"
                          stroke-width="3.4"
                        />
                        <path
                          d={`M-8 -7 L${GRID} -26 V-${GRID * 2}`}
                          stroke="#1F2328"
                          stroke-width="2.5"
                          fill="none"
                        />
                        <path
                          d={`M-8 7 L${GRID} 26 V${GRID * 2}`}
                          stroke="#1F2328"
                          stroke-width="2.5"
                          fill="none"
                        />
                        {#if comp.type === "NPN"}
                          <polygon points="21,23 11,22 16,14" fill="#1F2328" />
                        {:else}
                          <polygon points="-3,-9 7,-10 2,-18" fill="#1F2328" />
                        {/if}
                      {/if}
                      <text
                        x="-36"
                        y="-8"
                        font-size="15"
                        font-weight="700"
                        fill="#57606A">B</text
                      >
                      <text
                        x="14"
                        y="-34"
                        font-size="15"
                        font-weight="700"
                        fill="#57606A">{comp.type === "NPN" ? "C" : "E"}</text
                      >
                      <text
                        x="14"
                        y="44"
                        font-size="15"
                        font-weight="700"
                        fill="#57606A">{comp.type === "NPN" ? "E" : "C"}</text
                      >
                    {:else if comp.type === "NMOS"}
                      <circle
                        cx="2"
                        cy="0"
                        r="25"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.3"
                      />
                      <line
                        x1={-GRID * 2}
                        y1="0"
                        x2="-10"
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="-10"
                        y1="-14"
                        x2="-10"
                        y2="14"
                        stroke="#1F2328"
                        stroke-width="2.6"
                      />
                      <line
                        x1="-3"
                        y1="-16"
                        x2="-3"
                        y2="16"
                        stroke="#1F2328"
                        stroke-width="2.6"
                      />
                      <path
                        d={`M-3 -11 H${GRID} V-${GRID * 2}`}
                        stroke="#1F2328"
                        stroke-width="2.5"
                        fill="none"
                      />
                      <path
                        d={`M-3 11 H${GRID} V${GRID * 2}`}
                        stroke="#1F2328"
                        stroke-width="2.5"
                        fill="none"
                      />
                    {:else if comp.type === "OPAMP"}
                      <polygon
                        points="-30,-32 -30,32 32,0"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1={-GRID * 2}
                        y1={-GRID}
                        x2="-30"
                        y2={-GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1={-GRID * 2}
                        y1={GRID}
                        x2="-30"
                        y2={GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="32"
                        y1="0"
                        x2={GRID * 2}
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <text
                        x="-23"
                        y="-12"
                        font-size="16"
                        font-weight="700"
                        fill="#1F2328">+</text
                      >
                      <text
                        x="-23"
                        y="22"
                        font-size="16"
                        font-weight="700"
                        fill="#1F2328">−</text
                      >
                    {:else if comp.type === "LOGIC_IN"}
                      <rect
                        x="-32"
                        y="-22"
                        width="64"
                        height="44"
                        rx="8"
                        fill={comp.switchClosed ? "#2D70B3" : "#FFFFFF"}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="32"
                        y1="0"
                        x2={GRID * 2}
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <text
                        x="0"
                        y="6"
                        text-anchor="middle"
                        font-size="18"
                        font-weight="700"
                        fill={comp.switchClosed ? "#FFFFFF" : "#1F2328"}
                      >
                        {comp.switchClosed ? "1" : "0"}
                      </text>
                    {:else if comp.type === "CLK"}
                      <rect
                        x="-32"
                        y="-22"
                        width="64"
                        height="44"
                        rx="8"
                        fill={comp.state?.clkHigh ? "#FFE8D6" : "#FFFFFF"}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="32"
                        y1="0"
                        x2={GRID * 2}
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <path
                        d="M-18 6 H-10 V-6 H0 V6 H10 V-6 H18"
                        stroke="#FA7E19"
                        stroke-width="2.5"
                        fill="none"
                      />
                    {:else if comp.type === "AND" || comp.type === "NAND"}
                      <path
                        d="M-28 -32 H0 A32 32 0 0 1 0 32 H-28 Z"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1={-GRID * 2}
                        y1={-GRID}
                        x2="-28"
                        y2={-GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1={-GRID * 2}
                        y1={GRID}
                        x2="-28"
                        y2={GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      {#if comp.type === "NAND"}
                        <circle
                          cx="36"
                          cy="0"
                          r="5"
                          fill="#FFFFFF"
                          stroke="#1F2328"
                          stroke-width="2.3"
                        />
                        <line
                          x1="41"
                          y1="0"
                          x2={GRID * 2}
                          y2="0"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                      {:else}
                        <line
                          x1="32"
                          y1="0"
                          x2={GRID * 2}
                          y2="0"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                      {/if}
                      <text
                        x="-4"
                        y="5"
                        text-anchor="middle"
                        font-size="15"
                        font-weight="700"
                        fill="#1F2328"
                      >
                        {comp.type}
                      </text>
                    {:else if comp.type === "OR" || comp.type === "NOR" || comp.type === "XOR"}
                      <path
                        d="M-30 -32 H-6 Q22 -30 34 0 Q22 30 -6 32 H-30 Q-16 0 -30 -32 Z"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      {#if comp.type === "XOR"}
                        <path
                          d="M-37 -32 Q-23 0 -37 32"
                          fill="none"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                      {/if}
                      <line
                        x1={-GRID * 2}
                        y1={-GRID}
                        x2="-24"
                        y2={-GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1={-GRID * 2}
                        y1={GRID}
                        x2="-24"
                        y2={GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      {#if comp.type === "NOR"}
                        <circle
                          cx="39"
                          cy="0"
                          r="5"
                          fill="#FFFFFF"
                          stroke="#1F2328"
                          stroke-width="2.3"
                        />
                        <line
                          x1="44"
                          y1="0"
                          x2={GRID * 2}
                          y2="0"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                      {:else}
                        <line
                          x1="34"
                          y1="0"
                          x2={GRID * 2}
                          y2="0"
                          stroke="#1F2328"
                          stroke-width="2.5"
                        />
                      {/if}
                      <text
                        x="0"
                        y="5"
                        text-anchor="middle"
                        font-size="15"
                        font-weight="700"
                        fill="#1F2328"
                      >
                        {comp.type}
                      </text>
                    {:else if comp.type === "NOT"}
                      <polygon
                        points="-26,-26 -26,26 24,0"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <circle
                        cx="29"
                        cy="0"
                        r="5"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.3"
                      />
                      <line
                        x1={-GRID * 2}
                        y1="0"
                        x2="-26"
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="34"
                        y1="0"
                        x2={GRID * 2}
                        y2="0"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                    {:else if comp.type === "DFF" || comp.type === "SR_LATCH"}
                      <rect
                        x="-36"
                        y="-40"
                        width="72"
                        height="80"
                        rx="6"
                        fill="#FFFFFF"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1={-GRID * 2}
                        y1={-GRID}
                        x2="-36"
                        y2={-GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1={-GRID * 2}
                        y1={GRID}
                        x2="-36"
                        y2={GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="36"
                        y1={-GRID}
                        x2={GRID * 2}
                        y2={-GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <line
                        x1="36"
                        y1={GRID}
                        x2={GRID * 2}
                        y2={GRID}
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      {#if comp.type === "DFF"}
                        <path
                          d="M-36 20 L-26 28 L-36 36"
                          fill="none"
                          stroke="#1F2328"
                          stroke-width="2"
                        />
                      {/if}
                      <text
                        x="-22"
                        y={-GRID + 5}
                        font-size="15"
                        font-weight="700"
                        fill="#1F2328"
                        >{comp.type === "SR_LATCH" ? "S" : "D"}</text
                      >
                      {#if comp.type === "SR_LATCH"}
                        <text
                          x="-22"
                          y={GRID + 5}
                          font-size="15"
                          font-weight="700"
                          fill="#1F2328">R</text
                        >
                      {/if}
                      <text
                        x="20"
                        y={-GRID + 5}
                        text-anchor="end"
                        font-size="15"
                        font-weight="700"
                        fill="#1F2328">Q</text
                      >
                      <text
                        x="24"
                        y={GRID + 5}
                        text-anchor="end"
                        font-size="15"
                        font-weight="700"
                        fill="#57606A">~Q</text
                      >
                    {:else if comp.type === "COUNTER4" || comp.type === "SHIFT4"}
                      <rect
                        x="-58"
                        y="-66"
                        width="116"
                        height="132"
                        rx="7"
                        fill="#24292F"
                        stroke="#008184"
                        stroke-width="2.6"
                      />
                      <text
                        x="0"
                        y="-6"
                        text-anchor="middle"
                        font-size="15.5"
                        font-weight="700"
                        fill="#FFD8BE"
                      >
                        {comp.type === "COUNTER4" ? "4B COUNTER" : "SHIFT REG"}
                      </text>
                      <text
                        x="0"
                        y="18"
                        text-anchor="middle"
                        font-size="16"
                        font-weight="700"
                        fill="#56D364"
                      >
                        {(comp.state?.cnt ?? 0).toString(2).padStart(4, "0")} ({comp
                          .state?.cnt ?? 0})
                      </text>
                    {:else if comp.type === "SEG7"}
                      {@const segs =
                        SEG7_TABLE[comp.state?.hexVal ?? 0] ?? SEG7_TABLE[0]}
                      <rect
                        x="-54"
                        y="-68"
                        width="108"
                        height="136"
                        rx="8"
                        fill="#1F2328"
                        stroke="#57606A"
                        stroke-width="2.5"
                      />
                      <rect
                        x="-18"
                        y="-46"
                        width="36"
                        height="7"
                        rx="3"
                        fill={segs[0] ? "#EF4444" : "#32383F"}
                      />
                      <rect
                        x="18"
                        y="-40"
                        width="7"
                        height="36"
                        rx="3"
                        fill={segs[1] ? "#EF4444" : "#32383F"}
                      />
                      <rect
                        x="18"
                        y="4"
                        width="7"
                        height="36"
                        rx="3"
                        fill={segs[2] ? "#EF4444" : "#32383F"}
                      />
                      <rect
                        x="-18"
                        y="39"
                        width="36"
                        height="7"
                        rx="3"
                        fill={segs[3] ? "#EF4444" : "#32383F"}
                      />
                      <rect
                        x="-25"
                        y="4"
                        width="7"
                        height="36"
                        rx="3"
                        fill={segs[4] ? "#EF4444" : "#32383F"}
                      />
                      <rect
                        x="-25"
                        y="-40"
                        width="7"
                        height="36"
                        rx="3"
                        fill={segs[5] ? "#EF4444" : "#32383F"}
                      />
                      <rect
                        x="-18"
                        y="-3.5"
                        width="36"
                        height="7"
                        rx="3"
                        fill={segs[6] ? "#EF4444" : "#32383F"}
                      />
                    {:else if comp.type === "FPGA"}
                      <rect
                        x="-64"
                        y="-68"
                        width="128"
                        height="136"
                        rx="8"
                        fill="#24292F"
                        stroke="#6042A6"
                        stroke-width="3"
                      />
                      {#if chipXray}
                        <rect
                          x="-32"
                          y="-36"
                          width="64"
                          height="72"
                          rx="4"
                          fill="#181326"
                          stroke="#A371F7"
                          stroke-width="1.5"
                        />
                        {#each [0, 1, 2, 3] as r}
                          {#each [0, 1, 2, 3] as c}
                            {@const idx = r * 4 + c}
                            {@const bitOn =
                              (((comp.fpgaLutY0 ?? 0) >> idx) & 1) === 1}
                            {@const isCur = (comp.state?.lutAddr ?? 0) === idx}
                            <rect
                              x={-26 + c * 14}
                              y={-30 + r * 14}
                              width="10"
                              height="10"
                              rx="1.5"
                              fill={isCur
                                ? "#56D364"
                                : bitOn
                                  ? "#2D70B3"
                                  : "#32383F"}
                            />
                          {/each}
                        {/each}
                      {/if}
                      <text
                        x="0"
                        y={chipXray ? 54 : -10}
                        text-anchor="middle"
                        font-size="15.5"
                        font-weight="700"
                        fill="#FFD8BE"
                      >
                        {comp.fpgaProfile ?? "LUT4"}
                      </text>
                    {:else if comp.type === "IC555"}
                      <rect
                        x="-62"
                        y="-64"
                        width="124"
                        height="128"
                        rx="6"
                        fill="#24292F"
                        stroke="#1F2328"
                        stroke-width="2.5"
                      />
                      <path d="M-12 -64 A12 12 0 0 0 12 -64" fill="#F8F9FA" />
                      {#if chipXray}
                        <rect
                          x="-32"
                          y="-36"
                          width="64"
                          height="72"
                          rx="3"
                          fill="#322314"
                          stroke="#F59E0B"
                          stroke-width="1.6"
                        />
                        <polygon
                          points="-20,-24 -20,-6 -4,-15"
                          fill="none"
                          stroke="#FACC15"
                          stroke-width="1.5"
                        />
                        <polygon
                          points="-20,6 -20,24 -4,15"
                          fill="none"
                          stroke="#FACC15"
                          stroke-width="1.5"
                        />
                        <rect
                          x="2"
                          y="-12"
                          width="22"
                          height="24"
                          fill="none"
                          stroke="#56D364"
                          stroke-width="1.5"
                        />
                      {/if}
                      <text
                        x="0"
                        y={chipXray ? 54 : 5}
                        text-anchor="middle"
                        font-size="16"
                        font-weight="700"
                        fill="#FFD8BE"
                      >
                        NE555
                      </text>
                    {:else if comp.type === "ARDUINO"}
                      <rect
                        x="-96"
                        y="-66"
                        width="192"
                        height="132"
                        rx="8"
                        fill="#008184"
                        stroke="#1F2328"
                        stroke-width="2.6"
                      />
                      <!-- ATmega328P DIP-28 Chip -->
                      <rect
                        x="-48"
                        y="4"
                        width="96"
                        height="44"
                        rx="4"
                        fill="#1F2328"
                        stroke="#57606A"
                        stroke-width="1.5"
                      />
                      {#if chipXray}
                        <rect
                          x="-14"
                          y="9"
                          width="28"
                          height="16"
                          rx="2"
                          fill="#322314"
                          stroke="#F59E0B"
                          stroke-width="1.4"
                        />
                        <line
                          x1="-14"
                          y1="17"
                          x2="-40"
                          y2="17"
                          stroke="#FACC15"
                          stroke-width="1.2"
                        />
                        <line
                          x1="14"
                          y1="17"
                          x2="40"
                          y2="17"
                          stroke="#FACC15"
                          stroke-width="1.2"
                        />
                      {/if}
                      <text
                        x="0"
                        y={chipXray ? 41 : 31}
                        text-anchor="middle"
                        font-size="15"
                        font-weight="700"
                        fill="#FFD8BE"
                      >
                        ATmega328
                      </text>
                      <text
                        x="-6"
                        y="-24"
                        text-anchor="middle"
                        font-size="17"
                        font-weight="700"
                        fill="#FFFFFF"
                      >
                        ARDUINO UNO
                      </text>
                      <circle
                        cx="64"
                        cy="-28"
                        r="6"
                        fill={comp.state?.d13 ? "#FACC15" : "#32383F"}
                        stroke="#1F2328"
                        stroke-width="1.5"
                      />
                    {:else if comp.type === "CUSTOM_IC"}
                      {@const chip = customChips.find(
                        (c) => c.id === comp.customChipId,
                      )}
                      <rect
                        x="-62"
                        y="-54"
                        width="124"
                        height="108"
                        rx="6"
                        fill="#24292F"
                        stroke={chip?.color ?? "#FA7E19"}
                        stroke-width="2.8"
                      />
                      <path d="M-10 -54 A10 10 0 0 0 10 -54" fill="#F8F9FA" />
                      {#if chipXray}
                        <rect
                          x="-30"
                          y="-28"
                          width="60"
                          height="52"
                          rx="3"
                          fill="#2A1E17"
                          stroke={chip?.color ?? "#FA7E19"}
                          stroke-width="1.6"
                        />
                        {#each pins as p}
                          <line
                            x1="0"
                            y1="0"
                            x2={p.dx * GRID * 0.65}
                            y2={p.dy * GRID * 0.65}
                            stroke="#FACC15"
                            stroke-width="1.2"
                            stroke-dasharray="2 2"
                          />
                        {/each}
                        <circle
                          cx="0"
                          cy="-2"
                          r="12"
                          fill="none"
                          stroke="#FACC15"
                          stroke-width="1.5"
                        />
                        <path
                          d="M-8 -2 H8 M0 -10 V6"
                          stroke="#FACC15"
                          stroke-width="1.5"
                        />
                      {/if}
                      <text
                        x="0"
                        y={chipXray ? 42 : 6}
                        text-anchor="middle"
                        font-size="15.5"
                        font-weight="700"
                        fill={chip?.color ?? "#FFD8BE"}
                      >
                        {comp.label}
                      </text>
                    {/if}

                    {#each pins as pin (pin.id)}
                      {@const px = pin.dx * GRID}
                      {@const py = pin.dy * GRID}
                      {@const isWiringThis =
                        wiringFrom?.compId === comp.id &&
                        wiringFrom?.pinId === pin.id}
                      {@const isHoveredTarget =
                        hoveredPin?.compId === comp.id &&
                        hoveredPin?.pinId === pin.id}
                      {@const pVolt = comp.pinVoltages[pin.id] ?? 0}

                      {#if comp.type === "ARDUINO" || comp.type === "IC555" || comp.type === "CUSTOM_IC" || comp.type === "FPGA" || comp.type === "SEG7" || comp.type === "COUNTER4" || comp.type === "SHIFT4"}
                        <rect
                          x={pin.dx < 0 ? px : px - 18}
                          y={py - 4}
                          width="18"
                          height="8"
                          rx="1.5"
                          fill="#D0D7DE"
                          stroke="#1F2328"
                          stroke-width="1.5"
                        />
                        <text
                          x={pin.dx < 0 ? px + 24 : px - 24}
                          y={py + 5}
                          text-anchor={pin.dx < 0 ? "start" : "end"}
                          font-size="15"
                          font-weight="700"
                          fill="#FFFFFF"
                        >
                          {pin.label}
                        </text>
                      {/if}

                      <!-- Invisible Magnetic Snap Hit Area (r=13) + Crisp Visual Pin Pad -->
                      <!-- svelte-ignore a11y-no-static-element-interactions -->
                      <g
                        on:pointerdown={(e) => onPinPointerDown(e, comp, pin)}
                        on:pointerenter={(e) => {
                          hoveredPin = { compId: comp.id, pinId: pin.id };
                          setHover(
                            e,
                            `${comp.label} · PIN [${pin.label}]`,
                            pin.description,
                            `V = ${formatElec(pVolt, "V")} (Click or drag between pins to wire)`,
                          );
                        }}
                        on:pointermove={moveHover}
                        on:pointerleave={() => {
                          if (
                            hoveredPin?.compId === comp.id &&
                            hoveredPin?.pinId === pin.id
                          ) {
                            hoveredPin = null;
                          }
                          clearHover();
                        }}
                      >
                        <circle
                          cx={px}
                          cy={py}
                          r="13"
                          fill="transparent"
                          class="pin-pad"
                        />
                        <circle
                          cx={px}
                          cy={py}
                          r={isWiringThis || isHoveredTarget ? 8 : 5.8}
                          fill={isWiringThis
                            ? "#FA7E19"
                            : isHoveredTarget
                              ? "#388C46"
                              : "#FFFFFF"}
                          stroke="#1F2328"
                          stroke-width="2.2"
                          class="pin-pad"
                        />
                      </g>
                    {/each}
                  </g>

                  <text
                    x="0"
                    y={comp.type === "ARDUINO" ||
                    comp.type === "FPGA" ||
                    comp.type === "SEG7"
                      ? -76
                      : comp.type === "IC555" || comp.type === "CUSTOM_IC"
                        ? -70
                        : -38}
                    text-anchor="middle"
                    font-size="15.5"
                    font-weight="700"
                    fill={comp.blown
                      ? "#C74440"
                      : comp.failureReason || isReverseBiasedLed
                        ? "#FA7E19"
                        : "#1F2328"}
                    stroke="#F8F9FA"
                    stroke-width="4"
                    paint-order="stroke"
                  >
                    {comp.blown
                      ? `${comp.label} BLOWN`
                      : comp.failureReason
                        ? `${comp.label} OVERLOAD`
                        : isReverseBiasedLed
                          ? `${comp.label} (+/− REVERSED)`
                          : comp.label}
                    {#if !comp.blown && !comp.failureReason && !isReverseBiasedLed && (comp.type === "R" || comp.type === "POT" || comp.type === "FUSE" || comp.type === "ZENER" || comp.type === "C" || comp.type === "L" || comp.type === "VDC")}
                      ({formatSI(comp.value, cat.shortUnit)})
                    {/if}
                  </text>
                </g>
              {/each}
            </g>
          </svg>

          <!-- Bottom-Left 2D Zoom Controls -->
          <div class="zoom-controls">
            <button on:click={() => (zoom = Math.min(2.2, zoom * 1.15))}
              >+</button
            >
            <button
              on:click={() => {
                zoom = 0.96;
                pan = { x: 40, y: 20 };
              }}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button on:click={() => (zoom = Math.max(0.45, zoom * 0.85))}
              >−</button
            >
          </div>
        </div>
      {/if}

      <!-- COLLAPSIBLE 3D PCB DRAWER -->
      {#if show3DDrawer}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="pane-3d"
          on:pointerdown={on3DPointerDown}
          on:pointermove={on3DPointerMove}
          on:pointerup={on3DPointerUp}
          on:wheel={on3DWheel}
          on:contextmenu|preventDefault
          on:mouseenter={(e) =>
            setHover(
              e,
              "3D CIRCUIT BOARD VIEW",
              "Drag to orbit 360° · Shift+Drag to pan · Scroll to zoom",
            )}
          on:mousemove={moveHover}
          on:mouseleave={clearHover}
        >
          <canvas bind:this={canvas3dEl} class="canvas-3d"></canvas>

          <div class="controls-3d">
            <button on:click|stopPropagation={() => (cam3D.yaw -= 0.3)}
              >⟲</button
            >
            <button
              on:click|stopPropagation={() => {
                cam3D = {
                  yaw: -0.55,
                  pitch: 0.82,
                  zoom: 0.92,
                  panX: 0,
                  panY: 10,
                  xray: chipXray,
                };
              }}
            >
              RESET
            </button>
            <button on:click|stopPropagation={() => (cam3D.yaw += 0.3)}
              >⟳</button
            >
            <button on:click|stopPropagation={() => (full3D = !full3D)}>
              {full3D ? "SPLIT" : "FULL"}
            </button>
            <button
              on:click|stopPropagation={() => {
                downloadTextFile("circuitfab_pcb.stl", exportPcbStl(components, GRID));
                showToast("Downloaded 3D PCB (.stl)");
              }}
              title="Download 3D PCB as .stl"
            >
              ⬇ STL
            </button>
            <button
              class="close-3d-btn"
              on:click|stopPropagation={() => {
                show3DDrawer = false;
                full3D = false;
              }}
            >
              ▶ HIDE 3D
            </button>
          </div>

          {#if inspected3DCompId}
            {@const c3d = components.find((c) => c.id === inspected3DCompId)}
            {#if c3d}
              {@const cat3d = getCatalogItem(c3d.type)}
              <div class="inspector-3d" on:pointerdown|stopPropagation>
                <div class="insp-top">
                  <strong>{c3d.label} — {cat3d.tooltipTitle}</strong>
                  <button
                    class="icon-action"
                    on:click={() => (inspected3DCompId = null)}>✕</button
                  >
                </div>
                <p class="insp-desc">{cat3d.tooltipPhysics}</p>
                <div class="insp-metrics">
                  <span>V: {formatElec(getCompPrimaryVoltage(c3d), "V")}</span>
                  <span>I: {formatElec(c3d.branchCurrent, "A")}</span>
                  <span>T: {(c3d.tempC ?? 25).toFixed(0)}°C</span>
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {/if}

      <!-- Bottom-Right Live Oscilloscope (slides into 2D pane when 3D view is open) -->
      {#if showScope}
        <div class="scope-card" class:over-2d={show3DDrawer && !full3D} role="region">
          <div class="scope-header">
            <div class="scope-traces">
              {#each components.filter((c) => c.probed) as pc (pc.id)}
                <span class="trace-pill" style="background-color: {pc.color}">
                  {pc.label}: {formatElec(getCompPrimaryVoltage(pc), "V")}
                </span>
              {/each}
            </div>
            <div style="display:flex;gap:4px;align-items:center;">
              <button
                class="mini-pill"
                on:click={() =>
                  (simSpeed =
                    simSpeed === 1 ? 0.5 : simSpeed === 0.5 ? 0.25 : 1)}
                on:mouseenter={(e) =>
                  setHover(
                    e,
                    "TIMEBASE SPEED",
                    "Cycle oscilloscope & simulation speed (1x, 0.5x, 0.25x)",
                  )}
                on:mousemove={moveHover}
                on:mouseleave={clearHover}
              >
                {simSpeed}x
              </button>
              <button class="icon-action" on:click={() => (probeHistory = [])}
                >↺</button
              >
            </div>
          </div>
          <canvas bind:this={scopeCanvas} width="320" height="135"></canvas>
        </div>
      {/if}
    </section>
  </main>

  <!-- =========================================================================
     SUBPAGE 2: FPGA DIGITAL LOGIC & CUSTOM CHIP FOUNDRY
     ========================================================================= -->
{:else if activeSubpage === "fpga"}
  <main class="subpage-grid">
    <section class="subpage-card">
      <div class="card-header">
        <span>FPGA LUT4 DIGITAL LOGIC</span>
        <button
          class="action-pill fpga-pill"
          on:click={() => {
            getOrEnsureFpga();
            activeSubpage = "circuit";
          }}
        >
          VIEW ON BOARD →
        </button>
      </div>

      <div class="profile-row">
        {#each Object.entries(FPGA_PROFILES) as [pKey, prof]}
          <button
            class="prof-btn"
            class:active={activeFpgaComp?.fpgaProfile === pKey}
            on:click={() => applyFpgaProfile(pKey)}
            on:mouseenter={(e) => setHover(e, prof.label, prof.desc)}
            on:mousemove={moveHover}
            on:mouseleave={clearHover}
          >
            {prof.label}
          </button>
        {/each}
      </div>

      <div class="chip-preview-box">
        <svg width="460" height="145" viewBox="0 0 460 145">
          <g transform="translate(80, 72)">
            <rect
              x="-48"
              y="-48"
              width="96"
              height="96"
              rx="6"
              fill="#24292F"
              stroke="#6042A6"
              stroke-width="2.5"
            />
            {#each [-32, -16, 0, 16, 32] as p}
              <rect x="-58" y={p - 3} width="10" height="6" fill="#D0D7DE" />
              <rect x="48" y={p - 3} width="10" height="6" fill="#D0D7DE" />
              <rect x={p - 3} y="-58" width="6" height="10" fill="#D0D7DE" />
              <rect x={p - 3} y="48" width="6" height="10" fill="#D0D7DE" />
            {/each}
            {#each [0, 1, 2, 3] as r}
              {#each [0, 1, 2, 3] as c}
                {@const idx = r * 4 + c}
                {@const bitOn =
                  (((activeFpgaComp?.fpgaLutY0 ??
                    FPGA_PROFILES["FULL-ADD"].lutY0) >>
                    idx) &
                    1) ===
                  1}
                <rect
                  x={-28 + c * 15}
                  y={-28 + r * 15}
                  width="11"
                  height="11"
                  rx="2"
                  fill={bitOn ? "#56D364" : "#3B434B"}
                />
              {/each}
            {/each}
          </g>

          <g transform="translate(300, 72)">
            <rect
              x="-135"
              y="-56"
              width="270"
              height="112"
              rx="6"
              fill="#FFFFFF"
              stroke="#D8DEE4"
              stroke-width="1.5"
            />
            <text
              x="-120"
              y="-26"
              font-size="15"
              font-weight="700"
              fill="#1F2328">I0</text
            >
            <text x="-120" y="4" font-size="15" font-weight="700" fill="#1F2328"
              >I1</text
            >
            <text
              x="-120"
              y="34"
              font-size="15"
              font-weight="700"
              fill="#1F2328">I2</text
            >
            <line
              x1="-100"
              y1="-30"
              x2="-40"
              y2="-30"
              stroke="#2D70B3"
              stroke-width="2"
            />
            <line
              x1="-100"
              y1="0"
              x2="-40"
              y2="-16"
              stroke="#2D70B3"
              stroke-width="2"
            />
            <line
              x1="-100"
              y1="0"
              x2="-40"
              y2="16"
              stroke="#388C46"
              stroke-width="2"
            />
            <line
              x1="-100"
              y1="30"
              x2="-40"
              y2="30"
              stroke="#388C46"
              stroke-width="2"
            />
            <path
              d="M-40 -38 H-20 Q2 -36 12 -22 Q2 -8 -20 -6 H-40 Q-30 -22 -40 -38 Z"
              fill="#FFF9F5"
              stroke="#1F2328"
              stroke-width="2"
            />
            <path
              d="M-40 8 H-16 A15 15 0 0 1 -16 38 H-40 Z"
              fill="#F4F5F7"
              stroke="#1F2328"
              stroke-width="2"
            />
            <line
              x1="12"
              y1="-22"
              x2="82"
              y2="-22"
              stroke="#6042A6"
              stroke-width="2.4"
            />
            <line
              x1="-1"
              y1="23"
              x2="82"
              y2="23"
              stroke="#FA7E19"
              stroke-width="2.4"
            />
            <text x="90" y="-17" font-size="15" font-weight="700" fill="#6042A6"
              >Y0</text
            >
            <text x="90" y="28" font-size="15" font-weight="700" fill="#FA7E19"
              >Y1</text
            >
          </g>
        </svg>
      </div>

      <div class="lut-grid">
        <div class="lut-head">
          <span>I3 I2 I1 I0</span>
          <span>Y0 (LUT0)</span>
          <span>Y1 (LUT1)</span>
        </div>
        <div class="lut-rows">
          {#each Array.from({ length: 16 }, (_, i) => i) as addr}
            {@const y0Bit =
              ((activeFpgaComp?.fpgaLutY0 ?? FPGA_PROFILES["FULL-ADD"].lutY0) >>
                addr) &
              1}
            {@const y1Bit =
              ((activeFpgaComp?.fpgaLutY1 ?? FPGA_PROFILES["FULL-ADD"].lutY1) >>
                addr) &
              1}
            {@const isActiveAddr =
              (activeFpgaComp?.state?.lutAddr ?? -1) === addr}
            <div class="lut-row" class:active-addr={isActiveAddr}>
              <span class="addr-bits">
                {(addr >> 3) & 1}
                {(addr >> 2) & 1}
                {(addr >> 1) & 1}
                {addr & 1}
              </span>
              <button
                class="lut-cell"
                class:one={y0Bit === 1}
                on:click={() => toggleFpgaLutBit(0, addr)}
              >
                {y0Bit}
              </button>
              <button
                class="lut-cell"
                class:one={y1Bit === 1}
                on:click={() => toggleFpgaLutBit(1, addr)}
              >
                {y1Bit}
              </button>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section class="subpage-card">
      <div class="card-header">
        <span>+IC SILICON CHIP FOUNDRY</span>
        <button class="action-pill ic-pill" on:click={createCustomChip}>
          + FABRICATE & DROP [{newChipName}]
        </button>
      </div>

      <div class="foundry-row">
        <input
          type="text"
          maxlength="9"
          bind:value={newChipName}
          placeholder="IC-NAME"
        />
        <div class="color-swatches">
          {#each TRACE_COLORS as col}
            <button
              class="swatch-btn"
              aria-label={col}
              class:active={newChipColor === col}
              style="background-color: {col}"
              on:click={() => (newChipColor = col)}
            ></button>
          {/each}
        </div>
      </div>

      <div class="chip-preview-box">
        <svg width="420" height="165" viewBox="0 0 420 165">
          <g transform="translate(90, 82)">
            <rect
              x="-54"
              y="-46"
              width="108"
              height="92"
              rx="6"
              fill="#24292F"
              stroke={newChipColor}
              stroke-width="2.6"
            />
            <path d="M-10 -46 A10 10 0 0 0 10 -46" fill="#F4F5F7" />
            <rect
              x="-68"
              y="-26"
              width="14"
              height="8"
              fill="#D0D7DE"
              stroke="#1F2328"
            />
            <rect
              x="-68"
              y="18"
              width="14"
              height="8"
              fill="#D0D7DE"
              stroke="#1F2328"
            />
            <rect
              x="54"
              y="-26"
              width="14"
              height="8"
              fill="#D0D7DE"
              stroke="#1F2328"
            />
            <rect
              x="54"
              y="18"
              width="14"
              height="8"
              fill="#D0D7DE"
              stroke="#1F2328"
            />
            <rect
              x="-24"
              y="-22"
              width="48"
              height="44"
              rx="3"
              fill="#322314"
              stroke="#F59E0B"
              stroke-width="1.5"
            />
            <line
              x1="-24"
              y1="-12"
              x2="-54"
              y2="-22"
              stroke="#FACC15"
              stroke-width="1.3"
            />
            <line
              x1="-24"
              y1="12"
              x2="-54"
              y2="22"
              stroke="#FACC15"
              stroke-width="1.3"
            />
            <line
              x1="24"
              y1="-12"
              x2="54"
              y2="-22"
              stroke="#FACC15"
              stroke-width="1.3"
            />
            <line
              x1="24"
              y1="12"
              x2="54"
              y2="22"
              stroke="#FACC15"
              stroke-width="1.3"
            />
            <text
              x="0"
              y="5"
              text-anchor="middle"
              font-size="15.5"
              font-weight="700"
              fill="#FFFFFF"
            >
              {newChipName}
            </text>
          </g>

          <g transform="translate(295, 82)">
            <rect
              x="-100"
              y="-60"
              width="200"
              height="120"
              rx="6"
              fill="#FFFFFF"
              stroke="#D8DEE4"
              stroke-width="1.5"
            />
            {#if newChipTemplate === "bjt-stage"}
              <path
                d="M-75 0 H-45 L-40 -7 L-32 7 L-24 -7 L-18 0 H-4"
                stroke="#1F2328"
                stroke-width="2"
                fill="none"
              />
              <circle
                cx="14"
                cy="0"
                r="18"
                fill="none"
                stroke="#1F2328"
                stroke-width="2"
              />
              <line
                x1="6"
                y1="-11"
                x2="6"
                y2="11"
                stroke="#1F2328"
                stroke-width="2.6"
              />
              <path
                d="M6 -5 L26 -18 V-42"
                stroke="#1F2328"
                stroke-width="2"
                fill="none"
              />
              <path
                d="M6 5 L26 18 V42"
                stroke="#1F2328"
                stroke-width="2"
                fill="none"
              />
              <line
                x1="26"
                y1="-22"
                x2="75"
                y2="-22"
                stroke="#2D70B3"
                stroke-width="2.2"
              />
              <text
                x="-75"
                y="-12"
                font-size="15"
                font-weight="700"
                fill="#1F2328">IN</text
              >
              <text
                x="45"
                y="-28"
                font-size="15"
                font-weight="700"
                fill="#2D70B3">OUT</text
              >
            {:else if newChipTemplate === "h-bridge"}
              <circle
                cx="0"
                cy="-22"
                r="15"
                fill="none"
                stroke="#1F2328"
                stroke-width="2"
              />
              <circle
                cx="0"
                cy="22"
                r="15"
                fill="none"
                stroke="#1F2328"
                stroke-width="2"
              />
              <line
                x1="-65"
                y1="0"
                x2="-15"
                y2="-22"
                stroke="#1F2328"
                stroke-width="2"
              />
              <line
                x1="-65"
                y1="0"
                x2="-15"
                y2="22"
                stroke="#1F2328"
                stroke-width="2"
              />
              <line
                x1="15"
                y1="-22"
                x2="15"
                y2="22"
                stroke="#1F2328"
                stroke-width="2"
              />
              <line
                x1="15"
                y1="0"
                x2="70"
                y2="0"
                stroke="#FA7E19"
                stroke-width="2.4"
              />
              <text
                x="-85"
                y="5"
                font-size="15"
                font-weight="700"
                fill="#1F2328">DRV</text
              >
              <text
                x="38"
                y="-8"
                font-size="15"
                font-weight="700"
                fill="#FA7E19">OUT</text
              >
            {:else if newChipTemplate === "schmitt"}
              <polygon
                points="-45,-16 -45,16 -15,0"
                fill="none"
                stroke="#1F2328"
                stroke-width="2"
              />
              <circle
                cx="-11"
                cy="0"
                r="3.5"
                fill="none"
                stroke="#1F2328"
                stroke-width="1.8"
              />
              <polygon
                points="8,-16 8,16 38,0"
                fill="none"
                stroke="#1F2328"
                stroke-width="2"
              />
              <circle
                cx="42"
                cy="0"
                r="3.5"
                fill="none"
                stroke="#1F2328"
                stroke-width="1.8"
              />
              <line
                x1="-75"
                y1="0"
                x2="-45"
                y2="0"
                stroke="#1F2328"
                stroke-width="2"
              />
              <line
                x1="-7"
                y1="0"
                x2="8"
                y2="0"
                stroke="#1F2328"
                stroke-width="2"
              />
              <line
                x1="46"
                y1="0"
                x2="75"
                y2="0"
                stroke="#388C46"
                stroke-width="2.2"
              />
            {:else}
              <path
                d="M-70 0 H-35 L-28 -8 L-18 8 L-8 -8 L0 0 H70"
                stroke="#1F2328"
                stroke-width="2"
                fill="none"
              />
              <line
                x1="20"
                y1="0"
                x2="20"
                y2="16"
                stroke="#1F2328"
                stroke-width="2"
              />
              <line
                x1="10"
                y1="16"
                x2="30"
                y2="16"
                stroke="#1F2328"
                stroke-width="2.5"
              />
              <line
                x1="10"
                y1="23"
                x2="30"
                y2="23"
                stroke="#1F2328"
                stroke-width="2.5"
              />
            {/if}
          </g>
        </svg>
      </div>

      <div class="template-grid">
        <button
          class="prof-btn"
          class:active={newChipTemplate === "bjt-stage"}
          on:click={() => {
            newChipTemplate = "bjt-stage";
            newChipName = "AMP-BJT";
          }}
        >
          NPN-AMP DIE
        </button>

        <button
          class="prof-btn"
          class:active={newChipTemplate === "h-bridge"}
          on:click={() => {
            newChipTemplate = "h-bridge";
            newChipName = "TOTEM-PP";
          }}
        >
          PUSH-PULL DIE
        </button>

        <button
          class="prof-btn"
          class:active={newChipTemplate === "schmitt"}
          on:click={() => {
            newChipTemplate = "schmitt";
            newChipName = "CMOS-BUF";
          }}
        >
          CMOS-BUF DIE
        </button>

        <button
          class="prof-btn"
          class:active={newChipTemplate === "capture-board"}
          on:click={() => {
            newChipTemplate = "capture-board";
            newChipName = "USR-IC1";
          }}
        >
          CAPTURE BOARD→IC
        </button>
      </div>
    </section>
  </main>

  <!-- =========================================================================
     SUBPAGE 3: OPEN-SOURCE LOW-LEVEL CODE IDE & COMPILER
     ========================================================================= -->
{:else if activeSubpage === "ide"}
  <main class="subpage-grid">
    <section class="subpage-card">
      <div class="card-header">
        <div class="ide-tabs">
          <button
            class="prof-btn"
            class:active={ideTarget === "avr"}
            on:click={() => (ideTarget = "avr")}
          >
            AVR C / ASM (UNO)
          </button>
          <button
            class="prof-btn"
            class:active={ideTarget === "verilog"}
            on:click={() => (ideTarget = "verilog")}
          >
            VERILOG HDL (FPGA)
          </button>
        </div>

        <div style="display:flex;gap:8px;align-items:center;">
          <button
            class="action-pill fpga-pill"
            on:click={syncWorkspaceToIdeCode}
            title="Inspect live circuit netlist and generate matching AVR C or Verilog HDL code"
          >
            SYNC FROM WORKSPACE
          </button>
          <button class="action-pill ic-pill" on:click={runIdeCompiler}>
            ▶ COMPILE & FLASH
          </button>
        </div>
      </div>

      {#if ideTarget === "avr"}
        <textarea
          class="code-editor"
          spellcheck="false"
          bind:value={avrSourceCode}></textarea>
      {:else}
        <textarea
          class="code-editor"
          spellcheck="false"
          bind:value={verilogSourceCode}></textarea>
      {/if}

      <div class="compiler-status">{compilerLog}</div>
    </section>

    <section class="subpage-card">
      <div class="card-header">
        <span>HARDWARE REGISTERS & BITSTREAM</span>
        <button
          class="action-pill fpga-pill"
          on:click={() => (activeSubpage = "circuit")}
        >
          OPEN CIRCUIT →
        </button>
      </div>

      <div class="reg-grid">
        <div class="reg-box">
          <span class="reg-name">PORTB (D13/D11/D9)</span>
          <span class="reg-val">
            0b00{activeArduinoComp?.state?.d13 ?? 0}0{activeArduinoComp?.state
              ?.d11 ?? 0}0{activeArduinoComp?.state?.d9 ?? 0}0
          </span>
        </div>
        <div class="reg-box">
          <span class="reg-name">ADC0 (PIN A0)</span>
          <span class="reg-val"
            >{activeArduinoComp?.state?.adcA0 ?? 0} / 1023</span
          >
        </div>
        <div class="reg-box">
          <span class="reg-name">FPGA LUT4 HEX</span>
          <span class="reg-val">{verilogSynthInfo.bitstreamHex}</span>
        </div>
        <div class="reg-box">
          <span class="reg-name">SYNTH GATE COUNT</span>
          <span class="reg-val">{verilogSynthInfo.gateCount} CLBs</span>
        </div>
        <div class="reg-box">
          <span class="reg-name">I2C / SPI BUS</span>
          <span class="reg-val">{compiledArduino?.busMode ?? "NONE"}</span>
        </div>
        <div class="reg-box">
          <span class="reg-name">SERIAL MONITOR (9600)</span>
          <span class="reg-val"
            >{compiledArduino?.serialLines?.[0] ?? "IDLE"}</span
          >
        </div>
      </div>

      <div class="profile-row">
        <button
          class="prof-btn"
          on:click={() => {
            ideTarget = "avr";
            avrSourceCode = DEFAULT_ARDUINO_CODE;
            runIdeCompiler();
          }}
        >
          AVR: 2.5Hz PWM
        </button>
        <button
          class="prof-btn"
          on:click={() => {
            ideTarget = "avr";
            avrSourceCode = `// High-Speed 10Hz Burst Mode Driver\nvoid loop() {\n  // BURST mode on D13\n  PORTB |= (1 << PB5);\n  analogWrite(11, 200);\n  delay(50);\n  PORTB &= ~(1 << PB5);\n  delay(50);\n}`;
            runIdeCompiler();
          }}
        >
          AVR: 10Hz BURST
        </button>
        <button
          class="prof-btn"
          on:click={() => {
            ideTarget = "verilog";
            verilogSourceCode = FPGA_PROFILES["FULL-ADD"].verilog;
            runIdeCompiler();
          }}
        >
          HDL: FULL ADDER
        </button>
        <button
          class="prof-btn"
          on:click={() => {
            ideTarget = "verilog";
            verilogSourceCode = FPGA_PROFILES["PARITY-4"].verilog;
            runIdeCompiler();
          }}
        >
          HDL: 4B PARITY
        </button>
      </div>
    </section>
  </main>

  <!-- =========================================================================
     SUBPAGE 4: SIMULATED ENVIRONMENT STRESS LAB
     ========================================================================= -->
{:else if activeSubpage === "stress"}
  <main class="subpage-grid">
    <section class="subpage-card">
      <div class="card-header">
        <span>ENVIRONMENTAL STRESS CHAMBER</span>
        <button class="repair-pill" on:click={repairAllComponents}>
          ↺ RESET & REPAIR ALL
        </button>
      </div>

      <!-- PHYSICS & BURNOUT MODE SELECTOR -->
      <div class="physics-mode-row">
        <button
          class="prof-btn"
          class:active={(stressConfig.physicsMode ?? "realistic") ===
            "realistic"}
          on:click={() => setPhysicsMode("realistic")}
        >
          REALISTIC (EXACT + BURNOUT)
        </button>
        <button
          class="prof-btn"
          class:active={stressConfig.physicsMode === "limited"}
          on:click={() => setPhysicsMode("limited")}
        >
          LIMITED BURNOUT (WARNINGS)
        </button>
        <button
          class="prof-btn"
          class:active={stressConfig.physicsMode === "sandbox"}
          on:click={() => setPhysicsMode("sandbox")}
        >
          SANDBOX (IDEAL MODELS)
        </button>
      </div>

      <!-- LIVE 3D STRESS CHAMBER VIEWPORT -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="stress-3d-box"
        on:pointerdown={on3DPointerDown}
        on:pointermove={on3DPointerMove}
        on:pointerup={on3DPointerUp}
        on:wheel={on3DWheel}
        on:contextmenu|preventDefault
      >
        <canvas bind:this={stress3dEl} class="canvas-3d"></canvas>
      </div>

      <div class="profile-row">
        <button
          class="prof-btn"
          on:click={() => {
            stressConfig.ambientTempC = -40;
            stressConfig.voltageSurge = 1.0;
          }}
        >
          CRYO (-40°C)
        </button>
        <button
          class="prof-btn"
          on:click={() => {
            stressConfig.ambientTempC = 130;
            stressConfig.voltageSurge = 1.4;
            stressConfig.burnoutEnabled = true;
          }}
        >
          THERMAL (+130°C)
        </button>
        <button
          class="prof-btn"
          on:click={() => {
            stressConfig.voltageSurge = 2.8;
            stressConfig.burnoutEnabled = true;
          }}
        >
          2.8x SURGE (BLOW!)
        </button>
        <button
          class="prof-btn"
          on:click={() => {
            stressConfig.emiNoiseV = 1.8;
            stressConfig.clockOverdrive = 3.0;
          }}
        >
          EMI + 3x OVERCLOCK
        </button>
      </div>

      <div class="stress-sliders">
        <div class="stress-row">
          <span>AMBIENT TEMP: {stressConfig.ambientTempC}°C</span>
          <input
            type="range"
            min="-40"
            max="150"
            step="5"
            bind:value={stressConfig.ambientTempC}
          />
        </div>

        <div class="stress-row">
          <span>VOLTAGE SURGE: {stressConfig.voltageSurge.toFixed(1)}x</span>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            bind:value={stressConfig.voltageSurge}
            on:input={() => {
              if (stressConfig.voltageSurge > 1.8)
                stressConfig.burnoutEnabled = true;
            }}
          />
        </div>

        <div class="stress-row">
          <span>EMI / EMP NOISE: {stressConfig.emiNoiseV.toFixed(1)}V</span>
          <input
            type="range"
            min="0"
            max="2.5"
            step="0.1"
            bind:value={stressConfig.emiNoiseV}
          />
        </div>

        <div class="stress-row">
          <span>CLOCK OVERDRIVE: {stressConfig.clockOverdrive.toFixed(1)}x</span
          >
          <input
            type="range"
            min="0.5"
            max="4.0"
            step="0.25"
            bind:value={stressConfig.clockOverdrive}
          />
        </div>
      </div>
    </section>

    <section class="subpage-card">
      <div class="card-header">
        <span>COMPONENT THERMAL & LOAD TELEMETRY</span>
        <button
          class="action-pill fpga-pill"
          on:click={() => (activeSubpage = "circuit")}
        >
          VIEW CIRCUIT →
        </button>
      </div>

      <div class="stress-table">
        {#each components.filter((c) => c.type !== "GND") as comp (comp.id)}
          {@const cat = getCatalogItem(comp.type)}
          {@const pct = Math.min(
            150,
            Math.round((comp.stressRatio ?? 0) * 100),
          )}
          <div class="stress-item" class:blown-row={comp.blown}>
            <div class="stress-meta">
              <strong>{comp.label} ({comp.type})</strong>
              <span>
                {(comp.tempC ?? 25).toFixed(0)}°C · {formatElec(
                  comp.power,
                  "W",
                )} / {formatElec(cat.maxPowerW, "W")}
              </span>
              {#if comp.blown}
                <span class="blown-badge">{comp.failureReason ?? "BLOWN"}</span>
              {:else if comp.failureReason}
                <span class="overload-badge">{comp.failureReason}</span>
              {:else}
                <span class="stress-pct"
                  >{pct}% LOAD · {formatElec(comp.branchCurrent, "A")}</span
                >
              {/if}
            </div>
            <div class="stress-bar-bg">
              <div
                class="stress-bar-fill"
                style="width: {Math.min(
                  100,
                  pct,
                )}%; background-color: {comp.blown || pct > 100
                  ? '#C74440'
                  : pct > 75
                    ? '#FA7E19'
                    : '#388C46'}"
              ></div>
            </div>
          </div>
        {/each}
      </div>
    </section>
  </main>
{/if}

<!-- =========================================================================
     SUBPAGE 5: ACCESSIBLE ELECTRONICS & FPGA GLOSSARY
     ========================================================================= -->
{#if activeSubpage === "glossary"}
  <main class="glossary-page">
    <section class="fpga-explainer-card">
      <div class="card-header">
        <span>WHAT IS AN FPGA & HOW DOES IT WORK IN A CIRCUIT?</span>
        <button
          class="action-pill fpga-pill"
          on:click={() => {
            loadPresetById("fpga-adder");
            activeSubpage = "circuit";
          }}
        >
          TRY FPGA CIRCUIT
        </button>
      </div>
      <div class="fpga-explainer-body">
        <p>
          <strong>An FPGA (Field-Programmable Gate Array)</strong> is a blank-slate
          silicon chip whose internal wiring can be reprogrammed after it is manufactured.
          Unlike an Arduino (which runs software instructions one line at a time),
          an FPGA physically becomes the hardware circuit you design.
        </p>
        <p>
          <strong>How it works in the circuit diagram:</strong> Inside our FPGA
          block are tiny programmable memory tables called
          <strong>LUTs (Look-Up Tables)</strong>. The 4 input pins on the left (<strong
            >I0, I1, I2, I3</strong
          >) read live 0V (OFF) or 5V (ON) signals from your circuit. Those 4
          bits form a 4-bit address (0000 to 1111) that looks up the output in
          the FPGA's truth table and immediately drives the output pins on the
          right (<strong>Y0, Y1</strong>) to control LEDs, 7-segment displays,
          or other chips.
        </p>
      </div>
    </section>

    <section class="glossary-controls">
      <div class="ide-tabs">
        <button
          class="prof-btn"
          class:active={glossaryFilter === "all"}
          on:click={() => (glossaryFilter = "all")}>ALL</button
        >
        <button
          class="prof-btn"
          class:active={glossaryFilter === "analog"}
          on:click={() => (glossaryFilter = "analog")}>ANALOG</button
        >
        <button
          class="prof-btn"
          class:active={glossaryFilter === "digital"}
          on:click={() => (glossaryFilter = "digital")}>DIGITAL</button
        >
        <button
          class="prof-btn"
          class:active={glossaryFilter === "chips"}
          on:click={() => (glossaryFilter = "chips")}>CHIPS</button
        >
      </div>
      <input
        class="glossary-search"
        type="text"
        placeholder="Search components (e.g. resistor, transistor, fpga)..."
        bind:value={glossarySearch}
      />
    </section>

    <section class="glossary-grid">
      {#each CATALOG.filter((item) => (glossaryFilter === "all" || item.category === glossaryFilter) && (glossarySearch.trim() === "" || item.label
              .toLowerCase()
              .includes(glossarySearch.toLowerCase()) || item.tooltipTitle
              .toLowerCase()
              .includes(glossarySearch.toLowerCase()) || item.tooltipPhysics
              .toLowerCase()
              .includes(glossarySearch.toLowerCase()))) as item}
        {@const gInfo = GLOSSARY_INFO[item.type]}
        <div class="glossary-card">
          <div class="glossary-card-top">
            <span class="glossary-badge">{item.label}</span>
            <strong>{item.tooltipTitle}</strong>
            <button
              class="mini-pill"
              on:click={() => {
                addComponent(item.type);
                activeSubpage = "circuit";
              }}
            >
              + ADD
            </button>
          </div>
          <p class="glossary-desc">{item.tooltipPhysics}</p>
          <p class="glossary-desc">{gInfo?.plain ?? item.tooltipPhysics}</p>
          {#if gInfo?.analogy}
            <p class="glossary-analogy">
              <strong>Analogy:</strong>
              {gInfo.analogy}
            </p>
          {/if}
          {#if gInfo?.formulaHtml}
            <div class="math-pill">{@html gInfo.formulaHtml}</div>
          {/if}
          <div class="glossary-pins">
            {#each item.pins as pin}
              <span class="pin-chip"
                ><strong>{pin.label}</strong>: {pin.description}</span
              >
            {/each}
          </div>
        </div>
      {/each}
    </section>
  </main>
{/if}

<!-- =========================================================================
     SUBPAGE 6: ABOUT (Plain, Human-Readable)
     ========================================================================= -->
{#if activeSubpage === "about"}
  <main class="about-page">
    <section class="about-card">
      <h1>About CircuitFab</h1>
      <p>
        CircuitFab is a browser-based electronics lab built for students,
        hobbyists, and anyone curious about how hardware works. You can drop
        parts onto a grid, wire them together, and watch real physics update
        voltages, currents, and waveforms right away.
      </p>
      <p>
        Most circuit tools split analog electronics, microcontrollers, and FPGAs
        into separate apps. CircuitFab puts them on one board: you can wire
        resistors, capacitors, LEDs, and transistors alongside an Arduino Uno, a
        555 timer, or a programmable FPGA Look-Up Table, then flip into 3D to
        inspect the board or test what breaks in the Stress Lab.
      </p>
      <p>
        <strong>How to get started in 30 seconds:</strong>
        1) Click any part on the left (or pick a preset like <strong>UNO + NPN</strong> at the top).
        2) Drag from one white pin circle to another to draw a wire.
        3) Slide values on the left and watch live voltages, currents, and the <strong>3D PCB</strong> update—or switch to <strong>REALISTIC</strong> mode to test real-world burnout limits.
      </p>
      <div class="formula-grid">
        <div class="formula-box">
          <div class="formula-title">Ohm's Law</div>
          <div class="formula-math">V = I &middot; R</div>
          <div class="formula-note">Voltage (V) = Current (A) &times; Resistance (&Omega;)</div>
        </div>
        <div class="formula-box">
          <div class="formula-title">Electrical Power &amp; Heat</div>
          <div class="formula-math">P = V &middot; I = I<sup>2</sup> &middot; R</div>
          <div class="formula-note">1/4W resistors blow above 250 mW</div>
        </div>
        <div class="formula-box">
          <div class="formula-title">LED Resistor Sizing</div>
          <div class="formula-math">R = (V<sub>S</sub> &minus; V<sub>f</sub>) / I<sub>LED</sub></div>
          <div class="formula-note">(5 V &minus; 1.8 V) / 220 &Omega; = 14.5 mA (safe)</div>
        </div>
        <div class="formula-box">
          <div class="formula-title">Shockley Diode / LED</div>
          <div class="formula-math">I = I<sub>S</sub> &middot; (e<sup>V / nV<sub>T</sub></sup> &minus; 1)</div>
          <div class="formula-note">Exponential turn-on above V<sub>f</sub></div>
        </div>
      </div>
      <p>
        <strong>Primary use:</strong> learning electronics by experimenting—without
        needing to buy parts, install heavy desktop software, or worry about burning
        out real components.
      </p>
      <div class="about-actions">
        <button
          class="action-pill fpga-pill"
          on:click={() => (activeSubpage = "circuit")}
          >OPEN CIRCUIT BOARD</button
        >
        <button
          class="action-pill ic-pill"
          on:click={() => {
            loadPresetById("fpga-adder");
            activeSubpage = "circuit";
          }}
          >TRY INTERACTIVE FPGA DEMO →</button
        >
        <button
          class="action-pill ic-pill"
          on:click={() => (activeSubpage = "glossary")}>READ GLOSSARY</button
        >
      </div>
    </section>
  </main>
{/if}

<!-- STATUS TOAST -->
{#if statusToast}
  <div class="status-toast">{statusToast}</div>
{/if}

<!-- FLOATING HOVER TOOLTIP HUD (Calibri 15px+) -->
{#if hoverInfo}
  <div
    class="hover-hud"
    style="left: {Math.min(
      window.innerWidth - 340,
      hoverInfo.x + 16,
    )}px; top: {Math.min(window.innerHeight - 130, hoverInfo.y + 16)}px"
  >
    <div class="hud-title">{hoverInfo.title}</div>
    <div class="hud-detail">{hoverInfo.detail}</div>
    {#if hoverInfo.metrics}
      <div class="hud-metrics">{hoverInfo.metrics}</div>
    {/if}
  </div>
{/if}

<style>
  /* UNCLUTTERED PEACH BANNER */
  .peach-banner {
    height: 50px;
    background-color: var(--peach-banner);
    border-bottom: 1px solid var(--peach-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    gap: 6px;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .banner-left,
  .banner-right,
  .subpage-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .brand-pill {
    font-size: 16px;
    font-weight: 700;
    padding: 4px 8px;
    background-color: var(--bg-panel);
    border: 1.5px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .subpage-btn {
    padding: 5px 8px;
    font-size: 14px;
    font-weight: 700;
    background-color: var(--bg-panel);
    border: 1px solid var(--peach-border);
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .subpage-btn.active {
    background-color: var(--ink);
    color: #ffffff;
    border-color: var(--ink);
  }

  .tut-nav-btn {
    border-color: var(--green);
    color: var(--green);
  }

  .tut-nav-btn.active {
    background-color: var(--green);
    color: #ffffff;
    border-color: var(--green);
  }

  .alert-dot {
    background-color: var(--red);
    color: #ffffff;
    font-size: 15px;
    padding: 0 6px;
    border-radius: 99px;
  }

  .preset-select {
    padding: 4px 6px;
    font-size: 14px;
    font-weight: 700;
    border: 1px solid var(--peach-border);
    border-radius: 6px;
    background-color: var(--bg-panel);
  }

  .repair-pill {
    padding: 4px 8px;
    font-size: 14px;
    font-weight: 700;
    background-color: var(--red);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    white-space: nowrap;
  }

  .action-pill {
    padding: 6px 12px;
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
    border: none;
    border-radius: 6px;
  }

  .fpga-pill {
    background-color: var(--purple);
  }

  .ic-pill {
    background-color: var(--orange);
  }

  .ctrl-btn {
    min-width: 30px;
    height: 32px;
    padding: 0 7px;
    font-size: 14px;
    font-weight: 700;
    background-color: var(--bg-panel);
    border: 1px solid var(--peach-border);
    white-space: nowrap;
  }

  .ctrl-btn.active {
    background-color: var(--ink);
    color: #ffffff;
    border-color: var(--ink);
  }

  .ctrl-btn.danger:hover {
    background-color: var(--red);
    color: #ffffff;
    border-color: var(--red);
  }

  /* DESMOS WORKSPACE */
  .workspace {
    display: flex;
    width: 100vw;
    height: calc(100vh - 54px);
    overflow: hidden;
  }

  .desmos-sidebar {
    width: 350px;
    min-width: 350px;
    height: 100%;
    background-color: var(--bg-panel);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }

  .cat-bar {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-card);
  }

  .cat-bar button {
    border: none;
    border-right: 1px solid var(--border);
    border-radius: 0;
    padding: 10px 4px;
    font-size: 15px;
    font-weight: 700;
    background: transparent;
  }

  .cat-bar button:last-child {
    border-right: none;
  }

  .cat-bar button.active {
    background-color: var(--peach-banner);
    color: var(--ink);
  }

  .palette-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 10px;
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-card);
    max-height: 225px;
    overflow-y: auto;
  }

  .palette-tile {
    padding: 6px 4px;
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    cursor: grab;
  }

  .palette-tile:hover {
    background-color: var(--peach-banner);
    border-color: var(--ink);
  }

  .tile-drawing {
    display: block;
  }

  .custom-tile {
    border-width: 1.5px;
  }

  .tile-label {
    font-size: 15px;
    font-weight: 700;
  }

  /* DESMOS EXPRESSION CARDS */
  .expression-list {
    flex: 1;
    overflow-y: auto;
  }

  .expr-card {
    display: flex;
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-panel);
    min-height: 62px;
  }

  .expr-card.selected {
    background-color: #fff9f5;
  }

  .expr-card.blown-card {
    background-color: #fef2f2;
  }

  .expr-gutter {
    width: 34px;
    min-width: 34px;
    border: none;
    border-right: 1px solid var(--border);
    border-radius: 0;
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .expr-body {
    flex: 1;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
  }

  .expr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .expr-equation {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 16px;
    font-weight: 700;
  }

  .expr-val {
    color: var(--blue);
    font-size: 16px;
    font-weight: 700;
  }

  .blown-badge {
    background-color: var(--red);
    color: #ffffff;
    font-size: 15px;
    font-weight: 700;
    padding: 1px 8px;
    border-radius: 5px;
  }

  .overload-badge {
    background-color: var(--orange);
    color: #ffffff;
    font-size: 15px;
    font-weight: 700;
    padding: 1px 8px;
    border-radius: 5px;
  }

  .mini-repair-btn,
  .fix-pill-btn {
    background-color: var(--green);
    color: #ffffff;
    border: none;
    font-size: 15px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 5px;
    cursor: pointer;
  }

  .physics-mode-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .mode-select {
    border-color: var(--ink);
    background-color: #fff9f5;
  }

  .bit-toggle {
    padding: 2px 9px;
    font-size: 15px;
    font-weight: 700;
    border-radius: 5px;
    background-color: var(--bg-card);
  }

  .bit-toggle.high {
    background-color: var(--blue);
    color: #ffffff;
    border-color: var(--blue);
  }

  .fpga-tag {
    background-color: var(--purple);
    color: #ffffff;
    border-color: var(--purple);
  }

  .expr-right {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .telemetry-pill {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink-muted);
    background-color: var(--bg-card);
    padding: 2px 8px;
    border-radius: 5px;
  }

  .icon-action {
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
  }

  .slider-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .param2-label {
    font-size: 15px;
    color: var(--ink-muted);
    min-width: 85px;
  }

  /* CANVAS & INTERACTIVE TUTORIAL DOCK */
  .canvas-stage {
    flex: 1;
    height: 100%;
    position: relative;
    display: flex;
    background-color: var(--bg-canvas);
  }

  .pane-2d {
    flex: 1.25;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .pane-3d {
    flex: 1;
    height: 100%;
    position: relative;
    overflow: hidden;
    border-left: 1.5px solid var(--border);
  }

  /* GUIDED TUTORIAL DOCK AT TOP OF CANVAS */
  .tutorial-dock {
    position: absolute;
    top: 10px;
    left: 12px;
    right: 12px;
    z-index: 25;
    background-color: var(--bg-panel);
    border: 2px solid var(--green);
    border-radius: 10px;
    padding: 8px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tut-dock-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
  }

  .tut-lesson-tabs {
    display: flex;
    gap: 6px;
  }

  .lesson-tab {
    padding: 4px 10px;
    font-size: 15px;
    font-weight: 700;
    border-radius: 5px;
  }

  .lesson-tab.active {
    background-color: var(--green);
    color: #ffffff;
    border-color: var(--green);
  }

  .tut-dock-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .tut-step-text {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
  }

  .tut-step-text strong {
    color: var(--green);
    white-space: nowrap;
  }

  .auto-step-btn {
    padding: 6px 14px;
    font-size: 15px;
    font-weight: 700;
    background-color: var(--orange);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    white-space: nowrap;
  }

  .auto-step-btn:hover {
    background-color: #d9640b;
    color: #ffffff;
  }

  .canvas-top-bar {
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    z-index: 18;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    pointer-events: none;
  }

  .canvas-top-bar.shifted-down {
    top: 108px;
  }

  .canvas-top-pills {
    display: flex;
    gap: 6px;
    pointer-events: auto;
  }

  .selected-toolbar {
    background-color: var(--bg-panel);
    border: 1.5px solid var(--blue);
    border-radius: 8px;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    pointer-events: auto;
  }

  .sel-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--blue);
    padding: 0 6px;
  }

  .sel-btn {
    padding: 4px 9px;
    font-size: 15px;
    font-weight: 700;
    border-radius: 5px;
  }

  .danger-text {
    color: var(--red);
  }

  .mini-pill {
    padding: 5px 11px;
    font-size: 15px;
    font-weight: 700;
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .mini-pill.active {
    background-color: var(--blue);
    color: #ffffff;
    border-color: var(--blue);
  }

  .open-3d-tab {
    pointer-events: auto;
    padding: 7px 14px;
    font-size: 15.5px;
    font-weight: 700;
    background-color: var(--ink);
    color: #ffffff;
    border: none;
    border-radius: 6px;
  }

  .open-3d-tab:hover {
    background-color: var(--orange);
    color: #ffffff;
  }

  .canvas-3d {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
  }

  .canvas-3d:active {
    cursor: grabbing;
  }

  .controls-3d {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 5px;
    background-color: var(--bg-panel);
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .controls-3d button {
    border: none;
    padding: 4px 10px;
    font-size: 15px;
    font-weight: 700;
  }

  .close-3d-btn {
    background-color: var(--ink) !important;
    color: #ffffff !important;
    border-radius: 5px !important;
  }

  .inspector-3d {
    position: absolute;
    bottom: 16px;
    left: 16px;
    max-width: 310px;
    background-color: var(--bg-panel);
    border: 1.5px solid var(--blue);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 20;
  }

  .insp-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 15.5px;
  }

  .insp-desc {
    font-size: 15px;
    line-height: 1.35;
    color: var(--ink-muted);
  }

  .insp-metrics {
    display: flex;
    gap: 10px;
    font-size: 15px;
    font-weight: 700;
    color: var(--blue);
  }

  /* SUBPAGE FULL-SCREEN 2-COLUMN LAYOUT */
  .subpage-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 16px;
    width: 100vw;
    height: calc(100vh - 54px);
    background-color: var(--bg-canvas);
    overflow-y: auto;
  }

  .subpage-card {
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 17px;
    font-weight: 700;
    background-color: var(--peach-banner);
    padding: 9px 14px;
    border-radius: 6px;
  }

  .ide-tabs {
    display: flex;
    gap: 6px;
  }

  .code-editor {
    flex: 1;
    min-height: 290px;
    width: 100%;
    padding: 12px;
    font-family: "Calibri", "Carlito", monospace;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.45;
    background-color: #1f2328;
    color: #f0f3f6;
    border: 1px solid var(--border);
    border-radius: 8px;
    resize: none;
    user-select: text;
  }

  .compiler-status {
    padding: 9px 12px;
    background-color: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 15px;
    font-weight: 700;
    color: var(--green);
  }

  .reg-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .reg-box {
    background-color: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .reg-name {
    font-size: 15px;
    color: var(--ink-muted);
    font-weight: 700;
  }

  .reg-val {
    font-size: 18px;
    font-weight: 700;
    color: var(--blue);
  }

  /* STRESS LAB */
  .stress-sliders {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 4px;
  }

  .stress-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 16px;
    font-weight: 700;
  }

  .stress-table {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
  }

  .stress-item {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background-color: var(--bg-card);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .stress-item.blown-row {
    background-color: #fef2f2;
    border-color: var(--red);
  }

  .stress-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 15.5px;
  }

  .stress-pct {
    font-size: 15px;
    font-weight: 700;
    color: var(--ink-muted);
  }

  .stress-bar-bg {
    width: 100%;
    height: 8px;
    background-color: var(--border);
    border-radius: 4px;
    overflow: hidden;
  }

  .stress-bar-fill {
    height: 100%;
    transition: width 0.15s ease;
  }

  .step-dots {
    display: flex;
    gap: 6px;
  }

  .step-dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background-color: var(--border);
  }

  .step-dot.current {
    background-color: var(--orange);
  }

  .step-dot.done {
    background-color: var(--green);
  }

  .schematic-svg {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
  }

  .schematic-svg:active {
    cursor: grabbing;
  }

  .comp-group {
    cursor: move;
  }

  .pin-pad {
    cursor: crosshair;
  }

  .wire-hit {
    cursor: pointer;
  }

  .zoom-controls {
    position: absolute;
    bottom: 16px;
    left: 16px;
    display: flex;
    gap: 4px;
    background-color: var(--bg-panel);
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .zoom-controls button {
    border: none;
    padding: 5px 11px;
    font-size: 15px;
    font-weight: 700;
  }

  .scope-card {
    position: absolute;
    bottom: 16px;
    right: 16px;
    width: 342px;
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 15;
    transition: right 0.18s ease;
  }

  .scope-card.over-2d {
    right: calc(44.5% + 16px);
  }

  .scope-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .scope-traces {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .trace-pill {
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 5px;
  }

  .chip-preview-box {
    background-color: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
  }

  .profile-row,
  .template-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .prof-btn {
    padding: 8px 10px;
    font-size: 15px;
    font-weight: 700;
  }

  .prof-btn.active {
    background-color: var(--peach-banner);
    border-color: var(--ink);
  }

  .lut-grid {
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .lut-head {
    display: grid;
    grid-template-columns: 1fr 90px 90px;
    background-color: var(--bg-card);
    padding: 6px 12px;
    font-size: 15px;
    font-weight: 700;
    border-bottom: 1px solid var(--border);
  }

  .lut-rows {
    max-height: 220px;
    overflow-y: auto;
  }

  .lut-row {
    display: grid;
    grid-template-columns: 1fr 90px 90px;
    align-items: center;
    padding: 4px 12px;
    border-bottom: 1px solid var(--border);
    font-size: 15px;
  }

  .lut-row.active-addr {
    background-color: #fff4ec;
  }

  .addr-bits {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.08em;
  }

  .lut-cell {
    width: 54px;
    height: 28px;
    font-size: 15px;
    font-weight: 700;
    background-color: var(--bg-card);
  }

  .lut-cell.one {
    background-color: var(--blue);
    color: #ffffff;
    border-color: var(--blue);
  }

  .foundry-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .foundry-row input[type="text"] {
    flex: 1;
    padding: 7px 10px;
    font-size: 16px;
    font-weight: 700;
  }

  .color-swatches {
    display: flex;
    gap: 5px;
  }

  .swatch-btn {
    width: 22px;
    height: 22px;
    border-radius: 50%;
  }

  .swatch-btn.active {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* GLOSSARY SUBPAGE */
  .glossary-page {
    padding: 16px;
    width: 100vw;
    height: calc(100vh - 54px);
    background-color: var(--bg-canvas);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .fpga-explainer-card {
    background-color: var(--bg-panel);
    border: 1.5px solid var(--purple);
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .fpga-explainer-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 16px;
    line-height: 1.45;
  }

  .glossary-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .glossary-search {
    flex: 1;
    min-width: 260px;
    padding: 8px 12px;
    font-size: 15.5px;
    border: 1px solid var(--border);
    border-radius: 6px;
    user-select: text;
  }

  .glossary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 12px;
  }

  .glossary-card {
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .glossary-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 16px;
  }

  .glossary-badge {
    background-color: var(--peach-banner);
    padding: 2px 8px;
    border-radius: 5px;
    font-size: 15px;
    font-weight: 700;
  }

  .glossary-desc {
    font-size: 15.5px;
    line-height: 1.4;
    color: var(--ink-muted);
  }

  .glossary-analogy {
    font-size: 15px;
    line-height: 1.4;
    color: var(--ink);
  }

  .math-pill {
    background-color: #f4f5f7;
    border-left: 3px solid var(--blue);
    padding: 5px 10px;
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
    border-radius: 4px;
  }

  .glossary-pins {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pin-chip {
    background-color: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 2px 8px;
    font-size: 15px;
  }

  .export-wrap {
    position: relative;
  }

  .export-menu {
    position: absolute;
    top: 40px;
    right: 0;
    z-index: 80;
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 165px;
  }

  .export-menu button {
    border: none;
    text-align: left;
    padding: 6px 10px;
    font-size: 15px;
  }

  .ai-bar {
    position: absolute;
    bottom: 16px;
    left: 155px;
    right: 374px;
    z-index: 16;
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: var(--bg-panel);
    border: 1.5px solid var(--ink);
    border-radius: 8px;
    padding: 5px 8px;
  }

  .ai-bar input {
    flex: 1;
    border: none;
    padding: 4px 8px;
    font-size: 15px;
    user-select: text;
  }

  .ai-bar button {
    padding: 4px 12px;
    background-color: var(--ink);
    color: #ffffff;
    border: none;
    border-radius: 5px;
    font-size: 15px;
    font-weight: 700;
  }

  .status-toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 120;
    background-color: var(--ink);
    color: var(--peach-banner);
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 15.5px;
    font-weight: 700;
  }

  .ai-modes {
    display: flex;
    gap: 3px;
  }

  .ai-modes button {
    padding: 3px 7px;
    font-size: 15px;
    font-weight: 700;
    border: 1px solid var(--border);
    background-color: var(--bg-card);
    color: var(--ink);
  }

  .ai-modes button.active {
    background-color: var(--blue);
    color: #ffffff;
    border-color: var(--blue);
  }

  .ai-ask-btn {
    padding: 4px 12px;
    background-color: var(--ink);
    color: #ffffff;
    border: none;
    border-radius: 5px;
    font-size: 15px;
    font-weight: 700;
  }

  .ai-reply-card {
    position: absolute;
    bottom: 66px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 22;
    width: min(520px, calc(100% - 380px));
    background-color: var(--bg-panel);
    border: 1.5px solid var(--blue);
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ai-reply-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 16px;
  }

  .ai-reply-body {
    font-size: 15px;
    line-height: 1.45;
    color: var(--ink-muted);
  }

  .stress-3d-box {
    height: 230px;
    min-height: 230px;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background-color: #f0f2f5;
  }

  .about-page {
    padding: 28px;
    width: 100vw;
    height: calc(100vh - 54px);
    background-color: var(--bg-canvas);
    overflow-y: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  .about-card {
    max-width: 720px;
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .about-card h1 {
    font-size: 24px;
    font-weight: 700;
  }

  .about-card p {
    font-size: 16px;
    line-height: 1.55;
    color: var(--ink);
  }

  .about-actions {
    display: flex;
    gap: 10px;
    margin-top: 6px;
  }

  .formula-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin: 4px 0;
  }

  .formula-box {
    background-color: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 3.5px solid var(--blue);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .formula-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink-muted);
    text-transform: uppercase;
  }

  .formula-math {
    font-family: "Cambria Math", "Times New Roman", Georgia, serif;
    font-size: 19px;
    font-weight: 700;
    color: var(--ink);
  }

  .formula-note {
    font-size: 14px;
    color: var(--ink-muted);
  }

  /* HOVER TOOLTIP HUD */
  .hover-hud {
    position: fixed;
    z-index: 100;
    max-width: 320px;
    background-color: var(--ink);
    color: #ffffff;
    border-radius: 8px;
    padding: 10px 12px;
    pointer-events: none;
  }

  .hud-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--peach-banner);
    margin-bottom: 4px;
  }

  .hud-detail {
    font-size: 15px;
    line-height: 1.35;
    color: #f0f3f6;
  }

  .hud-metrics {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #3b434b;
    font-size: 15px;
    font-weight: 700;
    color: #56d364;
  }

  /* MOBILE & TABLET RESPONSIVE LAYOUT */
  @media (max-width: 820px) {
    .peach-banner {
      height: auto;
      min-height: 48px;
      padding: 6px 8px;
      gap: 6px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .peach-banner::-webkit-scrollbar {
      display: none;
    }

    .workspace {
      flex-direction: column-reverse;
      height: calc(100vh - 50px);
    }

    .desmos-sidebar {
      width: 100%;
      min-width: 0;
      height: 42vh;
      border-right: none;
      border-top: 1.5px solid var(--border);
    }

    .palette-grid {
      grid-template-columns: repeat(4, 1fr);
      max-height: 132px;
      padding: 6px;
      gap: 5px;
    }

    .canvas-stage {
      flex: 1;
      min-height: 50vh;
      flex-direction: column;
    }

    .canvas-top-bar {
      top: 6px;
      left: 6px;
      right: 6px;
      gap: 4px;
    }

    .canvas-top-pills {
      flex-wrap: wrap;
      gap: 4px;
    }

    .mini-pill,
    .sel-btn,
    .open-3d-tab {
      padding: 4px 8px;
      font-size: 13.5px;
    }

    .ai-bar {
      left: 8px;
      right: 8px;
      bottom: 8px;
      padding: 4px 6px;
      flex-wrap: wrap;
      gap: 4px;
    }

    .ai-bar input {
      min-width: 110px;
    }

    .ai-reply-card {
      width: calc(100% - 16px);
      bottom: 62px;
      max-height: 36vh;
      overflow-y: auto;
    }

    .zoom-controls {
      bottom: 62px;
      left: 8px;
    }

    .scope-card,
    .scope-card.over-2d {
      width: min(220px, calc(100% - 115px));
      bottom: 62px;
      right: 8px;
      padding: 6px;
      gap: 4px;
    }

    .scope-card canvas {
      height: 76px;
    }

    .tut-dock-body {
      flex-wrap: wrap;
      gap: 6px;
    }

    .subpage-grid {
      grid-template-columns: 1fr;
      height: auto;
      min-height: calc(100vh - 50px);
      padding: 10px;
      gap: 12px;
    }

    .physics-mode-row {
      grid-template-columns: 1fr;
    }

    .glossary-page {
      padding: 10px;
      height: auto;
      min-height: calc(100vh - 50px);
    }

    .glossary-grid {
      grid-template-columns: 1fr;
    }

    .about-page {
      padding: 12px;
      height: auto;
      min-height: calc(100vh - 50px);
    }

    .about-card {
      padding: 16px;
    }

    .about-actions {
      flex-wrap: wrap;
    }
  }
</style>
