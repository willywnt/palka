/*
 * Re-mounts on every navigation (Next template semantics), giving each
 * dashboard page a calm tide entrance. The global prefers-reduced-motion
 * guard collapses it to an instant paint.
 */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 ease-tide duration-300">
      {children}
    </div>
  );
}
