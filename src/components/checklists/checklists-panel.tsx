"use client";
import { ClipboardList, MoreHorizontal, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { BUILT_IN_TEMPLATES } from "@/lib/checklist-templates";
import { cn } from "@/lib/utils";
import {
  addChecklistFromTemplate,
  addChecklistItem,
  createChecklist,
  deleteChecklist,
  removeChecklistItem,
  saveChecklistAsTemplate,
  setChecklistItem,
  updateChecklist,
} from "@/server/actions/content";
import type { ChecklistDTO } from "@/server/queries/content";
import type { TripMemberInfo } from "@/server/queries/trips";

export function ChecklistsPanel({
  tripId,
  canEdit,
  checklists,
  members,
  savedTemplates,
}: {
  tripId: string;
  canEdit: boolean;
  checklists: ChecklistDTO[];
  members: TripMemberInfo[];
  savedTemplates: Array<{ id: string; name: string; count: number }>;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const refresh = useCallback(() => start(() => router.refresh()), [router]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Failed");
      else {
        if (success) toast.success(success);
        refresh();
      }
    });
  }

  const done = checklists.reduce((sum, c) => sum + c.items.filter((i) => i.done).length, 0);
  const total = checklists.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Checklists</h2>
          {total > 0 && (
            <p className="text-sm text-muted-foreground">
              {done} of {total} ticked off
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm font-semibold hover:bg-muted">
                Templates
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                <DropdownMenuLabel>Start from</DropdownMenuLabel>
                {BUILT_IN_TEMPLATES.map((t) => (
                  <DropdownMenuItem
                    key={t.key}
                    onSelect={() =>
                      run(
                        () => addChecklistFromTemplate({ tripId, templateKey: t.key }),
                        `Added ${t.title}`,
                      )
                    }
                  >
                    {t.title}
                    <span className="ml-auto text-xs text-muted-foreground">{t.items.length}</span>
                  </DropdownMenuItem>
                ))}
                {savedTemplates.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Your saved lists</DropdownMenuLabel>
                    {savedTemplates.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        onSelect={() =>
                          run(
                            () => addChecklistFromTemplate({ tripId, savedTemplateId: t.id }),
                            `Added ${t.name}`,
                          )
                        }
                      >
                        {t.name}
                        <span className="ml-auto text-xs text-muted-foreground">{t.count}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              onClick={() =>
                run(() => createChecklist({ tripId, title: "New list", kind: "custom", items: [] }))
              }
            >
              <Plus /> New list
            </Button>
          </div>
        )}
      </div>

      {checklists.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="No checklists yet"
          description="Start from a packing list or a before-you-go list, or build your own."
        />
      ) : (
        <div className="space-y-4">
          {checklists.map((list) => {
            const listDone = list.items.filter((i) => i.done).length;
            return (
              <section key={list.id} className="rounded-3xl border border-border bg-card p-3">
                <header className="flex items-center gap-2">
                  {canEdit ? (
                    <input
                      defaultValue={list.title}
                      onBlur={(e) =>
                        e.target.value.trim() &&
                        e.target.value !== list.title &&
                        run(() =>
                          updateChecklist({ tripId, id: list.id, title: e.target.value.trim() }),
                        )
                      }
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-bold hover:border-border focus:border-border focus:outline-none"
                      aria-label="Checklist title"
                    />
                  ) : (
                    <h3 className="min-w-0 flex-1 truncate font-bold">{list.title}</h3>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {listDone}/{list.items.length}
                  </span>
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="rounded-lg p-1.5 hover:bg-muted"
                        aria-label={`Options for ${list.title}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            run(
                              () => saveChecklistAsTemplate({ tripId, checklistId: list.id }),
                              "Saved as a template",
                            )
                          }
                        >
                          <Save /> Save as template
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          destructive
                          onSelect={() => {
                            if (confirm(`Delete "${list.title}"?`))
                              run(() => deleteChecklist({ tripId, id: list.id }));
                          }}
                        >
                          <Trash2 /> Delete list
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </header>

                <ul className="mt-1">
                  {list.items.map((item) => (
                    <li
                      key={item.id}
                      className="group flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={(e) =>
                          run(() =>
                            setChecklistItem({
                              tripId,
                              checklistId: list.id,
                              id: item.id,
                              done: e.target.checked,
                            }),
                          )
                        }
                        className="size-4 shrink-0"
                        aria-label={item.text}
                      />
                      {canEdit ? (
                        <input
                          defaultValue={item.text}
                          onBlur={(e) =>
                            e.target.value.trim() &&
                            e.target.value !== item.text &&
                            run(() =>
                              setChecklistItem({
                                tripId,
                                checklistId: list.id,
                                id: item.id,
                                text: e.target.value.trim(),
                              }),
                            )
                          }
                          className={cn(
                            "min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-border focus:border-border focus:outline-none",
                            item.done && "text-muted-foreground line-through",
                          )}
                          aria-label="Item text"
                        />
                      ) : (
                        <span
                          className={cn(
                            "min-w-0 flex-1 text-sm",
                            item.done && "text-muted-foreground line-through",
                          )}
                        >
                          {item.text}
                        </span>
                      )}
                      {canEdit && (
                        <>
                          <select
                            value={item.assignedTo ?? ""}
                            onChange={(e) =>
                              run(() =>
                                setChecklistItem({
                                  tripId,
                                  checklistId: list.id,
                                  id: item.id,
                                  assignedTo: e.target.value || null,
                                }),
                              )
                            }
                            className="h-7 max-w-28 shrink-0 rounded-lg border border-transparent bg-transparent text-xs text-muted-foreground hover:border-border"
                            aria-label={`Assign ${item.text}`}
                          >
                            <option value="">Anyone</option>
                            {members.map((m) => (
                              <option key={m.userId} value={m.userId}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              run(() =>
                                removeChecklistItem({ tripId, checklistId: list.id, id: item.id }),
                              )
                            }
                            className="shrink-0 rounded-lg p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
                            aria-label={`Remove ${item.text}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>

                {canEdit && (
                  <div className="mt-1">
                    <Input
                      value={drafts[list.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [list.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const text = (drafts[list.id] ?? "").trim();
                        if (!text) return;
                        setDrafts((prev) => ({ ...prev, [list.id]: "" }));
                        run(() => addChecklistItem({ tripId, checklistId: list.id, text }));
                      }}
                      placeholder="Add an item and press Enter"
                      className="h-9"
                      aria-label={`Add an item to ${list.title}`}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
