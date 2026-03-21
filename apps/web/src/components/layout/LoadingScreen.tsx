/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { motion } from 'motion/react'
import { PulsarGrid } from './PulsarGrid'

export function LoadingScreen() {
  return (
    <section className="relative h-svh w-full overflow-hidden bg-black">
      {/* 交互式脉冲网格动画背景 */}
      <PulsarGrid />

      {/* 边缘径向渐变遮罩 */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 20%, rgba(0,0,0,0.6) 60%, black 100%)',
        }}
      />

      {/* 顶部黄色点缀线动画 */}
      <motion.div
        className="absolute top-0 left-0 z-[2] h-px"
        style={{ background: 'linear-gradient(to right, #ffcc00, transparent)' }}
        initial={{ width: '0%' }}
        animate={{ width: '60%' }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
      />

      {/* 主要内容 */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        {/* 顶部标签 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mb-8"
        >
          <span
            className="inline-flex items-center gap-2 border px-3 py-1 text-xs uppercase tracking-[0.2em] backdrop-blur-sm"
            style={{
              borderColor: '#222',
              backgroundColor: 'rgba(0,0,0,0.6)',
              color: '#888',
            }}
          >
            <motion.span
              className="inline-block size-1.5"
              style={{ backgroundColor: '#ffcc00' }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            INITIALIZING
          </span>
        </motion.div>

        {/* 主标题 */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mb-4 text-center font-bold leading-[0.9] tracking-tighter"
          style={{ fontSize: 'clamp(3.5rem, 12vw, 8rem)', color: '#fff' }}
        >
          Open
          <span style={{ color: '#ffcc00' }}>Loaf</span>
        </motion.h1>

        {/* 副标题 */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mb-10 text-center text-sm uppercase tracking-[0.2em] md:text-base"
          style={{ color: '#888', fontFamily: '"Space Mono", monospace' }}
        >
          Think less, do more.
        </motion.p>

        {/* 加载进度指示器 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.0 }}
          className="flex flex-col items-center gap-4"
        >
          <div
            className="relative h-px w-48 overflow-hidden"
            style={{ backgroundColor: '#222' }}
          >
            <motion.div
              className="absolute inset-y-0 left-0 h-full"
              style={{ backgroundColor: '#ffcc00' }}
              animate={{ x: ['-100%', '200%'] }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              initial={{ width: '40%' }}
            />
          </div>
          <motion.span
            className="text-xs uppercase tracking-[0.3em]"
            style={{ color: '#555', fontFamily: '"Space Mono", monospace' }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Loading
          </motion.span>
        </motion.div>
      </div>

      {/* 底部黄色点缀线 */}
      <motion.div
        className="absolute right-0 bottom-0 z-[2] h-px"
        style={{ background: 'linear-gradient(to left, #ffcc00, transparent)' }}
        initial={{ width: '0%' }}
        animate={{ width: '40%' }}
        transition={{ duration: 1.8, delay: 0.5, ease: 'easeOut' }}
      />
    </section>
  )
}
