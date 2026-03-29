/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Polyfill for DOMMatrix + Path2D — required by pdfjs-dist (used via pdf-parse).
 *
 * pdfjs-dist initializes module-level constants like `SCALE_MATRIX = new DOMMatrix()`
 * even for text-only operations. In Node.js / Electron main process, DOMMatrix
 * is not available, causing "DOMMatrix is not defined" errors when the bundled
 * server.mjs loads pdf-parse.
 *
 * This minimal polyfill provides enough of the DOMMatrix interface for pdfjs-dist
 * module initialization. We only use pdf-parse for text extraction, not rendering.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

if (typeof globalThis.DOMMatrix === 'undefined') {
  const M2D_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const
  const M3D_KEYS = [
    'm11', 'm12', 'm13', 'm14',
    'm21', 'm22', 'm23', 'm24',
    'm31', 'm32', 'm33', 'm34',
    'm41', 'm42', 'm43', 'm44',
  ] as const

  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true
    isIdentity = true

    constructor(init?: any) {
      if (Array.isArray(init)) {
        if (init.length === 6) {
          for (let i = 0; i < 6; i++) (this as any)[M2D_KEYS[i]!] = init[i] as number
          this.m11 = this.a; this.m12 = this.b
          this.m21 = this.c; this.m22 = this.d
          this.m41 = this.e; this.m42 = this.f
        } else if (init.length === 16) {
          for (let i = 0; i < 16; i++) (this as any)[M3D_KEYS[i]!] = init[i] as number
          this.a = this.m11; this.b = this.m12
          this.c = this.m21; this.d = this.m22
          this.e = this.m41; this.f = this.m42
          this.is2D = false
        }
        this.isIdentity = false
      }
    }

    invertSelf() { return this }
    multiplySelf(_other: any) { return this }
    preMultiplySelf(_other: any) { return this }
    translate(_tx: number, _ty?: number, _tz?: number) { return new DOMMatrixPolyfill() }
    scale(_sx: number, _sy?: number, _sz?: number) { return new DOMMatrixPolyfill() }
    inverse() { return new DOMMatrixPolyfill() }
    transformPoint(_point?: any) { return { x: 0, y: 0, z: 0, w: 1 } }

    toFloat64Array() {
      return new Float64Array([
        this.m11, this.m12, this.m13, this.m14,
        this.m21, this.m22, this.m23, this.m24,
        this.m31, this.m32, this.m33, this.m34,
        this.m41, this.m42, this.m43, this.m44,
      ])
    }

    toFloat32Array() {
      return new Float32Array([
        this.m11, this.m12, this.m13, this.m14,
        this.m21, this.m22, this.m23, this.m24,
        this.m31, this.m32, this.m33, this.m34,
        this.m41, this.m42, this.m43, this.m44,
      ])
    }
  }

  // @ts-expect-error — minimal polyfill, not full spec compliance
  globalThis.DOMMatrix = DOMMatrixPolyfill
}

if (typeof globalThis.Path2D === 'undefined') {
  // @ts-expect-error — minimal stub for pdfjs-dist canvas rendering paths
  globalThis.Path2D = class Path2D {
    addPath(_path: any, _transform?: any) {}
    closePath() {}
    moveTo(_x: number, _y: number) {}
    lineTo(_x: number, _y: number) {}
    bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, _x: number, _y: number) {}
    quadraticCurveTo(_cpx: number, _cpy: number, _x: number, _y: number) {}
    arc(_x: number, _y: number, _r: number, _sa: number, _ea: number, _ccw?: boolean) {}
    rect(_x: number, _y: number, _w: number, _h: number) {}
    ellipse(_x: number, _y: number, _rx: number, _ry: number, _rot: number, _sa: number, _ea: number, _ccw?: boolean) {}
  }
}
