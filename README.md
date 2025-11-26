# EPUB Splitter CLI

A CLI tool to split XHTML files inside an EPUB into separate "pages" using a marker (e.g., `<div ... class="stl_ stl_02" ...>`). Fast, interactive, and ready for npx!

## Getting your EPUB from PDF

This tool is designed to split EPUBs generated from PDFs using [PDF24 Tools](https://tools.pdf24.org/en/pdf-to-epub). The resulting EPUB will usually contain all content in a single page—perfect for splitting with this CLI.

**Note:** The table of contents (TOC) will not be generated automatically. After splitting, you should manually create or edit the TOC using [Sigil](https://sigil-ebook.com/sigil/download/), a free EPUB editor.

---

## Features

- 📖 Split EPUB XHTML/HTML files into individual pages
- 🔍 Choose your own marker (text/regex)
- 🗂️ Automatically updates OPF manifest and spine
- 🚀 Interactive interface powered by @clack/prompts
- ⚡ No install required—just use npx
- 🟢 Bun/Node.js compatible

## Installation

### Using npx (recommended)

No installation required! Just run:

```bash
npx split-epub@latest
```

### Global installation

```bash
npm install -g split-epub@latest
```

Then run:

```bash
split-epub
```

## Prerequisites

- Node.js 18+ or Bun
- An EPUB file in your working directory

## Usage

Simply run:

```bash
npx split-epub
```

The CLI will guide you through:

1. Selecting the EPUB file to split
2. Choosing the marker (text/regex)
3. Naming the output file
4. Optionally previewing the split files (without repackaging)

## What does it do?

- Unzips the EPUB into a temporary folder
- Finds all XHTML/HTML files and splits their content using your marker
- Creates new `.xhtml` files for each fragment
- Updates the OPF manifest and spine
- Repackages everything into a new EPUB

## Precautions

- Make a backup of your original EPUB before running the script
- The script tries to update the `.opf` if found. If your EPUB uses a different manifest/table of contents system, review manually
- If your marker is different (spaces, single quotes, extra attributes), adjust the marker option or the regex in the code

## Limitations

- Does not handle advanced TOC (`nav.xhtml`): you may need to review and regenerate navigation for perfect results
- If your XHTML files use unusual namespaces or structures, you may need to adjust the script

## Development

### Local development

1. Clone the repository:

```bash
git clone https://github.com/adcuelloa/split-epub.git
cd split-epub
```

2. Install dependencies:

```bash
bun install
```

3. Run in development mode:

```bash
bun run index.ts
```

4. Build for production:

```bash
bun run build
```

## Project structure

```
.
├── index.ts             # Main CLI application
├── types.ts             # TypeScript interfaces
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── README.md            # This file
└── global.d.ts          # Global TypeScript definitions

```

## License

MIT

## Author

Created by [adcuelloa](https://github.com/adcuelloa)

---

Built with ❤️ using [@clack/prompts](https://github.com/natemoo-re/clack)

