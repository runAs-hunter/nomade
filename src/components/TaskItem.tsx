"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Badge } from "./Badge";
import { AIExpandableDrawer } from "./AIExpandableDrawer";
import type { PersonalizedTask } from "@/data/schema";

interface TaskItemProps {
  task: PersonalizedTask;
  completed: boolean;
  onToggle: (id: string) => void;
  countryName: string;
}

export function TaskItem({
  task,
  completed,
  onToggle,
  countryName,
}: TaskItemProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const hasBadge =
    task.isPersonalized || task.cost || task.time || task.tags?.includes("important");

  return (
    <div
      className={clsx(
        "border-b border-[var(--border)] last:border-b-0",
        "py-[var(--space-3)]"
      )}
    >
      <div className="flex items-start gap-[var(--space-3)]">
        {/* Checkbox */}
        <button
          role="checkbox"
          aria-checked={completed}
          aria-label={`${task.name} — ${completed ? "completed" : "not completed"}`}
          onClick={() => onToggle(task.id)}
          className={clsx(
            "shrink-0 mt-[2px] w-[18px] h-[18px] rounded-[var(--radius-sm)]",
            "flex items-center justify-center",
            "border transition-colors duration-150 ease-out",
            "focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2",
            completed
              ? "bg-[var(--text-primary)] border-[var(--text-primary)]"
              : "bg-[var(--surface)] border-[var(--border)]"
          )}
        >
          {completed && (
            <svg
              width="10"
              height="8"
              viewBox="0 0 10 8"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 3.5L3.5 6.5L9 1"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-[var(--space-2)]">
            <span
              className={clsx(
                "text-body font-[500] text-[var(--text-primary)]",
                completed && "line-through text-[var(--text-tertiary)]"
              )}
            >
              {task.name}
            </span>

            {/* AI help button */}
            {task.detail && (
              <button
                onClick={() => setDrawerOpen(!drawerOpen)}
                aria-expanded={drawerOpen}
                aria-label="Get AI help with this task"
                className={clsx(
                  "shrink-0 w-[22px] h-[22px] rounded-full",
                  "flex items-center justify-center",
                  "text-[13px] font-[600] leading-none",
                  "transition-colors duration-150",
                  drawerOpen
                    ? "bg-[var(--accent-light)] text-[var(--accent)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                )}
              >
                ?
              </button>
            )}
          </div>

          {/* Badges */}
          {hasBadge && (
            <div className="flex flex-wrap gap-[var(--space-1)] mt-[var(--space-1)]">
              {task.isPersonalized && (
                <Badge variant="personalized">Personalized for you</Badge>
              )}
              {task.tags?.includes("important") && (
                <Badge variant="important">Important</Badge>
              )}
              {task.time && <Badge variant="time">{task.time}</Badge>}
              {task.cost && <Badge variant="cost">{task.cost}</Badge>}
            </div>
          )}

          {/* Detail preview (collapsed) */}
          {task.detail && !drawerOpen && (
            <p className="text-small text-[var(--text-secondary)] mt-[var(--space-1)] line-clamp-2">
              {task.detail}
            </p>
          )}

          {/* AI drawer */}
          {drawerOpen && task.detail && (
            <AIExpandableDrawer
              task={task}
              countryName={countryName}
              onClose={() => setDrawerOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
