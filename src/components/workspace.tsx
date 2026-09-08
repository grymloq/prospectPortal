"use client";
import { useEffect, useState } from "react";
import {
  Users,
  BookOpen,
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
import Events from "./events";
import Selection from "./selection";
import { Avatar } from "./ui";
export type Mutate = (command: object) => Promise<boolean>;
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
  async function reload() {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (r.status === 401) {
        setView(null);
        return;
      }
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setView(data);
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
        setView(data);
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
  async function mutate(command: object) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setView(data);
      setNotice("Changes saved");
      window.setTimeout(() => setNotice(""), 3000);
      return true;
    } catch (e) {
      setError((e as Error).message);
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
        <div className="flag" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!view)
    return (
      <Auth
        localDemo={localDemo}
        onLogin={async () => {
          setPage("Prospects");
          await reload();
        }}
      />
    );
  const admin = view.me.role === "admin";
  const currentPage =
    !admin && ["Prospects", "Selection", "Settings"].includes(page)
      ? "Profile"
      : page;
  const nav = [
    {
      name: admin ? "Prospects" : "My profile",
      page: admin ? "Prospects" : "Profile",
      icon: admin ? Users : UserRound,
    },
    { name: "Game journal", page: "Game journal", icon: BookOpen },
    { name: "Calendar", page: "Calendar", icon: CalendarDays },
    ...(admin
      ? [
          { name: "Selection", page: "Selection", icon: Trophy },
          { name: "Settings", page: "Settings", icon: Settings },
        ]
      : []),
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="flag" />
          <strong>TEAM SWEDEN</strong>
          <span>40K NATIONAL TEAM</span>
        </div>
        <div className="nav-caption">TEAM WORKSPACE</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.name}
              className={currentPage === item.page ? "active" : ""}
              onClick={() => {
                setPage(item.page);
                setJournalKey(0);
                if (item.page === "Profile") setProfileId(view.me.id);
              }}
            >
              <item.icon size={19} />
              {item.name}
            </button>
          ))}
          {admin && (
            <button
              className={
                page === "Profile" && profileId === view.me.id ? "active" : ""
              }
              onClick={() => openProfile(view.me.id)}
            >
              <UserRound size={19} />
              My profile
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="account">
            <Avatar name={view.me.name} />
            <div>
              <strong>{view.me.name}</strong>
              <small>{admin ? "Administrator" : "Player workspace"}</small>
            </div>
          </div>
          <div className="local-label">
            {localDemo ? "Local demo · sample data" : "Swedish national team"}
          </div>
          <button
            onClick={async () => {
              const r = await fetch("/api/session", { method: "DELETE" });
              if (r.ok) {
                setView(null);
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
            <span className="status-dot" /> Sweden /{" "}
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
                if (r.ok) setView(null);
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
          {currentPage === "Calendar" && <Events view={view} mutate={mutate} />}{" "}
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
  );
}
