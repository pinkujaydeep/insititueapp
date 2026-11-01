import { useMemo, useState } from "react";
import { CalendarDays, Clock, GraduationCap, Search, Users } from "lucide-react";
import { formatDate, formatDuration, formatMoney, LEVEL_LABELS } from "../../lib/format";
import type { PublicCatalog, PublicCourse } from "../../lib/types";
import { Button } from "../ui/Button";
import { EmptyState, ErrorState, Skeleton } from "../ui/Feedback";
import { CourseVisual } from "./CourseVisual";

interface Props {
  catalog: PublicCatalog | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onDetails: (course: PublicCourse) => void;
  onApply: (course: PublicCourse) => void;
}

export function CourseCatalog({ catalog, loading, error, onRetry, onDetails, onApply }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const courses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog?.courses ?? []).filter(
      (c) =>
        (category === "all" || c.category_id === category) &&
        (!q || `${c.title} ${c.code} ${c.short_description} ${c.category_name ?? ""}`.toLowerCase().includes(q)),
    );
  }, [catalog, search, category]);

  return (
    <section id="courses" className="section" aria-labelledby="courses-title">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Programmes</span>
          <h2 id="courses-title">Explore our courses</h2>
          <p className="muted">Career-focused programmes with flexible batches and transparent fees.</p>
        </div>

        <div className="catalog-toolbar">
          <label className="search-box">
            <Search size={18} aria-hidden />
            <span className="sr-only">Search courses</span>
            <input
              type="search"
              placeholder="Search courses"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="chips" role="group" aria-label="Filter by category">
            <button type="button" className={`chip${category === "all" ? " active" : ""}`} aria-pressed={category === "all"} onClick={() => setCategory("all")}>
              All
            </button>
            {catalog?.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip${category === c.id ? " active" : ""}`}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={onRetry} />}
        {loading && !catalog && (
          <div className="course-grid">
            {[1, 2, 3].map((i) => (
              <div className="card course-card" key={i}>
                <Skeleton height={150} />
                <Skeleton width="40%" />
                <Skeleton width="80%" height={20} />
                <Skeleton />
              </div>
            ))}
          </div>
        )}
        {catalog && courses.length === 0 && (
          <EmptyState
            title={catalog.courses.length ? "No courses match your search" : "New courses are coming soon"}
            description={catalog.courses.length ? "Try a different keyword or category." : "Please check back shortly or contact us."}
          />
        )}

        <div className="course-grid">
          {courses.map((c) => {
            const nextBatch = c.batches[0];
            const full = c.seats_left === 0 || (c.batches.length > 0 && c.batches.every((b) => b.seats_left === 0));
            return (
              <article key={c.id} className="card course-card">
                <CourseVisual imagePath={c.image_path} title={c.title} category={c.category_name} />
                <div className="course-body">
                  <div className="course-tags">
                    {c.category_name && <span className="tag">{c.category_name}</span>}
                    <span className="tag tag-outline">{LEVEL_LABELS[c.level]}</span>
                    {c.is_featured && <span className="tag tag-accent">Featured</span>}
                  </div>
                  <h3>{c.title}</h3>
                  <p className="muted">{c.short_description}</p>
                  <ul className="course-facts">
                    <li><Clock size={15} aria-hidden /> {formatDuration(c.duration_value, c.duration_unit)}</li>
                    {nextBatch && <li><CalendarDays size={15} aria-hidden /> Next batch {formatDate(nextBatch.start_date)}</li>}
                    {c.eligibility && <li><GraduationCap size={15} aria-hidden /> {c.eligibility}</li>}
                    {c.seats_left !== null && <li><Users size={15} aria-hidden /> {c.seats_left} seats left</li>}
                  </ul>
                </div>
                <div className="course-footer">
                  <div>
                    <span className="price">{formatMoney(c.total_fee)}</span>
                    {c.installment_count > 1 && <span className="muted small"> · {c.installment_count} installments</span>}
                  </div>
                  <div className="course-actions">
                    <Button variant="ghost" size="sm" onClick={() => onDetails(c)}>
                      Details
                    </Button>
                    <Button size="sm" variant="accent" disabled={full} onClick={() => onApply(c)}>
                      {full ? "Full" : "Apply"}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
