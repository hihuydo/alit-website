import { JournalBlockRenderer } from "@/components/JournalBlockRenderer";
import type { AlitSection } from "@/lib/queries";

// Sections are fetched server-side and threaded down as a prop.
// A section with `title == null` renders without the .content-section
// wrapper and without an <h3> — used for the intro block. The rendering
// rule is intentionally keyed off the title, not the section's position,
// so admin reordering cannot break the layout invariant.
export function AlitContent({ sections }: { sections: AlitSection[] }) {
  return (
    <>
      {sections.map((section) =>
        section.title ? (
          <div key={section.id} className="content-section">
            <h3 className="section-title">{section.title}</h3>
            <div className="alit-section-body">
              <JournalBlockRenderer content={section.content} />
            </div>
          </div>
        ) : (
          <div key={section.id} className="alit-section-body">
            <JournalBlockRenderer content={section.content} />
          </div>
        ),
      )}

    </>
  );
}
