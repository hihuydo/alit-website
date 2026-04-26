"use client";

import { useEffect, useRef, useState } from "react";
import type { AgendaImage } from "./AgendaItem";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const SLIDER_HEIGHT = "clamp(240px, 30vw, 420px)";

export function AgendaImageSlider({
  images,
  navLabel,
  dotLabel,
}: {
  images: AgendaImage[];
  navLabel: string;
  // Template with {i} (1-based index) and {n} (total) placeholders.
  // Functions can't cross the Server→Client boundary in `LocaleLayout → Wrapper`,
  // so we ship a string and format here.
  dotLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<HTMLDivElement[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!containerRef.current) return;
    // Trim stale refs nach image-count-drop (sonst observed IO detached
    // DOM-Nodes die noch in slidesRef.current übrig sind).
    slidesRef.current.length = images.length;
    // Reset out-of-bounds activeSlide bei image-count-drop.
    setActiveSlide(0);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = slidesRef.current.indexOf(entry.target as HTMLDivElement);
          if (idx !== -1) setActiveSlide(idx);
        }
      },
      // Center-Band-Algorithmus: rootMargin reduziert IO-„root" auf eine
      // 0px-breite Center-Linie; nur der Slide dessen Center diese Linie
      // kreuzt zählt als active. Verhindert flicker bei mehreren
      // gleichzeitig >50%-sichtbaren narrow Portrait-Slides.
      { root: containerRef.current, rootMargin: "0px -50% 0px -50%", threshold: 0 },
    );
    for (const slide of slidesRef.current) {
      if (slide) observer.observe(slide);
    }
    return () => observer.disconnect();
  }, [images]);

  const scrollToSlide = (i: number) => {
    slidesRef.current[i]?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  // Tap on the current image advances to the next slide (wrap-around).
  // Index is captured per-slide to avoid stale-state issues if a click
  // races with the IntersectionObserver active-slide update.
  const handleSlideClick = (i: number) => {
    scrollToSlide((i + 1) % images.length);
  };

  return (
    <div className="w-full" style={{ marginBottom: "var(--spacing-base)" }}>
      <div
        ref={containerRef}
        className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden motion-reduce:scroll-auto"
        style={{ height: SLIDER_HEIGHT, scrollSnapType: "x mandatory" }}
      >
        {images.map((img, i) => (
          <div
            key={img.public_id}
            ref={(el) => {
              if (el) slidesRef.current[i] = el;
            }}
            onClick={() => handleSlideClick(i)}
            className="flex items-center justify-center shrink-0 h-full w-full cursor-pointer"
            style={{ scrollSnapAlign: "center", scrollSnapStop: "always" }}
          >
            <img
              src={`/api/media/${img.public_id}/`}
              alt={img.alt ?? ""}
              loading="lazy"
              width={img.width ?? (img.orientation === "portrait" ? 3 : 4)}
              height={img.height ?? (img.orientation === "portrait" ? 4 : 3)}
              style={{ height: "100%", width: "auto", objectFit: "contain" }}
            />
          </div>
        ))}
      </div>
      {/* gap-0: button padding (p-2.5 → 26x26) keeps the WCAG 24px touch target
          while compressing visual dot-to-dot spacing. */}
      <nav aria-label={navLabel} className="flex justify-center gap-0 mt-2">
        {images.map((img, i) => (
          <button
            key={img.public_id}
            type="button"
            onClick={() => scrollToSlide(i)}
            aria-label={dotLabel.replace("{i}", String(i + 1)).replace("{n}", String(images.length))}
            aria-current={activeSlide === i ? "true" : undefined}
            className="p-2.5 inline-flex items-center justify-center"
          >
            <span
              className={`block w-1.5 h-1.5 rounded-full bg-current ${
                activeSlide === i ? "opacity-100" : "opacity-50"
              }`}
            />
          </button>
        ))}
      </nav>
    </div>
  );
}
