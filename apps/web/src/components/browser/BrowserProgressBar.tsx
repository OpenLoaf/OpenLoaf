"use client";

import { motion } from "motion/react";

export function BrowserProgressBar({ visible }: { visible: boolean }) {
  return (
    <motion.div
      // 中文注释：始终占位（2px），避免显示/隐藏时内容上跳；用透明度控制显隐。
      className="h-[2px] w-full overflow-hidden bg-foreground/10"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        // 中文注释：x 的百分比基于“自身宽度”，这里拉大范围确保能完整穿过容器。
        className="h-full w-1/3 bg-gradient-to-r from-primary/0 via-primary to-primary/0"
        animate={{ x: ["-100%", "300%"] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

