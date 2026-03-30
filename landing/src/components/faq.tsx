import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "Who is Switchboard for?",
    answer:
      "It is built for developers who already like working in the terminal and want to run multiple coding agents at once without juggling tabs, branches, worktrees, and review tools by hand.",
  },
  {
    question: "Which agents does it support today?",
    answer: "Claude Code, Codex, and Bash.",
  },
  {
    question: "Must I pay?",
    answer:
      "Nope, it uses your local Claude Code or Codex however you are signed in.",
  },
  {
    question: "Is it local-first?",
    answer:
      "Yes. Reads from your local Claude Code and Codex history. Git operations run through the git CLI in the selected workspace.",
  },
  {
    question: "What platforms are supported right now?",
    answer: "macOS for now. With Tauri as the foundation.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-20 sm:py-28">
      <div className="container-shell">
        <div className="mx-auto max-w-3xl text-center">
          <div className="section-eyebrow">FAQ</div>
        </div>

        <div className="mx-auto mt-12 max-w-4xl border-t border-border">
          {faqs.map((item) => (
            <details key={item.question} className="border-b border-border">
              <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 text-left">
                <span className="text-base font-semibold">{item.question}</span>
                <ChevronDown className="size-5 shrink-0 text-muted-foreground" />
              </summary>
              <div className="pb-5 pr-10 text-sm leading-7 text-muted-foreground">
                {item.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
