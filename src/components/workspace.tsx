"use client";
import TeamLogo from "@/components/team-logo";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Users,
  BookOpen,
  Grid3X3,
  CalendarDays,
  Trophy,
  Settings,
  LogOut,
  UserRound,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import type { View } from "@/lib/types";
import Auth from "./auth";
import Prospects from "./prospects";
import Profile from "./profile";
import Journal from "./journal";
import MyArmies from "./my-armies";
import MatchupMatrix from "./matchup-matrix";
import Events from "./events";
import Scrims from "./scrims";
import Selection from "./selection";
import UserManagement from "./user-management";
import { Avatar } from "./ui";
import { ModalDraftProvider } from "./modal-drafts";
import BetaFeedback, { FeedbackInbox } from "./feedback";
export type Mutate = (
  command: object,
  onError?: (message: string) => void,
) => Promise<boolean>;
export default function Workspace({
  localDemo = false,
}: {
  localDemo?: boolean;
}) {
  const [view, setView] = useState<View | null>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState("Prospects"),
    [profileId, setProfileId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [journalKey, setJournalKey] = useState(0);
  const [scrimId, setScrimId] = useState("");
  const [scrimSection, setScrimSection] = useState("Our Team");
  const [locationOwner, setLocationOwner] = useState("");
  const locationKey = view
    ? `team-sweden:location:v1:${view.me.id}:${view.me.role}`
    : "";
  const restoredOwner = useRef("");
  function acceptView(view: View | null) {
    setView(view);
    if (!view) {
      restoredOwner.current = "";
      setLocationOwner("");
      return;
    }
    const locationKey = `team-sweden:location:v1:${view.me.id}:${view.me.role}`;
    if (restoredOwner.current === locationKey) return;
    restoredOwner.current = locationKey;
    let saved: {
      page?: string;
      profileId?: string;
      scrimId?: string;
      scrimSection?: string;
    } = {};
    try {
      saved = JSON.parse(localStorage.getItem(locationKey) || "{}");
    } catch {
      /* Storage may be unavailable or contain an older value. */
    }
    const pages = [
      "Profile",
      "Game journal",
      "My armies",
      "Matchup matrix",
      "Calendar",
      "Scrims",
      ...(view.me.role === "admin"
        ? ["Prospects", "Selection", "Users", "Settings", "Feedback inbox"]
        : []),
    ];
    setPage(
      saved && pages.includes(saved.page || "")
        ? saved.page!
        : view.me.role === "admin"
          ? "Prospects"
          : "Profile",
    );
    setProfileId(
      view.users.some((user) => user.id === saved?.profileId)
        ? saved.profileId!
        : "",
    );
    setScrimId(
      view.scrims?.some((scrim) => scrim.id === saved?.scrimId)
        ? saved.scrimId!
        : "",
    );
    setScrimSection(
      [
        "Our Team",
        "Opposing Team",
        "Matrix",
        "Pairings & results",
        "Manage teams",
      ].includes(saved?.scrimSection || "")
        ? saved.scrimSection!
        : "Our Team",
    );
    setLocationOwner(locationKey);
  }
  useEffect(() => {
    if (!locationKey || locationOwner !== locationKey) return;
    try {
      localStorage.setItem(
        locationKey,
        JSON.stringify({ page, profileId, scrimId, scrimSection }),
      );
    } catch {
      /* Navigation still works if storage is blocked. */
    }
  }, [locationKey, locationOwner, page, profileId, scrimId, scrimSection]);
  async function reload() {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (r.status === 401) {
        acceptView(null);
        return;
      }
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      acceptView(data);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/state", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (r.status === 401) return null;
        if (!r.ok) throw new Error("Could not load your workspace.");
        return r.json();
      })
      .then((data) => {
        acceptView(data);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);
  // Reload server-filtered lists when a deadline passes while the workspace is open.
  useEffect(() => {
    if (!view) return;
    const deadlines = (view.scrims || [])
      .map((s) => Date.parse(s.submissionDeadline))
      .filter((time) => time > Date.now());
    if (!deadlines.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        fetch("/api/state", { cache: "no-store", signal: controller.signal })
          .then(async (r) => {
            if (r.status === 401) {
              acceptView(null);
              return;
            }
            if (r.ok) acceptView(await r.json());
          })
          .catch(() => {
            /* Manual refresh remains available if disconnected. */
          });
      },
      Math.min(
        2_147_483_647,
        Math.max(1, Math.min(...deadlines) - Date.now() + 50),
      ),
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [view]);
  async function mutate(command: object, onError?: (message: string) => void) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        (command as { type?: string }).type === "importPatch"
          ? "/api/patch-import"
          : "/api/state",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      acceptView(data);
      setNotice("Changes saved");
      window.setTimeout(() => setNotice(""), 3000);
      return true;
    } catch (e) {
      setError((e as Error).message);
      onError?.((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openProfile(id: string) {
    setProfileId(id);
    setPage("Profile");
  }
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page, profileId]);
  if (loading)
    return (
      <div className="loading">
        <TeamLogo />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!view)
    return (
      <Auth
        localDemo={localDemo}
        onLogin={async () => {
          await reload();
        }}
      />
    );
  const admin = view.me.role === "admin";
  const currentPage =
    !admin &&
    ["Prospects", "Selection", "Settings", "Users", "Feedback inbox"].includes(
      page,
    )
      ? "Profile"
      : page;
  const nav = [
    {
      name: "My profile",
      page: "Profile",
      icon: UserRound,
    },
    { name: "Game journal", page: "Game journal", icon: BookOpen },
    { name: "My armies", page: "My armies", icon: Trophy },
    { name: "Matchup matrix", page: "Matchup matrix", icon: Grid3X3 },
    { name: "Calendar", page: "Calendar", icon: CalendarDays },
    { name: "Scrims", page: "Scrims", icon: Trophy },
    ...(admin
      ? [
          { name: "Prospects", page: "Prospects", icon: Users },
          { name: "Selection", page: "Selection", icon: Trophy },
          { name: "Users", page: "Users", icon: Users },
          { name: "Settings", page: "Settings", icon: Settings },
          { name: "Feedback inbox", page: "Feedback inbox", icon: BookOpen },
        ]
      : []),
  ];
  return (
    <ModalDraftProvider key={`${view.me.id}:${view.me.role}`}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <TeamLogo />
            <strong>SWEDISH 40K</strong>
            <span>NATIONAL TEAM</span>
          </div>
          <div className="nav-caption">TEAM WORKSPACE</div>
          <nav>
            {nav.map((item) => (
              <Fragment key={item.name}>
                {item.page === "Prospects" && (
                  <div className="admin-nav-divider">Administration</div>
                )}
                <button
                  key={item.name}
                  className={
                    currentPage === item.page &&
                    (item.page !== "Profile" ||
                      !profileId ||
                      profileId === view.me.id)
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    setPage(item.page);
                    setJournalKey(0);
                    if (item.page === "Profile") setProfileId(view.me.id);
                  }}
                >
                  <item.icon size={19} />
                  {item.name}
                  {item.page === "Feedback inbox" &&
                    (view.feedback || []).some(
                      (f) => !f.readAt && !f.deletedAt,
                    ) && (
                      <span
                        className="feedback-unread-badge"
                        aria-label={`${(view.feedback || []).filter((f) => !f.readAt && !f.deletedAt).length} unread feedback messages`}
                      >
                        {
                          (view.feedback || []).filter(
                            (f) => !f.readAt && !f.deletedAt,
                          ).length
                        }
                      </span>
                    )}
                </button>
              </Fragment>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="account">
              <Avatar name={view.me.name} />
              <div>
                <strong>{view.me.name}</strong>
                <small>{admin ? "Coach · administrator" : "Player"}</small>
              </div>
            </div>
            <div className="local-label">
              {localDemo
                ? "Local demo · sample data"
                : "Swedish 40k National Team"}
            </div>
            <button
              onClick={async () => {
                const r = await fetch("/api/session", { method: "DELETE" });
                if (r.ok) {
                  acceptView(null);
                  setProfileId("");
                } else setError("Could not sign out. Please retry.");
              }}
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </aside>
        <main className="main">
          <div className="topbar">
            <span>
              <span className="status-dot" /> Swedish 40k /{" "}
              {currentPage === "Profile" ? "Player profile" : currentPage}
            </span>
            <div className="row">
              <button
                className="icon-button"
                title="Refresh workspace"
                aria-label="Refresh workspace"
                onClick={reload}
              >
                <RefreshCw size={16} />
              </button>
              <button
                className="icon-button mobile-signout"
                aria-label="Sign out of account"
                onClick={async () => {
                  const r = await fetch("/api/session", { method: "DELETE" });
                  if (r.ok) acceptView(null);
                }}
              >
                <LogOut size={16} />
              </button>
              <button
                className="small"
                onClick={() => {
                  setJournalKey((k) => k + 1);
                  setPage("Game journal");
                }}
              >
                <Plus size={15} />
                Log a game
              </button>
            </div>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              {notice}
            </div>
          )}
          <div className="page-content" aria-busy={busy}>
            {admin && currentPage === "Feedback inbox" && (
              <FeedbackInbox view={view} mutate={mutate} />
            )}
            {currentPage === "Prospects" && (
              <Prospects
                view={view}
                openProfile={openProfile}
                openEvents={() => setPage("Calendar")}
              />
            )}{" "}
            {currentPage === "Profile" && (
              <Profile
                key={profileId || view.me.id}
                view={view}
                userId={admin ? profileId || view.me.id : view.me.id}
                mutate={mutate}
              />
            )}{" "}
            {currentPage === "Game journal" && (
              <Journal
                key={journalKey}
                startOpen={journalKey > 0}
                view={view}
                mutate={mutate}
              />
            )}{" "}
            {admin && currentPage === "Users" && (
              <UserManagement view={view} mutate={mutate} onView={acceptView} />
            )}
            {currentPage === "Matchup matrix" && (
              <MatchupMatrix view={view} mutate={mutate} />
            )}
            {currentPage === "My armies" && (
              <MyArmies view={view} mutate={mutate} />
            )}
            {currentPage === "Calendar" && (
              <Events
                view={view}
                mutate={mutate}
                onScrim={(id) => {
                  setScrimId(id);
                  setPage("Scrims");
                }}
              />
            )}{" "}
            {currentPage === "Scrims" && (
              <Scrims
                view={view}
                mutate={mutate}
                selectedId={scrimId}
                section={scrimSection}
                onSection={setScrimSection}
                onSelect={setScrimId}
              />
            )}
            {(currentPage === "Selection" || currentPage === "Settings") && (
              <Selection
                key={currentPage}
                view={view}
                mutate={mutate}
                openProfile={openProfile}
                settings={currentPage === "Settings"}
              />
            )}
          </div>
          <footer className="page-footer">
            <span>
              TEAM SWEDEN <span className="muted">/</span> Better together.
            </span>
            <span>
              {localDemo ? "Local workspace" : "Team workspace"} · English
            </span>
          </footer>
        </main>
      </div>
      <BetaFeedback
        mutate={mutate}
        page={`${currentPage}${currentPage === "Scrims" && scrimId ? ` / ${scrimId} / ${scrimSection}` : currentPage === "Profile" ? ` / ${admin ? profileId || view.me.id : view.me.id}` : ""}`}
      />
    </ModalDraftProvider>
  );
}
