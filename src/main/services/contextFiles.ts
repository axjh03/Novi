import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { basename, extname, join, relative, isAbsolute } from 'node:path';
import { UserError } from './validation';

export interface ContextDocument { name: string; content: string }

/**
 * Extracts the text of a PDF with pdf.js, page by page, for use as session context.
 *
 * Only text is read; nothing is rendered or run. The options keep it that way and avoid touching the
 * network or the system: no system fonts, no worker fetching, no font loading, no WebAssembly
 * decoders. (pdf.js 6 removed its old `eval`-based code path entirely, so no flag is needed for it.)
 *
 * Limits: at most 200 pages, every page must contain readable text (scanned image-only PDFs are
 * refused with a clear message). File count and byte limits apply when loading folders.
 *
 * @param bytes the PDF file contents.
 * @returns the text with a "[Page N]" header before each page.
 * @throws UserError with a plain message for missing PDF support, encrypted or damaged files, and the limits above.
 */
async function pdfText(bytes: Buffer): Promise<string> {
  // Lazy loading keeps TXT sessions usable if the PDF dependency is not installed.
  const moduleName = 'pdfjs-dist/legacy/build/pdf.mjs';
  let pdfjs;
  try { pdfjs = await import(/* @vite-ignore */ moduleName); }
  catch { throw new UserError('PDF support is missing. Run npm install, then restart Novi.'); }
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, useWorkerFetch: false, disableFontFace: true, useWasm: false });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw new UserError('PDFs are limited to 200 pages per file.');
    let content = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      const extracted = text.items.map((item: { str?: string; hasEOL?: boolean }) => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('').trim();
      if (!extracted) throw new UserError(`PDF page ${pageNumber} has no readable text. OCR/image-only PDFs are not supported; convert it to searchable text first.`);
      content += `\n[Page ${pageNumber}]\n${extracted}\n`;
      page.cleanup();
    }
    return content;
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError('A PDF is encrypted, damaged, or could not be read. Provide an unlocked, searchable PDF.');
  } finally { await task.destroy(); }
}

export async function readContextFolders(paths: string[]): Promise<Array<{ path: string; name: string; documents: ContextDocument[] }>> {
  if (!paths.length || paths.length > 8) throw new UserError('Select 1–8 context folders.');
  let count = 0, size = 0, visited = 0;
  const seen = new Set<string>();
  const result = [];
  for (const input of paths) {
    const root = await realpath(input);
    if (!(await lstat(root)).isDirectory()) throw new UserError('Choose a folder.');
    const documents: ContextDocument[] = [];
    async function walk(directory: string, depth: number): Promise<void> {
      if (depth > 12) throw new UserError('Folder nesting exceeds 12 levels. Choose a more specific folder.');
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (++visited > 4000) throw new UserError('Too many folder entries. Choose a smaller context folder.');
        if (entry.isSymbolicLink()) continue;
        const path = join(directory, entry.name);
        const resolved = await realpath(path);
        const rel = relative(root, resolved);
        if (rel.startsWith('..') || isAbsolute(rel)) throw new UserError('A file points outside the selected folder.');
        if (entry.isDirectory()) { await walk(path, depth + 1); continue; }
        if (!entry.isFile() || !['.txt', '.pdf'].includes(extname(path).toLowerCase()) || seen.has(resolved)) continue;
        seen.add(resolved);
        const stat = await lstat(resolved);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024) throw new UserError('Each context file must be a regular file under 10 MB.');
        size += stat.size;
        if (++count > 30 || size > 50 * 1024 * 1024) throw new UserError('Choose at most 30 files / 50 MB total.');
        const bytes = await readFile(resolved);
        if (bytes.length !== stat.size) throw new UserError('A context file changed during loading. Try again.');
        let content: string;
        if (extname(path).toLowerCase() === '.pdf') content = await pdfText(bytes);
        else {
          try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
          catch { throw new UserError(`${entry.name}: save TXT files as UTF-8 before loading.`); }
          if (content.includes('\0')) throw new UserError(`${entry.name} is not a plain text file.`);
        }
        if (!content.trim()) throw new UserError(`${entry.name} is empty. Remove it from the context folder.`);
        documents.push({ name: `${basename(root)}/${rel.replaceAll('\\', '/')}`, content });
      }
    }
    await walk(root, 0);
    if (documents.length) result.push({ path: root, name: basename(root), documents });
  }
  if (!result.length) throw new UserError('No readable TXT or PDF files were found in these folders.');
  return result;
}
