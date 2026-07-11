"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { TaskItem } from "@/components/TaskItem";
import { ProgressBar } from "@/components/ProgressBar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { loadState, saveState, encodeShareState } from "@/lib/storage";
import { personalize } from "@/engine/personalize";
import type { CountryData, UserProfile, PersonalizedChecklist } from "@/data/schema";

interface PlanClientProps {
  countryData: CountryData;
}

export function PlanClient({ countryData }: PlanClientProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<PersonalizedChecklist | null>(null);
  const [copied, setCopied] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const stored = loadState();
    if (stored.profile) {
      setProfile(stored.profile);
      setCompletedTasks(stored.completedTasks);
      const result = personalize(countryData, stored.profile);
      setChecklist(result);
    }
  }, [countryData]);

  const handleToggle = useCallback(
    (taskId: string) => {
      setCompletedTasks((prev) => {
        const next = prev.includes(taskId)
          ? prev.filter((id) => id !== taskId)
          : [...prev, taskId];
        saveState({ completedTasks: next });
        return next;
      });
    },
    []
  );

  const handleShare = useCallback(async () => {
    if (!profile) return;
    const encoded = encodeShareState(profile, completedTasks);
    const url = `${window.location.origin}/plan?share=${encoded}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [profile, completedTasks]);

  // ─── No profile yet ──────────────────────────────────────────────────────

  if (!profile || !checklist) {
    return (
      <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="app-container text-center py-[var(--space-12)]">
          <p className="text-heading text-[var(--text-primary)] mb-[var(--space-4)]">
            No checklist yet
          </p>
          <p className="text-body text-[var(--text-secondary)] mb-[var(--space-6)]">
            Answer a few questions to get your personalized Italy visa checklist.
          </p>
          <Link href="/quiz">
            <Button variant="primary">Start the quiz →</Button>
          </Link>
        </div>
      </main>
    );
  }

  const totalTasks = checklist.totalTasks;
  const completedCount = completedTasks.filter((id) =>
    checklist.phases.some((p) => p.tasks.some((t) => t.id === id))
  ).length;
  const progress = totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0;

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="app-container py-[var(--space-8)] md:py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-[var(--space-6)]">
          <Link href="/" className="text-small text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            ← nomade
          </Link>
          <button
            onClick={handleShare}
            className="text-small text-[var(--accent)] hover:opacity-80 transition-opacity"
          >
            {copied ? "Copied!" : "Share →"}
          </button>
        </div>

        {/* Country + visa */}
        <div className="mb-[var(--space-6)]">
          <div className="flex items-center gap-[var(--space-2)] mb-[var(--space-1)]">
            <span className="text-[28px] leading-none">🇮🇹</span>
            <h1 className="text-heading text-[var(--text-primary)]">
              Italy Visa Checklist
            </h1>
          </div>
          <p className="text-small text-[var(--text-secondary)]">
            {countryData.visa_name}
          </p>
        </div>

        {/* Income warning */}
        {checklist.incomeWarning && (
          <div className="mb-[var(--space-4)] rounded-[var(--radius-lg)] bg-[var(--warning-light)] border border-[#D97706] p-[var(--space-4)]">
            <p className="text-small text-[#92400E] font-[500]">
              ⚠️ Your income may be below the €28,000/yr minimum requirement.
              Italy requires proof of at least €28,000 in annual income. You can
              still apply — consulate discretion applies — but rejection risk is
              higher.
            </p>
          </div>
        )}

        {/* Progress */}
        <div className="mb-[var(--space-6)]">
          <div className="flex items-center justify-between mb-[var(--space-2)]">
            <span className="text-label text-[var(--text-tertiary)]">Progress</span>
            <span className="text-small text-[var(--text-secondary)] tabular-nums">
              {completedCount} / {totalTasks}
            </span>
          </div>
          <ProgressBar
            value={progress}
            label="Plan progress"
          />
        </div>

        {/* Data freshness */}
        <div className="mb-[var(--space-6)] flex items-center gap-[var(--space-2)]">
          <Badge variant="time">
            Verified {countryData.last_verified}
          </Badge>
          <span className="text-caption text-[var(--text-tertiary)]">
            Always confirm with your consulate
          </span>
        </div>

        {/* Phases */}
        <div className="flex flex-col gap-[var(--space-8)]">
          {checklist.phases.map((phase) => {
            const phaseCompleted = phase.tasks.filter((t) =>
              completedTasks.includes(t.id)
            ).length;
            const phaseTotal = phase.tasks.length;

            return (
              <section key={phase.name}>
                <div className="flex items-center justify-between mb-[var(--space-3)]">
                  <h2 className="text-label text-[var(--text-tertiary)]">
                    {phase.name}
                  </h2>
                  <span
                    className={clsx(
                      "text-label tabular-nums",
                      phaseCompleted === phaseTotal
                        ? "text-[var(--success)]"
                        : "text-[var(--text-tertiary)]"
                    )}
                  >
                    {phaseCompleted}/{phaseTotal}
                  </span>
                </div>

                <div className="rounded-[var(--radius-xl)] bg-[var(--surface)] border border-[var(--border)] px-[var(--space-4)]">
                  {phase.tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      completed={completedTasks.includes(task.id)}
                      onToggle={handleToggle}
                      countryName={countryData.country}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Sources */}
        <div className="mt-[var(--space-12)]">
          <p className="text-label text-[var(--text-tertiary)] mb-[var(--space-2)]">
            Official sources
          </p>
          <ul className="flex flex-col gap-[var(--space-1)]">
            {countryData.sources.map((src) => (
              <li key={src}>
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption text-[var(--accent)] hover:underline break-all"
                >
                  {src}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Restart */}
        <div className="mt-[var(--space-8)]">
          <Link href="/quiz">
            <Button variant="secondary" fullWidth>
              Retake quiz
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
