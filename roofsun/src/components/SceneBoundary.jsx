import React from "react";
import RoofScene from "./RoofScene.jsx";
export default class SceneBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <>
        <p className="scene3d-help">
          {this.props.t(
            "3D could not load; showing SVG.",
            "3D 未能載入，改用 SVG 示意。",
          )}
        </p>
        <RoofScene {...this.props} topView={false} />
      </>
    ) : (
      this.props.children
    );
  }
}
