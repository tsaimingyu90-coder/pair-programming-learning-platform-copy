import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/**
 * Renders text with LaTeX math support.
 * Inline math: $...$   Block math: $$...$$
 */
export default function LatexRenderer({ children, className = "" }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      className={`prose prose-sm max-w-none whitespace-pre-wrap ${className}`}
    >
      {children || ""}
    </ReactMarkdown>
  );
}