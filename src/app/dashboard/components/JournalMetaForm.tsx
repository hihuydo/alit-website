interface JournalMeta {
  date: string;
  author: string;
  title: string;
  title_border: boolean;
  footer: string;
}

interface JournalMetaFormProps {
  meta: JournalMeta;
  onChange: (meta: JournalMeta) => void;
}

export function JournalMetaForm({ meta, onChange }: JournalMetaFormProps) {
  const set = <K extends keyof JournalMeta>(key: K, value: JournalMeta[K]) =>
    onChange({ ...meta, [key]: value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Datum</label>
          <input
            value={meta.date}
            onChange={(e) => set("date", e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
            placeholder="2022/03/10,"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Autor</label>
          <input
            value={meta.author}
            onChange={(e) => set("author", e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Titel</label>
        <input
          value={meta.title}
          onChange={(e) => set("title", e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={meta.title_border}
          onChange={(e) => set("title_border", e.target.checked)}
        />
        Titel mit Trennlinie
      </label>
      <div>
        <label className="block text-sm font-medium mb-1">Footer</label>
        <input
          value={meta.footer}
          onChange={(e) => set("footer", e.target.value)}
          className="w-full px-3 py-2 border rounded text-sm"
        />
      </div>
    </div>
  );
}
