// 학평 PDF 쪽마다 macOS Vision OCR로 낱말과 위치(쪽 비율, 왼쪽 위 원점)를 뽑는다.
// 쓰기: swift ocr.swift <pdf> <out.json>
// 출력: {"pages":[[["낱말",x,y,w,h],...], ...]}
import Foundation
import PDFKit
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count == 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else { fputs("bad args\n", stderr); exit(2) }
let scale: CGFloat = 3.0
var pagesOut: [[[Any]]] = []
for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i) else { pagesOut.append([]); continue }
  let box = page.bounds(for: .mediaBox)
  let w = Int(box.width * scale), h = Int(box.height * scale)
  let cs = CGColorSpaceCreateDeviceRGB()
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { pagesOut.append([]); continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.scaleBy(x: scale, y: scale)
  ctx.translateBy(x: -box.origin.x, y: -box.origin.y)
  page.draw(with: .mediaBox, to: ctx)
  guard let image = ctx.makeImage() else { pagesOut.append([]); continue }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["ko-KR", "en-US"]
  request.usesLanguageCorrection = false
  try? VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
  var words: [[Any]] = []
  for obs in request.results ?? [] {
    guard let cand = obs.topCandidates(1).first else { continue }
    let s = cand.string
    var idx = s.startIndex
    while idx < s.endIndex {
      while idx < s.endIndex, s[idx].isWhitespace { idx = s.index(after: idx) }
      if idx >= s.endIndex { break }
      var end = idx
      while end < s.endIndex, !s[end].isWhitespace { end = s.index(after: end) }
      let range = idx..<end
      let r = (try? cand.boundingBox(for: range))?.boundingBox ?? obs.boundingBox
      let round4 = { (v: CGFloat) -> Double in (Double(v) * 10000).rounded() / 10000 }
      let x = max(0, r.minX), y = max(0, 1 - r.maxY)
      let ww = min(1 - x, r.width), hh = min(1 - y, r.height)
      if ww > 0, hh > 0 { words.append([String(s[range]), round4(x), round4(y), round4(ww), round4(hh)]) }
      idx = end
    }
  }
  pagesOut.append(words)
}
let data = try JSONSerialization.data(withJSONObject: ["pages": pagesOut], options: [])
try data.write(to: URL(fileURLWithPath: args[2]))
