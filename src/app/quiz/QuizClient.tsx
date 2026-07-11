"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clsx } from "clsx";
import { Button } from "@/components/Button";
import { QuizOption } from "@/components/QuizOption";
import { ProgressBar } from "@/components/ProgressBar";
import { saveState, loadState } from "@/lib/storage";
import { QUIZ_STEPS as STEPS, buildProfile } from "@/data/quiz";

// ─── Component ───────────────────────────────────────────────────────────────

export function QuizClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [transitioning, setTransitioning] = useState(false);

  // Restore quiz progress from localStorage
  useEffect(() => {
    const stored = loadState();
    if (stored.quizProgress) {
      setStep(stored.quizProgress.currentStep);
      setAnswers(stored.quizProgress.answers);
    }
  }, []);

  const currentStep = STEPS[step];
  const selected = answers[currentStep.id];
  const progress = ((step + (selected ? 1 : 0)) / STEPS.length) * 100;

  const handleSelect = useCallback((value: string) => {
    const newAnswers = { ...answers, [currentStep.id]: value };
    setAnswers(newAnswers);
    saveState({ quizProgress: { currentStep: step, answers: newAnswers } });
  }, [answers, currentStep.id, step]);

  const handleContinue = useCallback(() => {
    if (!selected || transitioning) return;

    if (step < STEPS.length - 1) {
      setTransitioning(true);
      const newStep = step + 1;
      saveState({ quizProgress: { currentStep: newStep, answers } });
      setTimeout(() => {
        setStep(newStep);
        setTransitioning(false);
      }, 200);
    } else {
      // Build profile (nationality special-cases live in the shared source) and navigate.
      saveState({
        profile: buildProfile(answers),
        quizProgress: null,
        completedTasks: [],
      });

      router.push("/plan");
    }
  }, [selected, transitioning, step, answers, router]);

  const handleBack = useCallback(() => {
    if (step === 0) return;
    const newStep = step - 1;
    setStep(newStep);
    saveState({ quizProgress: { currentStep: newStep, answers } });
  }, [step, answers]);

  return (
    <main className="min-h-screen bg-[var(--bg)] md:flex md:items-center md:justify-center">
      <div className="app-container py-[var(--space-8)] md:py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-[var(--space-6)]">
          <Link href="/" className="text-small text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            ← Back
          </Link>
          <span
            className="text-label text-[var(--text-tertiary)]"
            aria-label={`Step ${step + 1} of ${STEPS.length}`}
          >
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* Progress */}
        <div className="mb-[var(--space-6)]">
          <ProgressBar value={progress} label={`Step ${step + 1} of ${STEPS.length}`} />
        </div>

        {/* Question */}
        <div
          className={clsx(
            "transition-opacity duration-200",
            transitioning ? "opacity-0" : "opacity-100"
          )}
        >
          <h1 className="text-heading text-[var(--text-primary)] mb-[var(--space-2)]">
            {currentStep.question}
          </h1>
          {currentStep.hint && (
            <p className="text-small text-[var(--text-secondary)] mb-[var(--space-4)]">
              {currentStep.hint}
            </p>
          )}

          {/* Options */}
          <div
            role="radiogroup"
            aria-label={currentStep.question}
            className={clsx(
              "flex flex-col gap-[var(--space-2)] mb-[var(--space-6)]",
              currentStep.options.length > 5 && "md:grid md:grid-cols-2"
            )}
          >
            {currentStep.options.map((opt) => (
              <QuizOption
                key={opt.value}
                label={opt.label}
                description={opt.description}
                selected={selected === opt.value}
                onSelect={() => handleSelect(opt.value)}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-[var(--space-2)]">
            {step > 0 && (
              <Button variant="secondary" onClick={handleBack}>
                Back
              </Button>
            )}
            <Button
              variant="primary"
              fullWidth
              disabled={!selected}
              onClick={handleContinue}
            >
              {step < STEPS.length - 1 ? "Continue" : "Build my checklist →"}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
