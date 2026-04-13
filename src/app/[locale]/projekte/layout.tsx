export default function ProjekteLayout({ children }: { children: React.ReactNode }) {
  // Projekte list is rendered by Wrapper for every route in panel 3.
  // The slug-aware expansion lives inside ProjekteList via useParams.
  return <>{children}</>;
}
