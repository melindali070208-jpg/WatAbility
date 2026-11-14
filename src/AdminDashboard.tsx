
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "./supabaseClient";
import { hazardLabel, type HazardType } from "./hazards";
import "./AdminDashboard.css";

type ReportStatus =
  | "active"
  | "pending_verification"
  | "resolved";

type AdminReport = {
  id: string;
  type: HazardType;
  longitude: number;
  latitude: number;
  note: string;
  reported_at: string;
  status: ReportStatus;
  resolved_at: string | null;
};

type FeedbackRow = {
  hazard_id: string;
  feedback: "still_there" | "looks_fixed";
};

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);

  async function checkAdmin() {
    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError || !userData.user) {
      setSignedIn(false);
      setAuthorized(false);
      return;
    }

    setSignedIn(true);
    console.log("WatAbility signed-in UID:", userData.user.id);

    const { data, error } = await supabase
      .from("watability_admins")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error) throw error;

    setAuthorized(Boolean(data));
  }

  async function loadReports() {
    const [reportResult, feedbackResult] = await Promise.all([
      supabase
        .from("accessibility_reports")
        .select("*")
        .order("reported_at", { ascending: false }),

      supabase
        .from("hazard_feedback")
        .select("hazard_id, feedback")
    ]);

    if (reportResult.error) throw reportResult.error;
    if (feedbackResult.error) throw feedbackResult.error;

    setReports((reportResult.data ?? []) as AdminReport[]);
    setFeedback((feedbackResult.data ?? []) as FeedbackRow[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (cancelled) return;

        if (userError || !userData.user) {
          setSignedIn(false);
          setAuthorized(false);
          return;
        }

        setSignedIn(true);
        console.log("WatAbility signed-in UID:", userData.user.id);

        const { data, error } = await supabase
          .from("watability_admins")
          .select("user_id")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (error) throw error;

        console.log("Admin membership result:", data);

        setAuthorized(Boolean(data));

        if (data) {
          await loadReports();
        }
      } catch (error) {
        console.error("Admin initialization failed:", error);
        if (!cancelled) {
          setMessage("Could not load admin access or reports.");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await checkAdmin();

      const { data: userData } = await supabase.auth.getUser();

      if (userData.user) {
        const { data, error: membershipError } = await supabase
          .from("watability_admins")
          .select("user_id")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (membershipError) throw membershipError;

        if (data) {
          await loadReports();
        } else {
          setMessage("This account is not an authorized admin.");
        }
      }
    } catch (error) {
      console.error("Login failed:", error);
      setMessage("Could not sign in. Check your account details.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);

    const { error } = await supabase.auth.signOut({
      scope: "local"
    });

    if (error) {
      setMessage("Could not sign out. Please try again.");
      setBusy(false);
      return;
    }

    setSignedIn(false);
    setAuthorized(false);
    setReports([]);
    setFeedback([]);
    setPassword("");
    setBusy(false);
    setMessage("");
  }

  async function changeStatus(
    report: AdminReport,
    status: "active" | "resolved"
  ) {
    if (busy || !authorized) return;

    if (status === "resolved") {
      const confirmed = window.confirm(
        "Only resolve this report after independently confirming " +
        "that the accessibility issue is fixed. Continue?"
      );

      if (!confirmed) return;
    }

    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("accessibility_reports")
        .update({
          status,
          resolved_at:
            status === "resolved" ? new Date().toISOString() : null
        })
        .eq("id", report.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length !== 1) {
        throw new Error("Report update was not permitted.");
      }

      await loadReports();

      setMessage(
        status === "resolved"
          ? "Report verified as resolved."
          : "Report kept active."
      );
    } catch (error) {
      console.error("Status update failed:", error);
      setMessage("Unable to update this report.");
    } finally {
      setBusy(false);
    }
  }

  const active = reports.filter(
    (report) => report.status !== "resolved"
  ).length;

  const resolved = reports.filter(
    (report) => report.status === "resolved"
  ).length;

  function feedbackCounts(id: string) {
    const items = feedback.filter((item) => item.hazard_id === id);

    return {
      still: items.filter(
        (item) => item.feedback === "still_there"
      ).length,
      fixed: items.filter(
        (item) => item.feedback === "looks_fixed"
      ).length
    };
  }

  const needsReview = reports.filter(
    (report) =>
      report.status !== "resolved" &&
      feedbackCounts(report.id).fixed > 0
  ).length;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>WatAbility</h1>
          <p>Accessibility Report Administration</p>
        </div>
        <a href="/">← Back to campus map</a>
      </header>

      <main className="admin-main">
        {checking ? (
          <p>Checking admin access...</p>
        ) : !signedIn ? (
          <section className="admin-login">
            <h2>Admin Sign In</h2>
            <p>Authorized reviewers only.</p>

            <form onSubmit={handleLogin}>
              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button disabled={busy} type="submit">
                {busy ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </section>
        ) : !authorized ? (
          <section className="admin-login">
            <h2>Access denied</h2>
            <p>This account is not authorized to manage reports.</p>
            <button onClick={handleLogout} disabled={busy}>
              Sign Out
            </button>
          </section>
        ) : (
          <>
            <div className="admin-toolbar">
              <div>
                <h2>Accessibility Reports</h2>
                <p>Review community reports before resolving them.</p>
              </div>

              <div className="admin-toolbar-actions">
                <button
                  className="admin-secondary-button"
                  disabled={busy}
                  onClick={() => {
                    void loadReports().catch((error) => {
                      console.error(error);
                      setMessage("Could not refresh reports.");
                    });
                  }}
                >
                  Refresh
                </button>
                <button
                  className="admin-secondary-button"
                  disabled={busy}
                  onClick={handleLogout}
                >
                  Sign Out
                </button>
              </div>
            </div>

            <div className="admin-stats">
              <div><strong>{active}</strong><span>Active</span></div>
              <div><strong>{needsReview}</strong><span>Needs review</span></div>
              <div><strong>{resolved}</strong><span>Resolved</span></div>
            </div>

            {reports.length === 0 && (
              <p>No accessibility reports yet.</p>
            )}

            <div className="admin-report-list">
              {reports.map((report) => {
                const counts = feedbackCounts(report.id);
                const isResolved = report.status === "resolved";

                return (
                  <article className="admin-report-card" key={report.id}>
                    <div className="admin-report-heading">
                      <h3>{hazardLabel(report.type)}</h3>
                      <span>
                        {isResolved
                          ? "Resolved"
                          : counts.fixed > 0
                            ? "Needs review"
                            : "Active"}
                      </span>
                    </div>

                    <p>
                      Reported{" "}
                      {new Date(report.reported_at).toLocaleDateString()}
                    </p>

                    <p>
                      Location: {report.latitude.toFixed(5)},{" "}
                      {report.longitude.toFixed(5)}
                    </p>

                    {report.note && <p>{report.note}</p>}

                    <div className="admin-feedback-counts">
                      <span>✓ {counts.still} Still there</span>
                      <span>↻ {counts.fixed} Looks fixed</span>
                    </div>

                    <p className="admin-note">
                      Community feedback is unverified.
                      Confirm the repair independently before resolving.
                    </p>

                    <div className="admin-report-actions">
                      {isResolved ? (
                        <button
                          disabled={busy}
                          onClick={() => void changeStatus(report, "active")}
                        >
                          Reopen report
                        </button>
                      ) : (
                        <>
                          <button
                            className="admin-secondary-button"
                            disabled={busy}
                            onClick={() => void changeStatus(report, "active")}
                          >
                            Keep active
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void changeStatus(report, "resolved")}
                          >
                            Verify resolved
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {message && (
          <p className="admin-message" role="status">
            {message}
          </p>
        )}
      </main>
    </div>
  );
}
