import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import {
  Box,
  Grid3x3,
  Layers,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sparkles
} from 'lucide-react';

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
// CONTINUOUSLY VARIABLE TRANSMISSION (CVT) SPECIFICATION & EXACT KINEMATICS
// ============================================================================
// Two parallel pulley shafts oriented along the Z-axis:
//   Primary Pulley (Input / Drive) centered at (x = -1.65, y = 0.25)
//   Secondary Pulley (Output / Driven) centered at (x = +1.65, y = 0.25)
//   Center-to-Center Distance C = 3.30 units
const PRIMARY_X = -1.65;
const SECONDARY_X = 1.65;
const PULLEY_Y = 0.25;
const SHAFT_DIST = SECONDARY_X - PRIMARY_X; // 3.30

// Sheave V-Groove Geometry:
//   Inner hub radius = 0.36, Outer rim radius = 1.66
//   Conical V-slope: as radius r increases from rInner to rOuter,
//   each sheave's conical face recedes axially from z = 0 by (r - rInner) * SHEAVE_SLOPE.
//   So closing the sheaves together forces the V-belt OUTWARD to a larger radius!
const SHEAVE_INNER_R = 0.36;
const SHEAVE_OUTER_R = 1.66;
const SHEAVE_SLOPE = 0.28; // V-cone slope dz/dr
const BELT_HALF_WIDTH = 0.22; // Half-width of the trapezoidal steel push-block at pitch line

// Virtual 7-Speed Stepped Ratios for Sport Mode (S)
const VIRTUAL_7_SPEEDS = [
  { gear: 1, ratio: 2.50, label: 'Gear 1 (2.50:1)' },
  { gear: 2, ratio: 1.85, label: 'Gear 2 (1.85:1)' },
  { gear: 3, ratio: 1.40, label: 'Gear 3 (1.40:1)' },
  { gear: 4, ratio: 1.00, label: 'Gear 4 (1.00:1)' },
  { gear: 5, ratio: 0.78, label: 'Gear 5 (0.78:1)' },
  { gear: 6, ratio: 0.60, label: 'Gear 6 (0.60:1)' },
  { gear: 7, ratio: 0.45, label: 'Gear 7 (0.45:1)' }
];

// Helper to create 3D involute toothed gear geometry oriented in X-Y plane (axis along Z)
function createToothedGearGeo({
  pitchRadius,
  teethCount,
  faceWidth = 0.32,
  boreRadius = 0.22,
  helicalAngle = 0.12,
  hasLighteningHoles = true
}) {
  const shape = new THREE.Shape();
  const addendum = Math.min(0.075, (pitchRadius * Math.PI) / (teethCount * 2.2));
  const dedendum = addendum * 1.15;
  const outerR = pitchRadius + addendum;
  const rootR = Math.max(boreRadius + 0.06, pitchRadius - dedendum);

  const step = (Math.PI * 2) / teethCount;
  for (let i = 0; i < teethCount; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.18;
    const a2 = a0 + step * 0.32;
    const a3 = a0 + step * 0.54;
    const a4 = a0 + step * 0.68;

    const x0 = Math.cos(a0) * rootR;
    const y0 = Math.sin(a0) * rootR;
    if (i === 0) shape.moveTo(x0, y0);
    else shape.lineTo(x0, y0);

    shape.lineTo(Math.cos(a1) * rootR, Math.sin(a1) * rootR);
    shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
    shape.lineTo(Math.cos(a4) * rootR, Math.sin(a4) * rootR);
  }
  shape.closePath();

  const borePath = new THREE.Path();
  borePath.absarc(0, 0, boreRadius, 0, Math.PI * 2, true);
  shape.holes.push(borePath);

  if (hasLighteningHoles && rootR - boreRadius > 0.38) {
    const orbitR = (rootR + boreRadius) * 0.52;
    const holeR = Math.min(0.15, (rootR - boreRadius) * 0.22);
    for (let h = 0; h < 6; h++) {
      const ha = (h / 6) * Math.PI * 2;
      const hp = new THREE.Path();
      hp.absarc(Math.cos(ha) * orbitR, Math.sin(ha) * orbitR, holeR, 0, Math.PI * 2, true);
      shape.holes.push(hp);
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: faceWidth,
    steps: 2,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.012
  });
  geo.translate(0, 0, -faceWidth * 0.5);

  if (helicalAngle !== 0) {
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const vx = pos.getX(k);
      const vy = pos.getY(k);
      const vz = pos.getZ(k);
      const twist = (vz / faceWidth) * helicalAngle;
      const cosT = Math.cos(twist);
      const sinT = Math.sin(twist);
      pos.setX(k, vx * cosT - vy * sinT);
      pos.setY(k, vx * sinT + vy * cosT);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return geo;
}

export default function CvtSim({ theme = 'dark' }) {
  const mountRef = useRef(null);

  // Mechanical State & Driver Inputs
  const [isPlaying, setIsPlaying] = useState(true);
  const [engineRpm, setEngineRpm] = useState(2200);
  const [throttlePct, setThrottlePct] = useState(45);
  const [driveMode, setDriveMode] = useState('D'); // 'P', 'R', 'N', 'D', 'S'
  const [cvtRatio, setCvtRatio] = useState(1.45); // 2.50 (Low) to 0.45 (Overdrive)
  const [isVirtualMode, setIsVirtualMode] = useState(false);
  const [virtualGear, setVirtualGear] = useState(3);

  // Visual / Viewport Controls
  const [renderMode, setRenderMode] = useState('realistic');
  const [casingOpacity, setCasingOpacity] = useState(0.22);
  const [cutawayMode, setCutawayMode] = useState(true);
  const [exploded, setExploded] = useState(0);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Component Layers Visibility
  const [showCasing, setShowCasing] = useState(true);
  const [showSteelBelt, setShowSteelBelt] = useState(true);
  const [showTorqueConverter, setShowTorqueConverter] = useState(true);
  const [showFinalDrive, setShowFinalDrive] = useState(true);

  // Live Telemetry Readouts
  const [telemetry, setTelemetry] = useState({
    inputRpm: 2200,
    outputRpm: 1517,
    actualRatio: 1.45,
    outputTorqueNm: 342,
    roadSpeedKmh: 52,
    primaryDiameterMm: 138,
    secondaryDiameterMm: 200,
    clampPressureBar: 44
  });

  const simParams = useRef({
    isPlaying,
    engineRpm,
    throttlePct,
    driveMode,
    cvtRatio,
    isVirtualMode,
    virtualGear,
    renderMode,
    casingOpacity,
    cutawayMode,
    exploded,
    autoRotateCam,
    showCasing,
    showSteelBelt,
    showTorqueConverter,
    showFinalDrive,
    theme
  });

  useEffect(() => {
    simParams.current = {
      isPlaying,
      engineRpm,
      throttlePct,
      driveMode,
      cvtRatio,
      isVirtualMode,
      virtualGear,
      renderMode,
      casingOpacity,
      cutawayMode,
      exploded,
      autoRotateCam,
      showCasing,
      showSteelBelt,
      showTorqueConverter,
      showFinalDrive,
      theme
    };
  }, [
    isPlaying,
    engineRpm,
    throttlePct,
    driveMode,
    cvtRatio,
    isVirtualMode,
    virtualGear,
    renderMode,
    casingOpacity,
    cutawayMode,
    exploded,
    autoRotateCam,
    showCasing,
    showSteelBelt,
    showTorqueConverter,
    showFinalDrive,
    theme
  ]);

  const cameraPresetRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ------------------------------------------------------------------------
    // 1. THREE.JS SCENE, CAMERA, RENDERER & STUDIO LIGHTING
    // ------------------------------------------------------------------------
    const scene = new THREE.Scene();
    const isDarkTheme = simParams.current.theme === 'dark';
    scene.background = new THREE.Color(isDarkTheme ? 0x0b101b : 0xf1f5f9);
    scene.fog = new THREE.FogExp2(isDarkTheme ? 0x0b101b : 0xf1f5f9, 0.015);

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      150
    );
    camera.position.set(3.8, 3.6, 8.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, -0.15, 0.1);
    controls.minDistance = 4.0;
    controls.maxDistance = 24.0;

    cameraPresetRef.current = (viewType) => {
      if (viewType === 'iso') {
        camera.position.set(3.8, 3.6, 8.2);
        controls.target.set(0, -0.15, 0.1);
      } else if (viewType === 'front') {
        camera.position.set(0, 0.1, 9.2);
        controls.target.set(0, -0.15, 0);
      } else if (viewType === 'top') {
        camera.position.set(0.01, 9.8, 0.1);
        controls.target.set(0, -0.15, 0.1);
      } else if (viewType === 'side') {
        camera.position.set(-8.8, 1.2, 0.1);
        controls.target.set(0, -0.15, 0.1);
      }
      controls.update();
    };

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff8ed, 2.35);
    keyLight.position.set(8, 13, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    fillLight.position.set(-9, 3, 6);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf97316, 1.25);
    rimLight.position.set(0, -6, -9);
    scene.add(rimLight);

    const beltGlowLight = new THREE.PointLight(0xf97316, 1.6, 6.0);
    beltGlowLight.position.set(0, PULLEY_Y, 0);
    scene.add(beltGlowLight);

    const gridHelper = new THREE.GridHelper(
      26,
      26,
      isDarkTheme ? 0x1e293b : 0xcbd5e1,
      isDarkTheme ? 0x131c2e : 0xe2e8f0
    );
    gridHelper.position.y = -2.85;
    scene.add(gridHelper);

    // ------------------------------------------------------------------------
    // 2. PBR MATERIALS & RENDER MODE TRACKING
    // ------------------------------------------------------------------------
    const realisticMats = {
      primarySheave: new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        metalness: 0.88,
        roughness: 0.18
      }),
      secondarySheave: new THREE.MeshStandardMaterial({
        color: 0x10b981,
        metalness: 0.88,
        roughness: 0.18
      }),
      sheaveRib: new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.85,
        roughness: 0.25
      }),
      steelBeltBlock: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.94,
        roughness: 0.16
      }),
      steelBand: new THREE.MeshStandardMaterial({
        color: 0xf97316,
        metalness: 0.88,
        roughness: 0.20,
        emissive: 0xea580c,
        emissiveIntensity: 0.25
      }),
      hydraulicChamber: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.82,
        roughness: 0.28
      }),
      hydraulicPiston: new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        metalness: 0.90,
        roughness: 0.18
      }),
      torqueConverter: new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.84,
        roughness: 0.24
      }),
      gears: new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        metalness: 0.90,
        roughness: 0.20
      }),
      diffCage: new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.86,
        roughness: 0.26
      }),
      shaftSteel: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.92,
        roughness: 0.16
      }),
      casing: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.32,
        roughness: 0.24,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    };

    const rawSolidMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.15, roughness: 0.55 });
    const rawCasingMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.1,
      roughness: 0.6,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const wireframePrimaryMat = new THREE.MeshBasicMaterial({ color: 0xfb6514, wireframe: true });
    const wireframeCasingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.22
    });

    const trackedMeshes = [];
    const registerMesh = (mesh, type, includeWire = true) => {
      const baseMat = realisticMats[type] || realisticMats.shaftSteel;
      mesh.material = baseMat;
      const isTranslucent = type === 'casing';
      mesh.castShadow = !isTranslucent;
      mesh.receiveShadow = true;

      let wireOverlay = null;
      if (includeWire) {
        const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
        const wireMat = new THREE.LineBasicMaterial({
          color: 0xfb6514,
          transparent: true,
          opacity: isTranslucent ? 0.16 : 0.32
        });
        wireOverlay = new THREE.LineSegments(wireGeo, wireMat);
        wireOverlay.visible = false;
        mesh.add(wireOverlay);
      }

      trackedMeshes.push({ mesh, type, baseMat, wireOverlay });
      return mesh;
    };

    const cvtRoot = new THREE.Group();
    scene.add(cvtRoot);

    // ------------------------------------------------------------------------
    // 3. VARIABLE CONICAL PULLEY SHEAVES (ROTATED COAXIALLY ON Z-AXIS!)
    // ------------------------------------------------------------------------
    // Build a conical sheave whose axis of rotation is the Z-axis!
    // side = -1 for Rear Sheave (located at -Z, conical V-face facing +Z)
    // side = +1 for Front Sheave (located at +Z, conical V-face facing -Z)
    // At r = SHEAVE_INNER_R, the conical face starts at local z = 0.
    // As r increases to SHEAVE_OUTER_R, the conical face slopes away from the belt plane
    // to local z = side * (SHEAVE_OUTER_R - SHEAVE_INNER_R) * SHEAVE_SLOPE.
    const buildSheaveAssembly = (side, matType) => {
      const holder = new THREE.Group();
      const coneDrop = (SHEAVE_OUTER_R - SHEAVE_INNER_R) * SHEAVE_SLOPE; // ~0.364
      const rimBack = coneDrop + 0.14;
      const hubBack = coneDrop + 0.28;

      // LatheGeometry revolves around Y-axis; we rotateX(Math.PI / 2) so Y becomes Z!
      const lathePts = [
        new THREE.Vector2(0.24, 0),
        new THREE.Vector2(SHEAVE_INNER_R, 0),
        new THREE.Vector2(SHEAVE_OUTER_R, side * coneDrop),
        new THREE.Vector2(SHEAVE_OUTER_R, side * rimBack),
        new THREE.Vector2(0.58, side * hubBack),
        new THREE.Vector2(0.24, side * hubBack)
      ];
      const sheaveGeo = new THREE.LatheGeometry(lathePts, 44);
      sheaveGeo.rotateX(Math.PI / 2);
      const sheaveMesh = registerMesh(new THREE.Mesh(sheaveGeo), matType);
      holder.add(sheaveMesh);

      // Add 8 Radial Cooling / Stiffening Spokes on the back of the sheave so rotation is super clear!
      const ribGeo = new THREE.BoxGeometry(SHEAVE_OUTER_R - 0.44, 0.07, 0.08);
      for (let rIdx = 0; rIdx < 8; rIdx++) {
        const ang = (rIdx / 8) * Math.PI * 2;
        const rib = registerMesh(new THREE.Mesh(ribGeo), 'sheaveRib', false);
        const midR = (SHEAVE_OUTER_R + 0.42) * 0.5;
        rib.position.set(
          Math.cos(ang) * midR,
          Math.sin(ang) * midR,
          side * (coneDrop + 0.14)
        );
        rib.rotation.z = ang;
        holder.add(rib);
      }

      return holder;
    };

    // A. PRIMARY PULLEY (Input / Drive) at (x = PRIMARY_X, y = PULLEY_Y, z = 0)
    const primaryGroup = new THREE.Group();
    primaryGroup.position.set(PRIMARY_X, PULLEY_Y, 0);
    cvtRoot.add(primaryGroup);

    // Splined Primary Shaft
    const pShaftGeo = new THREE.CylinderGeometry(0.25, 0.25, 4.1, 24);
    pShaftGeo.rotateX(Math.PI / 2);
    primaryGroup.add(registerMesh(new THREE.Mesh(pShaftGeo), 'shaftSteel'));

    const pRearSheave = buildSheaveAssembly(-1, 'primarySheave');
    const pFrontSheave = buildSheaveAssembly(1, 'primarySheave');
    primaryGroup.add(pRearSheave, pFrontSheave);

    // Primary Hydraulic Clamping Cylinder & Golden Internal Piston (on Front +Z side)
    const pHydCylinderGeo = new THREE.CylinderGeometry(1.06, 1.06, 0.48, 32, 1, true);
    pHydCylinderGeo.rotateX(Math.PI / 2);
    const pHydCylinderMesh = registerMesh(new THREE.Mesh(pHydCylinderGeo), 'hydraulicChamber');
    pHydCylinderMesh.position.z = 0.82;
    pFrontSheave.add(pHydCylinderMesh);

    const pHydPistonGeo = new THREE.CylinderGeometry(1.00, 1.00, 0.16, 32);
    pHydPistonGeo.rotateX(Math.PI / 2);
    const pHydPistonMesh = registerMesh(new THREE.Mesh(pHydPistonGeo), 'hydraulicPiston');
    pHydPistonMesh.position.z = 0.68;
    pFrontSheave.add(pHydPistonMesh);

    // B. SECONDARY PULLEY (Output / Driven) at (x = SECONDARY_X, y = PULLEY_Y, z = 0)
    const secondaryGroup = new THREE.Group();
    secondaryGroup.position.set(SECONDARY_X, PULLEY_Y, 0);
    cvtRoot.add(secondaryGroup);

    // Splined Secondary Shaft
    const sShaftGeo = new THREE.CylinderGeometry(0.25, 0.25, 4.1, 24);
    sShaftGeo.rotateX(Math.PI / 2);
    secondaryGroup.add(registerMesh(new THREE.Mesh(sShaftGeo), 'shaftSteel'));

    const sRearSheave = buildSheaveAssembly(-1, 'secondarySheave');
    const sFrontSheave = buildSheaveAssembly(1, 'secondarySheave');
    secondaryGroup.add(sRearSheave, sFrontSheave);

    // Secondary Hydraulic Clamping Cylinder & Helical Preload Spring (on Rear -Z side)
    const sHydCylinderGeo = new THREE.CylinderGeometry(1.06, 1.06, 0.48, 32, 1, true);
    sHydCylinderGeo.rotateX(Math.PI / 2);
    const sHydCylinderMesh = registerMesh(new THREE.Mesh(sHydCylinderGeo), 'hydraulicChamber');
    sHydCylinderMesh.position.z = -0.82;
    sRearSheave.add(sHydCylinderMesh);

    const sHydPistonGeo = new THREE.CylinderGeometry(1.00, 1.00, 0.16, 32);
    sHydPistonGeo.rotateX(Math.PI / 2);
    const sHydPistonMesh = registerMesh(new THREE.Mesh(sHydPistonGeo), 'hydraulicPiston');
    sHydPistonMesh.position.z = -0.68;
    sRearSheave.add(sHydPistonMesh);

    // ------------------------------------------------------------------------
    // 4. VAN DOORNE STEEL PUSH-BELT (PROPERLY WEDGED ACROSS Z-AXIS!)
    // ------------------------------------------------------------------------
    const beltGroup = new THREE.Group();
    cvtRoot.add(beltGroup);

    // Each Van Doorne steel push-element has:
    //   - Width along Z-axis (wedging between the -Z and +Z conical sheaves):
    //     wider at outer radius (+Y in local frame, 2 * BELT_HALF_WIDTH = 0.44)
    //     and narrower at inner radius (-Y in local frame, 0.30) matching SHEAVE_SLOPE!
    //   - Thin lamination thickness (0.048) along local X-axis (direction of belt travel)!
    const blockShape = new THREE.Shape();
    const wOuter = BELT_HALF_WIDTH * 1.12; // +0.246
    const wInner = BELT_HALF_WIDTH * 0.72; // +0.158
    const hRadial = 0.26;
    blockShape.moveTo(-wOuter, hRadial * 0.5);
    blockShape.lineTo(-wOuter * 0.42, hRadial * 0.5);
    // Saddle slot for the left & right laminated maraging steel bands
    blockShape.lineTo(-wOuter * 0.42, hRadial * 0.08);
    blockShape.lineTo(wOuter * 0.42, hRadial * 0.08);
    blockShape.lineTo(wOuter * 0.42, hRadial * 0.5);
    blockShape.lineTo(wOuter, hRadial * 0.5);
    // Angled conical V-flanks that grip the 11-deg pulley sheaves
    blockShape.lineTo(wInner, -hRadial * 0.5);
    blockShape.lineTo(-wInner, -hRadial * 0.5);
    blockShape.closePath();

    const pushBlockGeo = new THREE.ExtrudeGeometry(blockShape, {
      depth: 0.044,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.005,
      bevelThickness: 0.005
    });
    pushBlockGeo.translate(0, 0, -0.022);
    // Rotate so the V-wedge width (originally X) spans the Z-axis,
    // and the thin extrusion depth (originally Z) points along local +X (belt tangent)!
    pushBlockGeo.rotateY(Math.PI / 2);

    const blockCount = 72;
    const pushBlockMeshes = [];
    for (let b = 0; b < blockCount; b++) {
      const bMesh = registerMesh(new THREE.Mesh(pushBlockGeo), 'steelBeltBlock', false);
      beltGroup.add(bMesh);
      pushBlockMeshes.push(bMesh);
    }

    // 2 Laminated High-Tensile Maraging Steel Tension Loops (Nested 12-layer steel bands)
    const rearSteelBandMesh = registerMesh(new THREE.Mesh(new THREE.BufferGeometry()), 'steelBand', false);
    const frontSteelBandMesh = registerMesh(new THREE.Mesh(new THREE.BufferGeometry()), 'steelBand', false);
    beltGroup.add(rearSteelBandMesh, frontSteelBandMesh);

    // ------------------------------------------------------------------------
    // 5. SCULPTED TORQUE CONVERTER & PLANETARY REVERSER (ON INPUT SHAFT -Z)
    // ------------------------------------------------------------------------
    const torqueConverterGroup = new THREE.Group();
    torqueConverterGroup.position.set(PRIMARY_X, PULLEY_Y, -2.35);
    cvtRoot.add(torqueConverterGroup);

    // Contoured Automotive Torque Converter Torus Shell (Axis along Z!)
    const tcLathePts = [
      new THREE.Vector2(0.26, -0.42),
      new THREE.Vector2(0.92, -0.40),
      new THREE.Vector2(1.26, -0.22),
      new THREE.Vector2(1.32, 0.0),
      new THREE.Vector2(1.24, 0.24),
      new THREE.Vector2(0.88, 0.38),
      new THREE.Vector2(0.28, 0.40)
    ];
    const tcShellGeo = new THREE.LatheGeometry(tcLathePts, 36);
    tcShellGeo.rotateX(Math.PI / 2);
    torqueConverterGroup.add(registerMesh(new THREE.Mesh(tcShellGeo), 'torqueConverter'));

    // Starter Ring Gear around Torque Converter Perimeter
    const tcRingGearGeo = createToothedGearGeo({
      pitchRadius: 1.36,
      teethCount: 42,
      faceWidth: 0.14,
      boreRadius: 1.20,
      helicalAngle: 0,
      hasLighteningHoles: false
    });
    const tcRingGearMesh = registerMesh(new THREE.Mesh(tcRingGearGeo), 'hydraulicPiston', false);
    tcRingGearMesh.position.z = -0.12;
    torqueConverterGroup.add(tcRingGearMesh);

    // 12 External Cooling & Stiffening Ribs on Torque Converter Shell
    const tcFinGeo = new THREE.BoxGeometry(0.55, 0.05, 0.12);
    for (let f = 0; f < 12; f++) {
      const fa = (f / 12) * Math.PI * 2;
      const fin = registerMesh(new THREE.Mesh(tcFinGeo), 'sheaveRib', false);
      fin.position.set(Math.cos(fa) * 0.78, Math.sin(fa) * 0.78, 0.36);
      fin.rotation.z = fa;
      torqueConverterGroup.add(fin);
    }

    // ------------------------------------------------------------------------
    // 6. TOOTHED HELICAL FINAL REDUCTION GEARSET & FRONT DIFFERENTIAL (+Z)
    // ------------------------------------------------------------------------
    const finalDriveGroup = new THREE.Group();
    cvtRoot.add(finalDriveGroup);

    // A. Output Reduction Pinion on Secondary Shaft (at x = SECONDARY_X, y = PULLEY_Y, z = +1.92)
    const secPinionGroup = new THREE.Group();
    secPinionGroup.position.set(SECONDARY_X, PULLEY_Y, 1.92);
    finalDriveGroup.add(secPinionGroup);

    const secPinionGeo = createToothedGearGeo({
      pitchRadius: 0.56,
      teethCount: 16,
      faceWidth: 0.36,
      boreRadius: 0.24,
      helicalAngle: 0.14,
      hasLighteningHoles: false
    });
    secPinionGroup.add(registerMesh(new THREE.Mesh(secPinionGeo), 'gears'));

    // B. Differential Crown Wheel & Open Differential Spider Cage
    // Placed at (x = 0.35, y = -1.15, z = +1.92) so distance to Secondary Shaft is
    // sqrt((1.65 - 0.35)^2 + (0.25 - (-1.15))^2) = sqrt(1.69 + 1.96) = 1.91 units!
    // Pinion R (0.56) + Crown Wheel R (1.35) = 1.91 units -> Exact tooth mesh!
    const diffGroup = new THREE.Group();
    diffGroup.position.set(0.35, -1.15, 1.92);
    finalDriveGroup.add(diffGroup);

    const crownWheelGeo = createToothedGearGeo({
      pitchRadius: 1.35,
      teethCount: 38,
      faceWidth: 0.36,
      boreRadius: 0.52,
      helicalAngle: -0.14,
      hasLighteningHoles: true
    });
    diffGroup.add(registerMesh(new THREE.Mesh(crownWheelGeo), 'gears'));

    // Differential Carrier Cage & Cross-Pin
    const carrierCageGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.85, 24);
    carrierCageGeo.rotateX(Math.PI / 2);
    diffGroup.add(registerMesh(new THREE.Mesh(carrierCageGeo), 'diffCage'));

    // Left & Right CV Drive Axles exiting Differential along Z
    const axleGeo = new THREE.CylinderGeometry(0.20, 0.20, 2.6, 20);
    axleGeo.rotateX(Math.PI / 2);
    diffGroup.add(registerMesh(new THREE.Mesh(axleGeo), 'shaftSteel'));

    // ------------------------------------------------------------------------
    // 7. SCULPTED ORGANIC CAST-ALUMINUM CVT TRANSMISSION HOUSING
    // ------------------------------------------------------------------------
    const casingGroup = new THREE.Group();
    cvtRoot.add(casingGroup);

    // Sculpted multi-lobe transaxle casing wrapping around Primary Pulley, Secondary Pulley, and Differential
    const casingShape = new THREE.Shape();
    casingShape.moveTo(PRIMARY_X - 1.85, PULLEY_Y);
    casingShape.absarc(PRIMARY_X, PULLEY_Y, 1.85, Math.PI, Math.PI * 0.38, true);
    casingShape.quadraticCurveTo(0, PULLEY_Y + 1.42, SECONDARY_X - 0.65, PULLEY_Y + 1.72);
    casingShape.absarc(SECONDARY_X, PULLEY_Y, 1.85, Math.PI * 0.62, -Math.PI * 0.22, true);
    casingShape.quadraticCurveTo(1.85, -1.95, 0.35, -2.65);
    casingShape.quadraticCurveTo(-0.95, -2.65, PRIMARY_X - 1.15, -1.35);
    casingShape.absarc(PRIMARY_X, PULLEY_Y, 1.85, -Math.PI * 0.68, -Math.PI, true);

    const rearCaseGeo = new THREE.ExtrudeGeometry(casingShape, {
      depth: 2.85,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.05,
      bevelThickness: 0.05
    });
    rearCaseGeo.translate(0, 0, -2.85);
    const rearCasingMesh = registerMesh(new THREE.Mesh(rearCaseGeo), 'casing');
    casingGroup.add(rearCasingMesh);

    const frontCaseGeo = new THREE.ExtrudeGeometry(casingShape, {
      depth: 2.45,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.05,
      bevelThickness: 0.05
    });
    frontCaseGeo.translate(0, 0, 0.02);
    const frontCasingMesh = registerMesh(new THREE.Mesh(frontCaseGeo), 'casing');
    casingGroup.add(frontCasingMesh);

    // Finned Mechatronic Electro-Hydraulic Valve Body Sump at the bottom of the casing
    const sumpGeo = new THREE.BoxGeometry(2.85, 0.36, 3.6);
    const sumpMesh = registerMesh(new THREE.Mesh(sumpGeo), 'casing', false);
    sumpMesh.position.set(-0.25, -2.68, -0.35);
    casingGroup.add(sumpMesh);

    // ------------------------------------------------------------------------
    // 8. EXACT CONSTANT-LENGTH BELT KINEMATICS & ANIMATION LOOP
    // ------------------------------------------------------------------------
    // Given target CVT Ratio = R2 / R1, solve for Primary Pitch Radius R1 and Secondary Pitch Radius R2
    // so that total belt wrap length L remains constant!
    const computePulleyRadii = (ratioVal) => {
      const minR = 0.56;
      const maxR = 1.46;
      const t = Math.max(0, Math.min(1, (2.50 - ratioVal) / (2.50 - 0.45)));
      const r1 = minR + t * (maxR - minR);
      const r2 = maxR - t * (maxR - minR);
      return { r1, r2 };
    };

    // Build exact C1-smooth exterior tangent loop around Primary (X1, Y) and Secondary (X2, Y)
    // Going Clockwise:
    //   1. Top Straight Tangent (Primary Top -> Secondary Top)
    //   2. Secondary Right Outer Arc (Top -> +X Outer Right -> Bottom)
    //   3. Bottom Straight Tangent (Secondary Bottom -> Primary Bottom)
    //   4. Primary Left Outer Arc (Bottom -> -X Outer Left -> Top)
    const sampleBeltLoop = (r1, r2, uRaw) => {
      const u = ((uRaw % 1) + 1) % 1;
      const C = SHAFT_DIST;
      const sinGamma = Math.max(-0.95, Math.min(0.95, (r1 - r2) / C));
      const gamma = Math.asin(sinGamma);
      const cosGamma = Math.cos(gamma);

      // Outward normal angles at tangent points:
      // Top normal angle = pi/2 - gamma
      // Bottom normal angle = -pi/2 + gamma
      const topAngle = Math.PI * 0.5 - gamma;
      const botAngle = -Math.PI * 0.5 + gamma;

      const p1Top = new THREE.Vector2(
        PRIMARY_X + Math.cos(topAngle) * r1,
        PULLEY_Y + Math.sin(topAngle) * r1
      );
      const p2Top = new THREE.Vector2(
        SECONDARY_X + Math.cos(topAngle) * r2,
        PULLEY_Y + Math.sin(topAngle) * r2
      );
      const p2Bot = new THREE.Vector2(
        SECONDARY_X + Math.cos(botAngle) * r2,
        PULLEY_Y + Math.sin(botAngle) * r2
      );
      const p1Bot = new THREE.Vector2(
        PRIMARY_X + Math.cos(botAngle) * r1,
        PULLEY_Y + Math.sin(botAngle) * r1
      );

      // Segment lengths:
      const lenTop = C * cosGamma;
      const sweep2 = topAngle - botAngle; // pi - 2*gamma
      const lenArc2 = r2 * sweep2;
      const lenBot = C * cosGamma;
      const sweep1 = 2 * Math.PI - sweep2; // pi + 2*gamma
      const lenArc1 = r1 * sweep1;
      const totalLen = lenTop + lenArc2 + lenBot + lenArc1;

      const d = u * totalLen;
      if (d < lenTop) {
        // 1. Top Tangent (Primary Top -> Secondary Top)
        const f = d / lenTop;
        return {
          x: p1Top.x + (p2Top.x - p1Top.x) * f,
          y: p1Top.y + (p2Top.y - p1Top.y) * f,
          tx: cosGamma,
          ty: -sinGamma
        };
      }
      const d2 = d - lenTop;
      if (d2 < lenArc2) {
        // 2. Secondary Right Outer Arc (Clockwise from topAngle down to botAngle)
        const f = d2 / lenArc2;
        const ang = topAngle - f * sweep2;
        return {
          x: SECONDARY_X + Math.cos(ang) * r2,
          y: PULLEY_Y + Math.sin(ang) * r2,
          tx: Math.sin(ang),
          ty: -Math.cos(ang)
        };
      }
      const d3 = d2 - lenArc2;
      if (d3 < lenBot) {
        // 3. Bottom Tangent (Secondary Bottom -> Primary Bottom)
        const f = d3 / lenBot;
        return {
          x: p2Bot.x + (p1Bot.x - p2Bot.x) * f,
          y: p2Bot.y + (p1Bot.y - p2Bot.y) * f,
          tx: -cosGamma,
          ty: -sinGamma
        };
      }
      // 4. Primary Left Outer Arc (Clockwise from botAngle + 2*pi down to topAngle)
      const d4 = d3 - lenBot;
      const f = d4 / lenArc1;
      const ang = botAngle + Math.PI * 2 - f * sweep1;
      return {
        x: PRIMARY_X + Math.cos(ang) * r1,
        y: PULLEY_Y + Math.sin(ang) * r1,
        tx: Math.sin(ang),
        ty: -Math.cos(ang)
      };
    };

    const updateMaterialModes = () => {
      const {
        renderMode: rMode,
        casingOpacity: cOp,
        cutawayMode: cut,
        showCasing: sCase,
        showSteelBelt: sBelt,
        showTorqueConverter: sTc,
        showFinalDrive: sFd,
        exploded: exp,
        theme: activeTheme
      } = simParams.current;

      realisticMats.casing.opacity = cOp;
      rawCasingMat.opacity = cOp;
      wireframeCasingMat.opacity = Math.max(0.14, cOp);

      trackedMeshes.forEach(({ mesh, type, baseMat, wireOverlay }) => {
        const isTranslucent = type === 'casing';

        if (rMode === 'realistic') {
          mesh.material = baseMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (rMode === 'raw') {
          mesh.material = isTranslucent ? rawCasingMat : rawSolidMat;
          if (wireOverlay) {
            wireOverlay.visible = !isTranslucent;
            wireOverlay.material.color.setHex(activeTheme === 'dark' ? 0x1f2937 : 0x94a3b8);
            wireOverlay.material.opacity = 0.2;
          }
        } else if (rMode === 'wireframe') {
          mesh.material = isTranslucent ? wireframeCasingMat : wireframePrimaryMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (rMode === 'shaded_wire') {
          mesh.material = baseMat;
          if (wireOverlay) {
            wireOverlay.visible = true;
            wireOverlay.material.color.setHex(0xfb6514);
            wireOverlay.material.opacity = isTranslucent ? 0.18 : 0.42;
          }
        }
      });

      casingGroup.visible = sCase;
      frontCasingMesh.visible = sCase && (!cut || exp > 0.08);
      beltGroup.visible = sBelt;
      torqueConverterGroup.visible = sTc;
      finalDriveGroup.visible = sFd;

      // Exploded View Separation
      frontCasingMesh.position.z = exp * 1.45;
      rearCasingMesh.position.z = -exp * 1.25;
      torqueConverterGroup.position.z = -2.35 - exp * 1.05;
      finalDriveGroup.position.z = exp * 0.95;
    };

    let lastTime = performance.now();
    let beltPhase = 0;
    let currentRatio = simParams.current.cvtRatio;
    let uiCounter = 0;
    let animationFrameId;

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, 0.05) : 0.016;

      const {
        isPlaying: playing,
        engineRpm: engRpm,
        throttlePct: throttle,
        driveMode: mode,
        cvtRatio: userRatio,
        isVirtualMode: isVirt,
        virtualGear: vGear,
        autoRotateCam: autoCam
      } = simParams.current;

      // Smoothly interpolate active CVT Ratio
      let targetRatio = userRatio;
      if (isVirt) {
        const vg = VIRTUAL_7_SPEEDS.find((v) => v.gear === vGear) || VIRTUAL_7_SPEEDS[2];
        targetRatio = vg.ratio;
      }
      currentRatio += (targetRatio - currentRatio) * Math.min(1, dt * 10);

      const { r1, r2 } = computePulleyRadii(currentRatio);

      // EXACT SHEAVE AXIAL CLAMPING POSITIONS:
      // At running radius R, the conical face of a sheave is at local |z| = (R - SHEAVE_INNER_R) * SHEAVE_SLOPE.
      // For the conical face to touch the belt flank at |z| = BELT_HALF_WIDTH:
      //   zSheaveOffset(R) = BELT_HALF_WIDTH - (R - SHEAVE_INNER_R) * SHEAVE_SLOPE
      // When R increases, zSheaveOffset decreases (sheaves squeeze together!).
      const pOffset = BELT_HALF_WIDTH - (r1 - SHEAVE_INNER_R) * SHEAVE_SLOPE;
      const sOffset = BELT_HALF_WIDTH - (r2 - SHEAVE_INNER_R) * SHEAVE_SLOPE;

      pRearSheave.position.z = -pOffset;
      pFrontSheave.position.z = pOffset;

      sRearSheave.position.z = -sOffset;
      sFrontSheave.position.z = sOffset;

      // Rotational kinematics (Clockwise rotation around Z means negative Z angle)
      const dirSign = mode === 'R' ? 1 : -1;
      const isEngaged = playing && mode !== 'P' && mode !== 'N';
      const inOmega = isEngaged ? dirSign * ((engRpm * 2 * Math.PI) / 60) * 0.08 : 0;
      const outOmega = inOmega / currentRatio;

      // Torque converter always spins with engine when playing
      const tcOmega = playing ? -((engRpm * 2 * Math.PI) / 60) * 0.08 : 0;
      torqueConverterGroup.rotation.z += tcOmega * dt;

      primaryGroup.rotation.z += inOmega * dt;
      secondaryGroup.rotation.z += outOmega * dt;
      secPinionGroup.rotation.z = secondaryGroup.rotation.z;
      // Crown wheel (38T) driven by Secondary Pinion (16T) in opposite direction
      diffGroup.rotation.z -= outOmega * (16 / 38) * dt;

      // Advance Steel Push-Belt along the loop at exact linear pitch speed v = omega_1 * r_1
      if (isEngaged) {
        const linearSpeed = (-inOmega * r1) * 0.105;
        beltPhase = ((beltPhase + linearSpeed * dt) % 1 + 1) % 1;
      }

      // Position all 72 Steel Push-Blocks & build the 2 Laminated Steel Bands
      const bandSamples = 96;
      const bandCurvePts = [];
      for (let s = 0; s < bandSamples; s++) {
        const sp = sampleBeltLoop(r1, r2, s / bandSamples);
        bandCurvePts.push(new THREE.Vector3(sp.x, sp.y, 0));
      }
      const bandCurve = new THREE.CatmullRomCurve3(bandCurvePts, true);

      rearSteelBandMesh.geometry.dispose();
      frontSteelBandMesh.geometry.dispose();
      const bandTubeGeo = new THREE.TubeGeometry(bandCurve, 96, 0.032, 8, true);
      rearSteelBandMesh.geometry = bandTubeGeo;
      frontSteelBandMesh.geometry = bandTubeGeo.clone();
      rearSteelBandMesh.position.z = -0.13;
      frontSteelBandMesh.position.z = 0.13;

      for (let b = 0; b < blockCount; b++) {
        const u = (beltPhase + b / blockCount) % 1;
        const sp = sampleBeltLoop(r1, r2, u);
        const bMesh = pushBlockMeshes[b];
        bMesh.position.set(sp.x, sp.y, 0);
        // Align local +X (block tangent) with (tx, ty) and local +Y (outward normal) with (-ty, tx)
        bMesh.rotation.z = Math.atan2(sp.ty, sp.tx);
      }

      updateMaterialModes();

      controls.autoRotate = autoCam;
      controls.autoRotateSpeed = 1.1;
      controls.update();
      renderer.render(scene, camera);

      // Update React Telemetry HUD every ~6 frames
      uiCounter++;
      if (uiCounter % 6 === 0) {
        const actualInRpm = mode === 'P' || mode === 'N' ? Math.round(engRpm * 0.45) : engRpm;
        const actualOutRpm =
          mode === 'P' || mode === 'N' ? 0 : Math.round(actualInRpm / currentRatio);
        const engineTorqueNm = Math.round(180 + (throttle / 100) * 140);
        const actualOutTorque =
          mode === 'P' || mode === 'N' ? 0 : Math.round(engineTorqueNm * currentRatio * 0.95);
        const wheelRpm = actualOutRpm * (16 / 38);
        const speedKmh = Math.round((wheelRpm * 2 * Math.PI * 0.31 * 60) / 1000);
        const clampPressure = Math.round(28 + (throttle / 100) * 26 + (currentRatio > 1.5 ? 14 : 0));

        setTelemetry({
          inputRpm: actualInRpm,
          outputRpm: mode === 'R' ? -actualOutRpm : actualOutRpm,
          actualRatio: +currentRatio.toFixed(2),
          outputTorqueNm: actualOutTorque,
          roadSpeedKmh: Math.max(0, speedKmh),
          primaryDiameterMm: Math.round(r1 * 135),
          secondaryDiameterMm: Math.round(r2 * 135),
          clampPressureBar: clampPressure
        });
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  const sheet = {
    panel: 'bg-white text-[#101828]',
    idle: 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]',
    chosen: 'bg-[#101828] text-white'
  };
  const hit =
    'cursor-pointer text-base leading-snug focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fb6514]';

  return (
    <div className="relative h-full w-full select-none overflow-hidden font-sans">
      {/* 3D WebGL Viewport */}
      <div
        ref={mountRef}
        className="absolute inset-0 z-0 h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* =========================================================
          TOP-LEFT: CVT TELEMETRY, RATIO MONITOR & DRIVE MODES
      ========================================================= */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-h-[calc(100%-11rem)] w-[min(28rem,calc(100%-2rem))] overflow-y-auto max-[720px]:max-h-[50%] max-[720px]:w-[calc(100%-2rem)]">
        <section
          aria-label="Steel-Belt CVT Transmission"
          className={`pointer-events-auto flex flex-col gap-5 p-5 ${sheet.panel}`}
          style={{ colorScheme: 'light' }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
              Steel-Belt CVT
            </h1>
            <p
              className="m-0 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#fb6514]"
              aria-label={`Rasio CVT ${telemetry.actualRatio} banding 1`}
            >
              {telemetry.actualRatio.toFixed(2)} : 1
            </p>
          </div>

          <p className="m-0 text-base leading-relaxed">
            Transmisi otomatis variabel kontinu sabuk baja Van Doorne. Piringan kerucut primer (biru) dan sekunder (hijau) bergeser secara hidrolis untuk mengubah diameter sabuk tanpa hentakan gigi.
          </p>

          {/* Drive Mode Selector Buttons: P - R - N - D - S */}
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Drive Mode Selector">
            {['P', 'R', 'N', 'D', 'S'].map((m) => {
              const active = driveMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setDriveMode(m);
                    if (m === 'S') setIsVirtualMode(true);
                    else if (m === 'D') setIsVirtualMode(false);
                  }}
                  className={`py-2.5 text-center text-base font-semibold tabular-nums ${hit} ${
                    active ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Virtual 7-Speed Stepped Selector when in Sport Mode (S) */}
          {isVirtualMode && (
            <div className="flex flex-col gap-1.5 bg-[#eef1f4] p-2.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Mode Virtual Sport (7-Percepatan)</span>
                <span className="font-mono text-[#fb6514]">Gear {virtualGear}</span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {VIRTUAL_7_SPEEDS.map((vg) => (
                  <button
                    key={vg.gear}
                    type="button"
                    onClick={() => setVirtualGear(vg.gear)}
                    className={`py-1 text-center text-sm font-bold ${hit} ${
                      virtualGear === vg.gear ? 'bg-[#fb6514] text-[#101828]' : 'bg-white text-[#101828]'
                    }`}
                  >
                    G{vg.gear}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2x2 Telemetry Readouts */}
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'Puli primer (In)',
                value: isPlaying ? telemetry.inputRpm : 0,
                unit: `rpm · Ø${telemetry.primaryDiameterMm}mm`
              },
              {
                label: 'Puli sekunder (Out)',
                value: isPlaying ? telemetry.outputRpm : 0,
                unit: `rpm · Ø${telemetry.secondaryDiameterMm}mm`
              },
              {
                label: 'Torsi output',
                value: isPlaying ? telemetry.outputTorqueNm : 0,
                unit: 'Nm'
              },
              {
                label: 'Tekanan & kecepatan',
                value: isPlaying ? `${telemetry.clampPressureBar}` : '0',
                unit: `bar · ${isPlaying ? telemetry.roadSpeedKmh : 0} km/j`
              }
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
          aria-label="CVT view"
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
                  className={`flex w-full items-center gap-2 px-3 py-3 text-left ${hit} ${
                    active ? 'bg-[#fb6514] text-[#101828]' : sheet.idle
                  }`}
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
              className={`col-span-2 px-3 py-3 text-left ${hit} ${
                cutawayMode ? sheet.chosen : sheet.idle
              }`}
            >
              Cutaway
            </button>
            {[
              { label: 'Casing & housing', state: showCasing, setter: setShowCasing },
              { label: 'Sabuk baja Van Doorne', state: showSteelBelt, setter: setShowSteelBelt },
              { label: 'Torque converter', state: showTorqueConverter, setter: setShowTorqueConverter },
              { label: 'Gardan & final drive', state: showFinalDrive, setter: setShowFinalDrive }
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
          {/* Column 1: Input RPM */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{engineRpm}</span> rpm input
            </p>
            <SquareRange
              min={800}
              max={6500}
              step={50}
              value={engineRpm}
              label="Input RPM"
              onChange={(e) => setEngineRpm(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 800, label: '800 idle' },
                { value: 2200, label: '2200 cruise' },
                { value: 4000, label: '4000 pass' },
                { value: 6000, label: '6000 max' }
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={engineRpm === preset.value}
                  onClick={() => {
                    setEngineRpm(preset.value);
                    setIsPlaying(true);
                  }}
                  className={`px-2 py-1 ${hit} ${
                    engineRpm === preset.value ? sheet.chosen : sheet.idle
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Column 2: Continuous CVT Ratio Slider */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{cvtRatio.toFixed(2)}:1</span> rasio CVT
            </p>
            <SquareRange
              min={0.45}
              max={2.50}
              step={0.05}
              value={cvtRatio}
              label="CVT Ratio"
              onChange={(e) => {
                setCvtRatio(Number(e.target.value));
                setIsVirtualMode(false);
              }}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { value: 2.50, label: '2.50 Low' },
                { value: 1.00, label: '1.00 Direct' },
                { value: 0.45, label: '0.45 Overdrive' }
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-pressed={!isVirtualMode && Math.abs(cvtRatio - preset.value) < 0.04}
                  onClick={() => {
                    setCvtRatio(preset.value);
                    setIsVirtualMode(false);
                  }}
                  className={`px-2 py-1 ${hit} ${
                    !isVirtualMode && Math.abs(cvtRatio - preset.value) < 0.04
                      ? sheet.chosen
                      : sheet.idle
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Column 3: Exploded View */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">{Math.round(exploded * 100)}%</span>{' '}
              exploded
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

          {/* Column 4: Casing Opacity */}
          <div className="flex flex-col gap-2">
            <p className="m-0 text-base">
              <span className="font-semibold tabular-nums">
                {Math.round(casingOpacity * 100)}%
              </span>{' '}
              solid
            </p>
            <SquareRange
              min={0.05}
              max={0.95}
              step={0.02}
              value={casingOpacity}
              label="Casing opacity"
              onChange={(e) => setCasingOpacity(Number(e.target.value))}
            />
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-base">
              <span>Clear</span>
              <span>Glass</span>
              <span>Solid</span>
            </p>
          </div>
        </section>

        {/* Transport Bar: Play / Pause, Orbit, Reset */}
        <div className={`pointer-events-auto flex flex-wrap items-center gap-2 p-3 ${sheet.panel}`}>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`inline-flex items-center gap-2 px-4 py-3 ${hit} ${
              isPlaying ? 'bg-[#fb6514] text-[#101828]' : sheet.chosen
            }`}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            aria-pressed={autoRotateCam}
            onClick={() => setAutoRotateCam(!autoRotateCam)}
            className={`inline-flex items-center gap-2 px-3 py-3 ${hit} ${
              autoRotateCam ? sheet.chosen : sheet.idle
            }`}
          >
            <Orbit className="h-4 w-4" />
            Orbit
          </button>
          <button
            type="button"
            onClick={() => {
              setEngineRpm(2200);
              setCvtRatio(1.45);
              setDriveMode('D');
              setIsVirtualMode(false);
              setExploded(0);
              setCasingOpacity(0.22);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowCasing(true);
              setShowSteelBelt(true);
              setShowTorqueConverter(true);
              setShowFinalDrive(true);
              setAutoRotateCam(false);
              if (cameraPresetRef.current) cameraPresetRef.current('iso');
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
