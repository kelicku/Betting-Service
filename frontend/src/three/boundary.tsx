"use client";

/**
 * WebGL の初期化に失敗した場合などに、代替表示へ切り替える。
 * Three.js に依存しない部品だけを置き、使う画面で Three.js 本体（約 900KB）が先に読み込まれないようにする。
 */

import { Component } from "react";

export class ThreeBoundary extends Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("3D 表示を軽量版に切り替えました", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
