/**
 * test-sign-file.js
 *
 * Three-phase signature embedding:
 *   Phase 1 — Decrypts uploaded .xlsm files supporting BOTH:
 *             • Agile Encryption  (Excel 2013+, xlsx-populate)
 *             • Standard Encryption (Excel 2007-2010, cfb + Node crypto)
 *             Output: plain ZIP temp file for Phase 2.
 *   Phase 2 — JSZip injects signature images + person names + sheet protection
 *              (SHA-512 hashed password) directly into the ZIP structure.
 *   Phase 3 — xlsx-populate re-applies the open password to the final output
 *              (always writes Agile Encryption, compatible with all modern Excel).
 *
 * Works on Linux (no PowerShell / Excel COM required).
 * Target: mitumori sheet, H11:H12 / I11:I12 / J11:J12
 */
const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')
const os = require('os')
const crypto = require('crypto')
const CFB = require('cfb')
const XlsxPopulate = require('xlsx-populate')

// Monkey-patch xlsx-populate's XmlParser to strip UTF-8 BOM before parsing.
// Some Excel files include a BOM (\uFEFF) at the start of embedded XML files,
// which the underlying sax parser rejects.
;(function patchXmlParserBom() {
  const XmlParser = require('xlsx-populate/lib/XmlParser')
  const orig = XmlParser.prototype.parseAsync
  XmlParser.prototype.parseAsync = function (xmlText) {
    if (typeof xmlText === 'string' && xmlText.charCodeAt(0) === 0xfeff) {
      xmlText = xmlText.slice(1)
    }
    return orig.call(this, xmlText)
  }
})()

// ─── Standard Encryption (ECMA-376 v4.2) ────────────────────────────────────
/**
 * Derive AES key for Standard Encryption (ECMA-376 Standard, MS-OFFCRYPTO 2.3.6).
 * Used by Excel 2007-2010 when saving as .xlsx/.xlsm with a password.
 * Key derivation: SHA1 spin × 50000 + block0 finalisation + XOR X1/X2 scheme.
 */
function makeKeyStandard(password, salt, keyBits) {
  const pw = Buffer.from(password, 'utf16le')
  let h = crypto.createHash('sha1').update(salt).update(pw).digest()
  const b = Buffer.alloc(24)
  for (let i = 0; i < 50000; i++) {
    b.writeUInt32LE(i, 0)
    h.copy(b, 4)
    h = crypto.createHash('sha1').update(b).digest()
  }
  // Final hash: append block index 0
  const hfinal = crypto
    .createHash('sha1')
    .update(h)
    .update(Buffer.alloc(4))
    .digest()
  // X1/X2 key stretching (ECMA-376 §2.3.6.4)
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
 * Decrypt a Standard Encrypted CFBF (.xlsm) file to a plain ZIP Buffer.
 * Throws if password is wrong or file format is unexpected.
 */
function decryptStandard(filePath, password) {
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

  // EncryptionHeaderSize at [8..11]; header starts at [12]; verifier follows
  const hdrSize = buf.readUInt32LE(8)
  const vStart = 12 + hdrSize
  const keyBits = buf.readUInt32LE(28) // inside EncryptionHeader

  // EncryptionVerifier fields
  const salt = buf.slice(vStart + 4, vStart + 20) // skip SaltSize DWORD
  const encVerifier = buf.slice(vStart + 20, vStart + 36)
  const encVerHash = buf.slice(vStart + 40, vStart + 72) // skip VerifierHashSize

  const dk = makeKeyStandard(password, salt, keyBits)

  // Verify password using AES-ECB
  const d1 = crypto.createDecipheriv('aes-128-ecb', dk, null)
  d1.setAutoPadding(false)
  const decV = Buffer.concat([d1.update(encVerifier), d1.final()])
  const d2 = crypto.createDecipheriv('aes-128-ecb', dk, null)
  d2.setAutoPadding(false)
  const decVH = Buffer.concat([d2.update(encVerHash), d2.final()])
  const actualHash = crypto.createHash('sha1').update(decV).digest()
  if (!actualHash.equals(decVH.slice(0, 20)))
    throw new Error('Wrong password for Standard Encrypted file')

  // Decrypt package: [0..3] = uint32 size, [8..] = AES-ECB ciphertext
  const encPkg = Buffer.from(ep.content)
  const totalSize = encPkg.readUInt32LE(0)
  const encData = encPkg.slice(8)
  const dec = crypto.createDecipheriv('aes-128-ecb', dk, null)
  dec.setAutoPadding(false)
  return Buffer.concat([dec.update(encData), dec.final()]).slice(0, totalSize)
}

// ─── Config ───────────────────────────────────────────────────────────────────

// Template file: place the .xlsm in <backend-root>/uploads/templates/
const SOURCE_FILE = path.join(
  __dirname,
  'uploads',
  'templates',
  'AMTI26040601SARI DAISHO AMTI BAUT DIA 10.9.xlsm',
)

const WORKBOOK_PASSWORD = 'cando'
const SHEET_PROTECT_PASSWORD = '123z'

// Output: saved to <backend-root>/uploads/signed/ so it is download-accessible
const OUTPUT_FILE = path.join(
  __dirname,
  'uploads',
  'signed',
  'AMTI26040601SARI DAISHO AMTI BAUT DIA 10.9-SIGNED.xlsm',
)

// Signatures directory: <backend-root>/uploads/signatures/
const signaturesDir = path.join(__dirname, 'uploads', 'signatures')

const SHEET_NAME = 'mitumori' // 3rd sheet, case-insensitive match

// H=col 7, I=col 8, J=col 9 (all 0-based)
// Rows 11-12 in Excel = 0-based index 10 (from) → 12 (to boundary)
const ROLES = [
  { name: 'prepared', col: 7, personName: 'SARI' }, // H11:H12, H13
  { name: 'checked', col: 8, personName: 'EKA' }, // I11:I12, I13
  { name: 'approved', col: 9, personName: 'ARDI' }, // J11:J12, J13
]
const ROW_FROM = 10 // 0-based → Excel row 11
const ROW_TO = 12 // 0-based boundary → bottom of Excel row 12

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('\nEMBED SIGNATURE TEST - AMTI production file\n')
console.log(`Source : ${SOURCE_FILE}`)
console.log(`Output : ${OUTPUT_FILE}`)
console.log(`Sheet  : ${SHEET_NAME}`)
console.log(
  `Cells  : H11:H12 (prepared), I11:I12 (checked), J11:J12 (approved)\n`,
)
;(async () => {
  // Ensure output directories exist (safe on both Linux and Windows)
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  const tempFile = path.join(os.tmpdir(), `qca-sign-temp-${Date.now()}.xlsm`)

  try {
    // ── PHASE 1: Decrypt to raw ZIP — no workbook re-serialization ────────────
    // Use Encryptor.decryptAsync() so ZIP bytes are extracted as-is, without
    // any XML parse/re-write that would strip cell/row content.
    console.log('Phase 1: Decrypting workbook...')
    if (!fs.existsSync(SOURCE_FILE)) {
      throw new Error(`File not found:\n  ${SOURCE_FILE}`)
    }

    const encryptedBuf = fs.readFileSync(SOURCE_FILE)
    const magic = encryptedBuf.slice(0, 4)
    const isCfbf =
      magic[0] === 0xd0 &&
      magic[1] === 0xcf &&
      magic[2] === 0x11 &&
      magic[3] === 0xe0
    if (!isCfbf) {
      throw new Error(
        `Source is not a valid CFBF/OLE2 container (magic: ${magic.toString('hex')})`,
      )
    }

    let encryptionType = 'unknown'
    const Encryptor = require('xlsx-populate/lib/Encryptor')
    const encryptor = new Encryptor()
    let plainZip
    try {
      plainZip = await encryptor.decryptAsync(encryptedBuf, WORKBOOK_PASSWORD)
      encryptionType = 'Agile'
      console.log('OK: Decrypted via Encryptor.decryptAsync (Agile Encryption)')
    } catch (_agileErr) {
      // Fall back to Standard Encryption (Excel 2007-2010)
      console.log(
        'Agile decryption failed, trying Standard Encryption (Excel 2007-2010)...',
      )
      try {
        plainZip = decryptStandard(SOURCE_FILE, WORKBOOK_PASSWORD)
        encryptionType = 'Standard'
        console.log('OK: Decrypted via Standard Encryption (cfb + AES-ECB)')
      } catch (stdErr) {
        throw new Error(
          `Decryption failed for both Agile and Standard Encryption.\n` +
            `Check that the password is correct and the file is a valid .xlsm.\n` +
            `Standard error: ${stdErr.message}`,
        )
      }
    }
    fs.writeFileSync(tempFile, plainZip)

    // ── PHASE 2: JSZip injection ───────────────────────────────────────────────
    console.log('\nPhase 2: JSZip signature injection...')

    // Load signatures
    console.log('  Loading signatures...')
    const sigFiles = fs
      .readdirSync(signaturesDir)
      .filter((f) => /\.(png|jpe?g)$/i.test(f))
    if (sigFiles.length === 0) {
      throw new Error(`No .png/.jpg files found in: ${signaturesDir}`)
    }
    console.log(`  Found ${sigFiles.length} file(s): ${sigFiles.join(', ')}`)

    // Load one signature buffer per role (sigFiles[0]=prepared, [1]=checked, [2]=approved)
    // If fewer files than roles, the last available file is reused.
    const loadedSigs = ROLES.map((role, i) => {
      const file = sigFiles[Math.min(i, sigFiles.length - 1)]
      const buf = fs.readFileSync(path.join(signaturesDir, file))
      const rawExt = path.extname(file).toLowerCase().replace('.', '')
      const ext = rawExt === 'jpg' ? 'jpeg' : rawExt
      console.log(`  ${role.name}: ${file} → ext=${ext}`)
      return { buf, ext, mime: `image/${ext}` }
    })
    const imgExt = loadedSigs[0].ext // used for Content_Types default extension

    // Open decrypted temp file as ZIP
    const fileBuffer = fs.readFileSync(tempFile)
    const zip = await JSZip.loadAsync(fileBuffer)
    const allEntries = Object.keys(zip.files)
    console.log(`  ZIP entries: ${allEntries.length}`)
    console.log(
      `  Has xl/drawings : ${allEntries.some((f) => f.startsWith('xl/drawings/'))}`,
    )
    console.log(
      `  Has xl/media    : ${allEntries.some((f) => f.startsWith('xl/media/'))}`,
    )

    // Find mitumori sheet
    console.log(`  Finding sheet '${SHEET_NAME}'...`)
    const sheetPaths = await findWorksheetPaths(zip, SHEET_NAME)
    if (!sheetPaths) {
      const wbXml = await zip.file('xl/workbook.xml').async('string')
      const names = [...wbXml.matchAll(/name="([^"]+)"/g)].map((m) => m[1])
      throw new Error(
        `Sheet '${SHEET_NAME}' not found.\n  Available: ${names.join(', ')}`,
      )
    }
    console.log(`  sheetPath    : ${sheetPaths.sheetPath}`)
    console.log(`  sheetRelsPath: ${sheetPaths.sheetRelsPath}`)

    const sheetXml = await zip.file(sheetPaths.sheetPath).async('string')
    const protMatch = sheetXml.match(/<sheetProtection\b[^/]*/i)
    if (protMatch) {
      console.log(
        `  Sheet protection: detected (drawing injection bypasses it)`,
      )
    }

    // ── DIAGNOSTIC: merges, col widths, row heights, existing anchors ─────────
    {
      const rawSheet = await zip.file(sheetPaths.sheetPath).async('string')

      // Merged cells — filter to rows 8-14, cols H-K only
      const allMerges = [...rawSheet.matchAll(/<mergeCell ref="([^"]+)"/g)].map(
        (m) => m[1],
      )
      // Parse col letters to numbers
      const colNum = (s) =>
        s
          .toUpperCase()
          .split('')
          .reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
      const relevantMerges = allMerges.filter((ref) => {
        const [a, b] = ref.split(':')
        const ac = colNum(a.replace(/\d/g, '')),
          ar = parseInt(a.replace(/\D/g, ''))
        const bc = colNum((b || a).replace(/\d/g, '')),
          br = parseInt((b || a).replace(/\D/g, ''))
        return br >= 8 && ar <= 14 && bc >= 7 && ac <= 12
      })
      console.log(
        `\n  All merges (${allMerges.length}), near H-K rows 8-14: ${relevantMerges.join(', ') || '(none)'}`,
      )
      console.log(`  All merges full list: ${allMerges.join(', ')}`)

      // Column widths for cols H-K
      const colDefs = [...rawSheet.matchAll(/<col\b[^>]+\/>/g)]
      console.log(`  Cols H-K (min 8-11):`)
      colDefs
        .filter((m) => {
          const min = parseInt(m[0].match(/min="(\d+)"/)?.[1] ?? '0')
          const max = parseInt(m[0].match(/max="(\d+)"/)?.[1] ?? '0')
          return max >= 8 && min <= 11
        })
        .forEach((m) => console.log(`    ${m[0].trim()}`))

      // Row heights for rows 10-14
      const rowDefs = [...rawSheet.matchAll(/<row\b[^>]+>/g)]
      console.log(`  Rows 10-14:`)
      rowDefs
        .filter((m) => {
          const r = parseInt(m[0].match(/\br="(\d+)"/)?.[1] ?? '0')
          return r >= 10 && r <= 14
        })
        .forEach((m) => console.log(`    ${m[0].slice(0, 200)}`))
    }
    console.log('')

    // Strip previously-injected signature anchors at cols 7-9 ONCE before injecting.
    // Must happen before the loop — otherwise each injectSignature call would
    // strip the anchor the previous call just added.
    await stripSignatureAnchors(
      zip,
      sheetPaths,
      ROLES.map((r) => r.col),
    )

    // Inject all 3 roles (each with its own signature image)
    console.log(`  Injecting signatures...`)
    for (let i = 0; i < ROLES.length; i++) {
      const role = ROLES[i]
      const { buf, ext } = loadedSigs[i]
      const colLetter = String.fromCharCode(65 + role.col)
      process.stdout.write(
        `    ${role.name.padEnd(8)} → col ${role.col} (${colLetter}), rows ${ROW_FROM + 1}-${ROW_TO} ... `,
      )
      await injectSignature(
        zip,
        buf,
        ext,
        role.col,
        ROW_FROM,
        ROW_TO,
        sheetPaths,
      )
      console.log('OK')
    }

    // Inject person names into row 13 (H13, I13, J13)
    console.log(`  Injecting names into row 13...`)
    await injectCellNames(zip, sheetPaths.sheetPath, ROLES)
    console.log('  Names OK')

    // Inject sheet protection with hashed password
    console.log(
      `  Injecting sheet protection (password: ${SHEET_PROTECT_PASSWORD})...`,
    )
    await injectSheetProtection(
      zip,
      sheetPaths.sheetPath,
      SHEET_PROTECT_PASSWORD,
    )
    console.log('  Protection OK')

    // Dump the last 3 anchors we just wrote to verify coordinates
    {
      const relsXml = await zip.file(sheetPaths.sheetRelsPath).async('string')
      const dm = [...relsXml.matchAll(/<Relationship\b[^>]+>/gi)].find(
        (x) => x[0].includes('/drawing"') || x[0].includes('/drawing '),
      )
      if (dm) {
        const tgt = dm[0].match(/Target="\.\.\/drawings\/([^"]+)"/)
        if (tgt) {
          const drawXml = await zip
            .file(`xl/drawings/${tgt[1]}`)
            .async('string')
          const anchors = [
            ...drawXml.matchAll(
              /<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g,
            ),
          ]
          console.log(
            `\n  Drawing now has ${anchors.length} anchors. Last 3 injected:`,
          )
          anchors.slice(-3).forEach((a, i) => {
            const fC =
              a[0].match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/)?.[1] ??
              '?'
            const fR =
              a[0].match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)?.[1] ??
              '?'
            const fCo =
              a[0].match(
                /<xdr:from>[\s\S]*?<xdr:colOff>(\d+)<\/xdr:colOff>/,
              )?.[1] ?? '0'
            const fRo =
              a[0].match(
                /<xdr:from>[\s\S]*?<xdr:rowOff>(\d+)<\/xdr:rowOff>/,
              )?.[1] ?? '0'
            const extCx = a[0].match(/<xdr:ext\b[^>]*cx="(\d+)"/)?.[1] ?? '-'
            const extCy = a[0].match(/<xdr:ext\b[^>]*cy="(\d+)"/)?.[1] ?? '-'
            const anchorType = a[1] // 'oneCellAnchor' or 'twoCellAnchor'
            if (anchorType === 'oneCellAnchor') {
              console.log(
                `    [-${3 - i}] oneCellAnchor from=col${fC}+${fCo},row${fR}+${fRo} ext cx=${extCx},cy=${extCy}`,
              )
            } else {
              const tC =
                a[0].match(/<xdr:to>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/)?.[1] ??
                '?'
              const tR =
                a[0].match(/<xdr:to>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)?.[1] ??
                '?'
              const ea = a[0].match(/editAs="([^"]*)"/)?.[1] ?? '?'
              console.log(
                `    [-${3 - i}] editAs=${ea} from=col${fC}+${fCo},row${fR}+${fRo} to=col${tC}+row${tR}`,
              )
            }
          })
        }
      }
    }
    console.log('')

    // Save output
    console.log(`\nSaving JSZip output to temp...`)
    const outputTempFile = path.join(
      os.tmpdir(),
      `qca-output-temp-${Date.now()}.xlsm`,
    )
    const newBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })
    fs.writeFileSync(outputTempFile, newBuffer)
    console.log(`OK: JSZip temp saved`)

    // ── PHASE 3: Encrypt Phase 2 ZIP without re-serializing ────────────────────
    // Using xlsx-populate's Encryptor directly so the ZIP content is wrapped in
    // Agile Encryption as-is — no XML parse/re-write that could strip cell data.
    console.log(`\nPhase 3: Encrypting (no re-serialization)...`)
    try {
      const Encryptor = require('xlsx-populate/lib/Encryptor')
      const encryptor = new Encryptor()
      const phase2Buf = fs.readFileSync(outputTempFile)
      const encryptedBuf = await encryptor.encrypt(phase2Buf, WORKBOOK_PASSWORD)
      fs.writeFileSync(OUTPUT_FILE, encryptedBuf)
    } finally {
      try {
        fs.unlinkSync(outputTempFile)
      } catch (_) {}
    }
    console.log(`OK: ${OUTPUT_FILE}`)

    console.log('\n✓ DONE — open the output file in Excel to verify.')
    console.log(
      '  Signatures should appear in H11:H12, I11:I12, J11:J12 on the mitumori sheet.',
    )
    console.log('  If the sheet asks for a password to edit, use: 123z')
    console.log(
      `  The output file is protected with the open-password: ${WORKBOOK_PASSWORD}`,
    )
  } catch (err) {
    console.error(`\nERROR: ${err.message}`)
    process.exit(1)
  } finally {
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile)
      } catch (_) {}
    }
  }
})()

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve sheetPath + sheetRelsPath for a named sheet (case-insensitive).
 * Falls back to 3rd sheet, then 1st sheet.
 */
async function findWorksheetPaths(zip, sheetName) {
  const wbXml = await zip.file('xl/workbook.xml').async('string')
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

  const wbRelsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const relMatch =
    wbRelsXml.match(
      new RegExp(`<Relationship[^>]+Id="${rId}"[^>]+Target="([^"]+)"`),
    ) ??
    wbRelsXml.match(
      new RegExp(`<Relationship[^>]+Target="([^"]+)"[^>]+Id="${rId}"`),
    )
  if (!relMatch) return null

  const target = relMatch[1] // e.g. worksheets/sheet3.xml
  const sheetPath = `xl/${target}` // xl/worksheets/sheet3.xml
  const sheetFile = path.basename(target) // sheet3.xml
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFile}.rels`

  return { sheetPath, sheetRelsPath }
}

/**
 * Strip previously-injected signature anchors for the given columns from the
 * drawing XML, and clean up the now-unused rels entries.
 * Call this ONCE before the injection loop so idempotent re-runs work correctly.
 */
async function stripSignatureAnchors(zip, { sheetPath, sheetRelsPath }, cols) {
  const hasSheetRels = zip.file(sheetRelsPath) !== null
  if (!hasSheetRels) return

  const sheetRelsXml = await zip.file(sheetRelsPath).async('string')
  const drawRel = [...sheetRelsXml.matchAll(/<Relationship\b[^>]+>/gi)].find(
    (m) => m[0].includes('/drawing"') || m[0].includes('/drawing '),
  )
  if (!drawRel) return

  const tgt = drawRel[0].match(/Target="\.\.\/drawings\/([^"]+)"/)
  if (!tgt) return

  const drawingFile = `xl/drawings/${tgt[1]}`
  const drawingRelsFile = `xl/drawings/_rels/${tgt[1]}.rels`
  if (!zip.file(drawingFile)) return

  let drawingXml = await zip.file(drawingFile).async('string')
  drawingXml = drawingXml.replace(
    /<xdr:(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:\1>/g,
    (anchor) => {
      const anchorCol = parseInt(
        anchor.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/)?.[1] ??
          '-1',
      )
      return cols.includes(anchorCol) ? '' : anchor
    },
  )
  zip.file(drawingFile, drawingXml)

  // Remove rels entries for images that are no longer referenced
  if (zip.file(drawingRelsFile)) {
    const usedRIds = new Set(
      [...drawingXml.matchAll(/r:embed="(rId\d+)"/g)].map((m) => m[1]),
    )
    let drawRelsXml = await zip.file(drawingRelsFile).async('string')
    drawRelsXml = drawRelsXml.replace(/<Relationship\b[^>]+\/>/g, (rel) => {
      const rid = rel.match(/Id="(rId\d+)"/)?.[1]
      return rid && !usedRIds.has(rid) ? '' : rel
    })
    zip.file(drawingRelsFile, drawRelsXml)
  }
}

/**
 * Inject one signature image into the ZIP for the given column/row range.
 * Appends to existing drawing if one is already linked to the sheet.
 */
async function injectSignature(
  zip,
  imageBuffer,
  imgExt,
  col,
  rowFrom,
  rowTo,
  { sheetPath, sheetRelsPath },
) {
  const allEntries = Object.keys(zip.files)
  const mimeType = `image/${imgExt}`

  // ── Compute cell geometry for positioning ──────────────────────────────────
  const sheetXmlForGeom = await zip.file(sheetPath).async('string')
  // Column width EMU (XML col index is 1-based, so 1-based = col + 1)
  let colWidthEMU = Math.round((8.43 * 7 + 5) * 9525) // default Calibri 11pt
  for (const m of sheetXmlForGeom.matchAll(/<col\b[^>]+\/>/g)) {
    const cMin = parseInt(m[0].match(/min="(\d+)"/)?.[1] ?? '0')
    const cMax = parseInt(m[0].match(/max="(\d+)"/)?.[1] ?? '0')
    if (col + 1 >= cMin && col + 1 <= cMax) {
      const w = parseFloat(m[0].match(/width="([\d.]+)"/)?.[1] ?? '8.43')
      colWidthEMU = Math.round((w * 7 + 5) * 9525) // MDW≈7px @96dpi, 9525 EMU/px
      break
    }
  }
  // Row height EMU: sum rows from rowFrom to rowTo-1 (0-based indices)
  let rowHeightEMU = 0
  const rowDefsForGeom = [...sheetXmlForGeom.matchAll(/<row\b[^>]+>/g)]
  for (let r = rowFrom; r < rowTo; r++) {
    const rNum = r + 1 // Excel 1-based row number
    const rowDef = rowDefsForGeom.find(
      (m) => parseInt(m[0].match(/\br="(\d+)"/)?.[1]) === rNum,
    )
    const ht = rowDef
      ? parseFloat(rowDef[0].match(/ht="([\d.]+)"/)?.[1] ?? '15')
      : 15
    rowHeightEMU += Math.round(ht * 12700)
  }
  // Image natural dimensions for aspect-ratio-locked height
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
  let drawingFile = null
  let drawingRelsFile = null

  if (hasSheetRels) {
    const sheetRelsXml = await zip.file(sheetRelsPath).async('string')
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
    // (strip of old cols 7-9 anchors already done once by stripSignatureAnchors())
    let drawingXml = await zip.file(drawingFile).async('string')

    // Add rels entry for the new image
    let imageRId = 'rId1'
    if (drawingRelsFile && zip.file(drawingRelsFile)) {
      let drawRelsXml = await zip.file(drawingRelsFile).async('string')
      const remainingNums = [...drawRelsXml.matchAll(/Id="rId(\d+)"/g)].map(
        (m) => parseInt(m[1]),
      )
      imageRId = `rId${remainingNums.length > 0 ? Math.max(...remainingNums) + 1 : 1}`
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
    let drawingRId
    if (hasSheetRels) {
      let sheetRelsXml = await zip.file(sheetRelsPath).async('string')
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

    // Inject <drawing r:id="..."/> into sheet XML if not already present
    let sheetXml = await zip.file(sheetPath).async('string')
    if (!sheetXml.includes('<drawing ') && !sheetXml.includes('<drawing\t')) {
      sheetXml = sheetXml.replace(
        '</worksheet>',
        `<drawing r:id="${drawingRId}"/>\n</worksheet>`,
      )
      zip.file(sheetPath, sheetXml)
    }

    // Register drawing in [Content_Types].xml
    let ct = await zip.file('[Content_Types].xml').async('string')
    if (!ct.includes('drawings/drawing1.xml')) {
      ct = ct.replace(
        '</Types>',
        `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>`,
      )
      zip.file('[Content_Types].xml', ct)
    }
  }

  // Register image MIME in [Content_Types].xml (once per extension)
  let ct = await zip.file('[Content_Types].xml').async('string')
  if (!ct.includes(`Extension="${imgExt}"`)) {
    ct = ct.replace(
      '</Types>',
      `<Default Extension="${imgExt}" ContentType="${mimeType}"/>\n</Types>`,
    )
    zip.file('[Content_Types].xml', ct)
  }
}

/**
 * Build a oneCellAnchor placing an image at a fixed 1.7 cm width × 1 cm height,
 * centered horizontally and vertically within the target cell area.
 * @param {number} col        0-based column index
 * @param {number} picId      unique picture id
 * @param {string} imageRId   relationship id for the image
 * @param {number} rowFrom    0-based top row index
 * @param {{width:number,height:number}} imgDims  natural image pixel dimensions
 * @param {number} colWidthEMU   column width in EMU
 * @param {number} rowHeightEMU  total row span height in EMU
 */
function buildAnchor(
  col,
  picId,
  imageRId,
  rowFrom,
  imgDims,
  colWidthEMU,
  rowHeightEMU,
) {
  // Fixed dimensions: width 1.7 cm, height 1 cm (1 cm = 360,000 EMU)
  const IMG_W = 612000 // 1.7 cm
  const IMG_H = 360000 // 1.0 cm
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

/**
 * Read pixel dimensions from a JPEG or PNG buffer without external libraries.
 */
function getImageDimensions(buffer, ext) {
  if (ext === 'png') {
    // PNG: width at bytes 16-19, height at 20-23 (big-endian)
    if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    }
  }
  // JPEG: scan for SOF marker (0xFFCx) which contains height and width
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
 * Find or create a cellXfs entry with all-thin borders + horizontal center +
 * vertical center (middle) alignment. Returns the 0-based xf index.
 */
async function getOrCreateNameCellStyle(zip) {
  const stylesPath = 'xl/styles.xml'
  let xml = await zip.file(stylesPath).async('string')

  // ── 1. Append a new border with all sides thin ────────────────────────────
  const existingBorderCount = [...xml.matchAll(/<border[\s\S]*?<\/border>/g)]
    .length
  const borderIdx = existingBorderCount
  const newBorderXml =
    `<border>` +
    `<left style="thin"><color rgb="FF000000"/></left>` +
    `<right style="thin"><color rgb="FF000000"/></right>` +
    `<top style="thin"><color rgb="FF000000"/></top>` +
    `<bottom style="thin"><color rgb="FF000000"/></bottom>` +
    `<diagonal/></border>`
  // Update or add count attribute on <borders> tag
  xml = xml.replace(/<borders(\b[^>]*)>/, (_m, attrs) => {
    const newCount = borderIdx + 1
    if (/count="\d+"/.test(attrs)) {
      return `<borders${attrs.replace(/count="\d+"/, `count="${newCount}"`)}>`
    }
    return `<borders count="${newCount}"${attrs}>`
  })
  xml = xml.replace('</borders>', `${newBorderXml}\n</borders>`)

  // ── 2. Append a new xf in cellXfs ────────────────────────────────────────
  const cellXfsBlock = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)
  const existingXfCount = cellXfsBlock
    ? [...cellXfsBlock[1].matchAll(/<xf\b/g)].length
    : 0
  const newXfIdx = existingXfCount

  // Inherit numFmtId / fontId / fillId / xfId from the first xf (index 0)
  let baseNumFmtId = '0',
    baseFontId = '0',
    baseFillId = '0',
    baseXfId = '0'
  if (cellXfsBlock) {
    const firstXf = cellXfsBlock[1].match(/<xf\b[^>]*/)
    if (firstXf) {
      baseNumFmtId = firstXf[0].match(/numFmtId="(\d+)"/)?.[1] ?? '0'
      baseFontId = firstXf[0].match(/fontId="(\d+)"/)?.[1] ?? '0'
      baseFillId = firstXf[0].match(/fillId="(\d+)"/)?.[1] ?? '0'
      baseXfId = firstXf[0].match(/xfId="(\d+)"/)?.[1] ?? '0'
    }
  }

  const newXfXml =
    `<xf numFmtId="${baseNumFmtId}" fontId="${baseFontId}" fillId="${baseFillId}"` +
    ` borderId="${borderIdx}" xfId="${baseXfId}"` +
    ` applyBorder="1" applyAlignment="1">` +
    `<alignment horizontal="center" vertical="center" wrapText="1"/></xf>`

  // Update or add count attribute on <cellXfs> tag
  xml = xml.replace(/<cellXfs(\b[^>]*)>/, (_m, attrs) => {
    const newCount = newXfIdx + 1
    if (/count="\d+"/.test(attrs)) {
      return `<cellXfs${attrs.replace(/count="\d+"/, `count="${newCount}"`)}>`
    }
    return `<cellXfs count="${newCount}"${attrs}>`
  })
  xml = xml.replace('</cellXfs>', `${newXfXml}\n</cellXfs>`)

  zip.file(stylesPath, xml)
  return newXfIdx
}

/**
 * Inject person names as inline-string cell values into Excel row 13.
 * Handles both existing and missing rows/cells.
 */
async function injectCellNames(zip, sheetPath, roles) {
  let sheetXml = await zip.file(sheetPath).async('string')
  const ROW_NUM = 13
  const escXml = (s) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  // Resolve a style index with all-thin borders + center/middle alignment
  const styleIdx = await getOrCreateNameCellStyle(zip)

  // Build cell XML fragments keyed by address
  const cellMap = {}
  for (const role of roles) {
    if (!role.personName) continue
    const addr = `${String.fromCharCode(65 + role.col)}${ROW_NUM}`
    cellMap[addr] =
      `<c r="${addr}" s="${styleIdx}" t="inlineStr"><is><r><rPr><sz val="9"/><rFont val="Arial"/></rPr><t>${escXml(role.personName)}</t></r></is></c>`
  }
  if (Object.keys(cellMap).length === 0) return

  // Does row 13 already exist in the sheet XML?
  const rowPat = new RegExp(
    `(<row\\b[^>]*\\br="${ROW_NUM}"[^>]*>)([\\s\\S]*?)(<\/row>)`,
  )
  const rowMatch = sheetXml.match(rowPat)
  if (rowMatch) {
    // Row exists — replace or append each cell
    let rowInner = rowMatch[2]
    for (const [addr, cellXml] of Object.entries(cellMap)) {
      const cellPat = new RegExp(
        `<c\\b[^>]*\\br="${addr}"[^>/]*(?:\/>|>[\\s\\S]*?<\/c>)`,
      )
      if (cellPat.test(rowInner)) {
        rowInner = rowInner.replace(cellPat, cellXml)
      } else {
        rowInner += cellXml
      }
    }
    sheetXml = sheetXml.replace(
      rowPat,
      `${rowMatch[1]}${rowInner}${rowMatch[3]}`,
    )
  } else {
    // Row 13 missing — insert a new row before </sheetData>
    const newRow = `<row r="${ROW_NUM}">${Object.values(cellMap).join('')}</row>`
    sheetXml = sheetXml.replace('</sheetData>', `${newRow}\n</sheetData>`)
  }

  zip.file(sheetPath, sheetXml)
}

/**
 * Compute the OOXML sheet-protection password hash (SHA-512, 100000 iterations).
 * Algorithm per ECMA-376:
 *   H0 = SHA512(salt + password-utf16le)
 *   Hi = SHA512(H(i-1) + i-as-uint32-LE), i = 0..spinCount-1
 */
function hashSheetPassword(password) {
  const { createHash, randomBytes } = require('crypto')
  const salt = randomBytes(16)
  const pwdBuf = Buffer.from(password, 'utf16le')
  let hash = createHash('sha512').update(salt).update(pwdBuf).digest()
  const spinCount = 100000
  for (let i = 0; i < spinCount; i++) {
    const iterBuf = Buffer.allocUnsafe(4)
    iterBuf.writeUInt32LE(i, 0)
    hash = createHash('sha512').update(hash).update(iterBuf).digest()
  }
  return {
    algorithmName: 'SHA-512',
    saltValue: salt.toString('base64'),
    hashValue: hash.toString('base64'),
    spinCount,
  }
}

/**
 * Inject <sheetProtection> with hashed password into sheet XML (in-place on zip).
 * Removes any existing sheetProtection first.
 * Position: immediately after </sheetData> per OOXML element ordering.
 */
async function injectSheetProtection(zip, sheetPath, password) {
  let xml = await zip.file(sheetPath).async('string')
  // Remove existing protection
  xml = xml.replace(/<sheetProtection\b[^>]*\/>/g, '')
  const h = hashSheetPassword(password)
  const protXml =
    `<sheetProtection algorithmName="${h.algorithmName}"` +
    ` hashValue="${h.hashValue}" saltValue="${h.saltValue}"` +
    ` spinCount="${h.spinCount}" sheet="1" objects="0" scenarios="0"/>`
  // Insert after </sheetData>, or <sheetData/>, or before </worksheet>
  if (xml.includes('</sheetData>')) {
    xml = xml.replace('</sheetData>', `</sheetData>\n  ${protXml}`)
  } else if (xml.includes('<sheetData/>')) {
    xml = xml.replace('<sheetData/>', `<sheetData/>\n  ${protXml}`)
  } else {
    xml = xml.replace('</worksheet>', `  ${protXml}\n</worksheet>`)
  }
  zip.file(sheetPath, xml)
}
