import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Fallback from "./RoofScene.jsx";
import { fmt } from "../lib/format.js";
import { sunTime } from "../lib/sunFrame.js";

// Adapted only from JESON-ROOFTOPJIM@51854cf; manual layout editing removed.
export default function RoofScene3D({ inputs, config, result, sun, t }) {
  const sunRef = useRef(sun);
  sunRef.current = sun;
  const host = useRef(null),
    pose = useRef(null),
    resetView = useRef(() => {});
  const [failed, setFailed] = useState(false);
  const height = 9; // Visual-only three-storey body: assumed 3 m per floor.
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
    controls.minPolarAngle = Math.PI / 12;
    if (pose.current) {
      camera.position.fromArray(pose.current.position);
      controls.target.fromArray(pose.current.target);
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

    const ground = box(
      span * 30,
      0.1,
      span * 30,
      0,
      -height - 0.3,
      0,
      mat(0xc4d3c6),
    );
    ground.castShadow = false;
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
    // Direct owner answers, never invert a sampled horizon into buildings.
    // Distance is from the nearest roof edge; facade spans the assumed 120° sector.
    const neighbour = inputs.neighbour,
      neighbourMeshes = [];
    if (neighbour.floors > 0) {
      const az = ((180 - inputs.roof_rotation) * Math.PI) / 180;
      const direction = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az));
      const edge = (Math.abs(direction.x) * w + Math.abs(direction.z) * d) / 2;
      const thickness = 3; // Illustrative facade depth; not a model input.
      const relative = neighbour.floors * 3,
        total = height + relative;
      const centre = direction
        .clone()
        .multiplyScalar(edge + neighbour.distance + thickness / 2);
      const m = box(
        2 * neighbour.distance * Math.tan(Math.PI / 3),
        total,
        thickness,
        centre.x,
        relative - total / 2,
        centre.z,
        mat(0xb7c6ce),
      );
      m.rotation.y = -az;
      neighbourMeshes.push(m);
      m.userData.dimensionText = zh
        ? `南面鄰屋 · 高出 ${relative} 米 · 相距 ${neighbour.distance} 米`
        : `Southern neighbour · ${relative} m higher · ${neighbour.distance} m away`;
    }
    const group = new THREE.Group();
    scene.add(group);
    const panelRecords = [];
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
      const shadeGeometry = new THREE.BufferGeometry();
      shadeGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(new Array(12).fill(0), 3),
      );
      shadeGeometry.setIndex([0, 1, 2, 0, 2, 3]);
      const overlay = new THREE.Mesh(
        shadeGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xba7837,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      panelGroup.add(overlay);
      panelRecords.push({ panel: p, pts, mesh, overlay });
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
    scene.updateMatrixWorld(true);
    const shadowBounds = new THREE.Box3().setFromObject(roofSurface);
    for (const m of [...neighbourMeshes, ...panelRecords.map((p) => p.mesh)])
      shadowBounds.union(new THREE.Box3().setFromObject(m));
    const shadowCentre = shadowBounds.getCenter(new THREE.Vector3());
    const radius = Math.max(
      1,
      shadowBounds.getSize(new THREE.Vector3()).length() / 2,
    );
    const shadowPoints = [];
    for (const x of [shadowBounds.min.x, shadowBounds.max.x])
      for (const y of [shadowBounds.min.y, shadowBounds.max.y])
        for (const z of [shadowBounds.min.z, shadowBounds.max.z])
          shadowPoints.push(new THREE.Vector3(x, y, z));
    scene.add(light.target);
    light.target.position.copy(shadowCentre);
    function fitShadow(direction) {
      light.position
        .copy(shadowCentre)
        .addScaledVector(direction, radius * 2 + 1);
      light.updateMatrixWorld(true);
      light.target.updateMatrixWorld(true);
      const c = light.shadow.camera;
      c.position.copy(light.position);
      c.lookAt(shadowCentre);
      c.updateMatrixWorld(true);
      const points = shadowPoints.map((p) =>
        p.clone().applyMatrix4(c.matrixWorldInverse),
      );
      c.left = Math.min(...points.map((p) => p.x)) - 0.1;
      c.right = Math.max(...points.map((p) => p.x)) + 0.1;
      c.bottom = Math.min(...points.map((p) => p.y)) - 0.1;
      c.top = Math.max(...points.map((p) => p.y)) + 0.1;
      c.near = Math.max(0.01, Math.min(...points.map((p) => -p.z)) - 0.1);
      c.far = Math.max(c.near + 1, Math.max(...points.map((p) => -p.z)) + 0.1);
      c.updateProjectionMatrix();
    }
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
      fitShadow(direction);
      let shaded = 0;
      for (const { panel, pts, overlay } of panelRecords) {
        const fraction =
          (sample.sample_altitude ?? sample.altitude) <= 0
            ? 0
            : !sample.beam_clear
              ? 1
              : Math.max(0, Math.min(1, sample.row_shade?.[panel.row] || 0));
        overlay.visible = fraction > 1e-6;
        if (overlay.visible) {
          shaded++;
          const vertices = [
            pts[0],
            pts[1],
            pts[1].clone().lerp(pts[2], fraction),
            pts[0].clone().lerp(pts[3], fraction),
          ];
          overlay.geometry.attributes.position.set(
            vertices.flatMap((p) => p.toArray()),
          );
          overlay.geometry.attributes.position.needsUpdate = true;
          overlay.geometry.computeBoundingSphere();
        }
      }
      renderer.domElement.dataset.shadedPanels = String(shaded);
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
      pointer = new THREE.Vector2();
    function showDimensions(e) {
      if (e.buttons) {
        hideDimensions();
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const text = ray.intersectObjects(pickables, false)[0]?.object.userData
        .dimensionText;
      tooltip.hidden = !text;
      if (!text) return;
      tooltip.textContent = text;
      tooltip.style.left = `${Math.max(8, Math.min(e.clientX - rect.left + 12, rect.width - tooltip.offsetWidth - 8))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(e.clientY - rect.top + 12, rect.height - tooltip.offsetHeight - 8))}px`;
    }
    function keydown(e) {
      if (e.key === "Escape") hideDimensions();
    }
    const canvas = renderer.domElement;
    canvas.addEventListener("pointermove", showDimensions);
    const contextLost = (e) => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("pointerleave", hideDimensions);
    canvas.addEventListener("keydown", keydown);
    canvas.tabIndex = 0;
    controls.addEventListener("start", hideDimensions);
    const resize = () => {
      const width = Math.max(1, node.clientWidth),
        height = Math.max(1, node.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
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
    const initialPose = new THREE.Vector3(span * 1.2, span * 1.15, span * 1.5);
    if (cameraObstacles.some((b) => b.containsPoint(initialPose)))
      initialPose.set(0, span * 2.2, 0.01);
    resetView.current = () => {
      // Drain orbit inertia before restoring a fixed pose.
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      controls.reset();
      camera.position.copy(initialPose);
      controls.target.set(0, 0, 0);
      controls.update();
      controls.enableDamping = damping;
      lastSafe.copy(camera.position);
      hideDimensions();
    };
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
      canvas.dataset.cameraX = camera.position.x.toFixed(3);
      canvas.dataset.cameraZ = camera.position.z.toFixed(3);
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
      canvas.removeEventListener("pointermove", showDimensions);
      canvas.removeEventListener("webglcontextlost", contextLost);
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
  }, [inputs, config, result, failed, zh]);
  return (
    <div className="scene3d">
      {sun && (
        <div className="scene-readings" aria-live="off">
          <strong>
            {sunTime(sun)} · {t("HK time", "香港時間")}
          </strong>
          <span>
            {t("Sun elevation", "太陽高度角")}: {fmt(sun.altitude, 1)}°
          </span>
          <span>
            {t("Azimuth", "方位角")}: {fmt(sun.azimuth, 1)}°
          </span>
          <strong data-testid="shaded-panels">
            {t("Shaded panels", "被遮面板")} {sun.shaded_panels} /{" "}
            {result.panels_count}
          </strong>
        </div>
      )}
      {failed ? (
        <>
          <p className="scene3d-help">
            {t(
              "WebGL unavailable; showing the SVG preview.",
              "WebGL 不可用，改用 SVG 示意。",
            )}
          </p>
          <Fallback {...{ inputs, config, result, sun, t, topView: false }} />
        </>
      ) : (
        <>
          <div ref={host} className="scene3d-canvas" />
          <div className="scene3d-tools">
            <button onClick={() => resetView.current()}>
              {t("Reset view", "重設視角")}
            </button>
            <span>
              {t(
                "Drag to orbit · pinch / scroll to zoom",
                "拖動環看 · 雙指／滾輪縮放",
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
