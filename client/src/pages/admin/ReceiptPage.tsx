import { Link, useParams } from "react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { EmptyState, ErrorState, PageLoader } from "../../components/ui/Feedback";
import { useQuery } from "../../hooks/useQuery";
import { useSettings } from "../../hooks/useSettings";
import { unwrap } from "../../lib/errors";
import { formatDate, formatDateTime, formatMoney, METHOD_LABELS, type PaymentMethod } from "../../lib/format";
import { supabase } from "../../lib/supabase";

/** Printable receipt. Data comes only from the stored receipt record created with the payment. */
export default function ReceiptPage() {
  const { id = "" } = useParams();
  const { settings, logoUrl } = useSettings();
  const receipt = useQuery(() => unwrap(supabase.from("payment_receipts").select("*").eq("id", id).maybeSingle()), [id]);

  if (receipt.loading) return <PageLoader />;
  if (receipt.error) return <ErrorState message={receipt.error.message} onRetry={receipt.reload} />;
  const r = receipt.data;
  if (!r) return <EmptyState title="Receipt not found" description="It may not exist or you may not have access." />;
  const refund = r.kind === "refund";
  const address = [settings?.address_line, settings?.city, settings?.state, settings?.postal_code].filter(Boolean).join(", ");

  return (
    <>
      <div className="no-print receipt-toolbar">
        <Link to="#" onClick={(e) => { e.preventDefault(); history.back(); }} className="back-link"><ArrowLeft size={14} aria-hidden /> Back</Link>
        <Button icon={<Printer size={16} />} onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
      <article className={`receipt${r.is_void ? " receipt-void" : ""}`} aria-label={`Receipt ${r.receipt_no}`}>
        {r.is_void && <div className="void-stamp" aria-label="Void">VOID</div>}
        <header className="receipt-header">
          <div className="receipt-brand">
            {logoUrl && <img src={logoUrl} alt="" />}
            <div>
              <h1>{settings?.institute_name}</h1>
              {address && <p>{address}</p>}
              <p>{[settings?.phone, settings?.email].filter(Boolean).join(" · ")}</p>
              {settings?.tax_id && <p>Tax ID: {settings.tax_id}</p>}
            </div>
          </div>
          <div className="receipt-title">
            <h2>{refund ? "Refund Voucher" : "Fee Receipt"}</h2>
            <p className="mono">{r.receipt_no}</p>
            <p>Date: {formatDate(r.payment_date)}</p>
          </div>
        </header>

        <section className="receipt-grid">
          <div><span>Student name</span><strong>{r.student_name}</strong></div>
          <div><span>Student ID</span><strong className="mono">{r.student_code}</strong></div>
          <div><span>Registration no.</span><strong className="mono">{r.registration_no}</strong></div>
          <div><span>Course</span><strong>{r.course_title}{r.batch_name ? ` (${r.batch_name})` : ""}</strong></div>
          <div><span>Payment method</span><strong>{METHOD_LABELS[r.method as PaymentMethod]}</strong></div>
          <div><span>Transaction reference</span><strong>{r.transaction_reference ?? "-"}</strong></div>
        </section>

        <table className="receipt-table">
          <tbody>
            <tr><td>Total course fee</td><td className="num">{formatMoney(r.total_fee)}</td></tr>
            <tr><td>Balance before this {refund ? "refund" : "payment"}</td><td className="num">{formatMoney(r.previous_balance)}</td></tr>
            <tr className="receipt-amount"><td>{refund ? "Amount refunded" : "Amount received"}</td><td className="num">{formatMoney(r.amount)}</td></tr>
            <tr><td>Remaining balance</td><td className="num">{formatMoney(r.remaining_balance)}</td></tr>
          </tbody>
        </table>

        <footer className="receipt-footer">
          <div>
            <p className="small">Issued by {r.issued_by_name ?? "-"} on {formatDateTime(r.issued_at)}</p>
            {settings?.receipt_footer && <p className="small">{settings.receipt_footer}</p>}
          </div>
          <div className="signature">
            <div className="signature-line" />
            <span>Authorised signatory</span>
            {settings?.authorised_signatory && <span className="small">{settings.authorised_signatory}</span>}
          </div>
        </footer>
      </article>
    </>
  );
}
