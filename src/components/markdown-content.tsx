export function MarkdownContent({ content, className = "" }: { content: string; className?: string }) {
  const lines = content.split("\n");
  return (
    <div className={`space-y-2 text-sm leading-7 ${className}`}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div className="h-2" key={index} />;
        if (trimmed.startsWith("### ")) return <h4 className="pt-2 text-base font-black" key={index}>{renderInline(trimmed.slice(4))}</h4>;
        if (trimmed.startsWith("## ")) return <h3 className="pt-3 text-lg font-black" key={index}>{renderInline(trimmed.slice(3))}</h3>;
        if (trimmed.startsWith("# ")) return <h2 className="pt-3 text-xl font-black" key={index}>{renderInline(trimmed.slice(2))}</h2>;
        if (/^\d+\.\s+/.test(trimmed)) return <p className="pl-2 font-semibold" key={index}>{renderInline(trimmed)}</p>;
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) return <p className="pl-4" key={index}>• {renderInline(trimmed.slice(2))}</p>;
        return <p key={index}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>
  );
}
