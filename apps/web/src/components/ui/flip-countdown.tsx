"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./flip-countdown.module.css";

interface FlipUnitProps {
  /** Digit to render in the card. */
  digit: string;
  /** Per-card style variables (background / text color). */
  cardStyle: React.CSSProperties;
}

/** Render a single flipping digit unit. */
function FlipUnit({ digit, cardStyle }: FlipUnitProps) {
  const [currentDigit, setCurrentDigit] = React.useState(digit);
  const [previousDigit, setPreviousDigit] = React.useState(digit);
  const [isFlipping, setIsFlipping] = React.useState(false);

  React.useEffect(() => {
    if (digit !== currentDigit) {
      setPreviousDigit(currentDigit);
      setCurrentDigit(digit);
      setIsFlipping(true);
    }
  }, [digit, currentDigit]);

  /** Reset animation flags after flip animation completes. */
  const handleAnimationEnd = () => {
    setIsFlipping(false);
    setPreviousDigit(digit);
  };

  return (
    <div className={styles.unit} style={cardStyle}>
      <div className={cn(styles.card, styles.cardBottom)}>{currentDigit}</div>
      <div className={cn(styles.card, styles.cardTop)}>{previousDigit}</div>
      <div
        className={cn(styles.flipper, isFlipping && styles.isFlipping)}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className={cn(styles.card, styles.cardTop, styles.flipperTop)}>
          {previousDigit}
        </div>
        <div className={cn(styles.card, styles.cardBottom, styles.flipperBottom)}>
          {currentDigit}
        </div>
      </div>
    </div>
  );
}

export interface FlipCountdownProps {
  /** Countdown starts from this number. */
  countFrom?: number | string | bigint;
  /** Countdown ends at this number. */
  countTo?: number | string | bigint;
  /** Optional container className. */
  className?: string;
  /** Card background color (CSS color string). */
  cardBgColor?: string;
  /** Card text color (CSS color string). */
  textColor?: string;
}

/** Render a flip countdown that ticks once per second. */
export function FlipCountdown({
  countFrom = 99,
  countTo = 0,
  className,
  cardBgColor,
  textColor,
}: FlipCountdownProps) {
  // 使用 BigInt 避免超大数字场景出现精度问题。
  const from = React.useMemo(() => BigInt(countFrom), [countFrom]);
  const to = React.useMemo(() => BigInt(countTo), [countTo]);

  const isCountingDown = from > to;
  const [count, setCount] = React.useState(from);

  React.useEffect(() => {
    // 到达目标后停止计时。
    if ((isCountingDown && count <= to) || (!isCountingDown && count >= to)) return;

    const timer = window.setInterval(() => {
      setCount((prevCount) =>
        isCountingDown ? prevCount - BigInt(1) : prevCount + BigInt(1)
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [count, to, isCountingDown]);

  const paddedCount = React.useMemo(() => {
    const maxVal = from > to ? from : to;
    const numDigits = String(maxVal).length;
    const displayCount = count < BigInt(0) ? BigInt(0) : count;
    return String(displayCount).padStart(numDigits, "0");
  }, [count, from, to]);

  const cardStyle = {
    ["--flip-card-bg" as never]: cardBgColor,
    ["--flip-card-text" as never]: textColor,
  } satisfies React.CSSProperties;

  return (
    <div className={cn(styles.container, className)}>
      {paddedCount.split("").map((digit, index) => (
        <FlipUnit key={index} digit={digit} cardStyle={cardStyle} />
      ))}
    </div>
  );
}

export interface FlipClockProps {
  /** Date instance to render. */
  date: Date;
  /** Whether to show seconds. */
  showSeconds?: boolean;
  /** Whether to use 24-hour clock. */
  use24Hours?: boolean;
  /** Separator between time groups. */
  separator?: string;
  /** Optional container className. */
  className?: string;
  /** Card background color (CSS color string). */
  cardBgColor?: string;
  /** Card text color (CSS color string). */
  textColor?: string;
}

/** Render a flip clock (HH:MM[:SS]). */
export function FlipClock({
  date,
  showSeconds = true,
  use24Hours = true,
  separator = ":",
  className,
  cardBgColor,
  textColor,
}: FlipClockProps) {
  const parts = React.useMemo(() => {
    // 统一用 2 位数格式化，保证翻牌位数稳定。
    const rawHour = date.getHours();
    const hour = use24Hours ? rawHour : ((rawHour + 11) % 12) + 1;
    const minute = date.getMinutes();
    const second = date.getSeconds();

    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    const ss = String(second).padStart(2, "0");

    const base = [
      { key: "h0", kind: "digit" as const, value: hh[0] },
      { key: "h1", kind: "digit" as const, value: hh[1] },
      { key: "sep-1", kind: "sep" as const, value: separator },
      { key: "m0", kind: "digit" as const, value: mm[0] },
      { key: "m1", kind: "digit" as const, value: mm[1] },
    ];

    return showSeconds
      ? [
          ...base,
          { key: "sep-2", kind: "sep" as const, value: separator },
          { key: "s0", kind: "digit" as const, value: ss[0] },
          { key: "s1", kind: "digit" as const, value: ss[1] },
        ]
      : base;
  }, [date, showSeconds, separator, use24Hours]);

  const cardStyle = {
    ["--flip-card-bg" as never]: cardBgColor,
    ["--flip-card-text" as never]: textColor,
  } satisfies React.CSSProperties;

  return (
    <div className={cn(styles.container, className)}>
      {parts.map((part) => {
        if (part.kind === "sep") {
          return (
            <div key={part.key} className={styles.separator} aria-hidden="true">
              {part.value}
            </div>
          );
        }

        return <FlipUnit key={part.key} digit={part.value} cardStyle={cardStyle} />;
      })}
    </div>
  );
}

