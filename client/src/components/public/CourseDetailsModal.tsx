import { CalendarDays, CheckCircle2, Clock, GraduationCap } from "lucide-react";
import { formatDate, formatDuration, formatMoney, LEVEL_LABELS, MODE_LABELS } from "../../lib/format";
import type { PublicCourse } from "../../lib/types";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { CourseVisual } from "./CourseVisual";

export function CourseDetailsModal({ course, onClose, onApply }: { course: PublicCourse; onClose: () => void; onApply: () => void }) {
  return (
    <Modal
      title={course.title}
      description={[course.category_name, LEVEL_LABELS[course.level]].filter(Boolean).join(" · ")}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="accent" onClick={onApply}>Apply for this course</Button>
        </>
      }
    >
      <div className="course-detail">
        <CourseVisual imagePath={course.image_path} title={course.title} category={course.category_name} />
        <p className="pre-line">{course.description || course.short_description}</p>
        <ul className="course-facts">
          <li><Clock size={15} aria-hidden /> Duration: {formatDuration(course.duration_value, course.duration_unit)}</li>
          {course.eligibility && <li><GraduationCap size={15} aria-hidden /> Eligibility: {course.eligibility}</li>}
        </ul>
        {course.highlights.length > 0 && (
          <>
            <h3>Highlights</h3>
            <ul className="check-list">
              {course.highlights.map((h) => (
                <li key={h}><CheckCircle2 size={16} aria-hidden /> {h}</li>
              ))}
            </ul>
          </>
        )}
        <h3>Fees</h3>
        <table className="fee-table">
          <tbody>
            <tr><td>Tuition fee</td><td className="num">{formatMoney(course.tuition_fee)}</td></tr>
            {course.admission_fee > 0 && <tr><td>Admission fee</td><td className="num">{formatMoney(course.admission_fee)}</td></tr>}
            {course.registration_fee > 0 && <tr><td>Registration fee</td><td className="num">{formatMoney(course.registration_fee)}</td></tr>}
            <tr className="total"><td>Total</td><td className="num">{formatMoney(course.total_fee)}</td></tr>
          </tbody>
        </table>
        {course.installment_count > 1 && <p className="muted small">Pay in {course.installment_count} monthly installments.</p>}
        {course.batches.length > 0 && (
          <>
            <h3>Upcoming batches</h3>
            <ul className="batch-list">
              {course.batches.map((b) => (
                <li key={b.id}>
                  <CalendarDays size={16} aria-hidden />
                  <div>
                    <strong>{b.name}</strong> · {MODE_LABELS[b.mode]}
                    <div className="muted small">
                      Starts {formatDate(b.start_date)}
                      {b.schedule ? ` · ${b.schedule}` : ""}
                      {b.seats_left !== null ? ` · ${b.seats_left} seats left` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
