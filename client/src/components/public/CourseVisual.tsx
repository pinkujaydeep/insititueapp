import { BarChart3, BookOpen, Calculator, Code2, Languages, Palette, Stethoscope } from "lucide-react";
import { publicAssetUrl } from "../../lib/supabase";

const THEMES: { match: RegExp; icon: typeof BookOpen; className: string }[] = [
  { match: /data|ai|analytic|machine/i, icon: BarChart3, className: "visual-teal" },
  { match: /account|finance|tally|gst|commerce/i, icon: Calculator, className: "visual-amber" },
  { match: /program|web|code|software|develop|python|java/i, icon: Code2, className: "visual-navy" },
  { match: /design|art|graphic/i, icon: Palette, className: "visual-rose" },
  { match: /language|english|spoken/i, icon: Languages, className: "visual-violet" },
  { match: /health|nursing|medical/i, icon: Stethoscope, className: "visual-green" },
];

/** Course image, or a branded illustration when no image has been uploaded. */
export function CourseVisual({ imagePath, title, category }: { imagePath: string | null; title: string; category?: string | null }) {
  const url = publicAssetUrl(imagePath);
  if (url) return <img className="course-visual" src={url} alt="" loading="lazy" />;
  const theme = THEMES.find((t) => t.match.test(`${category ?? ""} ${title}`)) ?? { icon: BookOpen, className: "visual-green" };
  const Icon = theme.icon;
  return (
    <div className={`course-visual course-illustration ${theme.className}`} aria-hidden>
      <Icon size={40} strokeWidth={1.5} />
    </div>
  );
}
