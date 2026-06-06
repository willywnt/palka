type BuildableDisplay = {
  label: string;
  /** Tailwind classes layered onto a Badge. */
  className: string;
};

/** Colour-coded buildable badge: red when none can be built, emerald otherwise. */
export function bundleBuildableDisplay(buildable: number): BuildableDisplay {
  if (buildable <= 0) {
    return {
      label: "Can't build",
      className: 'border-transparent bg-destructive/10 text-destructive',
    };
  }
  return {
    label: 'Buildable',
    className: 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  };
}
