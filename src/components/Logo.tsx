import Link from "next/link";

export function Logo({ locale }: { locale: string }) {
  return (
    <div className="fixed top-0 left-0 z-100 bg-black border-b-3 border-black hover:bg-white group transition-all duration-200" style={{ width: "var(--logo-width)", height: "var(--logo-height)" }}>
      <Link href={`/${locale}`} className="block hover:!no-underline">
        <svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" className="block mt-2 fill-white group-hover:fill-black" style={{ width: "var(--logo-width)", height: "var(--logo-width)" }}>
          <path d="M741.75,248l302-67-18-81-302,67Zm212.5,445,86.5-19L923.25,144l-86.5,19ZM745.75,484.5a72.5,72.5,0,1,0-72.5-72.5A72.55,72.55,0,0,0,745.75,484.5Zm-126,410,86.5-19-169.5-765L450.25,130Zm219.5,150,86.5-19L822.25,559l-86.5,19ZM215.75,961h282l-17-74.5h-247Zm-59.5,139h91l95-445.5c14.5-69,14.5-90.5,24.5-210.5h-8c9,120.5,9.5,141.5,24,210.5l94.5,445.5h93L411.75,387.5h-95Z" />
        </svg>
      </Link>
    </div>
  );
}
