// src/services/excel-pdf.service.ts
// ============================================================
// Export the 'mitumori' sheet of a password-protected .xlsm to PDF.
// Ported from test-export-pdf.js — no PowerShell / Excel COM required.
// Uses ExcelJS (layout) + HyperFormula (formula eval) + Puppeteer (render).
// ============================================================
import fs from 'fs'
import path from 'path'
import os from 'os'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XlsxPopulate = require('xlsx-populate') as any

const SHEET_NAME = 'mitumori'
const WORKBOOK_PASSWORD = process.env.EXCEL_WORKBOOK_PASSWORD ?? 'cando'

// ─── BOM patch (shared concern — harmless if called twice) ───────────────────
;(function patchXlsxPopulateBom() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XmlParser = require('xlsx-populate/lib/XmlParser')
  const orig = XmlParser.prototype.parseAsync
  if ((XmlParser.prototype as any).__bomPatched) return
  XmlParser.prototype.parseAsync = function (xmlText: unknown) {
    if (typeof xmlText === 'string' && xmlText.charCodeAt(0) === 0xfeff) {
      xmlText = xmlText.slice(1)
    }
    return orig.call(this, xmlText)
  }
  ;(XmlParser.prototype as any).__bomPatched = true
})()

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Decrypt a password-protected .xlsm and render its mitumori sheet as a PDF.
 * @param xlsmFilePath  Absolute path to the (signed, encrypted) .xlsm file.
 * @returns             PDF as a Buffer.
 */
export async function generatePdfFromExcel(
  xlsmFilePath: string,
): Promise<Buffer> {
  const ExcelJS = require('exceljs') as any
  const { HyperFormula } = require('hyperformula') as any
  const XLSX = require('xlsx') as any
  const puppeteer = require('puppeteer') as any

  const tmp = path.join(os.tmpdir(), `qca-pdf-${Date.now()}.xlsm`)
  let browser: any = null

  try {
    // ── Decrypt ──────────────────────────────────────────────────────────────
    const decrypted = await XlsxPopulate.fromFileAsync(xlsmFilePath, {
      password: WORKBOOK_PASSWORD,
    })
    await decrypted.toFileAsync(tmp)

    // ── Parse with ExcelJS ────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(tmp)

    const worksheet =
      workbook.getWorksheet(SHEET_NAME) ??
      workbook.worksheets.find(
        (s: any) => s.name.toLowerCase() === SHEET_NAME.toLowerCase(),
      ) ??
      workbook.worksheets[0]

    if (!worksheet) throw new Error(`Sheet '${SHEET_NAME}' not found`)

    const formulaEngine = buildFormulaEngine(workbook, HyperFormula)
    const renderModel = buildRenderModel(
      workbook,
      worksheet,
      formulaEngine,
      XLSX,
    )
    const html = buildDocumentHtml(renderModel)

    // ── Puppeteer render ──────────────────────────────────────────────────────
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // prevents crashes when /dev/shm is restricted (shared hosting)
        '--disable-gpu', // not needed on headless server
        '--no-zygote', // avoids zygote process issues on CloudLinux
      ],
    })
    const page = await browser.newPage()
    await page.setViewport({
      width: Math.max(900, Math.ceil(renderModel.totalWidth + 120)),
      height: Math.max(
        1200,
        Math.ceil(Math.min(renderModel.totalHeight + 120, 2200)),
      ),
      deviceScaleFactor: 2,
    })
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const excelScale =
      typeof renderModel.pageSetup.scale === 'number'
        ? renderModel.pageSetup.scale / 100
        : 1
    const balancedMargin = 1.2 / 2.54
    const a4WidthPx = (8.27 - balancedMargin * 2) * 96
    const a4HeightPx = (11.69 - balancedMargin * 2) * 96
    const fitScale = Math.min(
      a4WidthPx / renderModel.totalWidth,
      a4HeightPx / renderModel.totalHeight,
    )
    const pdfScale = Math.max(0.1, Math.min(excelScale, fitScale))

    const pdfBuffer: Buffer = await page.pdf({
      format: 'A4',
      landscape: false,
      printBackground: true,
      scale: pdfScale,
      margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
    })

    return pdfBuffer
  } finally {
    if (browser) await browser.close().catch(() => {})
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch (_) {}
  }
}

// ─── Render model ─────────────────────────────────────────────────────────────

function buildRenderModel(
  workbook: any,
  worksheet: any,
  formulaEngine: any,
  XLSX: any,
) {
  const printArea = parsePrintArea(
    worksheet.pageSetup.printArea ||
      `A1:${columnNumberToName(worksheet.columnCount)}${worksheet.rowCount}`,
  )
  const columnWidths: number[] = []
  const rowHeights: number[] = []
  const displayTexts = new Map<string, string>()

  for (let col = printArea.startCol; col <= printArea.endCol; col++) {
    const column = worksheet.getColumn(col)
    columnWidths.push(column.hidden ? 0 : excelColumnWidthToPx(column.width))
  }
  for (let row = printArea.startRow; row <= printArea.endRow; row++) {
    const rowModel = worksheet.getRow(row)
    rowHeights.push(rowModel.hidden ? 0 : pointsToPx(rowModel.height ?? 15))
  }

  // Widen signature label columns
  for (let col = 8; col <= 10; col++) {
    const idx = col - printArea.startCol
    if (idx >= 0 && idx < columnWidths.length)
      columnWidths[idx] = Math.max(columnWidths[idx], 90)
  }
  // Widen narrow info columns L (12) and M (13)
  for (const col of [12, 13]) {
    const idx = col - printArea.startCol
    if (idx >= 0 && idx < columnWidths.length)
      columnWidths[idx] = Math.max(columnWidths[idx], 38)
  }

  const colOffsets = buildOffsets(columnWidths)
  const rowOffsets = buildOffsets(rowHeights)
  const mergeInfo = collectMergeInfo(worksheet, printArea)
  const { images, inlineLogoDataUri } = collectImages(
    workbook,
    worksheet,
    printArea,
    colOffsets,
    rowOffsets,
  )
  const totalWidth = colOffsets[colOffsets.length - 1]
  const totalHeight = rowOffsets[rowOffsets.length - 1]

  for (let row = printArea.startRow; row <= printArea.endRow; row++) {
    for (let col = printArea.startCol; col <= printArea.endCol; col++) {
      const cell = worksheet.getCell(row, col)
      displayTexts.set(
        `${row}:${col}`,
        getCellDisplayText(cell, worksheet.name, row, col, formulaEngine, XLSX),
      )
    }
  }

  return {
    worksheet,
    printArea,
    columnWidths,
    rowHeights,
    mergeInfo,
    images,
    inlineLogoDataUri,
    displayTexts,
    totalWidth,
    totalHeight,
    pageSetup: worksheet.pageSetup,
  }
}

function buildDocumentHtml(model: ReturnType<typeof buildRenderModel>): string {
  const { worksheet, printArea, columnWidths, rowHeights, mergeInfo } = model
  const balancedMarginPx = (1.2 / 2.54) * 96

  const colgroup = columnWidths
    .map((w) => `<col style="width:${w.toFixed(2)}px">`)
    .join('')

  const rows: string[] = []
  for (let row = printArea.startRow; row <= printArea.endRow; row++) {
    const height = rowHeights[row - printArea.startRow]
    const cells: string[] = []

    for (let col = printArea.startCol; col <= printArea.endCol; col++) {
      const key = `${row}:${col}`
      if (mergeInfo.covered.has(key)) continue

      const merge = mergeInfo.masters.get(key)
      const cell = worksheet.getCell(row, col)
      const attrs: string[] = []
      if (merge && merge.rowSpan > 1) attrs.push(`rowspan="${merge.rowSpan}"`)
      if (merge && merge.colSpan > 1) attrs.push(`colspan="${merge.colSpan}"`)

      const logoStartRow = printArea.endRow - 4
      const isPtNameCell =
        row === logoStartRow && col === 1 && model.inlineLogoDataUri
      const inlineLogo = isPtNameCell
        ? `<img src="${model.inlineLogoDataUri}" style="height:18px;vertical-align:middle;margin-right:6px;">`
        : ''

      cells.push(
        `<td ${attrs.join(' ')} style="${cellStyleToCss(cell, row, col, printArea)}">${inlineLogo}${cellContentToHtml(model.displayTexts.get(key))}</td>`,
      )
    }
    rows.push(
      `<tr style="height:${height.toFixed(2)}px">${cells.join('')}</tr>`,
    )
  }

  const imagesHtml = model.images
    .map(
      (img: any) =>
        `<img class="floating-image" src="${img.dataUri}" style="left:${img.left.toFixed(2)}px;top:${img.top.toFixed(2)}px;width:${img.width.toFixed(2)}px;height:${img.height.toFixed(2)}px;">`,
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: Arial, sans-serif; color: #000; padding: ${balancedMarginPx}px; }
    .page { width: ${model.totalWidth.toFixed(2)}px; }
    .sheet { position: relative; width: ${model.totalWidth.toFixed(2)}px; height: ${model.totalHeight.toFixed(2)}px; }
    table { position: absolute; inset: 0; width: ${model.totalWidth.toFixed(2)}px; border-collapse: collapse; table-layout: fixed; background: #fff; }
    td { box-sizing: border-box; overflow: visible; }
    .floating-image { position: absolute; display: block; object-fit: contain; pointer-events: none; }
  </style>
</head>
<body>
  <div class="page">
    <div class="sheet">
      <table>
        <colgroup>${colgroup}</colgroup>
        <tbody>${rows.join('')}</tbody>
      </table>
      ${imagesHtml}
    </div>
  </div>
</body>
</html>`
}

// ─── Helpers (ported from test-export-pdf.js) ─────────────────────────────────

function collectMergeInfo(
  worksheet: any,
  printArea: ReturnType<typeof parsePrintArea>,
) {
  const masters = new Map<string, { rowSpan: number; colSpan: number }>()
  const covered = new Set<string>()

  for (const merge of Object.values(worksheet._merges) as any[]) {
    const model = merge.model || merge
    if (
      model.bottom < printArea.startRow ||
      model.top > printArea.endRow ||
      model.right < printArea.startCol ||
      model.left > printArea.endCol
    )
      continue

    masters.set(`${model.top}:${model.left}`, {
      rowSpan: model.bottom - model.top + 1,
      colSpan: model.right - model.left + 1,
    })
    for (let r = model.top; r <= model.bottom; r++) {
      for (let c = model.left; c <= model.right; c++) {
        if (r === model.top && c === model.left) continue
        covered.add(`${r}:${c}`)
      }
    }
  }
  return { masters, covered }
}

function collectImages(
  workbook: any,
  worksheet: any,
  printArea: ReturnType<typeof parsePrintArea>,
  colOffsets: number[],
  rowOffsets: number[],
) {
  if (typeof worksheet.getImages !== 'function')
    return { images: [], inlineLogoDataUri: null }

  const mediaById = new Map(
    ((workbook.model.media as any[]) || []).map((m: any) => [m.index, m]),
  )
  const images: any[] = []
  let inlineLogoDataUri: string | null = null

  for (const image of worksheet.getImages()) {
    const range = (image as any).range || {}
    const nativeCol = range.tl?.nativeCol ?? Math.floor(range.tl?.col ?? -1)
    const nativeRow = range.tl?.nativeRow ?? Math.floor(range.tl?.row ?? -1)

    if (
      nativeCol + 1 < printArea.startCol ||
      nativeCol + 1 > printArea.endCol ||
      nativeRow + 1 < printArea.startRow ||
      nativeRow + 1 > printArea.endRow
    )
      continue

    const media = mediaById.get((image as any).imageId)
    const dataUri = mediaToDataUri(media)
    if (!dataUri) continue

    const relativeLeft = coordinateToPx(
      (range.tl?.col ?? nativeCol) - (printArea.startCol - 1),
      colOffsets,
    )
    const relativeTop = coordinateToPx(
      (range.tl?.row ?? nativeRow) - (printArea.startRow - 1),
      rowOffsets,
    )
    const relativeRight = range.br
      ? coordinateToPx(range.br.col - (printArea.startCol - 1), colOffsets)
      : null
    const relativeBottom = range.br
      ? coordinateToPx(range.br.row - (printArea.startRow - 1), rowOffsets)
      : null

    const width =
      relativeRight && relativeRight > relativeLeft
        ? relativeRight - relativeLeft
        : range.ext?.width || 0
    const height =
      relativeBottom && relativeBottom > relativeTop
        ? relativeBottom - relativeTop
        : range.ext?.height || 0
    if (!width || !height) continue

    const imgRow = nativeRow + 1
    let adjustedLeft = relativeLeft
    let adjustedTop = relativeTop

    if (imgRow === 4 && nativeCol === 6) adjustedLeft -= 30
    if (imgRow >= 10 && imgRow <= 14) {
      adjustedTop += 9
      adjustedLeft -= 20
    }
    if (imgRow >= 42) {
      adjustedTop += 20
      adjustedLeft -= 15
    }

    const isMainLogo = imgRow >= 44 && imgRow <= 45 && nativeCol === 0
    if (isMainLogo && !inlineLogoDataUri) {
      inlineLogoDataUri = dataUri
      continue
    }

    images.push({
      dataUri,
      left: adjustedLeft,
      top: adjustedTop,
      width,
      height,
    })
  }
  return { images, inlineLogoDataUri }
}

function mediaToDataUri(media: any): string | null {
  if (!media) return null
  const mime = extensionToMime(media.extension)
  const buffer =
    media.buffer || (media.base64 ? Buffer.from(media.base64, 'base64') : null)
  if (!mime || !buffer) return null
  return `data:${mime};base64,${buffer.toString('base64')}`
}

function cellStyleToCss(
  cell: any,
  row: number,
  col: number,
  printArea: ReturnType<typeof parsePrintArea>,
): string {
  const font = cell.font || {}
  const alignment = cell.alignment || {}
  const fill = cell.fill || {}

  const cellIsEmpty = !cell.value && !cell.formula
  const textDecoration = font.underline && !cellIsEmpty ? 'underline' : 'none'

  const style = [
    'padding:1px 3px',
    'line-height:1.15',
    `font-family:${cssFontFamily(font.name)}`,
    `font-size:${typeof font.size === 'number' ? font.size : 11}pt`,
    `font-weight:${font.bold ? '700' : '400'}`,
    `font-style:${font.italic ? 'italic' : 'normal'}`,
    `text-decoration:${textDecoration}`,
    `color:${excelColorToCss(font.color) || '#000000'}`,
    `background:${excelFillToCss(fill)}`,
    `text-align:${horizontalAlignToCss(alignment.horizontal)}`,
    `vertical-align:${verticalAlignToCss(alignment.vertical)}`,
    `white-space:${alignment.wrapText ? 'pre-wrap' : 'nowrap'}`,
  ]

  const infoBoxStartRow = printArea.endRow - 1
  const logoStartRow = printArea.endRow - 4
  const logoEndRow = printArea.endRow - 2

  const isInfoBoxRow = row === infoBoxStartRow || row === printArea.endRow
  const isLogoRow = row >= logoStartRow && row <= logoEndRow
  const isInfoBoxCol = col >= 6 && col <= 13
  const isLogoCol = col >= 1 && col <= 5

  if ((isInfoBoxRow && isInfoBoxCol) || (isLogoRow && isLogoCol)) {
    style.push('border:1px solid #000000')
  } else {
    style.push(borderToCss(cell.border))
  }
  if (row === printArea.endRow) style.push('border-bottom:1px solid #000000')

  if (alignment.textRotation && alignment.textRotation !== 0) {
    style.push(`transform:rotate(${Number(alignment.textRotation) * -1}deg)`)
    style.push('transform-origin:center center')
  }
  return style.join(';')
}

function cellContentToHtml(text: string | undefined): string {
  if (!text) return '&nbsp;'
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
}

function buildFormulaEngine(workbook: any, HyperFormula: any) {
  const sheets: Record<string, any[][]> = {}
  for (const worksheet of workbook.worksheets) {
    const rows: any[][] = []
    const dimMatch =
      worksheet.model && typeof worksheet.model.dimensions === 'string'
        ? /([A-Z]+)(\d+)$/i.exec(
            worksheet.model.dimensions.split(':').pop() || '',
          )
        : null
    const dimCol = dimMatch ? columnNameToNumber(dimMatch[1]) : 0
    const dimRow = dimMatch ? Number(dimMatch[2]) : 0
    const rowCount = Math.max(
      worksheet.rowCount || 0,
      worksheet.actualRowCount || 0,
      dimRow,
    )
    const colCount = Math.max(
      worksheet.columnCount || 0,
      worksheet.actualColumnCount || 0,
      dimCol,
    )
    for (let r = 1; r <= rowCount; r++) {
      const values: any[] = []
      for (let c = 1; c <= colCount; c++) {
        values.push(convertCellValueForFormulaEngine(worksheet.getCell(r, c)))
      }
      rows.push(values)
    }
    for (const row of rows) {
      while (row.length < colCount) row.push(null)
    }
    sheets[worksheet.name] = rows
  }
  return HyperFormula.buildFromSheets(sheets, {
    licenseKey: 'gpl-v3',
    leapYear1900: true,
  })
}

function convertCellValueForFormulaEngine(cell: any): any {
  if (cell.formula) {
    let formula = cell.formula
    formula = formula.replace(
      /\bLOOKUP\(([^,]+),([^,]+),([^)]+)\)/gi,
      'INDEX($3,MATCH($1,$2,1))',
    )
    return `=${formula}`
  }
  const value = cell.value
  if (value == null) return null
  if (value instanceof Date) return value.getTime() / 86400000 + 25569
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value
  if (Array.isArray(value)) return null
  if (value.richText)
    return value.richText.map((p: any) => p.text || '').join('')
  if (typeof value.text === 'string') return value.text
  if (value.result != null) return value.result
  return null
}

function getCellDisplayText(
  cell: any,
  sheetName: string,
  row: number,
  col: number,
  formulaEngine: any,
  XLSX: any,
): string {
  const directText = (() => {
    try {
      return cell.text || ''
    } catch {
      return ''
    }
  })()
  if (!cell.formula)
    return normalizeDisplayText(directText || extractDirectCellText(cell))
  const sheetId = formulaEngine.getSheetId(sheetName)
  const calculated =
    sheetId == null
      ? null
      : formulaEngine.getCellValue({
          sheet: sheetId,
          row: row - 1,
          col: col - 1,
        })
  return normalizeDisplayText(
    formatCalculatedValue(calculated, cell, directText, XLSX),
  )
}

function extractDirectCellText(cell: any): string {
  const value = cell.value
  if (value == null) return ''
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return String(value)
  if (value.richText)
    return value.richText.map((p: any) => p.text || '').join('')
  if (typeof value.text === 'string') return value.text
  return ''
}

function formatCalculatedValue(
  value: any,
  cell: any,
  directText: string,
  XLSX: any,
): string {
  if (value == null) return directText || ''
  if (typeof value === 'object') {
    if (value.type && value.value) return ''
    if (value.value != null) return String(value.value)
    return directText || ''
  }
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value !== 'number') return String(value)
  if (!Number.isFinite(value)) return ''
  if (value === 0 && !directText) return ''
  try {
    return XLSX.SSF.format(cell.numFmt || 'General', value)
  } catch {
    return String(value)
  }
}

function normalizeDisplayText(text: unknown): string {
  if (text == null) return ''
  const normalized = String(text).replace(/\r\n/g, '\n').trimEnd()
  if (!normalized) return ''
  if (/^nan$/i.test(normalized)) return ''
  if (/^#(NAME|NUM|VALUE|REF|DIV\/0|NULL|N\/A)\??!?$/i.test(normalized))
    return ''
  return normalized
}

// ─── CSS helpers ─────────────────────────────────────────────────────────────

function borderToCss(border: any): string {
  return ['top', 'right', 'bottom', 'left']
    .map((side) => `border-${side}:${excelBorderEdgeToCss(border?.[side])}`)
    .join(';')
}

function excelBorderEdgeToCss(edge: any): string {
  if (!edge || !edge.style) return '0 solid transparent'
  const width =
    (
      {
        hair: '0.5px',
        thin: '1px',
        medium: '2px',
        thick: '3px',
        double: '3px',
      } as Record<string, string>
    )[edge.style] || '1px'
  const style =
    (
      {
        dashed: 'dashed',
        dotted: 'dotted',
        double: 'double',
        dashDot: 'dashed',
        dashDotDot: 'dashed',
        slantDashDot: 'dashed',
      } as Record<string, string>
    )[edge.style] || 'solid'
  return `${width} ${style} ${excelColorToCss(edge.color) || '#000000'}`
}

function excelFillToCss(fill: any): string {
  if (!fill || fill.type !== 'pattern' || fill.pattern !== 'solid')
    return 'transparent'
  return excelColorToCss(fill.fgColor) || 'transparent'
}

function excelColorToCss(color: any): string | null {
  if (!color) return null
  if (typeof color.argb === 'string' && color.argb.length === 8)
    return `#${color.argb.slice(2)}`
  if (typeof color.argb === 'string' && color.argb.length === 6)
    return `#${color.argb}`
  if (typeof color.theme === 'number') return '#000000'
  if (typeof color.indexed === 'number')
    return color.indexed === 64 ? '#000000' : null
  return null
}

function cssFontFamily(name: string | undefined): string {
  return `'${(name || 'Arial').replace(/'/g, '')}', Arial, sans-serif`
}

function horizontalAlignToCss(value: string | undefined): string {
  return (
    (
      {
        center: 'center',
        fill: 'left',
        justify: 'justify',
        left: 'left',
        right: 'right',
        centerContinuous: 'center',
        distributed: 'center',
      } as Record<string, string>
    )[value ?? ''] || 'left'
  )
}

function verticalAlignToCss(value: string | undefined): string {
  return (
    (
      {
        top: 'top',
        middle: 'middle',
        center: 'middle',
        bottom: 'bottom',
        distributed: 'middle',
        justify: 'middle',
      } as Record<string, string>
    )[value ?? ''] || 'middle'
  )
}

function extensionToMime(ext: string | undefined): string | null {
  return (
    (
      {
        gif: 'image/gif',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        png: 'image/png',
        svg: 'image/svg+xml',
        webp: 'image/webp',
      } as Record<string, string>
    )[String(ext || '').toLowerCase()] || null
  )
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function excelColumnWidthToPx(width: number | undefined): number {
  const v = typeof width === 'number' ? width : 8.43
  return Math.floor(((256 * v + Math.floor(128 / 7)) / 256) * 7)
}

function pointsToPx(points: number): number {
  return (points * 96) / 72
}

function buildOffsets(sizes: number[]): number[] {
  const offsets = [0]
  for (const s of sizes) offsets.push(offsets[offsets.length - 1] + s)
  return offsets
}

function coordinateToPx(value: number, offsets: number[]): number {
  const whole = Math.max(0, Math.floor(value))
  const fraction = Math.max(0, value - whole)
  if (whole >= offsets.length - 1) return offsets[offsets.length - 1]
  return offsets[whole] + (offsets[whole + 1] - offsets[whole]) * fraction
}

function parsePrintArea(printArea: string) {
  const firstArea = String(printArea).split(',')[0].trim()
  const match = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(firstArea)
  if (!match) throw new Error(`Unsupported print area '${printArea}'`)
  return {
    startCol: columnNameToNumber(match[1]),
    startRow: Number(match[2]),
    endCol: columnNameToNumber(match[3]),
    endRow: Number(match[4]),
  }
}

function columnNameToNumber(name: string): number {
  let value = 0
  for (const char of name.toUpperCase())
    value = value * 26 + char.charCodeAt(0) - 64
  return value
}

function columnNumberToName(value: number): string {
  let current = value
  let name = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name
}
