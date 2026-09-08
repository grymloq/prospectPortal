"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Check,
  Database,
  ShieldCheck,
} from "lucide-react";
import type { View, Phase } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import { Avatar, Badge, dateLabel } from "./ui";
import type { Mutate } from "./workspace";
import { factionName } from "./prospects";
export default function Selection({
  view,
  mutate,
  openProfile,
  settings,
}: {
  view: View;
  mutate: Mutate;
  openProfile: (id: string) => void;
  settings: boolean;
}) {
  const [phases, setPhases] = useState<Phase[]>(view.phases),
    [busy, setBusy] = useState(false);
  function move(i: number, delta: number) {
    const copy = [...phases];
    [copy[i], copy[i + delta]] = [copy[i + delta], copy[i]];
    setPhases(copy);
  }
  const selected = view.users.filter(
    (u) =>
      !u.rejected &&
      view.phases.find((p) => p.id === u.phaseId)?.kind === "selected",
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{settings ? "Workspace settings" : "Selection"}</h1>
          <p>
            {settings
              ? "A clear structure for a thoughtful selection process."
              : "An open beginning. Eight places to earn."}
          </p>
        </div>
        {!settings && (
          <Badge tone="green">{selected.length} / 8 players selected</Badge>
        )}
      </header>
      {settings ? (
        <div className="profile-grid">
          <section className="panel padded">
            <h3>Selection phases</h3>
            <p>
              Rename and reorder review phases. Application stays first,
              Selected stays last.
            </p>
            {phases.map((p, i) => (
              <div className="phase-editor" key={p.id}>
                <span className="step-number">{i + 1}</span>
                <input
                  aria-label={`Phase ${i + 1} name`}
                  value={p.name}
                  onChange={(e) =>
                    setPhases(
                      phases.map((v) =>
                        v.id === p.id ? { ...v, name: e.target.value } : v,
                      ),
                    )
                  }
                />
                <Badge>{p.kind}</Badge>
                {p.kind === "review" && (
                  <div className="row">
                    <button
                      className="icon-button"
                      aria-label={`Move ${p.name} up`}
                      disabled={i <= 1}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${p.name} down`}
                      disabled={i >= phases.length - 2}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() =>
                        setPhases(phases.filter((v) => v.id !== p.id))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div className="form-footer">
              <button
                onClick={() =>
                  setPhases([
                    ...phases.slice(0, -1),
                    {
                      id: crypto.randomUUID(),
                      name: `Phase ${phases.length - 1}`,
                      kind: "review",
                    },
                    phases.at(-1)!,
                  ])
                }
              >
                <Plus size={16} />
                Add review phase
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await mutate({ type: "phases", phases });
                  setBusy(false);
                }}
              >
                <Check size={16} />
                Save phases
              </button>
            </div>
            <hr />
            <h3>Recent administrative activity</h3>
            {view.audit.slice(0, 15).map((a) => (
              <div className="audit" key={a.id}>
                <strong>{a.actor}</strong>
                <small>{dateLabel(a.createdAt)}</small>
                <p>{a.text}</p>
              </div>
            ))}
            {!view.audit.length && (
              <p>Administrative changes will appear here.</p>
            )}
          </section>
          <aside>
            <section className="panel padded">
              <Database size={24} />
              <h3>Army catalogue</h3>
              <p>
                New Recruit / BSData
                <br />
                Warhammer 40,000 · 11th edition
              </p>
              <div className="list-row">
                <span>Factions</span>
                <strong>{catalogue.factions.length}</strong>
              </div>
              <div className="list-row">
                <span>Detachment choices</span>
                <strong>
                  {catalogue.factions.reduce(
                    (n, f) => n + f.detachments.length,
                    0,
                  )}
                </strong>
              </div>
              <p>
                Retrieved {dateLabel(catalogue.retrievedAt)}. Historical games
                retain their saved army configuration.
              </p>
              <a
                href="https://www.newrecruit.eu"
                target="_blank"
                rel="noreferrer"
              >
                Open New Recruit
                <ArrowRight size={15} />
              </a>
            </section>
            <section className="panel padded">
              <ShieldCheck size={24} />
              <h3>Private workspace</h3>
              <p>
                Your workspace keeps selection decisions and player progress
                together.
              </p>
              <p>
                Profiles are private. Evaluations and internal discussions are
                restricted to admins.
              </p>
            </section>
          </aside>
        </div>
      ) : (
        <>
          <section className="selected-band">
            <div>
              <h2>The selected eight</h2>
              <p>Every place represents a contribution to the team.</p>
            </div>
            <div className="squad-slots">
              {Array.from({ length: 8 }, (_, i) =>
                selected[i] ? (
                  <button
                    key={i}
                    title={selected[i].name}
                    onClick={() => openProfile(selected[i].id)}
                  >
                    <Avatar name={selected[i].name} />
                    <small>{selected[i].name.split(" ")[0]}</small>
                  </button>
                ) : (
                  <div className="empty-slot" key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <small>Open place</small>
                  </div>
                ),
              )}
            </div>
          </section>
          <div className="selection-board">
            {view.phases.map((p) => (
              <section className="phase-column" key={p.id}>
                <div className="section-heading">
                  <h3>{p.name}</h3>
                  <Badge>
                    {
                      view.users.filter(
                        (u) => u.phaseId === p.id && !u.rejected,
                      ).length
                    }
                  </Badge>
                </div>
                {view.users
                  .filter((u) => u.phaseId === p.id && !u.rejected)
                  .map((u) => (
                    <button
                      className="prospect-card"
                      key={u.id}
                      onClick={() => openProfile(u.id)}
                    >
                      <div className="row">
                        <Avatar name={u.name} />
                        <strong>{u.name}</strong>
                      </div>
                      <p>{factionName(u.faction)}</p>
                      <div className="row between">
                        <small>
                          {view.games.filter((g) => g.userId === u.id).length}{" "}
                          journal games
                        </small>
                        <ArrowRight size={15} />
                      </div>
                    </button>
                  ))}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
