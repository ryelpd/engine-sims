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
// WANKEL ROTARY ENGINE KINEMATICS & EPITROCHOID CONSTANTS
// ============================================================================
// Epitrochoid parametric equation traced by the 3 rotor apex seals:
//   Hx(theta) = e * cos(3 * theta) + R * cos(theta)
//   Hy(theta) = e * sin(3 * theta) + R * sin(theta)
// where:
//   theta = alpha / 3 (Rotor angle, rotating at 1/3 the speed of the E-Shaft)
//   alpha = Eccentric shaft angle (0° to 1080° for 1 full 360° rotor revolution)
const ROTARY_SPECS = {
  eccentricity: 0.34,       // e: Offset of eccentric shaft journal from housing center
  generatingRadius: 2.30,   // R: Center of rotor to each of the 3 apex seal tips
  housingDepth: 1.48,       // Axial width of rotor & epitrochoid chamber
  compressionRatio: '10.0 : 1',
  displacementCc: '654 cc × 2 (13B Twin-Plug)',
  redlineRpm: 9000,
  strokes: [
    {
      id: 'intake',
      short: 'Hisap (Intake)',
      rangeLabel: '0° sampai 270°',
      range: [0, 270],
      desc: 'Ujung apex seal melewati lubang hisap (intake port). Volume ruang di antara sisi rotor dan dinding epitrochoid membesar, menghisap campuran udara dan bahan bakar segar berwarna biru ke dalam kamar kerja.'
    },
    {
      id: 'compression',
      short: 'Kompresi',
      rangeLabel: '270° sampai 540°',
      range: [270, 540],
      desc: 'Apex seal belakang menutup lubang hisap. Saat rotor berotasi mengelilingi poros eksentrik, ruang kerja menyempit ke arah pinggang housing kanan dan memampatkan campuran hingga rasio 10:1.'
    },
    {
      id: 'power',
      short: 'Usaha (Twin-Plug)',
      rangeLabel: '540° sampai 810°',
      range: [540, 810],
      desc: 'Kedua busi (Leading & Trailing spark plug) memercikkan api secara berurutan pada cekungan kantong bakar rotor (combustion pocket). Gas bertekanan tinggi mendorong sisi rotor dan memutar poros eksentrik.'
    },
    {
      id: 'exhaust',
      short: 'Buang (Exhaust)',
      rangeLabel: '810° sampai 1080°',
      range: [810, 1080],
      desc: 'Apex seal depan membuka lubang buang (exhaust port) di sisi kiri bawah. Sisi rotor menyapu gas sisa pembakaran keluar menuju knalpot sebelum memulai siklus hisap berikutnya.'
    }
  ]
};

// Exact Epitrochoid coordinate helper
function getEpitrochoidPoint(theta, radialOffset = 0) {
  const { eccentricity: e, generatingRadius: R } = ROTARY_SPECS;
  const x = e * Math.cos(3 * theta) + R * Math.cos(theta);
  const y = e * Math.sin(3 * theta) + R * Math.sin(theta);
  if (radialOffset === 0) return new THREE.Vector2(x, y);

  // Outward normal via derivative dH/dtheta = (-3e sin(3t) - R sin(t), 3e cos(3t) + R cos(t))
  const dx = -3 * e * Math.sin(3 * theta) - R * Math.sin(theta);
  const dy = 3 * e * Math.cos(3 * theta) + R * Math.cos(theta);
  const len = Math.hypot(dx, dy) || 1;
  // Outward normal is (dy / len, -dx / len)
  const nx = dy / len;
  const ny = -dx / len;
  return new THREE.Vector2(x + nx * radialOffset, y + ny * radialOffset);
}

// Compute local rotor flank radius at local angle phi in [0, 2*PI]
// Each flank spans between two apexes separated by 120° (2*PI/3).
// A pure flat triangle has chord r_chord(u) = R * cos(PI/3) / cos(u) = 0.5 * R / cos(u) for u in [-PI/3, PI/3].
// A Wankel rotor bows outward like a Reuleaux triangle up to R - 2*e so it clears the housing pinch waist!
function getRotorLocalPoint(localAngle, radialInset = 0) {
  const { eccentricity: e, generatingRadius: R } = ROTARY_SPECS;
  const twoPiOver3 = (2 * Math.PI) / 3;
  // Normalize angle into [0, 2*PI)
  const norm = ((localAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const sectorIdx = Math.floor(norm / twoPiOver3);
  const sectorCenter = sectorIdx * twoPiOver3 + Math.PI / 3;
  const u = norm - sectorCenter; // in [-PI/3, +PI/3]

  // Normalized parameter s in [-1, 1] across the flank, where s = +/-1 are the apexes
  const s = u / (Math.PI / 3);
  const cosU = Math.cos(u);
  const chordR = (R * 0.5) / cosU; // straight triangle chord radius (0.5*R at midpoint, R at apexes)

  // Bow outward cleanly: at s=0 (flank center), max radius must be <= R - e - clearance (~1.82)
  // chordR at s=0 is 1.15; adding archBulge = 0.62 * (1 - s^2) gives 1.77 at midpoint and R=2.30 at apexes!
  const archBulge = (R - 1.48 * e - R * 0.5) * Math.pow(Math.max(0, 1 - s * s), 0.88);

  // Recessed bathtub combustion pocket in the middle of each flank (|s| < 0.42)
  let pocketRecess = 0;
  if (Math.abs(s) < 0.42 && radialInset >= 0) {
    const pNorm = Math.abs(s) / 0.42;
    pocketRecess = 0.14 * Math.pow(Math.cos(pNorm * (Math.PI / 2)), 1.6);
  }

  const r = Math.max(0.4, chordR + archBulge - pocketRecess - radialInset);
  return new THREE.Vector2(r * Math.cos(localAngle), r * Math.sin(localAngle));
}

export default function RotaryEngine({ theme = 'dark' }) {
  const mountRef = useRef(null);

  // Simulation Controls
  const [rpm, setRpm] = useState(240); // Clear educational speed by default
  const [isPlaying, setIsPlaying] = useState(true);
  const [manualDeg, setManualDeg] = useState(0); // 0 to 1080 deg (3 E-shaft turns = 1 full rotor revolution)
  const [renderMode, setRenderMode] = useState('realistic');
  const [exploded, setExploded] = useState(0);
  const [blockOpacity, setBlockOpacity] = useState(0.32);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [showHousing, setShowHousing] = useState(true);
  const [showRotor, setShowRotor] = useState(true);
  const [showEShaft, setShowEShaft] = useState(true);
  const [showGasFlow, setShowGasFlow] = useState(true);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Live Telemetry States
  const [shaftDeg, setShaftDeg] = useState(0);
  const [rotorDeg, setRotorDeg] = useState(0);
  const [activeStrokeIdx, setActiveStrokeIdx] = useState(0);
  const [chamberPressureBar, setChamberPressureBar] = useState(1.1);
  const [instantPowerHp, setInstantPowerHp] = useState(115);

  const simParams = useRef({
    theme,
    rpm: 240,
    isPlaying: true,
    manualDeg: 0,
    renderMode: 'realistic',
    exploded: 0,
    blockOpacity: 0.32,
    cutawayMode: true,
    showHousing: true,
    showRotor: true,
    showEShaft: true,
    showGasFlow: true,
    autoRotateCam: false
  });

  // Track E-Shaft angle in radians: alpha in [0, 6 * PI)
  const shaftAlphaRef = useRef(0);

  const sceneElements = useRef({
    scene: null,
    gridHelper: null,
    ambientLight: null,
    hemiLight: null
  });

  const camControl = useRef({
    isDragging: false,
    isPanning: false,
    prevX: 0,
    prevY: 0,
    theta: 0.32,
    phi: 1.42,
    radius: 8.6,
    target: new THREE.Vector3(0.0, 0.0, 0.0)
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
      showHousing,
      showRotor,
      showEShaft,
      showGasFlow,
      autoRotateCam
    };

    if (sceneElements.current.scene) {
      const isDark = theme === 'dark';
      sceneElements.current.scene.background = new THREE.Color(isDark ? 0x101828 : 0xf8fafc);
      sceneElements.current.scene.fog = new THREE.FogExp2(isDark ? 0x101828 : 0xf8fafc, 0.018);
      if (sceneElements.current.gridHelper) {
        sceneElements.current.gridHelper.material.color.setHex(isDark ? 0x1e293b : 0xcbd5e1);
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
    showHousing,
    showRotor,
    showEShaft,
    showGasFlow,
    autoRotateCam
  ]);

  const handleManualAngleChange = (val) => {
    const deg = ((val % 1080) + 1080) % 1080;
    setManualDeg(deg);
    setShaftDeg(Math.round(deg));
    setRotorDeg(Math.round(deg / 3));
    setIsPlaying(false);
    shaftAlphaRef.current = (deg * Math.PI) / 180;
  };

  const jumpToStroke = (strokeIdx) => {
    const targetAngles = [135, 415, 575, 920];
    const target = targetAngles[strokeIdx] ?? 135;
    handleManualAngleChange(target);
  };

  const resetCamera = () => {
    camControl.current.theta = 0.32;
    camControl.current.phi = 1.42;
    camControl.current.radius = 8.6;
    camControl.current.target.set(0.0, 0.0, 0.0);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ------------------------------------------------------------------------
    // 1. SCENE, CAMERA & RENDERER
    // ------------------------------------------------------------------------
    const scene = new THREE.Scene();
    const isInitialDark = simParams.current.theme === 'dark';
    scene.background = new THREE.Color(isInitialDark ? 0x101828 : 0xf8fafc);
    scene.fog = new THREE.FogExp2(isInitialDark ? 0x101828 : 0xf8fafc, 0.018);
    sceneElements.current.scene = scene;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ------------------------------------------------------------------------
    // 2. STUDIO LIGHTING & FLOOR GRID
    // ------------------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.82);
    scene.add(ambientLight);
    sceneElements.current.ambientLight = ambientLight;

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.85);
    scene.add(hemiLight);
    sceneElements.current.hemiLight = hemiLight;

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.4);
    keyLight.position.set(7, 9, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.25);
    fillLight.position.set(-8, 4, 7);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf97316, 1.1);
    rimLight.position.set(3, -6, -8);
    scene.add(rimLight);

    // Twin Spark Plug Ignition PointLights (Leading & Trailing on right housing waist)
    const leadingSparkLight = new THREE.PointLight(0x38bdf8, 0, 5.5, 1.6);
    leadingSparkLight.position.set(2.45, -0.42, 0.1);
    scene.add(leadingSparkLight);

    const trailingSparkLight = new THREE.PointLight(0x60a5fa, 0, 5.5, 1.6);
    trailingSparkLight.position.set(2.45, 0.42, -0.1);
    scene.add(trailingSparkLight);

    // Combustion Flame Glow Light inside active power chamber
    const flameLight = new THREE.PointLight(0xff6b00, 0, 7.0, 1.5);
    flameLight.position.set(1.6, -0.6, 0);
    scene.add(flameLight);

    const gridHelper = new THREE.GridHelper(32, 32, isInitialDark ? 0x334155 : 0x94a3b8, isInitialDark ? 0x1e293b : 0xcbd5e1);
    gridHelper.position.y = -3.85;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.45;
    scene.add(gridHelper);
    sceneElements.current.gridHelper = gridHelper;

    // ------------------------------------------------------------------------
    // 3. PBR MATERIALS & SHADING REGISTRY
    // ------------------------------------------------------------------------
    const allMeshes = [];
    const registerMesh = (mesh, isTranslucentHousing = false) => {
      mesh.castShadow = !isTranslucentHousing;
      mesh.receiveShadow = true;
      const wireMat = new THREE.MeshBasicMaterial({
        color: isTranslucentHousing ? 0x38bdf8 : 0xf97316,
        wireframe: true,
        transparent: true,
        opacity: isTranslucentHousing ? 0.2 : 0.35
      });
      const wireOverlay = new THREE.Mesh(mesh.geometry, wireMat);
      wireOverlay.visible = false;
      mesh.add(wireOverlay);

      allMeshes.push({
        mesh,
        baseMat: mesh.material,
        wireOverlay,
        isTranslucentHousing
      });
      return mesh;
    };

    const mats = {
      rotorSteel: new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        metalness: 0.86,
        roughness: 0.22
      }),
      rotorPocketDark: new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.65,
        roughness: 0.42
      }),
      apexSealCarbon: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.75,
        roughness: 0.28
      }),
      brassBearing: new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.85,
        roughness: 0.24
      }),
      phasingGearSteel: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.88,
        roughness: 0.2
      }),
      eShaftPolished: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.14
      }),
      counterweightBronze: new THREE.MeshStandardMaterial({
        color: 0xb45309,
        metalness: 0.8,
        roughness: 0.28
      }),
      housingCastAlum: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.35,
        roughness: 0.22,
        transparent: true,
        opacity: 0.38,
        transmission: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      sideIronPlate: new THREE.MeshPhysicalMaterial({
        color: 0x475569,
        metalness: 0.55,
        roughness: 0.32,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      rearIronSolid: new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.72,
        roughness: 0.34
      }),
      intakeRunnerAlum: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.55,
        roughness: 0.28
      }),
      exhaustHeaderSteel: new THREE.MeshStandardMaterial({
        color: 0xc2410c,
        metalness: 0.78,
        roughness: 0.26
      }),
      ceramicInsulator: new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        metalness: 0.08,
        roughness: 0.18
      }),
      ignitionBootRed: new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        metalness: 0.25,
        roughness: 0.45
      }),
      rawShaded: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.12,
        roughness: 0.62
      }),
      wireframeOnly: new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true
      })
    };

    const { eccentricity: e, generatingRadius: R, housingDepth } = ROTARY_SPECS;

    // ------------------------------------------------------------------------
    // 4. BUILD THE EPITROCHOID ROTOR HOUSING, PORTS & TWIN SPARK PLUGS
    // ------------------------------------------------------------------------
    const engineRoot = new THREE.Group();
    scene.add(engineRoot);

    const housingGroup = new THREE.Group();
    engineRoot.add(housingGroup);

    const frontCoverGroup = new THREE.Group();
    engineRoot.add(frontCoverGroup);

    const rearPlateGroup = new THREE.Group();
    engineRoot.add(rearPlateGroup);

    // 4A. Epitrochoid Rotor Housing Shell (with Outer Cooling Fins & Tension Bolt Bosses)
    const epitrochoidSteps = 180;
    const innerBorePts = [];
    const outerShellPts = [];

    for (let i = 0; i <= epitrochoidSteps; i++) {
      const theta = (i / epitrochoidSteps) * Math.PI * 2;
      // Inner wall has +0.025 clearance for the apex seal rounded tip
      innerBorePts.push(getEpitrochoidPoint(theta, 0.025));
      // Outer housing wall is 0.46 thicker around the epitrochoid
      outerShellPts.push(getEpitrochoidPoint(theta, 0.48));
    }

    const housingShape = new THREE.Shape(outerShellPts);
    const boreHolePath = new THREE.Path(innerBorePts);
    housingShape.holes.push(boreHolePath);

    const housingExtrudeGeo = new THREE.ExtrudeGeometry(housingShape, {
      depth: housingDepth,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035,
      curveSegments: epitrochoidSteps
    });
    housingExtrudeGeo.translate(0, 0, -housingDepth / 2);
    const housingMesh = registerMesh(new THREE.Mesh(housingExtrudeGeo, mats.housingCastAlum), true);
    housingGroup.add(housingMesh);

    // Glowing Epitrochoid Bore Liner Outline (Front & Rear edge rings so the figure-8 waist is crystal clear)
    const boreLinePoints = innerBorePts.map((pt) => new THREE.Vector3(pt.x, pt.y, housingDepth / 2 + 0.01));
    const boreLineGeo = new THREE.BufferGeometry().setFromPoints(boreLinePoints);
    const boreLineMat = new THREE.LineBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.75 });
    const frontBoreLine = new THREE.Line(boreLineGeo, boreLineMat);
    housingGroup.add(frontBoreLine);

    const rearBoreLine = frontBoreLine.clone();
    rearBoreLine.position.z = -housingDepth - 0.02;
    housingGroup.add(rearBoreLine);

    // Tension Bolt Bosses around the Epitrochoid Housing Perimeter (14 bolts)
    const boltGeo = new THREE.CylinderGeometry(0.065, 0.065, housingDepth + 0.36, 12);
    boltGeo.rotateX(Math.PI / 2);
    const nutGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.12, 6);
    nutGeo.rotateX(Math.PI / 2);

    for (let i = 0; i < 14; i++) {
      const theta = (i / 14) * Math.PI * 2 + 0.15;
      // Skip directly over the intake/exhaust ports on the left and spark plugs on the right
      if (Math.abs(theta - 2.35) < 0.25 || Math.abs(theta - 3.88) < 0.25 || Math.abs(theta - 0.16) < 0.2 || Math.abs(theta - (Math.PI * 2 - 0.16)) < 0.2) {
        continue;
      }
      const pt = getEpitrochoidPoint(theta, 0.27);
      const bolt = registerMesh(new THREE.Mesh(boltGeo, mats.phasingGearSteel));
      bolt.position.set(pt.x, pt.y, 0);
      housingGroup.add(bolt);

      const frontNut = registerMesh(new THREE.Mesh(nutGeo, mats.eShaftPolished));
      frontNut.position.set(pt.x, pt.y, housingDepth / 2 + 0.16);
      frontCoverGroup.add(frontNut);
    }

    // 4B. Rear Cast-Iron End Plate (Rear Side Housing) & Stationary Phasing Sun Gear
    const rearPlateShape = new THREE.Shape(outerShellPts);
    const rearShaftHole = new THREE.Path();
    rearShaftHole.absarc(0, 0, 0.42, 0, Math.PI * 2, false);
    rearPlateShape.holes.push(rearShaftHole);

    const rearPlateGeo = new THREE.ExtrudeGeometry(rearPlateShape, {
      depth: 0.26,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025
    });
    rearPlateGeo.translate(0, 0, -housingDepth / 2 - 0.28);
    const rearPlateMesh = registerMesh(new THREE.Mesh(rearPlateGeo, mats.rearIronSolid));
    rearPlateGroup.add(rearPlateMesh);

    // Stationary Sun Gear mounted to the Rear Housing (20 external teeth, radius = 2 * e = 0.68)
    // Meshes with the Rotor's 30-tooth internal ring gear (radius = 3 * e = 1.02)
    const sunGearRadius = 2 * e; // 0.68
    const sunGearTeeth = 24;
    const sunGearShape = new THREE.Shape();
    const sunSteps = sunGearTeeth * 4;
    for (let i = 0; i <= sunSteps; i++) {
      const ang = (i / sunSteps) * Math.PI * 2;
      const toothWave = Math.cos(ang * sunGearTeeth);
      const r = sunGearRadius + (toothWave > 0 ? 0.045 : -0.045);
      if (i === 0) sunGearShape.moveTo(r * Math.cos(ang), r * Math.sin(ang));
      else sunGearShape.lineTo(r * Math.cos(ang), r * Math.sin(ang));
    }
    const sunHole = new THREE.Path();
    sunHole.absarc(0, 0, 0.42, 0, Math.PI * 2, true);
    sunGearShape.holes.push(sunHole);

    const sunGearGeo = new THREE.ExtrudeGeometry(sunGearShape, {
      depth: 0.42,
      bevelEnabled: false
    });
    sunGearGeo.translate(0, 0, -housingDepth / 2 - 0.02);
    const sunGearMesh = registerMesh(new THREE.Mesh(sunGearGeo, mats.brassBearing));
    rearPlateGroup.add(sunGearMesh);

    // 4C. Front Side Housing Plate (Translucent / Cutaway Cover)
    const frontPlateGeo = new THREE.ExtrudeGeometry(rearPlateShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02
    });
    frontPlateGeo.translate(0, 0, housingDepth / 2 + 0.02);
    const frontPlateMesh = registerMesh(new THREE.Mesh(frontPlateGeo, mats.sideIronPlate), true);
    frontCoverGroup.add(frontPlateMesh);

    // 4D. Peripheral Intake Runner (Upper-Left at theta ~ 2.35 rad) & Exhaust Port (Lower-Left at theta ~ 3.88 rad)
    const intakeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.65, 1.55, 0),
      new THREE.Vector3(-2.55, 2.15, 0),
      new THREE.Vector3(-3.35, 2.55, 0)
    ]);
    const intakeTubeGeo = new THREE.TubeGeometry(intakeCurve, 24, 0.34, 20, false);
    const intakeTubeMesh = registerMesh(new THREE.Mesh(intakeTubeGeo, mats.intakeRunnerAlum));
    housingGroup.add(intakeTubeMesh);

    const intakeFlangeGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.12, 24);
    const intakeFlange = registerMesh(new THREE.Mesh(intakeFlangeGeo, mats.rotorSteel));
    intakeFlange.position.set(-3.35, 2.55, 0);
    intakeFlange.rotation.z = 0.98;
    housingGroup.add(intakeFlange);

    const exhaustCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.65, -1.55, 0),
      new THREE.Vector3(-2.65, -2.10, 0),
      new THREE.Vector3(-3.55, -2.35, 0)
    ]);
    const exhaustTubeGeo = new THREE.TubeGeometry(exhaustCurve, 24, 0.36, 20, false);
    const exhaustTubeMesh = registerMesh(new THREE.Mesh(exhaustTubeGeo, mats.exhaustHeaderSteel));
    housingGroup.add(exhaustTubeMesh);

    const exhaustFlange = registerMesh(new THREE.Mesh(intakeFlangeGeo, mats.rotorSteel));
    exhaustFlange.position.set(-3.55, -2.35, 0);
    exhaustFlange.rotation.z = -1.15;
    housingGroup.add(exhaustFlange);

    // 4E. Twin Spark Plugs (Leading & Trailing Spark Plugs on the Right Pinch Waist)
    const buildSparkPlug = (yPos, zOffset, tiltAngle) => {
      const plugGroup = new THREE.Group();
      plugGroup.position.set(2.38, yPos, zOffset);
      plugGroup.rotation.z = tiltAngle;

      // Threaded tip & hex body
      const hexGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.42, 6);
      hexGeo.rotateZ(-Math.PI / 2);
      const hexMesh = registerMesh(new THREE.Mesh(hexGeo, mats.eShaftPolished));
      hexMesh.position.x = 0.25;
      plugGroup.add(hexMesh);

      // Ribbed white ceramic insulator
      const ceramicGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.62, 16);
      ceramicGeo.rotateZ(-Math.PI / 2);
      const ceramicMesh = registerMesh(new THREE.Mesh(ceramicGeo, mats.ceramicInsulator));
      ceramicMesh.position.x = 0.68;
      plugGroup.add(ceramicMesh);

      // Red silicone HV boot
      const bootGeo = new THREE.CylinderGeometry(0.15, 0.13, 0.38, 16);
      bootGeo.rotateZ(-Math.PI / 2);
      const bootMesh = registerMesh(new THREE.Mesh(bootGeo, mats.ignitionBootRed));
      bootMesh.position.x = 1.08;
      plugGroup.add(bootMesh);

      //Glowing Spark Electrode Core at inner housing wall
      const sparkCoreMat = new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0
      });
      const sparkCore = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), sparkCoreMat);
      sparkCore.position.set(-0.08, 0, 0);
      plugGroup.add(sparkCore);

      housingGroup.add(plugGroup);
      return { plugGroup, sparkCore, sparkCoreMat };
    };

    // Leading plug (lower-right, fires first) & Trailing plug (upper-right, fires slightly after)
    const leadingPlug = buildSparkPlug(-0.46, 0.08, -0.18);
    const trailingPlug = buildSparkPlug(0.46, -0.08, 0.18);

    // ------------------------------------------------------------------------
    // 5. BUILD SCULPTED TRIANGULAR WANKEL ROTOR, COMBUSTION POCKETS, APEX SEALS & INTERNAL RING GEAR
    // ------------------------------------------------------------------------
    const rotorGroup = new THREE.Group();
    engineRoot.add(rotorGroup);

    const rotorDepth = housingDepth - 0.12;
    const rotorSteps = 180;
    const rotorOuterPts = [];
    for (let i = 0; i <= rotorSteps; i++) {
      const phi = (i / rotorSteps) * Math.PI * 2;
      rotorOuterPts.push(getRotorLocalPoint(phi, 0.04)); // leave 0.04 at tips for separate carbon apex seals
    }

    const rotorShape = new THREE.Shape(rotorOuterPts);

    // Internal Phasing Ring Gear Hole (36 internal teeth at radius = 3 * e = 1.02)
    const ringGearRadius = 3 * e; // 1.02
    const ringGearTeeth = 36;
    const rotorCenterHole = new THREE.Path();
    const ringSteps = ringGearTeeth * 4;
    for (let i = 0; i <= ringSteps; i++) {
      const ang = (i / ringSteps) * Math.PI * 2;
      const toothWave = Math.cos(ang * ringGearTeeth);
      const r = ringGearRadius + (toothWave > 0 ? 0.042 : -0.042);
      if (i === 0) rotorCenterHole.moveTo(r * Math.cos(ang), r * Math.sin(ang));
      else rotorCenterHole.lineTo(r * Math.cos(ang), r * Math.sin(ang));
    }
    rotorShape.holes.push(rotorCenterHole);

    // Weight-reduction lightening pockets on the rotor faces (3 triangular kidney recesses)
    for (let k = 0; k < 3; k++) {
      const apexAngle = (k * 2 * Math.PI) / 3;
      const hole = new THREE.Path();
      const holeCenterR = 1.52;
      hole.absarc(
        holeCenterR * Math.cos(apexAngle),
        holeCenterR * Math.sin(apexAngle),
        0.19,
        0,
        Math.PI * 2,
        true
      );
      rotorShape.holes.push(hole);
    }

    const rotorExtrudeGeo = new THREE.ExtrudeGeometry(rotorShape, {
      depth: rotorDepth,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      curveSegments: rotorSteps
    });
    rotorExtrudeGeo.translate(0, 0, -rotorDepth / 2);
    const rotorMesh = registerMesh(new THREE.Mesh(rotorExtrudeGeo, mats.rotorSteel));
    rotorGroup.add(rotorMesh);

    // Pressed Bronze Rotor Bearing Sleeve inside the rotor center
    const bearingSleeveGeo = new THREE.CylinderGeometry(ringGearRadius - 0.04, ringGearRadius - 0.04, rotorDepth * 0.72, 48, 1, true);
    bearingSleeveGeo.rotateX(Math.PI / 2);
    const bearingSleeve = registerMesh(new THREE.Mesh(bearingSleeveGeo, mats.brassBearing));
    rotorGroup.add(bearingSleeve);

    // 3 Sculpted Dark Bathtub Combustion Pocket Inserts & 3 Carbon Apex Seals + Corner Seals
    const apexSealGeo = new THREE.BoxGeometry(0.14, 0.11, rotorDepth + 0.05);
    const cornerSealGeo = new THREE.CylinderGeometry(0.085, 0.085, rotorDepth + 0.055, 16);
    cornerSealGeo.rotateX(Math.PI / 2);

    for (let k = 0; k < 3; k++) {
      const apexAngle = (k * 2 * Math.PI) / 3;

      // Carbon Apex Seal Strip at each of the 3 vertices (radius R - 0.03)
      const seal = registerMesh(new THREE.Mesh(apexSealGeo, mats.apexSealCarbon));
      const sealR = R - 0.035;
      seal.position.set(sealR * Math.cos(apexAngle), sealR * Math.sin(apexAngle), 0);
      seal.rotation.z = apexAngle;
      rotorGroup.add(seal);

      // Corner Seal Buttons just inward of each apex seal
      const cornerSeal = registerMesh(new THREE.Mesh(cornerSealGeo, mats.counterweightBronze));
      const cornerR = R - 0.16;
      cornerSeal.position.set(cornerR * Math.cos(apexAngle), cornerR * Math.sin(apexAngle), 0);
      rotorGroup.add(cornerSeal);

      // Bathtub Combustion Pocket liner on the midpoint of each flank (angle = apexAngle + PI/3)
      const flankAngle = apexAngle + Math.PI / 3;
      const pocketCenterPt = getRotorLocalPoint(flankAngle, 0.02);
      const pocketGeo = new THREE.BoxGeometry(0.12, 0.88, rotorDepth * 0.62);
      const pocketMesh = registerMesh(new THREE.Mesh(pocketGeo, mats.rotorPocketDark));
      pocketMesh.position.set(pocketCenterPt.x, pocketCenterPt.y, 0);
      pocketMesh.rotation.z = flankAngle;
      rotorGroup.add(pocketMesh);
    }

    // Dual Side Seal Grooves (Front & Rear face arc lines on the rotor)
    const sideSealPts = [];
    for (let i = 0; i <= 120; i++) {
      const phi = (i / 120) * Math.PI * 2;
      const pt = getRotorLocalPoint(phi, 0.14);
      sideSealPts.push(new THREE.Vector3(pt.x, pt.y, rotorDepth / 2 + 0.03));
    }
    const sideSealLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(sideSealPts),
      new THREE.LineBasicMaterial({ color: 0x0f172a })
    );
    rotorGroup.add(sideSealLine);

    // ------------------------------------------------------------------------
    // 6. BUILD ECCENTRIC SHAFT (E-SHAFT), ECCENTRIC LOBE, COUNTERWEIGHTS & FLYWHEEL
    // ------------------------------------------------------------------------
    const eShaftGroup = new THREE.Group();
    engineRoot.add(eShaftGroup);

    // Main center shaft running along Z axis
    const mainShaftGeo = new THREE.CylinderGeometry(0.38, 0.38, housingDepth + 2.5, 36);
    mainShaftGeo.rotateX(Math.PI / 2);
    const mainShaftMesh = registerMesh(new THREE.Mesh(mainShaftGeo, mats.eShaftPolished));
    eShaftGroup.add(mainShaftMesh);

    // Eccentric Rotor Journal Lobe (Offset by exactly e = 0.34 in +X in local E-shaft coordinates!)
    const eccentricLobeGeo = new THREE.CylinderGeometry(ringGearRadius - 0.055, ringGearRadius - 0.055, rotorDepth * 0.85, 48);
    eccentricLobeGeo.rotateX(Math.PI / 2);
    const eccentricLobeMesh = registerMesh(new THREE.Mesh(eccentricLobeGeo, mats.eShaftPolished));
    eccentricLobeMesh.position.set(e, 0, 0);
    eShaftGroup.add(eccentricLobeMesh);

    // Oil gallery hole on the eccentric journal
    const oilHoleGeo = new THREE.CylinderGeometry(0.08, 0.08, (ringGearRadius - 0.04) * 2.02, 16);
    const oilHoleMesh = registerMesh(new THREE.Mesh(oilHoleGeo, mats.apexSealCarbon));
    oilHoleMesh.position.set(e, 0, 0);
    eShaftGroup.add(oilHoleMesh);

    // Front & Rear Counterweights (Positioned at -X opposite the eccentric lobe to balance the orbiting rotor!)
    const cwShape = new THREE.Shape();
    cwShape.absarc(0, 0, 1.18, Math.PI * 0.58, Math.PI * 1.42, false);
    cwShape.lineTo(0.32, -0.35);
    cwShape.lineTo(0.32, 0.35);
    cwShape.closePath();

    const cwHole = new THREE.Path();
    cwHole.absarc(0, 0, 0.38, 0, Math.PI * 2, true);
    cwShape.holes.push(cwHole);

    const cwGeo = new THREE.ExtrudeGeometry(cwShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.02
    });

    const frontCounterweight = registerMesh(new THREE.Mesh(cwGeo, mats.counterweightBronze));
    frontCounterweight.position.z = housingDepth / 2 + 0.38;
    eShaftGroup.add(frontCounterweight);

    const rearCounterweight = registerMesh(new THREE.Mesh(cwGeo, mats.counterweightBronze));
    rearCounterweight.position.z = -housingDepth / 2 - 0.65;
    eShaftGroup.add(rearCounterweight);

    // Rear Slotted Flywheel
    const flywheelGeo = new THREE.CylinderGeometry(1.75, 1.75, 0.22, 48);
    flywheelGeo.rotateX(Math.PI / 2);
    const flywheelMesh = registerMesh(new THREE.Mesh(flywheelGeo, mats.phasingGearSteel));
    flywheelMesh.position.z = -housingDepth / 2 - 1.05;
    eShaftGroup.add(flywheelMesh);

    // ------------------------------------------------------------------------
    // 7. HIGH-END VOLUMETRIC GAS FLOW & COMBUSTION PARTICLE SYSTEM
    // ------------------------------------------------------------------------
    const gasGroup = new THREE.Group();
    engineRoot.add(gasGroup);

    // Dynamic soft-glow radial texture for organic, fluid-like volumetric gas & flame
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

    // 195 volumetric chamber particles (65 per chamber):
    // Blend of fine gaseous vapor mist, turbulent eddy clusters, and soft ambient volumetric haze
    const gasParticles = [];
    for (let i = 0; i < 195; i++) {
      const flankIdx = i % 3; // Flank 0, 1, or 2
      const isHazePuff = i % 5 === 0; // 20% are soft large haze puffs, 80% are fine vapor particles

      // Natural randomized distribution across the crescent flank volume
      const baseS = -0.82 + Math.random() * 1.64;
      const baseR = 0.18 + Math.pow(Math.random(), 0.85) * 0.68;
      const zPos = (Math.random() - 0.5) * (rotorDepth * 0.76);
      const baseScale = isHazePuff ? (0.68 + Math.random() * 0.42) : (0.28 + Math.random() * 0.22);
      const baseOpacity = isHazePuff ? 0.38 : 0.65;
      const driftSpeed = (0.22 + Math.random() * 0.35) * (Math.random() > 0.5 ? 1 : -1);

      const pMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0x38bdf8,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(pMat);
      sprite.scale.set(baseScale, baseScale, 1);
      gasGroup.add(sprite);

      gasParticles.push({
        sprite,
        mat: pMat,
        flankIdx,
        baseS,
        baseR,
        zPos,
        baseScale,
        baseOpacity,
        driftSpeed,
        isHazePuff,
        swirlPhase: Math.random() * Math.PI * 2
      });
    }

    // 24 Dynamic Spark Embers spraying from the Twin Plugs during ignition
    const sparkEmbers = [];
    for (let i = 0; i < 24; i++) {
      const emberMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const emberSprite = new THREE.Sprite(emberMat);
      gasGroup.add(emberSprite);
      sparkEmbers.push({
        sprite: emberSprite,
        mat: emberMat,
        isLeading: i < 12,
        seed: Math.random() * Math.PI * 2,
        spd: 0.8 + Math.random() * 1.4
      });
    }

    // 32 Intake & Exhaust Stream Particles flowing through runner pipes
    const portParticles = [];
    for (let i = 0; i < 32; i++) {
      const isIntake = i < 16;
      const pScale = isIntake ? (0.32 + Math.random() * 0.18) : (0.38 + Math.random() * 0.22);
      const pMat = new THREE.SpriteMaterial({
        map: glowTexture,
        color: isIntake ? 0x38bdf8 : 0xf97316,
        transparent: true,
        opacity: isIntake ? 0.58 : 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(pMat);
      sprite.scale.set(pScale, pScale, 1);
      gasGroup.add(sprite);
      portParticles.push({
        sprite,
        mat: pMat,
        isIntake,
        pScale,
        uOffset: (i % 16) / 16,
        jitterY: (Math.random() - 0.5) * 0.18,
        jitterZ: (Math.random() - 0.5) * 0.18
      });
    }

    const sampleCurve = (curve, rawU) => {
      const u = Number.isFinite(rawU) ? Math.max(0.0001, Math.min(0.9999, rawU)) : 0.5;
      return curve.getPoint(u);
    };

    // ------------------------------------------------------------------------
    // 8. CAMERA ORBIT CONTROLS
    // ------------------------------------------------------------------------
    const domElem = renderer.domElement;
    const onPointerDown = (e) => {
      if (e.button === 2 || e.shiftKey) {
        camControl.current.isPanning = true;
      } else {
        camControl.current.isDragging = true;
      }
      camControl.current.prevX = e.clientX;
      camControl.current.prevY = e.clientY;
    };

    const onPointerMove = (e) => {
      const dx = e.clientX - camControl.current.prevX;
      const dy = e.clientY - camControl.current.prevY;
      camControl.current.prevX = e.clientX;
      camControl.current.prevY = e.clientY;

      if (camControl.current.isDragging) {
        camControl.current.theta -= dx * 0.0075;
        camControl.current.phi = Math.max(0.15, Math.min(Math.PI - 0.15, camControl.current.phi - dy * 0.0075));
      } else if (camControl.current.isPanning) {
        const panSpeed = 0.006 * (camControl.current.radius / 8.0);
        camControl.current.target.x -= dx * panSpeed;
        camControl.current.target.y += dy * panSpeed;
      }
    };

    const onPointerUp = () => {
      camControl.current.isDragging = false;
      camControl.current.isPanning = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      camControl.current.radius = Math.max(3.8, Math.min(20.0, camControl.current.radius + e.deltaY * 0.006));
    };

    const onContextMenu = (e) => e.preventDefault();

    domElem.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domElem.addEventListener('wheel', onWheel, { passive: false });
    domElem.addEventListener('contextmenu', onContextMenu);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    // ------------------------------------------------------------------------
    // 9. ANIMATION & WANKEL KINEMATICS LOOP
    // ------------------------------------------------------------------------
    let prevTime = performance.now();
    let uiTimer = 0;
    let reqId = null;

    // Initial alignment so Flank 0 starts at Beginning of Intake (alpha = 0 -> 1080°)
    // Note: Flank 0 midpoint is at local angle PI/3.
    // We offset alpha by +2.15 rad so that shaftDeg = 0° aligns Flank 0 right at the upper-left intake port!
    const PHASE_OFFSET_ALPHA = 3 * 1.32;

    const animate = (now) => {
      reqId = requestAnimationFrame(animate);
      const rawDt = (now - prevTime) / 1000;
      prevTime = now;
      const dt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, 0.05) : 0.016;
      const t = now * 0.001;

      const params = simParams.current;

      // 1. Advance E-Shaft Angle alpha (in [0, 6*PI) = 0° to 1080°)
      if (params.isPlaying) {
        // Visually scale high RPM so rotor motion stays smooth and legible
        const visualRpm = params.rpm <= 360 ? params.rpm * 0.35 : 126 + Math.pow(params.rpm - 360, 0.62) * 2.2;
        const omega = (visualRpm * Math.PI * 2) / 60;
        shaftAlphaRef.current = (shaftAlphaRef.current + omega * dt) % (Math.PI * 6);
      }

      const alpha = shaftAlphaRef.current; // [0, 6*PI)
      const deg1080 = ((alpha * 180) / Math.PI) % 1080;

      // Physical kinematics angle with phase offset so 0° = Intake start on Flank 0
      const kinAlpha = alpha + PHASE_OFFSET_ALPHA;
      const rotorBeta = kinAlpha / 3;

      // 2. Position Rotor & Eccentric Shaft
      // Rotor center orbits at radius e at angle kinAlpha; Rotor body rotates at angle rotorBeta = kinAlpha / 3!
      const rotorCenterX = e * Math.cos(kinAlpha);
      const rotorCenterY = e * Math.sin(kinAlpha);

      const exp = params.exploded;
      rotorGroup.position.set(rotorCenterX, rotorCenterY, exp * 0.35);
      rotorGroup.rotation.z = rotorBeta;

      eShaftGroup.position.set(0, 0, -exp * 1.35);
      eShaftGroup.rotation.z = kinAlpha;

      // Exploded separation of housing & front/rear plates
      housingGroup.position.set(0, 0, 0);
      frontCoverGroup.position.set(0, 0, exp * 2.15);
      rearPlateGroup.position.set(0, 0, -exp * 1.85);

      // 3. Component Visibility & Cutaway Mode
      housingGroup.visible = params.showHousing;
      rearPlateGroup.visible = params.showHousing;
      frontCoverGroup.visible = params.showHousing && (!params.cutawayMode || exp > 0.08);
      rotorGroup.visible = params.showRotor;
      eShaftGroup.visible = params.showEShaft;
      gasGroup.visible = params.showGasFlow;

      // 4. Shading Mode & Opacity Updates
      mats.housingCastAlum.opacity = params.blockOpacity;
      mats.sideIronPlate.opacity = Math.min(0.85, params.blockOpacity * 0.9);

      allMeshes.forEach((item) => {
        if (params.renderMode === 'realistic') {
          item.mesh.material = item.baseMat;
          item.wireOverlay.visible = false;
        } else if (params.renderMode === 'raw') {
          item.mesh.material = item.isTranslucentHousing ? item.baseMat : mats.rawShaded;
          item.wireOverlay.visible = false;
        } else if (params.renderMode === 'wireframe') {
          item.mesh.material = mats.wireframeOnly;
          item.wireOverlay.visible = false;
        } else if (params.renderMode === 'shaded_wire') {
          item.mesh.material = item.baseMat;
          item.wireOverlay.visible = true;
        }
      });

      // 5. Twin Spark Plug Ignition & Thermodynamics across all 3 Chambers
      // Each chamber (k = 0, 1, 2) is offset by 360° of E-shaft angle:
      //   0° - 270°: Intake (Cool Cyan-Blue)
      //   270° - 540°: Compression (Warming Teal -> Amber)
      //   540° - 810°: Power / Combustion (Twin-Plug Spark Flash at 540°..590°, Bright Flame Orange -> Red)
      //   810° - 1080°: Exhaust (Smoky Amber-Slate)
      let anySparkLeading = 0;
      let anySparkTrailing = 0;
      let maxFlameGlow = 0;

      const getChamberColorAndState = (chamberDeg, rFrac, isHaze) => {
        const cDeg = ((chamberDeg % 1080) + 1080) % 1080;
        const col = new THREE.Color();

        if (cDeg < 270) {
          // Intake (0° - 270°): Cool atomized fuel-air mist (soft cyan/blue-white)
          const p = cDeg / 270;
          col.setHSL(0.55 - p * 0.04, 0.95, isHaze ? 0.62 : 0.72);
          const scale = 0.85 + 0.3 * Math.sin(p * Math.PI);
          const opacity = (isHaze ? 0.35 : 0.62) * (0.65 + 0.35 * Math.sin(p * Math.PI));
          return { col, scale, opacity };
        }
        if (cDeg < 540) {
          // Compression (270° - 540°): Pressurizing charge tightening into pinch waist (teal -> amber-gold)
          const p = (cDeg - 270) / 270;
          const hue = 0.51 - Math.pow(p, 1.8) * 0.42;
          col.setHSL(Math.max(0.09, hue), 0.98, isHaze ? 0.58 : 0.68 + p * 0.12);
          const scale = (1.1 - p * 0.38);
          const opacity = (isHaze ? 0.42 : 0.75) * (0.85 + p * 0.35);
          return { col, scale, opacity };
        }
        if (cDeg < 810) {
          // Power & Twin-Plug Ignition (540° - 810°):
          const p = (cDeg - 540) / 270;
          if (cDeg >= 535 && cDeg <= 585) {
            anySparkLeading = Math.max(anySparkLeading, Math.sin(((cDeg - 535) / 50) * Math.PI));
          }
          if (cDeg >= 550 && cDeg <= 605) {
            anySparkTrailing = Math.max(anySparkTrailing, Math.sin(((cDeg - 550) / 55) * Math.PI));
          }
          const flameIntensity = Math.pow(Math.max(0, 1 - p), 1.35);
          maxFlameGlow = Math.max(maxFlameGlow, flameIntensity);

          if (p < 0.18) {
            // Blazing high-energy plasma core (white-hot to electric lemon)
            col.setHSL(0.12 - p * 0.35, 1.0, 0.88 - p * 0.6);
          } else {
            // Deep rolling flame front (neon orange to glowing crimson embers)
            col.setHSL(0.06 - (p - 0.18) * 0.05, 0.98, 0.62 - (p - 0.18) * 0.28 + rFrac * 0.08);
          }
          const scale = 1.35 - p * 0.45;
          const opacity = (isHaze ? 0.55 : 0.9) * Math.max(0.2, Math.pow(1 - p, 0.65));
          return { col, scale, opacity };
        }
        // Exhaust (810° - 1080°): Hot smoky gas scavenged into exhaust runner
        const p = (cDeg - 810) / 270;
        col.setHSL(0.06 + p * 0.48, 0.55 - p * 0.35, 0.48 - p * 0.16);
        const scale = 0.95 - p * 0.25;
        const opacity = (isHaze ? 0.3 : 0.45) * Math.max(0.1, 1 - p * 0.75);
        return { col, scale, opacity };
      };

      // Update Leading & Trailing Spark Plug Lights & Cores
      leadingSparkLight.intensity = anySparkLeading * 8.5;
      leadingPlug.sparkCoreMat.opacity = anySparkLeading * 0.95;
      leadingPlug.sparkCore.scale.setScalar(0.8 + anySparkLeading * 1.2);

      trailingSparkLight.intensity = anySparkTrailing * 8.5;
      trailingPlug.sparkCoreMat.opacity = anySparkTrailing * 0.95;
      trailingPlug.sparkCore.scale.setScalar(0.8 + anySparkTrailing * 1.2);

      flameLight.intensity = maxFlameGlow * 6.0;

      // 6. Update 3-Chamber Crescent Volumetric Gas Particles
      gasParticles.forEach((p) => {
        const chamberDeg = (deg1080 + p.flankIdx * 360) % 1080;
        const { col, scale, opacity } = getChamberColorAndState(chamberDeg, p.baseR, p.isHazePuff);

        // Continuous fluid eddy circulation along the flank with micro-turbulence
        const swirl = Math.sin(t * 3.8 + p.swirlPhase) * 0.07;
        const flankParam = Math.max(-0.86, Math.min(0.86, p.baseS + swirl));
        const flankMidLocal = (p.flankIdx * 2 * Math.PI) / 3 + Math.PI / 3;
        const localAngle = flankMidLocal + flankParam * (Math.PI / 3);

        // Point on the Rotor Flank in world coordinates
        const localRotorPt = getRotorLocalPoint(localAngle, -0.03);
        const rx = rotorCenterX + localRotorPt.x * Math.cos(rotorBeta) - localRotorPt.y * Math.sin(rotorBeta);
        const ry = rotorCenterY + localRotorPt.x * Math.sin(rotorBeta) + localRotorPt.y * Math.cos(rotorBeta);

        // Corresponding point on the Epitrochoid Housing Wall
        const worldAngle = rotorBeta + localAngle;
        const wallPt = getEpitrochoidPoint(worldAngle, -0.05);

        // Dynamic radial breathing based on compression state
        const dynamicR = Math.max(0.12, Math.min(0.88, p.baseR + Math.sin(t * 2.5 + p.swirlPhase * 2) * 0.04));
        const px = THREE.MathUtils.lerp(rx, wallPt.x, dynamicR);
        const py = THREE.MathUtils.lerp(ry, wallPt.y, dynamicR);

        p.sprite.position.set(px, py, p.zPos + exp * 0.35);
        const finalScale = p.baseScale * scale;
        p.sprite.scale.set(finalScale, finalScale, 1);
        p.mat.color.copy(col);
        p.mat.opacity = opacity;
      });

      // Update Spark Embers Spray during Ignition
      const sparkActive = Math.max(anySparkLeading, anySparkTrailing);
      sparkEmbers.forEach((se, idx) => {
        if (sparkActive > 0.05) {
          const originY = se.isLeading ? -0.46 : 0.46;
          const originZ = (se.isLeading ? 0.08 : -0.08) + exp * 0.35;
          const progress = ((t * se.spd + se.seed) % 1.0);
          const sprayAng = (se.seed - 0.5) * 1.25;
          const dist = progress * 1.55;
          const ex = 2.38 - Math.cos(sprayAng) * dist;
          const ey = originY + Math.sin(sprayAng) * dist;
          const ez = originZ + (Math.sin(se.seed * 3) * 0.25);

          se.sprite.position.set(ex, ey, ez);
          const s = (0.16 + (1 - progress) * 0.22) * sparkActive;
          se.sprite.scale.set(s, s, 1);
          se.mat.opacity = sparkActive * (1 - progress) * 0.95;
          se.mat.color.setHex(progress < 0.3 ? 0xffffff : 0xfbbf24);
        } else {
          se.mat.opacity = 0;
        }
      });

      // Update Intake & Exhaust Port Stream Particles
      portParticles.forEach((pp) => {
        if (pp.isIntake) {
          // Inward flow from outer flange (u=1.0) into chamber (u=0.0)
          const u = 1.0 - ((t * 1.15 + pp.uOffset) % 1.0);
          const pt = sampleCurve(intakeCurve, u);
          pp.sprite.position.set(pt.x, pt.y + pp.jitterY, pt.z + pp.jitterZ);
          const s = pp.pScale * (0.8 + 0.4 * Math.sin(u * Math.PI));
          pp.sprite.scale.set(s, s, 1);
          pp.mat.opacity = 0.55 * (0.4 + 0.6 * Math.sin(u * Math.PI));
        } else {
          // Outward flow from chamber (u=0.0) through exhaust pipe (u=1.0)
          const u = (t * 1.45 + pp.uOffset) % 1.0;
          const pt = sampleCurve(exhaustCurve, u);
          pp.sprite.position.set(pt.x, pt.y + pp.jitterY, pt.z + pp.jitterZ);
          const s = pp.pScale * (0.9 + 0.8 * u);
          pp.sprite.scale.set(s, s, 1);
          pp.mat.opacity = 0.48 * Math.max(0.1, 1 - u * 0.85);
        }
      });

      // 7. Camera Orbit Update
      if (params.autoRotateCam && !camControl.current.isDragging && !camControl.current.isPanning) {
        camControl.current.theta += 0.22 * dt;
      }

      const { theta, phi, radius, target } = camControl.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);

      // 8. Throttled Telemetry React State Updates (Primary Chamber 0)
      uiTimer += dt;
      if (uiTimer > 0.06) {
        uiTimer = 0;
        const roundedShaftDeg = Math.round(deg1080) % 1080;
        const roundedRotorDeg = Math.round(deg1080 / 3) % 360;
        setShaftDeg(roundedShaftDeg);
        setRotorDeg(roundedRotorDeg);
        if (params.isPlaying) {
          setManualDeg(roundedShaftDeg);
        }

        const strokeIdx = Math.min(3, Math.floor(roundedShaftDeg / 270));
        setActiveStrokeIdx(strokeIdx);

        // Calculate realistic Chamber 0 pressure (bar) & engine power (hp)
        let simPressure = 1.05;
        if (roundedShaftDeg < 270) {
          simPressure = 0.88 + 0.15 * (roundedShaftDeg / 270);
        } else if (roundedShaftDeg < 540) {
          const p = (roundedShaftDeg - 270) / 270;
          simPressure = 1.05 + Math.pow(p, 2.2) * 18.5;
        } else if (roundedShaftDeg < 810) {
          const p = (roundedShaftDeg - 540) / 270;
          simPressure = p < 0.18
            ? 19.5 + (p / 0.18) * 34.5
            : 54.0 * Math.exp(-(p - 0.18) * 2.6) + 2.4;
        } else {
          const p = (roundedShaftDeg - 810) / 270;
          simPressure = 2.4 - p * 1.25;
        }

        const simHp = params.isPlaying
          ? Math.round((params.rpm / 9000) * 255 * (0.82 + 0.18 * Math.sin(kinAlpha)))
          : 0;

        setChamberPressureBar(Number(simPressure.toFixed(1)));
        setInstantPowerHp(simHp);
      }

      renderer.render(scene, camera);
    };

    reqId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      domElem.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domElem.removeEventListener('wheel', onWheel);
      domElem.removeEventListener('contextmenu', onContextMenu);
      glowTexture.dispose();
      renderer.dispose();
    };
  }, []);

  const currentStroke = ROTARY_SPECS.strokes[activeStrokeIdx] || ROTARY_SPECS.strokes[0];

  const sheet = {
    panel: 'bg-white text-[#101828]',
    idle: 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]',
    chosen: 'bg-[#101828] text-white'
  };
  const hit = 'cursor-pointer text-base leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fb6514]';

  return (
    <div className="relative w-full h-full overflow-hidden select-none font-sans">
      {/* Three.js 3D Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* =========================================================
          TOP-LEFT: HEADER & WANKEL 4-PHASE ROTARY CYCLE MONITOR
      ========================================================= */}
      <div className="absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto pointer-events-none max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section
          aria-label="Mesin Rotary Wankel"
          className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              Mesin Rotary
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums"
              aria-label={`Sudut poros eksentrik ${shaftDeg} derajat`}
            >
              {shaftDeg}°
            </p>
          </div>

          <p className="m-0 text-base leading-relaxed">
            Rotor segitiga Reuleaux mengorbit di dalam ruang epitrochoid. Satu putaran rotor penuh memutar poros eksentrik tiga kali (1080°).
          </p>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tahap siklus rotary">
            {ROTARY_SPECS.strokes.map((st, idx) => {
              const isActive = activeStrokeIdx === idx;
              return (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => jumpToStroke(idx)}
                  className={`cursor-pointer px-3 py-3 text-left text-base leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fb6514] ${
                    isActive ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
                  }`}
                >
                  <span className="block font-semibold">{st.short}</span>
                  <span className="block">{st.rangeLabel}</span>
                </button>
              );
            })}
          </div>

          <p className="m-0 text-base leading-relaxed">
            {currentStroke.desc}
          </p>

          <p className="m-0 grid grid-cols-2 gap-x-6 gap-y-1 text-base leading-snug">
            <span><span className="font-semibold tabular-nums">{isPlaying ? rpm : 0}</span> rpm E-shaft</span>
            <span><span className="font-semibold tabular-nums">{isPlaying ? Math.round(rpm / 3) : 0}</span> rpm rotor ({rotorDeg}°)</span>
            <span><span className="font-semibold tabular-nums">{chamberPressureBar}</span> bar di kamar #1</span>
            <span><span className="font-semibold tabular-nums">{instantPowerHp}</span> hp</span>
          </p>
        </section>
      </div>

      {/* =========================================================
          TOP-RIGHT: SHADING MODE & COMPONENT VISIBILITY
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
              { label: 'Housing & plug', state: showHousing, setter: setShowHousing },
              { label: 'Rotor & seals', state: showRotor, setter: setShowRotor },
              { label: 'Eccentric shaft', state: showEShaft, setter: setShowEShaft },
              { label: 'Gas flow', state: showGasFlow, setter: setShowGasFlow }
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
          BOTTOM: SIMULATOR CONTROLS & MANUAL E-SHAFT ANGLE SCRUBBER
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
              max={9000}
              step={30}
              value={rpm}
              label="RPM"
              onChange={(e) => setRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 90, label: '90 slow-mo' },
                { value: 900, label: '900 idle' },
                { value: 9000, label: '9000 redline' }
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
              <span className="font-semibold tabular-nums">{shaftDeg}°</span> E-shaft ({rotorDeg}° rotor)
            </p>
            <SquareRange
              min={0}
              max={1079}
              step={1}
              value={manualDeg}
              label="Eccentric shaft angle"
              onChange={(e) => handleManualAngleChange(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>0° intake</span>
              <span>540° spark</span>
              <span>1080°</span>
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
              label="Housing opacity"
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
              setRpm(240);
              setExploded(0);
              setBlockOpacity(0.32);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowHousing(true);
              setShowRotor(true);
              setShowEShaft(true);
              setShowGasFlow(true);
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
