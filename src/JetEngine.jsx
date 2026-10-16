import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { 
  Play, Pause, RotateCcw, Eye, EyeOff, 
  Layers, Box, Grid, Cpu, Flame, 
  Sliders, Maximize2, Activity, Gauge, Zap, Info, Wind, Scissors, Compass
} from 'lucide-react';

const JET_SPECS = {
  bypassRatio: '9.6 : 1',
  pressureRatio: '42.0 : 1',
  maxThrustDry: 115, // kN
  maxThrustWet: 168, // kN with Afterburner
  maxN1Rpm: 5200,    // Low Pressure Spool (Fan + LPC + LPT)
  maxN2Rpm: 14800,   // High Pressure Spool (HPC + HPT)
  stages: [
    { id: 'fan', name: 'LP Titanium Wide-Chord Fan', z: 4.3, spool: 'N1', blades: 24 },
    { id: 'lpc', name: '3-Stage LP Booster Compressor', z: 2.9, spool: 'N1', blades: 34 },
    { id: 'hpc', name: '6-Stage HP Axial Compressor', z: 0.9, spool: 'N2', blades: 46 },
    { id: 'combustor', name: 'Annular Combustor (16 Fuel Nozzles)', z: -0.95, spool: 'STATIC', blades: 16 },
    { id: 'hpt', name: '2-Stage HP Turbine (Single-Crystal)', z: -2.05, spool: 'N2', blades: 42 },
    { id: 'lpt', name: '4-Stage LP Turbine', z: -3.25, spool: 'N1', blades: 52 },
    { id: 'nozzle', name: 'Variable Chevron Exhaust & Afterburner', z: -4.85, spool: 'STATIC', blades: 16 }
  ]
};

export default function JetEngine({ theme = 'dark' }) {
  const mountRef = useRef(null);

  const [throttle, setThrottle] = useState(45); // 0 to 100%
  const [afterburner, setAfterburner] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [renderMode, setRenderMode] = useState('realistic'); // 'realistic' | 'raw' | 'wireframe' | 'shaded_wire'
  const [exploded, setExploded] = useState(0); // 0 to 1 axial & radial separation
  const [casingOpacity, setCasingOpacity] = useState(0.28);
  const [cutawayMode, setCutawayMode] = useState(true); // Top-half 180 deg cutaway
  const [showNacelle, setShowNacelle] = useState(true);
  const [showCoreCase, setShowCoreCase] = useState(true);
  const [showStators, setShowStators] = useState(true);
  const [showAirflow, setShowAirflow] = useState(true);
  const [showCombustion, setShowCombustion] = useState(true);
  const [autoRotateCam, setAutoRotateCam] = useState(false);

  // Mutable ref accessed inside requestAnimationFrame
  const simParams = useRef({
    theme,
    throttle: 45,
    afterburner: false,
    isPlaying: true,
    renderMode: 'realistic',
    exploded: 0,
    casingOpacity: 0.28,
    cutawayMode: true,
    showNacelle: true,
    showCoreCase: true,
    showStators: true,
    showAirflow: true,
    showCombustion: true,
    autoRotateCam: false
  });

  const sceneElements = useRef({
    scene: null,
    gridHelper: null,
    ambientLight: null,
    coolRimLight: null,
    warmTailLight: null
  });

  // Spherical orbit camera state
  const camControl = useRef({
    isDragging: false,
    isPanning: false,
    prevX: 0,
    prevY: 0,
    theta: 0.78,
    phi: 1.22,
    radius: 14.5,
    target: new THREE.Vector3(0, 0.1, -0.2)
  });

  useEffect(() => {
    simParams.current = {
      theme,
      throttle,
      afterburner,
      isPlaying,
      renderMode,
      exploded,
      casingOpacity,
      cutawayMode,
      showNacelle,
      showCoreCase,
      showStators,
      showAirflow,
      showCombustion,
      autoRotateCam
    };

    const { scene, gridHelper, ambientLight, coolRimLight, warmTailLight } = sceneElements.current;
    if (scene) {
      if (theme === 'light') {
        scene.background.setHex(0xf8fafc);
        if (ambientLight) {
          ambientLight.color.setHex(0xffffff);
          ambientLight.intensity = 0.9;
        }
        if (gridHelper) {
          gridHelper.material.color.setHex(0x94a3b8);
        }
        if (coolRimLight) coolRimLight.intensity = 1.0;
        if (warmTailLight) warmTailLight.intensity = 0.9;
      } else {
        scene.background.setHex(0x05080f);
        if (ambientLight) {
          ambientLight.color.setHex(0xdbeafe);
          ambientLight.intensity = 0.7;
        }
        if (gridHelper) {
          gridHelper.material.color.setHex(0x1e293b);
        }
        if (coolRimLight) coolRimLight.intensity = 1.5;
        if (warmTailLight) warmTailLight.intensity = 1.2;
      }
    }
  }, [
    theme,
    throttle,
    afterburner,
    isPlaying,
    renderMode,
    exploded,
    casingOpacity,
    cutawayMode,
    showNacelle,
    showCoreCase,
    showStators,
    showAirflow,
    showCombustion,
    autoRotateCam
  ]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const isInitialDark = simParams.current.theme === 'dark';
    scene.background = new THREE.Color(isInitialDark ? 0x05080f : 0xf8fafc);
    sceneElements.current.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Aerospace Studio Lighting
    const ambientLight = new THREE.AmbientLight(
      isInitialDark ? 0xdbeafe : 0xffffff, 
      isInitialDark ? 0.7 : 0.9
    );
    scene.add(ambientLight);
    sceneElements.current.ambientLight = ambientLight;

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(12, 18, 14);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const coolRimLight = new THREE.DirectionalLight(0x38bdf8, isInitialDark ? 1.5 : 1.0);
    coolRimLight.position.set(-14, 6, 10);
    scene.add(coolRimLight);
    sceneElements.current.coolRimLight = coolRimLight;

    const warmTailLight = new THREE.DirectionalLight(0xfb6514, isInitialDark ? 1.2 : 0.9);
    warmTailLight.position.set(8, -10, -14);
    scene.add(warmTailLight);
    sceneElements.current.warmTailLight = warmTailLight;

    // Dynamic internal point lights for Combustor and Afterburner glow
    const combustorLight = new THREE.PointLight(0xff6600, 4.0, 6.0);
    combustorLight.position.set(0, 0, -0.95);
    scene.add(combustorLight);

    const afterburnerLight = new THREE.PointLight(0x3b82f6, 0, 10.0);
    afterburnerLight.position.set(0, 0, -5.8);
    scene.add(afterburnerLight);

    // Hangar Floor Reference Grid
    const gridHelper = new THREE.GridHelper(
      32, 
      32, 
      isInitialDark ? 0x1e293b : 0x94a3b8, 
      isInitialDark ? 0x0f172a : 0xe2e8f0
    );
    gridHelper.position.y = -3.2;
    scene.add(gridHelper);
    sceneElements.current.gridHelper = gridHelper;

    // Material Library
    const realisticMats = {
      titaniumFan: new THREE.MeshStandardMaterial({ color: 0xdbeafe, metalness: 0.92, roughness: 0.16 }),
      fanLeadingEdge: new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.96, roughness: 0.08 }),
      spinner: new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.28 }),
      spinnerSpiral: new THREE.MeshBasicMaterial({ color: 0xf8fafc }),
      lpShaft: new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.82, roughness: 0.25 }),
      hpShaft: new THREE.MeshStandardMaterial({ color: 0xfb6514, metalness: 0.85, roughness: 0.22 }),
      compressorBlade: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.88, roughness: 0.22 }),
      hpCompressorBlade: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.92, roughness: 0.18 }),
      statorVane: new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.78, roughness: 0.35 }),
      combustorLiner: new THREE.MeshStandardMaterial({
        color: 0xb45309,
        metalness: 0.75,
        roughness: 0.38,
        side: THREE.DoubleSide
      }),
      fuelNozzle: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 }),
      hptBlade: new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.86,
        roughness: 0.24,
        emissive: new THREE.Color(0x7c2d12),
        emissiveIntensity: 0.25
      }),
      lptBlade: new THREE.MeshStandardMaterial({
        color: 0x78716c,
        metalness: 0.84,
        roughness: 0.28
      }),
      exhaustNozzle: new THREE.MeshStandardMaterial({
        color: 0x27272a,
        metalness: 0.85,
        roughness: 0.32,
        side: THREE.DoubleSide
      }),
      intakeLip: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.14
      }),
      nacelle: new THREE.MeshPhysicalMaterial({
        color: 0x64748b,
        metalness: 0.35,
        roughness: 0.2,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide
      }),
      coreCasing: new THREE.MeshPhysicalMaterial({
        color: 0x94a3b8,
        metalness: 0.45,
        roughness: 0.25,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    };

    const rawSolidMat = new THREE.MeshLambertMaterial({ color: 0xd1d5db, side: THREE.DoubleSide });
    const rawCasingMat = new THREE.MeshLambertMaterial({
      color: 0x9ca3af,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const wireframePrimaryMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.82
    });
    const wireframeCasingMat = new THREE.MeshBasicMaterial({
      color: 0x475569,
      wireframe: true,
      transparent: true,
      opacity: 0.32
    });

    const trackedMeshes = [];
    const registerMesh = (mesh, type = 'compressorBlade', addWireOverlay = true) => {
      const baseMat = realisticMats[type] || realisticMats.compressorBlade;
      mesh.material = baseMat;
      const isTransparentCasing = type === 'nacelle' || type === 'coreCasing';
      mesh.castShadow = !isTransparentCasing;
      mesh.receiveShadow = true;

      let wireOverlay = null;
      if (addWireOverlay) {
        const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
        wireOverlay = new THREE.LineSegments(
          wireGeo,
          new THREE.LineBasicMaterial({
            color: 0x0f172a,
            transparent: true,
            opacity: 0.25
          })
        );
        wireOverlay.visible = false;
        mesh.add(wireOverlay);
      }

      trackedMeshes.push({ mesh, type, baseMat, wireOverlay });
      return mesh;
    };

    const createAirfoilGeometry = (bladeHeight, chord, thickness, twistAngleRad, camber = 0.03) => {
      const shape = new THREE.Shape();
      const halfC = chord / 2;
      shape.moveTo(-halfC, 0);
      shape.bezierCurveTo(-halfC * 0.4, thickness + camber, halfC * 0.4, thickness * 0.8 + camber, halfC, 0);
      shape.bezierCurveTo(halfC * 0.3, -thickness * 0.35 + camber * 0.4, -halfC * 0.4, -thickness * 0.45, -halfC, 0);

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: bladeHeight,
        steps: 10,
        bevelEnabled: false
      });

      geo.rotateX(-Math.PI / 2);

      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const t = Math.max(0, Math.min(1, y / bladeHeight));
        const angle = t * twistAngleRad;
        const scaleChord = 1.0 - t * 0.14;
        const sweepZ = Math.sin(t * Math.PI) * chord * 0.12;

        const sx = x * scaleChord;
        const sz = z * scaleChord + sweepZ;

        const nx = sx * Math.cos(angle) - sz * Math.sin(angle);
        const nz = sx * Math.sin(angle) + sz * Math.cos(angle);
        pos.setXYZ(i, nx, y, nz);
      }
      geo.computeVertexNormals();
      return geo;
    };

    const createRotorStage = ({
      hubRadius,
      tipRadius,
      diskWidth,
      bladeCount,
      chord,
      twistRad,
      baseAngleRad,
      materialType,
      includeWire = false
    }) => {
      const stageGroup = new THREE.Group();
      const diskGeo = new THREE.CylinderGeometry(hubRadius, hubRadius * 0.96, diskWidth, 32);
      diskGeo.rotateX(Math.PI / 2);
      const diskMesh = registerMesh(new THREE.Mesh(diskGeo), materialType, true);
      stageGroup.add(diskMesh);

      const bladeHeight = Math.max(0.15, tipRadius - hubRadius + 0.02);
      const bladeGeo = createAirfoilGeometry(bladeHeight, chord, chord * 0.14, twistRad);

      for (let b = 0; b < bladeCount; b++) {
        const theta = (b / bladeCount) * Math.PI * 2;
        const holder = new THREE.Group();
        holder.rotation.z = theta;

        const bladeMesh = registerMesh(new THREE.Mesh(bladeGeo), materialType, includeWire && b % 3 === 0);
        bladeMesh.position.y = hubRadius - 0.015;
        bladeMesh.rotation.y = baseAngleRad;
        holder.add(bladeMesh);

        stageGroup.add(holder);
      }
      return stageGroup;
    };

    const createStatorStage = ({ innerRadius, outerRadius, vaneCount, chord, vaneAngleRad }) => {
      const statorRoot = new THREE.Group();
      const topHalf = new THREE.Group();
      const bottomHalf = new THREE.Group();
      statorRoot.add(topHalf);
      statorRoot.add(bottomHalf);

      const vaneHeight = Math.max(0.15, outerRadius - innerRadius);
      const vaneGeo = createAirfoilGeometry(vaneHeight, chord, chord * 0.11, -0.18, -0.02);

      const shroudGeo = new THREE.CylinderGeometry(innerRadius + 0.02, innerRadius + 0.02, chord * 0.85, 28, 1, true);
      shroudGeo.rotateX(Math.PI / 2);
      const shroudMesh = registerMesh(new THREE.Mesh(shroudGeo), 'statorVane', false);
      statorRoot.add(shroudMesh);

      for (let v = 0; v < vaneCount; v++) {
        const theta = (v / vaneCount) * Math.PI * 2;
        const holder = new THREE.Group();
        holder.rotation.z = theta;

        const vaneMesh = registerMesh(new THREE.Mesh(vaneGeo), 'statorVane', false);
        vaneMesh.position.y = innerRadius;
        vaneMesh.rotation.y = vaneAngleRad;
        holder.add(vaneMesh);

        if (Math.cos(theta) > 0.05) {
          topHalf.add(holder);
        } else {
          bottomHalf.add(holder);
        }
      }

      return { statorRoot, topHalf, bottomHalf };
    };

    const engineRoot = new THREE.Group();
    scene.add(engineRoot);

    // ============================================================================
    // 1. N1 LOW-PRESSURE SPOOL
    // ============================================================================
    const n1SpoolGroup = new THREE.Group();
    engineRoot.add(n1SpoolGroup);

    const n1FanModule = new THREE.Group();
    const n1LpcModule = new THREE.Group();
    const n1ShaftModule = new THREE.Group();
    const n1LptModule = new THREE.Group();
    n1SpoolGroup.add(n1FanModule, n1LpcModule, n1ShaftModule, n1LptModule);

    const lpShaftGeo = new THREE.CylinderGeometry(0.18, 0.18, 8.6, 28);
    lpShaftGeo.rotateX(Math.PI / 2);
    const lpShaftMesh = registerMesh(new THREE.Mesh(lpShaftGeo), 'lpShaft', true);
    lpShaftMesh.position.z = 0.15;
    n1ShaftModule.add(lpShaftMesh);

    const spinnerPts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const r = Math.sin(t * (Math.PI / 2)) * 0.72;
      const y = (1 - t) * 1.35;
      spinnerPts.push(new THREE.Vector2(r, y));
    }
    const spinnerGeo = new THREE.LatheGeometry(spinnerPts, 36);
    spinnerGeo.rotateX(Math.PI / 2);
    const spinnerMesh = registerMesh(new THREE.Mesh(spinnerGeo), 'spinner', true);
    spinnerMesh.position.z = 4.55;
    n1FanModule.add(spinnerMesh);

    const spiralPts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const zLocal = 4.58 + (1 - t) * 1.22;
      const r = Math.sin(t * (Math.PI / 2)) * 0.725;
      const ang = t * Math.PI * 3.5;
      spiralPts.push(new THREE.Vector3(Math.cos(ang) * r, Math.sin(ang) * r, zLocal));
    }
    const spiralCurve = new THREE.CatmullRomCurve3(spiralPts);
    const spiralGeo = new THREE.TubeGeometry(spiralCurve, 40, 0.025, 8, false);
    const spiralMesh = new THREE.Mesh(spiralGeo, realisticMats.spinnerSpiral);
    n1FanModule.add(spiralMesh);

    const mainFanStage = createRotorStage({
      hubRadius: 0.72,
      tipRadius: 2.34,
      diskWidth: 0.52,
      bladeCount: 24,
      chord: 0.48,
      twistRad: 0.62,
      baseAngleRad: 0.42,
      materialType: 'titaniumFan',
      includeWire: true
    });
    mainFanStage.position.z = 4.3;
    n1FanModule.add(mainFanStage);

    const lpcSpecs = [
      { z: 3.3, hub: 0.66, tip: 1.24, blades: 30, chord: 0.24 },
      { z: 2.9, hub: 0.69, tip: 1.20, blades: 34, chord: 0.22 },
      { z: 2.5, hub: 0.72, tip: 1.16, blades: 38, chord: 0.20 }
    ];
    lpcSpecs.forEach((st) => {
      const stage = createRotorStage({
        hubRadius: st.hub,
        tipRadius: st.tip,
        diskWidth: 0.24,
        bladeCount: st.blades,
        chord: st.chord,
        twistRad: 0.38,
        baseAngleRad: 0.48,
        materialType: 'compressorBlade'
      });
      stage.position.z = st.z;
      n1LpcModule.add(stage);
    });

    const lptSpecs = [
      { z: -2.75, hub: 0.58, tip: 1.16, blades: 44, chord: 0.20 },
      { z: -3.12, hub: 0.55, tip: 1.24, blades: 48, chord: 0.21 },
      { z: -3.50, hub: 0.52, tip: 1.32, blades: 52, chord: 0.22 },
      { z: -3.88, hub: 0.48, tip: 1.40, blades: 56, chord: 0.24 }
    ];
    lptSpecs.forEach((st) => {
      const stage = createRotorStage({
        hubRadius: st.hub,
        tipRadius: st.tip,
        diskWidth: 0.22,
        bladeCount: st.blades,
        chord: st.chord,
        twistRad: -0.42,
        baseAngleRad: -0.52,
        materialType: 'lptBlade'
      });
      stage.position.z = st.z;
      n1LptModule.add(stage);
    });

    // ============================================================================
    // 2. N2 HIGH-PRESSURE SPOOL
    // ============================================================================
    const n2SpoolGroup = new THREE.Group();
    engineRoot.add(n2SpoolGroup);

    const n2HpcModule = new THREE.Group();
    const n2ShaftModule = new THREE.Group();
    const n2HptModule = new THREE.Group();
    n2SpoolGroup.add(n2HpcModule, n2ShaftModule, n2HptModule);

    const hpShaftGeo = new THREE.CylinderGeometry(0.34, 0.34, 4.35, 28, 1, false);
    hpShaftGeo.rotateX(Math.PI / 2);
    const hpShaftMesh = registerMesh(new THREE.Mesh(hpShaftGeo), 'hpShaft', true);
    hpShaftMesh.position.z = -0.25;
    n2ShaftModule.add(hpShaftMesh);

    const hpcSpecs = [
      { z: 1.85, hub: 0.74, tip: 1.12, blades: 40, chord: 0.19 },
      { z: 1.50, hub: 0.76, tip: 1.10, blades: 44, chord: 0.18 },
      { z: 1.15, hub: 0.78, tip: 1.08, blades: 48, chord: 0.17 },
      { z: 0.80, hub: 0.80, tip: 1.06, blades: 50, chord: 0.16 },
      { z: 0.45, hub: 0.81, tip: 1.05, blades: 54, chord: 0.15 },
      { z: 0.10, hub: 0.82, tip: 1.04, blades: 58, chord: 0.15 }
    ];
    hpcSpecs.forEach((st) => {
      const stage = createRotorStage({
        hubRadius: st.hub,
        tipRadius: st.tip,
        diskWidth: 0.19,
        bladeCount: st.blades,
        chord: st.chord,
        twistRad: 0.32,
        baseAngleRad: 0.54,
        materialType: 'hpCompressorBlade'
      });
      stage.position.z = st.z;
      n2HpcModule.add(stage);
    });

    const hptSpecs = [
      { z: -1.85, hub: 0.66, tip: 1.08, blades: 42, chord: 0.22 },
      { z: -2.25, hub: 0.62, tip: 1.12, blades: 44, chord: 0.22 }
    ];
    hptSpecs.forEach((st) => {
      const stage = createRotorStage({
        hubRadius: st.hub,
        tipRadius: st.tip,
        diskWidth: 0.23,
        bladeCount: st.blades,
        chord: st.chord,
        twistRad: -0.38,
        baseAngleRad: -0.48,
        materialType: 'hptBlade',
        includeWire: true
      });
      stage.position.z = st.z;
      n2HptModule.add(stage);
    });

    // ============================================================================
    // 3. STATOR VANES & COMBUSTOR
    // ============================================================================
    const statorsGroup = new THREE.Group();
    engineRoot.add(statorsGroup);
    const statorTopHalves = [];

    const ogvStage = createStatorStage({
      innerRadius: 1.28,
      outerRadius: 2.32,
      vaneCount: 28,
      chord: 0.42,
      vaneAngleRad: -0.25
    });
    ogvStage.statorRoot.position.z = 3.72;
    statorsGroup.add(ogvStage.statorRoot);
    statorTopHalves.push(ogvStage.topHalf);

    const statorPositions = [
      { z: 3.1, rIn: 0.68, rOut: 1.22, count: 32 },
      { z: 2.7, rIn: 0.70, rOut: 1.18, count: 36 },
      { z: 2.2, rIn: 0.73, rOut: 1.14, count: 38 },
      { z: 1.68, rIn: 0.75, rOut: 1.11, count: 42 },
      { z: 1.32, rIn: 0.77, rOut: 1.09, count: 44 },
      { z: 0.98, rIn: 0.79, rOut: 1.07, count: 46 },
      { z: 0.62, rIn: 0.80, rOut: 1.05, count: 48 },
      { z: 0.28, rIn: 0.81, rOut: 1.04, count: 50 },
      { z: -1.62, rIn: 0.68, rOut: 1.06, count: 36 },
      { z: -2.05, rIn: 0.64, rOut: 1.10, count: 38 },
      { z: -2.52, rIn: 0.60, rOut: 1.14, count: 40 },
      { z: -2.94, rIn: 0.56, rOut: 1.20, count: 44 },
      { z: -3.31, rIn: 0.53, rOut: 1.28, count: 46 },
      { z: -3.69, rIn: 0.50, rOut: 1.36, count: 48 }
    ];

    statorPositions.forEach((sp) => {
      const st = createStatorStage({
        innerRadius: sp.rIn,
        outerRadius: sp.rOut,
        vaneCount: sp.count,
        chord: 0.14,
        vaneAngleRad: -0.42
      });
      st.statorRoot.position.z = sp.z;
      statorsGroup.add(st.statorRoot);
      statorTopHalves.push(st.topHalf);
    });

    const combustorGroup = new THREE.Group();
    engineRoot.add(combustorGroup);

    const innerLinerGeo = new THREE.CylinderGeometry(0.68, 0.74, 1.25, 36, 1, true);
    innerLinerGeo.rotateX(Math.PI / 2);
    const innerLinerMesh = registerMesh(new THREE.Mesh(innerLinerGeo), 'combustorLiner', true);
    innerLinerMesh.position.z = -0.92;
    combustorGroup.add(innerLinerMesh);

    const outerLinerBottomGeo = new THREE.CylinderGeometry(1.12, 1.08, 1.25, 36, 1, true, Math.PI / 2, Math.PI);
    outerLinerBottomGeo.rotateX(Math.PI / 2);
    const outerLinerBottom = registerMesh(new THREE.Mesh(outerLinerBottomGeo), 'combustorLiner', true);
    outerLinerBottom.position.z = -0.92;
    combustorGroup.add(outerLinerBottom);

    const outerLinerTopGeo = new THREE.CylinderGeometry(1.12, 1.08, 1.25, 36, 1, true, -Math.PI / 2, Math.PI);
    outerLinerTopGeo.rotateX(Math.PI / 2);
    const outerLinerTop = registerMesh(new THREE.Mesh(outerLinerTopGeo), 'combustorLiner', true);
    outerLinerTop.position.z = -0.92;
    combustorGroup.add(outerLinerTop);

    const flameMaterials = [];
    const flameMeshes = [];

    for (let f = 0; f < 16; f++) {
      const ang = (f / 16) * Math.PI * 2;
      const rMid = 0.90;
      const fx = Math.cos(ang) * rMid;
      const fy = Math.sin(ang) * rMid;

      const nozzleGroup = new THREE.Group();
      nozzleGroup.position.set(fx, fy, -0.35);
      nozzleGroup.rotation.z = ang;

      const stemGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.35, 10);
      stemGeo.translate(0, 0.16, 0);
      const stemMesh = registerMesh(new THREE.Mesh(stemGeo), 'fuelNozzle', false);
      nozzleGroup.add(stemMesh);

      const swirlerGeo = new THREE.CylinderGeometry(0.085, 0.055, 0.14, 16);
      swirlerGeo.rotateX(Math.PI / 2);
      swirlerGeo.translate(0, 0, -0.08);
      const swirlerMesh = registerMesh(new THREE.Mesh(swirlerGeo), 'fuelNozzle', false);
      nozzleGroup.add(swirlerMesh);

      combustorGroup.add(nozzleGroup);

      const flameMat = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const flameConeGeo = new THREE.ConeGeometry(0.16, 1.1, 16, 1, true);
      flameConeGeo.rotateX(-Math.PI / 2);
      const flameMesh = new THREE.Mesh(flameConeGeo, flameMat);
      flameMesh.position.set(fx, fy, -0.95);
      combustorGroup.add(flameMesh);

      flameMaterials.push(flameMat);
      flameMeshes.push(flameMesh);
    }

    const coreFlameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const coreFlameGeo = new THREE.TorusGeometry(0.90, 0.14, 16, 48);
    const coreFlameRing = new THREE.Mesh(coreFlameGeo, coreFlameMat);
    coreFlameRing.position.z = -0.68;
    combustorGroup.add(coreFlameRing);

    // ============================================================================
    // 4. NACELLE, CORE DUCT & EXHAUST
    // ============================================================================
    const nacelleGroup = new THREE.Group();
    const nacelleTopGroup = new THREE.Group();
    const nacelleBottomGroup = new THREE.Group();
    nacelleGroup.add(nacelleTopGroup, nacelleBottomGroup);
    engineRoot.add(nacelleGroup);

    const lipPts = [
      new THREE.Vector2(2.35, 0.0),
      new THREE.Vector2(2.32, 0.35),
      new THREE.Vector2(2.42, 0.65),
      new THREE.Vector2(2.58, 0.55),
      new THREE.Vector2(2.68, 0.0)
    ];
    const lipBottomGeo = new THREE.LatheGeometry(lipPts, 48, Math.PI, Math.PI);
    lipBottomGeo.rotateX(Math.PI / 2);
    const lipBottomMesh = registerMesh(new THREE.Mesh(lipBottomGeo), 'intakeLip', true);
    lipBottomMesh.position.z = 4.55;
    nacelleBottomGroup.add(lipBottomMesh);

    const lipTopGeo = new THREE.LatheGeometry(lipPts, 48, 0, Math.PI);
    lipTopGeo.rotateX(Math.PI / 2);
    const lipTopMesh = registerMesh(new THREE.Mesh(lipTopGeo), 'intakeLip', true);
    lipTopMesh.position.z = 4.55;
    nacelleTopGroup.add(lipTopMesh);

    const nacellePts = [
      new THREE.Vector2(2.38, 0.65),
      new THREE.Vector2(2.55, 1.5),
      new THREE.Vector2(2.68, 2.7),
      new THREE.Vector2(2.72, 3.8),
      new THREE.Vector2(2.68, 4.55)
    ];
    const nacelleBottomGeo = new THREE.LatheGeometry(nacellePts, 48, Math.PI, Math.PI);
    nacelleBottomGeo.rotateX(Math.PI / 2);
    const nacelleBottomMesh = registerMesh(new THREE.Mesh(nacelleBottomGeo), 'nacelle', true);
    nacelleBottomGroup.add(nacelleBottomMesh);

    const nacelleTopGeo = new THREE.LatheGeometry(nacellePts, 48, 0, Math.PI);
    nacelleTopGeo.rotateX(Math.PI / 2);
    const nacelleTopMesh = registerMesh(new THREE.Mesh(nacelleTopGeo), 'nacelle', true);
    nacelleTopGroup.add(nacelleTopMesh);

    const coreCaseGroup = new THREE.Group();
    const coreTopGroup = new THREE.Group();
    const coreBottomGroup = new THREE.Group();
    coreCaseGroup.add(coreTopGroup, coreBottomGroup);
    engineRoot.add(coreCaseGroup);

    const corePts = [
      new THREE.Vector2(1.48, -4.15),
      new THREE.Vector2(1.38, -3.3),
      new THREE.Vector2(1.18, -2.3),
      new THREE.Vector2(1.22, -0.9),
      new THREE.Vector2(1.14, 0.2),
      new THREE.Vector2(1.20, 1.9),
      new THREE.Vector2(1.32, 3.5)
    ];
    const coreBottomGeo = new THREE.LatheGeometry(corePts, 44, Math.PI, Math.PI);
    coreBottomGeo.rotateX(Math.PI / 2);
    const coreBottomMesh = registerMesh(new THREE.Mesh(coreBottomGeo), 'coreCasing', true);
    coreBottomGroup.add(coreBottomMesh);

    const coreTopGeo = new THREE.LatheGeometry(corePts, 44, 0, Math.PI);
    coreTopGeo.rotateX(Math.PI / 2);
    const coreTopMesh = registerMesh(new THREE.Mesh(coreTopGeo), 'coreCasing', true);
    coreTopGroup.add(coreTopMesh);

    const exhaustGroup = new THREE.Group();
    engineRoot.add(exhaustGroup);

    const nozzlePetals = [];
    for (let p = 0; p < 16; p++) {
      const ang = (p / 16) * Math.PI * 2;
      const petalHolder = new THREE.Group();
      petalHolder.position.set(0, 0, -4.1);
      petalHolder.rotation.z = ang;

      const petalShape = new THREE.Shape();
      petalShape.moveTo(-0.26, 0);
      petalShape.lineTo(0.26, 0);
      petalShape.lineTo(0.19, 1.25);
      petalShape.lineTo(0.0, 1.48);
      petalShape.lineTo(-0.19, 1.25);
      petalShape.closePath();

      const petalGeo = new THREE.ExtrudeGeometry(petalShape, {
        depth: 0.045,
        bevelEnabled: true,
        bevelSize: 0.01,
        bevelThickness: 0.01,
        bevelSegments: 2
      });
      petalGeo.rotateX(Math.PI / 2);
      const petalMesh = registerMesh(new THREE.Mesh(petalGeo), 'exhaustNozzle', true);
      petalMesh.position.y = 1.44;
      petalMesh.rotation.x = -0.18;
      petalHolder.add(petalMesh);

      exhaustGroup.add(petalHolder);
      nozzlePetals.push(petalMesh);
    }

    const tailPlugGeo = new THREE.ConeGeometry(0.48, 1.65, 32);
    tailPlugGeo.rotateX(-Math.PI / 2);
    const tailPlugMesh = registerMesh(new THREE.Mesh(tailPlugGeo), 'exhaustNozzle', true);
    tailPlugMesh.position.z = -4.75;
    exhaustGroup.add(tailPlugMesh);

    // ============================================================================
    // 5. AIRFLOW & AFTERBURNER PLUME PARTICLES
    // ============================================================================
    const particleCount = 200;
    const airflowParticles = [];
    const airflowGroup = new THREE.Group();
    engineRoot.add(airflowGroup);

    const streakGeo = new THREE.BoxGeometry(0.035, 0.035, 0.55);
    for (let p = 0; p < particleCount; p++) {
      const isBypass = p % 2 === 0;
      const pMat = new THREE.MeshBasicMaterial({
        color: isBypass ? 0x38bdf8 : 0x60a5fa,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const pMesh = new THREE.Mesh(streakGeo, pMat);
      airflowGroup.add(pMesh);

      airflowParticles.push({
        mesh: pMesh,
        mat: pMat,
        isBypass,
        z: 5.5 - Math.random() * 11.5,
        angle: Math.random() * Math.PI * 2,
        radialFrac: 0.2 + Math.random() * 0.8,
        swirlSpeed: (Math.random() - 0.5) * 3.0
      });
    }

    const abPlumeGroup = new THREE.Group();
    abPlumeGroup.position.z = -4.9;
    engineRoot.add(abPlumeGroup);

    const abOuterMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const abOuterGeo = new THREE.ConeGeometry(1.1, 5.5, 32, 1, true);
    abOuterGeo.rotateX(-Math.PI / 2);
    abOuterGeo.translate(0, 0, -2.75);
    const abOuterMesh = new THREE.Mesh(abOuterGeo, abOuterMat);
    abPlumeGroup.add(abOuterMesh);

    const shockDiamondMats = [];
    for (let d = 0; d < 5; d++) {
      const sdMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sdGeo = new THREE.ConeGeometry(0.38 - d * 0.05, 1.2, 16, 1, true);
      sdGeo.rotateX(-Math.PI / 2);
      const sdMesh = new THREE.Mesh(sdGeo, sdMat);
      sdMesh.position.z = -0.6 - d * 0.95;
      abPlumeGroup.add(sdMesh);
      shockDiamondMats.push({ mat: sdMat, mesh: sdMesh, baseZ: sdMesh.position.z });
    }

    let n1Angle = 0;
    let n2Angle = 0;
    let lastTime = performance.now();
    let animationFrameId;

    const updateModesAndExplodedView = () => {
      const {
        renderMode,
        casingOpacity,
        cutawayMode,
        showNacelle,
        showCoreCase,
        showStators,
        showAirflow,
        exploded,
        theme: activeTheme
      } = simParams.current;

      realisticMats.nacelle.opacity = casingOpacity;
      realisticMats.coreCasing.opacity = casingOpacity * 0.9;
      rawCasingMat.opacity = casingOpacity;
      wireframeCasingMat.opacity = Math.max(0.18, casingOpacity);

      trackedMeshes.forEach(({ mesh, type, baseMat, wireOverlay }) => {
        const isCasing = type === 'nacelle' || type === 'coreCasing';

        if (renderMode === 'realistic') {
          mesh.material = baseMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (renderMode === 'raw') {
          mesh.material = isCasing ? rawCasingMat : rawSolidMat;
          if (wireOverlay) {
            wireOverlay.visible = !isCasing;
            wireOverlay.material.color.setHex(activeTheme === 'dark' ? 0x1e293b : 0x94a3b8);
            wireOverlay.material.opacity = 0.2;
          }
        } else if (renderMode === 'wireframe') {
          mesh.material = isCasing ? wireframeCasingMat : wireframePrimaryMat;
          if (wireOverlay) wireOverlay.visible = false;
        } else if (renderMode === 'shaded_wire') {
          mesh.material = baseMat;
          if (wireOverlay) {
            wireOverlay.visible = true;
            wireOverlay.material.color.setHex(0xfb6514);
            wireOverlay.material.opacity = isCasing ? 0.22 : 0.45;
          }
        }
      });

      nacelleGroup.visible = showNacelle;
      nacelleTopGroup.visible = !cutawayMode;

      coreCaseGroup.visible = showCoreCase;
      coreTopGroup.visible = !cutawayMode;

      outerLinerTop.visible = !cutawayMode;

      statorsGroup.visible = showStators;
      statorTopHalves.forEach((th) => {
        th.visible = !cutawayMode;
      });

      airflowGroup.visible = showAirflow;

      const exp = exploded;
      n1FanModule.position.z = exp * 2.1;
      n1LpcModule.position.z = exp * 1.1;
      n2HpcModule.position.z = exp * 0.35;
      combustorGroup.position.z = -exp * 0.35;
      n2HptModule.position.z = -exp * 1.05;
      n1LptModule.position.z = -exp * 1.85;
      exhaustGroup.position.z = -exp * 2.65;
      abPlumeGroup.position.z = -4.9 - exp * 2.65;

      nacelleTopGroup.position.y = exp * 1.35;
      nacelleBottomGroup.position.y = -exp * 1.35;
      coreTopGroup.position.y = exp * 0.75;
      coreBottomGroup.position.y = -exp * 0.75;
    };

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const {
        throttle: throt,
        afterburner: abOn,
        isPlaying: playing,
        showCombustion: combOn,
        autoRotateCam: autoCam
      } = simParams.current;

      const normThrottle = throt / 100;

      if (playing) {
        const n1Speed = 2.2 + normThrottle * 15.0;
        const n2Speed = 4.5 + normThrottle * 25.0;
        n1Angle = (n1Angle + n1Speed * dt) % (Math.PI * 2);
        n2Angle = (n2Angle - n2Speed * dt) % (Math.PI * 2);
      }

      n1SpoolGroup.rotation.z = n1Angle;
      n2SpoolGroup.rotation.z = n2Angle;

      const flicker = 0.9 + 0.1 * Math.sin(now * 0.035) + 0.05 * Math.sin(now * 0.08);
      const flameIntensity = combOn ? (0.35 + normThrottle * 0.65) * flicker : 0;

      flameMaterials.forEach((mat, idx) => {
        mat.opacity = flameIntensity;
        const hue = 0.04 + normThrottle * 0.06 + 0.015 * Math.sin(now * 0.015 + idx);
        mat.color.setHSL(hue, 1.0, 0.5 + normThrottle * 0.3);
      });

      coreFlameMat.opacity = combOn ? (0.25 + normThrottle * 0.7) * flicker : 0;
      combustorLight.intensity = combOn ? (1.5 + normThrottle * 5.0) * flicker : 0;
      realisticMats.hptBlade.emissiveIntensity = combOn ? 0.2 + normThrottle * 0.8 : 0;

      const nozzlePinch = abOn ? -0.11 : -0.18 - normThrottle * 0.05;
      nozzlePetals.forEach((petal) => {
        petal.rotation.x = nozzlePinch;
      });

      if (abOn && combOn && playing) {
        const abPulse = 0.88 + 0.12 * Math.sin(now * 0.05);
        abOuterMat.opacity = (0.55 + normThrottle * 0.45) * abPulse;
        afterburnerLight.intensity = 6.0 * abPulse;
        
        shockDiamondMats.forEach(({ mat, mesh, baseZ }, i) => {
          mat.opacity = (0.75 + 0.25 * Math.sin(now * 0.03 + i)) * abPulse;
          mesh.position.z = baseZ - normThrottle * 0.2 * (i + 1);
          const sc = 0.9 + 0.1 * Math.sin(now * 0.04 + i * 1.5);
          mesh.scale.set(sc, sc, sc);
        });
      } else {
        abOuterMat.opacity = 0;
        afterburnerLight.intensity = 0;
        shockDiamondMats.forEach(({ mat }) => {
          mat.opacity = 0;
        });
      }

      if (playing) {
        const flowSpeed = 5.0 + normThrottle * 16.0 + (abOn ? 6.0 : 0);
        airflowParticles.forEach((p) => {
          p.z -= flowSpeed * dt;
          p.angle += p.swirlSpeed * dt;

          if (p.z < -6.5) {
            p.z = 5.4;
            p.angle = Math.random() * Math.PI * 2;
          }

          let r = 1.0;
          if (p.isBypass) {
            r = 1.42 + p.radialFrac * 0.92;
            p.mat.color.setHex(0x38bdf8);
            p.mat.opacity = p.z < 0.5 ? Math.max(0, (p.z + 2.5) / 3.0) * 0.7 : 0.75;
          } else {
            if (p.z > 3.5) {
              r = 0.8 + p.radialFrac * 0.9;
              p.mat.color.setHex(0x38bdf8);
            } else if (p.z > -0.25) {
              r = 0.78 + p.radialFrac * 0.28;
              p.mat.color.setHex(p.z < 1.2 ? 0xfbbf24 : 0x60a5fa);
            } else if (p.z > -1.7) {
              r = 0.76 + p.radialFrac * 0.28;
              p.mat.color.setHex(0xff5500);
            } else {
              r = 0.62 + p.radialFrac * 0.62;
              p.mat.color.setHex(abOn ? 0x93c5fd : 0xf97316);
            }
            p.mat.opacity = 0.85;
          }

          p.mesh.position.set(Math.cos(p.angle) * r, Math.sin(p.angle) * r, p.z);
        });
      }

      updateModesAndExplodedView();

      if (autoCam && !camControl.current.isDragging) {
        camControl.current.theta += dt * 0.32;
      }
      const { theta, phi, radius, target } = camControl.current;
      camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(target);

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
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
    camControl.current.radius = Math.max(5.5, Math.min(28, camControl.current.radius + e.deltaY * 0.008));
  };

  const setCameraPreset = (preset) => {
    setAutoRotateCam(false);
    if (preset === 'iso') {
      camControl.current.theta = 0.78;
      camControl.current.phi = 1.22;
      camControl.current.radius = 14.5;
    } else if (preset === 'intake') {
      camControl.current.theta = 0.15;
      camControl.current.phi = 1.48;
      camControl.current.radius = 11.5;
    } else if (preset === 'side') {
      camControl.current.theta = Math.PI / 2;
      camControl.current.phi = 1.48;
      camControl.current.radius = 14.5;
    } else if (preset === 'exhaust') {
      camControl.current.theta = Math.PI - 0.25;
      camControl.current.phi = 1.42;
      camControl.current.radius = 12.5;
    }
  };

  const n1Pct = isPlaying ? Math.round(18 + throttle * 0.82 + (afterburner ? 4 : 0)) : 0;
  const n2Pct = isPlaying ? Math.round(52 + throttle * 0.48 + (afterburner ? 3 : 0)) : 0;
  const n1Rpm = Math.round((n1Pct / 100) * JET_SPECS.maxN1Rpm);
  const n2Rpm = Math.round((n2Pct / 100) * JET_SPECS.maxN2Rpm);
  const egtTemp = isPlaying ? Math.round(410 + throttle * 5.1 + (afterburner ? 240 : 0)) : 24;
  const thrustKn = isPlaying
    ? ((throttle / 100) * JET_SPECS.maxThrustDry + (afterburner ? 53 * (0.4 + 0.6 * (throttle / 100)) : 0)).toFixed(1)
    : '0.0';

  const isDark = theme === 'dark';

  const cardClass = isDark
    ? 'bg-[#101828]/90 backdrop-blur-xl border border-gray-800 shadow-[0_16px_36px_rgba(0,0,0,0.45)]'
    : 'bg-white/95 backdrop-blur-xl border border-gray-200 shadow-[0_16px_38px_rgba(16,24,40,0.08)]';
  const subCardClass = isDark
    ? 'bg-[#161f30]/90 border border-gray-800'
    : 'bg-gray-50/90 border border-gray-200/80';
  const headingText = isDark ? 'text-white' : 'text-gray-900';
  const bodyText = isDark ? 'text-gray-300' : 'text-gray-600';
  const mutedText = isDark ? 'text-gray-400' : 'text-gray-500';
  const dividerClass = isDark ? 'border-gray-800' : 'border-gray-200';
  const btnSecondary = isDark
    ? 'bg-[#161f30] hover:bg-[#1f2c42] text-gray-300 border border-gray-700'
    : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-xs';

  return (
    <div className="relative w-full h-full overflow-hidden select-none font-sans">
      {/* 3D Canvas Viewport */}
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-0"
      />

      {/* =========================================================
          TOP-LEFT: HEADER, STAGE ARCHITECTURE & TELEMETRY
      ========================================================= */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2.5 max-w-xs sm:max-w-md pointer-events-none">
        <div className={`${cardClass} rounded-2xl p-4 pointer-events-auto transition-colors duration-300`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/15 border border-orange-500/30">
                <Wind className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-orange-500 mb-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                  Twin-Spool Turbofan • Afterburner
                </span>
                <h1 className={`text-base sm:text-lg font-extrabold tracking-tight ${headingText}`}>
                  SIMULASI TURBOFAN JET
                </h1>
              </div>
            </div>

            {/* Camera View Presets */}
            <div className="hidden sm:flex items-center gap-1">
              {[
                { id: 'iso', label: 'ISO' },
                { id: 'intake', label: 'Intake' },
                { id: 'side', label: 'Samping' },
                { id: 'exhaust', label: 'Exhaust' }
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setCameraPreset(p.id)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer active:scale-95 ${btnSecondary}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Axial Gas Path Stages */}
          <div className={`mt-2 pt-2.5 border-t ${dividerClass}`}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider mb-1.5">
              <span className={`font-bold flex items-center gap-1 ${mutedText}`}>
                <Cpu className="w-3.5 h-3.5 text-orange-500" /> Tahap Aliran Gas Turbofan
              </span>
              <span className="font-mono font-bold text-orange-500">
                OPR {JET_SPECS.pressureRatio}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1 text-[10px] font-mono">
              {[
                { label: 'FAN', spool: 'N1', color: 'border-orange-500/40 text-orange-500 bg-orange-500/10' },
                { label: '3-LPC', spool: 'N1', color: 'border-orange-500/30 text-orange-500 bg-orange-500/10' },
                { label: '6-HPC', spool: 'N2', color: 'border-rose-500/50 text-rose-400 bg-rose-500/10' },
                { label: 'COMB', spool: 'FIRE', color: 'border-amber-500/60 text-amber-500 bg-amber-500/10' },
                { label: '2-HPT', spool: 'N2', color: 'border-rose-500/50 text-rose-400 bg-rose-500/10' },
                { label: '4-LPT', spool: 'N1', color: 'border-orange-500/30 text-orange-500 bg-orange-500/10' },
                {
                  label: 'NOZ',
                  spool: 'AB',
                  color: afterburner
                    ? 'border-orange-500 text-white bg-orange-500 shadow-[0_0_12px_rgba(251,101,20,0.5)]'
                    : isDark
                    ? 'border-gray-800 text-gray-500 bg-[#161f30]'
                    : 'border-gray-200 text-gray-500 bg-gray-100'
                }
              ].map((st) => (
                <div
                  key={st.label}
                  className={`text-center py-1 rounded-lg border ${st.color} flex flex-col items-center font-bold`}
                >
                  <span>{st.label}</span>
                  <span className="text-[8px] opacity-75">{st.spool}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live Telemetry Readouts */}
          <div className={`grid grid-cols-4 gap-1.5 text-xs border-t ${dividerClass} pt-2.5 mt-2.5`}>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>N1 Fan</span>
              <span className="font-mono text-sm font-extrabold text-orange-500">{n1Pct}%</span>
              <span className={`text-[8px] block font-mono ${mutedText}`}>{n1Rpm} RPM</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>N2 Core</span>
              <span className="font-mono text-sm font-extrabold text-rose-500">{n2Pct}%</span>
              <span className={`text-[8px] block font-mono ${mutedText}`}>{n2Rpm} RPM</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Suhu EGT</span>
              <span className="font-mono text-sm font-extrabold text-amber-500">{egtTemp}°C</span>
            </div>
            <div className={`${subCardClass} rounded-xl px-2 py-1.5`}>
              <span className={`${mutedText} block text-[9px] uppercase font-bold`}>Daya Dorong</span>
              <span className="font-mono text-sm font-extrabold text-emerald-500">{thrustKn}</span>
              <span className={`text-[9px] ml-0.5 ${mutedText}`}>kN</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          TOP-RIGHT: SHADING MODE & COMPONENT VISIBILITY
      ========================================================= */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2.5 w-64 pointer-events-none">
        <div className={`${cardClass} rounded-2xl p-3.5 pointer-events-auto transition-colors duration-300`}>
          <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${mutedText}`}>
            <Layers className="w-3.5 h-3.5 text-orange-500" /> Mode Visualisasi CAD
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'realistic', label: 'Realistic PBR', icon: Sparkles },
              { id: 'raw', label: 'Raw Shaded', icon: Box },
              { id: 'wireframe', label: 'Wireframe', icon: Grid },
              { id: 'shaded_wire', label: 'Shaded + Wire', icon: Cpu }
            ].map((mode) => {
              const IconComp = mode.icon;
              const active = renderMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setRenderMode(mode.id)}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                    active
                      ? 'bg-orange-500 text-white shadow-[0_4px_14px_rgba(251,101,20,0.35)] border border-orange-400'
                      : btnSecondary
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          <div className={`mt-3 pt-2.5 border-t ${dividerClass}`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${mutedText}`}>
              <Eye className="w-3.5 h-3.5 text-orange-500" /> Komponen & Belahan
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {/* 180 deg Section Cutaway */}
              <button
                onClick={() => setCutawayMode(!cutawayMode)}
                className={`col-span-2 flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 border ${
                  cutawayMode
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-500'
                    : isDark
                    ? 'bg-gray-900/40 border-gray-800 text-gray-400'
                    : 'bg-gray-100 border-gray-200 text-gray-600'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5" /> 180° Section Cutaway
                </span>
                <span className="text-[10px] uppercase font-extrabold">
                  {cutawayMode ? 'AKTIF' : 'PENUH'}
                </span>
              </button>

              {[
                { label: 'Bypass Nacelle', state: showNacelle, setter: setShowNacelle },
                { label: 'Core Duct', state: showCoreCase, setter: setShowCoreCase },
                { label: 'Stator Vanes', state: showStators, setter: setShowStators },
                { label: 'Airflow Stream', state: showAirflow, setter: setShowAirflow }
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => item.setter(!item.state)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer active:scale-95 border ${
                    item.state
                      ? isDark
                        ? 'bg-[#161f30] border-orange-500/40 text-gray-200'
                        : 'bg-orange-50/70 border-orange-300 text-gray-800'
                      : isDark
                      ? 'bg-gray-900/40 border-gray-800/80 text-gray-500'
                      : 'bg-gray-100/70 border-gray-200 text-gray-400'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {item.state ? (
                    <Eye className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          BOTTOM: SIMULATOR CONTROLS & SLIDERS
      ========================================================= */}
      <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3 pointer-events-none">
        <div className={`${cardClass} rounded-2xl p-4 pointer-events-auto flex-1 max-w-4xl transition-colors duration-300`}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
            {/* 1. Thrust Lever & Throttle */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Gauge className="w-3.5 h-3.5 text-orange-500" /> Thrust Lever
                </span>
                <span className="font-mono font-bold text-orange-500">{throttle}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="1"
                value={throttle}
                onChange={(e) => setThrottle(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <button
                  onClick={() => { setThrottle(12); setAfterburner(false); }}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  12% (Idle)
                </button>
                <button
                  onClick={() => { setThrottle(65); setAfterburner(false); }}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  65% (Cruise)
                </button>
                <button
                  onClick={() => { setThrottle(92); setAfterburner(false); }}
                  className="hover:text-orange-500 underline cursor-pointer"
                >
                  92% (Climb)
                </button>
                <button
                  onClick={() => { setThrottle(100); setAfterburner(true); }}
                  className="hover:text-orange-500 underline cursor-pointer font-bold text-orange-500"
                >
                  MAX AB
                </button>
              </div>
            </div>

            {/* 2. Afterburner Reheat Boost */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Flame className="w-3.5 h-3.5 text-orange-500" /> Afterburner Reheat
                </span>
                <span className={`font-mono font-bold ${afterburner ? 'text-orange-500' : mutedText}`}>
                  {afterburner ? 'AKTIF (+53 kN)' : 'MATI'}
                </span>
              </div>
              <button
                onClick={() => setAfterburner(!afterburner)}
                className={`w-full py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 ${
                  afterburner
                    ? 'bg-orange-500 text-white border-orange-400 shadow-[0_0_14px_rgba(251,101,20,0.55)]'
                    : btnSecondary
                }`}
              >
                <Flame className={`w-3.5 h-3.5 ${afterburner ? 'text-white' : 'text-orange-500'}`} />
                <span>{afterburner ? 'Afterburner Menyala' : 'Nyalakan Afterburner'}</span>
              </button>
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>Dry Thrust 115 kN</span>
                <span>Wet 168 kN</span>
              </div>
            </div>

            {/* 3. Axial Exploded View */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Maximize2 className="w-3.5 h-3.5 text-orange-500" /> Urai Bagian (Axial)
                </span>
                <span className="font-mono font-bold text-orange-500">{Math.round(exploded * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={exploded}
                onChange={(e) => setExploded(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>0% Utuh</span>
                <span>Pemisahan Axial</span>
                <span>100% Terurai</span>
              </div>
            </div>

            {/* 4. Nacelle & Core Opacity */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className={`${bodyText} font-semibold flex items-center gap-1.5`}>
                  <Sliders className="w-3.5 h-3.5 text-orange-500" /> Transparansi Casing
                </span>
                <span className={`font-mono font-bold ${headingText}`}>
                  {Math.round(casingOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.95"
                step="0.02"
                value={casingOpacity}
                onChange={(e) => setCasingOpacity(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className={`flex justify-between text-[9px] font-medium ${mutedText}`}>
                <span>Transparan</span>
                <span>Ketebalan Duct</span>
                <span>Solid</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Transport Buttons */}
        <div className={`${cardClass} rounded-2xl p-2.5 pointer-events-auto flex items-center justify-end gap-2 transition-colors duration-300`}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 ${
              isPlaying
                ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-[0_6px_18px_rgba(251,101,20,0.35)]'
                : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={() => setAutoRotateCam(!autoRotateCam)}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 border ${
              autoRotateCam
                ? 'bg-orange-500 text-white border-orange-400 shadow-[0_4px_12px_rgba(251,101,20,0.3)]'
                : btnSecondary
            }`}
          >
            Auto-Orbit
          </button>

          <button
            onClick={() => {
              setThrottle(45);
              setAfterburner(false);
              setExploded(0);
              setCasingOpacity(0.28);
              setCutawayMode(true);
              setRenderMode('realistic');
              setShowNacelle(true);
              setShowCoreCase(true);
              setShowStators(true);
              setShowAirflow(true);
              setAutoRotateCam(false);
              setCameraPreset('iso');
            }}
            title="Reset Simulasi"
            className={`p-2.5 rounded-xl transition-all cursor-pointer active:scale-95 ${btnSecondary}`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
