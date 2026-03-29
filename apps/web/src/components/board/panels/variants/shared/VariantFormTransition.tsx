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

import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const layoutTransition = { layout: { duration: 0.2, ease: 'easeOut' as const } }
const itemTransition = { duration: 0.12 }

export function VariantFormTransition({
  variantKey,
  children,
}: {
  variantKey: string | null
  children: ReactNode
}) {
  return (
    <motion.div
      layout="size"
      className="relative overflow-hidden"
      transition={layoutTransition}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {variantKey ? (
          <motion.div
            key={variantKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={itemTransition}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}
