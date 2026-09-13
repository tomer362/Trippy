"use client";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Check, Italic, List, ListOrdered, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved";

/**
 * Rich notes with a small, honest toolbar. Content is the editor's own JSON document and
 * saves itself a second after you stop typing, so nothing is lost on navigation.
 */
export function RichNotes({
  initialContent,
  initialVersion,
  canEdit,
  placeholder = "Tips, to-dos, links, anything you want everyone to see…",
  onSave,
  className,
}: {
  initialContent: unknown;
  /** Version of the document as loaded, so a save can refuse to overwrite someone else's. */
  initialVersion?: number;
  canEdit: boolean;
  placeholder?: string;
  onSave: (
    body: unknown,
    expectedVersion?: number,
  ) => Promise<{ ok: boolean; error?: string; conflict?: true; data?: { version: number } }>;
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<unknown>(initialContent);
  const version = useRef<number | undefined>(initialVersion);
  const stale = useRef(false);

  const flush = useCallback(async () => {
    // Once someone else's edit has landed we stop writing: the editor is showing a document
    // that no longer matches the server, and saving it would erase their work.
    if (stale.current) return;
    setState("saving");
    const res = await onSave(latest.current, version.current);
    if (res.conflict) {
      stale.current = true;
      setState("idle");
      toast.error("Someone else edited these notes. Reloading their version.");
      router.refresh();
      return;
    }
    if (res.ok && res.data) version.current = res.data.version;
    setState(res.ok ? "saved" : "idle");
  }, [onSave, router]);

  const editor = useEditor({
    editable: canEdit,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder }),
    ],
    content: (initialContent as object) ?? "",
    editorProps: {
      attributes: {
        class: "prose-notes min-h-28 focus:outline-none",
      },
    },
    onUpdate: ({ editor: instance }) => {
      latest.current = instance.getJSON();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 1000);
    },
  });

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!editor) return <div className="h-28 animate-pulse rounded-2xl bg-muted" />;

  const buttons = [
    {
      key: "bold",
      icon: Bold,
      label: "Bold",
      run: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive("bold"),
    },
    {
      key: "italic",
      icon: Italic,
      label: "Italic",
      run: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive("italic"),
    },
    {
      key: "bullet",
      icon: List,
      label: "Bulleted list",
      run: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive("bulletList"),
    },
    {
      key: "ordered",
      icon: ListOrdered,
      label: "Numbered list",
      run: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive("orderedList"),
    },
  ];

  return (
    <div className={cn("rounded-2xl border border-border bg-background", className)}>
      {canEdit && (
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          {buttons.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={b.run}
              aria-label={b.label}
              aria-pressed={b.active}
              className={cn(
                "rounded-lg p-1.5 hover:bg-muted",
                b.active && "bg-muted text-foreground",
              )}
            >
              <b.icon className="size-4" />
            </button>
          ))}
          <span
            className="ml-auto flex items-center gap-1 pr-1 text-xs text-muted-foreground"
            aria-live="polite"
          >
            {state === "saving" && (
              <>
                <Loader2 className="size-3 animate-spin" /> Saving
              </>
            )}
            {state === "saved" && (
              <>
                <Check className="size-3" /> Saved
              </>
            )}
          </span>
        </div>
      )}
      <EditorContent editor={editor} className="px-3 py-2" />
    </div>
  );
}
