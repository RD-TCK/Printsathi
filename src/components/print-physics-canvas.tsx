"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface AnchorCoords {
  heroPhoneX: number;
  heroPhoneY: number;
  howPhoneX: number;
  howPhoneY: number;
  printerX: number;
  printerY: number;
  printerWidthPx: number;
  printerYaw: number;
  printerBankZ: number;
  printerScaleMult: number;
  printerVisible: boolean;
  qrX: number;
  qrY: number;
  qrScalePx: number;
  qrVisible: boolean;
  upiX: number;
  upiY: number;
  upiVisible: boolean;
  heroBeamActive: boolean;
  howBeamActive: boolean;
  scrollVelocity: number;
  scrollProgress: number;
  stepIndex: number; // 0..3
}

interface EjectedSheet {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  age: number;
  maxAge: number;
  active: boolean;
  flutterPhase: number;
}

interface Pool {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

function createPrintedPageTexture(variant: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 384, 480);

    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 378, 474);

    if (variant === 0) {
      const grad = ctx.createLinearGradient(28, 28, 356, 160);
      grad.addColorStop(0, "#064e3b");
      grad.addColorStop(0.55, "#059669");
      grad.addColorStop(1, "#84cc16");
      ctx.fillStyle = grad;
      ctx.fillRect(28, 28, 328, 134);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(48, 56, 175, 20);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(48, 88, 240, 12);

      const bars = [
        { x: 48, h: 74, col: "#10b981" },
        { x: 96, h: 108, col: "#06b6d4" },
        { x: 144, h: 58, col: "#84cc16" },
        { x: 192, h: 124, col: "#059669" },
      ];
      bars.forEach((b) => {
        ctx.fillStyle = b.col;
        ctx.fillRect(b.x, 316 - b.h, 32, b.h);
      });

      ctx.fillStyle = "#334155";
      ctx.fillRect(250, 210, 102, 14);
      ctx.fillStyle = "#64748b";
      for (let y = 240; y <= 310; y += 22) {
        ctx.fillRect(250, y, 102, 10);
      }
    } else if (variant === 1) {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(32, 34, 200, 24);
      ctx.fillStyle = "#059669";
      ctx.fillRect(32, 70, 320, 6);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(32, 102, 130, 14);
      ctx.fillStyle = "#64748b";
      for (let y = 132; y <= 232; y += 22) {
        ctx.fillRect(32, y, y === 220 ? 210 : 320, 10);
      }
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(32, 272, 145, 14);
      ctx.fillStyle = "#64748b";
      for (let y = 302; y <= 402; y += 22) {
        ctx.fillRect(32, y, y === 390 ? 190 : 320, 10);
      }
    } else {
      ctx.fillStyle = "#ecfdf5";
      ctx.fillRect(28, 28, 328, 86);
      ctx.fillStyle = "#059669";
      ctx.fillRect(46, 50, 110, 26);
      ctx.fillStyle = "#064e3b";
      ctx.fillRect(236, 52, 98, 20);

      ctx.fillStyle = "#06b6d4";
      ctx.fillRect(28, 138, 154, 112);
      ctx.fillStyle = "#ec4899";
      ctx.fillRect(202, 138, 154, 112);

      ctx.fillStyle = "#334155";
      for (let y = 282; y <= 404; y += 24) {
        ctx.fillRect(28, y, y === 402 ? 170 : 328, 11);
      }
    }

    ctx.fillStyle = "#d1fae5";
    ctx.fillRect(28, 434, 128, 22);
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(272, 440, 84, 10);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createQrTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = "#064e3b";
    ctx.fillRect(0, 0, 512, 74);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SCAN TO PRINT", 256, 48);

    const drawFinder = (x: number, y: number) => {
      ctx.fillStyle = "#064e3b";
      ctx.fillRect(x, y, 88, 88);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 14, y + 14, 60, 60);
      ctx.fillStyle = "#059669";
      ctx.fillRect(x + 28, y + 28, 32, 32);
    };
    drawFinder(62, 106);
    drawFinder(362, 106);
    drawFinder(62, 376);

    ctx.fillStyle = "#0f172a";
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 12; c++) {
        if ((r < 4 && c < 4) || (r < 4 && c > 7) || (r > 7 && c < 4)) continue;
        if ((r * 7 + c * 11) % 3 === 0 || (r + c * 3) % 5 === 0) {
          ctx.fillRect(72 + c * 31, 114 + r * 29, 21, 21);
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createSparkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(16,185,129,0.95)");
    grad.addColorStop(1, "rgba(16,185,129,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createRazorpayBadgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Deep Razorpay Navy metallic gradient disc
    const bg = ctx.createRadialGradient(210, 175, 24, 256, 256, 256);
    bg.addColorStop(0, "#0d3878");
    bg.addColorStop(0.65, "#072654");
    bg.addColorStop(1, "#041634");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle crisp blue perimeter ring
    ctx.strokeStyle = "#3395FF";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(256, 256, 224, 0, Math.PI * 2);
    ctx.stroke();

    // Inner subtle hairline ring
    ctx.strokeStyle = "rgba(147, 197, 253, 0.28)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(256, 256, 198, 0, Math.PI * 2);
    ctx.stroke();

    // Crisp Razorpay geometric lightning-blade logo mark (centered top-middle)
    ctx.save();
    ctx.translate(256, 212);
    ctx.scale(1.18, 1.18);

    // Light Razorpay blue main diagonal wing blade
    ctx.fillStyle = "#3395FF";
    ctx.beginPath();
    ctx.moveTo(-24, 48);
    ctx.lineTo(14, -76);
    ctx.lineTo(66, -76);
    ctx.lineTo(14, 72);
    ctx.lineTo(-24, 72);
    ctx.closePath();
    ctx.fill();

    // Bright crisp cyan-white lower-left wedge stroke of Razorpay R-slash
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(-64, 72);
    ctx.lineTo(-34, -22);
    ctx.lineTo(2, -22);
    ctx.lineTo(-26, 72);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Crisp Razorpay wordmark + Verified pill text below mark
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 44px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Razorpay", 256, 354);

    ctx.fillStyle = "#60A5FA";
    ctx.font = "700 22px ui-monospace, monospace";
    ctx.fillText("UPI VERIFIED", 256, 394);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createShadowDiscTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 58);
    grad.addColorStop(0, "rgba(2, 6, 23, 0.44)");
    grad.addColorStop(0.5, "rgba(15, 23, 42, 0.18)");
    grad.addColorStop(1, "rgba(15, 23, 42, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildCurledPaperGeometry(width: number, height: number, curl: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 1, 14);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const norm = (y + height / 2) / height;
    pos.setZ(i, Math.sin(norm * Math.PI) * curl + (norm - 0.5) * curl * 0.45);
  }
  geo.computeVertexNormals();
  return geo;
}

function screenToWorld(
  px: number,
  py: number,
  vpWidth: number,
  vpHeight: number,
  camera: THREE.PerspectiveCamera,
  targetZ = 0,
): THREE.Vector3 {
  const ndcX = (px / Math.max(vpWidth, 1)) * 2 - 1;
  const ndcY = -(py / Math.max(vpHeight, 1)) * 2 + 1;
  const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
  const dir = vec.sub(camera.position).normalize();
  const distance = (targetZ - camera.position.z) / dir.z;
  return camera.position.clone().add(dir.multiplyScalar(distance));
}

function buildRealStudioPrinter(
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  trackMat: <T extends THREE.Material>(m: T) => T,
  shadowTex: THREE.CanvasTexture,
  trayPageTex: THREE.CanvasTexture,
) {
  const group = new THREE.Group();

  const chassisSlateMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xcbd5e1,
      roughness: 0.36,
      metalness: 0.14,
      clearcoat: 0.18,
      clearcoatRoughness: 0.36,
      envMapIntensity: 0.5,
    }),
  );
  const graphiteShellMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.32,
      envMapIntensity: 0.55,
    }),
  );
  const forestTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x043d2e,
      roughness: 0.36,
      metalness: 0.28,
      envMapIntensity: 0.52,
    }),
  );
  const obsidianMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.54,
      metalness: 0.26,
      envMapIntensity: 0.35,
    }),
  );
  const voidCavityMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x03050a,
      roughness: 0.9,
      metalness: 0.05,
      envMapIntensity: 0.12,
    }),
  );
  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.22,
      metalness: 0.86,
      envMapIntensity: 0.8,
    }),
  );
  const smokedGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1220,
      roughness: 0.08,
      metalness: 0.14,
      transmission: 0.36,
      transparent: true,
      opacity: 0.9,
      ior: 1.5,
      clearcoat: 0.9,
      envMapIntensity: 0.72,
    }),
  );
  const ledStripMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 1.6,
      roughness: 0.18,
    }),
  );
  const scanBarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 2.0,
      roughness: 0.22,
    }),
  );

  // Soft floor studio shadow
  const shadowMesh = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(4.5, 3.9)),
    trackMat(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })),
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = -1.06;
  group.add(shadowMesh);

  // Helper so structural hardware meshes cast & receive crisp self-shadows
  const addHardwarePart = (mesh: THREE.Mesh, cast = true, receive = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  };

  // Dark weighted lower plinth & lower graphite skirt
  const basePlinth = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.68, 0.26, 2.1, 4, 0.08)), obsidianMat);
  basePlinth.position.y = -0.9;
  addHardwarePart(basePlinth);

  const lowerSkirt = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.7, 0.34, 2.08, 4, 0.09)), graphiteShellMat);
  lowerSkirt.position.y = -0.66;
  addHardwarePart(lowerSkirt);

  // Sculpted dark forest-emerald structural core
  const innerCore = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.58, 1.48, 2.0, 5, 0.14)), forestTrimMat);
  innerCore.position.y = -0.08;
  addHardwarePart(innerCore);

  // Upper sculpted satin slate chassis wrap
  const upperWrap = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.74, 1.24, 2.12, 6, 0.22)), chassisSlateMat);
  upperWrap.position.y = 0.09;
  addHardwarePart(upperWrap);

  // Dark recessed cheek grooves & sculpted outer panels
  const leftPocket = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(0.08, 0.94, 1.56, 3, 0.03)), obsidianMat);
  leftPocket.position.set(-1.35, -0.18, 0);
  addHardwarePart(leftPocket, false, true);

  const leftPanel = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(0.11, 1.0, 1.72, 4, 0.05)), graphiteShellMat);
  leftPanel.position.set(-1.37, -0.18, 0);
  addHardwarePart(leftPanel);

  const rightPocket = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(0.08, 0.94, 1.56, 3, 0.03)), obsidianMat);
  rightPocket.position.set(1.35, -0.18, 0);
  addHardwarePart(rightPocket, false, true);

  const rightPanel = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(0.11, 1.0, 1.72, 4, 0.05)), chassisSlateMat);
  rightPanel.position.set(1.37, -0.18, 0);
  addHardwarePart(rightPanel);

  // Recessed ink bay frame on right side so CMYK sightlines sit inside a carved dark pocket
  const inkBayHousing = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(0.08, 0.52, 1.06, 3, 0.025)), obsidianMat);
  inkBayHousing.position.set(1.4, -0.45, 0);
  addHardwarePart(inkBayHousing, false, true);

  // Side recessed CMYK glowing micro ink-level sightline
  [0x06b6d4, 0xec4899, 0xfacc15, 0x10b981].forEach((hex, idx) => {
    const vialMat = trackMat(
      new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.65, roughness: 0.24 }),
    );
    const vial = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(0.05, 0.34, 0.14, 3, 0.02)), vialMat);
    vial.position.set(1.425, -0.45, -0.36 + idx * 0.24);
    group.add(vial);
  });

  // Recessed front-lower deep output slot cavity + pitch-dark inner mouth
  const slotCavity = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.78, 0.38, 0.74, 3, 0.05)), obsidianMat);
  slotCavity.position.set(0, -0.62, 0.86);
  addHardwarePart(slotCavity, false, true);

  const slotVoid = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.58, 0.22, 0.06)), voidCavityMat);
  slotVoid.position.set(0, -0.63, 1.11);
  group.add(slotVoid);

  // Front overhang bezel lip + floating faceplate casting real shadow into output bay
  const frontOverhang = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.44, 0.14, 0.22, 4, 0.04)), graphiteShellMat);
  frontOverhang.position.set(0, -0.42, 1.03);
  addHardwarePart(frontOverhang);

  const frontFacePlate = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.38, 0.8, 0.14, 5, 0.06)), chassisSlateMat);
  frontFacePlate.position.set(0, 0.05, 1.06);
  addHardwarePart(frontFacePlate);

  // Signature curved/wide glowing emerald LED status bar across top brow
  const ledBezel = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.14, 0.095, 0.09, 3, 0.025)), obsidianMat);
  ledBezel.position.set(0, 0.52, 1.06);
  addHardwarePart(ledBezel, false, true);

  const ledStrip = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.04, 0.05, 0.085, 3, 0.02)), ledStripMat);
  ledStrip.position.set(0, 0.52, 1.08);
  group.add(ledStrip);

  // Chrome paper ejection roller visible inside output bay
  const roller = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.065, 0.065, 1.48, 18)), chromeMat);
  roller.rotation.z = Math.PI / 2;
  roller.position.set(0, -0.52, 0.96);
  addHardwarePart(roller);

  // Extendable graphite-trimmed output tray lip
  const outputTrayFrame = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.7, 0.075, 1.0, 3, 0.025)), graphiteShellMat);
  outputTrayFrame.position.set(0, -0.84, 1.38);
  outputTrayFrame.rotation.x = 0.09;
  addHardwarePart(outputTrayFrame);

  const outputTray = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.56, 0.05, 0.9, 3, 0.02)), chassisSlateMat);
  outputTray.position.set(0, -0.82, 1.39);
  outputTray.rotation.x = 0.09;
  addHardwarePart(outputTray);

  // Printed resting sheet sitting neatly in the tray
  const traySheetMat = trackMat(
    new THREE.MeshStandardMaterial({ map: trayPageTex, roughness: 0.48, side: THREE.DoubleSide }),
  );
  const traySheet = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.18, 1.35)), traySheetMat);
  traySheet.rotation.x = -Math.PI / 2 + 0.09;
  traySheet.position.set(0, -0.785, 1.42);
  traySheet.receiveShadow = true;
  group.add(traySheet);

  // Top Scanner Deck: Obsidian inner bed + Forest bezel + Smoked Glass Platen + Emerald Scanner Bar
  const scannerWell = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.96, 0.05, 1.38, 2, 0.015)), voidCavityMat);
  scannerWell.position.set(0, 0.705, -0.02);
  addHardwarePart(scannerWell, false, true);

  const scannerBezel = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(2.24, 0.11, 1.66, 4, 0.03)), forestTrimMat);
  scannerBezel.position.set(0, 0.71, -0.02);
  addHardwarePart(scannerBezel);

  const scannerBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.75, 0.028, 0.08)), scanBarMat);
  scannerBar.position.set(0, 0.725, 0);
  group.add(scannerBar);

  const glassPlaten = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.94, 0.045, 1.36, 3, 0.02)), smokedGlassMat);
  glassPlaten.position.set(0, 0.76, -0.02);
  glassPlaten.receiveShadow = true;
  group.add(glassPlaten);

  // Rear vertical paper feeder support + slate paper stack (visible when printer rotates in 3D!)
  const rearSupport = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.52, 0.85, 0.1, 4, 0.03)), obsidianMat);
  rearSupport.position.set(0, 0.78, -1.04);
  rearSupport.rotation.x = -0.22;
  addHardwarePart(rearSupport);

  const stackMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 }));
  const rearStack = new THREE.Mesh(trackGeo(new RoundedBoxGeometry(1.26, 0.74, 0.12, 2, 0.015)), stackMat);
  rearStack.position.set(0, 0.82, -0.94);
  rearStack.rotation.x = -0.22;
  addHardwarePart(rearStack);

  // Exact local anchors inside 3D printer for beams & paper ejection!
  const topAnchor = new THREE.Object3D();
  topAnchor.position.set(0, 0.95, -0.45);
  group.add(topAnchor);

  const slotAnchor = new THREE.Object3D();
  slotAnchor.position.set(0, -0.66, 1.24);
  group.add(slotAnchor);

  return { group, topAnchor, slotAnchor, roller, scannerBar, ledStripMat, scanBarMat };
}

export function PrintPhysicsCanvas({
  anchorsRef,
}: {
  anchorsRef: React.MutableRefObject<AnchorCoords>;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return;

    const pool: Pool = { geometries: [], materials: [], textures: [] };
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      pool.geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      pool.materials.push(m);
      return m;
    };

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.86;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const w0 = window.innerWidth;
    const h0 = window.innerHeight;
    renderer.setSize(w0, h0, false);

    const scene = new THREE.Scene();

    // Tamed studio IBL reflections so dark recesses and contours retain rich industrial contrast
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.45;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(40, w0 / Math.max(h0, 1), 0.1, 100);
    camera.position.set(0, 0, 16);

    scene.add(new THREE.HemisphereLight(0xe2e8f0, 0x0f172a, 0.32));
    const keyLight = new THREE.DirectionalLight(0xfffcf5, 1.45);
    keyLight.position.set(5, 9, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 24;
    keyLight.shadow.camera.left = -3.6;
    keyLight.shadow.camera.right = 3.6;
    keyLight.shadow.camera.top = 3.6;
    keyLight.shadow.camera.bottom = -3.6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.025;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x10b981, 0.55);
    rimLight.position.set(-7, 2.5, -5);
    scene.add(rimLight);

    const pageTextures = [0, 1, 2].map((i) => {
      const tx = createPrintedPageTexture(i);
      pool.textures.push(tx);
      return tx;
    });
    const qrTex = createQrTexture();
    const sparkTex = createSparkTexture();
    const shadowTex = createShadowDiscTexture();
    const rzpTex = createRazorpayBadgeTexture();
    pool.textures.push(qrTex, sparkTex, shadowTex, rzpTex);

    // ━━ 1. REAL 3D ROTATING STUDIO PRINTER ━━
    const printerObj = buildRealStudioPrinter(trackGeo, trackMat, shadowTex, pageTextures[0]);
    scene.add(printerObj.group);

    // ━━ 2. REAL 3D COUNTER QR STAND (Step 01 & Step 02) ━━
    const qrGroup = new THREE.Group();
    scene.add(qrGroup);

    const qrBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.68, 0.78, 0.12, 32)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.3, metalness: 0.2 })),
    );
    qrBase.position.y = -0.78;
    qrGroup.add(qrBase);

    const qrFrame = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(1.12, 1.34, 0.09, 4, 0.03)),
      trackMat(new THREE.MeshPhysicalMaterial({ color: 0xdbe3ec, roughness: 0.25, clearcoat: 0.45, envMapIntensity: 0.6 })),
    );
    qrFrame.position.y = -0.05;
    qrFrame.rotation.x = -0.14;
    qrGroup.add(qrFrame);

    const qrFace = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(0.96, 1.16)),
      trackMat(new THREE.MeshStandardMaterial({ map: qrTex, roughness: 0.35 })),
    );
    qrFace.position.set(0, -0.05, 0.052);
    qrFace.rotation.x = -0.14;
    qrGroup.add(qrFace);

    const laserMat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    const qrLaser = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.06, 0.055)), laserMat);
    qrLaser.position.set(0, -0.05, 0.08);
    qrLaser.rotation.x = -0.14;
    qrGroup.add(qrLaser);

    // ━━ 3. REAL 3D RAZORPAY VERIFIED BADGE (Step 03) ━━
    const upiGroup = new THREE.Group();
    scene.add(upiGroup);

    const rzpRingMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3395ff,
        emissive: 0x1d6fe8,
        emissiveIntensity: 0.7,
        roughness: 0.22,
        metalness: 0.72,
      }),
    );
    const upiOuterRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.68, 0.048, 16, 48)), rzpRingMat);
    upiGroup.add(upiOuterRing);

    const rzpBodyMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x072654,
        roughness: 0.3,
        metalness: 0.55,
      }),
    );
    const rzpMedalBody = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.64, 0.64, 0.12, 48)), rzpBodyMat);
    rzpMedalBody.rotation.x = Math.PI / 2;
    upiGroup.add(rzpMedalBody);

    const rzpFaceMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: rzpTex,
        roughness: 0.26,
        metalness: 0.14,
      }),
    );
    const rzpFrontFace = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.62, 48)), rzpFaceMat);
    rzpFrontFace.position.z = 0.064;
    upiGroup.add(rzpFrontFace);

    const rzpBackFace = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.62, 48)), rzpFaceMat);
    rzpBackFace.rotation.y = Math.PI;
    rzpBackFace.position.z = -0.064;
    upiGroup.add(rzpBackFace);

    // Subtle 3D extruded Razorpay wing accent at top rim for physical depth
    const wingShape = new THREE.Shape();
    wingShape.moveTo(-0.07, 0.11);
    wingShape.lineTo(0.05, -0.2);
    wingShape.lineTo(0.18, -0.2);
    wingShape.lineTo(0.03, 0.17);
    wingShape.lineTo(-0.07, 0.17);
    wingShape.closePath();
    const rzpWingGeo = trackGeo(
      new THREE.ExtrudeGeometry(wingShape, {
        depth: 0.025,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.008,
        bevelSegments: 2,
      }),
    );
    const upiCore = new THREE.Mesh(
      rzpWingGeo,
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x60a5fa,
          emissive: 0x3395ff,
          emissiveIntensity: 0.55,
          roughness: 0.2,
          metalness: 0.65,
        }),
      ),
    );
    upiCore.rotation.z = Math.PI;
    upiCore.position.set(0.02, 0.1, 0.058);
    upiGroup.add(upiCore);

    // ━━ 4. CURLED PRINTED SHEETS POOL + DOCUMENT BEAM ━━
    const sheetGeo = trackGeo(buildCurledPaperGeometry(0.88, 1.1, 0.12));
    const pageMats = pageTextures.map((tex) =>
      trackMat(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.36,
          metalness: 0.04,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 1,
        }),
      ),
    );

    const SHEET_POOL_SIZE = 10;
    const sheetPool: EjectedSheet[] = Array.from({ length: SHEET_POOL_SIZE }, (_, idx) => {
      const mat = pageMats[idx % pageMats.length].clone();
      trackMat(mat);
      const mesh = new THREE.Mesh(sheetGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      return {
        mesh,
        vx: 0,
        vy: 0,
        vz: 0,
        rotSpeedX: 0,
        rotSpeedY: 0,
        rotSpeedZ: 0,
        age: 0,
        maxAge: 4,
        active: false,
        flutterPhase: idx * 0.7,
      };
    });

    const BEAM_COUNT = 42;
    const beamPos = new Float32Array(BEAM_COUNT * 3);
    const beamGeo = trackGeo(new THREE.BufferGeometry());
    beamGeo.setAttribute("position", new THREE.BufferAttribute(beamPos, 3));
    const beamMat = trackMat(
      new THREE.PointsMaterial({
        size: 0.36,
        map: sparkTex,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const beamPoints = new THREE.Points(beamGeo, beamMat);
    scene.add(beamPoints);

    const miniDocGeo = trackGeo(buildCurledPaperGeometry(0.62, 0.76, 0.08));
    const miniDocs = [0, 0.33, 0.66].map((offset, i) => {
      const mat = pageMats[i % pageMats.length];
      const mesh = new THREE.Mesh(miniDocGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, offset };
    });

    let mouseNdcX = 0;
    let mouseNdcY = 0;
    const onPointerMove = (e: PointerEvent) => {
      mouseNdcX = (e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      mouseNdcY = (e.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const onResize = () => {
      if (!renderer) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener("resize", onResize);

    let isVisible = true;
    const onVisibility = () => {
      isVisible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);

    let isDarkTheme = document.documentElement.classList.contains("dark");
    const applyThemeToScene = (dark: boolean) => {
      if (!renderer) return;
      renderer.toneMappingExposure = dark ? 0.96 : 0.86;
      keyLight.intensity = dark ? 1.65 : 1.45;
      rimLight.intensity = dark ? 1.15 : 0.55;
      scene.environmentIntensity = dark ? 0.56 : 0.45;
    };
    applyThemeToScene(isDarkTheme);

    const themeObserver = new MutationObserver(() => {
      const nextDark = document.documentElement.classList.contains("dark");
      if (nextDark !== isDarkTheme) {
        isDarkTheme = nextDark;
        applyThemeToScene(nextDark);
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    let isDisposed = false;
    let rafId = 0;
    let spawnAccumulator = 0;
    let lastScrollBucket = -1;
    const clock = new THREE.Clock();

    const spawnPrintedSheet = (
      originWorld: THREE.Vector3,
      forwardDirWorld: THREE.Vector3,
      power = 1.0,
      isMobile = false,
    ) => {
      const slot = sheetPool.find((s) => !s.active);
      if (!slot) return;

      slot.active = true;
      slot.age = 0;
      slot.maxAge = 3.8 + Math.random() * 1.2;
      slot.mesh.visible = true;
      slot.mesh.position.copy(originWorld);

      // Gentle, eye-friendly trajectories curving outward cleanly from the printer slot
      const spreadX = isMobile ? 2.8 : 4.2;
      const speed = (2.8 + Math.random() * 2.6) * power;
      slot.vx = forwardDirWorld.x * speed + (Math.random() - 0.5) * spreadX;
      slot.vy = 0.85 + Math.random() * 2.1;
      slot.vz = Math.max(0.9, forwardDirWorld.z * speed * 0.65 + Math.random() * 2.1);

      slot.rotSpeedX = (Math.random() - 0.5) * 1.05;
      slot.rotSpeedY = (Math.random() - 0.5) * 1.25;
      slot.rotSpeedZ = (Math.random() - 0.5) * 0.9;

      slot.mesh.rotation.set(
        -0.35 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 0.6,
      );
      slot.mesh.scale.setScalar(isMobile ? 0.24 : 0.3);
      const mat = slot.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 1;
    };

    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const pMid = new THREE.Vector3();
    const printerTopWorld = new THREE.Vector3();
    const printerSlotWorld = new THREE.Vector3();
    const mouthDir = new THREE.Vector3();

    const animate = () => {
      if (isDisposed || !renderer) return;
      rafId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      const a = anchorsRef.current;

      // 1. Place & Truly Rotate the 3D Printer in World Space matching the Live Dock
      printerObj.group.visible = a.printerVisible;
      if (a.printerVisible) {
        const centerWorld = screenToWorld(a.printerX, a.printerY, vpW, vpH, camera, 0);
        const rightEdgeWorld = screenToWorld(
          a.printerX + Math.max(a.printerWidthPx, 160) * 0.5,
          a.printerY,
          vpW,
          vpH,
          camera,
          0,
        );
        const worldHalfW = Math.max(0.45, Math.abs(rightEdgeWorld.x - centerWorld.x));
        const unitScale = (worldHalfW * 2) / 3.45;

        printerObj.group.position.set(
          centerWorld.x,
          centerWorld.y + (!reducedMotion ? Math.sin(elapsed * 1.5) * 0.04 : 0),
          0,
        );
        printerObj.group.scale.setScalar(unitScale * a.printerScaleMult);
        printerObj.group.rotation.set(
          0.26 - mouseNdcY * 0.08,
          a.printerYaw + mouseNdcX * 0.14,
          a.printerBankZ,
        );

        // Keep tight crisp shadow frustum locked onto moving printer
        keyLight.position.set(centerWorld.x + 4.5, centerWorld.y + 8.5, 7.5);
        keyLight.target.position.set(centerWorld.x, centerWorld.y, 0);
        keyLight.target.updateMatrixWorld();

        // Animate internal 3D printer parts!
        if (!reducedMotion) {
          printerObj.roller.rotation.x = elapsed * (a.stepIndex === 3 ? 11 : 4);
          printerObj.scannerBar.position.z = Math.sin(elapsed * (a.stepIndex >= 2 ? 4.2 : 1.6)) * 0.56;
          printerObj.ledStripMat.emissiveIntensity = a.stepIndex >= 2 ? 2.1 + Math.sin(elapsed * 8) * 0.45 : 1.3;
        }
        printerObj.group.updateMatrixWorld(true);
        printerObj.topAnchor.getWorldPosition(printerTopWorld);
        printerObj.slotAnchor.getWorldPosition(printerSlotWorld);
      }

      // 2. Position & Animate the 3D Counter QR Stand (Step 01..04)
      qrGroup.visible = a.qrVisible;
      if (a.qrVisible) {
        const qrWorld = screenToWorld(a.qrX, a.qrY, vpW, vpH, camera, 0.3);
        const qrEdge = screenToWorld(a.qrX + Math.max(a.qrScalePx, 90) * 0.5, a.qrY, vpW, vpH, camera, 0.3);
        const qrScale = Math.max(0.45, Math.abs(qrEdge.x - qrWorld.x) * 1.45);
        qrGroup.position.set(qrWorld.x, qrWorld.y + Math.sin(elapsed * 1.8) * 0.05, 0.3);
        qrGroup.scale.setScalar(qrScale);
        qrGroup.rotation.y = -0.35 + Math.sin(elapsed * 1.1) * 0.18 + mouseNdcX * 0.1;
        qrLaser.position.y = -0.05 + Math.sin(elapsed * 3.6) * 0.44;
        laserMat.opacity = a.stepIndex === 0 ? 0.95 : 0.35;
      }

      // 3. Position & Gently Showcase the 3D Razorpay Verified Badge (Step 03)
      upiGroup.visible = a.upiVisible;
      if (a.upiVisible) {
        const upiWorld = screenToWorld(a.upiX, a.upiY, vpW, vpH, camera, 1.2);
        upiGroup.position.set(upiWorld.x, upiWorld.y + Math.sin(elapsed * 2.1) * 0.05, 1.2);
        upiGroup.scale.setScalar(0.84);
        upiGroup.rotation.y = Math.sin(elapsed * 1.45) * 0.42 + mouseNdcX * 0.16;
        upiGroup.rotation.x = Math.sin(elapsed * 1.1) * 0.08 - mouseNdcY * 0.08;
        upiOuterRing.rotation.z = elapsed * 0.35;
      }

      // 4. Document Beam + Flying Mini-Docs: Hero Phone -> Printer OR How-It-Works Phone/QR -> Printer!
      const useHeroBeam = a.heroBeamActive && a.heroPhoneX > 0 && a.printerVisible;
      const useHowBeam = !useHeroBeam && a.howBeamActive && a.howPhoneX > 0 && a.printerVisible;
      const showBeam = useHeroBeam || useHowBeam;

      beamPoints.visible = showBeam;
      if (showBeam) {
        const sx = useHeroBeam ? a.heroPhoneX : a.howPhoneX;
        const sy = useHeroBeam ? a.heroPhoneY : a.howPhoneY;
        p0.copy(screenToWorld(sx, sy, vpW, vpH, camera, 0.4));
        p1.copy(printerTopWorld);
        pMid.set((p0.x + p1.x) * 0.5, Math.max(p0.y, p1.y) + (useHeroBeam ? (vpW < 640 ? 0.95 : 1.35) : 1.6), -0.6);

        const attr = beamGeo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < BEAM_COUNT; i++) {
          const t = (elapsed * 0.36 + i / BEAM_COUNT) % 1;
          const inv = 1 - t;
          const bx = inv * inv * p0.x + 2 * inv * t * pMid.x + t * t * p1.x;
          const by = inv * inv * p0.y + 2 * inv * t * pMid.y + t * t * p1.y;
          const bz = inv * inv * p0.z + 2 * inv * t * pMid.z + t * t * p1.z;
          const swirl = Math.sin(t * Math.PI) * 0.16;
          attr.setXYZ(i, bx + Math.cos(elapsed * 2.6 + i) * swirl, by + Math.sin(elapsed * 2.6 + i) * swirl, bz);
        }
        attr.needsUpdate = true;

        const mobileScale = vpW < 640 ? 0.68 : 1;
        miniDocs.forEach((doc) => {
          doc.mesh.visible = !reducedMotion;
          const t = (elapsed * (useHowBeam ? 0.38 : 0.3) + doc.offset) % 1;
          const inv = 1 - t;
          doc.mesh.position.set(
            inv * inv * p0.x + 2 * inv * t * pMid.x + t * t * p1.x,
            inv * inv * p0.y + 2 * inv * t * pMid.y + t * t * p1.y,
            inv * inv * p0.z + 2 * inv * t * pMid.z + t * t * p1.z,
          );
          doc.mesh.rotation.set(
            -0.3 + Math.sin(elapsed * 2.0 + doc.offset) * 0.22,
            elapsed * 1.0,
            Math.sin(t * Math.PI) * 0.3,
          );
          doc.mesh.scale.setScalar((0.32 + Math.sin(t * Math.PI) * 0.6) * mobileScale);
        });
      } else {
        miniDocs.forEach((doc) => {
          doc.mesh.visible = false;
        });
      }

      // 5. Printer Throws Curled Prints at a Calm, Human-Eye-Friendly Pace
      const isMobileVp = vpW < 640;
      if (!reducedMotion && a.printerVisible) {
        mouthDir.set(0, 0, 1).applyQuaternion(printerObj.group.quaternion).normalize();
        const velocityBoost = Math.min(0.65, a.scrollVelocity * 0.03);
        const rate = (a.stepIndex >= 3 ? 0.95 : 0.28) + velocityBoost;
        spawnAccumulator += dt * rate;
        while (spawnAccumulator >= 1) {
          spawnAccumulator -= 1;
          spawnPrintedSheet(printerSlotWorld, mouthDir, 0.9 + velocityBoost * 0.15, isMobileVp);
        }

        const bucket = Math.floor(a.scrollProgress * 4);
        if (bucket !== lastScrollBucket && a.scrollProgress > 0.12) {
          const burstCount = a.stepIndex >= 3 ? 2 : 1;
          for (let b = 0; b < burstCount; b++) {
            spawnPrintedSheet(printerSlotWorld, mouthDir, 1.0, isMobileVp);
          }
          lastScrollBucket = bucket;
        }
      }

      // 6. Advance Flying Sheets Across Full Viewport
      let anyActive = false;
      const targetScaleBase = isMobileVp ? 0.62 : 0.92;
      for (const s of sheetPool) {
        if (!s.active) continue;
        anyActive = true;
        s.age += dt;
        if (s.age >= s.maxAge) {
          s.active = false;
          s.mesh.visible = false;
          continue;
        }

        const life = s.age / s.maxAge;
        s.vx = s.vx * (1 - dt * 0.45) + mouseNdcX * dt * 1.0;
        s.vy = s.vy * (1 - dt * 0.42) - dt * 1.15 - mouseNdcY * dt * 0.6;
        s.vz = s.vz * (1 - dt * 0.58);

        s.mesh.position.x += s.vx * dt + Math.sin(elapsed * 2.4 + s.flutterPhase) * dt * 0.4;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;

        s.mesh.rotation.x += s.rotSpeedX * dt;
        s.mesh.rotation.y += s.rotSpeedY * dt;
        s.mesh.rotation.z += s.rotSpeedZ * dt;

        const popScale = Math.min(1, s.age * 3.8);
        s.mesh.scale.setScalar(0.28 + popScale * (targetScaleBase - 0.28));

        const mat = s.mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = life > 0.72 ? Math.max(0, (1 - life) / 0.28) : 1;
      }

      if (a.printerVisible || a.qrVisible || a.upiVisible || showBeam || anyActive) {
        renderer.render(scene, camera);
      } else {
        renderer.clear();
      }
    };

    animate();

    return () => {
      isDisposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      themeObserver.disconnect();

      envRT.dispose();
      pool.geometries.forEach((g) => g.dispose());
      pool.materials.forEach((m) => m.dispose());
      pool.textures.forEach((t) => t.dispose());
      renderer?.dispose();
      if (renderer && renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [anchorsRef]);

  return (
    <div
      ref={hostRef}
      className="fixed inset-0 pointer-events-none select-none z-10"
      aria-hidden="true"
    />
  );
}
