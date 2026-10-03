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
}) {
  const sunRef = useRef(sun);
  sunRef.current = sun;
  const host = useRef(null),
    pose = useRef(null),
    translate = useRef(onPlace);
  translate.current = onPlace;
  const [dimensions, setDimensions] = useState(true),
    [placing, setPlacing] = useState(false),
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    node.appendChild(renderer.domElement);
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
    controls.minDistance = 2;
    controls.maxDistance = span * 8;
    controls.maxPolarAngle = Math.PI * 0.9;
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
      return m;
    }
    box(w, height, d, 0, -height / 2 - 0.12, 0, side);
    box(w, 0.22, d, 0, -0.11, 0);
    box(span * 30, 0.1, span * 30, 0, -height - 0.3, 0, mat(0xc4d3c6));
    for (let floor = 1; floor < height / 3; floor++)
      for (let x = -w / 2 + 0.8; x < w / 2 - 0.4; x += 1.5) {
        box(0.65, 1, 0.025, x, -floor * 3, d / 2 + 0.02, glass);
        box(0.65, 1, 0.025, x, -floor * 3, -d / 2 - 0.02, glass);
      }
    const grid = new THREE.GridHelper(
      Math.max(w, d),
      Math.ceil(Math.max(w, d)),
      0xa1b6b7,
      0xc4d4d2,
    );
    grid.position.y = 0.008;
    scene.add(grid);
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
    const textures = [];
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
    if (dimensions) {
      label(`${w.toFixed(2)} m`, world(w / 2, -0.7, 0.2));
      label(`${d.toFixed(2)} m`, world(-0.8, d / 2, 0.2));
    }
    label(
      "N",
      world(
        w / 2 - Math.sin((inputs.roof_rotation * Math.PI) / 180) * span * 0.65,
        d / 2 + Math.cos((inputs.roof_rotation * Math.PI) / 180) * span * 0.65,
        0.2,
      ),
    );
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
    (inputs.horizon || []).forEach((angle, i) => {
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
    });
    const group = new THREE.Group();
    scene.add(group);
    const elevation = 1.762 * Math.sin((config.tilt * Math.PI) / 180);
    (result?.panels || []).forEach((p) => {
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
      group.add(mesh);
      group.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0xc1dce2 }),
        ),
      );
      for (const f of [0.25, 0.5, 0.75])
        group.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              pts[0].clone().lerp(pts[1], f),
              pts[3].clone().lerp(pts[2], f),
            ]),
            new THREE.LineBasicMaterial({ color: 0x658491 }),
          ),
        );
    });
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(span * 0.045, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd258 }),
    );
    scene.add(orb);
    const sunLabel = label(zh ? "太陽" : "Sun", sunPos.clone());
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const gc = glowCanvas.getContext("2d");
    const gradient = gc.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,231,137,.9)");
    gradient.addColorStop(0.3, "rgba(255,205,65,.35)");
    gradient.addColorStop(1, "rgba(255,205,65,0)");
    gc.fillStyle = gradient;
    gc.fillRect(0, 0, 128, 128);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    textures.push(glowTexture);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.scale.set(span * 0.3, span * 0.3, 1);
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
    const daylightColor = new THREE.Color(0xe7f0f4),
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
      orb.position.copy(direction).multiplyScalar(span * 0.72);
      orb.visible = sample.altitude > 0;
      glow.position.copy(orb.position);
      glow.visible = orb.visible;
      sunLabel.position
        .copy(orb.position)
        .add(new THREE.Vector3(0, span * 0.12, 0));
      sunLabel.visible = orb.visible;
      for (const { arrow, target } of arrows) {
        arrow.visible = sample.altitude > 0;
        arrow.position.copy(target).addScaledVector(direction, span * 0.65);
        arrow.setDirection(direction.clone().negate());
      }
    }
    const ray = new THREE.Raycaster(),
      plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      pointer = new THREE.Vector2();
    let start = null;
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
      if (!placing || !result?.panels?.length) return;
      start = hit(e);
      if (start) {
        controls.enabled = false;
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    }
    function move(e) {
      if (!start) return;
      const p = hit(e);
      if (p) group.position.set(p.x - start.x, 0, p.z - start.z);
    }
    function up() {
      if (!start) return;
      start = null;
      controls.enabled = true;
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
    const resize = () => {
      renderer.setSize(node.clientWidth, 440);
      camera.aspect = node.clientWidth / 440;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    let frame;
    function animate() {
      frame = requestAnimationFrame(animate);
      controls.update();
      updateSun();
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
          {t("Dimensions", "顯示尺寸")}
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
        <button aria-pressed={placing} onClick={() => setPlacing(!placing)}>
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
        {placing
          ? t(
              "Drag the whole array, then confirm your changes.",
              "拖動整組面板，再按確認套用。",
            )
          : t(
              "Drag to orbit 360° · scroll / pinch to zoom.",
              "拖動可 360° 環看 · 滾輪／雙指縮放。",
            )}
      </p>
      <details className="microcopy">
        <summary>
          {t("What is real in this scene?", "畫面哪些部分跟隨資料？")}
        </summary>
        {t(
          "Roof, panels and rooftop objects follow the calculation. Neighbour silhouettes approximate the horizon angles; they are not surveyed buildings. Height changes the illustration only. A high-rise view does not make village-house screening applicable. Rendered shadows illustrate geometry; energy uses the documented shading approximations.",
          "天台、面板和天台物件跟隨計算資料。鄰樓是按遮擋角度還原的近似輪廓，不是實測建築。樓高只改變畫面，高樓不能直接套用村屋檢查。画面陰影展示幾何關係；發電使用另有說明的遮擋近似。",
        )}
      </details>
    </div>
  );
}
