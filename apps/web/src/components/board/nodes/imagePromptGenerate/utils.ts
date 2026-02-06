/** Measure container height without being constrained by current size. */
export function measureContainerHeight(container: HTMLDivElement): number {
  const prevHeight = container.style.height;
  const prevOverflow = container.style.overflowY;
  container.style.height = "auto";
  container.style.overflowY = "visible";
  const measured = container.scrollHeight;
  container.style.height = prevHeight;
  container.style.overflowY = prevOverflow;
  return measured;
}
