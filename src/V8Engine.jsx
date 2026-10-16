import React, { useState, useEffect, useRef } from 'react';
import { Box, Grid3x3, Layers, Orbit, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import * as THREE from 'three';

function SquareRange({ min, max, step, value, label, onChange }) {
  const pct = ((Number(value) - min) / (max - min)) * 100;
  return (
    <div className="relative flex h-8 items-center">
      <span className="pointer-events-none absolute top-1/2 right-0 left-0 h-2 -translate-y-1/2 bg-[#d5dce3]" />
      <span
        className="pointer-events-none absolute top-1/2 left-0 h-2 -translate-y-1/2 bg-[#fb6514]"
        style={{ width: `calc(${pct / 100} * (100% - 16px) + 8px)` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={onChange}
        className="square-range relative z-10 h-8 w-full cursor-pointer"
      />
    </div>
  );
}

// ============================================================================
// 5.0L CROSSPLANE 90° V8 ENGINE SPECIFICATIONS (FIRING: 1-8-4-3-6-5-7-2)
// ============================================================================
// 90° V-Angle, Crossplane Crankshaft (4 throws at 0°, 90°, 270°, 180°):
// 8 Cylinders firing every 90° of crankshaft rotation (720° / 8 = 90°):
//   Cyl 1: 0°    (0 rad)       [Left Bank, Front]
//   Cyl 8: 90°   (π/2 rad)     [Right Bank, Rear]
//   Cyl 4: 180°  (π rad)       [Right Bank, Mid-Front]
//   Cyl 3: 270°  (3π/2 rad)    [Left Bank, Mid-Front]
//   Cyl 6: 360°  (2π rad)      [Right Bank, Mid-Rear]
//   Cyl 5: 450°  (5π/2 rad)    [Left Bank, Mid-Rear]
//   Cyl 7: 540°  (3π rad)      [Left Bank, Rear]
//   Cyl 2: 630°  (7π/2 rad)    [Right Bank, Front]
const V8_SPECS = {
  crankRadius: 0.75,          // 86.0 mm stroke
  rodLength: 2.38,            // Forged H-beam connecting rod
  pistonRadius: 0.70,         // 96.0 mm bore (5.0L displacement)
  pistonHeight: 0.82,
  boreSpacing: 1.75,          // Z distance between the 4 journal pairs
  bankOffset: 0.36,           // Z offset between left and right rod big-ends on the shared crankpins
  vAngle: Math.PI / 4,        // 45° from vertical (90° total V-angle)
  displacementL: '5.0',
  compressionRatio: '11.0 : 1',
  firingOrder: [1, 8, 4, 3, 6, 5, 7, 2],
  journalAngles: [0, Math.PI / 2, (3 * Math.PI) / 2, Math.PI],
  // Firing angles for Cylinders 1 through 8
  firingAngles: [
    0,                        // Cyl 1: 0°
    (7 * Math.PI) / 2,        // Cyl 2: 630°
    (3 * Math.PI) / 2,        // Cyl 3: 270°
    Math.PI,                  // Cyl 4: 180°
    (5 * Math.PI) / 2,        // Cyl 5: 450°
    2 * Math.PI,              // Cyl 6: 360°
    3 * Math.PI,              // Cyl 7: 540°
    Math.PI / 2               // Cyl 8: 90°
  ]
};

export default function V8Engine({ theme = 'dark' }) {
  const mountRef = useRef(null);

  const [rpm, setRpm] = useState(800);
  const [isPlaying, setIsPlaying] = useState(true);
  const [manualDeg, setManualDeg] = useState(0);
  const [renderMode, setRenderMode] = useState('realistic');
  const [exploded, setExploded] = useState(0);
  const [blockOpacity, setBlockOpacity] = useState(0.28);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [showBlock, setShowBlock] = useState(true);
  const [showHeadsAndValves, setShowHeadsAndValves] = useState(true);
  const [showIntakeAndHeaders, setShowIntakeAndHeaders] = useState(true);
  const [showGasAndCombustion, setShowGasAndCombustion] = useState(true);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Live Telemetry States
  const [activeCylinderInfo, setActiveCylinderInfo] = useState(1);
  const [crankDeg, setCrankDeg] = useState(0);

  const crankThetaRef = useRef(0);

  const simParams = useRef({
    theme,
    rpm: 800,
    isPlaying: true,
    manualDeg: 0,
    renderMode: 'realistic',
    exploded: 0,
    blockOpacity: 0.28,
    cutawayMode: true,
    showBlock: true,
    showHeadsAndValves: true,
    showIntakeAndHeaders: true,
    showGasAndCombustion: true,
    autoRotateCam: false
  });

  const sceneElements = useRef({
    scene: null,
    gridHelper: null,
    ambientLight: null,
    rimLight1: null,
    rimLight2: null
  });

  const camControl = useRef({
    isDragging: false,
    isPanning: false,
    prevX: 0,
    prevY: 0,
    theta: 0.65,
    phi: 1.15,
    radius: 13.8,
    target: new THREE.Vector3(0, 1.25, 0)
  });

  useEffect(() => {
    simParams.current = {
      theme,
      rpm,
      isPlaying,
      manualDeg,
      renderMode,
      exploded,
      blockOpacity,
      cutawayMode,
      showBlock,
      showHeadsAndValves,
      showIntakeAndHeaders,
      showGasAndCombustion,
      autoRotateCam
    };

    const { scene, gridHelper, ambientLight, rimLight1, rimLight2 } = sceneElements.current;
    if (scene) {
      if (theme === 'light') {
        scene.background.setHex(0xf8fafc);
        if (ambientLight) {
          ambientLight.color.setHex(0xffffff);
          ambientLight.intensity = 0.88;
        }
        if (gridHelper) {
          gridHelper.material.color.setHex(0x94a3b8);
        }
        if (rimLight1) rimLight1.intensity = 0.85;
        if (rimLight2) rimLight2.intensity = 0.75;
      } else {
        scene.background.setHex(0x101828);
        if (ambientLight) {
          ambientLight.color.setHex(0xdbeafe);
          ambientLight.intensity = 0.62;
        }
        if (gridHelper) {
          gridHelper.material.color.setHex(0x344054);
        }
        if (rimLight1) rimLight1.intensity = 1.15;
        if (rimLight2) rimLight2.intensity = 0.9;
      }
    }
  }, [
    theme,
    rpm,
    isPlaying,
    manualDeg,
    renderMode,
    exploded,
    blockOpacity,
    cutawayMode,
    showBlock,
    showHeadsAndValves,
    showIntakeAndHeaders,
    showGasAndCombustion,
    autoRotateCam
  ]);

  const handleManualAngleChange = (val) => {
    const deg = ((val % 720) + 720) % 720;
    setManualDeg(deg);
    setCrankDeg(Math.round(deg));
    setIsPlaying(false);
    crankThetaRef.current = (deg * Math.PI) / 180;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const isInitialDark = simParams.current.theme === 'dark';
    scene.background = new THREE.Color(isInitialDark ? 0x101828 : 0xf8fafc);
    sceneElements.current.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ------------------------------------------------------------------------
    // 1. STUDIO LIGHTING & FLOOR GRID
    // ------------------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(
      isInitialDark ? 0xdbeafe : 0xffffff,
      isInitialDark ? 0.62 : 0.88
    );
    scene.add(ambientLight);
    sceneElements.current.ambientLight = ambientLight;

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.3);
    keyLight.position.set(11, 16, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const rimLight1 = new THREE.DirectionalLight(0x38bdf8, isInitialDark ? 1.15 : 0.85);
    rimLight1.position.set(14, 6, -10);
    scene.add(rimLight1);
    sceneElements.current.rimLight1 = rimLight1;

    const rimLight2 = new THREE.DirectionalLight(0xf97316, isInitialDark ? 0.95 : 0.75);
    rimLight2.position.set(-14, 5, 10);
    scene.add(rimLight2);
    sceneElements.current.rimLight2 = rimLight2;

    const exhaustHeatLight = new THREE.PointLight(0xff4500, 0, 7.5, 1.5);
    exhaustHeatLight.position.set(0, 0.5, -3.2);
    scene.add(exhaustHeatLight);

    const gridHelper = new THREE.GridHelper(34, 34, isInitialDark ? 0x334155 : 0x94a3b8, isInitialDark ? 0x1e293b : 0xcbd5e1);
    gridHelper.position.y = -2.6;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.42;
    scene.add(gridHelper);
    sceneElements.current.gridHelper = gridHelper;

    // ------------------------------------------------------------------------
    // 2. PBR MATERIALS & WIREFRAME SHADING REGISTRY
    // ------------------------------------------------------------------------
    const realisticMats = {
      crank: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.88, roughness: 0.2 }),
      counterweight: new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.78, roughness: 0.32 }),
      pin: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.12 }),
      rod: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.82, roughness: 0.26 }),
      piston: new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.85, roughness: 0.2 }),
      pistonRing: new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.96, roughness: 0.1 }),
      oilRing: new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.88, roughness: 0.2 }),
      valveIntake: new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.78, roughness: 0.22 }),
      valveExhaust: new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.78, roughness: 0.22 }),
      camshaft: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.86, roughness: 0.2 }),
      valveCoverOrange: new THREE.MeshStandardMaterial({ color: 0xe05307, metalness: 0.52, roughness: 0.26 }),
      trumpetChrome: new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.96, roughness: 0.08 }),
      flywheel: new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.82, roughness: 0.28 }),
      oilPan: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.72, roughness: 0.34 }),
      exhaustHeader: new THREE.MeshStandardMaterial({
        color: 0x9a3412,
        metalness: 0.78,
        roughness: 0.3,
        emissive: 0x7c2d12,
        emissiveIntensity: 0.15
      }),
      block: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.3,
        roughness: 0.25,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      liner: new THREE.MeshPhysicalMaterial({
        color: 0x64748b,
        metalness: 0.55,
        roughness: 0.25,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      headCast: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.35,
        roughness: 0.25,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    };

    const rawSolidMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.15, roughness: 0.55 });
    const rawBlockMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.1,
      roughness: 0.6,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const wireframePrimaryMat = new THREE.MeshBasicMaterial({ color: 0xfb6514, wireframe: true });
    const wireframeBlockMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.25
    });

    const trackedMeshes = [];
    const registerMesh = (mesh, type, includeWire = true) => {
      const baseMat = realisticMats[type] || realisticMats.crank;
      mesh.material = baseMat;
      const isTranslucent = type === 'block' || type === 'liner' || type === 'headCast';
      mesh.castShadow = !isTranslucent;
      mesh.receiveShadow = true;

      let wireOverlay = null;
      if (includeWire) {
        const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
        const wireMat = new THREE.LineBasicMaterial({
          color: 0xfb6514,
          transparent: true,
          opacity: isTranslucent ? 0.18 : 0.35
        });
        wireOverlay = new THREE.LineSegments(wireGeo, wireMat);
        wireOverlay.visible = false;
        mesh.add(wireOverlay);
      }

      trackedMeshes.push({ mesh, type, baseMat, wireOverlay });
      return mesh;
    };

    // Soft-Glow Volumetric Particle Texture Generator
    const createSoftGlowTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.18, 'rgba(255, 255, 255, 0.88)');
      grad.addColorStop(0.48, 'rgba(255, 255, 255, 0.32)');
      grad.addColorStop(0.78, 'rgba(255, 255, 255, 0.08)');
      grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    };

    const glowTexture = createSoftGlowTexture();

    const engineRoot = new THREE.Group();
    scene.add(engineRoot);

    const {
      crankRadius: r,
      rodLength: L,
      pistonRadius: pR,
      pistonHeight: pH,
      boreSpacing,
      bankOffset,
      vAngle
    } = V8_SPECS;

    const zStart = -2.625;

    // ------------------------------------------------------------------------
    // 3. CROSSPLANE 90° CRANKSHAFT & FLYWHEEL
    // ------------------------------------------------------------------------
    const crankshaftGroup = new THREE.Group();
    engineRoot.add(crankshaftGroup);

    // 5 Main Bearing Journals
    for (let i = 0; i < 5; i++) {
      const zPos = zStart - 0.875 + i * boreSpacing;
      const mainJournalGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.44, 24);
      mainJournalGeo.rotateX(Math.PI / 2);
      const mainJournal = registerMesh(new THREE.Mesh(mainJournalGeo), 'crank');
      mainJournal.position.set(0, 0, zPos);
      crankshaftGroup.add(mainJournal);
    }

    // Sculpted Crossplane Counterweight Shape
    const cwShape = new THREE.Shape();
    cwShape.moveTo(-0.34, 0.15);
    cwShape.lineTo(-0.26, r + 0.18);
    cwShape.absarc(0, r, 0.26, Math.PI, 0, true);
    cwShape.lineTo(0.34, 0.15);
    cwShape.bezierCurveTo(0.68, -0.05, 0.88, -0.38, 0.76, -0.74);
    cwShape.absarc(0, -0.74, 0.76, 0, Math.PI, true);
    cwShape.bezierCurveTo(-0.88, -0.38, -0.68, -0.05, -0.34, 0.15);

    const cwGeo = new THREE.ExtrudeGeometry(cwShape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02
    });
    cwGeo.translate(0, 0, -0.075);

    // 4 Crossplane Crankpins (0°, 90°, 270°, 180°)
    for (let i = 0; i < 4; i++) {
      const zCenter = zStart + i * boreSpacing;
      const pinAngle = V8_SPECS.journalAngles[i];
      const pinX = r * Math.sin(pinAngle);
      const pinY = r * Math.cos(pinAngle);

      const pinGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.95, 24);
      pinGeo.rotateX(Math.PI / 2);
      const pinMesh = registerMesh(new THREE.Mesh(pinGeo), 'pin');
      pinMesh.position.set(pinX, pinY, zCenter);
      crankshaftGroup.add(pinMesh);

      [-0.56, 0.56].forEach((zOff) => {
        const webGroup = new THREE.Group();
        webGroup.position.set(0, 0, zCenter + zOff);
        webGroup.rotation.z = -pinAngle;
        const cwMesh = registerMesh(new THREE.Mesh(cwGeo), 'counterweight');
        webGroup.add(cwMesh);
        crankshaftGroup.add(webGroup);
      });
    }

    // Rear Dual-Mass Flywheel
    const flywheelGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.28, 36);
    flywheelGeo.rotateX(Math.PI / 2);
    const flywheelMesh = registerMesh(new THREE.Mesh(flywheelGeo), 'flywheel');
    flywheelMesh.position.set(0, 0, -4.15);
    crankshaftGroup.add(flywheelMesh);

    // Front Harmonic Damper & Pulley
    const damperGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.36, 28);
    damperGeo.rotateX(Math.PI / 2);
    const damperMesh = registerMesh(new THREE.Mesh(damperGeo), 'flywheel');
    damperMesh.position.set(0, 0, 3.95);
    crankshaftGroup.add(damperMesh);

    // ------------------------------------------------------------------------
    // 4. 8 PISTONS, FORGED RODS, CUTAWAY LINERS & 16 DOHC VALVES
    // ------------------------------------------------------------------------
    const cylindersData = [];
    const blockGroup = new THREE.Group();
    const headLeftGroup = new THREE.Group();
    const headRightGroup = new THREE.Group();
    const intakeGroup = new THREE.Group();
    const exhaustGroup = new THREE.Group();
    const gasGroup = new THREE.Group();

    engineRoot.add(blockGroup, headLeftGroup, headRightGroup, intakeGroup, exhaustGroup, gasGroup);

    // Reusable Piston, Liner & Spring Geometries
    const crownGeo = new THREE.CylinderGeometry(pR, pR, pH * 0.56, 32);
    crownGeo.translate(0, pH * 0.24, 0);
    const skirtGeo = new THREE.CylinderGeometry(pR * 0.96, pR * 0.94, pH * 0.44, 28);
    skirtGeo.translate(0, -pH * 0.2, 0);
    const wristPinGeo = new THREE.CylinderGeometry(0.16, 0.16, pR * 1.68, 20);
    wristPinGeo.rotateX(Math.PI / 2);

    const topRingGeo = new THREE.TorusGeometry(pR + 0.01, 0.016, 10, 32);
    topRingGeo.rotateX(Math.PI / 2);

    // Forged H-Beam Connecting Rod Geometry
    const bigEndGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 24);
    bigEndGeo.rotateX(Math.PI / 2);
    const smallEndGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.28, 20);
    smallEndGeo.rotateX(Math.PI / 2);
    smallEndGeo.translate(0, L, 0);

    const rodBeamShape = new THREE.Shape();
    rodBeamShape.moveTo(-0.24, 0.22);
    rodBeamShape.quadraticCurveTo(-0.13, L * 0.5, -0.16, L - 0.15);
    rodBeamShape.lineTo(0.16, L - 0.15);
    rodBeamShape.quadraticCurveTo(0.13, L * 0.5, 0.24, 0.22);
    rodBeamShape.closePath();
    const rodBeamGeo = new THREE.ExtrudeGeometry(rodBeamShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018
    });
    rodBeamGeo.translate(0, 0, -0.06);

    const linerHeight = 2.45;
    const fullLinerGeo = new THREE.CylinderGeometry(pR + 0.05, pR + 0.05, linerHeight, 28, 1, true);
    // Cutaway reveals front/outer face of the cylinder
    const cutLinerGeo = new THREE.CylinderGeometry(pR + 0.05, pR + 0.05, linerHeight, 28, 1, true, Math.PI * 0.75, Math.PI * 1.35);

    const fullJacketGeo = new THREE.CylinderGeometry(pR + 0.32, pR + 0.29, linerHeight + 0.1, 28, 1, false);
    const cutJacketGeo = new THREE.CylinderGeometry(pR + 0.32, pR + 0.29, linerHeight + 0.1, 28, 1, false, Math.PI * 0.72, Math.PI * 1.42);

    const maxStrokeDist = r + L + pH * 0.5;

    // Helical Valve Spring Geometry
    const springPts = [];
    for (let s = 0; s <= 45; s++) {
      const t = s / 45;
      const ang = t * 5 * Math.PI * 2;
      springPts.push(new THREE.Vector3(Math.cos(ang) * 0.09, 0.12 + t * 0.42, Math.sin(ang) * 0.09));
    }
    const valveSpringGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPts), 36, 0.018, 8, false);

    // Build all 8 Cylinders (4 Left Bank on +vAngle, 4 Right Bank on -vAngle)
    for (let i = 0; i < 4; i++) {
      const zCenter = zStart + i * boreSpacing;
      const banks = [
        { side: 'L', cylNumber: i * 2 + 1, bankAngle: vAngle, zOffset: -bankOffset * 0.5 },
        { side: 'R', cylNumber: i * 2 + 2, bankAngle: -vAngle, zOffset: bankOffset * 0.5 }
      ];

      banks.forEach((bankInfo) => {
        const zPos = zCenter + bankInfo.zOffset;
        const bAngle = bankInfo.bankAngle;
        const axisDir = new THREE.Vector2(-Math.sin(bAngle), Math.cos(bAngle));
        const targetHead = bankInfo.side === 'L' ? headLeftGroup : headRightGroup;

        // A. Piston Assembly
        const pistonGroup = new THREE.Group();
        pistonGroup.rotation.z = bAngle;
        engineRoot.add(pistonGroup);

        pistonGroup.add(registerMesh(new THREE.Mesh(crownGeo), 'piston'));
        pistonGroup.add(registerMesh(new THREE.Mesh(skirtGeo), 'piston'));
        pistonGroup.add(registerMesh(new THREE.Mesh(wristPinGeo), 'pin'));

        [0.42, 0.32, 0.22].forEach((ry, rIdx) => {
          const ring = registerMesh(new THREE.Mesh(topRingGeo), rIdx === 2 ? 'oilRing' : 'pistonRing', false);
          ring.position.y = ry;
          pistonGroup.add(ring);
        });

        // B. Connecting Rod Assembly
        const rodGroup = new THREE.Group();
        engineRoot.add(rodGroup);
        rodGroup.add(registerMesh(new THREE.Mesh(bigEndGeo), 'rod'));
        rodGroup.add(registerMesh(new THREE.Mesh(rodBeamGeo), 'rod'));
        rodGroup.add(registerMesh(new THREE.Mesh(smallEndGeo), 'rod'));

        // C. Cylinder Liner & Cast Water Jacket Barrel
        const cylBankGroup = new THREE.Group();
        cylBankGroup.rotation.z = bAngle;
        blockGroup.add(cylBankGroup);

        const linerMesh = registerMesh(new THREE.Mesh(fullLinerGeo), 'liner');
        linerMesh.position.set(0, r + L - 0.35, zPos);
        cylBankGroup.add(linerMesh);

        const jacketMesh = registerMesh(new THREE.Mesh(fullJacketGeo), 'block');
        jacketMesh.position.set(0, r + L - 0.32, zPos);
        cylBankGroup.add(jacketMesh);

        // D. Cylinder Head & DOHC Valves
        const headSubGroup = new THREE.Group();
        headSubGroup.rotation.z = bAngle;
        targetHead.add(headSubGroup);

        // Intake Valve (facing inside valley) & Exhaust Valve (facing outside)
        const createValve = (xOff, isIntake) => {
          const vg = new THREE.Group();
          vg.position.set(xOff, maxStrokeDist + 0.44, zPos);
          vg.rotation.z = isIntake ? 0.22 : -0.22;

          const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.72, 12);
          stemGeo.translate(0, 0.34, 0);
          const stemMesh = registerMesh(new THREE.Mesh(stemGeo), isIntake ? 'valveIntake' : 'valveExhaust', false);
          const discGeo = new THREE.CylinderGeometry(0.22, 0.07, 0.07, 20);
          const discMesh = registerMesh(new THREE.Mesh(discGeo), isIntake ? 'valveIntake' : 'valveExhaust');
          vg.add(stemMesh, discMesh);

          const springMesh = registerMesh(new THREE.Mesh(valveSpringGeo), 'crank', false);
          springMesh.position.copy(vg.position);
          springMesh.rotation.copy(vg.rotation);
          headSubGroup.add(springMesh);

          headSubGroup.add(vg);
          return vg;
        };

        const intakeValve = createValve(0.26, true);
        const exhaustValve = createValve(-0.26, false);

        // Spark Plug & Pencil Coil
        const plugGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.65, 12);
        const plugMesh = registerMesh(new THREE.Mesh(plugGeo), 'pin', false);
        plugMesh.position.set(0, maxStrokeDist + 0.68, zPos);
        headSubGroup.add(plugMesh);

        const coilGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.42, 16);
        const coilMesh = registerMesh(new THREE.Mesh(coilGeo), 'oilPan');
        coilMesh.position.set(0, maxStrokeDist + 1.15, zPos);
        headSubGroup.add(coilMesh);

        // E. Volumetric Chamber Particles & Ignition Embers
        const chamberParticles = [];
        for (let p = 0; p < 16; p++) {
          const isHaze = p % 4 === 0;
          const baseScale = isHaze ? 0.54 : 0.22;
          const pMat = new THREE.SpriteMaterial({
            map: glowTexture,
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          });
          const pSprite = new THREE.Sprite(pMat);
          gasGroup.add(pSprite);
          chamberParticles.push({
            sprite: pSprite,
            mat: pMat,
            isHaze,
            baseScale,
            rFrac: 0.15 + Math.random() * 0.75,
            angle: Math.random() * Math.PI * 2,
            yFrac: Math.random(),
            swirlSpd: (Math.random() - 0.5) * 4.5
          });
        }

        const coreMat = new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const coreSprite = new THREE.Sprite(coreMat);
        gasGroup.add(coreSprite);

        const embers = [];
        for (let em = 0; em < 8; em++) {
          const emMat = new THREE.SpriteMaterial({
            map: glowTexture,
            color: 0xfde047,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          });
          const emSprite = new THREE.Sprite(emMat);
          gasGroup.add(emSprite);
          embers.push({
            sprite: emSprite,
            mat: emMat,
            seed: Math.random() * Math.PI * 2,
            spd: 1.1 + Math.random() * 1.5
          });
        }

        cylindersData.push({
          cylNumber: bankInfo.cylNumber,
          side: bankInfo.side,
          journalIndex: i,
          bankAngle: bAngle,
          axisDir,
          zPos,
          firingAngle: V8_SPECS.firingAngles[bankInfo.cylNumber - 1],
          pistonGroup,
          rodGroup,
          headSubGroup,
          linerMesh,
          fullLinerGeo,
          cutLinerGeo,
          jacketMesh,
          fullJacketGeo,
          cutJacketGeo,
          intakeValve,
          exhaustValve,
          chamberParticles,
          coreSprite,
          coreMat,
          embers
        });
      });
    }

    // ------------------------------------------------------------------------
    // 5. SCULPTED 90° DEEP-SKIRT V8 CAST BLOCK & DEEP OIL PAN
    // ------------------------------------------------------------------------
    const blockShape = new THREE.Shape();
    blockShape.moveTo(-1.35, -0.95);
    blockShape.bezierCurveTo(-1.75, -0.35, -1.7, 0.35, -1.25, 0.85);
    blockShape.lineTo(-3.45, 3.05);
    blockShape.lineTo(-2.1, 4.4);
    blockShape.lineTo(-0.55, 2.85);
    blockShape.quadraticCurveTo(0, 2.45, 0.55, 2.85);
    blockShape.lineTo(2.1, 4.4);
    blockShape.lineTo(3.45, 3.05);
    blockShape.lineTo(1.25, 0.85);
    blockShape.bezierCurveTo(1.7, 0.35, 1.75, -0.35, 1.35, -0.95);
    blockShape.closePath();

    const crankTunnelPath = new THREE.Path();
    crankTunnelPath.absarc(0, 0, 0.88, 0, Math.PI * 2, true);
    blockShape.holes.push(crankTunnelPath);

    const castBlockGeo = new THREE.ExtrudeGeometry(blockShape, {
      depth: 7.4,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.12,
      bevelThickness: 0.12
    });
    castBlockGeo.translate(0, 0, -3.7);
    const crankcaseMesh = registerMesh(new THREE.Mesh(castBlockGeo), 'block');
    blockGroup.add(crankcaseMesh);

    // Deep-Sump Finned Oil Pan
    const sumpShape = new THREE.Shape();
    sumpShape.moveTo(-1.35, -0.95);
    sumpShape.lineTo(1.35, -0.95);
    sumpShape.bezierCurveTo(1.3, -1.55, 0.95, -1.85, 0.55, -1.85);
    sumpShape.lineTo(-0.55, -1.85);
    sumpShape.bezierCurveTo(-0.95, -1.85, -1.3, -1.55, -1.35, -0.95);

    const sumpGeo = new THREE.ExtrudeGeometry(sumpShape, {
      depth: 7.2,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.08,
      bevelThickness: 0.08
    });
    sumpGeo.translate(0, 0, -3.6);
    blockGroup.add(registerMesh(new THREE.Mesh(sumpGeo), 'oilPan'));

    // Dual V8 Valve Covers
    [-vAngle, vAngle].forEach((bAngle, bIdx) => {
      const targetHead = bIdx === 0 ? headRightGroup : headLeftGroup;
      const coverGroup = new THREE.Group();
      coverGroup.rotation.z = bAngle;
      targetHead.add(coverGroup);

      const coverGeo = new THREE.BoxGeometry(0.88, 0.42, 6.8);
      coverGeo.translate(0, maxStrokeDist + 1.25, 0);
      coverGroup.add(registerMesh(new THREE.Mesh(coverGeo), 'valveCoverOrange'));
    });

    // ------------------------------------------------------------------------
    // 6. 8 HIGH-RISE VELOCITY STACKS (AIR TRUMPETS) & TUBULAR HEADERS
    // ------------------------------------------------------------------------
    const intakeTrumpetCurves = [];
    const exhaustRunnerCurves = [];

    // 8 Chrome Velocity Stacks rising from the intake valley
    cylindersData.forEach((cyl) => {
      const isLeft = cyl.side === 'L';
      const dirX = isLeft ? -1 : 1;
      const runnerZ = cyl.zPos;

      const trumpetCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(dirX * 0.45, 2.65, runnerZ),
        new THREE.Vector3(dirX * 0.25, 3.45, runnerZ),
        new THREE.Vector3(dirX * 0.15, 4.35, runnerZ)
      ]);
      intakeTrumpetCurves.push(trumpetCurve);

      const trumpetGeo = new THREE.TubeGeometry(trumpetCurve, 16, 0.16, 16, false);
      intakeGroup.add(registerMesh(new THREE.Mesh(trumpetGeo), 'trumpetChrome'));

      // Flared Chrome Bellmouth Lip on top of each trumpet
      const lipGeo = new THREE.TorusGeometry(0.24, 0.045, 10, 24);
      lipGeo.rotateX(Math.PI / 2);
      const lipMesh = registerMesh(new THREE.Mesh(lipGeo), 'trumpetChrome');
      lipMesh.position.set(dirX * 0.15, 4.35, runnerZ);
      intakeGroup.add(lipMesh);

      // 4-into-1 Stainless Steel Tubular Exhaust Headers on each bank
      const headerBankX = isLeft ? -2.65 : 2.65;
      const collectorZ = -3.45;
      const exCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(headerBankX * 0.85, 2.35, runnerZ),
        new THREE.Vector3(headerBankX * 1.15, 1.45, runnerZ),
        new THREE.Vector3(headerBankX * 1.05, 0.45, (runnerZ + collectorZ) * 0.5),
        new THREE.Vector3(headerBankX * 0.85, 0.05, collectorZ)
      ]);
      exhaustRunnerCurves.push(exCurve);

      const exTubeGeo = new THREE.TubeGeometry(exCurve, 24, 0.14, 12, false);
      exhaustGroup.add(registerMesh(new THREE.Mesh(exTubeGeo), 'exhaustHeader'));
    });

    // Dual 4-into-1 Collectors & Exhaust Downpipes
    [-1, 1].forEach((dirX) => {
      const collectorGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.25, 20);
      collectorGeo.rotateX(Math.PI / 2);
      const collectorMesh = registerMesh(new THREE.Mesh(collectorGeo), 'exhaustHeader');
      collectorMesh.position.set(dirX * 2.25, 0.05, -3.85);
      exhaustGroup.add(collectorMesh);
    });

    // ------------------------------------------------------------------------
    // 7. VOLUMETRIC AIRFLOW & EXHAUST STREAM PARTICLES
    // ------------------------------------------------------------------------
    const streamParticles = [];
    for (let sp = 0; sp < 80; sp++) {
      const isIntake = sp < 40;
      const sMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: isIntake ? 0x38bdf8 : 0xf97316,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sSprite = new THREE.Sprite(sMat);
      sSprite.scale.set(0.34, 0.34, 1);
      gasGroup.add(sSprite);

      streamParticles.push({
        sprite: sSprite,
        mat: sMat,
        isIntake,
        phase: Math.random(),
        cylIdx: sp % 8
      });
    }

    const sampleCurve = (curve, u) => {
      const t = Math.max(0.0001, Math.min(0.9999, Number.isFinite(u) ? u : 0.5));
      return curve.getPoint(t);
    };

    // ------------------------------------------------------------------------
    // 8. MATERIAL & VISIBILITY SYNCHRONIZATION
    // ------------------------------------------------------------------------
    let lastCutaway = simParams.current.cutawayMode;

    const updateMaterialModes = () => {
      const {
        renderMode: mode,
        blockOpacity: opacity,
        cutawayMode: cutaway,
        exploded: exp,
        showBlock: blockOn,
        showHeadsAndValves: headOn,
        showIntakeAndHeaders: intakeOn,
        showGasAndCombustion: gasOn
      } = simParams.current;

      const expDist = exp * 2.2;
      headLeftGroup.position.set(-Math.sin(vAngle) * expDist * 0.9, Math.cos(vAngle) * expDist * 0.9, 0);
      headRightGroup.position.set(-Math.sin(-vAngle) * expDist * 0.9, Math.cos(-vAngle) * expDist * 0.9, 0);
      intakeGroup.position.y = expDist * 0.8;
      exhaustGroup.position.y = -expDist * 0.5;

      blockGroup.visible = blockOn;
      headLeftGroup.visible = headOn;
      headRightGroup.visible = headOn;
      intakeGroup.visible = intakeOn;
      exhaustGroup.visible = intakeOn;
      gasGroup.visible = gasOn;

      if (cutaway !== lastCutaway) {
        cylindersData.forEach((cyl) => {
          cyl.linerMesh.geometry = cutaway ? cyl.cutLinerGeo : cyl.fullLinerGeo;
          cyl.jacketMesh.geometry = cutaway ? cyl.cutJacketGeo : cyl.fullJacketGeo;
        });
        lastCutaway = cutaway;
      }

      realisticMats.block.opacity = cutaway ? opacity : Math.min(0.92, opacity + 0.35);
      realisticMats.liner.opacity = cutaway ? Math.max(0.14, opacity * 0.85) : Math.min(0.88, opacity + 0.25);
      realisticMats.headCast.opacity = cutaway ? opacity * 0.88 : Math.min(0.92, opacity + 0.35);
      rawBlockMat.opacity = realisticMats.block.opacity;

      trackedMeshes.forEach(({ mesh, type, baseMat, wireOverlay }) => {
        const isTranslucent = type === 'block' || type === 'liner' || type === 'headCast';
        if (mode === 'realistic') {
          mesh.material = baseMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (mode === 'raw') {
          mesh.material = isTranslucent ? rawBlockMat : rawSolidMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (mode === 'wireframe') {
          mesh.material = isTranslucent ? wireframeBlockMat : wireframePrimaryMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (mode === 'shaded_wire') {
          mesh.material = baseMat;
          if (wireOverlay) wireOverlay.visible = true;
        }
      });
    };

    // ------------------------------------------------------------------------
    // 9. ANIMATION LOOP (CROSSPLANE V8 & 1-8-4-3-6-5-7-2 FIRING)
    // ------------------------------------------------------------------------
    let animationFrameId;
    let lastTime = performance.now();
    let uiCounter = 0;

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const {
        rpm: currentRpm,
        isPlaying: playing,
        showGasAndCombustion: gasOn,
        autoRotateCam: autoCam
      } = simParams.current;

      if (playing) {
        const omega = (currentRpm * 2 * Math.PI) / 60;
        const visualSpeedFactor = currentRpm > 1200 ? 0.16 : 0.24;
        crankThetaRef.current = (crankThetaRef.current + omega * dt * visualSpeedFactor) % (4 * Math.PI);
      }

      const crankTheta = crankThetaRef.current;
      crankshaftGroup.rotation.z = -crankTheta;

      const normRpm = Math.max(0, Math.min(1, (currentRpm - 600) / 6400));
      realisticMats.exhaustHeader.emissiveIntensity = 0.1 + normRpm * 0.75;
      exhaustHeatLight.intensity = playing ? 1.0 + normRpm * 4.5 : 0.35;

      let currentFiringCyl = 1;
      let highestCombustionIntensity = -1;

      // Update 8 Cylinders
      cylindersData.forEach((cyl) => {
        const pinAngle = crankTheta + V8_SPECS.journalAngles[cyl.journalIndex];
        const pinX = r * Math.sin(pinAngle);
        const pinY = r * Math.cos(pinAngle);

        const alpha = pinAngle + cyl.bankAngle;
        const sinAlpha = Math.sin(alpha);
        const cosAlpha = Math.cos(alpha);

        const s = r * cosAlpha + Math.sqrt(Math.max(0.01, L * L - r * r * sinAlpha * sinAlpha));
        const wristX = s * cyl.axisDir.x;
        const wristY = s * cyl.axisDir.y;

        cyl.pistonGroup.position.set(wristX, wristY, cyl.zPos);
        cyl.rodGroup.position.set(pinX, pinY, cyl.zPos);
        const dx = wristX - pinX;
        const dy = wristY - pinY;
        cyl.rodGroup.rotation.z = Math.atan2(-dx, dy);

        // 4-Stroke Phase relative to this cylinder's TDC Power
        const phase = ((crankTheta - cyl.firingAngle) % (4 * Math.PI) + 4 * Math.PI) % (4 * Math.PI);

        // 4-Stroke Valve Lift
        const maxValveLift = 0.22;
        const exhLift = (phase >= Math.PI && phase < 2 * Math.PI) ? Math.sin(phase - Math.PI) * maxValveLift : 0;
        const intLift = (phase >= 2 * Math.PI && phase < 3 * Math.PI) ? Math.sin(phase - 2 * Math.PI) * maxValveLift : 0;

        cyl.exhaustValve.position.y = maxStrokeDist + 0.44 - exhLift;
        cyl.intakeValve.position.y = maxStrokeDist + 0.44 - intLift;

        // Combustion Flame Intensity
        let flameIntensity = 0;
        if (phase < 0.68 * Math.PI) {
          const norm = 1 - phase / (0.68 * Math.PI);
          flameIntensity = Math.pow(norm, 1.45);
          if (flameIntensity > highestCombustionIntensity) {
            highestCombustionIntensity = flameIntensity;
            currentFiringCyl = cyl.cylNumber;
          }
        }

        // Core Ignition Flash
        const coreStrength = phase < 0.35 * Math.PI ? Math.pow(1 - phase / (0.35 * Math.PI), 2.0) : 0;
        cyl.coreMat.opacity = gasOn ? coreStrength * 0.95 : 0;
        const coreS = 0.48 + coreStrength * 0.54;
        cyl.coreSprite.scale.set(coreS, coreS, 1);
        cyl.coreSprite.position.set(wristX * 0.92, wristY * 0.92 + 0.4, cyl.zPos);

        // Chamber Particles
        cyl.chamberParticles.forEach((cp) => {
          if (playing) {
            cp.angle += cp.swirlSpd * dt;
          }
          const rad = cp.rFrac * (pR * 0.82);
          const py = maxStrokeDist * 0.88 + cp.yFrac * 0.38;
          cp.sprite.position.set(
            wristX + Math.cos(cp.angle) * rad,
            wristY + py * 0.22,
            cyl.zPos + Math.sin(cp.angle) * rad
          );

          if (phase < Math.PI) {
            // Power: White-Hot -> Blazing Orange -> Crimson
            const pNorm = phase / Math.PI;
            cp.mat.color.setHSL(0.04 + (1 - pNorm) * 0.08, 1.0, 0.52 + flameIntensity * 0.32);
            cp.mat.opacity = (cp.isHaze ? 0.5 : 0.88) * Math.max(0.25, flameIntensity);
            const sc = cp.baseScale * (1.25 + flameIntensity * 0.35);
            cp.sprite.scale.set(sc, sc, 1);
          } else if (phase < 2 * Math.PI) {
            // Exhaust: Smoky Amber-Slate
            cp.mat.color.setHex(0x94a3b8);
            cp.mat.opacity = cp.isHaze ? 0.25 : 0.45;
            cp.sprite.scale.set(cp.baseScale, cp.baseScale, 1);
          } else if (phase < 3 * Math.PI) {
            // Intake: Fresh Cyan Mist
            cp.mat.color.setHex(0x38bdf8);
            cp.mat.opacity = cp.isHaze ? 0.38 : 0.68;
            cp.sprite.scale.set(cp.baseScale, cp.baseScale, 1);
          } else {
            // Compression: Pressurizing Cyan -> Golden Amber
            const cNorm = (phase - 3 * Math.PI) / Math.PI;
            cp.mat.color.lerpColors(new THREE.Color(0x38bdf8), new THREE.Color(0xfbbf24), cNorm);
            cp.mat.opacity = (cp.isHaze ? 0.42 : 0.75) * (0.8 + cNorm * 0.3);
            const sc = cp.baseScale * (1.0 - cNorm * 0.22);
            cp.sprite.scale.set(sc, sc, 1);
          }
        });

        // Spark Embers
        const emberActive = (gasOn && flameIntensity > 0.15) ? flameIntensity : 0;
        cyl.embers.forEach((em) => {
          if (emberActive > 0.05) {
            const prog = ((now * 0.0035 * em.spd + em.seed) % 1.0);
            const sprayAng = (em.seed - 0.5) * 1.5;
            const dist = prog * 0.62;
            const ex = wristX + Math.sin(sprayAng) * dist;
            const ey = wristY + 0.35 - Math.cos(sprayAng) * dist;
            const ez = cyl.zPos + Math.sin(em.seed * 3) * 0.24 * prog;

            em.sprite.position.set(ex, ey, ez);
            const es = (0.10 + (1 - prog) * 0.14) * emberActive;
            em.sprite.scale.set(es, es, 1);
            em.mat.opacity = emberActive * (1 - prog) * 0.92;
            em.mat.color.setHex(prog < 0.25 ? 0xffffff : 0xfde047);
          } else {
            em.mat.opacity = 0;
          }
        });
      });

      // Animate Airflow & Exhaust Stream Particles
      const streamSpd = 0.65 + normRpm * 2.0;
      streamParticles.forEach((sp) => {
        if (playing) {
          sp.phase = (sp.phase + dt * streamSpd) % 1.0;
        }
        const u = Math.max(0.0001, Math.min(0.9999, sp.phase));
        const curve = sp.isIntake ? intakeTrumpetCurves[sp.cylIdx] : exhaustRunnerCurves[sp.cylIdx];
        const pt = sampleCurve(curve, u);
        sp.sprite.position.copy(pt);
        sp.mat.opacity = 0.55 * Math.sin(u * Math.PI);
      });

      updateMaterialModes();

      if (autoCam && !camControl.current.isDragging) {
        camControl.current.theta += dt * 0.35;
      }
      const { theta, phi, radius, target } = camControl.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);

      renderer.render(scene, camera);

      uiCounter++;
      if (uiCounter % 4 === 0) {
        const roundedDeg = Math.round((crankTheta * 180) / Math.PI) % 720;
        setActiveCylinderInfo(currentFiringCyl);
        setCrankDeg(roundedDeg);
        if (playing) {
          setManualDeg(roundedDeg);
        }
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      glowTexture.dispose();
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handlePointerDown = (e) => {
    camControl.current.isDragging = true;
    camControl.current.isPanning = e.button === 2 || e.shiftKey;
    camControl.current.prevX = e.clientX;
    camControl.current.prevY = e.clientY;
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (!camControl.current.isDragging) return;
    const dx = e.clientX - camControl.current.prevX;
    const dy = e.clientY - camControl.current.prevY;
    camControl.current.prevX = e.clientX;
    camControl.current.prevY = e.clientY;

    if (camControl.current.isPanning) {
      camControl.current.target.y += dy * 0.015;
    } else {
      camControl.current.theta -= dx * 0.007;
      camControl.current.phi = Math.max(0.15, Math.min(Math.PI - 0.15, camControl.current.phi - dy * 0.007));
    }
  };

  const handlePointerUp = (e) => {
    camControl.current.isDragging = false;
    if (e.currentTarget.releasePointerCapture && e.hasPointerCapture && e.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e) => {
    camControl.current.radius = Math.max(5.5, Math.min(26, camControl.current.radius + e.deltaY * 0.008));
  };

  const resetCamera = () => {
    setAutoRotateCam(false);
    camControl.current.theta = 0.65;
    camControl.current.phi = 1.15;
    camControl.current.radius = 13.8;
    camControl.current.target.set(0, 1.25, 0);
  };

  // 5.0L Crossplane V8 Output (620 HP @ 7000 RPM, 680 Nm @ 4500 RPM)
  const hp = Math.round((rpm / 7000) * 620 * (0.84 + 0.16 * Math.sin(Math.min(1, rpm / 7000) * Math.PI)));
  const torque = Math.round(520 + 160 * Math.sin(Math.min(1, (rpm - 400) / 5200) * (Math.PI * 0.85)));

  const sheet = {
    panel: 'bg-white text-[#101828]',
    idle: 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]',
    chosen: 'bg-[#101828] text-white'
  };
  const hit = 'cursor-pointer text-base leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fb6514]';

  return (
    <div className="relative w-full h-full overflow-hidden select-none font-sans">
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 z-0 h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* =========================================================
          TOP-LEFT: V8 5.0L TELEMETRY & 1-8-4-3-6-5-7-2 FIRING MATRIX
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28.5rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section aria-label="5.0L Crossplane V8" className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}>
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              V8 5.0L Crossplane
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums"
              aria-label={`Sudut kruk as ${crankDeg} derajat`}
            >
              {crankDeg}°
            </p>
          </div>

          <p className="m-0 text-base leading-relaxed">
            Mesin 8 silinder 90° berkapasitas 5.000 cc dengan kruk as crossplane 4-jurnal. Pengapian berselang 90° dengan urutan pengapian khas 1-8-4-3-6-5-7-2 yang menghasilkan dengkuran (rumble) V8 legendaris.
          </p>

          <div className="grid grid-cols-8 gap-1" role="group" aria-label="Firing order 1-8-4-3-6-5-7-2">
            {V8_SPECS.firingOrder.map((cylNum) => {
              const isFiring = activeCylinderInfo === cylNum;
              const isLeftBank = cylNum % 2 !== 0;
              return (
                <button
                  key={cylNum}
                  type="button"
                  onClick={() => {
                    const targetRad = V8_SPECS.firingAngles[cylNum - 1] + 0.12;
                    handleManualAngleChange(Math.round((targetRad * 180) / Math.PI));
                  }}
                  className={`py-2 text-center text-base font-semibold tabular-nums ${hit} ${
                    isFiring ? 'bg-[#fb6514] text-[#101828]' : 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]'
                  }`}
                >
                  <span className="block text-[10px] font-normal opacity-75">{isLeftBank ? 'L' : 'R'}</span>
                  #{cylNum}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Putaran mesin', value: isPlaying ? rpm : 0, unit: 'rpm' },
              { label: 'Tenaga & Torsi', value: isPlaying ? `${hp} hp` : '0 hp', unit: `/ ${isPlaying ? torque : 0} Nm` },
              { label: 'Kruk as', value: '90° Cross', unit: 'plane' },
              { label: 'Silinder aktif', value: `#${activeCylinderInfo}`, unit: activeCylinderInfo % 2 !== 0 ? 'Left Bank' : 'Right Bank' }
            ].map((item) => (
              <div key={item.label} className="bg-[#eef1f4] px-3 py-2">
                <span className="block text-base">{item.label}</span>
                <span className="block text-base font-semibold tabular-nums text-[#fb6514]">
                  {item.value}
                  <span className="ml-1 font-normal text-[#101828]">{item.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* =========================================================
          TOP-RIGHT: RENDER MODE & COMPONENT VISIBILITY
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 right-4 z-10 w-[min(20rem,calc(100%-2rem))] max-[720px]:top-auto max-[720px]:bottom-44 max-[720px]:left-4 max-[720px]:right-4 max-[720px]:max-h-[28%] max-[720px]:w-auto max-[720px]:overflow-y-auto">
        <section
          aria-label="Engine view"
          className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Render mode">
            {[
              { id: 'realistic', label: 'Realistic', icon: Sparkles },
              { id: 'raw', label: 'Shaded', icon: Box },
              { id: 'wireframe', label: 'Wireframe', icon: Grid3x3 },
              { id: 'shaded_wire', label: 'Shaded wire', icon: Layers }
            ].map((mode) => {
              const active = renderMode === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRenderMode(mode.id)}
                  className={`flex w-full items-center gap-2 px-3 py-3 text-left ${hit} ${active ? 'bg-[#fb6514] text-[#101828]' : sheet.idle}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {mode.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Visible parts">
            <button
              type="button"
              aria-pressed={cutawayMode}
              onClick={() => setCutawayMode(!cutawayMode)}
              className={`col-span-2 px-3 py-3 text-left ${hit} ${cutawayMode ? sheet.chosen : sheet.idle}`}
            >
              Cutaway
            </button>
            {[
              { label: 'Block & liners', state: showBlock, setter: setShowBlock },
              { label: 'DOHC heads & valves', state: showHeadsAndValves, setter: setShowHeadsAndValves },
              { label: 'Velocity stacks & headers', state: showIntakeAndHeaders, setter: setShowIntakeAndHeaders },
              { label: 'Gas & combustion', state: showGasAndCombustion, setter: setShowGasAndCombustion }
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={item.state}
                onClick={() => item.setter(!item.state)}
                className={`px-3 py-3 text-left ${hit} ${item.state ? sheet.chosen : sheet.idle}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* =========================================================
          BOTTOM: HORIZONTAL SLIDER BAR & TRANSPORT CONTROLS
      ========================================================= */}
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-end">
        <section
          aria-label="Simulation controls"
          className={`pointer-events-auto grid flex-1 grid-cols-1 gap-6 p-5 sm:grid-cols-2 xl:grid-cols-4 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{rpm}</span> rpm
            </p>
            <SquareRange
              min={60}
              max={7200}
              step={20}
              value={rpm}
              label="RPM"
              onChange={(e) => setRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 120, label: '120 slow-mo' },
                { value: 800, label: '800 idle' },
                { value: 3500, label: '3500 cruise' },
                { value: 6800, label: '6800 redline' }
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={rpm === preset.value}
                  onClick={() => { setRpm(preset.value); setIsPlaying(true); }}
                  className={`px-2 py-1 ${hit} ${rpm === preset.value ? sheet.chosen : sheet.idle}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{crankDeg}°</span> (90° interval)
            </p>
            <SquareRange
              min={0}
              max={719}
              step={1}
              value={manualDeg}
              label="Crank angle"
              onChange={(e) => handleManualAngleChange(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <span>0° #1</span>
              <span>90° #8</span>
              <span>180° #4</span>
              <span>270° #3</span>
              <span>360° #6</span>
              <span>450° #5</span>
              <span>540° #7</span>
              <span>630° #2</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{Math.round(exploded * 100)}%</span> exploded
            </p>
            <SquareRange
              min={0}
              max={1}
              step={0.02}
              value={exploded}
              label="Exploded view"
              onChange={(e) => setExploded(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>Assembled</span>
              <span>Separated</span>
              <span>Exploded</span>
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{Math.round(blockOpacity * 100)}%</span> solid
            </p>
            <SquareRange
              min={0.05}
              max={0.95}
              step={0.02}
              value={blockOpacity}
              label="Block opacity"
              onChange={(e) => setBlockOpacity(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>Clear</span>
              <span>Glass</span>
              <span>Solid</span>
            </p>
          </div>
        </section>

        <div className={`pointer-events-auto flex flex-wrap items-center gap-2 p-3 ${sheet.panel}`}>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`inline-flex items-center gap-2 px-4 py-3 ${hit} ${isPlaying ? 'bg-[#fb6514] text-[#101828]' : sheet.chosen}`}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            aria-pressed={autoRotateCam}
            onClick={() => setAutoRotateCam(!autoRotateCam)}
            className={`inline-flex items-center gap-2 px-3 py-3 ${hit} ${autoRotateCam ? sheet.chosen : sheet.idle}`}
          >
            <Orbit className="h-4 w-4" />
            Orbit
          </button>
          <button
            type="button"
            onClick={() => {
              setRpm(800);
              setExploded(0);
              setBlockOpacity(0.28);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowBlock(true);
              setShowHeadsAndValves(true);
              setShowIntakeAndHeaders(true);
              setShowGasAndCombustion(true);
              setAutoRotateCam(false);
              resetCamera();
            }}
            className={`inline-flex items-center gap-2 px-3 py-3 ${hit} ${sheet.idle}`}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
