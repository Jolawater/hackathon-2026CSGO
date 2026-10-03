import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Fallback from "./RoofScene.jsx";

export default function RoofScene3D({
  inputs,
  config,
  result,
  sun,
  t,
  topView,
  onPlace,
  onMovePanel,
  onRotate,
}) {
  const sunRef = useRef(sun);
  sunRef.current = sun;
  const host = useRef(null),
    pose = useRef(null),
    translate = useRef(onPlace);
  translate.current = onPlace;
  const rotateRef = useRef(onRotate);
  rotateRef.current = onRotate;
  const movePanelRef = useRef(onMovePanel);
  movePanelRef.current = onMovePanel;
  const [dimensions, setDimensions] = useState(true),
    [placing, setPlacing] = useState(false),
    [singlePanel, setSinglePanel] = useState(false),
    [rotating, setRotating] = useState(false),
    [height, setHeight] = useState(9),
    [failed, setFailed] = useState(false);
  const zh = t("en", "zh") === "zh";
  useEffect(() => {
    if (failed || !host.current) return;
    const node = host.current,
      w = inputs.width,
      d = inputs.depth,
      span = Math.max(w, d, 8);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xe7f0f4);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    node.appendChild(renderer.domElement);
    const tooltip = document.createElement("div");
    tooltip.className = "scene-dimension-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    node.appendChild(tooltip);
    const pickables = [];
    const hideDimensions = () => {
      tooltip.hidden = true;
    };
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.setAttribute(
      "aria-label",
      zh ? "拖動旋轉天台，滾輪縮放" : "Drag to orbit rooftop, scroll to zoom",
    );
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(43, 1, 0.05, 1000);
    camera.position.set(span * 1.2, span * 1.15, span * 1.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    // Stay outside the rooftop footprint, even when viewing a corner.
    controls.minDistance = Math.hypot(w, d) / 2 + 1.2;
    controls.maxDistance = span * 2.8;
    controls.enablePan = false;
    // Stop above the roof instead of allowing the camera underneath it.
    controls.maxPolarAngle = Math.min(
      Math.PI * 0.45,
      Math.acos(Math.min(0.95, 1.8 / controls.minDistance)),
    );
    if (pose.current && !topView) {
      camera.position.fromArray(pose.current.position);
      controls.target.fromArray(pose.current.target);
    }
    if (topView) {
      camera.position.set(0, span * 2.2, 0.01);
      controls.target.set(0, 0, 0);
    }
    const world = (x, y, z = 0) => new THREE.Vector3(x - w / 2, z, d / 2 - y);
    const ambient = new THREE.HemisphereLight(0xd9f0ff, 0x687569, 2.4);
    scene.add(ambient);
    const alt = ((sun?.altitude ?? 40) * Math.PI) / 180,
      az = (((sun?.azimuth ?? 180) - inputs.roof_rotation) * Math.PI) / 180;
    const sunPos = new THREE.Vector3(
      Math.sin(az) * Math.cos(alt),
      Math.sin(alt),
      -Math.cos(az) * Math.cos(alt),
    ).multiplyScalar(span * 1.3);
    const light = new THREE.DirectionalLight(0xfff2c6, alt > 0 ? 3 : 0);
    light.position.copy(sunPos);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, {
      left: -span * 3,
      right: span * 3,
      top: span * 3,
      bottom: -span * 3,
      near: 0.1,
      far: span * 15,
    });
    light.shadow.bias = -0.0003;
    scene.add(light);
    const mat = (color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    const concrete = mat(0xd5d2c6),
      side = mat(0xc7d1d3),
      glass = mat(0x79aab8),
      panelMat = new THREE.MeshStandardMaterial({
        color: 0x12374d,
        metalness: 0.38,
        roughness: 0.3,
        side: THREE.DoubleSide,
      });
    function box(sx, sy, sz, x, y, z, material = concrete) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      pickables.push(m);
      return m;
    }
    box(w, height, d, 0, -height / 2 - 0.12, 0, side);
    const roofSurface = box(w, 0.22, d, 0, -0.11, 0);
    roofSurface.userData.dimensionText = zh
      ? `天台 · 長 ${d.toFixed(2)} 米 × 寬 ${w.toFixed(2)} 米`
      : `Roof · length ${d.toFixed(2)} m × width ${w.toFixed(2)} m`;
    // Low perimeter detail is illustrative; it is not added as a measured obstruction.
    for (const [sx, sz, x, z] of [
      [w, 0.13, 0, -d / 2],
      [w, 0.13, 0, d / 2],
      [0.13, d, -w / 2, 0],
      [0.13, d, w / 2, 0],
    ]) {
      const parapet = box(sx, 0.28, sz, x, 0.14, z, mat(0xb4b5ae));
      parapet.castShadow = false;
    }
    const seamMaterial = new THREE.LineBasicMaterial({
      color: 0xb1b1a8,
      transparent: true,
      opacity: 0.45,
    });
    for (let x = 2; x < w; x += 2) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          world(x, 0.16, 0.006),
          world(x, d - 0.16, 0.006),
        ]),
        seamMaterial,
      );
      scene.add(line);
    }

    box(span * 30, 0.1, span * 30, 0, -height - 0.3, 0, mat(0xc4d3c6));
    for (let floor = 1; floor < height / 3; floor++)
      for (let x = -w / 2 + 0.8; x < w / 2 - 0.4; x += 1.5) {
        box(0.65, 1, 0.025, x, -floor * 3, d / 2 + 0.02, glass);
        box(0.65, 1, 0.025, x, -floor * 3, -d / 2 - 0.02, glass);
      }
    const surfaceCanvas = document.createElement("canvas");
    surfaceCanvas.width = 256;
    surfaceCanvas.height = 256;
    const surfaceContext = surfaceCanvas.getContext("2d");
    surfaceContext.fillStyle = "#d7d4c8";
    surfaceContext.fillRect(0, 0, 256, 256);
    let seed = 31;
    for (let i = 0; i < 5000; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 256;
      seed = (seed * 16807) % 2147483647;
      const y = seed % 256;
      surfaceContext.fillStyle =
        i % 2 ? "rgba(80,78,70,.07)" : "rgba(255,255,245,.12)";
      surfaceContext.fillRect(x, y, 1, 1);
    }
    const roofTexture = new THREE.CanvasTexture(surfaceCanvas);
    roofTexture.wrapS = roofTexture.wrapT = THREE.RepeatWrapping;
    roofTexture.repeat.set(w / 2, d / 2);
    concrete.map = roofTexture;
    concrete.needsUpdate = true;
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        [
          [0.5, 0.5],
          [w - 0.5, 0.5],
          [w - 0.5, d - 0.5],
          [0.5, d - 0.5],
          [0.5, 0.5],
        ].map(([x, y]) => world(x, y, 0.025)),
      ),
      new THREE.LineBasicMaterial({ color: 0x6c9093 }),
    );
    scene.add(outline);
    const textures = [roofTexture];
    function label(text, pos) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 96;
      const ctx = c.getContext("2d");
      ctx.font = "48px sans-serif";
      c.width = Math.ceil(ctx.measureText(text).width) + 40;
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.fillRect(0, 0, c.width, 96);
      ctx.fillStyle = "#214453";
      ctx.font = "48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(text, c.width / 2, 64);
      const tex = new THREE.CanvasTexture(c);
      textures.push(tex);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, depthTest: false }),
      );
      sprite.position.copy(pos);
      sprite.scale.set((span * 0.1 * c.width) / 96, span * 0.1, 1);
      scene.add(sprite);
      return sprite;
    }
    const compass = document.createElement("div");
    compass.className = "scene-compass";
    compass.setAttribute(
      "aria-label",
      zh ? "隨視角轉動的指南針" : "Compass follows the camera",
    );
    compass.innerHTML =
      '<div class="compass-ring"><span class="compass-n">' +
      (zh ? "北" : "N") +
      '</span><span class="compass-e">' +
      (zh ? "東" : "E") +
      '</span><span class="compass-s">' +
      (zh ? "南" : "S") +
      '</span><span class="compass-w">' +
      (zh ? "西" : "W") +
      "</span><i></i></div>";
    node.appendChild(compass);
    const northVector = new THREE.Vector3(
      -Math.sin((inputs.roof_rotation * Math.PI) / 180),
      0,
      -Math.cos((inputs.roof_rotation * Math.PI) / 180),
    );
    function updateCompass() {
      const centre = new THREE.Vector3().project(camera),
        north = northVector.clone().project(camera);
      const bearing =
        (Math.atan2(north.x - centre.x, north.y - centre.y) * 180) / Math.PI;
      compass.style.setProperty("--bearing", `${bearing}deg`);
      compass.style.setProperty("--counter-bearing", `${-bearing}deg`);
    }
    (inputs.exclusions || []).forEach((o) => {
      const p = world(o.x + o.width / 2, o.y + o.depth / 2, o.height / 2);
      box(
        o.width,
        Math.max(0.02, o.height),
        o.depth,
        p.x,
        p.y,
        p.z,
        mat(0xbda687),
      );
    });
    // Horizon data cannot identify actual buildings: these are explicitly labelled proxies.
    (inputs.neighbours?.length ? [] : inputs.horizon || []).forEach(
      (angle, i) => {
        if (angle <= 0) return;
        const a = ((i * 30 - inputs.roof_rotation) * Math.PI) / 180,
          r = span * 0.9,
          relative = Math.min(Math.tan((angle * Math.PI) / 180) * r, span * 4),
          bh = relative + height;
        const m = box(
          span * 0.42,
          bh,
          span * 0.18,
          Math.sin(a) * r,
          bh / 2 - height,
          -Math.cos(a) * r,
          mat(0xb7c6ce),
        );
        m.rotation.y = -a;
        if (dimensions && i === inputs.horizon.findIndex((v) => v > 0))
          label(
            zh ? "鄰樓近似輪廓" : "Approximate neighbour",
            new THREE.Vector3(m.position.x, relative + 0.6, m.position.z),
          );
      },
    );
    (inputs.neighbours || []).forEach((o) => {
      const p = world(
        o.x + o.width / 2,
        o.y + o.depth / 2,
        (o.height - height) / 2,
      );
      box(o.width, o.height + height, o.depth, p.x, p.y, p.z, mat(0xb7c6ce));
    });
    const group = new THREE.Group();
    scene.add(group);
    const elevation = 1.762 * Math.sin((config.tilt * Math.PI) / 180);
    (result?.panels || []).forEach((p, index) => {
      const panelGroup = new THREE.Group();
      group.add(panelGroup);
      const pts = p.corners.map(([x, y], j) =>
        world(x, y, 0.035 + (j >= 2 ? elevation : 0)),
      );
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          pts.flatMap((v) => v.toArray()),
          3,
        ),
      );
      geom.setIndex([0, 1, 2, 0, 2, 3]);
      geom.computeVertexNormals();
      const mesh = new THREE.Mesh(geom, panelMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const panelLength = pts[0].distanceTo(pts[3]).toFixed(3),
        panelWidth = pts[0].distanceTo(pts[1]).toFixed(3);
      mesh.userData.dimensionText = zh
        ? `單塊太陽能板 · 長 ${panelLength} 米 × 寬 ${panelWidth} 米`
        : `One panel · length ${panelLength} m × width ${panelWidth} m`;
      pickables.push(mesh);
      mesh.userData.panelIndex = index;
      panelGroup.add(mesh);
      panelGroup.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0xc1dce2 }),
        ),
      );
      for (const f of [0.25, 0.5, 0.75])
        panelGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              pts[0].clone().lerp(pts[1], f),
              pts[3].clone().lerp(pts[2], f),
            ]),
            new THREE.LineBasicMaterial({ color: 0x658491 }),
          ),
        );
    });
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const gc = glowCanvas.getContext("2d");
    const gradient = gc.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,.96)");
    gradient.addColorStop(0.3, "rgba(255,255,255,.42)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    gc.fillStyle = gradient;
    gc.fillRect(0, 0, 128, 128);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    textures.push(glowTexture);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.scale.set(span * 18, span * 18, 1);
    scene.add(glow);
    const arrows = [-w * 0.25, 0, w * 0.25].map((x) => {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(x, 2, 0),
        span * 0.55,
        0xf2b323,
        0.3,
        0.17,
      );
      scene.add(arrow);
      return { arrow, target: new THREE.Vector3(x, 0.5, 0) };
    });
    const daylightColor = new THREE.Color(0xcbdfe8),
      nightColor = new THREE.Color(0x111b31),
      skyColor = new THREE.Color();
    function updateSun() {
      const sample = sunRef.current;
      if (!sample) return;
      const elevation = (sample.altitude * Math.PI) / 180,
        bearing = ((sample.azimuth - inputs.roof_rotation) * Math.PI) / 180;
      const direction = new THREE.Vector3(
        Math.sin(bearing) * Math.cos(elevation),
        Math.sin(elevation),
        -Math.cos(bearing) * Math.cos(elevation),
      );
      const daylight = THREE.MathUtils.smoothstep(sample.altitude, -8, 12);
      light.position.copy(direction).multiplyScalar(span * 1.3);
      light.intensity =
        sample.altitude > 0 ? 3 * Math.min(1, sample.altitude / 12) : 0;
      ambient.intensity = 0.18 + 2.22 * daylight;
      skyColor.copy(nightColor).lerp(daylightColor, daylight);
      renderer.setClearColor(skyColor);
      // Distant sky glow: camera-relative distance prevents a miniature sun near the roof.
      glow.position.copy(camera.position).addScaledVector(direction, span * 40);
      glow.visible = sample.altitude > 0;
      glow.material.opacity = THREE.MathUtils.smoothstep(sample.altitude, 0, 8);
      renderer.domElement.dataset.sunAzimuth = sample.azimuth.toFixed(2);
      renderer.domElement.dataset.sunElevation = sample.altitude.toFixed(2);
      renderer.domElement.dataset.sunX = direction.x.toFixed(3);
      renderer.domElement.dataset.sunZ = direction.z.toFixed(3);
      for (const { arrow, target } of arrows) {
        arrow.visible = sample.altitude > 0;
        arrow.position.copy(target).addScaledVector(direction, span * 0.65);
        arrow.setDirection(direction.clone().negate());
      }
    }
    const ray = new THREE.Raycaster(),
      plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      pointer = new THREE.Vector2();
    let start = null,
      press = null,
      dragTarget = group,
      dragIndex = null;
    function showDimensions(e) {
      if (!dimensions || placing || rotating || e.buttons) {
        hideDimensions();
        return;
      }
      hit(e);
      scene.updateMatrixWorld(true);
      const object = ray.intersectObjects(pickables, false)[0]?.object;
      const text = object?.userData.dimensionText;
      if (!text) {
        hideDimensions();
        return;
      }
      tooltip.textContent = text;
      tooltip.hidden = false;
      const b = node.getBoundingClientRect();
      const x = Math.max(
        8,
        Math.min(e.clientX - b.left + 14, b.width - tooltip.offsetWidth - 8),
      );
      const y = Math.max(
        8,
        Math.min(e.clientY - b.top + 16, b.height - tooltip.offsetHeight - 8),
      );
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    }
    function keydown(e) {
      if (e.key === "Escape") hideDimensions();
    }
    function hit(e) {
      const b = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        (-(e.clientY - b.top) / b.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, p) ? p : null;
    }
    function down(e) {
      press = { x: e.clientX, y: e.clientY };
      hideDimensions();
      if ((!placing && !rotating) || !result?.panels?.length) return;
      start = hit(e);
      dragTarget = group;
      dragIndex = null;
      if (singlePanel && !rotating) {
        const selected = ray.intersectObjects(pickables, false)[0]?.object;
        if (selected?.userData.panelIndex == null) {
          start = null;
          return;
        }
        dragIndex = selected.userData.panelIndex;
        dragTarget = group.children[dragIndex];
      }
      if (start) {
        controls.enabled = false;
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    }
    function move(e) {
      if (!start) {
        if (e.pointerType !== "touch") showDimensions(e);
        return;
      }
      const p = hit(e);
      if (p && rotating) {
        const delta = Math.atan2(p.x, -p.z) - Math.atan2(start.x, -start.z);
        group.rotation.y = -delta;
        return;
      }
      if (p) dragTarget.position.set(p.x - start.x, 0, p.z - start.z);
    }
    function up(e) {
      if (!start) {
        if (
          e.type !== "pointercancel" &&
          e.pointerType === "touch" &&
          press &&
          Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6
        )
          showDimensions(e);
        press = null;
        return;
      }
      start = null;
      controls.enabled = true;
      if (rotating) {
        const angle =
          (((config.azimuth - (group.rotation.y * 180) / Math.PI) % 360) +
            360) %
          360;
        group.rotation.y = 0;
        rotateRef.current?.(Math.min(359, Math.round(angle)));
        return;
      }
      if (dragIndex !== null) {
        movePanelRef.current?.(
          dragIndex,
          dragTarget.position.x,
          -dragTarget.position.z,
        );
        dragTarget.position.set(0, 0, 0);
        dragIndex = null;
        return;
      }
      const dx = +(Number(config.offset_x || 0) + group.position.x).toFixed(2),
        dy = +(Number(config.offset_y || 0) - group.position.z).toFixed(2);
      group.position.set(0, 0, 0);
      if (Math.abs(dx) <= 30 && Math.abs(dy) <= 30) translate.current?.(dx, dy);
    }
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", hideDimensions);
    canvas.addEventListener("keydown", keydown);
    canvas.tabIndex = 0;
    controls.addEventListener("start", hideDimensions);
    const resize = () => {
      renderer.setSize(node.clientWidth, 440);
      camera.aspect = node.clientWidth / 440;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    const limitNotice = document.createElement("div");
    limitNotice.className = "scene-camera-limit";
    limitNotice.setAttribute("role", "status");
    limitNotice.textContent = zh
      ? "已到視角邊界 · 請反向拖動或拉遠"
      : "View limit reached · drag back or zoom out";
    limitNotice.hidden = true;
    node.appendChild(limitNotice);
    scene.updateMatrixWorld(true);
    const cameraObstacles = pickables
      .filter((o) => o.geometry?.type === "BoxGeometry")
      .map((o) => new THREE.Box3().setFromObject(o).expandByScalar(0.4));
    controls.update();
    if (cameraObstacles.some((b) => b.containsPoint(camera.position))) {
      camera.position.set(0, span * 2.2, 0.01);
      controls.target.set(0, 0, 0);
      controls.update();
    }
    const lastSafe = camera.position.clone(),
      travel = new THREE.Vector3(),
      contact = new THREE.Vector3(),
      travelRay = new THREE.Ray();
    function constrainCamera() {
      travel.subVectors(camera.position, lastSafe);
      const length = travel.length();
      travelRay.set(lastSafe, travel.clone().normalize());
      const blocked = cameraObstacles.some(
        (b) =>
          b.containsPoint(camera.position) ||
          (length > 1e-8 &&
            travelRay.intersectBox(b, contact) &&
            contact.distanceTo(lastSafe) <= length),
      );
      if (blocked) {
        camera.position.copy(lastSafe);
        camera.lookAt(controls.target);
      } else lastSafe.copy(camera.position);
      const radius = camera.position.distanceTo(controls.target);
      const polar = Math.acos(
        THREE.MathUtils.clamp(
          (camera.position.y - controls.target.y) / radius,
          -1,
          1,
        ),
      );
      limitNotice.hidden = !(
        blocked ||
        polar >= controls.maxPolarAngle - 0.003 ||
        radius <= controls.minDistance + 0.02 ||
        radius >= controls.maxDistance - 0.02
      );
      canvas.dataset.cameraHeight = camera.position.y.toFixed(3);
      canvas.dataset.cameraDistance = radius.toFixed(3);
      canvas.dataset.minCameraDistance = controls.minDistance.toFixed(3);
      canvas.dataset.cameraBlocked = String(blocked);
    }
    let frame;
    function animate() {
      frame = requestAnimationFrame(animate);
      controls.update();
      constrainCamera();
      updateSun();
      updateCompass();
      renderer.render(scene, camera);
    }
    animate();
    return () => {
      pose.current = {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      };
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", hideDimensions);
      canvas.removeEventListener("keydown", keydown);
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
      });
      textures.forEach((tex) => tex.dispose());
      renderer.dispose();
      node.replaceChildren();
    };
  }, [
    inputs,
    config,
    result,
    topView,
    dimensions,
    placing,
    singlePanel,
    rotating,
    height,
    failed,
    zh,
  ]);
  return (
    <div className="scene3d">
      <div className="scene3d-toolbar">
        <label>
          <input
            type="checkbox"
            checked={dimensions}
            onChange={(e) => setDimensions(e.target.checked)}
          />
          {t("Dimensions on hover", "懸停查看尺寸")}
        </label>
        <label>
          {t("Building height", "樓高")}
          <select
            aria-label={t("Building height", "樓高")}
            value={height}
            onChange={(e) => setHeight(+e.target.value)}
          >
            {[9, 30, 60].map((h) => (
              <option key={h} value={h}>
                {h} m
              </option>
            ))}
          </select>
        </label>
        <button
          aria-pressed={rotating}
          onClick={() => {
            setRotating((v) => !v);
            setPlacing(false);
          }}
        >
          {rotating
            ? t("Finish rotating", "完成旋轉")
            : t("Rotate panels", "旋轉面板")}
        </button>
        {placing && (
          <label>
            {t("Move", "移動方式")}
            <select
              aria-label={t("Placement type", "放置方式")}
              value={singlePanel ? "single" : "array"}
              onChange={(e) => setSinglePanel(e.target.value === "single")}
            >
              <option value="array">{t("Whole array", "整組面板")}</option>
              <option value="single">{t("One panel", "單塊面板")}</option>
            </select>
          </label>
        )}
        <button
          aria-pressed={placing}
          onClick={() => {
            setPlacing(!placing);
            setRotating(false);
          }}
        >
          {placing
            ? t("Finish placing", "完成放置")
            : t("Place panels", "放置面板")}
        </button>
      </div>
      {failed ? (
        <>
          <p>
            {t(
              "3D is unavailable; showing a static view.",
              "此瀏覽器未能啟動 3D，先顯示靜態示意。",
            )}
          </p>
          <Fallback {...{ inputs, config, result, sun, t, topView }} />
        </>
      ) : (
        <div ref={host} className="scene3d-canvas" />
      )}
      <p className="scene3d-help">
        {rotating
          ? t(
              "Drag around the rooftop centre to rotate the array.",
              "繞天台中心拖動，直接旋轉面板朝向。",
            )
          : placing
            ? t(
                "Drag a panel or the whole array, then confirm your changes.",
                "拖動所選單塊或整組面板，再按確認套用。",
              )
            : t(
                "Hover over the roof or a panel for dimensions; tap on mobile. Drag to orbit · scroll / pinch to zoom.",
                "移到天台或面板上查看長寬，手機可點按。拖動可環看 · 滾輪／雙指縮放。",
              )}
      </p>
      <details className="microcopy">
        <summary>
          {t("What is real in this scene?", "畫面哪些部分跟隨資料？")}
        </summary>
        {t(
          "Roof, panels and rooftop objects follow the calculation. Neighbour silhouettes approximate the horizon angles; they are not surveyed buildings. The low parapet and building height are illustrative, not measured shading inputs. A high-rise view does not make village-house screening applicable. Rendered shadows illustrate geometry; energy uses the documented shading approximations.",
          "天台、面板和天台物件跟隨計算資料。鄰樓是按遮擋角度還原的近似輪廓，不是實測建築。矮圍牆和樓高只是畫面細節，並非量度的遮擋輸入，高樓不能直接套用村屋檢查。画面陰影展示幾何關係；發電使用另有說明的遮擋近似。",
        )}
      </details>
    </div>
  );
}
