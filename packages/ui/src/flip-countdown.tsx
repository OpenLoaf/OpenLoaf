import React, { useState, useEffect, useMemo } from 'react';

// A simple utility for conditional class names
const cn = (...inputs: (string | undefined | null | boolean)[]) =>
  inputs.filter(Boolean).join(' ');

// Internal component for a single digit. No changes needed here.
const FlipUnit = ({
  digit,
  cardStyle,
}: {
  digit: string;
  cardStyle: React.CSSProperties;
}) => {
  const [currentDigit, setCurrentDigit] = useState(digit);
  const [previousDigit, setPreviousDigit] = useState(digit);
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (digit !== currentDigit) {
      setPreviousDigit(currentDigit);
      setCurrentDigit(digit);
      setIsFlipping(true);
    }
  }, [digit, currentDigit]);

  const handleAnimationEnd = () => {
    setIsFlipping(false);
    setPreviousDigit(digit);
  };

  return (
    <div className="flip-unit" style={cardStyle}>
      <div className="flip-card flip-card__bottom">{currentDigit}</div>
      <div className="flip-card flip-card__top">{previousDigit}</div>
      <div
        className={cn('flipper', isFlipping && 'is-flipping')}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="flip-card flipper__top">{previousDigit}</div>
        <div className="flip-card flipper__bottom">{currentDigit}</div>
      </div>
    </div>
  );
};

const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);

// Main exported component, now supporting arbitrarily large numbers
export const FlipCountdown = ({
  countFrom = 99,
  countTo = 0,
  className,
  cardBgColor,
  textColor,
}: {
  countFrom?: number | string | bigint;
  countTo?: number | string | bigint;
  className?: string;
  cardBgColor?: string;
  textColor?: string;
}) => {
  // Use BigInt internally for safe handling of large numbers
  const from = useMemo(() => BigInt(countFrom), [countFrom]);
  const to = useMemo(() => BigInt(countTo), [countTo]);

  const isCountingDown = from > to;
  const [count, setCount] = useState(from);

  useEffect(() => {
    // Stop the timer if the target is reached
    if ((isCountingDown && count <= to) || (!isCountingDown && count >= to)) {
      return;
    }

    const timer = setInterval(() => {
      // Use BigInt arithmetic (e.g., 1n)
      setCount((prevCount) =>
        (isCountingDown ? prevCount - BIGINT_ONE : prevCount + BIGINT_ONE)
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [count, to, isCountingDown]);

  // Calculate padding based on the largest number's length
  const paddedCount = useMemo(() => {
    const maxVal = from > to ? from : to;
    const numDigits = String(maxVal).length;
    const displayCount = count < BIGINT_ZERO ? BIGINT_ZERO : count;
    
    return String(displayCount).padStart(numDigits, '0');
  }, [count, from, to]);

  const cardStyle: React.CSSProperties = {
    '--flip-card-bg': cardBgColor,
    '--flip-card-text': textColor,
  } as React.CSSProperties;

  return (
    <div className={cn('flip-countdown-container', className)}>
      {paddedCount.split('').map((digit, index) => (
        <FlipUnit key={index} digit={digit} cardStyle={cardStyle} />
      ))}
    </div>
  );
};
