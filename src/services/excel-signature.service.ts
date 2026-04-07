// src/services/excel-signature.service.ts
// ============================================================
// Three-phase Excel signature embedding — pure Node.js, no PowerShell/COM
//   Phase 1 — Encryptor.decryptAsync (Agile) or decryptStandard (cfb+crypto)
//              → raw ZIP bytes, zero workbook re-serialization
//   Phase 2 — JSZip: inject signature image + cell name + sheet protection
//   Phase 3 — Encryptor.encrypt → wrap ZIP in Agile Encryption
// Works on Linux/VPS — no Microsoft Excel installation required.
// ============================================================
import JSZip from 'jszip'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import prisma from '@/prisma'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CFB = require('cfb') as {
  read: (d: Buffer, o: object) => any
  find: (c: any, n: string) => any | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SHEET_NAME = 'mitumori'
const WORKBOOK_PASSWORD = process.env.EXCEL_WORKBOOK_PASSWORD ?? 'cando'
const SHEET_PROTECT_PASSWORD = process.env.EXCEL_SHEET_PASSWORD ?? '123z'

// H=col 7, I=col 8, J=col 9 (0-based)
const ROLE_COL: Record<'prepared' | 'checked' | 'approved', number> = {
  prepared: 7, // H
  checked: 8, // I
  approved: 9, // J
}

const ROW_FROM = 10 // 0-based → Excel row 11
const ROW_TO = 12 // 0-based boundary → bottom of Excel row 12

// ─── Standard Encryption (ECMA-376 v2) ───────────────────────────────────────
// Used by Excel 2007-2010 when saving .xlsm with a password (vMinor=2).

/**
 * Derive AES key for Standard Encryption (MS-OFFCRYPTO §2.3.6).
 * Key derivation: SHA1 spin × 50000 + block0 finalisation + XOR X1/X2 scheme.
 */
function makeKeyStandard(
  password: string,
  salt: Buffer,
  keyBits: number,
): Buffer {
  const pw = Buffer.from(password, 'utf16le')
  let h = crypto.createHash('sha1').update(salt).update(pw).digest()
  const b = Buffer.alloc(24)
  for (let i = 0; i < 50000; i++) {
    b.writeUInt32LE(i, 0)
    h.copy(b, 4)
    h = crypto.createHash('sha1').update(b).digest()
  }
  const hfinal = crypto
    .createHash('sha1')
    .update(h)
    .update(Buffer.alloc(4))
    .digest()
  const cbHash = 20
  const buf1 = Buffer.alloc(64, 0x36)
  const buf2 = Buffer.alloc(64, 0x5c)
  for (let i = 0; i < cbHash; i++) {
    buf1[i] ^= hfinal[i]
    buf2[i] ^= hfinal[i]
  }
  const x1 = crypto.createHash('sha1').update(buf1).digest()
  const x2 = crypto.createHash('sha1').update(buf2).digest()
  return Buffer.concat([x1, x2]).slice(0, keyBits / 8)
}

/**
 * Decrypt a Standard Encrypted CFBF (.xlsm) file → plain ZIP Buffer.
 * Throws if the password is wrong or the file format is unexpected.
 */
function decryptStandard(filePath: string, password: string): Buffer {
  const data = fs.readFileSync(filePath)
  const cfb = CFB.read(data, { type: 'buffer' })
  const ei = CFB.find(cfb, 'EncryptionInfo')
  const ep = CFB.find(cfb, 'EncryptedPackage')
  if (!ei || !ep)
    throw new Error('Not an ECMA-376 encrypted file (missing streams)')

  const buf = Buffer.from(ei.content)
  const vMinor = buf.readUInt16LE(2)
  if (vMinor !== 2)
    throw new Error(
      `Expected Standard Encryption (vMinor=2), got vMinor=${vMinor}`,
    )

  const hdrSize = buf.readUInt32LE(8)
  const vStart = 12 + hdrSize
  const keyBits = buf.readUInt32LE(28)
  const salt = buf.slice(vStart + 4, vStart + 20)
  const encVerifier = buf.slice(vStart + 20, vStart + 36)
  const encVerHash = buf.slice(vStart + 40, vStart + 72)

  const dk = makeKeyStandard(password, salt, keyBits)

  const d1 = crypto.createDecipheriv('aes-128-ecb', dk, null)
  d1.setAutoPadding(false)
  const decV = Buffer.concat([d1.update(encVerifier), d1.final()])
  const d2 = crypto.createDecipheriv('aes-128-ecb', dk, null)
  d2.setAutoPadding(false)
  const decVH = Buffer.concat([d2.update(encVerHash), d2.final()])
  const actualHash = crypto.createHash('sha1').update(decV).digest()
  if (!actualHash.equals(decVH.slice(0, 20)))
    throw new Error('Wrong password for Standard Encrypted file')

  const encPkg = Buffer.from(ep.content)
  const totalSize = encPkg.readUInt32LE(0)
  const encData = encPkg.slice(8)
  const dec = crypto.createDecipheriv('aes-128-ecb', dk, null)
  dec.setAutoPadding(false)
  return Buffer.concat([dec.update(encData), dec.final()]).slice(0, totalSize)
}

// ─── JSZip helpers ────────────────────────────────────────────────────────────

/** Find xl/worksheets/sheetN.xml for a given sheet name (case-insensitive). Falls back to 3rd → 1st sheet. */
async function findWorksheetPaths(
  zip: JSZip,
  sheetName: string,
): Promise<{ sheetPath: string; sheetRelsPath: string } | null> {
  const wbFile = zip.file('xl/workbook.xml')
  if (!wbFile) return null
  const wbXml = await wbFile.async('string')

  const allSheets = [...wbXml.matchAll(/<sheet\b[^>]+>/gi)]
  if (allSheets.length === 0) return null

  const nameLower = sheetName.toLowerCase()
  const targetElem =
    allSheets.find((m) => {
      const nm = m[0].match(/name="([^"]+)"/)
      return nm && nm[1].toLowerCase() === nameLower
    }) ??
    allSheets[2] ??
    allSheets[0]

  const rIdMatch = targetElem[0].match(/r:id="(rId\d+)"/)
  if (!rIdMatch) return null
  const rId = rIdMatch[1]

  const wbRelsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (!wbRelsFile) return null
  const wbRelsXml = await wbRelsFile.async('string')

  const relMatch =
    wbRelsXml.match(
      new RegExp(`<Relationship[^>]+Id="${rId}"[^>]+Target="([^"]+)"`),
    ) ??
    wbRelsXml.match(
      new RegExp(`<Relationship[^>]+Target="([^"]+)"[^>]+Id="${rId}"`),
    )
  if (!relMatch) return null

  const target = relMatch[1] // e.g. worksheets/sheet3.xml
  const sheetPath = `xl/${target}`
  const sheetFile = path.basename(target)
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFile}.rels`

  return { sheetPath, sheetRelsPath }
}

/** Read pixel dimensions from JPEG or PNG buffer without external libraries. */
function getImageDimensions(
  buffer: Buffer,
  ext: string,
): { width: number; height: number } {
  if (ext === 'png') {
    if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    }
  }
  // JPEG: scan for SOF marker
  let i = 0
  while (i + 1 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i++
      continue
    }
    const marker = buffer[i + 1]
    if (marker === 0xff) {
      i++
      continue
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      i += 2
      continue
    }
    if (i + 3 >= buffer.length) break
    const segLen = buffer.readUInt16BE(i + 2)
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (i + 8 < buffer.length) {
        return {
          height: buffer.readUInt16BE(i + 5),
          width: buffer.readUInt16BE(i + 7),
        }
      }
    }
    i += 2 + segLen
  }
  return { width: 200, height: 100 } // fallback 2:1 ratio
}

/**
 * Build a oneCellAnchor placing an image at fixed 1.7 cm × 1 cm,
 * centered horizontally and vertically within the target cell area.
 */
function buildAnchor(
  col: number,
  picId: number,
  imageRId: string,
  rowFrom: number,
  _imgDims: { width: number; height: number },
  colWidthEMU: number,
  rowHeightEMU: number,
): string {
  // Fixed dimensions: width 1.7 cm, height 1 cm (1 cm = 360,000 EMU)
  const IMG_W = 612000
  const IMG_H = 360000
  const colOff = Math.max(0, Math.round((colWidthEMU - IMG_W) / 2))
  const rowOff = Math.max(0, Math.round((rowHeightEMU - IMG_H) / 2))
  return `<xdr:oneCellAnchor>
    <xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${colOff}</xdr:colOff><xdr:row>${rowFrom}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:from>
    <xdr:ext cx="${IMG_W}" cy="${IMG_H}"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="${picId}" name="Signature_${picId}"/>
        <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${imageRId}"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>`
}

/** Inject one signature image into the ZIP for the given column/row range. */
async function injectSignature(
  zip: JSZip,
  imageBuffer: Buffer,
  imgExt: string,
  col: number,
  rowFrom: number,
  rowTo: number,
  sheetPath: string,
  sheetRelsPath: string,
): Promise<void> {
  const allEntries = Object.keys(zip.files)
  const mimeType = `image/${imgExt}`

  // Compute cell geometry for centering
  const sheetXmlForGeom = await zip.file(sheetPath)!.async('string')
  let colWidthEMU = Math.round((8.43 * 7 + 5) * 9525) // default Calibri 11pt
  for (const m of sheetXmlForGeom.matchAll(/<col\b[^>]+\/>/g)) {
    const cMin = parseInt(m[0].match(/min="(\d+)"/)?.[1] ?? '0')
    const cMax = parseInt(m[0].match(/max="(\d+)"/)?.[1] ?? '0')
    if (col + 1 >= cMin && col + 1 <= cMax) {
      const w = parseFloat(m[0].match(/width="([\d.]+)"/)?.[1] ?? '8.43')
      colWidthEMU = Math.round((w * 7 + 5) * 9525)
      break
    }
  }
  let rowHeightEMU = 0
  const rowDefsForGeom = [...sheetXmlForGeom.matchAll(/<row\b[^>]+>/g)]
  for (let r = rowFrom; r < rowTo; r++) {
    const rNum = r + 1
    const rowDef = rowDefsForGeom.find(
      (m) => parseInt(m[0].match(/\br="(\d+)"/)?.[1] ?? '0') === rNum,
    )
    const ht = rowDef
      ? parseFloat(rowDef[0].match(/ht="([\d.]+)"/)?.[1] ?? '15')
      : 15
    rowHeightEMU += Math.round(ht * 12700)
  }
  const imgDims = getImageDimensions(imageBuffer, imgExt)

  // Add image file to xl/media/
  const existingImages = allEntries.filter((f) =>
    f.startsWith('xl/media/image'),
  )
  const nextNum = existingImages.length + 1
  const imgName = `image${nextNum}.${imgExt}`
  zip.file(`xl/media/${imgName}`, imageBuffer)

  // Locate drawing already linked to this sheet (if any)
  const hasSheetRels = zip.file(sheetRelsPath) !== null
  let drawingFile: string | null = null
  let drawingRelsFile: string | null = null

  if (hasSheetRels) {
    const sheetRelsXml = await zip.file(sheetRelsPath)!.async('string')
    const drawRel = [...sheetRelsXml.matchAll(/<Relationship\b[^>]+>/gi)].find(
      (m) => m[0].includes('/drawing"') || m[0].includes('/drawing '),
    )
    if (drawRel) {
      const tgt = drawRel[0].match(/Target="\.\.\/drawings\/([^"]+)"/)
      if (tgt) {
        drawingFile = `xl/drawings/${tgt[1]}`
        drawingRelsFile = `xl/drawings/_rels/${tgt[1]}.rels`
      }
    }
  }

  if (drawingFile && zip.file(drawingFile)) {
    // ── Append to existing drawing ──
    let drawingXml = await zip.file(drawingFile)!.async('string')
    let imageRId = 'rId1'

    if (drawingRelsFile && zip.file(drawingRelsFile)) {
      const drawRelsXml = await zip.file(drawingRelsFile)!.async('string')
      const nums = [...drawRelsXml.matchAll(/Id="rId(\d+)"/g)].map((m) =>
        parseInt(m[1]),
      )
      imageRId = `rId${nums.length > 0 ? Math.max(...nums) + 1 : 1}`
      const newRel = `<Relationship Id="${imageRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgName}"/>`
      zip.file(
        drawingRelsFile,
        drawRelsXml.replace('</Relationships>', `${newRel}\n</Relationships>`),
      )
    }

    drawingXml = drawingXml.replace(
      '</xdr:wsDr>',
      `${buildAnchor(col, nextNum + 100, imageRId, rowFrom, imgDims, colWidthEMU, rowHeightEMU)}\n</xdr:wsDr>`,
    )
    zip.file(drawingFile, drawingXml)
  } else {
    // ── Create new drawing ──
    drawingFile = 'xl/drawings/drawing1.xml'
    drawingRelsFile = 'xl/drawings/_rels/drawing1.xml.rels'
    const imageRId = 'rId1'

    zip.file(
      drawingFile,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${buildAnchor(col, nextNum + 100, imageRId, rowFrom, imgDims, colWidthEMU, rowHeightEMU)}
</xdr:wsDr>`,
    )

    zip.file(
      drawingRelsFile,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${imageRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgName}"/>
</Relationships>`,
    )

    // Link drawing to sheet via sheet rels
    let drawingRId: string
    if (hasSheetRels) {
      let sheetRelsXml = await zip.file(sheetRelsPath)!.async('string')
      const nums = [...sheetRelsXml.matchAll(/Id="rId(\d+)"/g)].map((m) =>
        parseInt(m[1]),
      )
      drawingRId = `rId${nums.length > 0 ? Math.max(...nums) + 1 : 1}`
      sheetRelsXml = sheetRelsXml.replace(
        '</Relationships>',
        `<Relationship Id="${drawingRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>\n</Relationships>`,
      )
      zip.file(sheetRelsPath, sheetRelsXml)
    } else {
      drawingRId = 'rId1'
      zip.file(
        sheetRelsPath,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${drawingRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
      )
    }

    let sheetXml = await zip.file(sheetPath)!.async('string')
    if (!sheetXml.includes('<drawing ') && !sheetXml.includes('<drawing\t')) {
      sheetXml = sheetXml.replace(
        '</worksheet>',
        `<drawing r:id="${drawingRId}"/>\n</worksheet>`,
      )
      zip.file(sheetPath, sheetXml)
    }

    let ct = await zip.file('[Content_Types].xml')!.async('string')
    if (!ct.includes('drawings/drawing1.xml')) {
      ct = ct.replace(
        '</Types>',
        `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>`,
      )
      zip.file('[Content_Types].xml', ct)
    }
  }

  // Register image MIME in [Content_Types].xml (once per extension)
  let ct = await zip.file('[Content_Types].xml')!.async('string')
  if (!ct.includes(`Extension="${imgExt}"`)) {
    ct = ct.replace(
      '</Types>',
      `<Default Extension="${imgExt}" ContentType="${mimeType}"/>\n</Types>`,
    )
    zip.file('[Content_Types].xml', ct)
  }
}

// ─── Sheet-anchor strip & protection helpers ──────────────────────────────────

/**
 * Strip the previously-injected signature anchor for a single column from the
 * drawing XML, and clean up the now-unused rels entry.
 * Call this before injecting so idempotent re-runs produce exactly one anchor
 * per column.
 */
async function stripColumnAnchor(
  zip: JSZip,
  { sheetPath, sheetRelsPath }: { sheetPath: string; sheetRelsPath: string },
  col: number,
): Promise<void> {
  const hasSheetRels = zip.file(sheetRelsPath) !== null
  if (!hasSheetRels) return

  const sheetRelsXml = await zip.file(sheetRelsPath)!.async('string')
  const drawRel = [...sheetRelsXml.matchAll(/<Relationship\b[^>]+>/gi)].find(
    (m) => m[0].includes('/drawing"') || m[0].includes('/drawing '),
  )
  if (!drawRel) return

  const tgt = drawRel[0].match(/Target="\.\.\/drawings\/([^"]+)"/)
  if (!tgt) return

  const drawingFile = `xl/drawings/${tgt[1]}`
  const drawingRelsFile = `xl/drawings/_rels/${tgt[1]}.rels`
  if (!zip.file(drawingFile)) return

  let drawingXml = await zip.file(drawingFile)!.async('string')
  drawingXml = drawingXml.replace(
    /<xdr:(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:\1>/g,
    (anchor) => {
      const anchorCol = parseInt(
        anchor.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/)?.[1] ??
          '-1',
      )
      return anchorCol === col ? '' : anchor
    },
  )
  zip.file(drawingFile, drawingXml)

  // Remove rels entries for images no longer referenced
  if (zip.file(drawingRelsFile)) {
    const usedRIds = new Set(
      [...drawingXml.matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]),
    )
    let drawRelsXml = await zip.file(drawingRelsFile)!.async('string')
    drawRelsXml = drawRelsXml.replace(/<Relationship\b[^>]+\/>/g, (rel) => {
      const rid = rel.match(/Id="(rId\d+)"/)?.[1]
      return rid && !usedRIds.has(rid) ? '' : rel
    })
    zip.file(drawingRelsFile, drawRelsXml)
  }
}

/**
 * Compute the OOXML sheet-protection password hash (SHA-512, 100 000 iterations).
 * Algorithm per ECMA-376:
 *   H0 = SHA512(salt + password-utf16le)
 *   Hi = SHA512(H(i-1) + i-as-uint32-LE), i = 0..spinCount-1
 */
function hashSheetPassword(password: string): {
  algorithmName: string
  saltValue: string
  hashValue: string
  spinCount: number
} {
  const salt = crypto.randomBytes(16)
  const pwdBuf = Buffer.from(password, 'utf16le')
  let hash = crypto.createHash('sha512').update(salt).update(pwdBuf).digest()
  const spinCount = 100000
  const iterBuf = Buffer.allocUnsafe(4)
  for (let i = 0; i < spinCount; i++) {
    iterBuf.writeUInt32LE(i, 0)
    hash = crypto.createHash('sha512').update(hash).update(iterBuf).digest()
  }
  return {
    algorithmName: 'SHA-512',
    saltValue: salt.toString('base64'),
    hashValue: hash.toString('base64'),
    spinCount,
  }
}

/**
 * Inject <sheetProtection> with a hashed password into the sheet XML.
 * Removes any existing <sheetProtection> first.
 * Inserted immediately after </sheetData> per OOXML element ordering.
 */
async function injectSheetProtection(
  zip: JSZip,
  sheetPath: string,
  password: string,
): Promise<void> {
  let xml = await zip.file(sheetPath)!.async('string')
  xml = xml.replace(/<sheetProtection\b[^>]*\/>/g, '')
  const h = hashSheetPassword(password)
  const protXml =
    `<sheetProtection algorithmName="${h.algorithmName}"` +
    ` hashValue="${h.hashValue}" saltValue="${h.saltValue}"` +
    ` spinCount="${h.spinCount}" sheet="1" objects="0" scenarios="0"/>`
  if (xml.includes('</sheetData>')) {
    xml = xml.replace('</sheetData>', `</sheetData>\n  ${protXml}`)
  } else if (xml.includes('<sheetData/>')) {
    xml = xml.replace('<sheetData/>', `<sheetData/>\n  ${protXml}`)
  } else {
    xml = xml.replace('</worksheet>', `  ${protXml}\n</worksheet>`)
  }
  zip.file(sheetPath, xml)
}

/**
 * Write the signer's name directly into the worksheet XML as an inline string.
 * Preserves the existing cell style attribute (s="N") from the template.
 * Called in Phase 2 so Phase 3 only needs to encrypt — no re-serialization.
 */
async function injectCellName(
  zip: JSZip,
  sheetPath: string,
  col: number, // 0-based (7=H, 8=I, 9=J)
  username: string,
): Promise<void> {
  let xml = await zip.file(sheetPath)!.async('string')
  const rowNum = 13
  const colLetter = String.fromCharCode(65 + col)
  const cellRef = `${colLetter}${rowNum}`
  const safe = username
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Strategy: isolate row 13 first, then replace the cell WITHIN that row only.
  // This avoids [\s\S]*? matching across </row> boundaries (which ate rows 14-15).
  const rowRe = new RegExp(
    `(<row\\b[^>]*\\br="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`,
  )
  const rowMatch = xml.match(rowRe)

  if (rowMatch) {
    const [fullRow, rowOpen, rowContent, rowClose] = rowMatch
    // Match the target cell within the isolated row content (safe — cannot cross rows)
    const cellRe = new RegExp(`<c r="${cellRef}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`)
    const cellMatch = rowContent.match(cellRe)
    const sMatch = cellMatch?.[1]?.match(/\bs="(\d+)"/)
    const styleAttr = sMatch ? ` s="${sMatch[1]}"` : ''
    const newCell = `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t>${safe}</t></is></c>`

    let newRowContent: string
    if (cellMatch) {
      newRowContent = rowContent.replace(cellRe, newCell)
    } else {
      newRowContent = rowContent + newCell
    }
    xml = xml.replace(fullRow, rowOpen + newRowContent + rowClose)
  } else {
    // Row 13 doesn't exist — create it
    const newCell = `<c r="${cellRef}" t="inlineStr"><is><t>${safe}</t></is></c>`
    xml = xml.replace(
      '</sheetData>',
      `<row r="${rowNum}">${newCell}</row>\n</sheetData>`,
    )
  }
  zip.file(sheetPath, xml)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SignatureInfo {
  userId: number
  role: 'prepared' | 'checked' | 'approved'
}

/**
 * Add signature + person name for one role to the Excel file.
 *   Phase 1 — PS decrypts the workbook (removes open-password → temp file)
 *   Phase 2 — JSZip injects image in H/I/J rows 11-12 and name in row 13
 *   Phase 3 — PS re-applies open password + sheet protection
 */
export async function addSignatureToExcel(
  filePath: string,
  userId: number,
  role: 'prepared' | 'checked' | 'approved',
): Promise<string> {
  // ── Fetch user info ──────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { signatureUrl: true, username: true },
  })
  if (!user?.signatureUrl) {
    console.warn(`[excel-signature] No signature for user ${userId}, skipping`)
    return filePath
  }

  // ── Resolve signature file path (prevent path traversal) ────────────────────
  const sigFilename = path.basename(user.signatureUrl)
  const sigDir = path.join(process.cwd(), 'uploads', 'signatures')
  const sigFullPath = path.normalize(path.join(sigDir, sigFilename))
  if (!sigFullPath.startsWith(sigDir)) {
    console.error(`[excel-signature] Path traversal blocked: ${sigFilename}`)
    return filePath
  }
  if (!fs.existsSync(sigFullPath)) {
    console.warn(`[excel-signature] Signature file missing: ${sigFullPath}`)
    return filePath
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`[excel-signature] Excel file not found: ${filePath}`)
  }

  const imageBuffer = fs.readFileSync(sigFullPath)
  const rawExt = path.extname(user.signatureUrl).toLowerCase().replace('.', '')
  const imgExt = rawExt === 'jpg' ? 'jpeg' : rawExt

  const tempDecrypt = path.join(os.tmpdir(), `qca-sign-temp-${Date.now()}.xlsm`)
  const outputTemp = path.join(
    os.tmpdir(),
    `qca-output-temp-${Date.now()}.xlsm`,
  )
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const EncryptorClass = require('xlsx-populate/lib/Encryptor') as new () => {
    encrypt(buf: Buffer, password: string): Promise<Buffer>
    decryptAsync(buf: Buffer, password: string): Promise<Buffer>
  }
  const encryptor = new EncryptorClass()
  try {
    // ── Phase 1: Decrypt to raw ZIP — no workbook re-serialization ────────────
    // Use Encryptor.decryptAsync() directly so the ZIP bytes are extracted
    // as-is without any XML parse/re-write that would strip cell/row content.
    // Fall back to our own decryptStandard() for Excel 2007-2010 files.
    console.log(`[excel-signature] Phase 1: Decrypting workbook...`)
    const encryptedBuf = fs.readFileSync(filePath)
    const magic = encryptedBuf.slice(0, 4)
    const isCfbf =
      magic[0] === 0xd0 &&
      magic[1] === 0xcf &&
      magic[2] === 0x11 &&
      magic[3] === 0xe0
    if (!isCfbf) {
      throw new Error(
        `Decryption failed: file is not a valid CFBF/OLE2 container (magic: ${magic.toString('hex')})`,
      )
    }
    let plainZip: Buffer
    try {
      plainZip = await encryptor.decryptAsync(encryptedBuf, WORKBOOK_PASSWORD)
    } catch {
      // Agile decrypt failed — try Standard Encryption (Excel 2007-2010)
      plainZip = decryptStandard(filePath, WORKBOOK_PASSWORD)
    }
    fs.writeFileSync(tempDecrypt, plainZip)
    console.log(`[excel-signature] Phase 1 OK`)

    // ── Phase 2: JSZip injection ──────────────────────────────────────────────
    console.log(
      `[excel-signature] Phase 2: Injecting ${role} (user ${userId} / ${user.username})...`,
    )
    const fileBuffer = fs.readFileSync(tempDecrypt)
    const zip = await JSZip.loadAsync(fileBuffer)

    const sheetPaths = await findWorksheetPaths(zip, SHEET_NAME)
    if (!sheetPaths) {
      throw new Error(`Sheet '${SHEET_NAME}' not found in ${filePath}`)
    }

    const col = ROLE_COL[role]

    // Strip any previously-injected anchor for this column (idempotent re-runs)
    await stripColumnAnchor(zip, sheetPaths, col)

    await injectSignature(
      zip,
      imageBuffer,
      imgExt,
      col,
      ROW_FROM,
      ROW_TO,
      sheetPaths.sheetPath,
      sheetPaths.sheetRelsPath,
    )

    // Inject sheet protection with hashed password (pure JS, no Excel COM)
    await injectSheetProtection(
      zip,
      sheetPaths.sheetPath,
      SHEET_PROTECT_PASSWORD,
    )

    // Inject person name directly into the worksheet XML (preserves all other content)
    await injectCellName(zip, sheetPaths.sheetPath, col, user.username)

    // Save JSZip output to temp
    const newBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
    fs.writeFileSync(outputTemp, newBuffer)
    console.log(`[excel-signature] Phase 2 OK`)

    // ── Phase 3: Re-encrypt with open password — NO workbook re-serialization ──
    // Use xlsx-populate's Encryptor directly so the Phase 2 ZIP content is
    // wrapped in Agile Encryption as-is, without any XML parse/re-write that
    // would strip user-entered cell data.
    console.log(`[excel-signature] Phase 3: Encrypting...`)
    const phase2Buffer = fs.readFileSync(outputTemp)
    const encryptedBuffer = await encryptor.encrypt(
      phase2Buffer,
      WORKBOOK_PASSWORD,
    )
    fs.writeFileSync(filePath, encryptedBuffer)
    console.log(`[excel-signature] Phase 3 OK — ${role} done for ${filePath}`)

    return filePath
  } catch (error) {
    console.error(`[excel-signature] Error embedding ${role} signature:`, error)
    throw error
  } finally {
    try {
      if (fs.existsSync(tempDecrypt)) fs.unlinkSync(tempDecrypt)
    } catch (_) {}
    try {
      if (fs.existsSync(outputTemp)) fs.unlinkSync(outputTemp)
    } catch (_) {}
  }
}

/**
 * Embed multiple signatures in one pass (processes each role sequentially).
 */
export async function embedSignaturesInExcel(
  inputFilePath: string,
  signatures: SignatureInfo[],
  outputPath?: string,
): Promise<string> {
  const targetPath = outputPath ?? inputFilePath

  if (targetPath !== inputFilePath) {
    fs.copyFileSync(inputFilePath, targetPath)
  }

  for (const sig of signatures) {
    await addSignatureToExcel(targetPath, sig.userId, sig.role)
  }

  return targetPath
}
