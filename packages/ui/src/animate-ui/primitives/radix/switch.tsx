'use client';

import * as React from 'react';
import { Switch as SwitchPrimitives } from 'radix-ui';
import {
  motion,
  type TargetAndTransition,
  type VariantLabels,
  type HTMLMotionProps,
  type LegacyAnimationControls,
} from 'motion/react';

import { getStrictContext } from '@/lib/get-strict-context';
import { useControlledState } from '@/hooks/use-controlled-state';

type SwitchContextType = {
  isChecked: boolean;
  setIsChecked: (isChecked: boolean) => void;
  isPressed: boolean;
  setIsPressed: (isPressed: boolean) => void;
};

const [SwitchProvider, useSwitch] =
  getStrictContext<SwitchContextType>('SwitchContext');

type SwitchProps = Omit<
  React.ComponentProps<typeof SwitchPrimitives.Root>,
  'asChild'
> &
  HTMLMotionProps<'button'>;

const MotionSwitchRoot = motion.create(SwitchPrimitives.Root);

function Switch(props: SwitchProps) {
  const [isPressed, setIsPressed] = React.useState(false);
  const [isChecked, setIsChecked] = useControlledState({
    value: props.checked,
    defaultValue: props.defaultChecked,
    onChange: props.onCheckedChange,
  });

  const { checked, defaultChecked, onCheckedChange, ...rest } = props;

  return (
    <SwitchProvider
      value={{ isChecked, setIsChecked, isPressed, setIsPressed }}
    >
      <MotionSwitchRoot
        data-slot="switch"
        whileTap="tap"
        initial={false}
        onTapStart={() => setIsPressed(true)}
        onTapCancel={() => setIsPressed(false)}
        onTap={() => setIsPressed(false)}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={setIsChecked}
        {...rest}
      />
    </SwitchProvider>
  );
}

type SwitchThumbProps = Omit<
  React.ComponentProps<typeof SwitchPrimitives.Thumb>,
  'asChild'
> &
  HTMLMotionProps<'div'> & {
    pressedAnimation?:
      | TargetAndTransition
      | VariantLabels
      | boolean
      | LegacyAnimationControls;
  };

function SwitchThumb({
  pressedAnimation,
  transition = { type: 'spring', stiffness: 300, damping: 25 },
  ...props
}: SwitchThumbProps) {
  const { isPressed } = useSwitch();

  return (
    <SwitchPrimitives.Thumb asChild>
      <motion.div
        data-slot="switch-thumb"
        whileTap="tab"
        layout
        transition={transition}
        animate={isPressed ? pressedAnimation : undefined}
        {...props}
      />
    </SwitchPrimitives.Thumb>
  );
}

type SwitchIconPosition = 'left' | 'right' | 'thumb';

type SwitchIconProps = HTMLMotionProps<'div'> & {
  position: SwitchIconPosition;
};

function SwitchIcon({
  position,
  transition = { type: 'spring', bounce: 0 },
  ...props
}: SwitchIconProps) {
  const { isChecked } = useSwitch();

  const isAnimated = React.useMemo(() => {
    if (position === 'right') return !isChecked;
    if (position === 'left') return isChecked;
    if (position === 'thumb') return true;
    return false;
  }, [position, isChecked]);

  return (
    <motion.div
      data-slot={`switch-${position}-icon`}
      animate={isAnimated ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
      transition={transition}
      {...props}
    />
  );
}

export {
  Switch,
  SwitchThumb,
  SwitchIcon,
  useSwitch,
  type SwitchProps,
  type SwitchThumbProps,
  type SwitchIconProps,
  type SwitchIconPosition,
  type SwitchContextType,
};
