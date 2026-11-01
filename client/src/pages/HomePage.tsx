import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight, Award, BookOpenCheck, Briefcase, Clock, GraduationCap, Laptop, Mail, MapPin, Menu, MessageCircle,
  Phone, ShieldCheck, Users, X,
} from "lucide-react";
import { CourseCatalog } from "../components/public/CourseCatalog";
import { CourseDetailsModal } from "../components/public/CourseDetailsModal";
import { RegistrationForm } from "../components/public/RegistrationForm";
import { Modal } from "../components/ui/Modal";
import { unwrap } from "../lib/errors";
import { supabase } from "../lib/supabase";
import type { PublicCatalog, PublicCourse } from "../lib/types";
import { useQuery } from "../hooks/useQuery";
import { useSettings } from "../hooks/useSettings";

const NAV = [
  { href: "#about", label: "About" },
  { href: "#courses", label: "Courses" },
  { href: "#why-us", label: "Why us" },
  { href: "#register", label: "Admissions" },
  { href: "#contact", label: "Contact" },
];

const WHY_US = [
  { icon: GraduationCap, title: "Experienced faculty", text: "Learn from trainers who have worked on real projects in the industry." },
  { icon: Users, title: "Small batches", text: "Personal attention with limited seats in every batch." },
  { icon: Laptop, title: "Hands-on learning", text: "Practical labs and projects in every module, not just theory." },
  { icon: Briefcase, title: "Career support", text: "Resume reviews, mock interviews and placement guidance." },
];

const BENEFITS = [
  { icon: BookOpenCheck, title: "Industry-aligned curriculum", text: "Regularly updated syllabus that matches what employers look for." },
  { icon: Award, title: "Recognised certificate", text: "Earn a certificate on successful course completion." },
  { icon: Clock, title: "Flexible timings", text: "Weekday, weekend and online batches to fit your schedule." },
  { icon: ShieldCheck, title: "Transparent fees", text: "Clear fee structure with easy installment options." },
];

export default function HomePage() {
  const { settings, logoUrl } = useSettings();
  const catalog = useQuery(
    async () => (await unwrap(supabase.rpc("get_public_catalog"))) as unknown as PublicCatalog,
    [],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [details, setDetails] = useState<PublicCourse | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [showPrivacy, setShowPrivacy] = useState(false);

  const name = settings?.institute_name ?? "";
  const courses = catalog.data?.courses ?? [];

  const apply = (course: PublicCourse) => {
    setDetails(null);
    setSelectedCourseId(course.id);
    document.getElementById("register")?.scrollIntoView({ behavior: "smooth" });
  };

  const address = [settings?.address_line, settings?.city, settings?.state, settings?.postal_code].filter(Boolean).join(", ");
  const whatsapp = settings?.whatsapp?.replace(/\D/g, "");

  return (
    <div className="public-site">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="container header-inner">
          <a href="#top" className="brand" aria-label={`${name} home`}>
            {logoUrl ? <img src={logoUrl} alt="" className="brand-logo" /> : <span className="brand-mark" aria-hidden>{name.charAt(0) || "I"}</span>}
            <span className="brand-name">{name}</span>
          </a>
          <nav className={`site-nav${menuOpen ? " open" : ""}`} aria-label="Main">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>
                {n.label}
              </a>
            ))}
            <a href="#register" className="btn btn-accent btn-sm" onClick={() => setMenuOpen(false)}>
              Apply now
            </a>
          </nav>
          <button
            type="button"
            className="icon-btn menu-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main id="main">
        <section id="top" className="hero">
          <div className="container hero-inner">
            <div className="hero-copy">
              {settings?.tagline && <span className="eyebrow eyebrow-light">{settings.tagline}</span>}
              <h1>Build the skills that shape your career</h1>
              <p>
                Join {name || "our institute"} for practical, career-focused courses taught by experienced faculty, with
                flexible batches and personal mentoring.
              </p>
              <div className="hero-actions">
                <a href="#courses" className="btn btn-accent btn-lg">
                  Explore courses <ArrowRight size={18} aria-hidden />
                </a>
                <a href="#register" className="btn btn-outline-light btn-lg">Apply online</a>
              </div>
            </div>
            <div className="hero-card" aria-hidden>
              <div className="hero-stat"><strong>{courses.length || "-"}</strong><span>Courses open for admission</span></div>
              <div className="hero-stat"><strong>{courses.reduce((n, c) => n + c.batches.length, 0) || "-"}</strong><span>Upcoming batches</span></div>
              <div className="hero-stat"><strong>{catalog.data?.categories.length || "-"}</strong><span>Learning tracks</span></div>
            </div>
          </div>
        </section>

        <section id="about" className="section section-alt" aria-labelledby="about-title">
          <div className="container about-grid">
            <div>
              <span className="eyebrow">About us</span>
              <h2 id="about-title">Welcome to {name}</h2>
              <p className="lead pre-line">
                {settings?.about || "We are committed to quality education that prepares learners for real-world careers."}
              </p>
            </div>
            <ul className="benefit-list">
              {BENEFITS.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <span className="benefit-icon"><Icon size={20} aria-hidden /></span>
                  <div><strong>{title}</strong><p className="muted">{text}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <CourseCatalog
          catalog={catalog.data}
          loading={catalog.loading}
          error={catalog.error?.message ?? null}
          onRetry={catalog.reload}
          onDetails={setDetails}
          onApply={apply}
        />

        <section id="why-us" className="section section-dark" aria-labelledby="why-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow eyebrow-light">Why choose us</span>
              <h2 id="why-title">Learning that leads somewhere</h2>
            </div>
            <div className="feature-grid">
              {WHY_US.map(({ icon: Icon, title, text }) => (
                <div className="feature" key={title}>
                  <span className="feature-icon"><Icon size={24} aria-hidden /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="register" className="section section-alt" aria-labelledby="register-title">
          <div className="container narrow">
            <div className="section-head">
              <span className="eyebrow">Admissions open</span>
              <h2 id="register-title">Apply online</h2>
              <p className="muted">It takes about 3 minutes. No account needed.</p>
            </div>
            <RegistrationForm courses={courses} selectedCourseId={selectedCourseId} onShowPrivacy={() => setShowPrivacy(true)} />
          </div>
        </section>

        <section id="contact" className="section" aria-labelledby="contact-title">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Get in touch</span>
              <h2 id="contact-title">Contact us</h2>
            </div>
            <div className="contact-grid">
              {settings?.phone && (
                <a className="contact-card" href={`tel:${settings.phone.replace(/\s/g, "")}`}>
                  <Phone size={22} aria-hidden /><span>Call us</span><strong>{settings.phone}</strong>
                </a>
              )}
              {whatsapp && (
                <a className="contact-card" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={22} aria-hidden /><span>WhatsApp</span><strong>{settings?.whatsapp}</strong>
                </a>
              )}
              {settings?.email && (
                <a className="contact-card" href={`mailto:${settings.email}`}>
                  <Mail size={22} aria-hidden /><span>Email</span><strong>{settings.email}</strong>
                </a>
              )}
              {address && (
                <a
                  className="contact-card"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin size={22} aria-hidden /><span>Visit us</span><strong>{address}</strong>
                </a>
              )}
            </div>
            {settings?.office_hours && <p className="muted center small">Office hours: {settings.office_hours}</p>}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <strong>{name}</strong>
            {settings?.tagline && <p className="muted small">{settings.tagline}</p>}
          </div>
          <nav aria-label="Footer" className="footer-links">
            {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
            <button type="button" className="link" onClick={() => setShowPrivacy(true)}>Privacy policy</button>
            <Link to="/admin/login">Staff login</Link>
          </nav>
          <p className="muted small">© {new Date().getFullYear()} {name}. All rights reserved.</p>
        </div>
      </footer>

      {details && <CourseDetailsModal course={details} onClose={() => setDetails(null)} onApply={() => apply(details)} />}
      {showPrivacy && (
        <Modal title="Privacy policy" onClose={() => setShowPrivacy(false)}>
          <p className="pre-line">
            {settings?.privacy_policy ||
              "We collect the information you submit only to process your application and contact you about it. We do not sell or share your data with third parties."}
          </p>
        </Modal>
      )}
    </div>
  );
}
