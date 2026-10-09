"use client";
import { memo } from "react";
import { layouts, type Matchup, type MatrixArmy } from "@/lib/matchups";
import type { Layout } from "@/lib/types";
import MatrixLayoutScore from "./matrix-layout-score";

type Props = {
  own: MatrixArmy;
  enemy: MatrixArmy;
  label: string;
  value?: Matchup;
  logged?: Matchup;
  manualA: boolean;
  manualB: boolean;
  manualC: boolean;
  onScore?: (
    own: MatrixArmy,
    enemy: MatrixArmy,
    layout: Layout,
    score: number | null,
    expectedScore: number | null,
  ) => Promise<void>;
  onError: (message: string) => void;
};

/** Unchanged scores retain their editors while another matchup is saved or highlighted. */
export default memo(
  function MatrixScores(props: Props) {
    return layouts.map((layout) => (
      <MatrixLayoutScore
        key={layout}
        label={`Layout ${layout}: ${props.label}`}
        value={props.value?.[layout]}
        logged={props.logged?.[layout]}
        manual={
          layout === "A"
            ? props.manualA
            : layout === "B"
              ? props.manualB
              : props.manualC
        }
        onSave={
          props.onScore
            ? (score, expectedScore) =>
                props.onScore!(
                  props.own,
                  props.enemy,
                  layout,
                  score,
                  expectedScore,
                )
            : undefined
        }
        onError={props.onError}
      />
    ));
  },
  (a, b) =>
    a.own === b.own &&
    a.enemy === b.enemy &&
    a.label === b.label &&
    a.onScore === b.onScore &&
    a.onError === b.onError &&
    a.manualA === b.manualA &&
    a.manualB === b.manualB &&
    a.manualC === b.manualC &&
    layouts.every((layout) =>
      ["value", "logged"].every((source) => {
        const before = a[source as "value" | "logged"]?.[layout],
          after = b[source as "value" | "logged"]?.[layout];
        return (
          before?.count === after?.count &&
          before?.average === after?.average &&
          before?.total === after?.total
        );
      }),
    ),
);
