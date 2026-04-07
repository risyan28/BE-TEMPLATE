/**
 * test-export-pdf.js
 *
 * Open the signed .xlsm (password-protected) and export the mitumori sheet as PDF.
 * Uses ExcelJS + Puppeteer (Node.js only) so the output stays much closer to Excel's layout.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')

// ─── Config ───────────────────────────────────────────────────────────────────

const SOURCE_FILE = path.join(
  __dirname,
  'uploads',
  'signed',
  'AMTI26040601SARI DAISHO AMTI BAUT DIA 10.9-SIGNED.xlsm',
)
const WORKBOOK_PASSWORD = 'cando'
const SHEET_NAME = 'mitumori'
const OUTPUT_PDF = path.join(
  __dirname,
  'uploads',
  'exports',
  'AMTI26040601SARI DAISHO AMTI BAUT DIA 10.9-SIGNED.pdf',
)
const EMF_FALLBACK_IMAGE = path.join(
  __dirname,
  '..',
  'Frontend',
  'public',
  'images',
  'logo.png',
)

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('\nEXPORT TO PDF\n')
console.log(`Source : ${SOURCE_FILE}`)
console.log(`Output : ${OUTPUT_PDF}\n`)

if (!fs.existsSync(SOURCE_FILE)) {
  console.error(
    `ERROR: File not found — run test-sign-file.js first.\n  ${SOURCE_FILE}`,
  )
  process.exit(1)
}
fs.mkdirSync(path.dirname(OUTPUT_PDF), { recursive: true })

exportWithPuppeteer().catch((e) => {
  console.error(`ERROR: ${e.message}`)
  process.exit(1)
})

// ─── Excel-faithful PDF export ────────────────────────────────────────────────

async function exportWithPuppeteer() {
  console.log('Generating PDF with ExcelJS renderer...')
  const ExcelJS = require('exceljs')
  const { HyperFormula } = require('hyperformula')
  const XlsxPopulate = require('xlsx-populate')
  const XLSX = require('xlsx')
  const puppeteer = require('puppeteer')

  patchBom()

  const tmp = path.join(os.tmpdir(), `qca-${Date.now()}.xlsm`)
  let browser = null

  try {
    const decryptedWorkbook = await XlsxPopulate.fromFileAsync(SOURCE_FILE, {
      password: WORKBOOK_PASSWORD,
    })
    await decryptedWorkbook.toFileAsync(tmp)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(tmp)

    const worksheet =
      workbook.getWorksheet(SHEET_NAME) ??
      workbook.worksheets.find(
        (sheet) => sheet.name.toLowerCase() === SHEET_NAME.toLowerCase(),
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

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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

    // Calculate scale to fit both width and height on A4
    const excelScale =
      typeof renderModel.pageSetup.scale === 'number'
        ? renderModel.pageSetup.scale / 100
        : 1

    // A4 dimensions minus margin space (margin is now in HTML padding)
    const balancedMargin = 1.2 / 2.54 // 1.2cm in inches
    const a4WidthPx = (8.27 - balancedMargin * 2) * 96
    const a4HeightPx = (11.69 - balancedMargin * 2) * 96
    const fitScaleWidth = a4WidthPx / renderModel.totalWidth
    const fitScaleHeight = a4HeightPx / renderModel.totalHeight
    const fitScale = Math.min(fitScaleWidth, fitScaleHeight)
    const pdfScale = Math.max(0.1, Math.min(excelScale, fitScale))

    // Use 0 margins since they're now in HTML padding
    await page.pdf({
      path: OUTPUT_PDF,
      format: 'A4',
      landscape: false,
      printBackground: true,
      scale: pdfScale,
      margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
    })

    const kb = (fs.statSync(OUTPUT_PDF).size / 1024).toFixed(1)
    console.log(`\n✓ DONE — ${kb} KB\n  ${OUTPUT_PDF}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
  }
}

function patchBom() {
  const Parser = require('xlsx-populate/lib/XmlParser')
  const parseAsync = Parser.prototype.parseAsync

  Parser.prototype.parseAsync = function (xml) {
    if (typeof xml === 'string' && xml.charCodeAt(0) === 0xfeff) {
      xml = xml.slice(1)
    }
    return parseAsync.call(this, xml)
  }
}

function buildRenderModel(workbook, worksheet, formulaEngine, XLSX) {
  const printArea = parsePrintArea(
    worksheet.pageSetup.printArea ||
      `A1:${columnNumberToName(worksheet.columnCount)}${worksheet.rowCount}`,
  )
  const columnWidths = []
  const rowHeights = []
  const displayTexts = new Map()

  for (let col = printArea.startCol; col <= printArea.endCol; col += 1) {
    const column = worksheet.getColumn(col)
    columnWidths.push(column.hidden ? 0 : excelColumnWidthToPx(column.width))
  }

  for (let row = printArea.startRow; row <= printArea.endRow; row += 1) {
    const rowModel = worksheet.getRow(row)
    rowHeights.push(rowModel.hidden ? 0 : pointsToPx(rowModel.height ?? 15))
  }

  // Widen signature label columns so border doesn't cut text
  for (let col = 8; col <= 10; col += 1) {
    const idx = col - printArea.startCol
    if (idx >= 0 && idx < columnWidths.length) {
      columnWidths[idx] = Math.max(columnWidths[idx], 90)
    }
  }

  // Widen narrow info columns L (12) and M (13) so SARI / A don't overlap
  for (const col of [12, 13]) {
    const idx = col - printArea.startCol
    if (idx >= 0 && idx < columnWidths.length) {
      columnWidths[idx] = Math.max(columnWidths[idx], 38)
    }
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

  for (let row = printArea.startRow; row <= printArea.endRow; row += 1) {
    for (let col = printArea.startCol; col <= printArea.endCol; col += 1) {
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

function buildDocumentHtml(model) {
  const { worksheet, printArea, columnWidths, rowHeights, mergeInfo } = model
  const balancedMarginPx = (1.2 / 2.54) * 96 // 1.2cm = ~45px

  const colgroup = columnWidths
    .map((width) => `<col style="width:${width.toFixed(2)}px">`)
    .join('')

  const rows = []

  for (let row = printArea.startRow; row <= printArea.endRow; row += 1) {
    const height = rowHeights[row - printArea.startRow]
    const cells = []

    for (let col = printArea.startCol; col <= printArea.endCol; col += 1) {
      const key = `${row}:${col}`
      if (mergeInfo.covered.has(key)) continue

      const merge = mergeInfo.masters.get(key)
      const cell = worksheet.getCell(row, col)
      const attrs = []
      if (merge && merge.rowSpan > 1) attrs.push(`rowspan="${merge.rowSpan}"`)
      if (merge && merge.colSpan > 1) attrs.push(`colspan="${merge.colSpan}"`)

      // For the PT name cell (logo area master), prepend inline logo
      const logoStartRow = printArea.endRow - 4
      const logoEndRow = printArea.endRow - 2
      const isPtNameCell =
        row === logoStartRow && col === 1 && model.inlineLogoDataUri
      const inlineLogo = isPtNameCell
        ? `<img src="${model.inlineLogoDataUri}" style="height:18px;vertical-align:middle;margin-right:6px;">`
        : ''

      cells.push(
        `<td ${attrs.join(' ')} style="${cellStyleToCss(cell, row, col, printArea)}">${inlineLogo}${cellContentToHtml(
          model.displayTexts.get(key),
        )}</td>`,
      )
    }

    rows.push(
      `<tr style="height:${height.toFixed(2)}px">${cells.join('')}</tr>`,
    )
  }

  const imagesHtml = model.images
    .map(
      (img) =>
        `<img class="floating-image" src="${img.dataUri}" style="left:${img.left.toFixed(2)}px;top:${img.top.toFixed(2)}px;width:${img.width.toFixed(2)}px;height:${img.height.toFixed(2)}px;">`,
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
    }
    body {
      font-family: Arial, sans-serif;
      color: #000;
      padding: ${balancedMarginPx}px;
    }
    .page {
      width: ${model.totalWidth.toFixed(2)}px;
    }
    .sheet {
      position: relative;
      width: ${model.totalWidth.toFixed(2)}px;
      height: ${model.totalHeight.toFixed(2)}px;
    }
    table {
      position: absolute;
      inset: 0;
      width: ${model.totalWidth.toFixed(2)}px;
      border-collapse: collapse;
      table-layout: fixed;
      background: #fff;
    }
    td {
      box-sizing: border-box;
      overflow: visible;
    }
    .floating-image {
      position: absolute;
      display: block;
      object-fit: contain;
      pointer-events: none;
    }
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

function collectMergeInfo(worksheet, printArea) {
  const masters = new Map()
  const covered = new Set()

  for (const merge of Object.values(worksheet._merges)) {
    const model = merge.model || merge
    if (
      model.bottom < printArea.startRow ||
      model.top > printArea.endRow ||
      model.right < printArea.startCol ||
      model.left > printArea.endCol
    ) {
      continue
    }

    masters.set(`${model.top}:${model.left}`, {
      rowSpan: model.bottom - model.top + 1,
      colSpan: model.right - model.left + 1,
    })

    for (let row = model.top; row <= model.bottom; row += 1) {
      for (let col = model.left; col <= model.right; col += 1) {
        if (row === model.top && col === model.left) continue
        covered.add(`${row}:${col}`)
      }
    }
  }

  return { masters, covered }
}

function collectImages(workbook, worksheet, printArea, colOffsets, rowOffsets) {
  if (typeof worksheet.getImages !== 'function') return []

  const mediaById = new Map(
    (workbook.model.media || []).map((media) => [media.index, media]),
  )
  const images = []
  let inlineLogoDataUri = null

  for (const image of worksheet.getImages()) {
    const range = image.range || {}
    const nativeCol = range.tl?.nativeCol ?? Math.floor(range.tl?.col ?? -1)
    const nativeRow = range.tl?.nativeRow ?? Math.floor(range.tl?.row ?? -1)

    if (
      nativeCol + 1 < printArea.startCol ||
      nativeCol + 1 > printArea.endCol ||
      nativeRow + 1 < printArea.startRow ||
      nativeRow + 1 > printArea.endRow
    ) {
      continue
    }

    const media = mediaById.get(image.imageId)
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

    // Adjust signature image positions: move down and left
    const imgRow = nativeRow + 1
    let adjustedLeft = relativeLeft
    let adjustedTop = relativeTop

    // Header ANDOU logo (row ~4, col G) — shift left so it doesn't overlap PT name text
    if (imgRow === 4 && nativeCol === 6) {
      adjustedLeft -= 30
    }
    // For signature images (rows around 10-14), move them into the boxes
    if (imgRow >= 10 && imgRow <= 14) {
      adjustedTop += 9 // Slight down
      adjustedLeft += -20 // Slight right
    }
    // For logo images (rows 42+), move down and left
    if (imgRow >= 42) {
      adjustedTop += 20 // Move down 40px
      adjustedLeft -= 15 // Move left 15px
    }

    // Detect the main ANDOU circular logo (row ~44-45, col 0) for inline rendering
    const isMainLogo = imgRow >= 44 && imgRow <= 45 && nativeCol === 0
    if (isMainLogo && !inlineLogoDataUri) {
      inlineLogoDataUri = dataUri
      continue // Skip from floating images; will be rendered inline in the cell
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

function mediaToDataUri(media) {
  if (!media) return null

  if (media.extension === 'emf') {
    if (!fs.existsSync(EMF_FALLBACK_IMAGE)) return null
    const fallback = fs.readFileSync(EMF_FALLBACK_IMAGE)
    return `data:image/png;base64,${fallback.toString('base64')}`
  }

  const mime = extensionToMime(media.extension)
  const buffer =
    media.buffer || (media.base64 ? Buffer.from(media.base64, 'base64') : null)
  if (!mime || !buffer) return null

  return `data:${mime};base64,${buffer.toString('base64')}`
}

function cellStyleToCss(cell, row, col, printArea) {
  const font = cell.font || {}
  const alignment = cell.alignment || {}
  const fill = cell.fill || {}

  // Skip underline on empty cells — otherwise &nbsp; shows a visible dash
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

  // Dynamic border detection based on print area end
  // Info box: last 2 rows (endRow-1, endRow)
  // Logo area: 3 rows before info box (endRow-4 to endRow-2)
  const infoBoxStartRow = printArea.endRow - 1
  const logoStartRow = printArea.endRow - 4
  const logoEndRow = printArea.endRow - 2

  const isInfoBoxRow = row === infoBoxStartRow || row === printArea.endRow
  const isLogoRow = row >= logoStartRow && row <= logoEndRow
  const isInfoBoxCol = col >= 6 && col <= 13 // Cols F-M
  const isLogoCol = col >= 1 && col <= 5 // Cols A-E

  if ((isInfoBoxRow && isInfoBoxCol) || (isLogoRow && isLogoCol)) {
    style.push('border:1px solid #000000')
  } else {
    style.push(borderToCss(cell.border))
  }
  if (row === printArea.endRow) {
    style.push('border-bottom:1px solid #000000')
  }

  if (alignment.textRotation && alignment.textRotation !== 0) {
    style.push(`transform:rotate(${Number(alignment.textRotation) * -1}deg)`)
    style.push('transform-origin:center center')
  }

  return style.join(';')
}

function cellContentToHtml(text) {
  if (!text) return '&nbsp;'
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
}

function buildFormulaEngine(workbook, HyperFormula) {
  const sheets = {}

  for (const worksheet of workbook.worksheets) {
    const rows = []
    // Use generous dimensions to ensure cross-sheet references resolve
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

    for (let row = 1; row <= rowCount; row += 1) {
      const values = []
      for (let col = 1; col <= colCount; col += 1) {
        values.push(
          convertCellValueForFormulaEngine(worksheet.getCell(row, col)),
        )
      }
      rows.push(values)
    }

    // Pad rows to meet colCount (in case some rows are shorter)
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

function convertCellValueForFormulaEngine(cell) {
  if (cell.formula) {
    let formula = cell.formula
    // HyperFormula does not support LOOKUP — convert to INDEX/MATCH
    formula = formula.replace(
      /\bLOOKUP\(([^,]+),([^,]+),([^)]+)\)/gi,
      'INDEX($3,MATCH($1,$2,1))',
    )
    return `=${formula}`
  }

  const value = cell.value
  if (value == null) return null
  if (value instanceof Date) return jsDateToExcelSerial(value)
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) return null
  if (value.richText) {
    return value.richText.map((part) => part.text || '').join('')
  }
  if (typeof value.text === 'string') return value.text
  if (value.result != null) return value.result
  return null
}

function getCellDisplayText(cell, sheetName, row, col, formulaEngine, XLSX) {
  const directText = safeCellText(cell)

  if (!cell.formula) {
    return normalizeDisplayText(directText || extractDirectCellText(cell))
  }

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

function extractDirectCellText(cell) {
  const value = cell.value
  if (value == null) return ''
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value)
  }
  if (value.richText)
    return value.richText.map((part) => part.text || '').join('')
  if (typeof value.text === 'string') return value.text
  return ''
}

function formatCalculatedValue(value, cell, directText, XLSX) {
  if (value == null) return directText || ''
  if (typeof value === 'object') {
    // HyperFormula error objects (e.g. #NUM!, #NAME?) — return empty
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

function normalizeDisplayText(text) {
  if (text == null) return ''
  const normalized = String(text).replace(/\r\n/g, '\n').trimEnd()
  if (!normalized) return ''
  if (/^nan$/i.test(normalized)) return ''
  if (/^#(NAME|NUM|VALUE|REF|DIV\/0|NULL|N\/A)\??!?$/i.test(normalized))
    return ''
  return normalized
}

function safeCellText(cell) {
  try {
    return cell.text || ''
  } catch {
    return ''
  }
}

function borderToCss(border) {
  return ['top', 'right', 'bottom', 'left']
    .map((side) => {
      const edge = border?.[side]
      const css = excelBorderEdgeToCss(edge)
      return `border-${side}:${css}`
    })
    .join(';')
}

function excelBorderEdgeToCss(edge) {
  if (!edge || !edge.style) return '0 solid transparent'

  const width =
    {
      hair: '0.5px',
      thin: '1px',
      medium: '2px',
      thick: '3px',
      double: '3px',
    }[edge.style] || '1px'

  const style =
    {
      dashed: 'dashed',
      dotted: 'dotted',
      double: 'double',
      dashDot: 'dashed',
      dashDotDot: 'dashed',
      slantDashDot: 'dashed',
    }[edge.style] || 'solid'

  return `${width} ${style} ${excelColorToCss(edge.color) || '#000000'}`
}

function excelFillToCss(fill) {
  if (!fill || fill.type !== 'pattern') return 'transparent'
  if (fill.pattern !== 'solid') return 'transparent'
  return excelColorToCss(fill.fgColor) || 'transparent'
}

function excelColorToCss(color) {
  if (!color) return null
  if (typeof color.argb === 'string' && color.argb.length === 8) {
    return `#${color.argb.slice(2)}`
  }
  if (typeof color.argb === 'string' && color.argb.length === 6) {
    return `#${color.argb}`
  }
  if (typeof color.theme === 'number') return '#000000'
  if (typeof color.indexed === 'number')
    return color.indexed === 64 ? '#000000' : null
  return null
}

function excelColumnWidthToPx(width) {
  const value = typeof width === 'number' ? width : 8.43
  return Math.floor(((256 * value + Math.floor(128 / 7)) / 256) * 7)
}

function pointsToPx(points) {
  return (points * 96) / 72
}

function jsDateToExcelSerial(value) {
  return value.getTime() / 86400000 + 25569
}

function buildOffsets(sizes) {
  const offsets = [0]
  for (const size of sizes) offsets.push(offsets[offsets.length - 1] + size)
  return offsets
}

function coordinateToPx(value, offsets) {
  const whole = Math.max(0, Math.floor(value))
  const fraction = Math.max(0, value - whole)
  if (whole >= offsets.length - 1) return offsets[offsets.length - 1]
  const start = offsets[whole]
  const end = offsets[whole + 1]
  return start + (end - start) * fraction
}

function parsePrintArea(printArea) {
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

function columnNameToNumber(name) {
  let value = 0
  for (const char of name.toUpperCase()) {
    value = value * 26 + char.charCodeAt(0) - 64
  }
  return value
}

function columnNumberToName(value) {
  let current = value
  let name = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name
}

function cssFontFamily(name) {
  return `'${(name || 'Arial').replace(/'/g, '')}', Arial, sans-serif`
}

function horizontalAlignToCss(value) {
  return (
    {
      center: 'center',
      fill: 'left',
      justify: 'justify',
      left: 'left',
      right: 'right',
      centerContinuous: 'center',
      distributed: 'center',
    }[value] || 'left'
  )
}

function verticalAlignToCss(value) {
  return (
    {
      top: 'top',
      middle: 'middle',
      center: 'middle',
      bottom: 'bottom',
      distributed: 'middle',
      justify: 'middle',
    }[value] || 'middle'
  )
}

function extensionToMime(extension) {
  return (
    {
      gif: 'image/gif',
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      svg: 'image/svg+xml',
      webp: 'image/webp',
    }[String(extension || '').toLowerCase()] || null
  )
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inches(value, fallback) {
  return `${typeof value === 'number' ? value.toFixed(3) : fallback.toFixed(3)}in`
}
