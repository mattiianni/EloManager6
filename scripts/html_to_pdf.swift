import Foundation
import WebKit

class PDFGenerator: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    let inputURL: URL
    let outputURL: URL
    var keepAlive = true
    
    init(inputURL: URL, outputURL: URL) {
        let configuration = WKWebViewConfiguration()
        // Enable developer extras if needed
        configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")
        
        // Use a standard viewport size
        self.webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 1130), configuration: configuration)
        self.inputURL = inputURL
        self.outputURL = outputURL
        super.init()
        self.webView.navigationDelegate = self
    }
    
    func start() {
        webView.loadFileURL(inputURL, allowingReadAccessTo: inputURL.deletingLastPathComponent())
    }
    
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Wait 1 second for webview layout and fonts to settle
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.generatePDF()
        }
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("Failed to load URL: \(error)")
        self.keepAlive = false
    }
    
    func generatePDF() {
        let config = WKPDFConfiguration()
        // Generate PDF using WKWebView createPDF API
        webView.createPDF(configuration: config) { result in
            switch result {
            case .success(let data):
                do {
                    try data.write(to: self.outputURL)
                    print("PDF successfully generated at: \(self.outputURL.path)")
                } catch {
                    print("Error writing PDF data to file: \(error)")
                }
            case .failure(let error):
                print("Error creating PDF: \(error)")
            }
            self.keepAlive = false
        }
    }
}

let arguments = CommandLine.arguments
guard arguments.count >= 3 else {
    print("Usage: swift html_to_pdf.swift <input_html_path> <output_pdf_path>")
    exit(1)
}

let inputPath = arguments[1]
let outputPath = arguments[2]

let inputURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(inputPath)
let outputURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(outputPath)

let generator = PDFGenerator(inputURL: inputURL, outputURL: outputURL)
generator.start()

// Run loop to keep the command line tool alive until PDF generation is done
let runLoop = RunLoop.current
while generator.keepAlive && runLoop.run(mode: .default, before: Date.distantFuture) {
    // Running...
}
