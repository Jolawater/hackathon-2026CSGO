import React from "react";
import { fmt } from "../lib/format.js";
export default function RoofScene({ inputs, config, result, sun, t, topView }) {
  const w = inputs.width,
    d = inputs.depth,
    scale = Math.min(43, 300 / Math.max(w, d));
  const project = (x, y, z = 0) =>
    topView
      ? [300 + (x - w / 2) * scale, 235 - (y - d / 2) * scale]
      : [
          300 + (x - w / 2) * scale + (y - d / 2) * scale * 0.58,
          265 +
            (x - w / 2) * scale * 0.31 -
            (y - d / 2) * scale * 0.52 -
            z * scale * 1.35,
        ];
  const points = (arr) => arr.map((p) => project(...p).join(",")).join(" ");
  const roof = [
    [0, 0, 0],
    [w, 0, 0],
    [w, d, 0],
    [0, d, 0],
  ];
  const height = 1.762 * Math.sin((config.tilt * Math.PI) / 180);
  const north = (inputs.roof_rotation * Math.PI) / 180;
  const origin = project(w / 2, d / 2),
    northPoint = project(w / 2 - Math.sin(north), d / 2 + Math.cos(north));
  const compassRotation =
    (Math.atan2(northPoint[0] - origin[0], origin[1] - northPoint[1]) * 180) /
    Math.PI;
  const altitude = sun?.altitude ?? 0,
    sunAngle = (((sun?.azimuth ?? 180) - inputs.roof_rotation) * Math.PI) / 180;
  const dx =
      -Math.sin(sunAngle) /
      Math.max(Math.tan((altitude * Math.PI) / 180), 0.05),
    dy =
      -Math.cos(sunAngle) /
      Math.max(Math.tan((altitude * Math.PI) / 180), 0.05);
  const panels = (result?.panels || [])
    .map((p, index) => ({ ...p, source_index: index }))
    .sort((a, b) => {
      const ac = a.corners.reduce((v, p) => v + project(...p)[1], 0),
        bc = b.corners.reduce((v, p) => v + project(...p)[1], 0);
      return ac - bc;
    });
  return (
    <svg
      className="roof-scene"
      viewBox="0 0 600 440"
      role="img"
      aria-label={t(
        "Solar module layout and shadows based on the selected time",
        "按所選時間顯示面板排布及陰影",
      )}
    >
      <defs>
        <pattern
          id="floor-grid"
          width="30"
          height="30"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 30 0 L 0 0 0 30"
            fill="none"
            stroke="#dce3d7"
            strokeWidth=".6"
          />
        </pattern>
        <linearGradient id="panel" x1="0" x2="1" y2="1">
          <stop stopColor="#285963" />
          <stop offset="1" stopColor="#113b45" />
        </linearGradient>
        <clipPath id="roof-clip">
          <polygon points={points(roof)} />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="600" height="440" fill="url(#floor-grid)" />
      <ellipse
        cx="304"
        cy="306"
        rx="203"
        ry="55"
        fill="#152e1e"
        opacity=".07"
      />
      {!topView && (
        <>
          <polygon
            points={points([
              [0, 0, -0.65],
              [w, 0, -0.65],
              [w, 0, 0],
              [0, 0, 0],
            ])}
            fill="#c4cdbd"
          />
          <polygon
            points={points([
              [w, 0, -0.65],
              [w, d, -0.65],
              [w, d, 0],
              [w, 0, 0],
            ])}
            fill="#aebca8"
          />
        </>
      )}
      <polygon
        points={points(roof)}
        fill="#f7f8ee"
        stroke="#859b7c"
        strokeWidth="1.6"
      />
      <g clipPath="url(#roof-clip)">
        {Array.from({ length: Math.ceil(w) }, (_, i) => (
          <path
            key={"x" + i}
            d={`M${project(i, 0).join(",")}L${project(i, d).join(",")}`}
            stroke="#dfe5d6"
            strokeWidth=".7"
          />
        ))}
        {Array.from({ length: Math.ceil(d) }, (_, i) => (
          <path
            key={"y" + i}
            d={`M${project(0, i).join(",")}L${project(w, i).join(",")}`}
            stroke="#dfe5d6"
            strokeWidth=".7"
          />
        ))}
        {altitude > 0 &&
          sun?.beam_clear &&
          panels.map((p, i) => (
            <polygon
              key={"shadow" + i}
              points={points(
                p.corners.map(([x, y], j) => [
                  x + (j >= 2 ? height : 0) * dx,
                  y + (j >= 2 ? height : 0) * dy,
                  0,
                ]),
              )}
              fill="#243e2a"
              opacity=".23"
            />
          ))}
      </g>
      <polygon
        points={points([
          [0.5, 0.5],
          [w - 0.5, 0.5],
          [w - 0.5, d - 0.5],
          [0.5, d - 0.5],
        ])}
        fill="none"
        stroke="#a5b798"
        strokeDasharray="4 5"
        strokeWidth="1"
      />
      {inputs.exclusions?.map((o, i) => (
        <g key={`object-${i}`}>
          {altitude > 0 && sun?.beam_clear && (
            <polygon
              points={points([
                [o.x, o.y, 0],
                [o.x + o.width, o.y, 0],
                [o.x + o.width + o.height * dx, o.y + o.height * dy, 0],
                [
                  o.x + o.width + o.height * dx,
                  o.y + o.depth + o.height * dy,
                  0,
                ],
                [o.x + o.height * dx, o.y + o.depth + o.height * dy, 0],
                [o.x, o.y + o.depth, 0],
              ])}
              fill="#705940"
              opacity=".25"
            />
          )}
          <polygon
            points={points([
              [o.x, o.y, 0],
              [o.x + o.width, o.y, 0],
              [o.x + o.width, o.y, o.height],
              [o.x, o.y, o.height],
            ])}
            fill="#a29076"
          />
          <polygon
            points={points([
              [o.x + o.width, o.y, 0],
              [o.x + o.width, o.y + o.depth, 0],
              [o.x + o.width, o.y + o.depth, o.height],
              [o.x + o.width, o.y, o.height],
            ])}
            fill="#807057"
          />
          <polygon
            points={points([
              [o.x, o.y, o.height],
              [o.x + o.width, o.y, o.height],
              [o.x + o.width, o.y + o.depth, o.height],
              [o.x, o.y + o.depth, o.height],
            ])}
            fill="#cfbea3"
            stroke="#8b7b62"
          />
        </g>
      ))}
      {panels.map((p, i) => {
        const pts = p.corners.map(([x, y], j) => [x, y, j >= 2 ? height : 0]);
        const shade =
          sun?.beam_clear &&
          sun.panel_obstacle_clear?.[p.source_index] !== false
            ? sun.row_shade[p.row] || 0
            : 1;
        const mix = (a, b, k) => a.map((v, j) => v + (b[j] - v) * k);
        return (
          <g key={i}>
            <polygon
              points={points(pts)}
              fill="url(#panel)"
              stroke="#b7d4ce"
              strokeWidth="1"
            />
            {[0.25, 0.5, 0.75].map((n) => (
              <path
                key={n}
                d={`M${project(...mix(pts[0], pts[1], n)).join(",")}L${project(...mix(pts[3], pts[2], n)).join(",")}`}
                stroke="#8eb5bb"
                strokeWidth=".5"
                opacity=".6"
              />
            ))}
            {[0.33, 0.66].map((n) => (
              <path
                key={n}
                d={`M${project(...mix(pts[0], pts[3], n)).join(",")}L${project(...mix(pts[1], pts[2], n)).join(",")}`}
                stroke="#8eb5bb"
                strokeWidth=".5"
                opacity=".6"
              />
            ))}
            {shade > 0 && (
              <polygon
                points={points([
                  pts[0],
                  pts[1],
                  mix(pts[1], pts[2], shade),
                  mix(pts[0], pts[3], shade),
                ])}
                fill="#071921"
                opacity=".68"
              />
            )}
          </g>
        );
      })}
      <path
        d={`M${project(0, -0.6).join(",")}L${project(w, -0.6).join(",")}`}
        stroke="#80947a"
        strokeWidth="1"
      />
      <text
        x={project(w / 2, -1)[0]}
        y={project(w / 2, -1)[1] + 12}
        textAnchor="middle"
        fill="#586b52"
        fontSize="12"
      >
        {fmt(w, 1)} m
      </text>
      <text
        x={project(-1, d / 2)[0] - 15}
        y={project(-1, d / 2)[1]}
        fill="#586b52"
        fontSize="12"
      >
        {fmt(d, 1)} m
      </text>
      <g transform="translate(530,344)">
        <circle r="25" fill="#f7f8ee" stroke="#d0d8c7" />
        <g transform={`rotate(${compassRotation})`}>
          <path d="M0-17 6 7 0 3 -6 7Z" fill="#244d39" />
        </g>
        <text y="-33" textAnchor="middle" fontSize="11" fill="#496044">
          N
        </text>
      </g>
      <g transform="translate(25,378)">
        <rect width="165" height="52" rx="8" fill="#fbfcf6" stroke="#d9e1d1" />
        <circle cx="17" cy="17" r="4" fill="#376a6a" />
        <text x="29" y="21" fontSize="11" fill="#455844">
          {t("Solar modules", "太陽能面板")}
        </text>
        <circle cx="17" cy="36" r="4" fill="#1e2c30" />
        <text x="29" y="40" fontSize="11" fill="#455844">
          {t("Geometric shadow", "幾何陰影")}
        </text>
      </g>
      {!panels.length && (
        <text x="300" y="215" textAnchor="middle" fill="#7c4b2c" fontSize="16">
          {t("No modules fit this configuration", "此配置無法放置面板")}
        </text>
      )}
    </svg>
  );
}
